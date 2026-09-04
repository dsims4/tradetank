const MISSING_FIELDS_MESSAGE = "Some fields are missing.";

const ERROR_MESSAGES = new Map([
    ["missing-fields", MISSING_FIELDS_MESSAGE],
    ["email-missing-fields", MISSING_FIELDS_MESSAGE],
    ["password-missing-fields", MISSING_FIELDS_MESSAGE],
    ["invalid-credentials", "Those credentials are invalid."],
    [
        "login-rate-limit",
        "The login attempt limit has been reached and must expire."
    ],
    ["password-mismatch", "The passwords do not match."],
    ["username-taken", "That username is already taken."],
    ["email-taken", "That email is already in use."],
    ["email-mismatch", "Those email addresses do not match."],
    ["email-same", "That email address is already used by this account."],
    ["invalid-color-scheme", "That color scheme is invalid."],
    [
        "invalid-confirmation",
        "You must enter DELETE to confirm account deletion."
    ],
    [
        "invalid-username",
        "Usernames must be at least 1 character, and less than 33 characters."
    ],
    [
        "invalid-email",
        "Email addresses must have the correct format and be less than 256 characters."
    ],
    [
        "invalid-password",
        "Passwords must be at least 1 character, and less than 129 characters."
    ],
    [
        "signup-rate-limit",
        "Too many signup requests have been made. Try again later."
    ],
    [
        "forgot-password-rate-limit",
        "Too many password reset requests have been made. Try again later."
    ],
    [
        "reset-password-rate-limit",
        "Too many password reset attempts have been made. Try again later."
    ],
    [
        "change-email-rate-limit",
        "Too many email change attempts have been made. Try again later."
    ],
    [
        "change-password-rate-limit",
        "Too many password change attempts have been made. Try again later."
    ]
]);

const SUCCESS_MESSAGES = new Map([
    ["reset-success", "Your password has been reset."],
    ["email-updated", "Your email address has been updated."],
    ["password-updated", "Your password has been updated."],
    ["account-deleted", "Your account has been deleted."]
]);

function getErrorMessage(error) {
    return ERROR_MESSAGES.get(error) || "";
}

function getSuccessMessage(success) {
    return SUCCESS_MESSAGES.get(success) || "";
}

module.exports = {
    getErrorMessage,
    getSuccessMessage
};
