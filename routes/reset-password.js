const express = require("express");
const crypto = require("crypto");
const {
    getClient,
    query
} = require("../services/db");
const { hashPassword } = require("../services/password");
const { getErrorMessage } = require("../utilities/messages");
const { invalidateSessions } = require("../services/session");

const router = express.Router();

const RESET_PASSWORD_TOKEN_DURATION = 1000 * 60 * 15;

router.get("/forgot-password", (req, res) => {
    res.render("forgot-password.njk", {
        currentPage: "forgot-password"
    });
});

router.get("/forgot-password-confirmation", (req, res) => {
    res.render("forgot-password-confirmation.njk", {
        currentPage: "forgot-password-confirmation"
    });
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
            const resetPasswordToken = crypto.randomBytes(32).toString("hex");
            const hashedResetPasswordToken = hashResetPasswordToken(resetPasswordToken);
            const expirationTime = new Date(Date.now() + RESET_PASSWORD_TOKEN_DURATION).toISOString();
            const resetPasswordURL = `${req.protocol}://${req.get("host")}/reset-password?token=${resetPasswordToken}`;

            await query(
                `INSERT INTO 
                    reset_password_events
                    (user_id, hashed_token, expiration_time)
                 VALUES 
                    ($1, $2, $3)`,
                [user.id, hashedResetPasswordToken, expirationTime]
            );

            if (process.env.NODE_ENV !== "production") {
                console.log(`Password reset URL: ${resetPasswordURL}`);
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
                reset_password_events
             SET 
                reset_time = NOW()
             WHERE 
                id = $1
             AND
                reset_time IS NULL`,
            [resetPasswordEvent.id]
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
            [resetPasswordEvent.user_id]
        );

        await invalidateSessions(resetPasswordEvent.user_id, client);

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

    const hashedResetPasswordToken = hashResetPasswordToken(token);
    const lockClause = options.lockForUpdate ? "FOR UPDATE" : "";
    const resetPasswordEventResult = await db.query(
        `SELECT
            id,
            user_id,
            expiration_time,
            reset_time,
            invalidated_time
         FROM
            reset_password_events
         WHERE
            hashed_token = $1
         LIMIT 1
            ${lockClause}`,
        [hashedResetPasswordToken]
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

    if (resetPasswordEvent.invalidated_time) {
        return "This password reset link has been invalidated.";
    }

    if (new Date(resetPasswordEvent.expiration_time).getTime() <= Date.now()) {
        return "This password reset link has been used or expired.";
    }

    return "";
}

function hashResetPasswordToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = router;
