async function runWithPromiseLock(pendingPromises, key, createPromise) {
    let pendingPromise = pendingPromises.get(key);

    if (!pendingPromise) {
        pendingPromise = createPromise();
        pendingPromises.set(key, pendingPromise);
    }

    try {
        return await pendingPromise;
    } finally {
        if (pendingPromises.get(key) === pendingPromise) {
            pendingPromises.delete(key);
        }
    }
}

module.exports = { runWithPromiseLock };
