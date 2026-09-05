const test = require("node:test");
const assert = require("node:assert/strict");
const { getErrorMessage, getSuccessMessage } = require("../../utilities/messages");

/* Related form fields share the same missing-input message. */
test("missing-field errors share one user-facing message", () => {
    for (const key of ["missing-fields", "email-missing-fields", "password-missing-fields"]) {
        assert.strictEqual(getErrorMessage(key), "Some fields are missing.");
    }
});

/* Every supported error key should resolve, without snapshotting all editorial wording. */
test("account errors have messages and do not resolve as successes", () => {
    const keys = [
        "invalid-credentials", "login-rate-limit", "password-mismatch", "username-taken",
        "email-taken", "email-mismatch", "email-same", "invalid-color-scheme",
        "invalid-confirmation", "invalid-username", "invalid-email", "invalid-password",
        "signup-rate-limit", "forgot-password-rate-limit", "reset-password-rate-limit",
        "change-email-rate-limit", "change-password-rate-limit"
    ];
    for (const key of keys) {
        assert.strictEqual(typeof getErrorMessage(key), "string");
        assert.notStrictEqual(getErrorMessage(key).trim(), "", key);
        assert.strictEqual(getSuccessMessage(key), "");
    }
    assert.strictEqual(getErrorMessage("invalid-credentials"), "Those credentials are invalid.");
});

/* Success keys have distinct meanings and must not appear as error messages. */
test("successful account operations resolve to their confirmation messages", () => {
    const cases = [
        ["reset-success", "Your password has been reset."],
        ["email-updated", "Your email address has been updated."],
        ["password-updated", "Your password has been updated."],
        ["account-deleted", "Your account has been deleted."]
    ];
    for (const [key, expected] of cases) {
        assert.strictEqual(getSuccessMessage(key), expected);
        assert.strictEqual(getErrorMessage(key), "");
    }
});

/* Unknown input must not become a message echoed back to the user. */
test("unknown message keys return empty text", () => {
    for (const key of [undefined, null, "", "unknown", "<script>", "toString", {}, 1]) {
        assert.strictEqual(getErrorMessage(key), "");
        assert.strictEqual(getSuccessMessage(key), "");
    }
});
