const crypto = require("crypto");

const SESSION_NAME = "tradetank_session";
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_DURATION = 1000 * 60 * 60 * 24;
const SESSION_DURATION_REMEMBER_ME = 1000 * 60 * 60 * 24 * 30;

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
    const sessionDuration = rememberMe ? SESSION_DURATION_REMEMBER_ME : SESSION_DURATION;
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

function getSessionUserID(req) {
    if (req.authenticatedUserID !== undefined) return req.authenticatedUserID;

    req.authenticatedUserID = getSessionUserIDFromCookie(req);
    return req.authenticatedUserID;
}

module.exports = {
    getSessionUserID,
    setSessionCookie,
    clearSessionCookie
};
