import jwt from 'jsonwebtoken';

/**
 * 요청에 담긴 httpOnly 쿠키(session)에서 JWT를 읽어 검증한다.
 * 성공하면 request.user = { userId, username } 를 채운다.
 * 실패(쿠키 없음 / 만료 / 위조)하면 401로 즉시 응답을 끝낸다.
 *
 * T08-C15~C17 대응: 로그인 없이 비공개 API를 직접 두드리면
 * 무조건 이 훅에서 401로 막힌다. 화면에서만 숨긴 게 아니라는 증거.
 */
export async function authGuard(request, reply) {
  const token = request.cookies.session;
  if (!token) {
    return reply.code(401).send({ error: 'unauthenticated', message: '로그인이 필요합니다.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    request.user = { userId: payload.userId, username: payload.username };
  } catch (err) {
    return reply.code(401).send({ error: 'invalid_session', message: '세션이 유효하지 않습니다. 다시 로그인해주세요.' });
  }
}
