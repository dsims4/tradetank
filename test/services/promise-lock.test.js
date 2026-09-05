const test = require("node:test");
const assert = require("node:assert/strict");
const { runWithPromiseLock } = require("../../services/promise-lock");

/* Return a promise and its controls so concurrency checks never depend on a timer. */
function createPendingOperation() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

/* Both callers must join the unfinished operation before it is allowed to resolve. */
test("same-key callers share one operation and clean up after success", async () => {
    const pendingPromises = new Map();
    const operation = createPendingOperation();
    let operationCount = 0;
    const createPromise = () => {
        operationCount += 1;
        return operation.promise;
    };
    const first = runWithPromiseLock(pendingPromises, "day", createPromise);
    const second = runWithPromiseLock(pendingPromises, "day", createPromise);
    assert.strictEqual(operationCount, 1);
    assert.strictEqual(pendingPromises.get("day"), operation.promise);
    const result = { savedCount: 5 };
    operation.resolve(result);
    const results = await Promise.all([first, second]);
    assert.strictEqual(results[0], result);
    assert.strictEqual(results[1], result);
    assert.strictEqual(pendingPromises.size, 0);
});

/* Attach rejection checks before rejecting, then prove the same key can be used again. */
test("shared rejection preserves the error and permits retry", async () => {
    const pendingPromises = new Map();
    const operation = createPendingOperation();
    const failure = new Error("Operation failed.");
    const first = runWithPromiseLock(pendingPromises, "day", () => operation.promise);
    const second = runWithPromiseLock(pendingPromises, "day", () => {
        assert.fail("The second caller must reuse the pending operation.");
    });
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

/* Independent keys may finish in either order without removing each other's entries. */
test("different keys run independently", async () => {
    const pendingPromises = new Map();
    const firstOperation = createPendingOperation();
    const secondOperation = createPendingOperation();
    const first = runWithPromiseLock(pendingPromises, "first", () => firstOperation.promise);
    const second = runWithPromiseLock(pendingPromises, "second", () => secondOperation.promise);
    assert.strictEqual(pendingPromises.size, 2);
    secondOperation.resolve(2);
    assert.strictEqual(await second, 2);
    assert.strictEqual(pendingPromises.get("first"), firstOperation.promise);
    firstOperation.resolve(1);
    assert.strictEqual(await first, 1);
    assert.strictEqual(pendingPromises.size, 0);
});

/* An existing map entry is sufficient to join work started outside this call. */
test("pre-existing promises are reused without invoking the factory", async () => {
    const operation = createPendingOperation();
    const pendingPromises = new Map([["day", operation.promise]]);
    const result = runWithPromiseLock(pendingPromises, "day", () => assert.fail("Unexpected work"));
    operation.resolve("existing");
    assert.strictEqual(await result, "existing");
    assert.strictEqual(pendingPromises.size, 0);
});

/* Cleanup must not erase a newer operation that replaced this call's map entry. */
test("completion preserves a newer replacement promise", async () => {
    for (const shouldReject of [false, true]) {
        const pendingPromises = new Map();
        const operation = createPendingOperation();
        const result = runWithPromiseLock(pendingPromises, "day", () => operation.promise);
        const replacement = Promise.resolve("newer");
        pendingPromises.set("day", replacement);
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

/* A factory can throw before returning any promise; no stale entry should remain. */
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

/* Successful operations may legitimately produce an empty or false result. */
test("locks preserve falsy operation results", async () => {
    const pendingPromises = new Map();
    for (const value of [0, false, "", null, undefined]) {
        assert.strictEqual(
            await runWithPromiseLock(pendingPromises, "day", async () => value),
            value
        );
        assert.strictEqual(pendingPromises.size, 0);
    }
});
