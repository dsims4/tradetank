const SAFE_METHODS = new Set([
    "GET",
    "HEAD",
    "OPTIONS"
]);

const configuredOrigin = process.env.APP_ORIGIN;

if (!configuredOrigin) throw new Error(
    "The environment variable APP_ORIGIN has not been initialized."
);

let appOrigin;

try {
    appOrigin = new URL(configuredOrigin).origin;
} catch {
    throw new Error("APP_ORIGIN is an invalid origin.");
}

function verifySameOrigin(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.get("origin");

    if (origin) {
        return origin === appOrigin
            ? next()
            : res.status(403).send("Forbidden");
    }

    const referer = req.get("referer");

    if (referer) {
        try {
            if (new URL(referer).origin === appOrigin) return next();
        } catch {
            // This is intentionally blank.
        }
    }

    return res.status(403).send("Forbidden");
}

module.exports = { verifySameOrigin };