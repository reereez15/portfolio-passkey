-- 테스트용 계정 2개 + 서로 다른 비공개 콘텐츠 (카드5 교차 접근 테스트용)
-- 패스키는 여기서 미리 넣을 수 없음(브라우저에서 직접 등록해야 함) — 계정만 미리 만들어둠

INSERT INTO users (username) VALUES ('kimjunsik') ON DUPLICATE KEY UPDATE username = username;
INSERT INTO users (username) VALUES ('test-account-2') ON DUPLICATE KEY UPDATE username = username;

-- kimjunsik 계정용 비공개 콘텐츠
INSERT INTO private_content (user_id, category, title, body)
SELECT id, 'game_ideas', '인디 게임 A — 로그라이크 덱빌딩', '카드 시너지 대신 "위치"가 시너지를 만드는 그리드 기반 로그라이크. 레퍼런스: Slay the Spire + Into the Breach.'
FROM users WHERE username = 'kimjunsik';

INSERT INTO private_content (user_id, category, title, body)
SELECT id, 'side_projects', '개인 대시보드 (백로그)', '여러 API 상태를 한 화면에 모아 보는 개인용 대시보드. 인증은 이번 과제에서 만든 패스키 방식을 재사용할 예정.'
FROM users WHERE username = 'kimjunsik';

INSERT INTO private_content (user_id, category, title, body)
SELECT id, 'snippets', 'Fastify JWT 쿠키 미들웨어', 'httpOnly 쿠키에서 JWT를 읽어 request.user에 심어주는 preHandler 훅. 여러 프로젝트에서 재사용 중.'
FROM users WHERE username = 'kimjunsik';

-- 두 번째 테스트 계정용 (완전히 다른 내용 — 교차 접근이 절대 안 되는지 확인하는 용도)
INSERT INTO private_content (user_id, category, title, body)
SELECT id, 'game_ideas', '보드게임 리메이크 아이디어', '고전 보드게임 하나를 모바일로 리메이크하는 아이디어 노트.'
FROM users WHERE username = 'test-account-2';

INSERT INTO private_content (user_id, category, title, body)
SELECT id, 'side_projects', '가계부 자동화 스크립트', '은행 CSV를 파싱해서 카테고리별로 정리하는 스크립트 계획.'
FROM users WHERE username = 'test-account-2';

INSERT INTO private_content (user_id, category, title, body)
SELECT id, 'snippets', 'CSV 파싱 유틸', '구분자와 인코딩을 자동으로 감지하는 CSV 파서 스니펫.'
FROM users WHERE username = 'test-account-2';
