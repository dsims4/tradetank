/*
 * Node's test function registers each named check and runs its callback.
 * Assertions compare actual results with expected values and throw if they differ.
 * strictEqual checks values without converting their types; deepStrictEqual also
 * compares the contents of arrays and objects. A passing assertion stays silent.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { redirectWithQuery } = require("../../utilities/redirects");

/*
 * A small response recorder checks the address and return value without running Express.
 */
test("redirects encode parameters and return the redirect result", () => {
    const calls = [];
    // Use an object so we can check that the helper returns this very same object.
    const responseResult = { redirected: true };
    const response = {
        redirect(address) {
            // Save the requested destination instead of redirecting a real browser.
            calls.push(address);
            return responseResult;
        }
    };
    const result = redirectWithQuery(response, "/login", {
        error: "invalid-credentials", username: "a & b=1#東京"
    });
    assert.strictEqual(result, responseResult);
    assert.strictEqual(calls.length, 1);
    // The base URL lets us parse a relative path locally; constructing a URL sends nothing.
    const address = new URL(calls[0], "https://example.test");
    assert.strictEqual(address.pathname, "/login");
    assert.strictEqual(address.hash, "");
    // Spread the parsed parameters into an array of pairs for an exact comparison.
    // Special characters must stay inside values, not create extra parameters or a fragment.
    assert.deepStrictEqual([...address.searchParams], [
        ["error", "invalid-credentials"], ["username", "a & b=1#東京"]
    ]);
});

/*
 * Reserved URL characters in a value cannot create a new parameter or fragment.
 */
test("redirects preserve token values and empty parameter values", () => {
    let destination;
    const response = { redirect(address) { destination = address; } };
    // Include URL control characters deliberately to check that they are encoded as token text.
    const token = "a+b/c?next=https://other.test&role=admin#fragment%";
    redirectWithQuery(response, "/reset-password", { token, error: "" });
    const address = new URL(destination, "https://example.test");
    assert.strictEqual(address.origin, "https://example.test");
    assert.strictEqual(address.pathname, "/reset-password");
    assert.strictEqual(address.hash, "");
    assert.deepStrictEqual([...address.searchParams], [["token", token], ["error", ""]]);
});
