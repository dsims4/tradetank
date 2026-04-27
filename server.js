require("dotenv").config();
const PORT = process.env.PORT;

const express = require("express");
const nunjucks = require("nunjucks");
const path = require("path");

const pagesRouter = require("./routes/pages");
const apiRouter = require("./routes/api");

const app = express();

nunjucks.configure("views", {
  autoescape: true,
  express: app,
  noCache: true,
});

app.use(express.json());
app.use(express.urlencoded({ extended:true }));
app.use(express.static(path.join(__dirname, "public")));

app.use("/", pagesRouter);
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
