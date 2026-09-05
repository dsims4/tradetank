/** Turns saved trades into the points and calculations used by Visualize charts. */
const { query } = require("./db");
const { isValidTradingDate } = require("./trading-sessions");

const TRADE_Y_AXES = new Set([
    "cumulativePoints",
    "expectedValuePerContract",
    "expectedValuePerTrade",
    "expectedValuePerTradingDay",
    "cumulativeTrades",
    "cumulativeProcessDeviationTrades",
    "cumulativeProcessFollowingTrades",
    "cumulativeProfitableTrades",
    "cumulativeLosingTrades",
    "cumulativeBreakevenTrades",
    "cumulativeLongTrades",
    "cumulativeShortTrades",
    "cumulativeScalingTrades",
    "cumulativeNonScalingTrades",
    "profitableTradeRate",
    "losingTradeRate",
    "breakevenTradeRate",
    "processDeviationTradeRate",
    "processFollowingTradeRate",
    "longTradeRate",
    "shortTradeRate",
    "scalingTradeRate",
    "nonScalingTradeRate"
]);
const DAY_Y_AXES = new Set([
    ...TRADE_Y_AXES,
    "cumulativeProfitableDays",
    "cumulativeLosingDays",
    "cumulativeBreakevenDays",
    "profitableDayRate",
    "losingDayRate",
    "breakevenDayRate"
]);
const MATCHING_Y_AXIS = new Map([
    ["trades", "cumulativeTrades"],
    ["tradingDays", "cumulativeTradingDays"],
    ["processDeviationTrades", "cumulativeProcessDeviationTrades"],
    ["processFollowingTrades", "cumulativeProcessFollowingTrades"],
    ["longTrades", "cumulativeLongTrades"],
    ["shortTrades", "cumulativeShortTrades"],
    ["scalingTrades", "cumulativeScalingTrades"],
    ["nonScalingTrades", "cumulativeNonScalingTrades"]
]);
const RATE_Y_AXES = new Set([
    "profitableTradeRate",
    "losingTradeRate",
    "breakevenTradeRate",
    "processDeviationTradeRate",
    "processFollowingTradeRate",
    "longTradeRate",
    "shortTradeRate",
    "scalingTradeRate",
    "nonScalingTradeRate",
    "profitableDayRate",
    "losingDayRate",
    "breakevenDayRate"
]);
const DAY_ONLY_Y_AXES = new Set([
    "cumulativeTradingDays",
    "cumulativeProfitableDays",
    "cumulativeLosingDays",
    "cumulativeBreakevenDays",
    "profitableDayRate",
    "losingDayRate",
    "breakevenDayRate"
]);

/*
 * This function finds the y-axis choices that make sense for the selected x-axis.
 *
 * For example, a per-day value is not allowed when each x point represents a
 * single trade. It also removes choices that would compare the same count with
 * itself, such as trade count against cumulative trade count.
 *
 * Returns a Set containing every allowed y-axis name. A Set is used because it
 * provides a direct check for whether a name exists.
 */
function getValidYAxisValues(xAxis) {
    if (xAxis === "time") {
        return new Set([
            ...DAY_Y_AXES,
            "cumulativeTradingDays"
        ]);
    }

    if (xAxis === "tradingDays") {
        return DAY_Y_AXES;
    }

    if (!MATCHING_Y_AXIS.has(xAxis)) return new Set();

    const matchingYAxis = MATCHING_Y_AXIS.get(xAxis);

    return new Set(
        [...TRADE_Y_AXES].filter((yAxis) => yAxis !== matchingYAxis)
    );
}

/*
 * This function checks the user ID, both axis names, their compatibility, and
 * the optional starting and ending dates.
 *
 * It returns no value.
 * It throws a TypeError when any request value is invalid.
 */
