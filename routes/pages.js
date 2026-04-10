const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
    res.render("index.njk", {
        currentPage: "index"
    });
});

router.get("/login", (req, res) => {
    res.render("login.njk", {
        currentPage: "login"
    });
});

router.get("/signup", (req, res) => {
    res.render("signup.njk", {
        currentPage: "signup"
    });
});

router.get("/home", (req, res) => {
    res.render("home.njk", {
        currentPage: "home"
    });
});

router.get("/analyze", (req, res) => {
    res.render("analyze.njk", {
        currentPage: "analyze"
    });
});

router.get("/visualize", (req, res) => {
    res.render("visualize.njk", {
        currentPage: "visualize"
    });
});

router.get("/input", (req, res) => {
    res.render("input.njk", {
        currentPage: "input"
    });
});

router.get("/profile", (req, res) => {
    res.render("profile.njk", {
        currentPage: "profile"
    });
});

router.get("/about", (req, res) => {
    res.render("about.njk", {
        currentPage: "about"
    });
});

router.get("/contact", (req, res) => {
    res.render("contact.njk", {
        currentPage: "contact"
    });
});

router.get("/privacy-policy", (req, res) => {
    res.render("privacy-policy.njk", {
        currentPage: "privacy-policy"
    });
});

router.get("/terms-of-use", (req, res) => {
    res.render("terms-of-use.njk", {
        currentPage: "terms-of-use"
    });
});

router.get("/forgot-password", (req, res) => {
    res.render("forgot-password.njk", {
        currentPage: "forgot-password"
    });
});

router.get("/reset-password", (req, res) => {
    res.render("reset-password.njk", {
        currentPage: "reset-password"
    });
});

module.exports = router;