const {
    fetchDataBentoCandlesticks
} = require("./databento");
const {
    getCandlesticks,
    saveCandlesticks
} = require("./price-data");
const {
    getOrResolveTradingSession
} = require("./trading-sessions");

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

async function getCandlesticksForTradingDate(tradingDate) {
    const tradingSession =
        await getOrResolveTradingSession(tradingDate);

    if (
        tradingSession.state === "closed" ||
        tradingSession.state === "unavailable" ||
        tradingSession.state === "unsupported"
    ) {
        return {
            ...tradingSession,
            candlesticks: []
        };
    }

    const candlesticks = await getOrSyncCandlesticks(
        tradingSession.openTime,
        tradingSession.closeTime
    );

    return {
        ...tradingSession,
        candlesticks
    };
}

module.exports = {
    syncCandlesticks,
    getOrSyncCandlesticks,
    getCandlesticksForTradingDate
};