function validateVisualizationInputs(userID, xAxis, yAxis, fromDate, toDate) {
    if (!Number.isSafeInteger(userID) || userID <= 0) {
        throw new TypeError("A valid user ID is required.");
    }

    if (!getValidYAxisValues(xAxis).has(yAxis)) {
        throw new TypeError("A valid axis relationship is required.");
    }

    if (fromDate && !isValidTradingDate(fromDate)) {
        throw new TypeError("A valid From date is required.");
    }

    if (toDate && !isValidTradingDate(toDate)) {
        throw new TypeError("A valid To date is required.");
    }

    if (fromDate && toDate && fromDate > toDate) {
        throw new TypeError("The From date must not follow the To date.");
    }
}

/*
 * This function finds the time of the earliest order in one trade.
 *
 * Old or malformed rows might contain no orders. For those rows, noon UTC on
 * the trading date is used so the trade can still be placed in a stable order.
 *
 * Returns the chosen time as the number of milliseconds since January 1, 1970.
 */
function getTradeTime(trade) {
    const orderEvents = [
        ...(trade.order_events?.buySide || []),
        ...(trade.order_events?.sellSide || [])
    ];
    const eventTimes = orderEvents
        .map((orderEvent) => new Date(orderEvent.time).getTime())
        .filter(Number.isFinite);

    return eventTimes.length > 0
        ? Math.min(...eventTimes)
        : new Date(`${trade.trading_date}T12:00:00Z`).getTime();
}

/*
 * This function checks whether a trade scaled into or out of its position.
 *
 * Returns true when buys or sells contain more than one order.
 * Returns false otherwise.
 */
function tradeUsesScaling(trade) {
    return (
        (trade.order_events?.buySide?.length || 0) > 1 ||
        (trade.order_events?.sellSide?.length || 0) > 1
    );
}

/*
 * This function safely divides one number by another.
 * A zero bottom number cannot be divided normally, so it is handled explicitly.
 *
 * Returns the division result, or zero when the bottom number is zero.
 */
function divide(numerator, denominator) {
    return denominator === 0 ? 0 : numerator / denominator;
}

/*
 * This function calculates the overall direction and steepness of a chart line.
 *
 * It uses the standard least-squares formula, which finds the straight line
 * that best fits all chart points. When the x-axis is time, milliseconds are
 * changed into days so the slope has a useful, readable meaning.
 *
 * Returns the calculated slope.
 * Returns null when there are fewer than two points or every x value is equal.
 */
function calculateSlope(points, xIsTime) {
    if (points.length < 2) return null;

    const firstX = points[0].x;
    const xValues = points.map((point) =>
        xIsTime
            ? (point.x - firstX) / 86400000
            : point.x
    );
    const xAverage = xValues.reduce((sum, x) => sum + x, 0) /
        xValues.length;
    const yAverage = points.reduce((sum, point) => sum + point.y, 0) /
        points.length;
    const covariance = points.reduce((sum, point, index) =>
        sum + (xValues[index] - xAverage) * (point.y - yAverage),
    0);
    const variance = xValues.reduce((sum, x) =>
        sum + (x - xAverage) ** 2,
    0);

    return variance === 0 ? null : covariance / variance;
}

/*
 * This function finds the chart's largest fall from an earlier high point.
 * This is called maximum drawdown.
 *
 * The first high point starts at zero. Therefore, a cumulative line that begins
 * below zero correctly counts that opening loss as a drawdown.
 *
 * Returns the largest drop as a positive number or zero when there was no drop.
 */
function calculateMaximumDrawdown(points) {
    let peak = 0;
    let maximumDrawdown = 0;

    points.forEach((point) => {
        peak = Math.max(peak, point.y);
        maximumDrawdown = Math.max(
            maximumDrawdown,
            peak - point.y
        );
    });

    return maximumDrawdown;
}

