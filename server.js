require("dotenv").config();

const express = require("express");
const nunjucks = require("nunjucks");
const path = require("path");

const app = express();

nunjucks.configure("views", {
  autoescape: true,
  express: app,
  noCache: true,
});

app.use(express.json());
app.use(express.urlencoded({ extended:true }));

app.use(express.static(path.join(__dirname, "public")));

const pagesRouter = require("./routes/pages");
const apiRouter = require("./routes/api");

console.log("pagesRouter:", pagesRouter);
console.log("apiRouter:", apiRouter);

app.use("/", pagesRouter);
app.use("/api", apiRouter);

app.use((req, res) => {
    res.status(404).send("Page not found");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});

