/** Creates one-use password-reset links and safely changes forgotten passwords. */
const express = require("express");
const crypto = require("crypto");
const {
    query,
    runTransaction
} = require("../services/db");
const { redirectWithQuery } = require("../utilities/redirects");
const {
    getStringInput,
    isValidEmail,
    isValidPassword,
    isValidResetPasswordToken
} = require("../utilities/validation");
const { hashPassword } = require("../services/password");
const {
    sendPasswordChangedEmail,
    sendResetPasswordEmail
} = require("../services/email");
const { getErrorMessage } = require("../utilities/messages");
const { invalidateSessions } = require("../services/session");
const {
    forgotPasswordIPRateLimit,
    resetPasswordIPRateLimit
} = require("../middleware/rate-limits");

const router = express.Router();

const RESET_PASSWORD_TOKEN_DURATION = 1000 * 60 * 15;

/*
 * This function hashes a private password-reset token before a database lookup.
 * Only the hash is saved, so reading the database does not reveal usable reset links.
 *
 * Returns the SHA-256 hash written as hexadecimal characters. The same token
 * always creates the same hash so it can be looked up.
 */
function hashResetPasswordToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

/*
 * This function looks up one password-reset request using its token hash.
 *
 * When requested, PostgreSQL locks the row until the current transaction ends.
 * This prevents two requests arriving together from both using the same link.
 *
 * Returns the matching reset row.
 * Returns null when the token format is wrong or no saved hash matches it.
 */
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

/*
 * This function chooses a safe message for the current reset-link state.
 *
 * Returns an empty string when the link can still be used.
 * Otherwise, returns the correct missing, used, or expired-link message.
 */
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

/*
 * This function redirects back to Reset Password with the token and a safe error name.
 *
 * Returns the Express redirect response.
 */
function redirectToResetPassword(res, token, error = "") {
    const parameters = { token };

    if (error) parameters.error = error;

    return redirectWithQuery(res, "/reset-password", parameters);
}

/*
 * This function creates the complete Trade Tank password-reset address for an email.
 *
 * Returns the address as text. The private token is safely URL encoded after the
 * question mark.
 */
function getResetPasswordURL(token) {
    const resetPasswordURL = new URL(
        "/reset-password",
        process.env.APP_ORIGIN
    );

    resetPasswordURL.searchParams.set("token", token);

    return resetPasswordURL.toString();
}

/*
 * This route displays the form that accepts a password-reset email address.
 */
router.get("/forgot-password", (req, res) => {
    res.render("forgot-password.njk", {
        currentPage: "forgot-password"
    });
});

/*
 * This route displays the same neutral confirmation after every request, whether
 * or not an account uses the submitted address.
 */
router.get("/forgot-password-confirmation", (req, res) => {
    res.render("forgot-password-confirmation.njk", {
        currentPage: "forgot-password-confirmation"
    });
});

/*
 * This route displays new-password controls only while the reset link remains valid.
 */
router.get("/reset-password", async (req, res, next) => {
    const token = getStringInput(req.query.token).trim();
    const error = getStringInput(req.query.error);

    try {
        const resetPasswordEvent = await getResetPasswordEvent(token);
        const resetPasswordErrorMessage =
            getResetPasswordErrorMessage(resetPasswordEvent);
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

/*
 * This route creates and emails a reset link that expires after 15 minutes when
 * the submitted account exists.
 *
 * Every submission reaches the same confirmation page. An attacker therefore
 * cannot test a list of email addresses to discover which ones have accounts.
 */
router.post("/forgot-password", forgotPasswordIPRateLimit, async (req, res) => {
    const email = getStringInput(req.body?.email).trim().toLowerCase();

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

            const resetPasswordURL = getResetPasswordURL(
                resetPasswordToken
            );

            await sendResetPasswordEmail(email, resetPasswordURL);
        }
    } catch (error) {
        console.error("Password reset request failed:", error.message);
        // Return the same response so account existence is not exposed.
    }

    return res.redirect("/forgot-password-confirmation");
});

/*
 * This route changes the password, marks the reset link used, and logs the user
 * out everywhere as one all-or-nothing database operation.
 *
 * A PostgreSQL row lock ensures that two requests arriving together cannot both
 * use the same reset link.
 */
router.post("/reset-password", resetPasswordIPRateLimit, async (req, res, next) => {
    const token = getStringInput(req.body?.token).trim();
    const newPassword = getStringInput(req.body?.password);
    const confirmPassword = getStringInput(req.body?.confirmPassword);

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

    try {
        const email = await runTransaction(async (client) => {
            const resetPasswordEvent = await getResetPasswordEvent(
                token,
                client,
                { lockForUpdate: true }
            );
            const errorMessage =
                getResetPasswordErrorMessage(resetPasswordEvent);

            if (errorMessage) return null;

            const hashedPassword = await hashPassword(newPassword);

            const userResult = await client.query(
                `UPDATE
                    users
                 SET
                    hashed_password = $1,
                    update_time = NOW()
                 WHERE
                    id = $2
                 RETURNING
                    email`,
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
            return userResult.rows[0].email;
        });

        if (!email) return redirectToResetPassword(res, token);

        try {
            await sendPasswordChangedEmail(email);
        } catch (error) {
            console.error(
                "Password reset notification failed:",
                error.message
            );
        }
    } catch (error) {
        return next(error);
    }

    return redirectWithQuery(res, "/login", {
        success: "reset-success"
    });
});

module.exports = router;
