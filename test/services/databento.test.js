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

const {
    isValidDatabentoCondition,
    getScheduledDatabentoStatuses
} = require("../../services/databento");

/*
 * These tests use only exported pure helpers; no provider request is made.
 */
test("data conditions accept only the four supported names", () => {
    for (const condition of ["available", "degraded", "pending", "missing"]) {
        assert.strictEqual(isValidDatabentoCondition(condition), true);
    }
    for (const condition of ["AVAILABLE", "normal", "", " available ", null, undefined, 1, {}]) {
        assert.strictEqual(isValidDatabentoCondition(condition), false);
    }
});

/*
 * Return a fresh scheduled status; overrides allow one field to be varied per case.
 */
function createStatus(overrides = {}) {
    return {
        eventTime: new Date("2026-09-01T13:30:00Z"),
        reason: 1,
        tradingEvent: 0,
        isTrading: "Y",
        // Apply replacements last, so a supplied field wins over the valid default above.
        ...overrides
    };
}

/*
 * Relevant records are sorted and deduplicated without changing source records or order.
 */
test("scheduled statuses are sorted and deduplicated without mutating input", () => {
    const opening = createStatus();
    const closing = createStatus({
        eventTime: new Date("2026-09-01T20:15:00Z"),
        isTrading: "N"
    });
    // Put the closing record first and include a duplicate opening to exercise both rules.
    const statuses = [closing, opening, createStatus()];
    // Clone the records as well as the array so changing nested values would be detected.
    const original = structuredClone(statuses);
    assert.deepStrictEqual(getScheduledDatabentoStatuses(statuses), [opening, closing]);
    assert.deepStrictEqual(statuses, original);
});

/*
 * Each case changes one eligibility condition while retaining the other valid fields.
 */
test("scheduled statuses exclude irrelevant or malformed records", () => {
    const opening = createStatus();
    // NaN makes an invalid Date; a date-looking string is still not a Date object.
    const invalidStatuses = [
        null, undefined, {},
        createStatus({ eventTime: new Date(NaN) }),
        createStatus({ eventTime: "2026-09-01T13:30:00Z" }),
        createStatus({ reason: 2 }),
        createStatus({ reason: "1" }),
        createStatus({ tradingEvent: 1 }),
        createStatus({ tradingEvent: "0" }),
        createStatus({ isTrading: "y" }),
        createStatus({ isTrading: true })
    ];
    // Pair each bad record with a good one: filtering must remove only the bad record.
    for (const invalidStatus of invalidStatuses) {
        assert.deepStrictEqual(
            getScheduledDatabentoStatuses([invalidStatus, opening]),
            [opening]
        );
    }
});

/*
 * Opposite flags at the same instant remain distinct; interpretation is a separate operation.
 */
test("opposite status flags at one time are not collapsed", () => {
    const opening = createStatus();
    // Keep the timestamp identical but change the trading flag; this is not a duplicate.
    const closing = createStatus({ isTrading: "N" });
    assert.deepStrictEqual(
        getScheduledDatabentoStatuses([opening, closing, createStatus()]),
        [opening, closing]
    );
});

/*
 * Pass no records, then pass a record that is not scheduled. Both results should
 * be empty arrays rather than invented status records.
 */
test("empty or wholly irrelevant status arrays produce no scheduled records", () => {
    assert.deepStrictEqual(getScheduledDatabentoStatuses([]), []);
    assert.deepStrictEqual(getScheduledDatabentoStatuses([null, {}]), []);
});

/*
 * Pass values that cannot be treated as a list of status records. Each call must
 * throw a TypeError immediately.
 */
test("scheduled status filtering rejects non-array input", () => {
    for (const value of [null, undefined, {}, "statuses", 0, false]) {
        assert.throws(() => getScheduledDatabentoStatuses(value), TypeError);
    }
});
