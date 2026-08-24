const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const {
    getClient,
    query
} = require("../services/db");

const {
    getSessionUserID,
    setSessionCookie,
    clearSessionCookie
} = require("../services/session");

const {
    redirectUnauthenticated
} = require("../middleware/authentication");

const {
    hashPassword
} = require("../services/password");

const {
    getErrorMessage,
    getSuccessMessage
} = require("../utilities/messages");

const RESET_TOKEN_DURATION = 1000 * 60 * 15;

router.get("/profile", redirectUnauthenticated, async (req, res, next) => {
    const userID = getSessionUserID(req);

    try {
        const emailError = String(req.query.emailError || "");
        const passwordError = String(req.query.passwordError || "");
        const colorSchemeError = String(req.query.colorSchemeError || "");
        const deleteError = String(req.query.deleteError || "");
        const emailSuccess = String(req.query.emailSuccess || "");
        const passwordSuccess = String(req.query.passwordSuccess || "");

        const emailErrorMessage = getErrorMessage(emailError);
        const passwordErrorMessage = getErrorMessage(passwordError);
        const colorSchemeErrorMessage = getErrorMessage(colorSchemeError);
        const deleteErrorMessage = getErrorMessage(deleteError);
        const emailSuccessMessage = getSuccessMessage(emailSuccess);
        const passwordSuccessMessage = getSuccessMessage(passwordSuccess);

        const userResult = await query(
            `SELECT
                users.username,
                users.email,
                users.creation_time,
                user_preferences.color_scheme
             FROM 
                users
             LEFT JOIN 
                user_preferences
             ON 
                user_preferences.user_id = users.id
             WHERE 
                users.id = $1
             LIMIT 1`,
            [userID]
        );

        const user = userResult.rows[0];

        if (!user) {
            clearSessionCookie(res);
            return res.redirect("/login");
        }

        return res.render("profile.njk", {
            currentPage: "profile",
            colorScheme: user.color_scheme || "light",
            profile: {
                username: user.username,
                email: user.email,
                creationTimeLabel: new Intl.DateTimeFormat("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric"
                }).format(new Date(user.creation_time)),
                colorScheme: user.color_scheme || "light"
            },
            emailErrorMessage: emailErrorMessage,
            passwordErrorMessage: passwordErrorMessage,
            colorSchemeErrorMessage: colorSchemeErrorMessage,
            deleteErrorMessage: deleteErrorMessage,
            emailSuccessMessage: emailSuccessMessage,
            passwordSuccessMessage: passwordSuccessMessage
        });
    } catch (error) {
        return next(error);
    }
});

router.get("/reset-password", async (req, res, next) => {
    const token = String(req.query.token || "").trim();
    let errorMessage = String(req.query.errorMessage || "");
    const linkIsValid = req.query.linkIsValid === "true";

    if (errorMessage) {
        return res.render("reset-password.njk", {
            currentPage: "reset-password",
            token: token,
            errorMessage: errorMessage,
            linkIsValid: linkIsValid
        });
    }

    try {
        const resetPasswordEvent = await getResetPasswordEvent(token);
        errorMessage = getResetPasswordErrorMessage(resetPasswordEvent);

        return res.render("reset-password.njk", {
            currentPage: "reset-password",
            token: token,
            errorMessage: errorMessage,
            linkIsValid: !errorMessage
        });
    } catch (error) {
        return next(error);
    }
});

router.post("/profile/color-scheme", redirectUnauthenticated, async (req, res, next) => {
    const userID = getSessionUserID(req);

    const colorScheme = String(req.body.changeColorScheme || "").trim().toLowerCase();

    if (!["light", "dark"].includes(colorScheme)) {
        const searchParams = new URLSearchParams({
            colorSchemeError: "invalid-color-scheme"
        });
        return res.redirect(`/profile?${searchParams.toString()}`);
    }

    try {
        await query(
            `INSERT INTO 
                user_preferences 
                (user_id, color_scheme, update_time)
             VALUES 
                ($1, $2, NOW())
             ON CONFLICT 
                (user_id)
             DO UPDATE SET
                 color_scheme = EXCLUDED.color_scheme,
                 update_time = NOW()`,
            [userID, colorScheme]
        );

        return res.redirect("/profile");
    } catch (error) {
        return next(error);
    }
});

