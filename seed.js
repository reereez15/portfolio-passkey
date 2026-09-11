import 'dotenv/config';
import { pool } from './src/db.js';

async function getOrCreateUser(username) {
  const [rows] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
  if (rows.length > 0) return rows[0].id;
  const [result] = await pool.query('INSERT INTO users (username) VALUES (?)', [username]);
  return result.insertId;
}

async function addContent(userId, category, title, body) {
  const [existing] = await pool.query(
    'SELECT id FROM private_content WHERE user_id = ? AND title = ?',
    [userId, title],
  );
  if (existing.length > 0) {
    console.log(`이미 있음(건너뜀): ${title}`);
    return;
  }
  await pool.query(
    'INSERT INTO private_content (user_id, category, title, body) VALUES (?, ?, ?, ?)',
    [userId, category, title, body],
  );
  console.log(`추가됨: ${title}`);
}

const kimId = await getOrCreateUser('kimjunsik');
const testId = await getOrCreateUser('test-account-2');

await addContent(kimId, 'game_ideas', '인디 게임 A — 로그라이크 덱빌딩', '카드 시너지 대신 "위치"가 시너지를 만드는 그리드 기반 로그라이크. 레퍼런스: Slay the Spire + Into the Breach.');
await addContent(kimId, 'side_projects', '개인 대시보드 (백로그)', '여러 API 상태를 한 화면에 모아 보는 개인용 대시보드. 인증은 이번 과제에서 만든 패스키 방식을 재사용할 예정.');
await addContent(kimId, 'snippets', 'Fastify JWT 쿠키 미들웨어', 'httpOnly 쿠키에서 JWT를 읽어 request.user에 심어주는 preHandler 훅. 여러 프로젝트에서 재사용 중.');

await addContent(testId, 'game_ideas', '보드게임 리메이크 아이디어', '고전 보드게임 하나를 모바일로 리메이크하는 아이디어 노트.');
await addContent(testId, 'side_projects', '가계부 자동화 스크립트', '은행 CSV를 파싱해서 카테고리별로 정리하는 스크립트 계획.');
await addContent(testId, 'snippets', 'CSV 파싱 유틸', '구분자와 인코딩을 자동으로 감지하는 CSV 파서 스니펫.');

const [rows] = await pool.query('SELECT username, id FROM users');
console.log('\n현재 계정 목록:', rows);

await pool.end();
console.log('시드 완료');