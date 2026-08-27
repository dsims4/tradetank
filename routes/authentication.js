const express = require("express");
const {
    getClient,
    query
} = require("../services/db");
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
        username: username,
        errorMessage: errorMessage,
        successMessage: successMessage
    });
});

router.get("/signup", redirectAuthenticated, (req, res) => {
    const error = getStringInput(req.query.error);
    const success = getStringInput(req.query.success);
    const errorMessage = getErrorMessage(error);
    const successMessage = getSuccessMessage(success);

    res.render("signup.njk", {
        currentPage: "signup",
        errorMessage: errorMessage,
        successMessage: successMessage
    });
});

router.post("/login", loginIPRateLimit, accountIPRateLimit, async (req, res, next) => {
    const username = getStringInput(req.body.username).trim();
    const password = getStringInput(req.body.password);
    const rememberMe = getStringInput(req.body.remember) === "on";

    if (!username || !password) {
        const searchParams = new URLSearchParams({
            error: "missing-fields",
            username: isValidUsername(username) ? username : ""
        });
        return res.redirect(`/login?${searchParams.toString()}`);
    }

    if (!isValidUsername(username) || !isValidPassword(password)) {
        const searchParams = new URLSearchParams({
            error: "invalid-credentials"
        });
        return res.redirect(`/login?${searchParams.toString()}`);
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
            const searchParams = new URLSearchParams({
                error: "invalid-credentials",
                username: username
            });
            return res.redirect(`/login?${searchParams.toString()}`);
        }

        const passwordIsValid = await verifyPassword(password, user.hashed_password);

        if (!passwordIsValid) {
            const searchParams = new URLSearchParams({
                error: "invalid-credentials",
                username: username
            });
            return res.redirect(`/login?${searchParams.toString()}`);
        }

        await clearAccountIPRateLimit(req);
        await setSessionCookie(res, user.id, rememberMe);
        return res.redirect("/home");
    } catch (error) {
        return next(error);
    }
});

router.post("/signup", signupIPRateLimit, async (req, res, next) => {
    const username = getStringInput(req.body.username).trim();
    const email = getStringInput(req.body.email).trim().toLowerCase();
    const password = getStringInput(req.body.password);
    const confirmPassword = getStringInput(req.body.confirmPassword);

    const error = (!username || !email || !password || !confirmPassword)
        ? "missing-fields"
        : (!isValidUsername(username))
        ? "invalid-username"
        : (!isValidEmail(email))
        ? "invalid-email"
        : (!isValidPassword(password))
        ? "invalid-password"
        : (password !== confirmPassword)
        ? "password-mismatch"
        : "";

    if (error) {
        const searchParams = new URLSearchParams({
            error: error,
        });
        return res.redirect(`/signup?${searchParams.toString()}`);
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
            const searchParams = new URLSearchParams({
                error: "username-taken"
            });
            return res.redirect(`/signup?${searchParams.toString()}`);
        }

        if (existingUsers.rows.some((user) => user.email === email)) {
            const searchParams = new URLSearchParams({
                error: "email-taken"
            });
            return res.redirect(`/signup?${searchParams.toString()}`);
        }

        const hashedPassword = await hashPassword(password);

        const client = await getClient();
        let userID;

        try {
            await client.query("BEGIN");

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

            userID = userResult?.rows[0]?.id;

            await client.query(
                `INSERT INTO 
                    user_preferences 
                    (user_id)
                VALUES
                    ($1)
                `,
                [userID]
            );

            await client.query(
                `INSERT INTO
                    user_stats
                    (user_id)
                VALUES
                    ($1)`,
                [userID]
            );

            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");

            const signupError = (
                error.code === "23505" &&
                error.constraint === "users_username_key"
            )   ? "username-taken"
                : (
                    error.code === "23505" &&
                    error.constraint === "users_email_key"
                )
                ? "email-taken"
                : "";

            if (signupError) {
                const searchParams = new URLSearchParams({
                    error: signupError
                });
                return res.redirect(`/signup?${searchParams.toString()}`);
            }

            return next(error);
        } finally {
            client.release();
        }

        await setSessionCookie(res, userID, false);
        return res.redirect("/home");
    } catch (error) {
        return next(error);
    }
});

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
