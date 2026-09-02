const {
    isValidDatabentoCondition,
    fetchDatabentoCandlesticks,
    isDatabentoRangeAvailable,
    fetchDatabentoCondition
} = require("./databento");
const {
    getCandlesticks,
    saveCandlesticks,
    areCandlesticksValidForRange
} = require("./price-data");
const {
    getNewYorkDate,
    isValidTradingDate,
    getOrResolveTradingSession,
    markTradingSessionCandlesticksSynced,
    updateTradingSessionDataCondition,
    delayTradingSessionCandlestickRetry
} = require("./trading-sessions");

const STABLE_CONDITION_CACHE_DURATION = 1000 * 60 * 60 * 24;
const PENDING_CONDITION_CACHE_DURATION = 1000 * 60 * 5;
const LATEST_CANDLESTICK_CACHE_DURATION = 1000 * 60 * 5;
const MAXIMUM_CANDLESTICK_LOOKBACK_DAYS = 14;

const pendingCandlestickSyncs = new Map();
const pendingDataConditionRefreshes = new Map();

let latestCandlestickCache = null;
let pendingLatestCandlestickSearch = null;

function isDataConditionFresh(tradingSession) {
    const {
        dataCondition,
        dataConditionCheckedTime
    } = tradingSession;

    const checkedTimeIsValid =
        dataConditionCheckedTime instanceof Date &&
        !Number.isNaN(dataConditionCheckedTime.getTime());

    if (
        !isValidDatabentoCondition(dataCondition) ||
        !checkedTimeIsValid
    ) {
        return false;
    }

    const cacheDuration =
        dataCondition === "pending"
            ? PENDING_CONDITION_CACHE_DURATION
            : STABLE_CONDITION_CACHE_DURATION;

    return (
        Date.now() - dataConditionCheckedTime.getTime() <
        cacheDuration
    );
}

function isCandlestickRetryDelayed(tradingSession) {
    const retryTime = tradingSession.candlesticksRetryTime;

    return (
        retryTime instanceof Date &&
        !Number.isNaN(retryTime.getTime()) &&
        retryTime > new Date()
    );
}

async function getOrRefreshDataCondition(tradingSession) {
    if (isDataConditionFresh(tradingSession)) {
        return tradingSession.dataCondition;
    }

    const tradingDate = tradingSession.tradingDate;
    let pendingRefresh =
        pendingDataConditionRefreshes.get(tradingDate);

    if (!pendingRefresh) {
        pendingRefresh = (async () => {
            const dataCondition =
                await fetchDatabentoCondition(tradingDate);

            const updatedCondition =
                await updateTradingSessionDataCondition(
                    tradingDate,
                    dataCondition
                );

            return updatedCondition.dataCondition;
        })();

        pendingDataConditionRefreshes.set(
            tradingDate,
            pendingRefresh
        );
    }

    try {
        return await pendingRefresh;
    } finally {
        if (pendingDataConditionRefreshes.get(tradingDate) === pendingRefresh) {
            pendingDataConditionRefreshes.delete(tradingDate);
        }
    }
}

async function syncCandlesticks(tradingSession) {
    const {
        tradingDate,
        openTime,
        closeTime
    } = tradingSession;

    if (isCandlestickRetryDelayed(tradingSession)) {
        return {
            candlestickState: "unavailable",
            dataCondition: tradingSession.dataCondition,
            fetchedCount: 0,
            savedCount: 0
        };
    }

    const dataCondition =
        await getOrRefreshDataCondition(tradingSession);

    if (dataCondition !== "available") {
        return {
            candlestickState:
                dataCondition === "pending"
                    ? "pending"
                    : "unavailable",
            dataCondition,
            fetchedCount: 0,
            savedCount: 0
        };
    }

    const rangeIsAvailable = await isDatabentoRangeAvailable(
        "ohlcv-1m",
        openTime,
        closeTime
    );

    if (!rangeIsAvailable) {
        return {
            candlestickState: "pending",
            dataCondition,
            fetchedCount: 0,
            savedCount: 0
        };
    }

    const candlesticks = await fetchDatabentoCandlesticks(openTime, closeTime);

    if (
        !areCandlesticksValidForRange(
            candlesticks,
            openTime,
            closeTime
        )
    ) {
        await delayTradingSessionCandlestickRetry(tradingDate);

        return {
            candlestickState: "unavailable",
            dataCondition,
            fetchedCount: candlesticks.length,
            savedCount: 0
        };
    }

    const savedCount = await saveCandlesticks(candlesticks);

    await markTradingSessionCandlesticksSynced(tradingDate);

    return {
        candlestickState: "available",
        dataCondition,
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
        const dataCondition =
            await getOrRefreshDataCondition(tradingSession);

        return {
            candlestickState: "available",
            dataCondition,
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

    if (syncResult.candlestickState !== "available") {
        return {
            candlestickState: syncResult.candlestickState,
            dataCondition: syncResult.dataCondition,
            candlesticks: []
        };
    }

    return {
        candlestickState: "available",
        dataCondition: syncResult.dataCondition,
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
        candlestickState: candlestickResult.candlestickState,
        dataCondition: candlestickResult.dataCondition,
        candlesticks: candlestickResult.candlesticks
    };
}

async function findLatestAvailableCandlesticks(currentNewYorkDate) {
    const candidateDate =
        new Date(`${currentNewYorkDate}T00:00:00.000Z`);

    for (
        let dayOffset = 0;
        dayOffset < MAXIMUM_CANDLESTICK_LOOKBACK_DAYS;
        dayOffset += 1
    ) {
        const tradingDate =
            candidateDate.toISOString().slice(0, 10);

        if (isValidTradingDate(tradingDate)) {
            const candlestickResult =
                await getCandlesticksForTradingDate(tradingDate);

            if (
                candlestickResult.candlestickState === "available" &&
                candlestickResult.dataCondition === "available"
            ) {
                return candlestickResult;
            }
        }

        candidateDate.setUTCDate(
            candidateDate.getUTCDate() - 1
        );
    }

    return {
        tradingDate: null,
        state: "unavailable",
        candlestickState: "unavailable",
        dataCondition: null,
        candlesticks: []
    };
}

async function getLatestAvailableCandlesticks(now = new Date()) {
    const currentNewYorkDate = getNewYorkDate(now);

    const cacheIsFresh =
        latestCandlestickCache?.newYorkDate === currentNewYorkDate &&
        Date.now() - latestCandlestickCache.checkedTime <
            LATEST_CANDLESTICK_CACHE_DURATION;

    if (cacheIsFresh) {
        return latestCandlestickCache.result;
    }

    if (
        pendingLatestCandlestickSearch?.newYorkDate ===
        currentNewYorkDate
    ) {
        return pendingLatestCandlestickSearch.promise;
    }

    const pendingSearch =
        findLatestAvailableCandlesticks(
            currentNewYorkDate
        );

    pendingLatestCandlestickSearch = {
        newYorkDate: currentNewYorkDate,
        promise: pendingSearch
    };

    try {
        const result = await pendingSearch;

        latestCandlestickCache = {
            newYorkDate: currentNewYorkDate,
            checkedTime: Date.now(),
            result
        };

        return result;
    } finally {
        if (
            pendingLatestCandlestickSearch?.promise === pendingSearch
        ) {
            pendingLatestCandlestickSearch = null;
        }
    }
}

module.exports = {
    getCandlesticksForTradingDate,
    getLatestAvailableCandlesticks
};
