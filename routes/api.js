const express = require("express");
const router = express.Router();
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
    getLatestInputChartData,
    getLatestTradesChartData
} = require("../services/chart-data");
const {
    requireAPIAuthentication
} = require("../middleware/authentication");
const {
    isValidTradingDate
} = require("../services/trading-sessions");
const {
    saveUserTradingDay
} = require("../services/trades");

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

router.get("/trades-chart", requireAPIAuthentication, async (req, res, next) => {
    const tradingDate =
        getStringInput(req.query.date);

    if (tradingDate && !isValidTradingDate(tradingDate)) {
        return res.status(400).json({
            error: "A valid trading date is required."
        });
    }

    try {
        const chartData = tradingDate
            ? await getTradesChartData(
                req.authenticatedUserID,
                tradingDate
            )
            : await getLatestTradesChartData(
                req.authenticatedUserID
            );

        return res.json(chartData);
    } catch (error) {
        return next(error);
    }
});

router.post("/signup-availability", signupAvailabilityIPRateLimit,
    async (req, res, next) => {

    const username = getStringInput(req.body.username).trim();
    const email = getStringInput(req.body.email).trim().toLowerCase();

    if (!isValidUsername(username) || !isValidEmail(email)) {
        return res.status(400).json({
            error: "At least one input is misformatted."
        });
    }

    try {
        const existingUsers = await query(
            `SELECT username, email
             FROM users
             WHERE username = $1 OR email = $2`,
            [username, email]
        );

        const usernameAvailable =
            !existingUsers.rows.some((user) => user.username === username);
        const emailAvailable =
            !existingUsers.rows.some((user) => user.email === email);

        return res.json({
            usernameAvailable,
            emailAvailable
        });
    } catch (error) {
        return next(error);
    }
});

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
