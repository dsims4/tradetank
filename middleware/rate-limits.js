const {
    rateLimit,
    ipKeyGenerator
} = require("express-rate-limit");
const {
    getStringInput,
    isValidUsername
} = require("../utilities/validation");
const { getErrorMessage } = require("../utilities/messages");

const LOGIN_IP_RATE_LIMIT_WINDOW = 1000 * 60 * 15;
const LOGIN_IP_RATE_LIMIT_REQUESTS = 32;
const ACCOUNT_IP_RATE_LIMIT_REQUESTS = 8;

const loginIPRateLimit = rateLimit({
    windowMs: LOGIN_IP_RATE_LIMIT_WINDOW,
    limit: LOGIN_IP_RATE_LIMIT_REQUESTS,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: handleLoginIPRateLimit
});

const accountIPRateLimit = rateLimit({
    windowMs: LOGIN_IP_RATE_LIMIT_WINDOW,
    limit: ACCOUNT_IP_RATE_LIMIT_REQUESTS,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: getAccountIPRateLimitKey,
    handler: handleLoginIPRateLimit
});

function handleLoginIPRateLimit(req, res) {
    const usernameInput = getStringInput(req.body?.username).trim();
    const username = isValidUsername(usernameInput)
        ? usernameInput
        : "";

    return res.status(429).render("login.njk", {
        currentPage: "login",
        username: username,
        errorMessage: getErrorMessage("login-rate-limit"),
        successMessage: ""
    });
}

function getAccountIPRateLimitKey(req) {
    const username = getStringInput(req.body?.username).trim();
    return `${ipKeyGenerator(req.ip)}:${username}`;
}

async function clearAccountIPRateLimit(req) {
    const key = getAccountIPRateLimitKey(req);
    await accountIPRateLimit.resetKey(key);
}

module.exports = {
    loginIPRateLimit,
    accountIPRateLimit,
    clearAccountIPRateLimit
};