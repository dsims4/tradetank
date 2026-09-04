/** Limits repeated sensitive requests from an IP address or user account. */
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
const { redirectWithQuery } = require("../utilities/redirects");

const ONE_HOUR = 1000 * 60 * 60;
const FIFTEEN_MINUTES = 1000 * 60 * 15;
const LOGIN_IP_RATE_LIMIT_REQUESTS = 32;
const SIGNUP_AVAILABILITY_IP_RATE_LIMIT_REQUESTS = 32;
const ACCOUNT_IP_RATE_LIMIT_REQUESTS = 8;
const SIGNUP_IP_RATE_LIMIT_REQUESTS = 8;
const FORGOT_PASSWORD_IP_RATE_LIMIT_REQUESTS = 8;
const RESET_PASSWORD_IP_RATE_LIMIT_REQUESTS = 8;
const PROFILE_CHANGE_USER_RATE_LIMIT_REQUESTS = 4;

/*
 * This function creates a request limiter with Trade Tank's shared settings.
 *
 * A limiter counts requests during a period and rejects requests beyond the
 * allowed amount. The default counter key is the visitor's IP address. Some
 * limits provide a different key so they can count by account as well.
 *
 * Returns the configured middleware function that performs the counting.
 */
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

/*
 * This function handles a login attempt rejected by a rate limiter.
 *
 * It shows Login again with a helpful message. A correctly formed username is
 * kept in the form, but malformed input is not copied back into the page.
 *
 * Returns the rendered HTML page with HTTP status 429, meaning too many requests.
 */
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

/*
 * This function combines the visitor's IP address and submitted username into
 * one counter key.
 *
 * This gives each IP-and-account pair its own request "bucket." It slows attacks
 * against one account while a separate IP-only limiter still limits the total
 * work caused by that visitor.
 *
 * Returns the string used to identify that limiter bucket.
 */
function getAccountIPRateLimitKey(req) {
    const username = getStringInput(req.body?.username).trim();
    return `${ipKeyGenerator(req.ip)}:${username}`;
}

/*
 * This function shows Signup again after too many account-creation attempts.
 *
 * Returns the rendered HTML page with HTTP status 429.
 */
function handleSignupIPRateLimit(req, res) {
    return res.status(429).render("signup.njk", {
        currentPage: "signup",
        errorMessage: getErrorMessage("signup-rate-limit"),
        successMessage: ""
    });
}

/*
 * This function rejects too many browser checks for whether a username or email
 * is available during signup.
 *
 * Returns a JSON error with HTTP status 429.
 */
function handleSignupAvailabilityIPRateLimit(req, res) {
    return res.status(429).json({
        error: "Too many signup availability requests have been made. " +
            "Try again later."
    });
}

/*
 * This function shows the forgot-password page after too many reset requests.
 *
 * Returns the rendered page with HTTP status 429. Its message does not reveal
 * whether the submitted email belongs to an account.
 */
function handleForgotPasswordIPRateLimit(req, res) {
    return res.status(429).render("forgot-password.njk", {
        currentPage: "forgot-password",
        errorMessage: getErrorMessage("forgot-password-rate-limit")
    });
}

/*
 * This function shows the reset-password page again after too many attempts.
 * It keeps only the reset token information needed to display a safe form.
 *
 * Returns the rendered HTML page with HTTP status 429.
 */
function handleResetPasswordIPRateLimit(req, res) {
    const token = getStringInput(req.body?.token).trim();

    return res.status(429).render("reset-password.njk", {
        currentPage: "reset-password",
        token,
        errorMessage: getErrorMessage("reset-password-rate-limit"),
        linkIsValid: isValidResetPasswordToken(token)
    });
}

/*
 * This function identifies a profile-change limiter by the logged-in user ID.
 *
 * Returns the user ID converted into the string required by the limiter.
 */
function getAuthenticatedUserKey(req) {
    return String(req.authenticatedUserID);
}

/*
 * This function handles an email change rejected by its rate limiter.
 *
 * Returns a Profile redirect containing a safely encoded error-message key.
 */
function handleChangeEmailUserRateLimit(req, res) {
    return redirectWithQuery(res, "/profile", {
        emailError: "change-email-rate-limit"
    });
}

/*
 * This function handles a password change rejected by its rate limiter.
 *
 * Returns a Profile redirect containing a safely encoded error-message key.
 */
function handleChangePasswordUserRateLimit(req, res) {
    return redirectWithQuery(res, "/profile", {
        passwordError: "change-password-rate-limit"
    });
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

/*
 * This function clears the failed-login count for the current IP address and
 * account after a successful login.
 *
 * Returns a Promise that finishes after the limiter's stored counter is reset.
 */
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
