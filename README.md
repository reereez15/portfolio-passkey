# 과제 8 — 내 소개 페이지에 패스키 달기

1번 과제(포트폴리오 소개 페이지)에 비밀번호 없는 비공개 영역을 추가한 프로젝트입니다.
공개 소개 페이지는 그대로 있고, `/login.html`에서 패스키(WebAuthn)로 로그인해야만
`/private.html`의 비공개 콘텐츠(게임 기획 아이디어 노트 / 사이드 프로젝트 백로그 / 개인 코드
스니펫 모음)를 볼 수 있습니다.

## 스택
- 서버: Node.js + Fastify 5
- 인증: `@simplewebauthn/server` + `@simplewebauthn/browser` (라이브러리 사용, 직접 구현 아님)
- DB: MySQL 호환 (Aiven 무료 티어)
- 세션: JWT (httpOnly 쿠키)
- 배포: Render (서버) + Aiven (DB)

## 로컬 개발 환경 설정

```bash
npm install
cp .env.example .env
# .env를 로컬 DB 정보로 수정 (DB_SSL=false로 두면 로컬 MySQL/MariaDB에 SSL 없이 접속)
npm run migrate   # 테이블 생성
mysql --default-character-set=utf8mb4 [DB명] < seed.sql   # 테스트 계정 2개 + 콘텐츠 넣기
npm run dev
```

브라우저로 `http://localhost:3000`에 접속하면 소개 페이지가 뜹니다.
`http://localhost:3000/register.html`에서 패스키를 등록하고, `/login.html`에서 로그인하세요.

**중요**: 패스키는 `localhost` 또는 HTTPS에서만 동작합니다. IP 주소나 http:// 배포 주소로는
등록 창 자체가 뜨지 않습니다.

**한글 깨짐 주의**: DB에 시드 데이터를 넣을 때 `mysql` 명령에 반드시
`--default-character-set=utf8mb4`를 붙이세요. 안 붙이면 클라이언트 접속 문자셋이
latin1이 되어 한글이 깨진 채로 저장됩니다. (이번 개발 중 실제로 겪은 결함 — 상세는
`인증-구현-설명서.md`의 ④ 항목 참고)

## Aiven에 DB 만들기
1. https://aiven.io 가입 (신용카드 불필요)
2. 새 서비스 생성 → MySQL 선택 → 무료 플랜
3. 콘솔의 "Connection information"에서 Host, Port, User, Password, Database 확인
4. "Overview" 탭에서 CA 인증서(ca.pem) 다운로드
5. `.env`에 값 채우고 `DB_SSL=true`, `DB_CA_PATH=./ca.pem`로 설정
6. `npm run migrate` 로컬에서 실행해 Aiven DB에 테이블 생성 (원격 DB를 가리키는 `.env`로)
7. `mysql --default-character-set=utf8mb4 -h [Aiven호스트] -P [포트] -u [유저] -p [DB명] < seed.sql`

## Render에 서버 배포하기
1. 이 프로�트를 GitHub 저장소에 올리기 (`node_modules`, `.env`는 `.gitignore`로 제외)
2. Render 대시보드 → New → Web Service → 저장소 연결
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Environment 탭에서 `.env`의 값들을 그대로 환경변수로 등록
   - `RP_ID`는 배포된 도메인의 호스트명만 (예: `내앱이름.onrender.com`, `https://`나 포트 없이)
   - `ORIGIN`은 `https://내앱이름.onrender.com` 형태로 정확히
   - `ca.pem` 파일은 저장소에 커밋하고 `DB_CA_PATH=./ca.pem`로 지정하거나,
     Render의 "Secret Files" 기능으로 업로드
6. 배포 후 Render가 자동으로 HTTPS를 제공하므로 별도 인증서 설정은 불필요

## 프로젝트 구조
```
src/
  server.js       — Fastify 앱 진입점
  db.js           — MySQL 커넥션 풀
  migrate.js      — schema.sql 실행 스크립트
  plugins/authGuard.js  — JWT 쿠키 검증 미들웨어 (비공개 API는 전부 이걸 통과해야 함)
  routes/auth.js        — 등록/로그인/로그아웃 API
  routes/private.js     — 비공개 콘텐츠 · 패스키 목록/삭제 API
public/
  index.html      — 1번 과제 소개 페이지 (공개)
  register.html   — 패스키 등록 화면
  login.html      — 패스키 로그인 화면
  private.html    — 비공개 영역 (로그인 필요)
  vendor/simplewebauthn-browser.js — 클라이언트 라이브러리 (CDN 대신 직접 포함)
schema.sql        — DB 테이블 정의
seed.sql          — 테스트 계정 2개 + 예시 콘텐츠
e2e-test.cjs       — Puppeteer + 가상 인증기로 전체 플로우를 실제로 검증하는 자동 테스트
```

## 자동 테스트 실행 (선택)
로컬에 MySQL/MariaDB가 떠 있고 시드가 들어간 상태에서:
```bash
node src/server.js &
node e2e-test.cjs
```
등록 → 로그인 → 401 검증 → 패스키 2개 등록/삭제 → 계정 간 격리까지 16개 항목을 실제
Chrome + 가상 패스키 인증기로 검증합니다. 결과는 `e2e-test-result.txt` 참고.
