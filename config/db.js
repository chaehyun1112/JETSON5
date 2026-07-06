// Express에서 DB로 연결하기 위한 연결정보를 관리하는 파일
const mysql = require('mysql2');

// 1.Connection 정보 생성
// Read only database settings from this project's local .env file.
const fs = require('fs');
const path = require('path');
const dbEnvPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(dbEnvPath)) {
    for (const line of fs.readFileSync(dbEnvPath, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*(?:export\s+)?(DB_HOST|DB_PORT|DB_USER|DB_PASSWORD|DB_NAME)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#]*))\s*(?:#.*)?$/);
        if (match && process.env[match[1]] === undefined) {
            process.env[match[1]] = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4].trim();
        }
    }
}
const missingDbKeys = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'].filter((key) => !process.env[key]);
if (missingDbKeys.length) {
    throw new Error(`Missing database environment variables: ${missingDbKeys.join(', ')}`);
}

const conn = mysql.createConnection({
    host : process.env.DB_HOST,
    port : Number(process.env.DB_PORT),
    user : process.env.DB_USER,
    password : process.env.DB_PASSWORD,
    database : process.env.DB_NAME
});

// 2.Connection 실행
conn.connect();

module.exports = conn;