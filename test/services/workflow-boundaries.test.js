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
const environment = { DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused" };

/*
 * First-query failures must propagate without triggering provider downloads or returning data.
 */
test("market-data workflows stop at the first database query", () => {
    const result = runIsolated(async () => {
        const db = require("./services/db");
        const boundary = new Error("Workflow database boundary.");
        const calls = [];
        // Record the query arguments, then reject before returning any database data.
        db.query = async (sql, parameters) => { calls.push(parameters); throw boundary; };
        const sessions = require("./services/trading-sessions");
        const sync = require("./services/candlestick-sync");
        const charts = require("./services/chart-data");
        const date = "2026-09-01";
        // Store functions without calling them yet, so the loop can reset tracking before each one.
        const operations = [
            () => sessions.getOrResolveTradingSession(date),
            () => sessions.markTradingSessionCandlesticksSynced(date),
            () => sessions.delayTradingSessionCandlestickRetry(date),
            () => sessions.updateTradingSessionDataCondition(date, "available"),
            () => sync.getCandlesticksForTradingDate(date),
            () => sync.getLatestAvailableCandlesticks(new Date(`${date}T18:00:00Z`)),
            () => charts.getInputChartData(7, date),
            () => charts.getTradesChartData(7, date),
            () => charts.getLatestInputChartData(7, new Date(`${date}T18:00:00Z`))
        ];
        for (const operation of operations) {
            // Empty the same array so only this operation contributes to the following checks.
            calls.length = 0;
            await assert.rejects(operation(), (error) => error === boundary);
            assert.ok(calls.length > 0);
            // every requires every recorded query to include the requested date. The previous check
            // ensures there actually was a query, since every also returns true for an empty array.
            assert.ok(calls.every((parameters) => parameters.includes(date)));
        }
        // Start fresh before invalid inputs; these should be rejected without any query.
        calls.length = 0;
        await assert.rejects(
            sessions.updateTradingSessionDataCondition(date, "invalid"), TypeError
        );
        await assert.rejects(sessions.markTradingSessionCandlesticksSynced("invalid"), TypeError);
        assert.strictEqual(calls.length, 0);
    }, environment);
    assert.strictEqual(result.status, 0, result.stderr);
});
