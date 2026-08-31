const { query } = require("./db");
const { isValidTradingDate } = require("./trading-sessions");

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
            initial_exit,
            initial_entry,
            actual_exit,
            actual_entry,
            points,
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
        initialExit: trade.initial_exit,
        initialEntry: trade.initial_entry,
        actualExit: trade.actual_exit,
        actualEntry: trade.actual_entry,
        points: Number(trade.points),
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

module.exports = {
    getUserTradesForDate,
    hasUserTradingDay
}