const express = require("express");
const { query } = require("../services/db");
const {
    getStringInput,
    isValidUsername,
    isValidEmail
} = require("../utilities/validation");
const {
    signupAvailabilityIPRateLimit
} = require("../middleware/rate-limits");
const {
    getInputChartData,
    getTradesChartData,
    getLatestInputChartData
} = require("../services/chart-data");
const {
    requireAPIAuthentication
} = require("../middleware/authentication");
const {
    isValidTradingDate
} = require("../services/trading-sessions");
const {
    getUserTradePageForDate,
    getLatestUserTradingDate,
    saveUserTradingDay,
    deleteUserTradingDay
} = require("../services/trades");
const { getUserStats } = require("../services/stats");

const router = express.Router();
const ANALYZE_STAT_NAMES = new Set([
    "tradesCount",
    "pointsCount",
    "daysTradedCount",
    "daysTotalCount",
    "expectancyPerContract",
    "expectancyPerTrade",
    "expectancyWithProcessDeviation",
    "expectancyWithoutProcessDeviation",
    "averageScaleIns",
    "averageScaleOuts",
    "biggestWinContract",
    "biggestLossContract",
    "biggestWinTrade",
    "biggestLossTrade",
    "processDeviationRate",
    "averageTradesPerDay"
]);

function isValidAnalyzeStatOrder(statOrder) {
    return (
        Array.isArray(statOrder) &&
        statOrder.length === ANALYZE_STAT_NAMES.size &&
        new Set(statOrder).size === ANALYZE_STAT_NAMES.size &&
        statOrder.every((statName) =>
            ANALYZE_STAT_NAMES.has(statName)
        )
    );
}

async function checkSignupAvailability(req, res, next) {
    const username = getStringInput(req.body.username).trim();
    const email = getStringInput(req.body.email).trim().toLowerCase();

    if (!isValidUsername(username) || !isValidEmail(email)) {
        return res.status(400).json({
            error: "At least one input is misformatted."
        });
    }

    try {
        const existingUsers = await query(
            `SELECT
                username,
                email
             FROM
                users
             WHERE
                username = $1 OR
                email = $2`,
            [username, email]
        );

        const usernameAvailable = !existingUsers.rows.some(
            (user) => user.username === username
        );
        const emailAvailable = !existingUsers.rows.some(
            (user) => user.email === email
        );

        return res.json({
            usernameAvailable,
            emailAvailable
        });
    } catch (error) {
        return next(error);
    }
}

router.get("/analyze-stats", requireAPIAuthentication, async (req, res, next) => {
    try {
        const [stats, preferencesResult] = await Promise.all([
            getUserStats(req.authenticatedUserID),
            query(
                `SELECT
                    analyze_stat_order
                 FROM
                    user_preferences
                 WHERE
                    user_id = $1`,
                [req.authenticatedUserID]
            )
        ]);

        return res.json({
            ...stats,
            statOrder:
                preferencesResult.rows[0]?.analyze_stat_order || []
        });
    } catch (error) {
        return next(error);
    }
});

router.put(
    "/analyze-stat-order",
    requireAPIAuthentication,
    async (req, res, next) => {
        const statOrder = req.body.statOrder;

        if (!isValidAnalyzeStatOrder(statOrder)) {
            return res.status(400).json({
                error: "A valid statistics order is required."
            });
        }

        try {
            await query(
                `INSERT INTO
                    user_preferences
                    (user_id, analyze_stat_order, update_time)
                 VALUES
                    ($1, $2, NOW())
                 ON CONFLICT
                    (user_id)
                 DO UPDATE SET
                    analyze_stat_order = EXCLUDED.analyze_stat_order,
                    update_time = NOW()`,
                [req.authenticatedUserID, JSON.stringify(statOrder)]
            );

            return res.status(204).end();
        } catch (error) {
            return next(error);
        }
    }
);

