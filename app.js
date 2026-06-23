const express = require("express");
const path = require("path");
const dashboardRouter = require("./routes/dashboard");
const recordsRouter = require("./routes/records");
const statusRouter = require("./routes/status");
const settingsRouter = require("./routes/settings");
const alertsRouter = require("./routes/alerts");

const app = express();
const port = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use("/records", recordsRouter);
app.use("/alerts", alertsRouter);
app.use("/settings", settingsRouter);
app.use("/status", statusRouter);
app.use("/", dashboardRouter);

app.listen(port, () => {
    console.log(`서버 실행: http://localhost:${port}`);
});
