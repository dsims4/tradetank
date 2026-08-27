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
    loginIPRateLimit
} = require("../middleware/rate-limits");

const router = express.Router();

const LOGIN_RATE_LIMIT_WINDOW = 1000 * 60 * 15;
const LOGIN_RATE_LIMIT_FAILURES = 7;
const LOGIN_RATE_LIMIT_TIMEOUT = 1000 * 60 * 15;

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

router.post("/login", loginIPRateLimit, async (req, res, next) => {
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
        const loginRateLimit = await getLoginRateLimit(username);
        const loginRateLimitExpirationTime = loginRateLimit?.expiration_time
            ? new Date(loginRateLimit.expiration_time).getTime()
            : null;

        if (loginRateLimitExpirationTime && loginRateLimitExpirationTime > Date.now()) {
            const searchParams = new URLSearchParams({
                username: username,
                error: "login-rate-limit"
            });
            return res.redirect(`/login?${searchParams.toString()}`);
        }

        const userResult = await query(
            `SELECT id, hashed_password
             FROM users
             WHERE username = $1
             LIMIT 1`,
            [username]
        );

        const user = userResult.rows[0];

        if (!user) {
            await recordFailedLoginAttempt(username, req.ip);
            const searchParams = new URLSearchParams({
                error: "invalid-credentials",
                username: username
            });
            return res.redirect(`/login?${searchParams.toString()}`);
        }

        const passwordIsValid = await verifyPassword(password, user.hashed_password);

        if (!passwordIsValid) {
            await recordFailedLoginAttempt(username, req.ip);
            const searchParams = new URLSearchParams({
                error: "invalid-credentials",
                username: username
            });
            return res.redirect(`/login?${searchParams.toString()}`);
        }

        await clearLoginRateLimit(username);
        await setSessionCookie(res, user.id, rememberMe);
        return res.redirect("/home");
    } catch (error) {
        return next(error);
    }
});

router.post("/signup", async (req, res, next) => {
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

async function getLoginRateLimit(username) {
    const loginRateLimitResult = await query(
        `SELECT
            id,
            attempt_count,
            start_time,
            expiration_time
         FROM
            login_rate_limits
         WHERE
            username = $1
         LIMIT 1`,
        [username]
    );
    return loginRateLimitResult.rows[0] || null;
}

async function recordFailedLoginAttempt(username, ipAddress) {
    const existingLoginRateLimit = await getLoginRateLimit(username);
    const currentTime = Date.now();

    if (!existingLoginRateLimit) {
        await query(
            `INSERT INTO
                login_rate_limits
                (
                username,
                ip_address,
                attempt_count,
                start_time,
                update_time
                )
             VALUES
                (
                $1, $2, 1, NOW(), NOW()
                )`,
            [username, ipAddress || null]
        );
        return;
    }

    const startTime = new Date(existingLoginRateLimit.start_time).getTime();
    const windowHasExpired = !Number.isFinite(startTime)
        || (currentTime - startTime) > LOGIN_RATE_LIMIT_WINDOW;
    const newFailedAttempts = windowHasExpired
        ? 1
        : Number(existingLoginRateLimit.attempt_count || 0) + 1;
    const shouldBlock = newFailedAttempts >= LOGIN_RATE_LIMIT_FAILURES;
    const expirationTime = shouldBlock
        ? new Date(currentTime + LOGIN_RATE_LIMIT_TIMEOUT).toISOString()
        : null;

    await query(
        `UPDATE
            login_rate_limits
         SET
             ip_address = $2,
             attempt_count = $3,
             start_time = CASE
                 WHEN $4 THEN NOW()
                 ELSE start_time
             END,
             expiration_time = $5,
             update_time = NOW()
         WHERE
            id = $1`,
        [
            existingLoginRateLimit.id,
            ipAddress || null,
            newFailedAttempts,
            windowHasExpired,
            expirationTime
        ]
    );
}

async function clearLoginRateLimit(username) {
    await query(
        `DELETE FROM
            login_rate_limits
         WHERE
            username = $1`,
        [username]
    );
}

module.exports = router;
