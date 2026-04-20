const express = require("express");
const router = express.Router();
const { query } = require("../services/db");

router.get("/signup-availability", async (req, res, next) => {
    const username = String(req.query.username || "").trim();
    const email = String(req.query.email || "").trim().toLowerCase();

    if (!username && !email) {
        return res.json({
            usernameAvailable: true,
            emailAvailable: true
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
