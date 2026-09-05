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
 * Validate submitted orders with real service code, stopping before acquiring a database client.
 */
test("trade validation rejects invalid drafts before reaching the transaction boundary", () => {
    const result = runIsolated(async () => {
        const { Pool } = require("pg");
        const boundary = new Error("Transaction boundary reached.");
        let acquisitions = 0;
        // Replace client acquisition before importing trades. Count attempts and stop each one.
        Pool.prototype.connect = async () => { acquisitions++; throw boundary; };
        const { saveUserTradingDay, deleteUserTradingDay } = require("./services/trades");
        // Build a valid minute of prices and a balanced trade as the starting point for each case.
        const candle = {
            openTime: "2026-09-01T13:30:00.000Z",
            openPrice: 100, highPrice: 105, lowPrice: 99, closePrice: 101
        };
        const order = { time: candle.openTime, price: 100, contractCount: 1 };
        const trade = {
            side: "long", processDeviation: false, notes: "valid notes",
            orderEvents: { buySide: [order], sellSide: [{ ...order, price: 101 }] }
        };
        // Spread syntax copies the valid trade, then the named field replaces one value.
        // Changing one field helps show which validation rule is being exercised.
        const invalidTrades = [
            [], null, [null], [{ ...trade, side: "invalid" }],
            [{ ...trade, notes: "a".repeat(1501) }], [{ ...trade, notes: {} }],
            [{ ...trade, processDeviation: "false" }],
            [{ ...trade, orderEvents: { buySide: [], sellSide: [order] } }]
        ];
        for (const drafts of invalidTrades) {
            await assert.rejects(saveUserTradingDay(1, "2026-09-01", drafts, [candle]), TypeError);
        }
        // Try invalid prices, sizes, and times. A size of two also makes buys and sells unequal.
        for (const overrides of [
            { price: 100.1 }, { price: 106 }, { price: 98 }, { price: NaN },
            { price: 0 }, { contractCount: 0 }, { contractCount: 1.5 },
            { contractCount: 2 }, { time: "invalid" }, { time: "2026-09-01T13:31:00Z" }
        ]) {
            // Copy the nested order collection too, so the original valid trade stays usable.
            const invalid = { ...trade, orderEvents: {
                buySide: [{ ...order, ...overrides }], sellSide: trade.orderEvents.sellSide
            } };
            await assert.rejects(
                saveUserTradingDay(1, "2026-09-01", [invalid], [candle]), TypeError
            );
        }
        // Every invalid submission must fail before asking the database for a client.
        assert.strictEqual(acquisitions, 0);
        // Keep a separate copy before submitting the valid trade to detect input mutation.
        const original = structuredClone(trade);
        // The valid input should get past validation and reach our deliberate connection error.
        await assert.rejects(saveUserTradingDay(1, "2026-09-01", [trade], [candle]),
            (error) => error === boundary);
        assert.deepStrictEqual(trade, original);
        assert.strictEqual(acquisitions, 1);
        // An invalid user ID must leave the counter unchanged; a valid deletion reaches it once.
        await assert.rejects(deleteUserTradingDay(0, "2026-09-01"), TypeError);
        assert.strictEqual(acquisitions, 1);
        await assert.rejects(deleteUserTradingDay(1, "2026-09-01"),
            (error) => error === boundary);
        assert.strictEqual(acquisitions, 2);
    }, environment);
    assert.strictEqual(result.status, 0, result.stderr);
});
