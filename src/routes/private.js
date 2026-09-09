import { pool } from '../db.js';
import { authGuard } from '../plugins/authGuard.js';

const CATEGORY_LABELS = {
  game_ideas: '게임 기획 아이디어 노트',
  side_projects: '사이드 프로젝트 백로그',
  snippets: '개인 코드 스니펫 모음',
};

export default async function privateRoutes(fastify) {
  // 로그인 여부를 화면에서 확인할 때 쓰는 가벼운 엔드포인트
  fastify.get('/api/whoami', { preHandler: authGuard }, async (request, reply) => {
    reply.send({ username: request.user.username });
  });

  // 비공개 콘텐츠 — authGuard를 통과한 요청만 자기 자신의 데이터를 받는다
  // (T08-C36~C40: 다른 계정 것은 절대 섞이지 않음 — user_id로 항상 필터링)
  fastify.get('/api/private/content', { preHandler: authGuard }, async (request, reply) => {
    const [rows] = await pool.query(
      'SELECT category, title, body, created_at FROM private_content WHERE user_id = ? ORDER BY category, id',
      [request.user.userId],
    );
    const grouped = { game_ideas: [], side_projects: [], snippets: [] };
    for (const row of rows) grouped[row.category].push(row);
    reply.send({ labels: CATEGORY_LABELS, content: grouped });
  });

  // 등록된 패스키 목록 (이름 + 등록일) — 카드4 통과 기준
  fastify.get('/api/private/passkeys', { preHandler: authGuard }, async (request, reply) => {
    const [rows] = await pool.query(
      'SELECT id, device_name, created_at FROM credentials WHERE user_id = ? ORDER BY created_at',
      [request.user.userId],
    );
    reply.send({ passkeys: rows });
  });

  // 패스키 삭제 — 반드시 "내" 패스키만 지울 수 있음 (WHERE user_id로 재확인)
  fastify.delete('/api/private/passkeys/:id', { preHandler: authGuard }, async (request, reply) => {
    const { id } = request.params;
    const [result] = await pool.query('DELETE FROM credentials WHERE id = ? AND user_id = ?', [
      id,
      request.user.userId,
    ]);
    if (result.affectedRows === 0) {
      return reply.code(404).send({ error: 'not_found' });
    }

    const [remaining] = await pool.query('SELECT COUNT(*) AS n FROM credentials WHERE user_id = ?', [
      request.user.userId,
    ]);
    reply.send({ ok: true, remainingPasskeys: remaining[0].n });
    // 참고(카드4 T08-C46): 패스키가 0개가 되면, 이 계정은 더 이상 어떤 패스키로도 로그인할 수 없다.
    // 비밀번호 같은 대체 수단이 없기 때문에 의도적으로 "복구 불가" 상태가 된다.
    // 실제 서비스라면 이메일 복구 등을 추가로 두겠지만, 이번 과제 범위 밖이라 문서로만 남긴다.
  });
}
