const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { getClient, query } = require("../services/db");

const SESSION_NAME = "tradetank_session";
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_DURATION = 1000 * 60 * 60 * 24;
const SESSION_DURATION_REMEMBER_ME = 1000 * 60 * 60 * 24 * 30;
const RESET_TOKEN_DURATION = 1000 * 60 * 15;
const LOGIN_RATE_LIMIT_WINDOW = 1000 * 60 * 15;
const LOGIN_RATE_LIMIT_FAILURES = 7;
const LOGIN_RATE_LIMIT_TIMEOUT = 1000 * 60 * 15;

router.get("/", (req, res) => {
    if (existentSessionRedirect(req, res)) return;

    res.render("index.njk", {
        currentPage: "index"
    });
});

router.get("/login", (req, res) => {
    if (existentSessionRedirect(req, res)) return;

    const username = String(req.query.username || "").trim();
    const error = String(req.query.error || "");
    const success = String(req.query.success || "");

    const errorMessage = getErrorMessage(error);
    const successMessage = getSuccessMessage(success);

    res.render("login.njk", {
        currentPage: "login",
        username: username,
        errorMessage: errorMessage,
        successMessage: successMessage
    });
});

router.get("/signup", (req, res) => {
    if (existentSessionRedirect(req, res)) return;

    const error = req.query.error || "";
    const errorMessage = getErrorMessage(error);

    res.render("signup.njk", {
        currentPage: "signup",
        error: errorMessage
    });
});

router.get("/home", async (req, res, next) => {
    if (nonexistentSessionRedirect(req, res)) return;

    const userID = getSessionUserID(req);

    try {
        const userResult = await query(
            `SELECT 
                color_scheme
            FROM 
                user_preferences
            WHERE 
                user_id = $1
            LIMIT 1`,
            [userID]
        );

        const user = userResult.rows[0];

        if (!user) {
            clearSessionCookie(res);
            return res.redirect("/login");
        }

        return res.render("home.njk", {
            currentPage: "home",
            colorScheme: user.color_scheme || "light"
        });
    } catch (error) {
        return next(error);
    }
});

router.get("/analyze", async (req, res, next) => {
    if (nonexistentSessionRedirect(req, res)) return;

    const userID = getSessionUserID(req);

    try {
        const userResult = await query(
            `SELECT 
                color_scheme
            FROM 
                user_preferences
            WHERE 
                user_id = $1
            LIMIT 1`,
            [userID]
        );

        const user = userResult.rows[0];

        if (!user) {
            clearSessionCookie(res);
            return res.redirect("/login");
        }

        return res.render("analyze.njk", {
            currentPage: "analyze",
            colorScheme: user.color_scheme || "light"
        });
    } catch (error) {
        return next(error);
    }

    res.render("analyze.njk", {
        currentPage: "analyze"
    });
});

router.get("/visualize", async (req, res, next) => {
    if (nonexistentSessionRedirect(req, res)) return;

    const userID = getSessionUserID(req);

    try {
        const userResult = await query(
            `SELECT 
                color_scheme
            FROM 
                user_preferences
            WHERE 
                user_id = $1
            LIMIT 1`,
            [userID]
        );

        const user = userResult.rows[0];

        if (!user) {
            clearSessionCookie(res);
            return res.redirect("/login");
        }

        return res.render("visualize.njk", {
            currentPage: "visualize",
            colorScheme: user.color_scheme || "light"
        });
    } catch (error) {
        return next(error);
    }
});

router.get("/input", async (req, res, next) => {
    if (nonexistentSessionRedirect(req, res)) return;

    const userID = getSessionUserID(req);

    try {
        const userResult = await query(
            `SELECT 
                color_scheme
            FROM 
                user_preferences
            WHERE 
                user_id = $1
            LIMIT 1`,
            [userID]
        );

        const user = userResult.rows[0];

        if (!user) {
            clearSessionCookie(res);
            return res.redirect("/login");
        }

        return res.render("input.njk", {
            currentPage: "input",
            colorScheme: user.color_scheme || "light"
        });
    } catch (error) {
        return next(error);
    }
});

