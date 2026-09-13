import mysql from 'mysql2/promise';
import fs from 'node:fs';
import 'dotenv/config';

// Aiven 등 클라우드 DB는 SSL이 필수, 로컬 개발 DB는 보통 SSL을 안 씀 → 명시적으로 켤 때만 사용
let sslConfig = undefined;
if (process.env.DB_SSL === 'true') {
  sslConfig = process.env.DB_CA_PATH && fs.existsSync(process.env.DB_CA_PATH)
    ? { ca: fs.readFileSync(process.env.DB_CA_PATH) }
    : { rejectUnauthorized: true };
}

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: 'utf8mb4',
  ssl: sslConfig,
  waitForConnections: true,
  connectionLimit: 5,
});
