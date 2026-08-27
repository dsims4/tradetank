const express = require("express");
const router = express.Router();
const { query } = require("../services/db");
const {
    getStringInput,
    isValidUsername,
    isValidEmail
} = require("../utilities/validation");

router.post("/signup-availability", async (req, res, next) => {
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
