import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const RP_ID = process.env.RP_ID;
const RP_NAME = process.env.RP_NAME || 'Portfolio';
const ORIGIN = process.env.ORIGIN;
// challenge는 5분 안에만 유효 — 그 이상 지나면 만료로 취급해 재사용/지연 공격을 막는다
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

async function getOrCreateUser(username) {
  const [rows] = await pool.query('SELECT id, username FROM users WHERE username = ?', [username]);
  if (rows.length > 0) return rows[0];
  const [result] = await pool.query('INSERT INTO users (username) VALUES (?)', [username]);
  return { id: result.insertId, username };
}

async function getUserCredentials(userId) {
  const [rows] = await pool.query(
    'SELECT id, public_key, counter, transports, device_name FROM credentials WHERE user_id = ?',
    [userId],
  );
  return rows;
}

async function saveChallenge(userId, type, challenge) {
  // 같은 사용자·같은 종류의 이전 challenge는 지우고 새로 하나만 유지 (동시에 여러 개 안 남게)
  await pool.query('DELETE FROM challenges WHERE user_id = ? AND type = ?', [userId, type]);
  await pool.query('INSERT INTO challenges (user_id, type, challenge) VALUES (?, ?, ?)', [userId, type, challenge]);
}

/** 저장된 challenge를 "한 번만" 꺼내 쓴다 — 조회 즉시 삭제해서 재사용(replay)을 원천 차단
 * 나이(age) 계산은 DB 서버 자체의 시계(NOW())로 한다 — 앱 서버와 DB가 서로 다른 시간대에
 * 있어도(예: 로컬 PC는 KST, Aiven은 UTC) 정확하게 동작하도록 하기 위함. */
async function consumeChallenge(userId, type) {
  const [rows] = await pool.query(
    'SELECT id, challenge, TIMESTAMPDIFF(SECOND, created_at, NOW()) AS age_seconds FROM challenges WHERE user_id = ? AND type = ? ORDER BY id DESC LIMIT 1',
    [userId, type],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  await pool.query('DELETE FROM challenges WHERE id = ?', [row.id]);

  if (row.age_seconds > CHALLENGE_TTL_MS / 1000) return null; // 만료된 challenge는 없는 것으로 취급

  return row.challenge;
}

function issueSessionCookie(reply, user) {
  const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET, {
    expiresIn: '2h',
  });
  reply.setCookie('session', token, {
    httpOnly: true,
    secure: ORIGIN.startsWith('https://'),
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 2,
  });
}

