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

const ONE_HOUR = 1000 * 60 * 60;
const FIFTEEN_MINUTES = 1000 * 60 * 15;
const LOGIN_IP_RATE_LIMIT_REQUESTS = 32;
const SIGNUP_AVAILABILITY_IP_RATE_LIMIT_REQUESTS = 32;
const ACCOUNT_IP_RATE_LIMIT_REQUESTS = 8;
const SIGNUP_IP_RATE_LIMIT_REQUESTS = 8;
const FORGOT_PASSWORD_IP_RATE_LIMIT_REQUESTS = 8;
const RESET_PASSWORD_IP_RATE_LIMIT_REQUESTS = 8;
const PROFILE_CHANGE_USER_RATE_LIMIT_REQUESTS = 4;

function createRateLimiter(windowMs, limit, handler, keyGenerator) {
    const options = {
        windowMs,
        limit,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        handler
    };

    if (keyGenerator) options.keyGenerator = keyGenerator;

    return rateLimit(options);
}

function handleLoginIPRateLimit(req, res) {
    const usernameInput = getStringInput(req.body?.username).trim();
    const username = isValidUsername(usernameInput)
        ? usernameInput
        : "";

    return res.status(429).render("login.njk", {
        currentPage: "login",
        username,
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
        error: "Too many signup availability requests have been made. " +
            "Try again later."
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
        token,
        errorMessage: getErrorMessage("reset-password-rate-limit"),
        linkIsValid: isValidResetPasswordToken(token)
    });
}

function getAuthenticatedUserKey(req) {
    return String(req.authenticatedUserID);
}

function handleChangeEmailUserRateLimit(req, res) {
    const searchParams = new URLSearchParams({
        emailError: "change-email-rate-limit"
    });
    return res.redirect(`/profile?${searchParams.toString()}`);
}

function handleChangePasswordUserRateLimit(req, res) {
    const searchParams = new URLSearchParams({
        passwordError: "change-password-rate-limit"
    });
    return res.redirect(`/profile?${searchParams.toString()}`);
}

const loginIPRateLimit = createRateLimiter(
    FIFTEEN_MINUTES,
    LOGIN_IP_RATE_LIMIT_REQUESTS,
    handleLoginIPRateLimit
);

const accountIPRateLimit = createRateLimiter(
    FIFTEEN_MINUTES,
    ACCOUNT_IP_RATE_LIMIT_REQUESTS,
    handleLoginIPRateLimit,
    getAccountIPRateLimitKey
);

const signupIPRateLimit = createRateLimiter(
    ONE_HOUR,
    SIGNUP_IP_RATE_LIMIT_REQUESTS,
    handleSignupIPRateLimit
);

const signupAvailabilityIPRateLimit = createRateLimiter(
    FIFTEEN_MINUTES,
    SIGNUP_AVAILABILITY_IP_RATE_LIMIT_REQUESTS,
    handleSignupAvailabilityIPRateLimit
);

const forgotPasswordIPRateLimit = createRateLimiter(
    ONE_HOUR,
    FORGOT_PASSWORD_IP_RATE_LIMIT_REQUESTS,
    handleForgotPasswordIPRateLimit
);

const resetPasswordIPRateLimit = createRateLimiter(
    FIFTEEN_MINUTES,
    RESET_PASSWORD_IP_RATE_LIMIT_REQUESTS,
    handleResetPasswordIPRateLimit
);

const changeEmailUserRateLimit = createRateLimiter(
    ONE_HOUR,
    PROFILE_CHANGE_USER_RATE_LIMIT_REQUESTS,
    handleChangeEmailUserRateLimit,
    getAuthenticatedUserKey
);

const changePasswordUserRateLimit = createRateLimiter(
    ONE_HOUR,
    PROFILE_CHANGE_USER_RATE_LIMIT_REQUESTS,
    handleChangePasswordUserRateLimit,
    getAuthenticatedUserKey
);

async function clearAccountIPRateLimit(req) {
    const key = getAccountIPRateLimitKey(req);
    await accountIPRateLimit.resetKey(key);
}

module.exports = {
    loginIPRateLimit,
    accountIPRateLimit,
    signupIPRateLimit,
    signupAvailabilityIPRateLimit,
    forgotPasswordIPRateLimit,
    resetPasswordIPRateLimit,
    changeEmailUserRateLimit,
    changePasswordUserRateLimit,
    clearAccountIPRateLimit
};
