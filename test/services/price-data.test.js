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
const environment = { DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused" };

/*
 * Hand-calculated candles distinguish every OHLC field and cross a bucket boundary.
 */
test("five-minute aggregation calculates OHLC and leaves source candles unchanged", () => {
    const result = runIsolated(() => {
        const { aggregateFiveMinuteCandlesticks } = require("./services/price-data");
        const candles = [
            [100, 104, 99, 102], [102, 105, 101, 104], [104, 106, 100, 101],
            [101, 103, 98, 100], [100, 102, 99, 101], [101, 104, 100, 103]
        // map converts each four-number row into a candle object, using index to advance its
        // minute.
        ].map(([openPrice, highPrice, lowPrice, closePrice], index) => ({
            openTime: new Date(Date.parse("2026-09-01T13:30:00Z") + index * 60000),
            openPrice, highPrice, lowPrice, closePrice
        }));
        // Keep an independent copy to detect accidental changes to the input candles.
        const original = structuredClone(candles);
        // The first five candles share an interval; the sixth starts the next interval.
        // Open and close come from the first and last candles, high and low from extremes.
        assert.deepStrictEqual(aggregateFiveMinuteCandlesticks(candles), [
            { openTime: "2026-09-01T13:30:00.000Z", openPrice: 100,
                highPrice: 106, lowPrice: 98, closePrice: 101 },
            { openTime: "2026-09-01T13:35:00.000Z", openPrice: 101,
                highPrice: 104, lowPrice: 100, closePrice: 103 }
        ]);
        assert.deepStrictEqual(candles, original);
        assert.deepStrictEqual(aggregateFiveMinuteCandlesticks([]), []);
        // These values are not arrays, so the function must reject the input type.
        for (const invalid of [null, {}, "candles"]) {
            assert.throws(() => aggregateFiveMinuteCandlesticks(invalid), TypeError);
        }
        // Use one valid candle as a baseline for duplicate times and individual field failures.
        const candle = candles[0];
        for (const invalid of [
            [candle, candle], [candles[1], candle], [null],
            [{ ...candle, highPrice: 98 }], [{ ...candle, lowPrice: 105 }],
            [{ ...candle, closePrice: NaN }], [{ ...candle, openPrice: "100" }],
            [{ ...candle, openTime: "invalid" }]
        ]) {
            assert.throws(() => aggregateFiveMinuteCandlesticks(invalid), TypeError);
        }
    }, environment);
    assert.strictEqual(result.status, 0, result.stderr);
});

/*
 * Every expected minute must exist, even at the beginning/end or in a shortened session.
 */
test("range validation requires a complete ordered session", () => {
    const result = runIsolated(() => {
        // The colon gives the imported function a shorter local name; it is still the real
        // function.
        const { areCandlesticksValidForRange: valid } = require("./services/price-data");
        const start = new Date("2026-09-01T13:30:00Z");
        for (const count of [1, 5, 225, 405]) {
            // 60,000 milliseconds is one minute. The end time itself is excluded.
            const end = new Date(start.getTime() + count * 60000);
            // Create one candle per minute. _ ignores the unused array value; index supplies its
            // position.
            const candles = Array.from({ length: count }, (_, index) => ({
                openTime: new Date(start.getTime() + index * 60000),
                openPrice: 100, highPrice: 101, lowPrice: 99, closePrice: 100
            }));
            assert.strictEqual(valid(candles, start, end), true);
            // Select the first, middle, and last positions. Set removes duplicates for very short
            // ranges.
            for (const index of new Set([0, Math.floor(count / 2), count - 1])) {
                // filter creates a shortened array by keeping every candle except the selected
                // position.
                assert.strictEqual(valid(candles.filter((_, i) => i !== index), start, end), false);
                const sparse = candles.slice();
                // Deleting leaves an empty slot without shortening the array.
                delete sparse[index];
                assert.strictEqual(valid(sparse, start, end), false);
            }
            // Replace only the first candle with an invalid value while keeping the rest complete.
            for (const replacement of [
                null, { ...candles[0], openTime: end },
                { ...candles[0], openTime: new Date(start.getTime() + 1) },
                { ...candles[0], openTime: new Date(start.getTime() - 60000) },
                { ...candles[0], highPrice: 98 }, { ...candles[0], lowPrice: 102 },
                { ...candles[0], openPrice: Infinity },
                { ...candles[0], openTime: start.toISOString() }
            ]) {
                assert.strictEqual(valid([replacement, ...candles.slice(1)], start, end), false);
            }
            assert.strictEqual(valid([...candles, candles[0]], start, end), false);
            // A one-candle array cannot be out of order; only test reversal when there are several.
            if (count > 1) {
                assert.strictEqual(valid(candles.toReversed(), start, end), false);
                assert.strictEqual(valid([candles[1], ...candles.slice(1)], start, end), false);
            }
            // The starting boundary must be a valid minute-aligned Date strictly before the end.
            for (const boundary of [null, new Date(NaN), new Date(start.getTime() + 1), end]) {
                assert.strictEqual(valid(candles, boundary, end), false);
            }
        }
        for (const value of [[], null, {}, "candles"]) {
            assert.strictEqual(valid(value, start, new Date(start.getTime() + 60000)), false);
        }
    }, environment);
    assert.strictEqual(result.status, 0, result.stderr);
});
