const test = require("node:test");
const assert = require("node:assert/strict");
const {
    isValidDatabentoCondition,
    getScheduledDatabentoStatuses
} = require("../../services/databento");

/* These tests use only exported pure helpers; no provider request is made. */
test("data conditions accept only the four supported names", () => {
    for (const condition of ["available", "degraded", "pending", "missing"]) {
        assert.strictEqual(isValidDatabentoCondition(condition), true);
    }
    for (const condition of ["AVAILABLE", "normal", "", " available ", null, undefined, 1, {}]) {
        assert.strictEqual(isValidDatabentoCondition(condition), false);
    }
});

/* Return a fresh scheduled status; overrides allow one field to be varied per case. */
function createStatus(overrides = {}) {
    return {
        eventTime: new Date("2026-09-01T13:30:00Z"),
        reason: 1,
        tradingEvent: 0,
        isTrading: "Y",
        ...overrides
    };
}

/* Relevant records are sorted and deduplicated without changing source records or order. */
test("scheduled statuses are sorted and deduplicated without mutating input", () => {
    const opening = createStatus();
    const closing = createStatus({
        eventTime: new Date("2026-09-01T20:15:00Z"),
        isTrading: "N"
    });
    const statuses = [closing, opening, createStatus()];
    const original = structuredClone(statuses);
    assert.deepStrictEqual(getScheduledDatabentoStatuses(statuses), [opening, closing]);
    assert.deepStrictEqual(statuses, original);
});

/* Each case changes one eligibility condition while retaining the other valid fields. */
test("scheduled statuses exclude irrelevant or malformed records", () => {
    const opening = createStatus();
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
    for (const invalidStatus of invalidStatuses) {
        assert.deepStrictEqual(
            getScheduledDatabentoStatuses([invalidStatus, opening]),
            [opening]
        );
    }
});

/* Opposite flags at the same instant remain distinct; interpretation is a separate operation. */
test("opposite status flags at one time are not collapsed", () => {
    const opening = createStatus();
    const closing = createStatus({ isTrading: "N" });
    assert.deepStrictEqual(
        getScheduledDatabentoStatuses([opening, closing, createStatus()]),
        [opening, closing]
    );
});

test("empty or wholly irrelevant status arrays produce no scheduled records", () => {
    assert.deepStrictEqual(getScheduledDatabentoStatuses([]), []);
    assert.deepStrictEqual(getScheduledDatabentoStatuses([null, {}]), []);
});

test("scheduled status filtering rejects non-array input", () => {
    for (const value of [null, undefined, {}, "statuses", 0, false]) {
        assert.throws(() => getScheduledDatabentoStatuses(value), TypeError);
    }
});
