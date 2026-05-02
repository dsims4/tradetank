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
        errorMessage: errorMessage
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
                    (username, email, hashed_password)
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
                    previous_email,
                    next_email,
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

router.post("/profile/change-password", async (req, res, next) => {
    if (nonexistentSessionRedirect(req, res)) return;

    const userID = getSessionUserID(req);
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
            const expirationTime = new Date(Date.now() + RESET_TOKEN_DURATION).toISOString();
            const resetURL = `${req.protocol}://${req.get("host")}/reset-password?token=${resetToken}`;

            await query(
                `INSERT INTO 
                    password_reset_events 
                    (user_id, hashed_token, expiration_time)
                 VALUES 
                    ($1, $2, $3)`,
                [user.id, hashedResetToken, expirationTime]
            );

            if (process.env.NODE_ENV !== "production") {
                console.log(`Password reset URL: ${resetURL}`);
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
                linkIsValid: "true"
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
                password_reset_events
             SET 
                reset_time = NOW()
             WHERE 
                id = $1`,
            [resetPasswordEvent.id]
        );

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
        : (error === "invalid-token")
        ? "The password reset token is invalid."
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
    const hashedPassword = await new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, 64, (error, derivedKey) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(`${salt}:${derivedKey.toString("hex")}`);
        });
    });
    return hashedPassword;
}

async function verifyPassword(password, storedHashedPassword) {
    const [salt, storedDerivedKey] = storedHashedPassword.split(":");

    if (!salt || !storedDerivedKey) {
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

    const storedDerivedKeyBuffer = Buffer.from(storedDerivedKey, "hex");

    if (derivedKey.length !== storedDerivedKeyBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(derivedKey, storedDerivedKeyBuffer);
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

function hashResetToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function signSessionPayload(payload) {
    return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
}

function createSessionPayload(userID, sessionDuration) {
    const expirationTime = sessionDuration ? Date.now() + sessionDuration : 0;
    const payload = `${userID}.${expirationTime}`;
    const signature = signSessionPayload(payload);

    return `${payload}.${signature}`;
}

function getSessionUserIDFromCookie(req) {
    const cookies = parseCookies(req.headers.cookie);
    const sessionPayload = cookies[SESSION_NAME];

    if (!sessionPayload) {
        return null;
    }

    const [userIDString, expirationString, signature] = sessionPayload.split(".");

    if (!userIDString || !expirationString || !signature) {
        return null;
    }

    const payload = `${userIDString}.${expirationString}`;
    const actualSignatureBuffer = Buffer.from(signature, "hex");
    const expectedSignatureBuffer = Buffer.from(signSessionPayload(payload), "hex");

    if (actualSignatureBuffer.length !== expectedSignatureBuffer.length) {
        return null;
    }

    if (!crypto.timingSafeEqual(actualSignatureBuffer, expectedSignatureBuffer)) {
        return null;
    }

    const expirationTime = Number(expirationString);

    if (!Number.isFinite(expirationTime)) {
        return null;
    }

    if (expirationTime !== 0 && expirationTime <= Date.now()) {
        return null;
    }

    const userID = Number(userIDString);
    return Number.isInteger(userID) ? userID : null;
}

function setSessionCookie(res, userID, rememberMe) {
    const sessionDuration = rememberMe ? SESSION_DURATION_REMEMBER_ME : null;
    const sessionPayload = createSessionPayload(userID, sessionDuration);
    const isProduction = process.env.NODE_ENV === "production";
    const cookieParameters = [
        `${SESSION_NAME}=${encodeURIComponent(sessionPayload)}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Strict",
        "Priority=High"
    ];

    if (sessionDuration) {
        cookieParameters.push(`Max-Age=${Math.floor(sessionDuration / 1000)}`);
    }

    if (isProduction) {
        cookieParameters.push("Secure");
    }


    res.setHeader("Set-Cookie", cookieParameters.join("; "));
}

function clearSessionCookie(res) {
    const isProduction = process.env.NODE_ENV === "production";
    const cookieParameters = [
        `${SESSION_NAME}=`,
        "Path=/",
        "HttpOnly",
        "SameSite=Strict",
        "Max-Age=0",
        "Priority=High"
    ];

    if (isProduction) {
        cookieParameters.push("Secure");
    }

    res.setHeader(
        "Set-Cookie",
        cookieParameters.join("; ")
    );
}

async function getLoginRateLimit(username) {
    const loginRateLimitResult = await query(
        `SELECT 
            id, 
            failed_attempts, 
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
                failed_attempts,
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
        : Number(existingLoginRateLimit.failed_attempts || 0) + 1;
    const shouldBlock = newFailedAttempts >= LOGIN_RATE_LIMIT_FAILURES;
    const expirationTime = shouldBlock
        ? new Date(currentTime + LOGIN_RATE_LIMIT_TIMEOUT).toISOString()
        : null;

    await query(
        `UPDATE 
            login_rate_limits
         SET 
            ip_address = $2,
             failed_attempts = $3,
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

function getSessionUserID(req) {
    if (req.authenticatedUserID !== undefined) return req.authenticatedUserID;

    req.authenticatedUserID = getSessionUserIDFromCookie(req);
    return req.authenticatedUserID;
}

function existentSession(req) {
    return Boolean(getSessionUserID(req));
}

function existentSessionRedirect(req, res) {
    const sessionExists = existentSession(req);

    if (sessionExists) {
        res.redirect("/home");
        return true;
    }
    return false;
}

function nonexistentSessionRedirect(req, res) {
    const sessionExists = existentSession(req);

    if (!sessionExists) {
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

async function getResetPasswordEvent(token, db = { query }, options = {}) {
    if (!token) {
        return null;
    }

    const hashedResetToken = hashResetToken(token);
    const lockClause = options.lockForUpdate ? "FOR UPDATE" : "";
    const resetPasswordEventResult = await db.query(
        `SELECT 
            id, user_id, 
            expiration_time, 
            reset_time
         FROM 
            password_reset_events
         WHERE 
            hashed_token = $1
         LIMIT 1 
            ${lockClause}`,
        [hashedResetToken]
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

    if (new Date(resetPasswordEvent.expiration_time).getTime() <= Date.now()) {
        return "This password reset link has been used or expired.";
    }

    return "";
}

module.exports = router;
