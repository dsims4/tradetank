/** Displays the main application pages after a user logs in. */
const express = require("express");
const { loadUser } = require("../middleware/authentication");
const {
    TRADING_SESSION_INCEPTION_DATE,
    getNewYorkDate
} = require("../services/trading-sessions");

const router = express.Router();

/*
 * This function creates the route function used to display one logged-in page.
 *
 * Every page receives the name used to highlight its navigation link, the user's
 * color theme, and the earliest and latest dates accepted by date controls.
 *
 * Returns the Express function that handles requests for that page.
 */
function createAppPageHandler(pageName) {
    return (req, res) => res.render(`${pageName}.njk`, {
        currentPage: pageName,
        colorScheme: req.user.colorScheme,
        marketDataAccess: req.user.marketDataAccess,
        tradingSessionInceptionDate:
            TRADING_SESSION_INCEPTION_DATE,
        currentTradingDate: getNewYorkDate()
    });
}

router.get("/home", loadUser, createAppPageHandler("home"));
router.get("/analyze", loadUser, createAppPageHandler("analyze"));
router.get("/visualize", loadUser, createAppPageHandler("visualize"));
router.get("/trades", loadUser, createAppPageHandler("trades"));
router.get("/input", loadUser, createAppPageHandler("input"));

module.exports = router;
