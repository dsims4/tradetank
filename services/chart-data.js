const {
    getCandlesticksForTradingDate,
    getLatestAvailableCandlesticks
} = require("./candlestick-sync");
const {
    getUserTradesForDate,
    getLatestUserTradingDate,
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
            ? aggregateFiveMinuteCandlesticks(
                candlestickResult.candlesticks
            )
            : [],
        trades
    };
}

async function getLatestTradesChartData(userID) {
    const tradingDate =
        await getLatestUserTradingDate(userID);

    if (!tradingDate) {
        return {
            tradingDate: null,
            hasTrades: false,
            candlesticks: [],
            trades: []
        };
    }

    return getTradesChartData(userID, tradingDate);
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
    getLatestInputChartData,
    getLatestTradesChartData
};