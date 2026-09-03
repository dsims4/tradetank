const express = require("express");
const crypto = require("crypto");
const {
    getClient,
    query
} = require("../services/db");
const {
    getStringInput,
    isValidEmail,
    isValidPassword,
    isValidResetPasswordToken
} = require("../utilities/validation");
const { hashPassword } = require("../services/password");
const { getErrorMessage } = require("../utilities/messages");
const { invalidateSessions } = require("../services/session");
const {
    forgotPasswordIPRateLimit,
    resetPasswordIPRateLimit
} = require("../middleware/rate-limits");

const router = express.Router();

const RESET_PASSWORD_TOKEN_DURATION = 1000 * 60 * 15;

function hashResetPasswordToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

async function getResetPasswordEvent(token, db = { query }, options = {}) {
    if (!isValidResetPasswordToken(token)) {
        return null;
    }

    const hashedResetPasswordToken = hashResetPasswordToken(token);
    const lockClause = options.lockForUpdate ? "FOR UPDATE" : "";
    const result = await db.query(
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

    return result.rows[0] || null;
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

function redirectToResetPassword(res, token, error = "") {
    const searchParams = new URLSearchParams({ token });

    if (error) searchParams.set("error", error);

    return res.redirect(`/reset-password?${searchParams.toString()}`);
}

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
    const token = getStringInput(req.query.token).trim();
    const error = getStringInput(req.query.error);

    try {
        const resetPasswordEvent = await getResetPasswordEvent(token);
        const resetPasswordErrorMessage = getResetPasswordErrorMessage(resetPasswordEvent);
        const linkIsValid = !resetPasswordErrorMessage;
        const errorMessage = linkIsValid
            ? getErrorMessage(error)
            : resetPasswordErrorMessage;

        return res.render("reset-password.njk", {
            currentPage: "reset-password",
            token,
            errorMessage,
            linkIsValid
        });
    } catch (error) {
        return next(error);
    }
});

router.post("/forgot-password", forgotPasswordIPRateLimit, async (req, res) => {
    const email = getStringInput(req.body.email).trim().toLowerCase();

    if (!email || !isValidEmail(email)) {
        return res.redirect("/forgot-password");
    }

    try {
        const userResult = await query(
            `SELECT
                id
             FROM
                users
             WHERE
                email = $1
             LIMIT 1`,
            [email]
        );
        const user = userResult.rows[0];

        if (user) {
            const resetPasswordToken = crypto.randomBytes(32).toString("hex");
            const hashedResetPasswordToken =
                hashResetPasswordToken(resetPasswordToken);
            const expirationTime = new Date(
                Date.now() + RESET_PASSWORD_TOKEN_DURATION
            ).toISOString();

            await query(
                `INSERT INTO
                    reset_password_events
                    (user_id, hashed_token, expiration_time)
                 VALUES
                    ($1, $2, $3)`,
                [user.id, hashedResetPasswordToken, expirationTime]
            );

            if (process.env.NODE_ENV !== "production") {
                const resetPasswordURL =
                    `${req.protocol}://${req.get("host")}` +
                    `/reset-password?token=${resetPasswordToken}`;

                console.log(`Password reset URL: ${resetPasswordURL}`);
            }
        }
    } catch {
        // Return the same response so account existence is not exposed.
    }

    return res.redirect("/forgot-password-confirmation");
});

router.post("/reset-password", resetPasswordIPRateLimit, async (req, res, next) => {
    const token = getStringInput(req.body.token).trim();
    const newPassword = getStringInput(req.body.password);
    const confirmPassword = getStringInput(req.body.confirmPassword);

    if (!isValidResetPasswordToken(token)) {
        return res.redirect("/reset-password");
    }

    if (!newPassword || !confirmPassword) {
        return redirectToResetPassword(
            res,
            token,
            "missing-fields"
        );
    }

    if (!isValidPassword(newPassword)) {
        return redirectToResetPassword(
            res,
            token,
            "invalid-password"
        );
    }

    if (newPassword !== confirmPassword) {
        return redirectToResetPassword(
            res,
            token,
            "password-mismatch"
        );
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
            return redirectToResetPassword(res, token);
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

module.exports = router;
