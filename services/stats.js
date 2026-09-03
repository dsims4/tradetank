const { query } = require("./db");

function validateUserID(userID) {
    if (!Number.isSafeInteger(userID) || userID <= 0) {
        throw new TypeError("A valid user ID is required.");
    }
}

async function recalculateUserStats(userID, client) {
    validateUserID(userID);

    if (!client || typeof client.query !== "function") {
        throw new TypeError("A database client is required.");
    }

    await client.query(
        `INSERT INTO
            user_stats
            (user_id)
         VALUES
            ($1)
         ON CONFLICT
            (user_id)
         DO NOTHING`,
        [userID]
    );

    await client.query(
        `WITH trade_metrics AS (
            SELECT
                points_per_trade,
                points_per_trade / contract_count
                    AS points_per_contract,
                process_deviation,
                CASE
                    WHEN side = 'long'
                    THEN
                        jsonb_array_length(
                            order_events -> 'buySide'
                        ) - 1
                    ELSE
                        jsonb_array_length(
                        order_events -> 'sellSide'
                        ) - 1
                END AS scale_ins,
                CASE
                    WHEN side = 'long'
                    THEN
                        jsonb_array_length(
                            order_events -> 'sellSide'
                        ) - 1
                    ELSE
                        jsonb_array_length(
                            order_events -> 'buySide'
                        ) - 1
                END AS scale_outs
            FROM
                user_trades
            WHERE
                user_id = $1
         ),
         trade_totals AS (
            SELECT
                COUNT(*)::INTEGER AS trades_count,
                COALESCE(
                    SUM(points_per_trade),
                    0
                ) AS points_count,
                AVG(points_per_contract)
                    AS expectancy_per_contract,
                AVG(points_per_trade)
                    AS expectancy_per_trade,
                AVG(points_per_trade) FILTER (
                    WHERE process_deviation
                ) AS expectancy_with_process_deviation,
                AVG(points_per_trade) FILTER (
                    WHERE NOT process_deviation
                ) AS expectancy_without_process_deviation,
                AVG(process_deviation::INTEGER)
                    AS process_deviation_rate,
                AVG(scale_ins)
                    AS average_scale_ins,
                AVG(scale_outs)
                    AS average_scale_outs,
                MAX(points_per_contract) FILTER (
                    WHERE points_per_contract > 0
                ) AS biggest_win_contract,
                MIN(points_per_contract) FILTER (
                    WHERE points_per_contract < 0
                ) AS biggest_loss_contract,
                MAX(points_per_trade) FILTER (
                    WHERE points_per_trade > 0
                ) AS biggest_win_trade,
                MIN(points_per_trade) FILTER (
                    WHERE points_per_trade < 0
                ) AS biggest_loss_trade
            FROM
                trade_metrics
         ),
         day_totals AS (
            SELECT
                COUNT(*)::INTEGER
                    AS days_traded_count
            FROM
                user_trading_days
            WHERE
                user_id = $1
         )
         UPDATE
            user_stats
         SET
            trades_count =
                trade_totals.trades_count,
            points_count =
                trade_totals.points_count,
            days_traded_count =
                day_totals.days_traded_count,
            expectancy_per_contract =
                trade_totals.expectancy_per_contract,
            expectancy_per_trade =
                trade_totals.expectancy_per_trade,
            expectancy_with_process_deviation =
                trade_totals.expectancy_with_process_deviation,
            expectancy_without_process_deviation =
                trade_totals.expectancy_without_process_deviation,
            process_deviation_rate =
                trade_totals.process_deviation_rate,
            average_trades_per_day =
                trade_totals.trades_count::NUMERIC /
                NULLIF(day_totals.days_traded_count, 0),
            average_scale_ins =
                trade_totals.average_scale_ins,
            average_scale_outs =
                trade_totals.average_scale_outs,
            biggest_win_contract =
                trade_totals.biggest_win_contract,
            biggest_loss_contract =
                trade_totals.biggest_loss_contract,
            biggest_win_trade =
                trade_totals.biggest_win_trade,
            biggest_loss_trade =
                trade_totals.biggest_loss_trade,
            update_time = NOW()
         FROM
            trade_totals,
            day_totals
         WHERE
            user_stats.user_id = $1`,
        [userID]
    );
}

async function getUserStats(userID, db = { query }) {
    validateUserID(userID);

    const result = await db.query(
        `SELECT
            trades_count,
            points_count,
            days_traded_count,
            COALESCE(
                (
                    CURRENT_TIMESTAMP AT TIME ZONE
                        'America/New_York'
                )::DATE - (
                    SELECT
                        MIN(trading_date)
                    FROM
                        user_trading_days
                    WHERE
                        user_id = $1
                ) + 1,
                0
            )::INTEGER AS days_total_count,
            expectancy_per_contract,
            expectancy_per_trade,
            expectancy_with_process_deviation,
            expectancy_without_process_deviation,
            process_deviation_rate,
            average_trades_per_day,
            average_scale_ins,
            average_scale_outs,
            biggest_win_contract,
            biggest_loss_contract,
            biggest_win_trade,
            biggest_loss_trade
         FROM
            user_stats
         WHERE
            user_id = $1`,
        [userID]
    );

    if (result.rows.length === 0) {
        throw new Error("User statistics were not found.");
    }

    const stats = result.rows[0];
    const numberOrNull = (value) =>
        value === null ? null : Number(value);

    return {
        tradesCount: Number(stats.trades_count),
        pointsCount: Number(stats.points_count),
        daysTradedCount: Number(stats.days_traded_count),
        daysTotalCount: Number(stats.days_total_count),
        expectancyPerContract:
            numberOrNull(stats.expectancy_per_contract),
        expectancyPerTrade:
            numberOrNull(stats.expectancy_per_trade),
        expectancyWithProcessDeviation:
            numberOrNull(
                stats.expectancy_with_process_deviation
            ),
        expectancyWithoutProcessDeviation:
            numberOrNull(
                stats.expectancy_without_process_deviation
            ),
        processDeviationRate:
            numberOrNull(stats.process_deviation_rate),
        averageTradesPerDay:
            numberOrNull(stats.average_trades_per_day),
        averageScaleIns:
            numberOrNull(stats.average_scale_ins),
        averageScaleOuts:
            numberOrNull(stats.average_scale_outs),
        biggestWinContract:
            numberOrNull(stats.biggest_win_contract),
        biggestLossContract:
            numberOrNull(stats.biggest_loss_contract),
        biggestWinTrade:
            numberOrNull(stats.biggest_win_trade),
        biggestLossTrade:
            numberOrNull(stats.biggest_loss_trade)
    };
}

module.exports = {
    recalculateUserStats,
    getUserStats
};
