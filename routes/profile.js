/** Displays Profile and handles changes to a logged-in account. */
const express = require("express");
const {
    query,
    runTransaction
} = require("../services/db");
const {
    clearSessionCookie,
    invalidateOtherSessions
} = require("../services/session");
const { redirectWithQuery } = require("../utilities/redirects");
const {
    redirectUnauthenticated
} = require("../middleware/authentication");
const {
    hashPassword
} = require("../services/password");
const {
    sendEmailChangeNotifications,
    sendPasswordChangedEmail
} = require("../services/email");
const {
    getErrorMessage,
    getSuccessMessage
} = require("../utilities/messages");
const {
    getStringInput,
    isValidEmail,
    isValidPassword
} = require("../utilities/validation");
const {
    changeEmailUserRateLimit,
    changePasswordUserRateLimit
} = require("../middleware/rate-limits");

const router = express.Router();
const emailChangeMiddleware = [
    redirectUnauthenticated,
    changeEmailUserRateLimit
];
const passwordChangeMiddleware = [
    redirectUnauthenticated,
    changePasswordUserRateLimit
];

/*
 * This route loads and displays the logged-in user's settings and messages.
 *
 * If a session exists but its account no longer does, the unusable session cookie
 * is deleted and the visitor is returned to Login.
 */
router.get("/profile", redirectUnauthenticated, async (req, res, next) => {
    try {
        const emailError = getStringInput(req.query.emailError);
        const passwordError = getStringInput(req.query.passwordError);
        const colorSchemeError = getStringInput(req.query.colorSchemeError);
        const deleteError = getStringInput(req.query.deleteError);
        const emailSuccess = getStringInput(req.query.emailSuccess);
        const passwordSuccess = getStringInput(req.query.passwordSuccess);

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
            [req.authenticatedUserID]
        );

        const user = userResult.rows[0];

        if (!user) {
            clearSessionCookie(res);
            return res.redirect("/login");
        }

        return res.render("profile.njk", {
            currentPage: "profile",
            colorScheme: user.color_scheme || "tank",
            profile: {
                username: user.username,
                email: user.email,
                creationTimeLabel: new Intl.DateTimeFormat("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric"
                }).format(new Date(user.creation_time)),
                colorScheme: user.color_scheme || "tank"
            },
            emailErrorMessage,
            passwordErrorMessage,
            colorSchemeErrorMessage,
            deleteErrorMessage,
            emailSuccessMessage,
            passwordSuccessMessage
        });
    } catch (error) {
        return next(error);
    }
});

/*
 * This route checks and saves one supported color theme.
 * It updates the preference row or creates it for an older account that lacks one.
 */
router.post(
    "/profile/color-scheme",
    redirectUnauthenticated,
    async (req, res, next) => {
        const colorScheme = getStringInput(
            req.body?.changeColorScheme
        ).trim().toLowerCase();

        if (!["light", "dark", "tank"].includes(colorScheme)) {
            return redirectWithQuery(res, "/profile", {
                colorSchemeError: "invalid-color-scheme"
            });
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
                [req.authenticatedUserID, colorScheme]
            );

            return res.redirect("/profile");
        } catch (error) {
            return next(error);
        }
    }
);

/*
 * This route changes an account email and records when the change happened as
 * one all-or-nothing database operation.
 *
 * Notification emails are sent only after the database change is permanent. An
 * email-delivery failure is reported, but it cannot undo the completed change.
 */
router.post("/profile/change-email", ...emailChangeMiddleware, async (req, res, next) => {
    const userID = req.authenticatedUserID;

    const email = getStringInput(req.body?.email).trim().toLowerCase();
    const confirmEmail =
        getStringInput(req.body?.confirmEmail).trim().toLowerCase();

    if (!email || !confirmEmail) {
        return redirectWithQuery(res, "/profile", {
            emailError: "email-missing-fields"
        });
    }

    if (!isValidEmail(email)) {
        return redirectWithQuery(res, "/profile", {
            emailError: "invalid-email"
        });
    }

    if (email !== confirmEmail) {
        return redirectWithQuery(res, "/profile", {
            emailError: "email-mismatch"
        });
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
            return redirectWithQuery(res, "/profile", {
                emailError: "email-same"
            });
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
            return redirectWithQuery(res, "/profile", {
                emailError: "email-taken"
            });
        }

        await runTransaction(async (client) => {
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
        });

        try {
            await sendEmailChangeNotifications(user.email, email);
        } catch (error) {
            console.error(
                "Email change notification failed:",
                error.message
            );
        }

        return redirectWithQuery(res, "/profile", {
            emailSuccess: "email-updated"
        });
    } catch (error) {
        return next(error);
    }
});

/*
 * This route safely hashes and saves a new password. It also disables unused
 * reset links and logs the user out of other browsers and devices.
 *
 * The current browser stays logged in. A notification-email failure cannot undo
 * the password change after the database has saved it.
 */
router.post("/profile/change-password", ...passwordChangeMiddleware, async (req, res, next) => {
    const userID = req.authenticatedUserID;
    const newPassword = getStringInput(req.body?.newPassword);
    const confirmPassword = getStringInput(req.body?.confirmPassword);

    if (!newPassword || !confirmPassword) {
        return redirectWithQuery(res, "/profile", {
            passwordError: "password-missing-fields"
        });
    }

    if (!isValidPassword(newPassword)) {
        return redirectWithQuery(res, "/profile", {
            passwordError: "invalid-password"
        });
    }

    if (newPassword !== confirmPassword) {
        return redirectWithQuery(res, "/profile", {
            passwordError: "password-mismatch"
        });
    }

    try {
        const hashedPassword = await hashPassword(newPassword);
        const email = await runTransaction(async (client) => {
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
            return userResult.rows[0].email;
        });

        try {
            await sendPasswordChangedEmail(email);
        } catch (error) {
            console.error(
                "Password change notification failed:",
                error.message
            );
        }
    } catch (error) {
        return next(error);
    }

    return redirectWithQuery(res, "/profile", {
        passwordSuccess: "password-updated"
    });
});

/*
 * This route permanently deletes an account only after the user enters DELETE
 * exactly and confirms the final popup.
 *
 * PostgreSQL relationships automatically delete every row owned by that account
 * inside the same all-or-nothing operation.
 */
router.post(
    "/profile/delete-account",
    redirectUnauthenticated,
    async (req, res, next) => {
        const confirmation = getStringInput(req.body?.deleteConfirmation);

        if (confirmation !== "DELETE") {
            return redirectWithQuery(res, "/profile", {
                deleteError: "invalid-confirmation"
            });
        }

        try {
            await runTransaction((client) =>
                client.query(
                    `DELETE FROM
                        users
                     WHERE
                        id = $1`,
                    [req.authenticatedUserID]
                )
            );

            clearSessionCookie(res);
            return redirectWithQuery(res, "/signup", {
                success: "account-deleted"
            });
        } catch (error) {
            return next(error);
        }
    }
);

module.exports = router;
