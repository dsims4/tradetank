/** Creates login sessions and manages the random session token in the browser. */
const crypto = require("crypto");
const { query } = require("./db");

const SESSION_NAME = "tradetank-session";
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_DURATION = 1000 * 60 * 60 * 24;
const SESSION_DURATION_REMEMBER_ME = 1000 * 60 * 60 * 24 * 30;

if (!SESSION_SECRET) {
    throw new Error(
        "SESSION_SECRET environment variable is not initialized."
    );
}

/*
 * This function reads the browser's Cookie request header into separate names
 * and values.
 *
 * It does this directly instead of requiring another Express package. A cookie
 * with broken URL encoding is ignored so it cannot crash authentication.
 *
 * Returns an object in which each valid cookie name points to its decoded value.
 */
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

/*
 * This function sends the random login token to the browser as a cookie.
 *
 * HttpOnly stops page JavaScript from reading it. SameSite limits cross-site
 * requests. Production adds Secure so the browser sends it only over HTTPS.
 * Max-Age follows the saved session duration: one day normally, or thirty days
 * when the user chooses "Remember me." Both choices persist across browser restarts.
 *
 * It changes the response's Set-Cookie header and does not return a value.
 */
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

/*
 * This function tells the browser to delete the login cookie immediately.
 *
 * It uses the same path and security settings as the original cookie so the
 * browser deletes the correct cookie.
 *
 * It changes the response's Set-Cookie header and does not return a value.
 */
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

/*
 * This function creates a session token using secure random bytes.
 *
 * "Opaque" means the token itself contains no user ID or other readable data.
 *
 * Returns 32 random bytes written as 64 lowercase hexadecimal characters.
 */
function createSessionToken() {
    return crypto.randomBytes(32).toString("hex");
}

/*
 * This function creates the safe database version of a browser session token.
 *
 * HMAC combines the token with the server's secret key. The same token always
 * creates the same result, so it can be looked up. Only that result is stored;
 * someone who reads the database cannot directly reuse it as a login cookie.
 *
 * Returns the SHA-256 HMAC written as a hexadecimal string.
 */
function hashSessionToken(token) {
    return crypto
        .createHmac("sha256", SESSION_SECRET)
        .update(token)
        .digest("hex");
}

/*
 * This function creates and saves one login session for a user.
 *
 * Returns the private browser token and the session length after the safe HMAC
 * version has been saved in the database.
 */
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

/*
 * This function reads the session cookie and checks its basic format.
 *
 * Returns the 64-character token when it looks valid.
 * Returns null when it is missing or malformed.
 */
function getSessionTokenFromCookie(req) {
    const cookies = parseCookies(req.headers.cookie);
    const sessionToken = cookies[SESSION_NAME];

    if (!sessionToken) return null;

    if (!/^[a-f0-9]{64}$/.test(sessionToken)) return null;

    return sessionToken;
}

/*
 * This function finds the active login session belonging to a browser token.
 *
 * Returns the session's positive numeric user ID.
 * Returns null when the token is unknown, logged out, or expired.
 */
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

/*
 * This function saves a login session and sends its token cookie to the browser.
 *
 * Returns a Promise that finishes after both operations are complete.
 */
async function setSessionCookie(res, userID, rememberMe) {
    const session = await createSession(userID, rememberMe);

    writeSessionCookie(
        res,
        session.token,
        session.duration
    );
}

/*
 * This function finds the current request's logged-in user ID.
 *
 * It saves the answer on the request object so other middleware and routes do
 * not repeat the same database lookup during this request.
 *
 * Returns the logged-in numeric user ID, or null when the request is not logged in.
 */
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

/*
 * This function logs out the session used by the current request.
 *
 * The database row is kept for records, but it is marked invalid so the token
 * can no longer be used.
 *
 * Returns true when an active session was logged out.
 * Returns false when the request did not contain a usable active session.
 */
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

/*
 * This function logs a user out of every browser and device.
 *
 * Returns the number of active session rows marked invalid.
 */
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

/*
 * This function logs a user out everywhere except the browser making the request.
 *
 * Returns the number of other sessions marked invalid.
 * Throws an error when the current request has no correctly formed session token.
 */
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
