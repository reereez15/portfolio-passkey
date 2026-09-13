import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'pds-diary-db-pds-diary.a.aivencloud.com',
  port: 12493,
  user: 'avnadmin',
  password: 'DB_PASSWORD',
  ssl: { rejectUnauthorized: false },
});

await connection.query('CREATE DATABASE IF NOT EXISTS passkey_project');
const [rows] = await connection.query('SHOW DATABASES');
console.log('현재 데이터베이스 목록:', rows.map(r => r.Database));

await connection.end();
console.log('완료: passkey_project 데이터베이스 준비됨');