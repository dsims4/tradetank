/** Builds the exact data objects sent to the Input and Trades pages. */
const {
    getCandlesticksForTradingDate,
    getLatestAvailableCandlesticks
} = require("./candlestick-sync");
const {
    hasUserTradingDay
} = require("./trades");
const {
    aggregateFiveMinuteCandlesticks
} = require("./price-data");

/*
 * This function builds the Input-page data for one requested trading date.
 *
 * It checks for candles and a previous submission at the same time because
 * neither check needs the other's result. Data marked "degraded" is hidden.
 * A date that was already submitted cannot be submitted again.
 *
 * Returns the market-session information, five-minute candles, and true/false
 * values that tell the page whether submission is allowed.
 */
async function getInputChartData(userID, tradingDate) {
    const [candlestickResult, alreadySubmitted] =
        await Promise.all([
            getCandlesticksForTradingDate(tradingDate),
            hasUserTradingDay(userID, tradingDate)
        ]);

    // Input hides questionable candles so users cannot save trades against unreliable data.
    const candlesticksCanBeViewed =
        candlestickResult.candlestickState === "available" &&
        candlestickResult.dataCondition === "available";

    const canSubmit =
        !alreadySubmitted &&
        candlesticksCanBeViewed;

    return {
        ...candlestickResult,
        alreadySubmitted,
        canSubmit,
        candlesticks: candlesticksCanBeViewed
            ? aggregateFiveMinuteCandlesticks(
                candlestickResult.candlesticks
            )
            : []
    };
}

/*
 * This function builds a read-only Trades chart for a submitted day.
 *
 * Unlike the Input page, the Trades page shows degraded candles so the user
 * can still review a journal they already saved.
 *
 * Returns the market session and five-minute candles. If the user has no saved
 * trades for that date, it returns a standard empty result.
 */
async function getTradesChartData(userID, tradingDate) {
    const hasTrades = await hasUserTradingDay(userID, tradingDate);

    if (!hasTrades) {
        return {
            tradingDate,
            hasTrades: false,
            candlesticks: []
        };
    }

    const candlestickResult = await getCandlesticksForTradingDate(tradingDate);

    // Keep an existing journal viewable if its candles are later marked questionable.
    const candlesticksCanBeViewed =
        candlestickResult.candlestickState === "available" &&
        (
            candlestickResult.dataCondition === "available" ||
            candlestickResult.dataCondition === "degraded"
        );

    return {
        ...candlestickResult,
        hasTrades: true,
        candlesticks: candlesticksCanBeViewed
            ? aggregateFiveMinuteCandlesticks(
                candlestickResult.candlesticks
            )
            : []
    };
}

/*
 * This function builds Input-page data for the newest day with complete data.
 *
 * Returns five-minute candles and submission permissions. If no recent day can
 * be used, it returns the standard unavailable result.
 */
async function getLatestInputChartData(userID, now = new Date()) {
    const candlestickResult =
        await getLatestAvailableCandlesticks(now);

    if (!candlestickResult.tradingDate) {
        return {
            ...candlestickResult,
            alreadySubmitted: false,
            canSubmit: false
        };
    }

    const alreadySubmitted =
        await hasUserTradingDay(
            userID,
            candlestickResult.tradingDate
        );

    return {
        ...candlestickResult,
        alreadySubmitted,
        canSubmit: !alreadySubmitted,
        candlesticks: aggregateFiveMinuteCandlesticks(
            candlestickResult.candlesticks
        )
    };
}

module.exports = {
    getInputChartData,
    getTradesChartData,
    getLatestInputChartData
};
