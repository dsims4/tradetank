/** Displays account forms and handles signup, login, and logout. */
const express = require("express");
const {
    query,
    runTransaction
} = require("../services/db");
const { redirectWithQuery } = require("../utilities/redirects");
const {
    hashPassword,
    verifyPassword
} = require("../services/password");
const {
    clearSessionCookie,
    setSessionCookie,
    invalidateSession
} = require("../services/session");
const {
    getErrorMessage,
    getSuccessMessage
} = require("../utilities/messages");
const {
    redirectAuthenticated
} = require("../middleware/authentication");
const {
    getStringInput,
    isValidUsername,
    isValidEmail,
    isValidPassword
} = require("../utilities/validation");
const {
    loginIPRateLimit,
    accountIPRateLimit,
    signupIPRateLimit,
    clearAccountIPRateLimit
} = require("../middleware/rate-limits");

const router = express.Router();
const loginMiddleware = [loginIPRateLimit, accountIPRateLimit];

/*
 * This route displays Login with a recognized message and, when valid, the
 * username carried back from a previous attempt.
 */
router.get("/login", redirectAuthenticated, (req, res) => {
    const usernameInput = getStringInput(req.query.username).trim();
    const username = (isValidUsername(usernameInput))
        ? usernameInput
        : "";

    const error = getStringInput(req.query.error);
    const success = getStringInput(req.query.success);
    const errorMessage = getErrorMessage(error);
    const successMessage = getSuccessMessage(success);

    res.render("login.njk", {
        currentPage: "login",
        username,
        errorMessage,
        successMessage
    });
});

/*
 * This route displays Signup with a recognized error or success message.
 */
router.get("/signup", redirectAuthenticated, (req, res) => {
    const error = getStringInput(req.query.error);
    const success = getStringInput(req.query.success);
    const errorMessage = getErrorMessage(error);
    const successMessage = getSuccessMessage(success);

    res.render("signup.njk", {
        currentPage: "signup",
        errorMessage,
        successMessage
    });
});

/*
 * This route checks login credentials and creates a login session.
 *
 * Request limits run before password hashing because hashing intentionally uses
 * significant computer work. A successful login clears the failed-attempt count
 * for this IP address and account.
 */
router.post("/login", ...loginMiddleware, async (req, res, next) => {
    const username = getStringInput(req.body?.username).trim();
    const password = getStringInput(req.body?.password);
    const rememberMe = getStringInput(req.body?.remember) === "on";

    if (!username || !password) {
        return redirectWithQuery(res, "/login", {
            error: "missing-fields",
            username: isValidUsername(username) ? username : ""
        });
    }

    if (!isValidUsername(username) || !isValidPassword(password)) {
        return redirectWithQuery(res, "/login", {
            error: "invalid-credentials"
        });
    }

    try {
        const userResult = await query(
            `SELECT id, hashed_password
             FROM users
             WHERE username = $1
             LIMIT 1`,
            [username]
        );

        const user = userResult.rows[0];

        if (!user) {
            return redirectWithQuery(res, "/login", {
                error: "invalid-credentials",
                username
            });
        }

        const passwordIsValid = await verifyPassword(
            password,
            user.hashed_password
        );

        if (!passwordIsValid) {
            return redirectWithQuery(res, "/login", {
                error: "invalid-credentials",
                username
            });
        }

        await clearAccountIPRateLimit(req);
        await setSessionCookie(res, user.id, rememberMe);
        return res.redirect("/home");
    } catch (error) {
        return next(error);
    }
});

/*
 * This route creates an account, its default Tank-theme settings, and its empty
 * statistics row as one all-or-nothing database transaction.
 *
 * The earlier availability check is only convenient feedback. PostgreSQL's
 * unique rules make the final decision about duplicate usernames or emails.
 */
router.post("/signup", signupIPRateLimit, async (req, res, next) => {
    const username = getStringInput(req.body?.username).trim();
    const email = getStringInput(req.body?.email).trim().toLowerCase();
    const password = getStringInput(req.body?.password);
    const confirmPassword = getStringInput(req.body?.confirmPassword);

    let error = "";

    if (!username || !email || !password || !confirmPassword) {
        error = "missing-fields";
    } else if (!isValidUsername(username)) {
        error = "invalid-username";
    } else if (!isValidEmail(email)) {
        error = "invalid-email";
    } else if (!isValidPassword(password)) {
        error = "invalid-password";
    } else if (password !== confirmPassword) {
        error = "password-mismatch";
    }

    if (error) {
        return redirectWithQuery(res, "/signup", { error });
    }

    try {
        const existingUsers = await query(
            `SELECT
                username,
                email
             FROM
                users
             WHERE
                username = $1
            OR
                email = $2`,
            [username, email]
        );

        if (existingUsers.rows.some((user) => user.username === username)) {
            return redirectWithQuery(res, "/signup", {
                error: "username-taken"
            });
        }

        if (existingUsers.rows.some((user) => user.email === email)) {
            return redirectWithQuery(res, "/signup", {
                error: "email-taken"
            });
        }

        const hashedPassword = await hashPassword(password);

        try {
            const userID = await runTransaction(async (client) => {
                const userResult = await client.query(
                    `INSERT INTO
                        users
                        (username, email, hashed_password)
                     VALUES
                        ($1, $2, $3)
                     RETURNING
                        id`,
                    [username, email, hashedPassword]
                );
                const createdUserID = userResult.rows[0].id;

                await client.query(
                    `INSERT INTO
                        user_preferences
                        (user_id, color_scheme)
                     VALUES
                        ($1, $2)`,
                    [createdUserID, "tank"]
                );

                await client.query(
                    `INSERT INTO
                        user_stats
                        (user_id)
                     VALUES
                        ($1)`,
                    [createdUserID]
                );

                return createdUserID;
            });

            await setSessionCookie(res, userID, false);
            return res.redirect("/home");
        } catch (error) {
            const signupError = (
                error.code === "23505" &&
                error.constraint === "users_username_key"
            )
                ? "username-taken"
                : (
                    error.code === "23505" &&
                    error.constraint === "users_email_key"
                )
                ? "email-taken"
                : "";

            if (signupError) {
                return redirectWithQuery(res, "/signup", {
                    error: signupError
                });
            }

            return next(error);
        }
    } catch (error) {
        return next(error);
    }
});

/*
 * This route logs out the current session and deletes its browser cookie.
 * The cookie is still deleted if updating the database session unexpectedly fails.
 */
router.post("/logout", async (req, res, next) => {
    try {
        await invalidateSession(req);
        clearSessionCookie(res);
        return res.redirect("/login");
    } catch (error) {
        clearSessionCookie(res);
        return next(error);
    }
});

module.exports = router;
