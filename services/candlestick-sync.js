/** Decides when candle data should be read, downloaded, checked, and saved. */
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
const { runWithPromiseLock } = require("./promise-lock");

const STABLE_CONDITION_CACHE_DURATION = 1000 * 60 * 60 * 24;
const PENDING_CONDITION_CACHE_DURATION = 1000 * 60 * 5;
const LATEST_CANDLESTICK_CACHE_DURATION = 1000 * 60 * 5;
const MAXIMUM_CANDLESTICK_LOOKBACK_DAYS = 14;

const pendingCandlestickSyncs = new Map();
const pendingDataConditionRefreshes = new Map();
const pendingLatestCandlestickSearches = new Map();

let latestCandlestickCache = null;

/*
 * This function decides whether the last Databento status check is recent
 * enough to use again.
 *
 * A "pending" result is trusted for five minutes because it may change soon.
 * Other results are trusted for 24 hours.
 *
 * Returns true when the saved status and check time are valid and recent.
 * Returns false when Databento needs to be checked again.
 */
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

/*
 * This function checks whether a bad candle response is still in its waiting
 * period before another download may be attempted.
 *
 * Returns true when the retry time is still in the future.
 * Returns false when another attempt is allowed now.
 */
function isCandlestickRetryDelayed(tradingSession) {
    const retryTime = tradingSession.candlesticksRetryTime;

    return (
        retryTime instanceof Date &&
        !Number.isNaN(retryTime.getTime()) &&
        retryTime > new Date()
    );
}

/*
 * This function gets Databento's current status for one trading day.
 *
 * It uses the saved status when that status is recent. Otherwise, it asks
 * Databento again and saves the new result. If several users request the same
 * date at once, they all wait for the same Databento request.
 *
 * Returns the current status name, such as "available" or "pending".
 */
async function getOrRefreshDataCondition(tradingSession) {
    if (isDataConditionFresh(tradingSession)) {
        return tradingSession.dataCondition;
    }

    const tradingDate = tradingSession.tradingDate;
    return runWithPromiseLock(
        pendingDataConditionRefreshes,
        tradingDate,
        async () => {
            const dataCondition =
                await fetchDatabentoCondition(tradingDate);

            const updatedCondition =
                await updateTradingSessionDataCondition(
                    tradingDate,
                    dataCondition
                );

            return updatedCondition.dataCondition;
        }
    );
}

/*
 * This function tries to download and save one trading session's one-minute
 * candles.
 *
 * It does not make the candle request when Databento says the data is not
 * ready or the requested time range is unavailable. If the returned candles
 * fail validation, none are saved and the next attempt waits 24 hours.
 *
 * Returns an object describing what happened, including the state, Databento
 * status, number of candles received, and number of new rows saved.
 */
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

/*
 * This function reads candles already in the database. If none exist, it tries
 * to download them.
 *
 * Once candle prices are saved, this function never changes those prices. It
 * may still ask Databento whether the day's data quality status has changed.
 *
 * Returns an object with the candle state, data status, and saved candles.
 * The candle array is empty when usable data is unavailable.
 */
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

    const syncResult = await runWithPromiseLock(
        pendingCandlestickSyncs,
        tradingDate,
        () => syncCandlesticks(tradingSession)
    );

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

/*
 * This function first finds the market hours for a date, then gets its candles.
 *
 * It never requests candles for a closed market, a date before Trade Tank's
 * starting date, or a date whose market information is not ready.
 *
 * Returns one object containing both the market-session information and its
 * candlestick result.
 */
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

/*
 * This function searches backward one date at a time for the newest trading
 * day with complete candle data.
 *
 * It checks at most 14 dates so one page load cannot keep searching forever.
 *
 * Returns the first usable day it finds. If none is found, it returns the same
 * standard "unavailable" object with no date.
 */
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

/*
 * This function gets candles for the newest available trading day.
 *
 * The answer is remembered in this running server for five minutes. If several
 * users ask at once, they share one search instead of starting duplicate work.
 *
 * Returns the latest usable result, or the standard unavailable result.
 */
async function getLatestAvailableCandlesticks(now = new Date()) {
    const currentNewYorkDate = getNewYorkDate(now);

    const cacheIsFresh =
        latestCandlestickCache?.newYorkDate === currentNewYorkDate &&
        Date.now() - latestCandlestickCache.checkedTime <
            LATEST_CANDLESTICK_CACHE_DURATION;

    if (cacheIsFresh) {
        return latestCandlestickCache.result;
    }

    return runWithPromiseLock(
        pendingLatestCandlestickSearches,
        currentNewYorkDate,
        async () => {
            const result =
                await findLatestAvailableCandlesticks(
                    currentNewYorkDate
                );

            latestCandlestickCache = {
                newYorkDate: currentNewYorkDate,
                checkedTime: Date.now(),
                result
            };

            return result;
        }
    );
}

module.exports = {
    getCandlesticksForTradingDate,
    getLatestAvailableCandlesticks
};
