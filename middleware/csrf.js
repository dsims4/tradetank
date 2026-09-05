/** Blocks another website from secretly sending account-changing requests. */
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

/*
 * This middleware allows read-only request methods without another check. For a
 * request that can change data, it verifies that the request came from Trade Tank.
 *
 * The Origin header is the clearest source and is checked first. If it is absent,
 * the Referer page address is accepted only when it belongs to the same website.
 *
 * Returns the result of continuing a safe same-site request.
 * Returns HTTP status 403 when the source is missing or belongs to another site.
 */
function verifySameOrigin(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();

    // Check Origin first. Use the full referring-page address only when Origin is absent.
    const origin = req.get("origin");

    if (origin && origin !== "null") {
        return origin === appOrigin
            ? next()
            : res.status(403).send("Forbidden");
    }

    const referer = req.get("referer");

    if (referer) {
        try {
            if (new URL(referer).origin === appOrigin) return next();
        } catch {
            // A malformed referring address is treated as untrusted below.
        }
    }

    return res.status(403).send("Forbidden");
}

module.exports = { verifySameOrigin };
