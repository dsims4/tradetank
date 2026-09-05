const test = require("node:test");
const assert = require("node:assert/strict");
const { redirectWithQuery } = require("../../utilities/redirects");

/* A small response recorder checks the address and return value without running Express. */
test("redirects encode parameters and return the redirect result", () => {
    const calls = [];
    const responseResult = { redirected: true };
    const response = {
        redirect(address) {
            calls.push(address);
            return responseResult;
        }
    };
    const result = redirectWithQuery(response, "/login", {
        error: "invalid-credentials", username: "a & b=1#東京"
    });
    assert.strictEqual(result, responseResult);
    assert.strictEqual(calls.length, 1);
    const address = new URL(calls[0], "https://example.test");
    assert.strictEqual(address.pathname, "/login");
    assert.strictEqual(address.hash, "");
    assert.deepStrictEqual([...address.searchParams], [
        ["error", "invalid-credentials"], ["username", "a & b=1#東京"]
    ]);
});

/* Reserved URL characters in a value cannot create a new parameter or fragment. */
test("redirects preserve token values and empty parameter values", () => {
    let destination;
    const response = { redirect(address) { destination = address; } };
    const token = "a+b/c?next=https://other.test&role=admin#fragment%";
    redirectWithQuery(response, "/reset-password", { token, error: "" });
    const address = new URL(destination, "https://example.test");
    assert.strictEqual(address.origin, "https://example.test");
    assert.strictEqual(address.pathname, "/reset-password");
    assert.strictEqual(address.hash, "");
    assert.deepStrictEqual([...address.searchParams], [["token", token], ["error", ""]]);
});