/*
 * This function reads trades from earliest to latest and creates each chart point.
 *
 * As it moves through the trades, it keeps the running counts, point totals,
 * rates, and expected values needed by the selected axes. A value representing
 * a whole day is added only after that day's final trade, so the chart never
 * shows a partly calculated day.
 *
 * Expected value per contract divides cumulative points by cumulative contracts.
 * Larger trades therefore carry more weight than in Analyze's equally weighted
 * average of each trade's points per contract.
 *
 * Returns an array of chart points. Each point contains numeric x and y values
 * and the trading date that produced it.
 */
function createVisualizationPoints(trades, xAxis, yAxis) {
    const dayTotals = new Map();

    trades.forEach((trade) => {
        dayTotals.set(
            trade.trading_date,
            (dayTotals.get(trade.trading_date) || 0) +
                Number(trade.points_per_trade)
        );
    });

    const totals = {
        trades: 0,
        tradingDays: 0,
        points: 0,
        contracts: 0,
        processDeviationTrades: 0,
        processFollowingTrades: 0,
        profitableTrades: 0,
        losingTrades: 0,
        breakevenTrades: 0,
        longTrades: 0,
        shortTrades: 0,
        scalingTrades: 0,
        nonScalingTrades: 0,
        profitableDays: 0,
        losingDays: 0,
        breakevenDays: 0
    };
    const seenDays = new Set();

    const points = trades.map((trade, index) => {
        const tradePoints = Number(trade.points_per_trade);
        const usesScaling = tradeUsesScaling(trade);
        const isFirstTradeOfDay =
            !seenDays.has(trade.trading_date);
        const isLastTradeOfDay =
            trades[index + 1]?.trading_date !== trade.trading_date;

        totals.trades += 1;
        totals.points += tradePoints;
        totals.contracts += Number(trade.contract_count);
        totals.processDeviationTrades += Number(trade.process_deviation);
        totals.processFollowingTrades += Number(!trade.process_deviation);
        totals.profitableTrades += Number(tradePoints > 0);
        totals.losingTrades += Number(tradePoints < 0);
        totals.breakevenTrades += Number(tradePoints === 0);
        totals.longTrades += Number(trade.side === "long");
        totals.shortTrades += Number(trade.side === "short");
        totals.scalingTrades += Number(usesScaling);
        totals.nonScalingTrades += Number(!usesScaling);

        if (isFirstTradeOfDay) {
            seenDays.add(trade.trading_date);
            totals.tradingDays += 1;
        }

        if (isLastTradeOfDay) {
            const dayPoints = dayTotals.get(trade.trading_date);

            totals.profitableDays += Number(dayPoints > 0);
            totals.losingDays += Number(dayPoints < 0);
            totals.breakevenDays += Number(dayPoints === 0);
        }

        const values = {
            cumulativePoints: totals.points,
            expectedValuePerContract:
                divide(totals.points, totals.contracts),
            expectedValuePerTrade:
                divide(totals.points, totals.trades),
            expectedValuePerTradingDay:
                divide(totals.points, totals.tradingDays),
            cumulativeTrades: totals.trades,
            cumulativeTradingDays: totals.tradingDays,
            cumulativeProcessDeviationTrades:
                totals.processDeviationTrades,
            cumulativeProcessFollowingTrades:
                totals.processFollowingTrades,
            cumulativeProfitableTrades: totals.profitableTrades,
            cumulativeLosingTrades: totals.losingTrades,
            cumulativeBreakevenTrades: totals.breakevenTrades,
            cumulativeLongTrades: totals.longTrades,
            cumulativeShortTrades: totals.shortTrades,
            cumulativeScalingTrades: totals.scalingTrades,
            cumulativeNonScalingTrades: totals.nonScalingTrades,
            profitableTradeRate:
                divide(totals.profitableTrades, totals.trades),
            losingTradeRate:
                divide(totals.losingTrades, totals.trades),
            breakevenTradeRate:
                divide(totals.breakevenTrades, totals.trades),
            processDeviationTradeRate:
                divide(totals.processDeviationTrades, totals.trades),
            processFollowingTradeRate:
                divide(totals.processFollowingTrades, totals.trades),
            longTradeRate: divide(totals.longTrades, totals.trades),
            shortTradeRate: divide(totals.shortTrades, totals.trades),
            scalingTradeRate:
                divide(totals.scalingTrades, totals.trades),
            nonScalingTradeRate:
                divide(totals.nonScalingTrades, totals.trades),
            cumulativeProfitableDays: totals.profitableDays,
            cumulativeLosingDays: totals.losingDays,
            cumulativeBreakevenDays: totals.breakevenDays,
            profitableDayRate:
                divide(totals.profitableDays, totals.tradingDays),
            losingDayRate:
                divide(totals.losingDays, totals.tradingDays),
            breakevenDayRate:
                divide(totals.breakevenDays, totals.tradingDays)
        };
        const xValues = {
            time: getTradeTime(trade),
            trades: totals.trades,
            tradingDays: totals.tradingDays,
            processDeviationTrades: totals.processDeviationTrades,
            processFollowingTrades: totals.processFollowingTrades,
            longTrades: totals.longTrades,
            shortTrades: totals.shortTrades,
            scalingTrades: totals.scalingTrades,
            nonScalingTrades: totals.nonScalingTrades
        };

        return {
            x: xValues[xAxis],
            y: values[yAxis],
            tradingDate: trade.trading_date,
            isDayEnd: isLastTradeOfDay
        };
    });

    // Add one point for each complete day instead of repeating that day after every trade.
    const displayedPoints =
        xAxis === "tradingDays" || DAY_ONLY_Y_AXES.has(yAxis)
            ? points.filter((point) => point.isDayEnd)
            : points;

    return displayedPoints.map((point) => ({
        x: point.x,
        y: point.y,
        tradingDate: point.tradingDate
    }));
}

