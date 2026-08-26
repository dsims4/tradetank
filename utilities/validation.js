const USERNAME_MAXIMUM_LENGTH = 32;
const EMAIL_MAXIMUM_LENGTH = 255;
const PASSWORD_MAXIMUM_LENGTH = 128;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_PASSWORD_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function getStringInput(value) {
    return typeof value === "string"
        ? value
        : "";
}

function isValidUsername(username) {
    return (
        username.length > 0 &&
        username.length <= USERNAME_MAXIMUM_LENGTH
    );
}

function isValidEmail(email) {
    return (
        email.length > 0 &&
        email.length <= EMAIL_MAXIMUM_LENGTH &&
        EMAIL_PATTERN.test(email)
    );
}

function isValidPassword(password) {
    return (
        password.length > 0 &&
        password.length <= PASSWORD_MAXIMUM_LENGTH
    );
}

function isValidResetPasswordToken(token) {
    return RESET_PASSWORD_TOKEN_PATTERN.test(token);
}

module.exports = {
    getStringInput,
    isValidUsername,
    isValidEmail,
    isValidPassword,
    isValidResetPasswordToken
};
