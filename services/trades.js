/** Checks browser trade drafts and safely saves or deletes complete trading days. */
const {
    query,
    runTransaction
} = require("./db");
const {
    isValidTradingDate
} = require("./trading-sessions");
const {
    recalculateUserStats
} = require("./stats");

const TRADE_NOTES_MAXIMUM_LENGTH = 1500;
const TRADE_PAGE_SIZE = 5;

/*
 * This function checks that a user ID is a positive whole number JavaScript can
 * represent exactly.
 *
 * It returns no value.
 * It throws a TypeError when the ID is invalid.
 */
function validateUserID(userID) {
    if (!Number.isSafeInteger(userID) || userID <= 0) {
        throw new TypeError("A valid user ID is required.");
    }
}

/*
 * This function checks that a trade date is a real weekday written as YYYY-MM-DD.
 *
 * It returns no value.
 * It throws a TypeError when the date is invalid.
 */
function validateTradingDate(tradingDate) {
    if (!isValidTradingDate(tradingDate)) {
        throw new TypeError("A valid trading date is required.");
    }
}

/*
 * This function checks one order sent by the browser.
 *
 * It requires a real time, a finite ES price in a 0.25-point increment, and a
 * positive whole number of contracts.
 *
 * Returns true when every field is valid. Returns false otherwise.
 */
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

/*
 * This function checks all buy and sell orders in one completed trade.
 *
 * Both sides must contain valid orders. The total number bought must equal the
 * total number sold, because a completed trade cannot leave a position open.
 *
 * Returns true when the orders are valid and balanced. Returns false otherwise.
 */
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

/*
 * This function changes one PostgreSQL trade row into the object sent by the API.
 *
 * Database names such as points_per_trade become JavaScript names such as
 * pointsPerTrade. Points per contract are calculated from the trusted saved
 * totals instead of being accepted from the browser.
 *
 * Returns the newly formatted trade object.
 */
function formatUserTrade(trade) {
    return {
        id: trade.id,
        tradingDate: trade.trading_date,
        side: trade.side,
        contractCount: Number(trade.contract_count),
        orderEvents: trade.order_events,
        pointsPerTrade: Number(trade.points_per_trade),
        pointsPerContract:
            Number(trade.points_per_trade) /
            Number(trade.contract_count),
        processDeviation: trade.process_deviation,
        notes: trade.notes
    };
}

/*
 * This function gets one page of up to five trades for one user and date.
 *
 * The query asks for six rows. The sixth row is not shown; its presence simply
 * tells the page that a Next button is needed.
 *
 * Returns the five formatted trades, current page number, and a true/false
 * hasNext value.
 */
async function getUserTradePageForDate(
    userID,
    tradingDate,
    page,
    db = { query }
) {
    validateUserID(userID);
    validateTradingDate(tradingDate);

    if (!Number.isSafeInteger(page) || page <= 0) {
        throw new TypeError("A valid trade page is required.");
    }

    const offset = (page - 1) * TRADE_PAGE_SIZE;
    const result = await db.query(
        `SELECT
            id,
            TO_CHAR(
                trading_date,
                'YYYY-MM-DD'
            ) AS trading_date,
            side,
            contract_count,
            order_events,
            points_per_trade,
            process_deviation,
            notes
         FROM
            user_trades
         WHERE
            user_id = $1 AND
            trading_date = $2
         ORDER BY
            creation_time DESC,
            id DESC
         LIMIT $3
         OFFSET $4`,
        [userID, tradingDate, TRADE_PAGE_SIZE + 1, offset]
    );

    return {
        trades: result.rows
            .slice(0, TRADE_PAGE_SIZE)
            .map(formatUserTrade),
        page,
        hasNext: result.rows.length > TRADE_PAGE_SIZE
    };
}

/*
 * This function checks whether a user has already submitted a trading day.
 * Submitted trading days cannot be edited or submitted a second time.
 *
 * Returns a Promise whose value is true when the day exists and false when it does not.
 */