/*
 * This function loads a user's trades in date order and builds the complete
 * response needed by the Visualize page.
 *
 * Optional starting and ending dates are included in the range. PostgreSQL
 * filters out trades outside that range before JavaScript performs calculations.
 *
 * Returns the chart points, slope, maximum drawdown, available date range, and
 * true/false values that tell the browser how to format both axes.
 */
async function getUserVisualization(
    userID,
    xAxis,
    yAxis,
    fromDate,
    toDate,
    db = { query }
) {
    validateVisualizationInputs(
        userID,
        xAxis,
        yAxis,
        fromDate,
        toDate
    );

    const result = await db.query(
        `SELECT
            id,
            TO_CHAR(trading_date, 'YYYY-MM-DD') AS trading_date,
            side,
            contract_count,
            order_events,
            points_per_trade,
            process_deviation
         FROM
            user_trades
         WHERE
            user_id = $1 AND
            ($2::DATE IS NULL OR trading_date >= $2) AND
            ($3::DATE IS NULL OR trading_date <= $3)
         ORDER BY
            trading_date,
            creation_time,
            id`,
        [userID, fromDate || null, toDate || null]
    );

    result.rows.sort((firstTrade, secondTrade) =>
        firstTrade.trading_date.localeCompare(
            secondTrade.trading_date
        ) ||
        getTradeTime(firstTrade) - getTradeTime(secondTrade) ||
        Number(firstTrade.id) - Number(secondTrade.id)
    );

    const points = createVisualizationPoints(
        result.rows,
        xAxis,
        yAxis
    );

    return {
        points,
        slope: calculateSlope(points, xAxis === "time"),
        maximumDrawdown: calculateMaximumDrawdown(points),
        availableFrom: result.rows[0]?.trading_date || null,
        availableTo:
            result.rows[result.rows.length - 1]?.trading_date || null,
        xIsTime: xAxis === "time",
        yIsRate: RATE_Y_AXES.has(yAxis)
    };
}

module.exports = {
    getUserVisualization
};
