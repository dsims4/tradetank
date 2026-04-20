const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { getClient, query } = require("../services/db");

const SESSION_COOKIE_NAME = "tradetank_session";
const SESSION_SECRET = process.env.SESSION_SECRET || "development-session-secret";
const REMEMBER_ME_SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 15;

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

function readAuthenticatedUserId(req) {
    const cookies = parseCookies(req.headers.cookie);
    const sessionValue = cookies[SESSION_COOKIE_NAME];

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
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionValue)}`,
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
        `${SESSION_COOKIE_NAME}=`,
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

function buildLoginView(data = {}) {
    return {
        currentPage: "login",
        errorMessage: data.errorMessage || "",
        successMessage: data.successMessage || "",
        formData: {
            username: data.username || ""
        }
    };
}

function buildResetPasswordView(data = {}) {
    return {
        currentPage: "reset-password",
        errorMessage: data.errorMessage || "",
        token: data.token || "",
        resetLinkIsValid: Boolean(data.resetLinkIsValid)
    };
}

function redirectAuthenticatedUser(req, res) {
    const authenticatedUserId = readAuthenticatedUserId(req);

    if (authenticatedUserId) {
        res.redirect("/home");
        return true;
    }

    return false;
}

function setNoStoreHeaders(res) {
    res.set({
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
        Expires: "0"
    });
}

async function findPasswordResetEvent(rawToken, db = { query }, options = {}) {
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

function getPasswordResetErrorMessage(resetEvent) {
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

function ensureAuthenticated(req, res) {
    const authenticatedUserId = readAuthenticatedUserId(req);

    if (!authenticatedUserId) {
        res.redirect("/login");
        return null;
    }

    setNoStoreHeaders(res);
    return authenticatedUserId;
}

router.get("/", (req, res) => {
    if (redirectAuthenticatedUser(req, res)) {
        return;
    }

    res.render("index.njk", {
        currentPage: "index"
    });
});

router.get("/login", (req, res) => {
    if (redirectAuthenticatedUser(req, res)) {
        return;
    }

    const username = String(req.query.username || "").trim();
    const error = String(req.query.error || "");
    const reset = String(req.query.reset || "");
    const errorMessage = error === "missing-fields"
        ? "Enter both a username and password."
        : error === "invalid-credentials"
            ? "Invalid username or password."
            : "";
    const successMessage = reset === "success"
        ? "Your password has been reset. Log in with your new password."
        : "";

    res.render("login.njk", buildLoginView({
        username,
        errorMessage,
        successMessage
    }));
});

router.get("/signup", (req, res) => {
    if (redirectAuthenticatedUser(req, res)) {
        return;
    }

    res.render("signup.njk", {
        currentPage: "signup"
    });
});

router.get("/home", (req, res) => {
    if (!ensureAuthenticated(req, res)) {
        return;
    }

    res.render("home.njk", {
        currentPage: "home"
    });
});

router.get("/analyze", (req, res) => {
    if (!ensureAuthenticated(req, res)) {
        return;
    }

    res.render("analyze.njk", {
        currentPage: "analyze"
    });
});

router.get("/visualize", (req, res) => {
    if (!ensureAuthenticated(req, res)) {
        return;
    }

    res.render("visualize.njk", {
        currentPage: "visualize"
    });
});

router.get("/input", (req, res) => {
    if (!ensureAuthenticated(req, res)) {
        return;
    }

    res.render("input.njk", {
        currentPage: "input"
    });
});

router.get("/profile", (req, res) => {
    if (!ensureAuthenticated(req, res)) {
        return;
    }

    res.render("profile.njk", {
        currentPage: "profile"
    });
});

router.get("/about", (req, res) => {
    res.render("about.njk", {
        currentPage: "about"
    });
});

router.get("/contact", (req, res) => {
    res.render("contact.njk", {
        currentPage: "contact"
    });
});

router.get("/privacy-policy", (req, res) => {
    res.render("privacy-policy.njk", {
        currentPage: "privacy-policy"
    });
});

router.get("/terms-of-use", (req, res) => {
    res.render("terms-of-use.njk", {
        currentPage: "terms-of-use"
    });
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

    try {
        const resetEvent = await findPasswordResetEvent(token);
        const errorMessage = getPasswordResetErrorMessage(resetEvent);

        return res.render("reset-password.njk", buildResetPasswordView({
            token,
            errorMessage,
            resetLinkIsValid: Boolean(token) && !errorMessage
        }));
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
        `SELECT id
         FROM users
         WHERE email = $1
         LIMIT 1`,
        [email]
    )
        .then(async (userResult) => {
            const user = userResult.rows[0];

            if (user) {
                const rawResetToken = crypto.randomBytes(32).toString("hex");
                const tokenHash = hashResetToken(rawResetToken);
                const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
                const resetUrl = `${req.protocol}://${req.get("host")}/reset-password?token=${rawResetToken}`;

                await query(
                    `INSERT INTO password_reset_events (user_id, token_hash, expires_at)
                     VALUES ($1, $2, $3)`,
                    [user.id, tokenHash, expiresAt]
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
        return res.render("reset-password.njk", buildResetPasswordView({
            token,
            errorMessage: "Enter and confirm your new password.",
            resetLinkIsValid: true
        }));
    }

    if (password !== confirmPassword) {
        return res.render("reset-password.njk", buildResetPasswordView({
            token,
            errorMessage: "Passwords do not match.",
            resetLinkIsValid: true
        }));
    }

    const client = await getClient();

    try {
        await client.query("BEGIN");

        const resetEvent = await findPasswordResetEvent(token, client, {
            lockForUpdate: true
        });
        const resetErrorMessage = getPasswordResetErrorMessage(resetEvent);

        if (resetErrorMessage) {
            await client.query("ROLLBACK");
            return res.render("reset-password.njk", buildResetPasswordView({
                token,
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

router.post("/login", async (req, res, next) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    const rememberMe = Boolean(req.body.remember);

    if (!username || !password) {
        const searchParams = new URLSearchParams({
            error: "missing-fields",
            username
        });
        return res.redirect(`/login?${searchParams.toString()}`);
    }

    try {
        const userResult = await query(
            `SELECT id, password_hash
             FROM users
             WHERE username = $1
             LIMIT 1`,
            [username]
        );

        const user = userResult.rows[0];

        if (!user) {
            const searchParams = new URLSearchParams({
                error: "invalid-credentials",
                username
            });
            return res.redirect(`/login?${searchParams.toString()}`);
        }

        const passwordIsValid = await verifyPassword(password, user.password_hash);

        if (!passwordIsValid) {
            const searchParams = new URLSearchParams({
                error: "invalid-credentials",
                username
            });
            return res.redirect(`/login?${searchParams.toString()}`);
        }

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

    if (!username || !email || !password || !confirmPassword) {
        return res.status(400).send("All signup fields are required.");
    }

    if (password !== confirmPassword) {
        return res.status(400).send("Passwords do not match.");
    }

    try {
        const existingUsers = await query(
            `SELECT username, email
             FROM users
             WHERE username = $1 OR email = $2`,
            [username, email]
        );

        if (existingUsers.rows.some((user) => user.username === username)) {
            return res.status(409).send("That username is already taken.");
        }

        if (existingUsers.rows.some((user) => user.email === email)) {
            return res.status(409).send("That email is already in use.");
        }

        const passwordHash = await hashPassword(password);

        await query(
            `INSERT INTO users (username, email, password_hash)
             VALUES ($1, $2, $3)`,
            [username, email, passwordHash]
        );

        return res.redirect("/login");
    } catch (error) {
        return next(error);
    }
});

router.post("/logout", (req, res) => {
    clearSessionCookie(res);
    res.redirect("/login");
});

module.exports = router;