export default async function authRoutes(fastify) {
  // ── 등록: 1단계 — 서버가 일회용 질문(challenge)을 만들어 보낸다 ───────────
  fastify.post('/api/register/options', async (request, reply) => {
    const { username, deviceName } = request.body || {};
    if (!username || !deviceName) {
      return reply.code(400).send({ error: 'username과 deviceName이 필요합니다.' });
    }

    const user = await getOrCreateUser(username);
    const existingCredentials = await getUserCredentials(user.id);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: username,
      attestationType: 'none',
      // 이미 등록된 패스키는 다시 등록 못 하게 제외 (카드4: 두 번째 패스키는 "다른" 것이어야 함)
      excludeCredentials: existingCredentials.map((c) => ({
        id: c.id,
        transports: c.transports ? c.transports.split(',') : undefined,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    await saveChallenge(user.id, 'register', options.challenge);

    

    // 클라이언트가 verify 단계에서 다시 보낼 수 있게 임시로 함께 내려줌 (deviceName)
    reply.send({ options, deviceName });
  });

  // ── 등록: 2단계 — 기기가 만든 공개키를 검증하고 저장한다 ────────────────
  fastify.post('/api/register/verify', async (request, reply) => {
    const { username, deviceName, response } = request.body || {};
    if (!username || !response) {
      return reply.code(400).send({ error: 'username과 response가 필요합니다.' });
    }

    const [userRows] = await pool.query('SELECT id, username FROM users WHERE username = ?', [username]);
    if (userRows.length === 0) {
      return reply.code(400).send({ error: '등록을 먼저 시작해주세요.' });
    }
    const user = userRows[0];

    const expectedChallenge = await consumeChallenge(user.id, 'register');
    if (!expectedChallenge) {
      // 등록 창을 닫거나 시간을 끌어 challenge가 사라진 경우 — "취소하면 아무것도 저장되지 않는다"에 해당
      return reply.code(400).send({ error: 'expired_challenge', message: '등록 요청이 만료되었습니다. 다시 시도해주세요.' });
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: false,
      });
    } catch (err) {
      request.log.error(err);
      return reply.code(400).send({ error: 'verification_failed', message: err.message });
    }

    if (!verification.verified || !verification.registrationInfo) {
      return reply.code(400).send({ error: 'verification_failed' });
    }

    const { credential } = verification.registrationInfo;
    // credential.publicKey는 Uint8Array — DB에는 문자열로 저장 (개인키가 아니라 "공개키"임을 명확히)
    const publicKeyB64 = isoBase64URL.fromBuffer(credential.publicKey);

    await pool.query(
      'INSERT INTO credentials (id, user_id, public_key, counter, transports, device_name) VALUES (?, ?, ?, ?, ?, ?)',
      [
        credential.id,
        user.id,
        publicKeyB64,
        credential.counter,
        (credential.transports || []).join(','),
        deviceName || '이름 없는 패스키',
      ],
    );

    reply.send({ verified: true });
  });

  // ── 로그인: 1단계 — 매번 새 질문을 만들어 보낸다 ─────────────────────
  fastify.post('/api/login/options', async (request, reply) => {
    const { username } = request.body || {};
    if (!username) return reply.code(400).send({ error: 'username이 필요합니다.' });

    const [userRows] = await pool.query('SELECT id, username FROM users WHERE username = ?', [username]);
    if (userRows.length === 0) {
      // 계정이 없어도 형식은 동일하게 응답해 "계정 존재 여부 노출"을 줄인다
      return reply.code(400).send({ error: 'no_credentials', message: '등록된 패스키가 없습니다.' });
    }
    const user = userRows[0];
    const credentials = await getUserCredentials(user.id);
    if (credentials.length === 0) {
      return reply.code(400).send({ error: 'no_credentials', message: '등록된 패스키가 없습니다.' });
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: credentials.map((c) => ({
        id: c.id,
        transports: c.transports ? c.transports.split(',') : undefined,
      })),
      userVerification: 'preferred',
    });

    await saveChallenge(user.id, 'login', options.challenge);

    reply.send({ options });
  });

  // ── 로그인: 2단계 — 서명을 저장된 공개키로 검증한다 ──────────────────
  fastify.post('/api/login/verify', async (request, reply) => {
    const { username, response } = request.body || {};
    if (!username || !response) return reply.code(400).send({ error: 'username과 response가 필요합니다.' });

    const [userRows] = await pool.query('SELECT id, username FROM users WHERE username = ?', [username]);
    if (userRows.length === 0) return reply.code(400).send({ error: 'user_not_found' });
    const user = userRows[0];

    const expectedChallenge = await consumeChallenge(user.id, 'login');
    if (!expectedChallenge) {
      // 이미 한 번 쓴 challenge로 다시 요청하면 여기서 걸린다 (T08-C31)
      return reply.code(400).send({ error: 'expired_or_reused_challenge', message: '로그인 요청이 만료되었거나 이미 사용됐습니다.' });
    }

    const [credRows] = await pool.query('SELECT * FROM credentials WHERE id = ? AND user_id = ?', [
      response.id,
      user.id,
    ]);
    if (credRows.length === 0) {
      // 다른 계정의 패스키로 로그인하려는 시도 — 여기서 반드시 거절돼야 함 (카드5 교차 접근 테스트)
      return reply.code(403).send({ error: 'credential_not_found', message: '이 계정에 등록되지 않은 패스키입니다.' });
    }
    const cred = credRows[0];

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: cred.id,
          publicKey: isoBase64URL.toBuffer(cred.public_key),
          counter: cred.counter,
          transports: cred.transports ? cred.transports.split(',') : undefined,
        },
        requireUserVerification: false,
      });
    } catch (err) {
      request.log.error(err);
      return reply.code(400).send({ error: 'verification_failed', message: err.message });
    }

    if (!verification.verified) {
      return reply.code(401).send({ error: 'signature_invalid' });
    }

    await pool.query('UPDATE credentials SET counter = ? WHERE id = ?', [
      verification.authenticationInfo.newCounter,
      cred.id,
    ]);

    issueSessionCookie(reply, user);
    reply.send({ verified: true, username: user.username });
  });

  fastify.post('/api/logout', async (request, reply) => {
    reply.clearCookie('session', { path: '/' });
    reply.send({ ok: true });
  });
}