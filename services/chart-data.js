const {
    getCandlesticksForTradingDate
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

module.exports = {
    getInputChartData,
    getTradesChartData
};