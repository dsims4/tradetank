const crypto = require("crypto");
const { query } = require("./db");

const SESSION_NAME = "trade-tank-session";
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_DURATION = 1000 * 60 * 60 * 24;
const SESSION_DURATION_REMEMBER_ME = 1000 * 60 * 60 * 24 * 30;

if (!SESSION_SECRET) {
    throw new Error(
        "SESSION_SECRET environment variable is not initialized."
    );
}

function parseCookies(cookieHeader = "") {
    if (!cookieHeader) return {};

    const cookies = {};

    for (const cookie of cookieHeader.split(";")) {
        const trimmedCookie = cookie.trim();
        const separatorIndex = trimmedCookie.indexOf("=");

        if (separatorIndex <= 0) continue;

        const key = trimmedCookie.slice(0, separatorIndex).trim();
        const value = trimmedCookie.slice(separatorIndex + 1);

        try {
            cookies[key] = decodeURIComponent(value);
        } catch {
            continue;
        }
    }

    return cookies;
}

function writeSessionCookie(res, cookieValue, sessionDuration) {
    const isProduction = process.env.NODE_ENV === "production";
    const cookieParameters = [
        `${SESSION_NAME}=${encodeURIComponent(cookieValue)}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Strict",
        "Priority=High"
    ];

    if (sessionDuration) {
        cookieParameters.push(
            `Max-Age=${Math.floor(sessionDuration / 1000)}`
        );
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

function createSessionToken() {
    return crypto.randomBytes(32).toString("hex");
}

function hashSessionToken(token) {
    return crypto
        .createHmac("sha256", SESSION_SECRET)
        .update(token)
        .digest("hex");
}

async function createSession(userID, rememberMe) {
    const sessionDuration = rememberMe
        ? SESSION_DURATION_REMEMBER_ME
        : SESSION_DURATION;
    const sessionToken = createSessionToken();
    const hashedSessionToken = hashSessionToken(sessionToken);
    const expirationTime = new Date(
        Date.now() + sessionDuration
    ).toISOString();

    await query(
        `INSERT INTO
            user_sessions
            (
                user_id,
                hashed_token,
                expiration_time
            )
         VALUES
            ($1, $2, $3)`,
        [userID, hashedSessionToken, expirationTime]
    );

    return {
        token: sessionToken,
        duration: sessionDuration
    };
}

function getSessionTokenFromCookie(req) {
    const cookies = parseCookies(req.headers.cookie);
    const sessionToken = cookies[SESSION_NAME];

    if (!sessionToken) return null;

    if (!/^[a-f0-9]{64}$/.test(sessionToken)) return null;

    return sessionToken;
}

async function getSessionUserIDFromToken(sessionToken) {
    if (!sessionToken) return null;

    const hashedSessionToken = hashSessionToken(sessionToken);

    const sessionResult = await query(
        `SELECT
            user_id
         FROM
            user_sessions
         WHERE
            hashed_token = $1
         AND
            invalidated_time IS NULL
         AND
            expiration_time > NOW()
         LIMIT 1`,
        [hashedSessionToken]
    );

    const userID = Number(sessionResult.rows[0]?.user_id);

    return Number.isSafeInteger(userID) && userID > 0
        ? userID
        : null;
}

async function setSessionCookie(res, userID, rememberMe) {
    const session = await createSession(userID, rememberMe);

    writeSessionCookie(
        res,
        session.token,
        session.duration
    );
}

async function getSessionUserID(req) {
    if (req.authenticatedUserID !== undefined) {
        return req.authenticatedUserID;
    }

    const sessionToken = getSessionTokenFromCookie(req);

    if (!sessionToken) {
        req.authenticatedUserID = null;
        return null;
    }

    const userID = await getSessionUserIDFromToken(sessionToken);

    req.authenticatedUserID = userID;
    return req.authenticatedUserID;
}

async function invalidateSession(req) {
    const sessionToken = getSessionTokenFromCookie(req);

    if (!sessionToken) {
        req.authenticatedUserID = null;
        return false;
    }

    const hashedSessionToken = hashSessionToken(sessionToken);

    const result = await query(
        `UPDATE
            user_sessions
         SET
            invalidated_time = NOW()
         WHERE
            hashed_token = $1
         AND
            invalidated_time IS NULL`,
        [hashedSessionToken]
    );

    req.authenticatedUserID = null;
    return result.rowCount > 0;
}

async function invalidateSessions(userID, db = { query }) {
    const result = await db.query(
        `UPDATE
            user_sessions
         SET
            invalidated_time = NOW()
         WHERE
            user_id = $1
         AND
            invalidated_time IS NULL
         AND
            expiration_time > NOW()`,
        [userID]
    );

    return result.rowCount;
}

async function invalidateOtherSessions(req, userID, db = { query }) {
    const sessionToken = getSessionTokenFromCookie(req);

    if (!sessionToken) throw new Error("A valid session token wasn't passed.");

    const hashedSessionToken = hashSessionToken(sessionToken);

    const result = await db.query(
        `UPDATE
            user_sessions
         SET
            invalidated_time = NOW()
         WHERE
            user_id = $1
         AND
            hashed_token <> $2
         AND
            invalidated_time IS NULL
         AND
            expiration_time > NOW()`,
        [userID, hashedSessionToken]
    );

    return result.rowCount;
}

module.exports = {
    clearSessionCookie,
    setSessionCookie,
    getSessionUserID,
    invalidateSession,
    invalidateSessions,
    invalidateOtherSessions
};