router.get("/input-chart", requireAPIAuthentication, async (req, res, next) => {
    const tradingDate =
        getStringInput(req.query.date);

    if (tradingDate && !isValidTradingDate(tradingDate)) {
        return res.status(400).json({
            error: "A valid trading date is required."
        });
    }

    try {
        const chartData = tradingDate
            ? await getInputChartData(
                req.authenticatedUserID,
                tradingDate
            )
            : await getLatestInputChartData(
                req.authenticatedUserID
            );

        return res.json(chartData);
    } catch (error) {
        return next(error);
    }
});

router.get("/trades", requireAPIAuthentication, async (req, res, next) => {
    const tradingDate = getStringInput(req.query.date);
    const pageInput = getStringInput(req.query.page) || "1";
    const page = Number(pageInput);

    if (tradingDate && !isValidTradingDate(tradingDate)) {
        return res.status(400).json({
            error: "A valid trading date is required."
        });
    }

    if (
        !/^[1-9]\d*$/.test(pageInput) ||
        !Number.isSafeInteger(page) ||
        page > Number.MAX_SAFE_INTEGER / 5
    ) {
        return res.status(400).json({
            error: "A valid trade page is required."
        });
    }

    try {
        const selectedTradingDate = tradingDate ||
            await getLatestUserTradingDate(
                req.authenticatedUserID
            );

        if (!selectedTradingDate) {
            return res.json({
                tradingDate: null,
                trades: [],
                page: 1,
                hasNext: false
            });
        }

        const tradePage =
            await getUserTradePageForDate(
                req.authenticatedUserID,
                selectedTradingDate,
                page
            );

        return res.json({
            ...tradePage,
            tradingDate: selectedTradingDate
        });
    } catch (error) {
        return next(error);
    }
});

router.delete("/trades", requireAPIAuthentication, async (req, res, next) => {
    const tradingDate = getStringInput(req.query.date);

    if (!isValidTradingDate(tradingDate)) {
        return res.status(400).json({
            error: "A valid trading date is required."
        });
    }

    try {
        const tradingDayWasDeleted =
            await deleteUserTradingDay(
                req.authenticatedUserID,
                tradingDate
            );

        if (!tradingDayWasDeleted) {
            return res.status(404).json({
                error: "That submitted trading day was not found."
            });
        }

        return res.status(204).end();
    } catch (error) {
        return next(error);
    }
});

router.get("/trades-chart", requireAPIAuthentication, async (req, res, next) => {
    const tradingDate =
        getStringInput(req.query.date);

    if (!isValidTradingDate(tradingDate)) {
        return res.status(400).json({
            error: "A valid trading date is required."
        });
    }

    try {
        const chartData = await getTradesChartData(
            req.authenticatedUserID,
            tradingDate
        );

        return res.json(chartData);
    } catch (error) {
        return next(error);
    }
});

router.post(
    "/signup-availability",
    signupAvailabilityIPRateLimit,
    checkSignupAvailability
);

router.post("/input-chart", requireAPIAuthentication, async (req, res, next) => {
    if (!req.is("application/json")) {
        return res.status(415).json({
            error: "JSON content is required."
        });
    }

    const tradingDate =
        getStringInput(req.body?.tradingDate);

    const trades = req.body?.trades;

    if (!isValidTradingDate(tradingDate)) {
        return res.status(400).json({
            error: "A valid trading date is required."
        });
    }

    try {
        const chartData = await getInputChartData(
            req.authenticatedUserID,
            tradingDate
        );

        if (chartData.alreadySubmitted) {
            return res.status(409).json({
                error: "That trading day was already submitted."
            });
        }

        if (!chartData.canSubmit) {
            return res.status(409).json({
                error: "That chart cannot currently be submitted."
            });
        }

        const savedTradeCount =
            await saveUserTradingDay(
                req.authenticatedUserID,
                tradingDate,
                trades,
                chartData.candlesticks
            );

        return res.status(201).json({
            tradingDate,
            savedTradeCount
        });
    } catch (error) {
        if (error instanceof TypeError) {
            return res.status(400).json({
                error: error.message
            });
        }

        if (error.code === "23505") {
            return res.status(409).json({
                error: "That trading day was already submitted."
            });
        }

        return next(error);
    }
});

module.exports = router;
