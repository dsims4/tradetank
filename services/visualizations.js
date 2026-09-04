const { query } = require("./db");
const { isValidTradingDate } = require("./trading-sessions");

const TRADE_Y_AXES = new Set([
    "cumulativePoints",
    "cumulativePointsPerContract",
    "cumulativePointsPerTrade",
    "cumulativePointsPerDay",
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
    "positiveEVTradeRate",
    "negativeEVTradeRate",
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
    "positiveEVTradeRate",
    "negativeEVTradeRate",
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

function tradeUsesScaling(trade) {
    return (
        (trade.order_events?.buySide?.length || 0) > 1 ||
        (trade.order_events?.sellSide?.length || 0) > 1
    );
}

function divide(numerator, denominator) {
    return denominator === 0 ? 0 : numerator / denominator;
}

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
            cumulativePointsPerContract:
                divide(totals.points, totals.contracts),
            cumulativePointsPerTrade:
                divide(totals.points, totals.trades),
            cumulativePointsPerDay:
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
            positiveEVTradeRate:
                divide(totals.profitableTrades, totals.trades),
            negativeEVTradeRate:
                divide(totals.losingTrades, totals.trades),
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