router.post("/profile/change-email", redirectUnauthenticated, async (req, res, next) => {
    const userID = getSessionUserID(req);

    const email = String(req.body.email || "").trim().toLowerCase();
    const confirmEmail = String(req.body.confirmEmail || "").trim().toLowerCase();

    if (!email || !confirmEmail) {
        const searchParams = new URLSearchParams({
            emailError: "email-missing-fields"
        });
        return res.redirect(`/profile?${searchParams.toString()}`);
    }

    if (email !== confirmEmail) {
        const searchParams = new URLSearchParams({
            emailError: "email-mismatch"
        });
        return res.redirect(`/profile?${searchParams.toString()}`);
    }

    try {
        const userResult = await query(
            `SELECT 
                email
             FROM 
                users
             WHERE 
                id = $1
             LIMIT 1`,
            [userID]
        );

        const user = userResult.rows[0];

        if (!user) {
            clearSessionCookie(res);
            return res.redirect("/login");
        }

        if (user.email === email) {
            const searchParams = new URLSearchParams({
                emailError: "email-same"
            });
            return res.redirect(`/profile?${searchParams.toString()}`);
        }

        const existingUserResult = await query(
            `SELECT 
                id
             FROM 
                users
             WHERE 
                email = $1 
             AND 
                id <> $2
             LIMIT 1`,
            [email, userID]
        );

        if (existingUserResult.rows[0]) {
            const searchParams = new URLSearchParams({
                emailError: "email-taken"
            });
            return res.redirect(`/profile?${searchParams.toString()}`);
        }

        const client = await getClient();

        try {
           await client.query("BEGIN");

            await client.query(
                `UPDATE 
                    users
                 SET 
                    email = $1,
                    update_time = NOW()
                 WHERE 
                    id = $2`,
                [email, userID]
            );

            await client.query(
                `INSERT INTO 
                    email_change_events 
                 (
                    user_id,
                    old_email,
                    new_email,
                    change_time
                 )
                 VALUES ($1, $2, $3, NOW())`,
                [userID, user.email, email]
            );

            await client.query("COMMIT");

            const searchParams = new URLSearchParams({
                emailSuccess: "email-updated"
            });
            return res.redirect(`/profile?${searchParams.toString()}`);
        } catch (error) {
            await client.query("ROLLBACK");
            return next(error);
        } finally {
            client.release();
        }
    } catch (error) {
        return next(error);
    }
});

