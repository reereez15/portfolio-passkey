const PUPPETEER_PATH = '/home/claude/.npm-global/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer';
const puppeteer = require(PUPPETEER_PATH);

const BASE = 'http://localhost:3000';
let passed = 0, failed = 0;
function check(label, ok, extra) {
  console.log((ok ? 'PASS' : 'FAIL') + ' — ' + label + (extra !== undefined ? ' :: ' + extra : ''));
  ok ? passed++ : failed++;
}

async function newAuthenticator(client) {
  const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2', transport: 'internal',
      hasResidentKey: true, hasUserVerification: true, isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return authenticatorId;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  const responses = [];
  page.on('response', r => responses.push({ url: r.url(), status: r.status() }));
  const lastResponseFor = (pathSuffix) => [...responses].reverse().find(r => r.url.endsWith(pathSuffix));

  const client = await page.target().createCDPSession();
  await client.send('WebAuthn.enable');
  const auth1 = await newAuthenticator(client);

  const userA = 'kimjunsik';
  const userB = 'test-account-2';

  // ── T08-C15~C17: 로그인 없이 비공개 페이지 접속 시 콘텐츠 없음, API는 401 ──
  await page.goto(BASE + '/private.html', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 500));
  {
    const html = await page.content();
    check('로그인 없이 /private.html 접속 시 콘텐츠 텍스트 없음', !html.includes('로그라이크') && !html.includes('가계부'));
    const apiResp = lastResponseFor('/api/private/content') || lastResponseFor('/api/whoami');
    check('로그인 없이 비공개 API 호출 시 401', apiResp && apiResp.status === 401, JSON.stringify(apiResp));
  }

  // ── 카드2: userA 등록 ──────────────────────────────────────
  await page.goto(BASE + '/register.html', { waitUntil: 'domcontentloaded' });
  await page.type('#username', userA);
  await page.type('#deviceName', '기기1');
  await page.click('#registerBtn');
  await new Promise(r => setTimeout(r, 1000));
  {
    const msg = await page.$eval('#msg', el => el.textContent);
    check('userA 패스키 등록 성공', msg.includes('등록 완료'), msg);
    const verifyResp = lastResponseFor('/api/register/verify');
    check('등록 verify 응답 200', verifyResp && verifyResp.status === 200);
  }

  // ── 카드3: userA 로그인 ────────────────────────────────────
  await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' });
  await page.type('#username', userA);
  await page.click('#loginBtn');
  await new Promise(r => setTimeout(r, 1500));
  check('로그인 성공 후 private.html로 리다이렉트', page.url().includes('private.html'), page.url());

  await new Promise(r => setTimeout(r, 800));
  {
    const whoami = await page.$eval('#whoami', el => el.textContent).catch(() => '');
    check('로그인 후 whoami에 userA 표시', whoami.includes(userA), whoami);
    const html = await page.content();
    check('로그인 후 콘텐츠(게임 기획 아이디어) 표시됨', html.includes('게임 기획 아이디어 노트'));
  }

  // ── 카드4: 두 번째 패스키 등록 → 목록에 2개 → 하나 삭제 후에도 로그인 가능 ──
  // 브라우저에 인증기가 동시에 여러 개 붙어 있으면 excludeCredentials 판단이 꼬일 수 있어
  // (실제로 "다른 기기"라면 애초에 동시에 붙어있지 않음) 먼저 auth1을 떼고 auth2를 붙인다.
  await client.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: auth1, enabled: false }).catch(() => {});
  const auth2 = await newAuthenticator(client);
  await page.goto(BASE + '/register.html', { waitUntil: 'domcontentloaded' });
  await page.type('#username', userA);
  await page.type('#deviceName', '기기2');
  await page.click('#registerBtn');
  await new Promise(r => setTimeout(r, 1000));
  {
    const msg = await page.$eval('#msg', el => el.textContent);
    check('userA 두 번째 패스키(기기2) 등록 성공', msg.includes('등록 완료'), msg);
  }

  await page.goto(BASE + '/private.html', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 800));
  {
    const rows = await page.$$eval('.passkey-row', els => els.map(e => e.textContent));
    check('패스키 목록에 2개 표시', rows.length === 2, JSON.stringify(rows));

    await page.click('.del'); // 1번째 클릭: "정말 삭제?"로 바뀜
    await new Promise(r => setTimeout(r, 200));
    await page.click('.del'); // 2번째 클릭: 실제 삭제 실행
    await new Promise(r => setTimeout(r, 800));
  }

  await page.evaluate(() => location.reload());
  await new Promise(r => setTimeout(r, 800));
  {
    const rows = await page.$$eval('.passkey-row', els => els.map(e => e.textContent)).catch(() => []);
    check('패스키 하나 삭제 후 목록에 1개만 남음', rows.length === 1, JSON.stringify(rows));
  }

  await page.click('#logoutBtn');
  await new Promise(r => setTimeout(r, 500));

  await client.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: auth1 }).catch(() => {});

  await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' });
  await page.type('#username', userA);
  await page.click('#loginBtn');
  await new Promise(r => setTimeout(r, 1500));
  check('삭제된 패스키를 제외하고 남은 패스키(기기2)로 로그인 성공', page.url().includes('private.html'), page.url());

  await page.click('#logoutBtn');
  await new Promise(r => setTimeout(r, 500));
  await page.goto(BASE + '/private.html', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 500));
  {
    const apiResp = lastResponseFor('/api/whoami');
    check('로그아웃 후 다시 접속 시 401 (재로그인 필요)', apiResp && apiResp.status === 401, JSON.stringify(apiResp));
  }

  // ── 카드5: userB 계정 만들어 교차 접근 테스트 ─────────────
  // 한 번에 하나의 인증기만 붙어 있어야 브라우저가 헷갈리지 않으므로 userA 것은 제거
  await client.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: auth2 }).catch(() => {});
  await newAuthenticator(client);
  await page.goto(BASE + '/register.html', { waitUntil: 'domcontentloaded' });
  await page.type('#username', userB);
  await page.type('#deviceName', 'userB 기기');
  await page.click('#registerBtn');
  await new Promise(r => setTimeout(r, 1000));
  {
    const msg = await page.$eval('#msg', el => el.textContent);
    check('userB 패스키 등록 성공', msg.includes('등록 완료'), msg);
  }

  await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' });
  await page.type('#username', userB);
  await page.click('#loginBtn');
  await new Promise(r => setTimeout(r, 1500));
  await new Promise(r => setTimeout(r, 1500));
  check('userB 로그인 후 private.html에 있음', page.url().includes('private.html'), page.url());
  {
    const loginMsg = await page.$eval('#msg', el => el.textContent).catch(() => '(msg 요소 없음 - 이미 이동함)');
    const html = await page.content();
    const sectionsHtml = await page.$eval('#contentSections', el => el.innerHTML).catch(e => 'ERR:' + e.message + ' | loginMsg=' + loginMsg);
    check('userB는 자기 콘텐츠(보드게임)만 보임', html.includes('보드게임 리메이크'), sectionsHtml.slice(0, 300));
    check('userB 화면에 userA의 콘텐츠(로그라이크)는 안 보임', !html.includes('로그라이크'));
  }

  console.log(`\n=== 결과: ${passed} PASS / ${failed} FAIL ===`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('E2E TEST CRASHED:', e.message); process.exit(1); });
