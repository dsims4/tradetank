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
    getLatestInputChartData
} = require("../services/chart-data");
const {
    requireAPIAuthentication
} = require("../middleware/authentication");
const {
    isValidTradingDate
} = require("../services/trading-sessions");

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

module.exports = router;
