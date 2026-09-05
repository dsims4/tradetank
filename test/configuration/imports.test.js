/*
 * Node's test function registers each named check and runs its callback.
 * Assertions compare actual results with expected values and throw if they differ.
 * strictEqual checks values without converting their types; deepStrictEqual also
 * compares the contents of arrays and objects. A passing assertion stays silent.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
/*
 * runIsolated starts a fresh Node process with only the settings supplied here.
 * Its callback cannot use variables from this file unless it defines them itself.
 * Network connections are blocked. status is the process exit code: zero means
 * success. Passing stderr to strictEqual shows the child error if that check fails.
 */
const { runIsolated } = require("../support/isolated-process");

/*
 * Configuration failures are tested in separate processes so cached imports cannot interfere.
 */
test("CSRF configuration requires an origin", () => {
    const result = runIsolated(() => require("./middleware/csrf"));
    // This child is supposed to fail. Check its exit code, then identify the intended error.
    assert.strictEqual(result.status, 1, result.stderr);
    assert.match(result.stderr, /APP_ORIGIN has not been initialized/);
});

/*
 * Supply text that cannot be parsed as an origin. Check both the failure exit code
 * and the error message so an unrelated import failure cannot satisfy this test.
 */
test("CSRF configuration rejects invalid origins", () => {
    // Give only this child the malformed setting; it cannot affect the next test.
    const result = runIsolated(() => require("./middleware/csrf"), { APP_ORIGIN: "not a url" });
    assert.strictEqual(result.status, 1, result.stderr);
    assert.match(result.stderr, /APP_ORIGIN is an invalid origin/);
});

/*
 * Supply a correctly formed HTTPS origin. A zero exit code means importing the
 * middleware completed without a configuration error.
 */
test("CSRF configuration accepts a valid origin", () => {
    const result = runIsolated(() => require("./middleware/csrf"), {
        // This example origin is configuration text; importing the middleware does not visit it.
        APP_ORIGIN: "https://tradetank.example"
    });
    assert.strictEqual(result.status, 0, result.stderr);
});

/*
 * Leave the database URL out of the child environment. Importing the service must
 * fail with the missing-setting message before any connection is attempted.
 */
test("database configuration requires its URL", () => {
    // No environment argument means no DATABASE_URL is supplied to the child.
    const result = runIsolated(() => require("./services/db"));
    assert.strictEqual(result.status, 1, result.stderr);
    assert.match(result.stderr, /DATABASE_URL is required/);
});

/*
 * Supply a placeholder URL and import the database service. Check that query is a
 * function, then close the unused pool. Any attempted network connection would fail.
 */
test("a configured database pool stays disconnected during import", () => {
    const result = runIsolated(async () => {
        const db = require("./services/db");
        assert.strictEqual(typeof db.query, "function");
        // Release the unused pool after checking the import; no query was needed.
        await db.closePool();
    }, { DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused" });
    assert.strictEqual(result.status, 0, result.stderr);
});

/*
 * Provide the database setting so it does not hide the missing session secret.
 * Check that the error specifically identifies the session configuration.
 */
test("session configuration requires a secret after database configuration", () => {
    const result = runIsolated(() => require("./services/session"), {
        // Satisfy database configuration first so the following failure is about the session
        // secret.
        DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused"
    });
    assert.strictEqual(result.status, 1, result.stderr);
    assert.match(result.stderr, /SESSION_SECRET environment variable is not initialized/);
});

/*
 * Provide only the placeholder settings needed to import sessions. Success here
 * proves initialization works; it does not prove database queries would succeed.
 */
test("session import succeeds with isolated settings and no connection", () => {
    const result = runIsolated(() => require("./services/session"), {
        DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
        // This deliberately public test value is supplied only to the isolated process.
        SESSION_SECRET: "unit-test-only-secret"
    });
    assert.strictEqual(result.status, 0, result.stderr);
});

/*
 * Import the email service without mail settings. Importing alone should succeed
 * because configuration is checked when a message is requested.
 */
test("email import is lazy and does not require SMTP settings", () => {
    // Require loads the module but does not call any of its email-sending functions.
    const result = runIsolated(() => require("./services/email"));
    assert.strictEqual(result.status, 0, result.stderr);
});
