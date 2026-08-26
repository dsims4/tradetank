require("dotenv").config();
const PORT = process.env.PORT;
const isProduction = process.env.NODE_ENV === "production";

const express = require("express");
const nunjucks = require("nunjucks");
const helmet = require("helmet");
const path = require("path");

const authenticationRouter = require("./routes/authentication");
const resetPasswordRouter = require("./routes/reset-password");
const profileRouter = require("./routes/profile");
const publicRouter = require("./routes/public");
const appRouter = require("./routes/app");
const apiRouter = require("./routes/api");

const { verifySameOrigin } = require("./middleware/csrf");

const app = express();

nunjucks.configure("views", {
  autoescape: true,
  express: app,
  noCache: true,
});

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            upgradeInsecureRequests: isProduction ? [] : null
        }
    },
    referrerPolicy: {
        policy: "same-origin"
    },
    strictTransportSecurity: isProduction ? {} : false
}));

app.use(verifySameOrigin);
app.use(express.json());
app.use(express.urlencoded({ extended:true }));
app.use(express.static(path.join(__dirname, "public")));

app.use("/", authenticationRouter);
app.use("/", resetPasswordRouter);
app.use("/", profileRouter);
app.use("/", appRouter);
app.use("/", publicRouter);
app.use("/api", apiRouter);
app.use((req, res) => {
    res.status(404).send("Page not found");
});

app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).send("Internal server error");
});

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
