const {
    rateLimit,
    ipKeyGenerator
} = require("express-rate-limit");
const {
    getStringInput,
    isValidUsername,
    isValidResetPasswordToken
} = require("../utilities/validation");
const { getErrorMessage } = require("../utilities/messages");

const SIGNUP_IP_RATE_LIMIT_WINDOW = 1000 * 60 * 60;
const FORGOT_PASSWORD_IP_RATE_LIMIT_WINDOW = 1000 * 60 * 60;
const LOGIN_IP_RATE_LIMIT_WINDOW = 1000 * 60 * 15;
const SIGNUP_AVAILABILITY_IP_RATE_LIMIT_WINDOW = 1000 * 60 * 15;
const RESET_PASSWORD_IP_RATE_LIMIT_WINDOW = 1000 * 60 * 15;
const LOGIN_IP_RATE_LIMIT_REQUESTS = 32;
const SIGNUP_AVAILABILITY_IP_RATE_LIMIT_REQUESTS = 32;
const ACCOUNT_IP_RATE_LIMIT_REQUESTS = 8;
const SIGNUP_IP_RATE_LIMIT_REQUESTS = 8;
const FORGOT_PASSWORD_IP_RATE_LIMIT_REQUESTS = 8;
const RESET_PASSWORD_IP_RATE_LIMIT_REQUESTS = 8;

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

const signupIPRateLimit = rateLimit({
    windowMs: SIGNUP_IP_RATE_LIMIT_WINDOW,
    limit: SIGNUP_IP_RATE_LIMIT_REQUESTS,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: handleSignupIPRateLimit
});

const signupAvailabilityIPRateLimit = rateLimit({
    windowMs: SIGNUP_AVAILABILITY_IP_RATE_LIMIT_WINDOW,
    limit: SIGNUP_AVAILABILITY_IP_RATE_LIMIT_REQUESTS,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: handleSignupAvailabilityIPRateLimit
});

const forgotPasswordIPRateLimit = rateLimit({
    windowMs: FORGOT_PASSWORD_IP_RATE_LIMIT_WINDOW,
    limit: FORGOT_PASSWORD_IP_RATE_LIMIT_REQUESTS,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: handleForgotPasswordIPRateLimit
});

const resetPasswordIPRateLimit = rateLimit({
    windowMs: RESET_PASSWORD_IP_RATE_LIMIT_WINDOW,
    limit: RESET_PASSWORD_IP_RATE_LIMIT_REQUESTS,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: handleResetPasswordIPRateLimit
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

function handleSignupIPRateLimit(req, res) {
    return res.status(429).render("signup.njk", {
        currentPage: "signup",
        errorMessage: getErrorMessage("signup-rate-limit"),
        successMessage: ""
    });
}

function handleSignupAvailabilityIPRateLimit(req, res) {
    return res.status(429).json({
        error: "Too many signup availability requests have been made. Try again later."
    });
}

function handleForgotPasswordIPRateLimit(req, res) {
    return res.status(429).render("forgot-password.njk", {
        currentPage: "forgot-password",
        errorMessage: getErrorMessage("forgot-password-rate-limit")
    });
}

function handleResetPasswordIPRateLimit(req, res) {
    const token = getStringInput(req.body?.token).trim();

    return res.status(429).render("reset-password.njk", {
        currentPage: "reset-password",
        token: token,
        errorMessage: getErrorMessage("reset-password-rate-limit"),
        linkIsValid: isValidResetPasswordToken(token)
    });
}

async function clearAccountIPRateLimit(req) {
    const key = getAccountIPRateLimitKey(req);
    await accountIPRateLimit.resetKey(key);
}

module.exports = {
    loginIPRateLimit,
    signupIPRateLimit,
    accountIPRateLimit,
    signupAvailabilityIPRateLimit,
    forgotPasswordIPRateLimit,
    resetPasswordIPRateLimit,
    clearAccountIPRateLimit
};