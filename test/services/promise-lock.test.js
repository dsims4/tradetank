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

const { runWithPromiseLock } = require("../../services/promise-lock");

/*
 * Return a promise and its controls so concurrency checks never depend on a timer.
 */
function createPendingOperation() {
    let resolve;
    let reject;
    // Save the promise controls so the test decides exactly when work finishes.
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

/*
 * Both callers must join the unfinished operation before it is allowed to resolve.
 */
test("same-key callers share one operation and clean up after success", async () => {
    // Map stores unfinished work under a key so another caller can find and reuse it.
    const pendingPromises = new Map();
    const operation = createPendingOperation();
    let operationCount = 0;
    const createPromise = () => {
        operationCount += 1;
        return operation.promise;
    };
    // Start both callers before resolving anything, so their work overlaps.
    const first = runWithPromiseLock(pendingPromises, "day", createPromise);
    const second = runWithPromiseLock(pendingPromises, "day", createPromise);
    assert.strictEqual(operationCount, 1);
    assert.strictEqual(pendingPromises.get("day"), operation.promise);
    const result = { savedCount: 5 };
    operation.resolve(result);
    // Promise.all waits for both callers and returns their results in caller order.
    const results = await Promise.all([first, second]);
    assert.strictEqual(results[0], result);
    assert.strictEqual(results[1], result);
    assert.strictEqual(pendingPromises.size, 0);
});

/*
 * Attach rejection checks before rejecting, then prove the same key can be used again.
 */
test("shared rejection preserves the error and permits retry", async () => {
    const pendingPromises = new Map();
    const operation = createPendingOperation();
    const failure = new Error("Operation failed.");
    const first = runWithPromiseLock(pendingPromises, "day", () => operation.promise);
    const second = runWithPromiseLock(pendingPromises, "day", () => {
        assert.fail("The second caller must reuse the pending operation.");
    });
    // Register both error checks before rejecting to avoid unhandled rejections.
    const failures = Promise.all([
        assert.rejects(first, (error) => error === failure),
        assert.rejects(second, (error) => error === failure)
    ]);
    operation.reject(failure);
    await failures;
    assert.strictEqual(pendingPromises.size, 0);
    assert.strictEqual(
        await runWithPromiseLock(pendingPromises, "day", async () => "retried"),
        "retried"
    );
    assert.strictEqual(pendingPromises.size, 0);
});

/*
 * Independent keys may finish in either order without removing each other's entries.
 */
test("different keys run independently", async () => {
    const pendingPromises = new Map();
    const firstOperation = createPendingOperation();
    const secondOperation = createPendingOperation();
    const first = runWithPromiseLock(pendingPromises, "first", () => firstOperation.promise);
    const second = runWithPromiseLock(pendingPromises, "second", () => secondOperation.promise);
    assert.strictEqual(pendingPromises.size, 2);
    // Finish the second key first to prove completion order does not affect the first key.
    secondOperation.resolve(2);
    assert.strictEqual(await second, 2);
    assert.strictEqual(pendingPromises.get("first"), firstOperation.promise);
    firstOperation.resolve(1);
    assert.strictEqual(await first, 1);
    assert.strictEqual(pendingPromises.size, 0);
});

/*
 * An existing map entry is sufficient to join work started outside this call.
 */
test("pre-existing promises are reused without invoking the factory", async () => {
    const operation = createPendingOperation();
    // Seed the map with an already-running promise, using a [key, value] pair.
    const pendingPromises = new Map([["day", operation.promise]]);
    const result = runWithPromiseLock(pendingPromises, "day", () => assert.fail("Unexpected work"));
    operation.resolve("existing");
    assert.strictEqual(await result, "existing");
    assert.strictEqual(pendingPromises.size, 0);
});

/*
 * Cleanup must not erase a newer operation that replaced this call's map entry.
 */
test("completion preserves a newer replacement promise", async () => {
    for (const shouldReject of [false, true]) {
        const pendingPromises = new Map();
        const operation = createPendingOperation();
        const result = runWithPromiseLock(pendingPromises, "day", () => operation.promise);
        const replacement = Promise.resolve("newer");
        // Pretend newer work has taken this key while the older operation is still pending.
        pendingPromises.set("day", replacement);
        // Run the same cleanup scenario for both failure and success of the older operation.
        if (shouldReject) {
            const failure = new Error("Old operation failed.");
            const rejected = assert.rejects(result, (error) => error === failure);
            operation.reject(failure);
            await rejected;
        } else {
            operation.resolve("older");
            assert.strictEqual(await result, "older");
        }
        assert.strictEqual(pendingPromises.get("day"), replacement);
    }
});

/*
 * A factory can throw before returning any promise; no stale entry should remain.
 */
test("a synchronous factory failure leaves the key available", async () => {
    const pendingPromises = new Map();
    const failure = new Error("Factory failed.");
    await assert.rejects(
        runWithPromiseLock(pendingPromises, "day", () => { throw failure; }),
        (error) => error === failure
    );
    assert.strictEqual(pendingPromises.size, 0);
    assert.strictEqual(
        await runWithPromiseLock(pendingPromises, "day", async () => "retry"),
        "retry"
    );
    assert.strictEqual(pendingPromises.size, 0);
});

/*
 * Successful operations may legitimately produce an empty or false result.
 */
test("locks preserve falsy operation results", async () => {
    const pendingPromises = new Map();
    // These values are falsy in an if condition, but are still legitimate successful results.
    for (const value of [0, false, "", null, undefined]) {
        assert.strictEqual(
            await runWithPromiseLock(pendingPromises, "day", async () => value),
            value
        );
        assert.strictEqual(pendingPromises.size, 0);
    }
});
