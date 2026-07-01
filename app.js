require("dotenv").config();

const express = require("express")
const path = require('path');

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

const router = require("./routes/index.js")
//라우터 사용할때
app.use("/",router);


//EJS 사용할때



app.listen(3000)