router.get("/profile", async (req, res, next) => {
    if (nonexistentSessionRedirect(req, res)) return;

    const userID = getSessionUserID(req);

    try {
        const emailError = String(req.query.emailError || "");
        const passwordError = String(req.query.passwordError || "");
        const colorSchemeError = String(req.query.colorSchemeError || "");
        const emailSuccess = String(req.query.emailSuccess || "");
        const passwordSuccess = String(req.query.passwordSuccess || "");

        const emailErrorMessage = getErrorMessage(emailError);
        const passwordErrorMessage = getErrorMessage(passwordError);
        const colorSchemeErrorMessage = getErrorMessage(colorSchemeError);
        const emailSuccessMessage = getSuccessMessage(emailSuccess);
        const passwordSuccessMessage = getSuccessMessage(passwordSuccess);

        const userResult = await query(
            `SELECT
                users.username,
                users.email,
                users.created_at,
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
                createdAtLabel: new Intl.DateTimeFormat("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric"
                }).format(new Date(user.created_at)),
                colorScheme: user.color_scheme || "light"
            },
            emailErrorMessage: emailErrorMessage,
            passwordErrorMessage: passwordErrorMessage,
            colorSchemeErrorMessage: colorSchemeErrorMessage,
            emailSuccessMessage: emailSuccessMessage,
            passwordSuccessMessage: passwordSuccessMessage
        });
    } catch (error) {
        return next(error);
    }
});

router.get("/about", async (req, res, next) => {
    const userID = getSessionUserID(req);

    try {
        const userResult = userID ? await query(
            `SELECT
                user_preferences.color_scheme
            FROM 
                user_preferences
            WHERE 
                user_id = $1
            LIMIT 1`,
            [userID]
        ) : null;

        return res.render("about.njk", {
            currentPage: "about",
            colorScheme: userResult?.rows[0]?.color_scheme || "light"
        });
    } catch (error) {
        return next(error);
    }
});

router.get("/contact", async (req, res, next) => {
    const userID = getSessionUserID(req);

    try {
        const userResult = userID ? await query(
            `SELECT 
                color_scheme
             FROM 
                user_preferences
             WHERE 
                user_id = $1
             LIMIT 1`,
            [userID]
        ) : null;

        return res.render("contact.njk", {
            currentPage: "contact",
            colorScheme: userResult?.rows[0]?.color_scheme || "light"
        });
    } catch (error) {
        return next(error);
    }
});

router.get("/privacy-policy", async (req, res, next) => {
    const userID = getSessionUserID(req);

    try {
        const userResult = userID ? await query(
            `SELECT 
                color_scheme
             FROM 
                user_preferences
             WHERE 
                user_id = $1
             LIMIT 1`,
            [userID]
        ) : null;

        return res.render("privacy-policy.njk", {
            currentPage: "privacy-policy",
            colorScheme: userResult?.rows[0]?.color_scheme || "light"
        });
    } catch (error) {
        return next(error);
    }
});

router.get("/terms-of-use", async (req, res, next) => {
    const userID = getSessionUserID(req);

    try {
        const userResult = userID ? await query(
            `SELECT 
                color_scheme
             FROM 
                user_preferences
             WHERE 
                user_id = $1
             LIMIT 1`,
            [userID]
        ) : null;

        return res.render("terms-of-use.njk", {
            currentPage: "terms-of-use",
            colorScheme: userResult?.rows[0]?.color_scheme || "light"
        });
    } catch (error) {
        return next(error);
    }
});

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
    const error = String(req.query.error || "");

    try {
        const resetEvent = await findResetPasswordEvent(token);
        const resetLinkErrorMessage = getResetPasswordErrorMessage(resetEvent);
        const errorMessage = resetLinkErrorMessage || getErrorMessage(error);

        return res.render("reset-password.njk", buildResetPasswordView({
            currentPage: "reset-password",
            token: token,
            errorMessage: errorMessage,
            resetLinkIsValid: !resetLinkErrorMessage
        }));
    } catch (error) {
        return next(error);
    }
});

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
        const loginRateLimit = await findLoginRateLimit(username);
        const loginRateLimitExpiration = loginRateLimit?.blocked_until
            ? new Date(loginRateLimit.blocked_until).getTime()
            : null;

        if (loginRateLimitExpiration && loginRateLimitExpiration > Date.now()) {
            const searchParams = new URLSearchParams({
                username: username,
                error: "login-rate-limit"
            });
            return res.redirect(`/login?${searchParams.toString()}`);
        }

        const userResult = await query(
            `SELECT id, password_hash
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

        const passwordIsValid = await verifyPassword(password, user.password_hash);

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

router.post("/signup", async (req, res, next) => {
    const username = String(req.body.username || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    const error = (!username || !email || !password || !confirmPassword)
        ? "missing-fields"
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

        try {
            await client.query("BEGIN");

            const userResult = await client.query(
                `INSERT INTO 
                    users 
                    (username, email, password_hash)
                VALUES 
                    ($1, $2, $3)
                RETURNING 
                    id`,
                [username, email, hashedPassword]
            );

            const userID = userResult?.rows[0]?.id;

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

            return res.redirect("/login");
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

router.post("/logout", (req, res) => {
    clearSessionCookie(res);
    res.redirect("/login");
});

router.post("/profile/color-scheme", async (req, res, next) => {
    if (nonexistentSessionRedirect(req, res)) return;

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
                (user_id, color_scheme, updated_at)
             VALUES 
                ($1, $2, NOW())
             ON CONFLICT 
                (user_id)
             DO UPDATE SET
                 color_scheme = EXCLUDED.color_scheme,
                 updated_at = NOW()`,
            [userID, colorScheme]
        );

        return res.redirect("/profile?success=color-scheme-updated");
    } catch (error) {
        return next(error);
    }
});

router.post("/profile/change-email", async (req, res, next) => {
    if (nonexistentSessionRedirect(req, res)) return;

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
                    updated_at = NOW()
                 WHERE 
                    id = $2`,
                [email, userID]
            );

            await client.query(
                `INSERT INTO 
                    email_change_events 
                 (
                    user_id,
                    previous_email,
                    next_email,
                    changed_at
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
            const expiresAt = new Date(Date.now() + RESET_TOKEN_DURATION).toISOString();
            const resetUrl = `${req.protocol}://${req.get("host")}/reset-password?token=${resetToken}`;

            await query(
                `INSERT INTO 
                    password_reset_events 
                    (user_id, token_hash, expires_at)
                 VALUES 
                    ($1, $2, $3)`,
                [user.id, hashedResetToken, expiresAt]
            );

            if (process.env.NODE_ENV !== "production") {
                console.log(`Password reset URL: ${resetUrl}`);
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
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    if (!token) {
        return res.render("reset-password.njk", buildResetPasswordView({
            errorMessage: "This password reset link is invalid.",
            resetLinkIsValid: false
        }));
    }

    if (!password || !confirmPassword) {
        const searchParams = new URLSearchParams({
            token: token,
            error: "missing-fields"
        });
        return res.redirect(`/reset-password?${searchParams.toString()}`);
    }

    if (password !== confirmPassword) {
        const searchParams = new URLSearchParams({
            token: token,
            error: "password-mismatch"
        });
        return res.redirect(`/reset-password?${searchParams.toString()}`);
    }

    const client = await getClient();

    try {
        await client.query("BEGIN");

        const resetEvent = await findResetPasswordEvent(token, client, {
            lockForUpdate: true
        });
        const resetErrorMessage = getPasswordResetErrorMessage(resetEvent);

        if (resetErrorMessage) {
            await client.query("ROLLBACK");
            return res.render("reset-password.njk", buildResetPasswordView({
                token: token,
                errorMessage: resetErrorMessage,
                resetLinkIsValid: false
            }));
        }

        const passwordHash = await hashPassword(password);

        await client.query(
            `UPDATE users
             SET password_hash = $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [passwordHash, resetEvent.user_id]
        );

        await client.query(
            `UPDATE password_reset_events
             SET reset_at = NOW()
             WHERE id = $1`,
            [resetEvent.id]
        );

        await client.query("COMMIT");

        return res.redirect("/login?reset=success");
    } catch (error) {
        await client.query("ROLLBACK");
        return next(error);
    } finally {
        client.release();
    }
});

function getErrorMessage(error) {
    return (error === "missing-fields")
        ? "Some fields are missing."
        : (error === "email-missing-fields")
        ? "Some fields are missing."
        : (error === "password-missing-fields")
        ? "Some fields are missing."
        : (error === "invalid-credentials")
        ? "Those credentials are invalid."
        : (error === "login-rate-limit")
        ? "The login attempt limit has been reached and must expire."
        : (error === "password-mismatch")
        ? "The passwords do not match."
        : (error === "username-taken")
        ? "That username is already taken."
        : (error === "email-taken")
        ? "That email is already in use."
        : (error === "email-mismatch")
        ? "Those email addresses do not match."
        : (error === "email-same")
        ? "That email address is already used by this account."
        : (error === "invalid-color-scheme")
        ? "That color scheme is invalid."
        : "";
}

function getSuccessMessage(success) {
    return (success === "reset-success")
        ? "Your password has been reset."
        : (success === "email-updated")
        ? "Your email address has been updated."
        : (success === "password-updated")
        ? "Your password has been updated."
        : (success === "password-reset")
        ? "Your password has been reset."
        : (success === "color-scheme-updated")
        ? "Your color scheme has been updated."
        : "";
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = await new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, 64, (error, derivedKey) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(`${salt}:${derivedKey.toString("hex")}`);
        });
    });
    return passwordHash;
}

async function verifyPassword(password, storedPasswordHash) {
    const [salt, storedDerivedKeyHex] = storedPasswordHash.split(":");

    if (!salt || !storedDerivedKeyHex) {
        return false;
    }

    const derivedKey = await new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, 64, (error, key) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(key);
        });
    });

    const storedDerivedKey = Buffer.from(storedDerivedKeyHex, "hex");

    if (derivedKey.length !== storedDerivedKey.length) {
        return false;
    }

    return crypto.timingSafeEqual(derivedKey, storedDerivedKey);
}

function parseCookies(cookieHeader = "") {
    if (!cookieHeader) {
        return {};
    }

    return Object.fromEntries(
        cookieHeader
            .split(";")
            .map((cookie) => cookie.trim())
            .filter(Boolean)
            .map((cookie) => {
                const separatorIndex = cookie.indexOf("=");
                const key = cookie.slice(0, separatorIndex);
                const value = cookie.slice(separatorIndex + 1);

                return [key, decodeURIComponent(value)];
            })
    );
}

function signSessionPayload(payload) {
    return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
}

function hashResetToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function createSessionValue(userId, maxAgeMs) {
    const expiresAt = maxAgeMs ? Date.now() + maxAgeMs : 0;
    const payload = `${userId}.${expiresAt}`;
    const signature = signSessionPayload(payload);

    return `${payload}.${signature}`;
}

function getSessionUserIDFromCookie(req) {
    const cookies = parseCookies(req.headers.cookie);
    const sessionValue = cookies[SESSION_NAME];

    if (!sessionValue) {
        return null;
    }

    const [userIdText, expiresAtText, signature] = sessionValue.split(".");

    if (!userIdText || !expiresAtText || !signature) {
        return null;
    }

    const payload = `${userIdText}.${expiresAtText}`;
    const receivedSignatureBuffer = Buffer.from(signature, "hex");
    const expectedSignatureBuffer = Buffer.from(signSessionPayload(payload), "hex");

    if (receivedSignatureBuffer.length !== expectedSignatureBuffer.length) {
        return null;
    }

    if (!crypto.timingSafeEqual(receivedSignatureBuffer, expectedSignatureBuffer)) {
        return null;
    }

    const expiresAt = Number(expiresAtText);

    if (!Number.isFinite(expiresAt)) {
        return null;
    }

    if (expiresAt !== 0 && expiresAt <= Date.now()) {
        return null;
    }

    const userId = Number(userIdText);
    return Number.isInteger(userId) ? userId : null;
}

function setSessionCookie(res, userId, rememberMe) {
    const maxAgeMs = rememberMe ? REMEMBER_ME_SESSION_MAX_AGE_MS : null;
    const sessionValue = createSessionValue(userId, maxAgeMs);
    const isProduction = process.env.NODE_ENV === "production";
    const cookieParts = [
        `${SESSION_NAME}=${encodeURIComponent(sessionValue)}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Strict"
    ];

    if (maxAgeMs) {
        cookieParts.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
    }

    if (isProduction) {
        cookieParts.push("Secure");
    }

    cookieParts.push("Priority=High");

    res.setHeader("Set-Cookie", cookieParts.join("; "));
}

function clearSessionCookie(res) {
    const isProduction = process.env.NODE_ENV === "production";
    const cookieParts = [
        `${SESSION_NAME}=`,
        "Path=/",
        "HttpOnly",
        "SameSite=Strict",
        "Max-Age=0",
        "Priority=High"
    ];

    if (isProduction) {
        cookieParts.push("Secure");
    }

    res.setHeader(
        "Set-Cookie",
        cookieParts.join("; ")
    );
}

async function findLoginRateLimit(loginIdentifier) {
    const rateLimitResult = await query(
        `SELECT id, failed_attempt_count, window_started_at, blocked_until
         FROM login_rate_limits
         WHERE login_identifier = $1
         LIMIT 1`,
        [loginIdentifier]
    );

    return rateLimitResult.rows[0] || null;
}

async function registerFailedLoginAttempt(loginIdentifier, ipAddress) {
    const existingRateLimit = await findLoginRateLimit(loginIdentifier);
    const now = Date.now();

    if (!existingRateLimit) {
        await query(
            `INSERT INTO login_rate_limits (
                login_identifier,
                ip_address,
                failed_attempt_count,
                window_started_at,
                updated_at
            )
             VALUES ($1, $2, 1, NOW(), NOW())`,
            [loginIdentifier, ipAddress || null]
        );
        return;
    }

    const windowStartedAtMs = new Date(existingRateLimit.window_started_at).getTime();
    const windowHasExpired = !Number.isFinite(windowStartedAtMs)
        || (now - windowStartedAtMs) > LOGIN_RATE_LIMIT_WINDOW_MS;
    const nextFailedAttemptCount = windowHasExpired
        ? 1
        : Number(existingRateLimit.failed_attempt_count || 0) + 1;
    const shouldBlock = nextFailedAttemptCount >= LOGIN_RATE_LIMIT_MAX_FAILURES;
    const blockedUntil = shouldBlock
        ? new Date(now + LOGIN_RATE_LIMIT_BLOCK_MS).toISOString()
        : null;

    await query(
        `UPDATE login_rate_limits
         SET ip_address = $2,
             failed_attempt_count = $3,
             window_started_at = CASE
                 WHEN $4 THEN NOW()
                 ELSE window_started_at
             END,
             blocked_until = $5,
             updated_at = NOW()
         WHERE id = $1`,
        [
            existingRateLimit.id,
            ipAddress || null,
            nextFailedAttemptCount,
            windowHasExpired,
            blockedUntil
        ]
    );
}

async function clearLoginRateLimit(loginIdentifier) {
    await query(
        `DELETE FROM login_rate_limits
         WHERE login_identifier = $1`,
        [loginIdentifier]
    );
}

function buildResetPasswordView(data = {}) {
    return {
        currentPage: "reset-password",
        errorMessage: data.errorMessage || "",
        token: data.token || "",
        resetLinkIsValid: Boolean(data.resetLinkIsValid)
    };
}

function getSessionUserID(req) {
    if (req.authenticatedUserID !== undefined) return req.authenticatedUserID;

    req.authenticatedUserID = getSessionUserIDFromCookie(req);
    return req.authenticatedUserID;
}

function existentSession(req) {
    return Boolean(getSessionUserID(req));
}

function existentSessionRedirect(req, res) {
    const existentSession = existentSession(req);

    if (existentSession) {
        res.redirect("/home");
        return true;
    }
    return false;
}

function nonexistentSessionRedirect(req, res) {
    const existentSession = existentSession(req);

    if (!existentSession) {
        res.redirect("/login");
        return true;
    }

    setNoStoreHeaders(res);
    return false;
}

function setNoStoreHeaders(res) {
    res.set({
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
        Expires: "0"
    });
}

async function findResetPasswordEvent(rawToken, db = { query }, options = {}) {
    if (!rawToken) {
        return null;
    }

    const tokenHash = hashResetToken(rawToken);
    const lockClause = options.lockForUpdate ? "\n         FOR UPDATE" : "";
    const resetEventResult = await db.query(
        `SELECT id, user_id, expires_at, reset_at
         FROM password_reset_events
         WHERE token_hash = $1
         LIMIT 1${lockClause}`,
        [tokenHash]
    );

    return resetEventResult.rows[0] || null;
}

function getResetPasswordErrorMessage(resetEvent) {
    if (!resetEvent) {
        return "This password reset link is invalid.";
    }

    if (resetEvent.reset_at) {
        return "This password reset link has been used or expired.";
    }

    if (new Date(resetEvent.expires_at).getTime() <= Date.now()) {
        return "This password reset link has been used or expired.";
    }

    return "";
}

module.exports = router;
