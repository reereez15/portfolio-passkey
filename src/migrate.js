import fs from 'node:fs';
import { pool } from './db.js';

const sql = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const statements = sql.split(';').map(s => s.trim()).filter(Boolean);

for (const stmt of statements) {
  await pool.query(stmt);
  console.log('OK:', stmt.slice(0, 60).replace(/\n/g, ' '), '...');
}

console.log('마이그레이션 완료');
process.exit(0);
