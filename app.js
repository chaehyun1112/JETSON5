require("dotenv").config();
const express = require("express")
const path = require('path');
const conn = require('./config/db');
const app = express();
const session = require('express-session');
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", __dirname+"/views");

//라우터 사용할때


app.use(express.static("public"));


app.use(express.urlencoded({extended : true}));
app.use(express.json());

app.use(session({
  secret: 'bokyang-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 2 }, // 2시간
}));

app.use((req, res, next) => {
res.locals.user = req.session.user || null;
next();
});

app.use((req, res, next) => {

    res.locals.hasPillbox = false;

    if (!req.session.user) {
        return next();
    }

    const sql = `
        SELECT PILLBOX_NUM
        FROM TB_SENIOR
        WHERE MEM_ID = ?
    `;

    conn.query(sql, [req.session.user.id], (err, rows) => {

        if (!err &&
            rows.length > 0 &&
            rows[0].PILLBOX_NUM) {

            res.locals.hasPillbox = true;
        }

        next();
    });

});


const router = require("./routes/index.js")
//라우터 사용할때
app.use("/",router);


//EJS 사용할때




app.listen(3000)