/** Receives logged-in browser requests and responds with JSON data. */
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
const {
    getUserVisualization
} = require("../services/visualizations");

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

/*
 * This function checks a user's saved ordering of Analyze-page cards.
 * Every known card name must appear exactly once, with no missing or repeated names.
 *
 * Returns true for a complete valid order. Returns false otherwise.
 */
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

/*
 * This function checks whether a submitted username and email are available.
 *
 * This early check gives the Signup page quick feedback. Another person could
 * still register the same value a moment later, so PostgreSQL's unique rules
 * perform the final check when the account is actually created.
 *
 * Returns JSON containing validation errors or true/false availability values.
 * Passes an unexpected error to Express's final error handler.
 */
async function checkSignupAvailability(req, res, next) {
    const username = getStringInput(req.body?.username).trim();
    const email = getStringInput(req.body?.email).trim().toLowerCase();

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

/*
 * This route returns the user's calculated statistics and saved card order.
 *
 * The two database reads run at the same time because neither depends on the
 * other. This reduces how long the browser waits.
 */
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

/*
 * This route checks the requested chart axes and returns points calculated by
 * the server. An invalid choice returns HTTP status 400, meaning the request was
 * bad, instead of incorrectly reporting a server failure.
 */
router.get("/visualize", requireAPIAuthentication, async (req, res, next) => {
    const xAxis = getStringInput(req.query.xAxis);
    const yAxis = getStringInput(req.query.yAxis);
    const fromDate = getStringInput(req.query.from);
    const toDate = getStringInput(req.query.to);

    try {
        const visualization = await getUserVisualization(
            req.authenticatedUserID,
            xAxis,
            yAxis,
            fromDate,
            toDate
        );

        return res.json(visualization);
    } catch (error) {
        if (error instanceof TypeError) {
            return res.status(400).json({ error: error.message });
        }

        return next(error);
    }
});

/*
 * This route saves the logged-in user's complete Analyze-card order.
 *
 * An "upsert" updates an existing preference row or inserts one when it does not
 * exist. This also supports older accounts created before preferences were added.
 */
router.put(
    "/analyze-stat-order",
    requireAPIAuthentication,
    async (req, res, next) => {
        const statOrder = req.body?.statOrder;

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

/*
 * This route returns an Input chart for the requested date. With no date, it
 * returns the newest available chart.
 *
 * If candles are not already saved, the market-data service may download them.
 * Identical requests made at the same time share that download.
 */
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

/*
 * This route returns up to five saved trades from one trading date.
 *
 * With no date, it uses the user's newest submitted day. The page number must be
 * a positive whole number within a safe maximum.
 */
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

/*
 * This route deletes one complete trading day belonging to the logged-in user.
 *
 * A missing day returns HTTP status 404. Success returns status 204, which means
 * the request succeeded and there is no response body.
 */
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

/*
 * This route loads read-only candles for a previously submitted trading day.
 * Unlike the Input page, it may return candles marked degraded so an existing
 * journal can still be reviewed with a warning.
 */
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

/*
 * This route lets the Signup page run the availability check. A rate limiter
 * prevents the browser from sending excessive checks.
 */
router.post(
    "/signup-availability",
    signupAvailabilityIPRateLimit,
    checkSignupAvailability
);

/*
 * This route saves all trades from one previously unsubmitted Input chart.
 *
 * It reloads trusted candles from the server and recalculates financial totals.
 * Values changed in browser developer tools are therefore not trusted.
 */
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