async function hasUserTradingDay(userID, tradingDate, db = { query }) {
    validateUserID(userID);
    validateTradingDate(tradingDate);

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

/*
 * This function finds the newest date on which a user saved trades.
 *
 * Returns the date as YYYY-MM-DD.
 * Returns null when the user has never saved a trading day.
 */
async function getLatestUserTradingDate(userID, db = { query }) {
    validateUserID(userID);

    const result = await db.query(
        `SELECT
            TO_CHAR(
                MAX(trading_date),
                'YYYY-MM-DD'
            ) AS trading_date
         FROM
            user_trading_days
         WHERE
            user_id = $1`,
        [userID]
    );

    return result.rows[0].trading_date;
}

/*
 * This function totals one side of a trade.
 *
 * "Price-weighted value" means each order price multiplied by its contract
 * count. Adding those products allows later code to calculate average prices
 * correctly even when orders use different sizes.
 *
 * Returns the total contract count and total price-weighted value.
 * Throws an error when any order is invalid.
 */
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

    return summary;
}

/*
 * This function calculates trusted contract and point totals for one completed trade.
 *
 * The browser is not trusted to provide these totals. Subtracting the total
 * amount paid on buys from the total received on sells gives the correct
 * positive or negative point result for both long and short trades.
 *
 * Returns the total contracts traded and total points for the trade.
 * Throws an error when the trade is invalid or incomplete.
 */
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
        pointsPerTrade
    };
}

/*
 * This function rebuilds accepted orders using only fields the database allows.
 *
 * Any extra properties added by a user in browser developer tools are discarded.
 * Every time is converted to the same ISO date-and-time format.
 *
 * Returns a new object containing cleaned buySide and sellSide arrays.
 * Throws an error when the submitted orders are invalid.
 */
function canonicalizeOrderEvents(orderEvents) {
    if (!isValidOrderEventCollection(orderEvents)) {
        throw new TypeError("Valid order events are required.");
    }

    /*
     * This helper copies only the order fields allowed to reach PostgreSQL.
     *
     * It returns a new event with a normalized ISO timestamp.
     */
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

/*
 * This function checks every submitted order against trusted candle data from
 * the database.
 *
 * An order must use the exact time of a real five-minute candle. Its price must
 * be between that candle's low and high prices.
 *
 * Returns true only when every order matches a candle. Returns false otherwise.
 */
function areOrderEventsWithinCandlesticks(
    orderEvents,
    candlesticks
) {
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

/*
 * This function checks one submitted trade and creates the values PostgreSQL
 * will store.
 *
 * Financial totals sent by the browser are ignored. The server calculates them
 * again from trusted orders, so changing browser data cannot fake the result.
 *
 * Returns a cleaned trade ready to save.
 * Throws an error when any part of the trade is invalid.
 */
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
        processDeviation: trade.processDeviation,
        notes: notes.trim()
    };
}

/*
 * This function checks and cleans a nonempty array of submitted trades.
 *
 * Returns a new array of trades ready to save.
 * Throws an error when the array is empty or any trade is invalid.
 */
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

/*
 * This function saves a trading day, all its trades, and its updated statistics
 * as one all-or-nothing database transaction.
 *
 * The trading-day row must be unique for each user and date. If that row already
 * exists or any later step fails, none of the new changes are permanently saved.
 *
 * Returns the number of trades saved.
 * If the transaction fails, it throws the original error.
 */
async function saveUserTradingDay(
    userID,
    tradingDate,
    trades,
    candlesticks,
    db
) {
    validateUserID(userID);
    validateTradingDate(tradingDate);

    const preparedTrades =
        prepareTradesForSave(trades, candlesticks);

    return runTransaction(async (client) => {
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

        await recalculateUserStats(
            userID,
            client
        );

        return preparedTrades.length;
    }, db);
}

/*
 * This function deletes a trading day and recalculates statistics as one
 * all-or-nothing database transaction.
 *
 * PostgreSQL's cascading relationship automatically deletes every trade that
 * belongs to the deleted day.
 *
 * Returns true when a day was deleted.
 * Returns false when no matching day existed.
 */
async function deleteUserTradingDay(
    userID,
    tradingDate,
    db
) {
    validateUserID(userID);
    validateTradingDate(tradingDate);

    return runTransaction(async (client) => {
        const result = await client.query(
            `DELETE FROM
                user_trading_days
             WHERE
                user_id = $1 AND
                trading_date = $2`,
            [userID, tradingDate]
        );

        if (result.rowCount > 0) {
            await recalculateUserStats(userID, client);
        }

        return result.rowCount > 0;
    }, db);
}

module.exports = {
    getUserTradePageForDate,
    hasUserTradingDay,
    getLatestUserTradingDate,
    saveUserTradingDay,
    deleteUserTradingDay
};
