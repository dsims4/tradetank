const express = require("express");
const { clearSessionCookie } = require("../services/session");

const router = express.Router();

router.post("/logout", (req, res) => {
    clearSessionCookie(res);
    res.redirect("/login");
});

module.exports = router;
