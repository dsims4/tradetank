const express = require("express");
const {
    loadUserOptional,
    redirectAuthenticated
 } = require("../middleware/authentication");

const router = express.Router();

router.get("/", redirectAuthenticated, (req, res) => {
    return res.render("index.njk", {
        currentPage: "index"
    });
});

router.get("/about", loadUserOptional, (req, res) => {
    return res.render("about.njk", {
        currentPage: "about",
        layoutTemplate: req.user
            ? "layouts/app.njk"
            : "layouts/main.njk",
        colorScheme: req.user?.colorScheme || "light"
    });
});

router.get("/contact", loadUserOptional, (req, res) => {
    return res.render("contact.njk", {
        currentPage: "contact",
        layoutTemplate: req.user
            ? "layouts/app.njk"
            : "layouts/main.njk",
        colorScheme: req.user?.colorScheme || "light"
    });
});

router.get("/privacy-policy", loadUserOptional, (req, res) => {
    return res.render("privacy-policy.njk", {
        currentPage: "privacy-policy",
        layoutTemplate: req.user
            ? "layouts/app.njk"
            : "layouts/main.njk",
        colorScheme: req.user?.colorScheme || "light"
    });
});

router.get("/terms-of-use", loadUserOptional, (req, res) => {
    return res.render("terms-of-use.njk", {
        currentPage: "terms-of-use",
        layoutTemplate: req.user
            ? "layouts/app.njk"
            : "layouts/main.njk",
        colorScheme: req.user?.colorScheme || "light"
    });
});

module.exports = router;
