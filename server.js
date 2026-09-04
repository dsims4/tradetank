require("dotenv").config();
const port = Number.parseInt(process.env.PORT || "3000", 10);
const isProduction = process.env.NODE_ENV === "production";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 through 65535.");
}

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

function sendErrorResponse(req, res, status, message) {
    if (req.path === "/api" || req.path.startsWith("/api/")) {
        return res.status(status).json({ error: message });
    }

    return res.status(status).send(message);
}

nunjucks.configure("views", {
    autoescape: true,
    express: app,
    noCache: !isProduction
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
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({
    extended: true,
    limit: "10kb"
}));
app.use(express.static(path.join(__dirname, "public")));

app.use("/", authenticationRouter);
app.use("/", resetPasswordRouter);
app.use("/", profileRouter);
app.use("/", appRouter);
app.use("/", publicRouter);
app.use("/api", apiRouter);
app.use((req, res) => {
    return sendErrorResponse(req, res, 404, "Page not found.");
});

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);

    if (error.type === "entity.too.large") {
        return sendErrorResponse(
            req,
            res,
            413,
            "The request body was too large."
        );
    }

    if (error.type === "entity.parse.failed") {
        return sendErrorResponse(
            req,
            res,
            400,
            "The request body was invalid."
        );
    }

    console.error(error);
    return sendErrorResponse(
        req,
        res,
        500,
        "There was an internal server error."
    );
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
