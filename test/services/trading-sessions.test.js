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
 * assert.throws receives a function so it can catch the error when that function runs.
 * The expected error type prevents an unrelated kind of failure from passing.
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
 * The URL satisfies import validation; the child forbids actual network connections.
 */
const environment = { DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused" };

/*
 * Compare real weekdays with a table of malformed dates and unsupported types.
 * The result must be a boolean, with invalid calendar values rejected.
 */
test("trading dates accept real weekdays and reject malformed calendar values", () => {
    const result = runIsolated(() => {
        const { isValidTradingDate } = require("./services/trading-sessions");
        // Include a leap-year February date alongside ordinary weekdays.
        for (const value of ["2026-09-01", "2024-02-29", "2026-12-31"]) {
            assert.strictEqual(isValidTradingDate(value), true);
        }
        // Exercise weekends, impossible dates, wrong formatting, and values that are not strings.
        for (const value of [
            "2026-09-05", "2026-09-06", "2026-02-29", "2026-04-31", "2026-13-01",
            "2026-00-01", "2026-09-00", "2026-9-1", "09-01-2026", "", null, undefined,
            20260901, {}, [], new Date()
        ]) {
            assert.strictEqual(isValidTradingDate(value), false);
        }
    }, environment);
    assert.strictEqual(result.status, 0, result.stderr);
});

/*
 * Choose UTC times immediately around New York midnight in both seasons. Compare
 * the returned date strings to fixed expectations, including the year change.
 */
test("New York dates honor summer and winter midnight boundaries", () => {
    const result = runIsolated(() => {
        const { getNewYorkDate } = require("./services/trading-sessions");
        // Z means UTC. New York midnight occurs at 04:00 UTC in summer and 05:00 in winter.
        const cases = [
            ["2026-09-01T03:59:59.999Z", "2026-08-31"],
            ["2026-09-01T04:00:00Z", "2026-09-01"],
            ["2026-01-01T04:59:59.999Z", "2025-12-31"],
            ["2026-01-01T05:00:00Z", "2026-01-01"]
        ];
        // Turn the input string into a Date, then compare the function result with the paired date.
        for (const [time, expected] of cases) {
            assert.strictEqual(getNewYorkDate(new Date(time)), expected);
        }
        // Reject an invalid Date and other types even if their text resembles a calendar date.
        for (const value of [new Date(NaN), null, "2026-09-01", 0]) {
            assert.throws(() => getNewYorkDate(value), TypeError);
        }
    }, environment);
    assert.strictEqual(result.status, 0, result.stderr);
});
