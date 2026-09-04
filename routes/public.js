/** Displays pages that visitors can open without logging in. */
const express = require("express");
const {
    loadUserOptional,
    redirectAuthenticated
} = require("../middleware/authentication");

const router = express.Router();

/*
 * This function creates a route for an informational page.
 * Logged-in users receive application navigation; visitors receive public navigation.
 *
 * Returns the Express function that displays the requested page template.
 */
function createInformationalPageHandler(pageName) {
    return (req, res) => {
        return res.render(`${pageName}.njk`, {
            currentPage: pageName,
            layoutTemplate: req.user
                ? "layouts/app.njk"
                : "layouts/main.njk",
            colorScheme: req.user?.colorScheme || "tank"
        });
    };
}

/*
 * This route displays the public landing page only when the visitor is logged out.
 */
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
