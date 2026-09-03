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
            ? aggregateFiveMinuteCandlesticks(
                candlestickResult.candlesticks
            )
            : []
    };
}

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
