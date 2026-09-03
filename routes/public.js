const express = require("express");
const {
    loadUserOptional,
    redirectAuthenticated
} = require("../middleware/authentication");

const router = express.Router();

function createInformationalPageHandler(pageName) {
    return (req, res) => {
        return res.render(`${pageName}.njk`, {
            currentPage: pageName,
            layoutTemplate: req.user
                ? "layouts/app.njk"
                : "layouts/main.njk",
            colorScheme: req.user?.colorScheme || "light"
        });
    };
}

router.get("/", redirectAuthenticated, (req, res) => {
    return res.render("index.njk", {
        currentPage: "index"
    });
});

router.get(
    "/about",
    loadUserOptional,
    createInformationalPageHandler("about")
);
router.get(
    "/contact",
    loadUserOptional,
    createInformationalPageHandler("contact")
);
router.get(
    "/privacy-policy",
    loadUserOptional,
    createInformationalPageHandler("privacy-policy")
);
router.get(
    "/terms-of-use",
    loadUserOptional,
    createInformationalPageHandler("terms-of-use")
);

module.exports = router;
