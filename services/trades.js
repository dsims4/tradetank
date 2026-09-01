const { query } = require("./db");
const { isValidTradingDate } = require("./trading-sessions");

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

module.exports = {
    getUserTradesForDate,
    hasUserTradingDay,
    isValidOrderEvent,
    isValidOrderEventCollection,
    getOrderEventSideSummary,
    calculateTradeSummary
};
