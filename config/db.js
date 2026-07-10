// Express에서 DB로 연결하기 위한 연결정보를 관리하는 파일
require("dotenv").config();
const mysql = require('mysql2');

// 1.Connection 정보 생성
const conn = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// 2.Connection 실행
conn.connect((err) => {
    if (err) {
        console.error("DB 연결 실패:", err);
    } else {
        console.log("DB 연결 성공");
    }
});

module.exports = conn;