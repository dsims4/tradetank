const {
    query,
    getClient
} = require("./db");
const { isValidTradingDate } = require("./trading-sessions");

const TRADE_NOTES_MAXIMUM_LENGTH = 1500;

function isValidOrderEvent(orderEvent) {
    if (
        !orderEvent ||
        typeof orderEvent !== "object" ||
        Array.isArray(orderEvent)
    ) {
        return false;
    }

    const orderTime = new Date(orderEvent.time);

    return (
        typeof orderEvent.time === "string" &&
        !Number.isNaN(orderTime.getTime()) &&
        Number.isFinite(orderEvent.price) &&
        orderEvent.price > 0 &&
        Number.isInteger(orderEvent.price * 4) &&
        Number.isSafeInteger(orderEvent.contractCount) &&
        orderEvent.contractCount > 0
    );
}

function isValidOrderEventCollection(orderEvents) {
    if (
        !orderEvents ||
        typeof orderEvents !== "object" ||
        Array.isArray(orderEvents) ||
        !Array.isArray(orderEvents.buySide) ||
        !Array.isArray(orderEvents.sellSide) ||
        orderEvents.buySide.length === 0 ||
        orderEvents.sellSide.length === 0
    ) {
        return false;
    }

    if (
        !orderEvents.buySide.every(isValidOrderEvent) ||
        !orderEvents.sellSide.every(isValidOrderEvent)
    ) {
        return false;
    }

    const buyContractCount = orderEvents.buySide.reduce(
        (total, orderEvent) =>
            total + orderEvent.contractCount,
        0
    );

    const sellContractCount = orderEvents.sellSide.reduce(
        (total, orderEvent) =>
            total + orderEvent.contractCount,
        0
    );

    return buyContractCount === sellContractCount;
}

async function getUserTradesForDate(userID, tradingDate, db = { query }) {
    if (!Number.isSafeInteger(userID) || userID <= 0) {
        throw new TypeError("A valid user ID is required.");
    }

    if (!isValidTradingDate(tradingDate)) {
        throw new TypeError("A valid trading date is required.");
    }

    const result = await db.query(
        `SELECT
            id,
            side,
            contract_count,
            order_events,
            points_per_trade,
            process_deviation,
            notes,
            creation_time,
            update_time
         FROM
            user_trades
         WHERE
            user_id = $1 AND
            trading_date = $2
         ORDER BY
            creation_time`,
        [userID, tradingDate]
    );

    return result.rows.map((trade) => ({
        id: trade.id,
        side: trade.side,
        contractCount: Number(trade.contract_count),
        orderEvents: trade.order_events,
        pointsPerTrade: Number(trade.points_per_trade),
        pointsPerContract:
            Number(trade.points_per_trade) /
            Number(trade.contract_count),
        processDeviation: trade.process_deviation,
        notes: trade.notes,
        creationTime: trade.creation_time,
        updateTime: trade.update_time
    }));
}

async function hasUserTradingDay(userID, tradingDate, db = { query }) {
    if (!Number.isSafeInteger(userID) || userID <= 0) {
        throw new TypeError("A valid user ID is required.");
    }

    if (!isValidTradingDate(tradingDate)) {
        throw new TypeError("A valid trading date is required.");
    }

    const result = await db.query(
        `SELECT EXISTS (
            SELECT
                1
            FROM
                user_trading_days
            WHERE
                user_id = $1 AND
                trading_date = $2
         ) AS trading_day_exists`,
        [userID, tradingDate]
    );

    return result.rows[0].trading_day_exists;
}

function getOrderEventSideSummary(orderEvents) {
    if (
        !Array.isArray(orderEvents) ||
        orderEvents.length === 0 ||
        !orderEvents.every(isValidOrderEvent)
    ) {
        throw new TypeError("Valid order events are required.");
    }

    const summary = orderEvents.reduce(
        (total, orderEvent) => ({
            contractCount: total.contractCount + orderEvent.contractCount,
            totalValue:
                total.totalValue + orderEvent.price * orderEvent.contractCount
        }),
        {
            contractCount: 0,
            totalValue: 0
        }
    );

    return {
        ...summary,
        averagePrice:
            summary.totalValue / summary.contractCount
    };
}

function calculateTradeSummary(side, orderEvents) {
    if (
        side !== "long" &&
        side !== "short"
    ) {
        throw new TypeError("A valid trade side is required.");
    }

    if (!isValidOrderEventCollection(orderEvents)) {
        throw new TypeError("Valid order events are required.");
    }

    const buySummary = getOrderEventSideSummary(orderEvents.buySide);
    const sellSummary = getOrderEventSideSummary(orderEvents.sellSide);
    const pointsPerTrade = sellSummary.totalValue - buySummary.totalValue;

    return {
        contractCount: buySummary.contractCount,
        averageEntryPrice:
            side === "long"
                ? buySummary.averagePrice
                : sellSummary.averagePrice,
        averageExitPrice:
            side === "long"
                ? sellSummary.averagePrice
                : buySummary.averagePrice,
        pointsPerTrade,
        pointsPerContract:
            pointsPerTrade / buySummary.contractCount
    };
}