router.post("/profile/change-password", redirectUnauthenticated, async (req, res, next) => {
    const userID = getSessionUserID(req);
    const newPassword = String(req.body.newPassword || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    if (!newPassword || !confirmPassword) {
        const searchParams = new URLSearchParams({
            passwordError: "password-missing-fields"
        });
        return res.redirect(`/profile?${searchParams.toString()}`);
    }

    if (newPassword !== confirmPassword) {
        const searchParams = new URLSearchParams({
            passwordError: "password-mismatch"
        });
        return res.redirect(`/profile?${searchParams.toString()}`);
    }

    const hashedPassword = await hashPassword(newPassword);

    const client = await getClient();

    try {
        await client.query("BEGIN");

        await client.query(
            `UPDATE
                users
             SET
                hashed_password = $1,
                update_time = NOW()
             WHERE
                id = $2`,
            [hashedPassword, userID]
        );

        await client.query(
            `INSERT INTO
                password_change_events
                (user_id, change_time)
             VALUES
                ($1, NOW())`,
            [userID]
        );

        await client.query("COMMIT");

        const searchParams = new URLSearchParams({
            passwordSuccess: "password-updated"
        });
        return res.redirect(`/profile?${searchParams.toString()}`);
    } catch (error) {
        await client.query("ROLLBACK");
        return next(error);
    } finally {
        client.release();
    }
});

router.post("/profile/delete-account", redirectUnauthenticated, async (req, res, next) => {
    const confirmation = String(req.body.deleteConfirmation || "");

    if (confirmation !== "DELETE") {
        const searchParams = new URLSearchParams({
            deleteError: "invalid-confirmation"
        });
        return res.redirect(`/profile?${searchParams.toString()}`);
    }

    const userID = getSessionUserID(req);
    const client = await getClient();

    try {
        await client.query("BEGIN");

        await client.query(
            `DELETE FROM 
                users
             WHERE
                id = $1`,
            [userID]
        );

        await client.query("COMMIT");
        clearSessionCookie(res);
        const searchParams = new URLSearchParams({
            success: "account-deleted"
        });
        return res.redirect(`/signup?${searchParams.toString()}`);
    } catch (error) {
        await client.query("ROLLBACK");
        return next(error);
    } finally {
        client.release();
    }
});


router.post("/forgot-password", (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();

    if (!email) {
        return res.redirect("/forgot-password");
    }

    query(
        `SELECT 
            id
         FROM 
            users
         WHERE 
            email = $1
         LIMIT 1`,
        [email]
    ).then(async (userResult) => {
        const user = userResult.rows[0];

        if (user) {
            const resetToken = crypto.randomBytes(32).toString("hex");
            const hashedResetToken = hashResetToken(resetToken);
            const expirationTime = new Date(Date.now() + RESET_TOKEN_DURATION).toISOString();
            const resetURL = `${req.protocol}://${req.get("host")}/reset-password?token=${resetToken}`;

            await query(
                `INSERT INTO 
                    password_reset_events 
                    (user_id, hashed_token, expiration_time)
                 VALUES 
                    ($1, $2, $3)`,
                [user.id, hashedResetToken, expirationTime]
            );

            if (process.env.NODE_ENV !== "production") {
                console.log(`Password reset URL: ${resetURL}`);
            }
        }

        return res.redirect("/forgot-password-confirmation");
    })
        .catch((error) => {
            res.redirect("/forgot-password-confirmation");
        });
});

router.post("/reset-password", async (req, res, next) => {
    const token = String(req.body.token || "").trim();
    const newPassword = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    if (!token) {
        const errorMessage = getErrorMessage("invalid-token");
        const searchParams = new URLSearchParams({
            token: token,
            errorMessage: errorMessage,
            linkIsValid: "false"
        });
        return res.redirect(`/reset-password?${searchParams.toString()}`);
    }

    if (!newPassword || !confirmPassword) {
        const errorMessage = getErrorMessage("missing-fields");
        const searchParams = new URLSearchParams({
            token: token,
            errorMessage: errorMessage,
            linkIsValid: "true"
        });
        return res.redirect(`/reset-password?${searchParams.toString()}`);
    }

    if (newPassword !== confirmPassword) {
        const errorMessage = getErrorMessage("password-mismatch");
        const searchParams = new URLSearchParams({
            token: token,
            errorMessage: errorMessage,
            linkIsValid: "true"
        });
        return res.redirect(`/reset-password?${searchParams.toString()}`);
    }

    const client = await getClient();

    try {
        await client.query("BEGIN");

        const resetPasswordEvent = await getResetPasswordEvent(token, client, {
            lockForUpdate: true
        });
        const errorMessage = getResetPasswordErrorMessage(resetPasswordEvent);

        if (errorMessage) {
            await client.query("ROLLBACK");
            const searchParams = new URLSearchParams({
                token: token,
                errorMessage: errorMessage,
                linkIsValid: "false"
            });
            return res.redirect(`/reset-password?${searchParams.toString()}`);
        }

        const hashedPassword = await hashPassword(newPassword);

        await client.query(
            `UPDATE 
                users
             SET 
                hashed_password = $1,
                 update_time = NOW()
             WHERE 
                id = $2`,
            [hashedPassword, resetPasswordEvent.user_id]
        );

        await client.query(
            `UPDATE 
                password_reset_events
             SET 
                reset_time = NOW()
             WHERE 
                id = $1`,
            [resetPasswordEvent.id]
        );

        await client.query("COMMIT");

        const searchParams = new URLSearchParams({
            success: "reset-success"
        });
        return res.redirect(`/login?${searchParams.toString()}`);
    } catch (error) {
        await client.query("ROLLBACK");
        return next(error);
    } finally {
        client.release();
    }
});

async function getResetPasswordEvent(token, db = { query }, options = {}) {
    if (!token) {
        return null;
    }

    const hashedResetToken = hashResetToken(token);
    const lockClause = options.lockForUpdate ? "FOR UPDATE" : "";
    const resetPasswordEventResult = await db.query(
        `SELECT
            id, user_id,
            expiration_time,
            reset_time
         FROM
            password_reset_events
         WHERE
            hashed_token = $1
         LIMIT 1
            ${lockClause}`,
        [hashedResetToken]
    );

    return resetPasswordEventResult.rows[0] || null;
}

function getResetPasswordErrorMessage(resetPasswordEvent) {
    if (!resetPasswordEvent) {
        return "This password reset link is invalid.";
    }

    if (resetPasswordEvent.reset_time) {
        return "This password reset link has been used or expired.";
    }

    if (new Date(resetPasswordEvent.expiration_time).getTime() <= Date.now()) {
        return "This password reset link has been used or expired.";
    }

    return "";
}

function hashResetToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = router;
