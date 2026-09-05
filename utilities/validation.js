/** Performs basic shared checks on account-form input. */
const USERNAME_MAXIMUM_LENGTH = 32;
const EMAIL_MAXIMUM_LENGTH = 255;
const PASSWORD_MAXIMUM_LENGTH = 128;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_PASSWORD_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

/*
 * This function accepts a value from an untrusted request and makes sure it is text.
 *
 * Returns the original value when it is a string.
 * Returns an empty string for every other type of value.
 */
function getStringInput(value) {
    return typeof value === "string"
        ? value
        : "";
}

/*
 * This function checks whether a username has an allowed length.
 *
 * Returns true for 1 through 32 characters. Returns false otherwise.
 */
function isValidUsername(username) {
    return (
        username.length > 0 &&
        username.length <= USERNAME_MAXIMUM_LENGTH
    );
}

/*
 * This function checks an email's length and basic address shape.
 *
 * This cannot prove that the mailbox exists or belongs to the user. It only
 * rejects text that clearly is not an email address.
 *
 * Returns true when both checks pass. Returns false otherwise.
 */
function isValidEmail(email) {
    return (
        email.length > 4 &&
        email.length <= EMAIL_MAXIMUM_LENGTH &&
        EMAIL_PATTERN.test(email)
    );
}

/*
 * This function checks whether a password has an allowed length.
 *
 * It does not require particular symbols, digits, or capital letters. Secure
 * hashing protects storage, while users remain free to use long passphrases.
 *
 * Returns true for 1 through 128 characters. Returns false otherwise.
 */
function isValidPassword(password) {
    return (
        password.length > 0 &&
        password.length <= PASSWORD_MAXIMUM_LENGTH
    );
}

/*
 * This function checks the basic format of a password-reset token.
 *
 * Returns true only for exactly 64 lowercase hexadecimal characters.
 * Hexadecimal characters are the digits 0-9 and letters a-f.
 */
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
