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
    getCandles
} = require("../services/price-data");
const {
    requireAPIAuthentication
} = require("../middleware/authentication");

router.get("/candles", requireAPIAuthentication, async (req, res, next) => {
    const start = getStringInput(req.query.start);
    const end = getStringInput(req.query.end);

    const startTime = new Date(start);
    const endTime = new Date(end);

    const datesAreInvalid =
        !start ||
        !end ||
        Number.isNaN(startTime.getTime()) ||
        Number.isNaN(endTime.getTime()) ||
        startTime >= endTime;

    if (datesAreInvalid) {
        return res.status(400).json({
            error: "A valid start and end time are required."
        });
    }

    try {
        const candles = await getCandles(startTime, endTime);
        return res.json({ candles });
    } catch (error) {
        return next(error);
    }
});

router.post("/signup-availability", signupAvailabilityIPRateLimit, async (req, res, next) => {
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

        const usernameAvailable = !existingUsers.rows.some((user) => user.username === username);
        const emailAvailable = !existingUsers.rows.some((user) => user.email === email);

        return res.json({
            usernameAvailable,
            emailAvailable
        });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
