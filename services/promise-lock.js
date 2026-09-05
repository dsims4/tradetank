/** Prevents identical slow operations from running more than once at a time. */
/*
 * This function makes callers asking for the same key share one unfinished
 * operation.
 *
 * For example, ten users asking for the same trading date wait for one download
 * instead of causing ten downloads. After it succeeds or fails, the saved
 * Promise is removed so a later request can try again.
 *
 * Returns the shared operation's final value. If that operation fails, this
 * function throws the same error.
 */
async function runWithPromiseLock(pendingPromises, key, createPromise) {
    let pendingPromise = pendingPromises.get(key);

    if (!pendingPromise) {
        // Save the Promise before waiting so later callers can join this exact operation.
        pendingPromise = createPromise();
        pendingPromises.set(key, pendingPromise);
    }

    try {
        return await pendingPromise;
    } finally {
        // Remove it only if it is still this Promise, not a newer one using the same key.
        if (pendingPromises.get(key) === pendingPromise) {
            pendingPromises.delete(key);
        }
    }
}

module.exports = { runWithPromiseLock };
