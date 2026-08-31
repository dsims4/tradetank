const {
    getCandlesticksForTradingDate,
    getLatestAvailableCandlesticks
} = require("./candlestick-sync");
const {
    getUserTradesForDate,
    hasUserTradingDay
} = require("./trades");

async function getInputChartData(userID, tradingDate) {
    const [candlestickResult, alreadySubmitted] =
        await Promise.all([
            getCandlesticksForTradingDate(tradingDate),
            hasUserTradingDay(userID, tradingDate)
        ]);

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
            ? candlestickResult.candlesticks
            : []
    };
}

async function getTradesChartData(userID, tradingDate) {
    const trades = await getUserTradesForDate(userID, tradingDate);

    if (trades.length === 0) {
        return {
            tradingDate,
            hasTrades: false,
            candlesticks: [],
            trades: []
        };
    }

    const candlestickResult = await getCandlesticksForTradingDate(tradingDate);

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
            ? candlestickResult.candlesticks
            : [],
        trades
    };
}

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
        canSubmit: !alreadySubmitted
    };
}

module.exports = {
    getInputChartData,
    getTradesChartData,
    getLatestInputChartData
};