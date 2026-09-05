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

/*
 * runIsolated starts a fresh Node process with only the settings supplied here.
 * Its callback cannot use variables from this file unless it defines them itself.
 * Network connections are blocked. status is the process exit code: zero means
 * success. Passing stderr to strictEqual shows the child error if that check fails.
 */
const { runIsolated } = require("../support/isolated-process");
const environment = {
    DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
    SESSION_SECRET: "unit-test-only-secret"
};

/*
 * Intercept the actual driver entry points before services capture their query dependencies.
 */
test("database queries and transaction acquisition stop at the driver boundary", () => {
    const result = runIsolated(async () => {
        const { Pool } = require("pg");
        const boundary = new Error("Database boundary reached.");
        let parameters;
        let acquisitions = 0;
        // ...args collects every argument into an array so we can compare SQL and values together.
        Pool.prototype.query = async (...args) => { parameters = args; throw boundary; };
        // Track requests for a client without opening one; throwing stops the transaction here.
        Pool.prototype.connect = async () => { acquisitions++; throw boundary; };
        const db = require("./services/db");
        await assert.rejects(db.query("SELECT $1", [42]), (error) => error === boundary);
        assert.deepStrictEqual(parameters, ["SELECT $1", [42]]);
        await assert.rejects(db.runTransaction(null), TypeError);
        assert.strictEqual(acquisitions, 0);
        // Track whether the transaction body runs. A failed client acquisition must prevent it.
        let ranOperation = false;
        await assert.rejects(db.runTransaction(() => { ranOperation = true; }),
            (error) => error === boundary);
        assert.strictEqual(acquisitions, 1);
        assert.strictEqual(ranOperation, false);
        await db.closePool();
    }, environment);
    assert.strictEqual(result.status, 0, result.stderr);
});

/*
 * Inspect valid calls at their first query and stop, without inventing database rows.
 */
test("service reads validate inputs and send correctly scoped query parameters", () => {
    const result = runIsolated(async () => {
        const db = require("./services/db");
        const boundary = new Error("Query boundary reached.");
        let calls = [];
        // Save each attempted query, then throw before returning any rows.
        // Install this before importing services that capture db.query when they load.
        db.query = async (sql, parameters) => { calls.push({ sql, parameters }); throw boundary; };
        const trades = require("./services/trades");
        const stats = require("./services/stats");
        const { getUserVisualization } = require("./services/visualizations");
        const { getCandlesticks } = require("./services/price-data");
        // Store callbacks so each invalid call happens inside assert.rejects in the loop.
        const invalidCalls = [
            () => trades.getUserTradePageForDate(0, "2026-09-01", 1),
            () => trades.getUserTradePageForDate(1, "2026-09-05", 1),
            () => trades.getUserTradePageForDate(1, "2026-09-01", 0),
            () => trades.hasUserTradingDay(-1, "2026-09-01"),
            () => trades.getLatestUserTradingDate(NaN),
            () => stats.getUserStats(0),
            () => getUserVisualization(1, "unknown", "cumulativePoints"),
            () => getUserVisualization(1, "time", "cumulativePoints", "2026-09-02", "2026-09-01")
        ];
        for (const operation of invalidCalls) await assert.rejects(operation(), TypeError);
        // Validation should reject all these inputs before trying to read data.
        assert.strictEqual(calls.length, 0);
        await assert.rejects(trades.getUserTradePageForDate(7, "2026-09-01", 2),
            (error) => error === boundary);
        // Page two skips five rows and requests six to detect whether another page exists.
        assert.deepStrictEqual(calls.pop().parameters, [7, "2026-09-01", 6, 5]);
        const cases = [
            [() => trades.hasUserTradingDay(7, "2026-09-01"), [7, "2026-09-01"]],
            [() => trades.getLatestUserTradingDate(7), [7]],
            [() => stats.getUserStats(7), [7]],
            [() => getUserVisualization(7, "time", "cumulativePoints"), [7, null, null]]
        ];
        for (const [operation, expected] of cases) {
            await assert.rejects(operation(), (error) => error === boundary);
            // pop removes the most recent recorded call; compare its parameters with this case.
            assert.deepStrictEqual(calls.pop().parameters, expected);
        }
        const start = new Date("2026-09-01T13:30:00Z");
        const end = new Date("2026-09-01T20:15:00Z");
        await assert.rejects(getCandlesticks(start, end), (error) => error === boundary);
        assert.deepStrictEqual(calls.pop().parameters, [start, end]);
    }, environment);
    assert.strictEqual(result.status, 0, result.stderr);
});

/*
 * Replace querying with an immediate test failure. Exercise missing and malformed
 * cookies, a cached user ID, and cookie clearing in both environment modes.
 */
test("session cookies and missing tokens do not require database access", () => {
    for (const mode of ["test", "production"]) {
        const result = runIsolated(async () => {
            const db = require("./services/db");
            db.query = () => assert.fail("A malformed or cached session must not query.");
            const session = require("./services/session");
            // %ZZ is invalid URL encoding, while bad is a malformed token after decoding.
            const cookies = [undefined, "", "tradetank-session=%ZZ", "tradetank-session=bad"];
            for (const cookie of cookies) {
                const request = { headers: { cookie } };
                assert.strictEqual(await session.getSessionUserID(request), null);
                assert.strictEqual(request.authenticatedUserID, null);
                assert.strictEqual(await session.invalidateSession(request), false);
            }
            assert.strictEqual(await session.getSessionUserID({ authenticatedUserID: 7 }), 7);
            // Save the Set-Cookie header locally so its security and expiry attributes can be
            // inspected.
            let header;
            session.clearSessionCookie({ setHeader(name, value) {
                assert.strictEqual(name, "Set-Cookie"); header = value;
            } });
            for (const flag of ["HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=0"]) {
                assert.ok(header.includes(flag));
            }
            // Secure should appear only in production, where cookies require HTTPS.
            assert.strictEqual(header.includes("Secure"), process.env.NODE_ENV === "production");
        }, { ...environment, NODE_ENV: mode });
        assert.strictEqual(result.status, 0, result.stderr);
    }
});

/*
 * Freeze the clock so expiry calculations have an exact expected value. Capture
 * the storage arguments for ordinary and remembered sessions, then reject storage.
 * Check that a failed save never gives the browser a session cookie.
 */
test("session creation reaches storage with a hashed token and correct duration", () => {
    const result = runIsolated(async () => {
        const db = require("./services/db");
        const boundary = new Error("Session storage reached.");
        let parameters;
        db.query = async (sql, values) => { parameters = values; throw boundary; };
        const { setSessionCookie } = require("./services/session");
        // Use a fixed clock so expected expiry never depends on when the test is run.
        Date.now = () => Date.parse("2026-09-01T00:00:00Z");
        // Each pair links the remember-me choice to its intended lifetime in days.
        for (const [remember, days] of [[false, 1], [true, 30]]) {
            const response = { setHeader() { assert.fail("No cookie after storage failure."); } };
            await assert.rejects(setSessionCookie(response, 7, remember),
                (error) => error === boundary);
            assert.strictEqual(parameters[0], 7);
            // The stored token must be 64 lowercase hexadecimal characters, representing its hash.
            assert.match(parameters[1], /^[a-f0-9]{64}$/);
            // There are 86,400,000 milliseconds in a day; add the lifetime and format as UTC text.
            assert.strictEqual(parameters[2], new Date(Date.now() + days * 86400000).toISOString());
        }
    }, environment);
    assert.strictEqual(result.status, 0, result.stderr);
});