function prepareTradeForSave(trade, candlesticks) {
    if (
        !trade ||
        typeof trade !== "object" ||
        Array.isArray(trade)
    ) {
        throw new TypeError("A valid trade is required.");
    }

    const notes = trade.notes || "";

    if (
        typeof trade.processDeviation !== "boolean" ||
        typeof notes !== "string" ||
        notes.length > TRADE_NOTES_MAXIMUM_LENGTH
    ) {
        throw new TypeError("Valid trade details are required.");
    }

    const canonicalOrderEvents = canonicalizeOrderEvents(
        trade.orderEvents
    );

    if (
        !areOrderEventsWithinCandlesticks(
            canonicalOrderEvents,
            candlesticks
        )
    ) {
        throw new TypeError(
            "Trade events must match the candlestick data."
        );
    }

    const summary = calculateTradeSummary(
        trade.side,
        canonicalOrderEvents
    );

    return {
        side: trade.side,
        contractCount: summary.contractCount,
        orderEvents: canonicalOrderEvents,
        pointsPerTrade: summary.pointsPerTrade,
        pointsPerContract: summary.pointsPerContract,
        averageEntryPrice: summary.averageEntryPrice,
        averageExitPrice: summary.averageExitPrice,
        processDeviation: trade.processDeviation,
        notes: notes.trim()
    };
}

function areOrderEventsWithinCandlesticks(orderEvents, candlesticks) {
    if (
        !isValidOrderEventCollection(orderEvents) ||
        !Array.isArray(candlesticks) ||
        candlesticks.length === 0
    ) {
        return false;
    }

    const candlesticksByTime = new Map(
        candlesticks.map((candlestick) => [
            candlestick.openTime,
            candlestick
        ])
    );

    const events = [
        ...orderEvents.buySide,
        ...orderEvents.sellSide
    ];

    return events.every((orderEvent) => {
        const normalizedTime = new Date(orderEvent.time).toISOString();
        const candlestick = candlesticksByTime.get(normalizedTime);

        return (
            candlestick &&
            Number.isFinite(candlestick.lowPrice) &&
            Number.isFinite(candlestick.highPrice) &&
            orderEvent.price >= candlestick.lowPrice &&
            orderEvent.price <= candlestick.highPrice
        );
    });
}

function canonicalizeOrderEvents(orderEvents) {
    if (!isValidOrderEventCollection(orderEvents)) {
        throw new TypeError("Valid order events are required.");
    }

    const canonicalizeEvent = (orderEvent) => ({
        time: new Date(orderEvent.time).toISOString(),
        price: orderEvent.price,
        contractCount: orderEvent.contractCount
    });

    return {
        buySide: orderEvents.buySide.map(canonicalizeEvent),
        sellSide: orderEvents.sellSide.map(canonicalizeEvent)
    };
}

function prepareTradesForSave(trades, candlesticks) {
    if (
        !Array.isArray(trades) ||
        trades.length === 0
    ) {
        throw new TypeError("At least one valid trade is required.");
    }

    return trades.map((trade) =>
        prepareTradeForSave(trade, candlesticks)
    );
}

async function saveUserTradingDay(userID, tradingDate,
    trades, candlesticks, db = { getClient }) {

    if (!Number.isSafeInteger(userID) || userID <= 0) {
        throw new TypeError("A valid user ID is required.");
    }

    if (!isValidTradingDate(tradingDate)) {
        throw new TypeError("A valid trading date is required.");
    }

    const preparedTrades =
        prepareTradesForSave(trades, candlesticks);

    const client = await db.getClient();

    try {
        await client.query("BEGIN");

        await client.query(
            `INSERT INTO
                user_trading_days
                (user_id, trading_date)
             VALUES
                ($1, $2)`,
            [userID, tradingDate]
        );

        for (const trade of preparedTrades) {
            await client.query(
                `INSERT INTO
                    user_trades
                    (
                        user_id,
                        trading_date,
                        side,
                        contract_count,
                        order_events,
                        points_per_trade,
                        process_deviation,
                        notes
                    )
                 VALUES
                    ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    userID,
                    tradingDate,
                    trade.side,
                    trade.contractCount,
                    trade.orderEvents,
                    trade.pointsPerTrade,
                    trade.processDeviation,
                    trade.notes
                ]
            );
        }

        await client.query("COMMIT");
        return preparedTrades.length;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    getUserTradesForDate,
    hasUserTradingDay,
    isValidOrderEvent,
    isValidOrderEventCollection,
    getOrderEventSideSummary,
    calculateTradeSummary,
    prepareTradeForSave,
    areOrderEventsWithinCandlesticks,
    canonicalizeOrderEvents,
    prepareTradesForSave,
    saveUserTradingDay
};
