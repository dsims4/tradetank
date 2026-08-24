const express = require("express");
const { query } = require("../services/db");
const { verifyPassword } = require("../services/password");
const {
    clearSessionCookie,
    setSessionCookie
} = require("../services/session");

const router = express.Router();

const LOGIN_RATE_LIMIT_WINDOW = 1000 * 60 * 15;
const LOGIN_RATE_LIMIT_FAILURES = 7;
const LOGIN_RATE_LIMIT_TIMEOUT = 1000 * 60 * 15;

router.post("/login", async (req, res, next) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    const rememberMe = Boolean(req.body.remember);

    if (!username || !password) {
        const searchParams = new URLSearchParams({
            error: "missing-fields",
            username: username
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
        setSessionCookie(res, user.id, rememberMe);
        return res.redirect("/home");
    } catch (error) {
        return next(error);
    }
});

router.post("/logout", (req, res) => {
    clearSessionCookie(res);
    res.redirect("/login");
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
