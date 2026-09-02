const express = require("express");
const { loadUser } = require("../middleware/authentication");

const router = express.Router();

router.get("/home", loadUser, (req, res) => {
    return res.render("home.njk", {
        currentPage: "home",
        colorScheme: req.user.colorScheme
    });
});

router.get("/analyze", loadUser, (req, res) => {
    return res.render("analyze.njk", {
        currentPage: "analyze",
        colorScheme: req.user.colorScheme
    });
});

router.get("/visualize", loadUser, (req, res) => {
    return res.render("visualize.njk", {
        currentPage: "visualize",
        colorScheme: req.user.colorScheme
    });
});

router.get("/trades", loadUser, (req, res) => {
    return res.render("trades.njk", {
        currentPage: "trades",
        colorScheme: req.user.colorScheme
    });
});

router.get("/input", loadUser, (req, res) => {
    return res.render("input.njk", {
        currentPage: "input",
        colorScheme: req.user.colorScheme
    });
});

module.exports = router;
