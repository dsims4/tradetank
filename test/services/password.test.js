const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { hashPassword, verifyPassword } = require("../../services/password");

/* Real local hashing must preserve valid passwords, including their exact whitespace. */
test("passwords round-trip through hashing without normalization", async () => {
    for (const password of ["a", "a".repeat(128), "  café 東京  "]) {
        const storedPassword = await hashPassword(password);
        assert.match(storedPassword, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
        assert.notStrictEqual(storedPassword, password);
        assert.strictEqual(await verifyPassword(password, storedPassword), true);
        assert.strictEqual(await verifyPassword(`${password}!`, storedPassword), false);
    }
});

/* Different salts must yield different stored values for the same password. */
test("repeated passwords receive distinct usable salted hashes", async () => {
    const password = "test passphrase";
    const firstHash = await hashPassword(password);
    const secondHash = await hashPassword(password);
    assert.notStrictEqual(firstHash.split(":")[0], secondHash.split(":")[0]);
    assert.notStrictEqual(firstHash, secondHash);
    assert.strictEqual(await verifyPassword(password, firstHash), true);
    assert.strictEqual(await verifyPassword(password, secondHash), true);
});

/* Invalid stored representations should fail verification rather than crash comparison. */
test("malformed stored hashes do not verify", async () => {
    for (const storedPassword of ["", "salt", ":", ":abcd", "salt:", "salt:zz", "salt:ab"]) {
        assert.strictEqual(await verifyPassword("password", storedPassword), false);
    }
});

/* Inject only crypto failures; restore each replacement when its test finishes. */
test("hashPassword preserves random generation failure", async (context) => {
    const failure = new Error("Random generation failed.");
    context.mock.method(crypto, "randomBytes", () => { throw failure; });
    await assert.rejects(hashPassword("password"), (error) => error === failure);
});

test("hashPassword preserves scrypt failure", async (context) => {
    const failure = new Error("Hashing failed.");
    context.mock.method(crypto, "scrypt", (password, salt, size, callback) => callback(failure));
    await assert.rejects(hashPassword("password"), (error) => error === failure);
});

test("verifyPassword preserves scrypt failure", async (context) => {
    const failure = new Error("Verification failed.");
    context.mock.method(crypto, "scrypt", (password, salt, size, callback) => callback(failure));
    await assert.rejects(verifyPassword("password", "salt:ab"), (error) => error === failure);
});
