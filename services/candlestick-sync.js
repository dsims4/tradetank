const {
    fetchDataBentoCandlesticks,
    isDataBentoRangeAvailable
} = require("./databento");
const {
    getCandlesticks,
    saveCandlesticks
} = require("./price-data");
const {
    getOrResolveTradingSession,
    markTradingSessionCandlesticksSynced
} = require("./trading-sessions");

const pendingCandlestickSyncs = new Map();

async function syncCandlesticks(tradingSession) {
    const {
        tradingDate,
        openTime,
        closeTime
    } = tradingSession;

    const rangeIsAvailable = await isDataBentoRangeAvailable(
        "ohlcv-1m",
        openTime,
        closeTime
    );

    if (!rangeIsAvailable) {
        return {
            state: "pending",
            fetchedCount: 0,
            savedCount: 0
        };
    }

    const candlesticks = await fetchDataBentoCandlesticks(openTime, closeTime);

    const savedCount = await saveCandlesticks(candlesticks);

    await markTradingSessionCandlesticksSynced(tradingDate);

    return {
        state: "available",
        fetchedCount: candlesticks.length,
        savedCount
    };
}

async function getOrSyncCandlesticks(tradingSession) {
    const {
        tradingDate,
        openTime,
        closeTime,
        candlesticksSyncedTime
    } = tradingSession;

    if (candlesticksSyncedTime) {
        return {
            state: "available",
            candlesticks: await getCandlesticks(openTime, closeTime)
        };
    }

    const syncKey = tradingDate;
    let pendingSync = pendingCandlestickSyncs.get(syncKey);

    if (!pendingSync) {
        pendingSync = syncCandlesticks(tradingSession);
        pendingCandlestickSyncs.set(syncKey, pendingSync);
    }

    let syncResult;

    try {
        syncResult = await pendingSync;
    } finally {
        if (pendingCandlestickSyncs.get(syncKey) === pendingSync) {
            pendingCandlestickSyncs.delete(syncKey);
        }
    }

    if (syncResult.state === "pending") {
        return {
            state: "pending",
            candlesticks: []
        };
    }

    return {
        state: "available",
        candlesticks: await getCandlesticks(openTime, closeTime)
    };
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

    const candlestickResult = await getOrSyncCandlesticks(tradingSession);

    return {
        ...tradingSession,
        candlestickState: candlestickResult.state,
        candlesticks: candlestickResult.candlesticks
    };
}

module.exports = {
    syncCandlesticks,
    getOrSyncCandlesticks,
    getCandlesticksForTradingDate
};