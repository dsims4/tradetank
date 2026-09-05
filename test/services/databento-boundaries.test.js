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

/*
 * A configured request is captured at fetch and rejected before any response is produced.
 */
test("Databento requests stop at fetch with the correct schemas and dates", () => {
    const result = runIsolated(async () => {
        const boundary = new Error("HTTP boundary reached.");
        let request;
        // Replace the network request with a recorder that throws our recognizable error.
        globalThis.fetch = async (url, options) => { request = { url, options }; throw boundary; };
        const data = require("./services/databento");
        const start = new Date("2026-09-01T13:30:00Z");
        const end = new Date("2026-09-01T20:15:00Z");
        for (const [operation, schema] of [
            [data.fetchDatabentoCandlesticks, "ohlcv-1m"], [data.fetchDatabentoStatuses, "status"]
        ]) {
            await assert.rejects(operation(start, end), (error) => error === boundary);
            assert.strictEqual(request.options.method, "POST");
            // Read the prepared form fields to check what would have been sent to the provider.
            assert.strictEqual(request.options.body.get("schema"), schema);
            assert.strictEqual(request.options.body.get("start"), start.toISOString());
            assert.strictEqual(request.options.body.get("end"), end.toISOString());
            assert.strictEqual(request.options.body.get("symbols"), "ES.v.0");
            assert.strictEqual(request.options.body.get("dataset"), "GLBX.MDP3");
            // Basic authentication encodes the test key and a colon as base64; this is not
            // encryption.
            assert.strictEqual(request.options.headers.Authorization,
                `Basic ${Buffer.from("unit-test-key:").toString("base64")}`);
            // Check that the request carries a cancellation signal, without starting a request.
            assert.ok(request.options.signal instanceof AbortSignal);
        }
        await assert.rejects(data.fetchDatabentoCondition("2026-09-01"),
            (error) => error === boundary);
        // Parse the captured URL locally so its query parameters can be checked individually.
        const address = new URL(request.url);
        assert.strictEqual(address.searchParams.get("start_date"), "2026-09-01");
        assert.strictEqual(address.searchParams.get("end_date"), "2026-09-01");
        await assert.rejects(data.isDatabentoRangeAvailable("status", start, end),
            (error) => error === boundary);
        assert.match(request.url, /metadata.get_dataset_range/);
    }, { DATABENTO_API_KEY: "unit-test-key" });
    assert.strictEqual(result.status, 0, result.stderr);
});

/*
 * Leave credentials missing or supply invalid request arguments. These cases must
 * fail validation before the replacement fetch function can be called.
 */
test("Databento rejects missing credentials and malformed requests before fetch", () => {
    const result = runIsolated(async () => {
        // Any attempt to fetch in these invalid cases should immediately fail the test.
        globalThis.fetch = () => assert.fail("No request should be attempted.");
        const data = require("./services/databento");
        const start = new Date("2026-09-01T13:30:00Z");
        const end = new Date("2026-09-01T20:15:00Z");
        await assert.rejects(data.fetchDatabentoCandlesticks(start, end), /API_KEY is required/);
        await assert.rejects(data.fetchDatabentoStatuses(start, end), /API_KEY is required/);
        await assert.rejects(data.fetchDatabentoCondition("2026-09-01"), /API_KEY is required/);
        for (const date of [null, "", "2026-9-1"]) {
            await assert.rejects(data.fetchDatabentoCondition(date), TypeError);
        }
        for (const args of [["unknown", start, end], ["status", end, start],
            ["status", start, start], ["status", new Date(NaN), end]]) {
            // ...args passes the three array values as three separate function arguments.
            await assert.rejects(data.isDatabentoRangeAvailable(...args), TypeError);
        }
    });
    assert.strictEqual(result.status, 0, result.stderr);
});
