const express = require("express");
const { loadUser } = require("../middleware/authentication");

const router = express.Router();

function createAppPageHandler(pageName) {
    return (req, res) => res.render(`${pageName}.njk`, {
        currentPage: pageName,
        colorScheme: req.user.colorScheme
    });
}

router.get("/home", loadUser, createAppPageHandler("home"));
router.get("/analyze", loadUser, createAppPageHandler("analyze"));
router.get("/visualize", loadUser, createAppPageHandler("visualize"));
router.get("/trades", loadUser, createAppPageHandler("trades"));
router.get("/input", loadUser, createAppPageHandler("input"));

module.exports = router;
