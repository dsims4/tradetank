const { rateLimit } = require("express-rate-limit");
const {
    getStringInput,
    isValidUsername
} = require("../utilities/validation");
const { getErrorMessage } = require("../utilities/messages");

const LOGIN_IP_RATE_LIMIT_WINDOW = 1000 * 60 * 15;
const LOGIN_IP_RATE_LIMIT_REQUESTS = 32;

const loginIPRateLimit = rateLimit({
    windowMs: LOGIN_IP_RATE_LIMIT_WINDOW,
    limit: LOGIN_IP_RATE_LIMIT_REQUESTS,
    standardHeaders: "draft-8",
    legacyHeaders: false,
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

module.exports = {
    loginIPRateLimit
};