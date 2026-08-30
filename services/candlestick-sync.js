const {
    fetchDataBentoCandlesticks
} = require("./databento");
const {
    getCandlesticks,
    saveCandlesticks
} = require("./price-data");

const pendingCandlestickSyncs = new Map();

function getCandlestickSyncKey(startTime, endTime) {
    return `${startTime.toISOString()}:${endTime.toISOString()}`;
}

async function syncCandlesticks(startTime, endTime) {
    const candlesticks = await fetchDataBentoCandlesticks(startTime, endTime);

    const savedCount = await saveCandlesticks(candlesticks);

    return {
        fetchedCount: candlesticks.length,
        savedCount
    };
}

async function getOrSyncCandlesticks(startTime, endTime) {
    const storedCandlesticks = await getCandlesticks(startTime, endTime);

    if (storedCandlesticks.length > 0) return storedCandlesticks;

    const syncKey = getCandlestickSyncKey(startTime, endTime);
    let pendingSync = pendingCandlestickSyncs.get(syncKey);

    if (!pendingSync) {
        pendingSync = syncCandlesticks(startTime, endTime);
        pendingCandlestickSyncs.set(syncKey, pendingSync);
    }

    try {
        await pendingSync;
    } finally {
        if (pendingCandlestickSyncs.get(syncKey) === pendingSync) {
            pendingCandlestickSyncs.delete(syncKey);
        }
    }

    return getCandlesticks(startTime, endTime);
}

module.exports = {
    syncCandlesticks,
    getOrSyncCandlesticks
};