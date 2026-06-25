// Express에서 DB로 연결하기 위한 연결정보를 관리하는 파일
const mysql = require('mysql2');

// 1.Connection 정보 생성
const conn = mysql.createConnection({
    host : 'project-db-campus.smhrd.com',
    port : 3307,
    user : 'JETSON5',
    password : '5555',
    database : 'JETSON5'
});

// 2.Connection 실행
conn.connect();

module.exports = conn;