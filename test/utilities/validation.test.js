/*
 * Node's test function registers each named check and runs its callback.
 * Assertions compare actual results with expected values and throw if they differ.
 * strictEqual checks values without converting their types; deepStrictEqual also
 * compares the contents of arrays and objects. A passing assertion stays silent.
 */

/*
 * A for...of loop runs the same check for each listed case. Each value exercises a
 * different input without copying the whole test. An assertion message, when given,
 * identifies the case that failed; it does not change the expected result.
 */
const test = require("node:test");

const assert = require("node:assert/strict");

const {
    getStringInput,
    isValidUsername,
    isValidEmail,
    isValidPassword,
    isValidResetPasswordToken
} = require("../../utilities/validation");

/*
 * Check that text is preserved and the function
 * converts non-string inputs to an empty string.
 */
test("getStringInput preserves strings and empties non-strings", () => {
    assert.strictEqual(getStringInput("tradetank"), "tradetank");
    assert.strictEqual(getStringInput(" tradetank "), " tradetank ");
    // Quotes make this a string; the unquoted number below should instead become empty text.
    assert.strictEqual(getStringInput("12345"), "12345");
    assert.strictEqual(getStringInput(12345), "");
});

/*
 * Check that usernames are accurately recognized
 * as containing between 1 and 32 characters, inclusive.
 */
test("isValidUsername enforces username length boundaries", () => {
    assert.strictEqual(isValidUsername("tradetank"), true);
    assert.strictEqual(isValidUsername("a"), true);
    // repeat(32) creates exactly 32 characters, right at the allowed upper limit.
    assert.strictEqual(isValidUsername("a".repeat(32)), true);
    // Check just outside both allowed limits: no characters, then 33 characters.
    assert.strictEqual(isValidUsername(""), false);
    assert.strictEqual(isValidUsername("a".repeat(33)), false);
});

/*
 * Check that emails are accurately recognized
 * as following the defined email format pattern, and
 * containing between 5 and 255 characters, inclusive.
 */
test("isValidEmail enforces email formatting and length boundaries", () => {
    assert.strictEqual(isValidEmail("a@a.a"), true);
    assert.strictEqual(isValidEmail("a".repeat(8)), false);
    assert.strictEqual(isValidEmail("tradetank@tradetank.tradetank"), true);
    // The suffix @a.a adds four characters, giving total lengths of 255 and 256.
    assert.strictEqual(isValidEmail("a".repeat(251) + "@a.a"), true);
    assert.strictEqual(isValidEmail("a".repeat(252) + "@a.a"), false);
    assert.strictEqual(isValidEmail(""), false);
    assert.strictEqual(isValidEmail("a@@a.a"), false);
    assert.strictEqual(isValidEmail("a@a a"), false);
});

/*
 * Check that passwords are accurately recognized
 * as containing between 1 and 128 characters, inclusive.
 */
test("isValidPassword enforces password length boundaries", () => {
    assert.strictEqual(isValidPassword("a"), true);
    // The exact maximum is accepted; the following empty and 129-character values are rejected.
    assert.strictEqual(isValidPassword("a".repeat(128)), true);
    assert.strictEqual(isValidPassword(""), false);
    assert.strictEqual(isValidPassword("a".repeat(129)), false);
});

/*
 * Check that reset password tokens are accurately recognized
 * as containing exactly 64 lowercase hexadecimal characters.
 */
test("isValidResetPasswordToken enforces reset password token format and length", () => {
    assert.strictEqual(isValidResetPasswordToken("0123456789abcdef"), false);
    assert.strictEqual(isValidResetPasswordToken("a".repeat(63)), false);
    assert.strictEqual(isValidResetPasswordToken("a".repeat(65)), false);
    // Correct length is not enough: uppercase letters and g violate lowercase hexadecimal format.
    assert.strictEqual(isValidResetPasswordToken("A".repeat(64)), false);
    assert.strictEqual(isValidResetPasswordToken("g".repeat(64)), false);
    // Repeating all sixteen hexadecimal characters four times makes one valid 64-character token.
    assert.strictEqual(isValidResetPasswordToken("0123456789abcdef".repeat(4)), true);
    assert.strictEqual(isValidResetPasswordToken("!".repeat(64)), false);
});

/*
 * Check every ordinary non-string input without coercing it into account text.
 */
test("getStringInput preserves empty text and rejects non-string types", () => {
    assert.strictEqual(getStringInput(""), "");
    // Include absent values, booleans, numbers, collections, and a Symbol to check type handling.
    for (const value of [undefined, null, false, true, 0, NaN, [], {}, Symbol("input")]) {
        assert.strictEqual(getStringInput(value), "");
    }
});

/*
 * Whitespace and Unicode must reach later account processing unchanged.
 */
test("string validation preserves whitespace and Unicode", () => {
    // Keep spaces and non-ASCII characters in the expected value to detect unwanted normalization.
    const input = "  café 東京  ";
    assert.strictEqual(getStringInput(input), input);
    assert.strictEqual(isValidUsername("東京"), true);
    assert.strictEqual(isValidPassword(input), true);
});

/*
 * Each malformed address isolates a missing component or forbidden whitespace.
 */
test("isValidEmail checks every required address component", () => {
    const invalidEmails = [
        "@a.a", "a@.a", "a@a.", "a@aa", "a.a", "a@a", " a@a.a", "a@a.a ",
        "a\t@a.a", "a@a.a\n", "a@a@a.a"
    ];
    for (const email of invalidEmails) {
        // JSON.stringify makes tabs and newlines visible in the failure message.
        assert.strictEqual(isValidEmail(email), false, JSON.stringify(email));
    }
    for (const email of ["first.last+tag@example.com", "user@sub.example.com"]) {
        assert.strictEqual(isValidEmail(email), true, email);
    }
});

/*
 * A token must occupy the entire string, with no extra spaces or newline.
 */
test("reset tokens reject empty strings and surrounding whitespace", () => {
    const token = "a".repeat(64);
    // Backticks insert the token into strings with unwanted spaces or a trailing newline.
    for (const value of ["", ` ${token}`, `${token} `, `${token}\n`]) {
        assert.strictEqual(isValidResetPasswordToken(value), false);
    }
});
