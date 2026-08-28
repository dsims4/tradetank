function getErrorMessage(error) {
    return (error === "missing-fields")
        ? "Some fields are missing."
        : (error === "email-missing-fields")
        ? "Some fields are missing."
        : (error === "password-missing-fields")
        ? "Some fields are missing."
        : (error === "invalid-credentials")
        ? "Those credentials are invalid."
        : (error === "login-rate-limit")
        ? "The login attempt limit has been reached and must expire."
        : (error === "password-mismatch")
        ? "The passwords do not match."
        : (error === "username-taken")
        ? "That username is already taken."
        : (error === "email-taken")
        ? "That email is already in use."
        : (error === "email-mismatch")
        ? "Those email addresses do not match."
        : (error === "email-same")
        ? "That email address is already used by this account."
        : (error === "invalid-color-scheme")
        ? "That color scheme is invalid."
        : (error === "invalid-token")
        ? "The password reset token is invalid."
        : (error === "invalid-confirmation")
        ? "You must enter DELETE to confirm account deletion."
        : (error === "invalid-username")
        ? "Usernames must be at least 1 character, and less than 33 characters."
        : (error === "invalid-email")
        ? "Email addresses must have the correct format and be less than 256 characters."
        : (error === "invalid-password")
        ? "Passwords must be at least 1 character, and less than 129 characters."
        : (error === "signup-rate-limit")
        ? "Too many signup requests have been made. Try again later."
        : (error === "forgot-password-rate-limit")
        ? "Too many password reset requests have been made. Try again later."
        : (error === "reset-password-rate-limit")
        ? "Too many password reset attempts have been made. Try again later."
        : (error === "change-email-rate-limit")
        ? "Too many email change attempts have been made. Try again later."
        : (error === "change-password-rate-limit")
        ? "Too many password change attempts have been made. Try again later."
        : "";
}

function getSuccessMessage(success) {
    return (success === "reset-success")
        ? "Your password has been reset."
        : (success === "email-updated")
        ? "Your email address has been updated."
        : (success === "password-updated")
        ? "Your password has been updated."
        : (success === "password-reset")
        ? "Your password has been reset."
        : (success === "color-scheme-updated")
        ? "Your color scheme has been updated."
        : (success === "account-deleted")
        ? "Your account has been deleted."
        : "";
}

module.exports = {
    getErrorMessage,
    getSuccessMessage
};