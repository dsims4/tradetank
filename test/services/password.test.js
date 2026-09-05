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

/*
 * await waits for a promise to finish. assert.rejects checks that it fails instead
 * of succeeding; an error predicate returning true identifies the expected failure.
 * Awaiting that assertion makes the test wait for its result as well.
 */
const test = require("node:test");

const assert = require("node:assert/strict");

const crypto = require("node:crypto");
const { hashPassword, verifyPassword } = require("../../services/password");

/*
 * Real local hashing must preserve valid passwords, including their exact whitespace.
 */
test("passwords round-trip through hashing without normalization", async () => {
    for (const password of ["a", "a".repeat(128), "  café 東京  "]) {
        const storedPassword = await hashPassword(password);
        // The pattern requires 32 lowercase hex characters, a colon, then 128 hex characters.
        // The ^ and $ anchors require the whole stored value to match that shape.
        assert.match(storedPassword, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
        assert.notStrictEqual(storedPassword, password);
        assert.strictEqual(await verifyPassword(password, storedPassword), true);
        // Changing even one character should make verification fail.
        assert.strictEqual(await verifyPassword(`${password}!`, storedPassword), false);
    }
});

/*
 * Different salts must yield different stored values for the same password.
 */
test("repeated passwords receive distinct usable salted hashes", async () => {
    const password = "test passphrase";
    const firstHash = await hashPassword(password);
    const secondHash = await hashPassword(password);
    // split separates salt from hash at the colon; [0] selects the salt for comparison.
    assert.notStrictEqual(firstHash.split(":")[0], secondHash.split(":")[0]);
    assert.notStrictEqual(firstHash, secondHash);
    assert.strictEqual(await verifyPassword(password, firstHash), true);
    assert.strictEqual(await verifyPassword(password, secondHash), true);
});

/*
 * Invalid stored representations should fail verification rather than crash comparison.
 */
test("malformed stored hashes do not verify", async () => {
    // Try missing separators, missing pieces, and invalid hash text without changing the password.
    for (const storedPassword of ["", "salt", ":", ":abcd", "salt:", "salt:zz", "salt:ab"]) {
        assert.strictEqual(await verifyPassword("password", storedPassword), false);
    }
});

/*
 * Inject only crypto failures; restore each replacement when its test finishes.
 */
test("hashPassword preserves random generation failure", async (context) => {
    const failure = new Error("Random generation failed.");
    // Replace this method only for this test; Node restores it when the test ends.
    context.mock.method(crypto, "randomBytes", () => { throw failure; });
    await assert.rejects(hashPassword("password"), (error) => error === failure);
});

/*
 * Make the hashing callback receive a known error. Check that hashPassword rejects
 * with that exact error rather than replacing it or reporting a successful hash.
 */
test("hashPassword preserves scrypt failure", async (context) => {
    const failure = new Error("Hashing failed.");
    // Replace this method only for this test; Node restores it when the test ends.
    // The replacement calls the usual callback with an error as its first argument.
    // It never runs the expensive hashing operation in this failure case.
    context.mock.method(crypto, "scrypt", (password, salt, size, callback) => callback(failure));
    await assert.rejects(hashPassword("password"), (error) => error === failure);
});

/*
 * Make password comparison encounter a hashing error. Check that this operational
 * failure remains a rejection rather than becoming an ordinary password mismatch.
 */
test("verifyPassword preserves scrypt failure", async (context) => {
    const failure = new Error("Verification failed.");
    // Replace this method only for this test; Node restores it when the test ends.
    context.mock.method(crypto, "scrypt", (password, salt, size, callback) => callback(failure));
    await assert.rejects(verifyPassword("password", "salt:ab"), (error) => error === failure);
});
