const express = require("express");
const router = express.Router();

const {
    getClient,
    query
} = require("../services/db");

const {
    getSessionUserID,
    clearSessionCookie,
    invalidateOtherSessions
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

router.get("/profile", redirectUnauthenticated, async (req, res, next) => {
    const userID = await getSessionUserID(req);

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

router.post("/profile/color-scheme", redirectUnauthenticated, async (req, res, next) => {
    const userID = await getSessionUserID(req);

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
    const userID = await getSessionUserID(req);

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
    const userID = await getSessionUserID(req);
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

        await client.query(
            `UPDATE
                reset_password_events
             SET
                invalidated_time = NOW()
             WHERE
                user_id = $1
             AND
                reset_time IS NULL
             AND
                invalidated_time IS NULL`,
            [userID]
        );

        await invalidateOtherSessions(req, userID, client);

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

    const userID = await getSessionUserID(req);
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

module.exports = router;
