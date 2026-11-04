/* ============================================================
   worker/index.js — 다이즈하이미디어 공식 문서 시스템 (Cloudflare Pages의 _worker.js)

   빌드 때 dist/_worker.js로 복사되어(scripts/build-pages.mjs) 모든 요청을
   먼저 받습니다(Pages advanced mode). 하는 일:

   1) 로그인 — 메일(아이디)·비밀번호. 비밀번호는 PBKDF2로 해시해 D1에만 저장,
      브라우저에는 무작위 세션 토큰 쿠키(HttpOnly·Secure)만 둡니다.
      5번 틀리면 15분 잠금, 같은 IP에서 15분에 20번 넘게 틀리면 차단.
      관리자가 정해 준 첫 비밀번호·초기화 비밀번호는 로그인 직후 바꿔야 합니다.
   2) 직원 명부(D1) 확인 — 허용 도메인 메일인지, 퇴사 처리된 사람인지, 관리자인지.
   3) 사이트 파일 제공 — 기존 정적 사이트(템플릿·포털)를 그대로 내보냅니다.
   4) API
        POST /api/login, /api/logout, /api/password, /api/setup(초기 관리자)
        GET  /api/me             로그인한 사람 정보
        GET  /api/senders.js     직원 명부의 발신인을 DISE.senders에 합쳐 주는 스크립트
        POST /api/pdf            문서 HTML → PDF (Cloudflare Browser Rendering)
        /api/admin/*             관리자 전용(직원 명부·비밀번호 초기화·도메인·작업 기록)
   ============================================================ */

import puppeteer from '@cloudflare/puppeteer';

const STATUSES = ['재직', '휴직', '퇴사'];
const ROLES = ['admin', 'hr', 'member'];
const ROLE_NAMES = { admin: '관리자', hr: '인사담당', member: '일반' };
// 관리자: 전부 / 인사담당: 직원 명부(추가·수정·퇴사·삭제·비밀번호 발급)만 — 도메인·권한 지정·관리자/인사담당 계정은 불가
function canManageStaff(u) { return u && (u.role === 'admin' || u.role === 'hr'); }
const EMP_FIELDS = ['company', 'email', 'name_kr', 'name_en', 'dept', 'title_kr', 'title_en',
  'mobile', 'phone', 'hire_date', 'leave_date', 'status', 'role', 'is_sender', 'sort_order', 'memo'];
const SESSION_COOKIE = 'dise_session';
const SESSION_HOURS = 12;
const PBKDF2_ITER = 100000; // Workers의 PBKDF2 최대 반복 횟수
const MAX_FAILS = 5, LOCK_MIN = 15, IP_MAX_FAILS = 20;

export default {
  async fetch(request, env, ctx) {
    try {
      return withSecurityHeaders(await handle(request, env, ctx));
    } catch (err) {
      console.error(err);
      return withSecurityHeaders(json({ error: '서버 오류: ' + (err && err.message || err) }, 500));
    }
  }
};

async function handle(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!env.DB) return htmlPage(503, '설정 오류', 'DB(D1)가 연결되지 않았습니다.', '');

  // 쓰기 요청은 같은 사이트에서 온 것만(CSRF 방지) — 로그인 전 요청 포함
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('Origin');
    if (!origin || origin !== url.origin) return json({ error: '허용되지 않은 요청 출처입니다.' }, 403);
  }

  // ---- 로그인 없이 열리는 곳 ----
  if (path === '/login' || path === '/login/') return loginPage(env, url);
  if (path === '/setup' || path === '/setup/') return setupPage(env);
  if (path === '/api/login' && request.method === 'POST') return apiLogin(request, env);
  if (path === '/api/setup' && request.method === 'POST') return apiSetup(request, env);
  if (path === '/logout' || path === '/api/logout') return logout(request, env);
  if (path === '/favicon.ico') return new Response(null, { status: 204 });
  if (path.startsWith('/_worker') || path === '/_routes.json') return new Response('Not found', { status: 404 });

  // ---- 1) 로그인 확인 ----
  const user = await currentUser(request, env);
  if (!user) {
    if (path.startsWith('/api/')) return json({ error: '로그인이 필요합니다.' }, 401);
    const next = path + url.search;
    return Response.redirect(url.origin + '/login?next=' + encodeURIComponent(next), 302);
  }

  // ---- 2) 직원 상태 확인 ----
  const block = await checkEmployee(user, env);
  if (block) return block;

  if (isNavigation(request)) {
    ctx.waitUntil(env.DB.prepare(
      "UPDATE employees SET last_seen_at = datetime('now') WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < datetime('now','-10 minutes'))"
    ).bind(user.id).run().catch(() => {}));
  }

  // 첫 로그인·초기화 후에는 비밀번호부터 바꾸기
  if (path === '/account/password' || path === '/account/password/') return passwordPage(user);
  if (path === '/api/password' && request.method === 'POST') return apiPassword(request, env, user);
  if (user.must_change_password) {
    if (path.startsWith('/api/')) return json({ error: '비밀번호를 먼저 바꿔 주세요.' }, 403);
    return Response.redirect(url.origin + '/account/password', 302);
  }

  // ---- 3) API ----
  if (path === '/api/me') return json(publicUser(user));
  let pm = path.match(/^\/api\/photo\/(\d+)$/);
  if (pm && request.method === 'GET') return getPhoto(env, user, Number(pm[1]));
  if (path === '/api/senders.js') return sendersScript(env);
  if (path === '/api/pdf') return handlePdf(request, env, url);
  if (path.startsWith('/api/admin/')) {
    if (!canManageStaff(user)) return json({ error: '관리자·인사담당만 사용할 수 있습니다.' }, 403);
    if (user.role !== 'admin' && path.startsWith('/api/admin/domains')) return json({ error: '로그인 허용 도메인은 관리자만 바꿀 수 있습니다.' }, 403);
    return handleAdmin(request, env, url, user);
  }
  if (path.startsWith('/api/')) return json({ error: '없는 API입니다.' }, 404);

  // ---- 관리자 페이지 ----
  if (path === '/admin' || path.startsWith('/admin/')) {
    if (!canManageStaff(user)) return htmlPage(403, '관리자 전용', '관리자 페이지는 관리자·인사담당 직원만 열 수 있습니다.', '<a href="/">문서 시스템으로 돌아가기</a>');
  }

  // ---- 4) 사이트 파일 ----
  return env.ASSETS.fetch(request);
}

/* ------------------------------------------------------------
   비밀번호·세션
   ------------------------------------------------------------ */
async function hashPassword(password, saltB64) {
  const salt = saltB64 ? b64ToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256);
  return `pbkdf2$${PBKDF2_ITER}$${bytesToB64(salt)}$${bytesToB64(new Uint8Array(bits))}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const again = await hashPassword(password, parts[2]);
  return timingSafeEqual(again, stored);
}

function timingSafeEqual(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function passwordProblem(pw, email) {
  pw = String(pw || '');
  if (pw.length < 8) return '비밀번호는 8자 이상이어야 합니다.';
  if (pw.length > 128) return '비밀번호가 너무 깁니다.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return '비밀번호에 영문과 숫자를 함께 넣어 주세요.';
  if (email && pw.toLowerCase().includes(email.split('@')[0].toLowerCase())) return '비밀번호에 아이디(메일 앞부분)를 넣을 수 없습니다.';
  return '';
}

function tempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const r = crypto.getRandomValues(new Uint8Array(12));
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[r[i] % chars.length];
  return s.slice(0, 5) + '-' + s.slice(5) + (r[10] % 10); // 예: Ab3kP-qR7mz4
}

async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function currentUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || token.length < 30) return null;
  const th = await sha256Hex(token);
  return env.DB.prepare(
    "SELECT e.* FROM sessions s JOIN employees e ON e.id = s.employee_id WHERE s.token_hash = ? AND s.expires_at > datetime('now')"
  ).bind(th).first();
}

function adminEmails(env) {
  return String(env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

async function checkEmployee(emp, env) {
  const isBootstrapAdmin = adminEmails(env).includes(emp.email.toLowerCase());
  if (isBootstrapAdmin) { emp.role = 'admin'; return null; } // 초기 관리자는 잠기지 않도록
  if (emp.status === '퇴사') return htmlPage(403, '접속이 차단된 계정', '퇴사 처리된 계정이라 문서 시스템을 사용할 수 없습니다.', '잘못 처리된 경우 관리자에게 문의하세요. <a href="/logout">로그아웃</a>');
  const domain = emp.email.split('@')[1] || '';
  const dom = await env.DB.prepare('SELECT 1 FROM allowed_domains WHERE domain = ? AND active = 1').bind(domain).first();
  if (!dom) return htmlPage(403, '접속 권한 없음', '이 메일 도메인은 문서 시스템 사용이 허용되지 않았습니다.', '관리자에게 문의하세요. <a href="/logout">로그아웃</a>');
  return null;
}

function clientIp(request) { return request.headers.get('CF-Connecting-IP') || ''; }

async function apiLogin(request, env) {
  let b; try { b = await request.json(); } catch (e) { return json({ error: '잘못된 요청입니다.' }, 400); }
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const ip = clientIp(request);
  const fail = msg => json({ error: msg || '메일 또는 비밀번호가 맞지 않습니다.' }, 401);

  const ipFails = await env.DB.prepare(`SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND at > datetime('now','-${LOCK_MIN} minutes')`).bind(ip).first();
  if (ipFails && ipFails.n >= IP_MAX_FAILS) return fail('로그인 시도가 너무 많습니다. 15분 뒤에 다시 시도해 주세요.');

  const emp = email ? await env.DB.prepare('SELECT * FROM employees WHERE email = ?').bind(email).first() : null;
  if (!emp || !emp.password_hash) {
    await hashPassword(password || 'x'); // 응답 시간으로 계정 존재 여부를 알 수 없게
    await env.DB.prepare('INSERT INTO login_attempts (ip) VALUES (?)').bind(ip).run();
    if (emp && !emp.password_hash && adminEmails(env).includes(email)) return fail('처음 쓰는 관리자 계정입니다. 아래 "초기 관리자 설정"에서 비밀번호를 만들어 주세요.');
    return fail(emp && !emp.password_hash ? '아직 비밀번호가 없는 계정입니다. 관리자에게 첫 비밀번호를 받아 주세요.' : '');
  }
  if (emp.locked_until && emp.locked_until > sqlNow()) return fail(`비밀번호를 여러 번 틀려 잠시 잠겼습니다. ${LOCK_MIN}분 뒤에 다시 시도하거나 관리자에게 초기화를 요청하세요.`);

  const ok = await verifyPassword(password, emp.password_hash);
  if (!ok) {
    const n = (emp.failed_logins || 0) + 1;
    const lock = n >= MAX_FAILS ? `datetime('now','+${LOCK_MIN} minutes')` : 'NULL';
    await env.DB.batch([
      env.DB.prepare(`UPDATE employees SET failed_logins = ?, locked_until = ${lock} WHERE id = ?`).bind(n >= MAX_FAILS ? 0 : n, emp.id),
      env.DB.prepare('INSERT INTO login_attempts (ip) VALUES (?)').bind(ip)
    ]);
    if (n >= MAX_FAILS) await log(env, email, '로그인 잠금', email, `${MAX_FAILS}회 실패`);
    return fail(n >= MAX_FAILS ? `비밀번호를 ${MAX_FAILS}번 틀려 ${LOCK_MIN}분 동안 잠겼습니다.` : `메일 또는 비밀번호가 맞지 않습니다. (${n}/${MAX_FAILS})`);
  }

  const block = await checkEmployee(emp, env);
  if (block) return json({ error: emp.status === '퇴사' ? '퇴사 처리된 계정입니다.' : '이 메일 도메인은 사용이 허용되지 않았습니다.' }, 403);

  const token = bytesToB64url(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO sessions (token_hash, employee_id, expires_at, ip, user_agent) VALUES (?, ?, datetime('now','+${SESSION_HOURS} hours'), ?, ?)`)
      .bind(await sha256Hex(token), emp.id, ip, (request.headers.get('User-Agent') || '').slice(0, 200)),
    env.DB.prepare("UPDATE employees SET failed_logins = 0, locked_until = NULL, last_seen_at = datetime('now') WHERE id = ?").bind(emp.id),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')"),
    env.DB.prepare("DELETE FROM login_attempts WHERE at < datetime('now','-1 day')")
  ]);
  const next = safeNext(b.next);
  const res = json({ ok: true, next: emp.must_change_password ? '/account/password' : next });
  res.headers.append('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}`);
  return res;
}

async function logout(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  const res = new Response(null, { status: 302, headers: { Location: '/login' } });
  res.headers.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return res;
}

async function apiPassword(request, env, user) {
  let b; try { b = await request.json(); } catch (e) { return json({ error: '잘못된 요청입니다.' }, 400); }
  if (!(await verifyPassword(String(b.current || ''), user.password_hash))) return json({ error: '지금 비밀번호가 맞지 않습니다.' }, 400);
  const problem = passwordProblem(b.password, user.email);
  if (problem) return json({ error: problem }, 400);
  if (b.password === b.current) return json({ error: '지금과 다른 비밀번호로 바꿔 주세요.' }, 400);
  const token = readCookie(request, SESSION_COOKIE);
  await env.DB.batch([
    env.DB.prepare("UPDATE employees SET password_hash = ?, must_change_password = 0, password_changed_at = datetime('now') WHERE id = ?").bind(await hashPassword(b.password), user.id),
    // 다른 기기의 로그인은 모두 끊기(지금 기기만 유지)
    env.DB.prepare('DELETE FROM sessions WHERE employee_id = ? AND token_hash != ?').bind(user.id, await sha256Hex(token || ''))
  ]);
  await log(env, user.email, '비밀번호 변경', user.email, '본인');
  return json({ ok: true, next: '/' });
}

/* 초기 관리자(ADMIN_EMAILS) 첫 비밀번호 — 비밀값 SETUP_CODE를 아는 사람만, 비밀번호가 아직 없을 때만 */
async function apiSetup(request, env) {
  let b; try { b = await request.json(); } catch (e) { return json({ error: '잘못된 요청입니다.' }, 400); }
  const email = String(b.email || '').trim().toLowerCase();
  const ip = clientIp(request);
  const ipFails = await env.DB.prepare(`SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND at > datetime('now','-${LOCK_MIN} minutes')`).bind(ip).first();
  if (ipFails && ipFails.n >= IP_MAX_FAILS) return json({ error: '시도가 너무 많습니다. 15분 뒤에 다시 시도해 주세요.' }, 429);
  if (!env.SETUP_CODE || String(env.SETUP_CODE).length < 8) return json({ error: '설정 코드가 아직 적용되지 않았습니다. PC에서 `npx wrangler pages secret put SETUP_CODE`로 등록(8자 이상)한 뒤 `npm run deploy`로 다시 배포하세요.' }, 400);
  if (!adminEmails(env).includes(email)) return json({ error: '초기 관리자 메일이 아닙니다.' }, 400);
  if (!timingSafeEqual(String(b.code || ''), String(env.SETUP_CODE))) {
    await env.DB.prepare('INSERT INTO login_attempts (ip) VALUES (?)').bind(ip).run();
    return json({ error: '설정 코드가 맞지 않습니다.' }, 400);
  }
  const emp = await env.DB.prepare('SELECT * FROM employees WHERE email = ?').bind(email).first();
  if (emp && emp.password_hash) return json({ error: '이미 비밀번호가 있는 계정입니다. 로그인 화면을 이용하세요.' }, 400);
  const problem = passwordProblem(b.password, email);
  if (problem) return json({ error: problem }, 400);
  const hash = await hashPassword(b.password);
  if (emp) await env.DB.prepare("UPDATE employees SET password_hash = ?, must_change_password = 0, password_changed_at = datetime('now') WHERE id = ?").bind(hash, emp.id).run();
  else await env.DB.prepare("INSERT INTO employees (company, email, name_kr, role, password_hash, password_changed_at, memo) VALUES ('disehimedia', ?, ?, 'admin', ?, datetime('now'), '초기 관리자')").bind(email, email.split('@')[0], hash).run();
  await log(env, email, '초기 관리자 비밀번호 설정', email, '');
  return json({ ok: true });
}

function safeNext(n) {
  n = String(n || '/');
  return (n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login') && !n.startsWith('/setup')) ? n : '/';
}

function publicUser(u) {
  return {
    email: u.email, company: u.company, nameKr: u.name_kr, nameEn: u.name_en, dept: u.dept,
    titleKr: u.title_kr, titleEn: u.title_en, mobile: u.mobile, phone: u.phone,
    status: u.status, role: u.role, roleName: ROLE_NAMES[u.role] || u.role,
    isAdmin: u.role === 'admin', isHR: u.role === 'hr', canManageStaff: canManageStaff(u), logoutUrl: '/logout',
    passwordUrl: '/account/password'
  };
}

/* ------------------------------------------------------------
   발신인 스크립트 — 기존 sender-info.js 목록 위에 직원 명부를 합칩니다.
   ------------------------------------------------------------ */
async function sendersScript(env) {
  const { results: rows } = await env.DB.prepare(
    "SELECT * FROM employees WHERE is_sender = 1 AND status != '퇴사' ORDER BY company, sort_order, name_kr").all();
  const { results: gone } = await env.DB.prepare("SELECT email FROM employees WHERE status = '퇴사'").all();
  const add = {};
  for (const r of rows) {
    (add[r.company] = add[r.company] || []).push({
      id: 'emp-' + r.id, nameKr: r.name_kr, nameEn: r.name_en,
      title: [r.title_kr, r.title_en].filter(Boolean).join(' | '),
      phone: r.mobile || r.phone, email: r.email
    });
  }
  const js = `/* 직원 명부(관리자 페이지)에서 자동 생성 */
(function () {
  var D = window.DISE = window.DISE || {}; D.senders = D.senders || {};
  var add = ${JSON.stringify(add).replace(/</g, '\\u003c')};
  var gone = ${JSON.stringify(gone.map(g => g.email.toLowerCase())).replace(/</g, '\\u003c')};
  function key(p) { return (p && p.email || '').toLowerCase(); }
  Object.keys(D.senders).forEach(function (co) {
    D.senders[co] = D.senders[co].filter(function (p) { return !key(p) || gone.indexOf(key(p)) < 0; });
  });
  Object.keys(add).forEach(function (co) {
    var list = D.senders[co] = D.senders[co] || [];
    add[co].forEach(function (p) {
      for (var i = 0; i < list.length; i++) {
        if (key(list[i]) && key(list[i]) === key(p)) { p.id = list[i].id; if (list[i].isDefault) p.isDefault = true; list[i] = p; return; }
      }
      list.push(p);
    });
  });
})();
`;
  return new Response(js, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/* ------------------------------------------------------------
   PDF — Cloudflare Browser Rendering. 사이트 파일은 ASSETS에서 직접 넣습니다.
   ------------------------------------------------------------ */
async function handlePdf(request, env, url) {
  if (request.method !== 'POST') return json({ error: 'POST 요청만 지원합니다.' }, 405);
  if (!env.BROWSER) return json({ error: 'PDF 기능(Browser Rendering)이 아직 연결되지 않았습니다. 인쇄하기를 이용해 주세요.' }, 501);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: '잘못된 요청입니다.' }, 400); }
  const html = body && body.html;
  if (!html || typeof html !== 'string') return json({ error: 'html 필드가 필요합니다.' }, 400);
  if (html.length > 20 * 1024 * 1024) return json({ error: '문서 용량이 너무 큽니다. 삽입한 이미지를 줄여 주세요.' }, 413);
  const m = html.match(/<base\s+href=["']([^"']+)["']/i);
  let baseHref = m ? m[1].replace(/&amp;/g, '&') : '';
  try { if (new URL(baseHref).origin !== url.origin) baseHref = ''; } catch (e) { baseHref = ''; }
  if (!baseHref) return json({ error: '허용되지 않은 문서 출처입니다.' }, 400);
  const fileName = String(body.fileName || 'document').replace(/[\\/:*?"<>|\r\n]/g, '').trim() || 'document';

  let browser;
  try { browser = await puppeteer.launch(env.BROWSER); }
  catch (e) { return json({ error: 'PDF 서버가 바쁘거나 오늘 무료 사용량을 다 썼습니다. 잠시 뒤 다시 하거나 "인쇄하기"를 이용해 주세요.' }, 503); }
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1600 });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    await page.setRequestInterception(true);
    page.on('request', async req => {
      try {
        const u = req.url();
        if (u === baseHref) return req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
        const ru = new URL(u);
        if (ru.origin === url.origin) {
          if (ru.pathname.startsWith('/api/')) return req.respond({ status: 204, body: '' });
          const res = await env.ASSETS.fetch(new Request(ru.toString()));
          const buf = new Uint8Array(await res.arrayBuffer());
          return req.respond({ status: res.status, headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream' }, body: buf });
        }
        return req.continue();
      } catch (e) {
        try { req.abort(); } catch (e2) { /* ignore */ }
      }
    });
    await page.goto(baseHref, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => (document.fonts && document.fonts.ready) ? document.fonts.ready : null);
    await page.emulateMediaType('print');
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    const ascii = fileName.replace(/[^\x20-\x7E]/g, '_') || 'document';
    return new Response(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}.pdf`,
        'Cache-Control': 'no-store'
      }
    });
  } finally {
    await browser.close().catch(() => {});
  }
}

/* ------------------------------------------------------------
   관리자 API
   ------------------------------------------------------------ */
const EMP_COLUMNS = 'id, company, email, name_kr, name_en, dept, title_kr, title_en, mobile, phone, hire_date, leave_date, status, role, is_sender, sort_order, memo, created_at, updated_at, last_seen_at, must_change_password, locked_until, password_changed_at, (password_hash IS NOT NULL) AS has_password, (SELECT updated_at FROM employee_photos p WHERE p.employee_id = employees.id) AS photo_updated_at';

/* 인사담당이 할 수 없는 일 — 관리자면 항상 통과('' 반환) */
function staffGuard(env, user, target, data) {
  if (user.role === 'admin') return '';
  if (data && data.role !== undefined && data.role !== (target ? target.role : 'member')) return '권한(관리자·인사담당) 지정은 관리자만 할 수 있습니다.';
  if (target && target.email !== user.email && (target.role === 'admin' || target.role === 'hr' || adminEmails(env).includes(target.email)))
    return '관리자·인사담당 계정은 관리자만 바꿀 수 있습니다.';
  return '';
}

async function handleAdmin(request, env, url, user) {
  const path = url.pathname.replace(/^\/api\/admin/, '');
  const method = request.method;
  const actor = user.email;

  if (path === '/status' && method === 'GET') {
    const counts = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM employees GROUP BY status').all();
    const nopw = await env.DB.prepare("SELECT COUNT(*) AS n FROM employees WHERE password_hash IS NULL AND status != '퇴사'").first();
    return json({ pdf: !!env.BROWSER, counts: counts.results, noPassword: nopw.n, adminEmails: adminEmails(env), me: publicUser(user) });
  }

  // 직원 명부
  if (path === '/employees' && method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT ${EMP_COLUMNS} FROM employees ORDER BY company, CASE status WHEN '재직' THEN 0 WHEN '휴직' THEN 1 ELSE 2 END, sort_order, name_kr`).all();
    return json(results);
  }
  if (path === '/employees' && method === 'POST') {
    const raw = await request.json();
    const data = cleanEmployee(raw, true);
    if (data.error) return json(data, 400);
    const g = staffGuard(env, user, null, data);
    if (g) return json({ error: g }, 403);
    const domErr = await domainError(env, data.email);
    if (domErr) return json({ error: domErr }, 400);
    let temp = '';
    if (raw.password) {
      const problem = passwordProblem(raw.password, data.email);
      if (problem) return json({ error: problem }, 400);
      temp = raw.password;
    } else temp = tempPassword();
    data.password_hash = await hashPassword(temp);
    data.must_change_password = 1;
    try {
      const r = await insertEmployee(env, data);
      await log(env, actor, '직원 추가', data.email, data.name_kr);
      return json({ ok: true, id: r.meta.last_row_id, tempPassword: raw.password ? '' : temp });
    } catch (e) {
      if (/UNIQUE/i.test(e.message)) return json({ error: '이미 등록된 메일입니다: ' + data.email }, 409);
      throw e;
    }
  }
  if (path === '/employees/import' && method === 'POST') {
    const rows = await request.json();
    if (!Array.isArray(rows)) return json({ error: '목록 형식이 아닙니다.' }, 400);
    let added = 0, updated = 0; const errors = [], passwords = [];
    for (let i = 0; i < rows.length; i++) {
      const data = cleanEmployee(rows[i], true);
      if (data.error) { errors.push((i + 2) + '행: ' + data.error); continue; }
      const exist = await env.DB.prepare('SELECT id, email, role FROM employees WHERE email = ?').bind(data.email).first();
      const g = staffGuard(env, user, exist, data);
      if (g) { errors.push((i + 2) + '행: ' + g); continue; }
      if (exist) {
        const r = await updateEmployee(env, exist.id, data, actor, user);
        if (r.error) errors.push((i + 2) + '행: ' + r.error); else updated++;
      } else {
        const domErr = await domainError(env, data.email);
        if (domErr) { errors.push((i + 2) + '행: ' + domErr); continue; }
        const temp = tempPassword();
        data.password_hash = await hashPassword(temp); data.must_change_password = 1;
        await insertEmployee(env, data); added++;
        passwords.push({ email: data.email, name: data.name_kr || '', tempPassword: temp });
      }
    }
    await log(env, actor, '명부 가져오기', '', `추가 ${added} · 갱신 ${updated} · 오류 ${errors.length}`);
    return json({ ok: true, added, updated, errors, passwords });
  }
  let m = path.match(/^\/employees\/(\d+)\/reset-password$/);
  if (m && method === 'POST') {
    const id = Number(m[1]);
    const emp = await env.DB.prepare('SELECT email, name_kr, role FROM employees WHERE id = ?').bind(id).first();
    if (!emp) return json({ error: '없는 직원입니다.' }, 404);
    if (emp.email === actor) return json({ error: '본인 비밀번호는 "비밀번호 바꾸기"에서 바꿔 주세요.' }, 400);
    const g = staffGuard(env, user, emp, null);
    if (g) return json({ error: g }, 403);
    const temp = tempPassword();
    await env.DB.batch([
      env.DB.prepare('UPDATE employees SET password_hash = ?, must_change_password = 1, failed_logins = 0, locked_until = NULL WHERE id = ?').bind(await hashPassword(temp), id),
      env.DB.prepare('DELETE FROM sessions WHERE employee_id = ?').bind(id)
    ]);
    await log(env, actor, '비밀번호 초기화', emp.email, emp.name_kr);
    return json({ ok: true, tempPassword: temp });
  }
  m = path.match(/^\/employees\/(\d+)\/photo$/);
  if (m && (method === 'PUT' || method === 'DELETE')) {
    const id = Number(m[1]);
    const emp = await env.DB.prepare('SELECT id, email, name_kr, role FROM employees WHERE id = ?').bind(id).first();
    if (!emp) return json({ error: '없는 직원입니다.' }, 404);
    const g = staffGuard(env, user, emp, null);
    if (g) return json({ error: g }, 403);
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM employee_photos WHERE employee_id = ?').bind(id).run();
      await log(env, actor, '사진 삭제', emp.email, emp.name_kr);
      return json({ ok: true });
    }
    const mime = (request.headers.get('Content-Type') || '').split(';')[0].trim();
    if (!PHOTO_TYPES.includes(mime)) return json({ error: '사진은 JPG·PNG·WEBP만 올릴 수 있습니다.' }, 400);
    const buf = new Uint8Array(await request.arrayBuffer());
    if (!buf.length) return json({ error: '사진 파일이 비어 있습니다.' }, 400);
    if (buf.length > PHOTO_MAX_BYTES) return json({ error: '사진이 너무 큽니다(최대 1.5MB). 다시 선택해 주세요.' }, 413);
    if (!looksLikeImage(buf, mime)) return json({ error: '사진 파일 형식이 올바르지 않습니다.' }, 400);
    await env.DB.prepare("INSERT INTO employee_photos (employee_id, mime, data, bytes, updated_at, updated_by) VALUES (?, ?, ?, ?, datetime('now'), ?) ON CONFLICT(employee_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, bytes = excluded.bytes, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
      .bind(id, mime, buf, buf.length, actor).run();
    await log(env, actor, '사진 등록', emp.email, emp.name_kr + ' · ' + Math.round(buf.length / 1024) + 'KB');
    return json({ ok: true });
  }
  m = path.match(/^\/employees\/(\d+)$/);
  if (m && method === 'PUT') {
    const id = Number(m[1]);
    const data = cleanEmployee(await request.json(), false);
    if (data.error) return json(data, 400);
    const target = await env.DB.prepare('SELECT id, email, role FROM employees WHERE id = ?').bind(id).first();
    if (!target) return json({ error: '없는 직원입니다.' }, 404);
    const g = staffGuard(env, user, target, data);
    if (g) return json({ error: g }, 403);
    const res = await updateEmployee(env, id, data, actor, user);
    return res.error ? json(res, 400) : json({ ok: true });
  }
  if (m && method === 'DELETE') {
    const id = Number(m[1]);
    const emp = await env.DB.prepare('SELECT email, name_kr, role FROM employees WHERE id = ?').bind(id).first();
    if (!emp) return json({ error: '없는 직원입니다.' }, 404);
    if (emp.email === actor) return json({ error: '본인 계정은 삭제할 수 없습니다.' }, 400);
    const g = staffGuard(env, user, emp, null);
    if (g) return json({ error: g }, 403);
    if (adminEmails(env).includes(emp.email)) return json({ error: '초기 관리자(ADMIN_EMAILS)는 삭제할 수 없습니다.' }, 400);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE employee_id = ?').bind(id),
      env.DB.prepare('DELETE FROM employee_photos WHERE employee_id = ?').bind(id),
      env.DB.prepare('DELETE FROM employees WHERE id = ?').bind(id)
    ]);
    await log(env, actor, '직원 삭제', emp.email, emp.name_kr);
    return json({ ok: true });
  }

  // 허용 도메인
  if (path === '/domains' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM allowed_domains ORDER BY company, domain').all();
    return json(results);
  }
  if (path === '/domains' && method === 'POST') {
    const b = await request.json();
    const domain = String(b.domain || '').trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return json({ error: '도메인 형식이 올바르지 않습니다. 예: r2v.co.kr' }, 400);
    await env.DB.prepare('INSERT INTO allowed_domains (domain, company, active) VALUES (?, ?, 1) ON CONFLICT(domain) DO UPDATE SET company = excluded.company, active = 1')
      .bind(domain, String(b.company || '')).run();
    await log(env, actor, '도메인 허용', domain, b.company || '');
    return json({ ok: true });
  }
  m = path.match(/^\/domains\/(.+)$/);
  if (m && method === 'DELETE') {
    const domain = decodeURIComponent(m[1]).toLowerCase();
    if (domain === (actor.split('@')[1] || '')) return json({ error: '본인 메일 도메인은 삭제할 수 없습니다(잠김 방지).' }, 400);
    await env.DB.prepare('DELETE FROM allowed_domains WHERE domain = ?').bind(domain).run();
    await log(env, actor, '도메인 삭제', domain, '그 도메인 직원 접속 차단');
    return json({ ok: true });
  }

  if (path === '/audit' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 300').all();
    return json(results);
  }

  return json({ error: '없는 관리자 API입니다.' }, 404);
}

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX_BYTES = 1.5 * 1024 * 1024; // D1 한 칸 최대 2MB보다 작게

function looksLikeImage(b, mime) {
  if (mime === 'image/jpeg') return b[0] === 0xFF && b[1] === 0xD8;
  if (mime === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
  if (mime === 'image/webp') return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45;
  return false;
}

/* 직원 사진 보기 — 관리자·인사담당 또는 본인만 */
async function getPhoto(env, user, id) {
  if (!(canManageStaff(user) || user.id === id)) return json({ error: '볼 수 없는 사진입니다.' }, 403);
  const row = await env.DB.prepare('SELECT mime, data FROM employee_photos WHERE employee_id = ?').bind(id).first();
  if (!row) return new Response('없음', { status: 404 });
  const bytes = row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : new Uint8Array(row.data);
  return new Response(bytes, { headers: { 'Content-Type': row.mime, 'Cache-Control': 'private, max-age=300', 'Content-Disposition': 'inline' } });
}

async function domainError(env, email) {
  const domain = email.split('@')[1] || '';
  const ok = await env.DB.prepare('SELECT 1 FROM allowed_domains WHERE domain = ? AND active = 1').bind(domain).first();
  return ok ? '' : `@${domain} 은(는) 허용 도메인이 아닙니다. "로그인 허용 도메인"에 먼저 추가하세요.`;
}

function cleanEmployee(b, requireEmail) {
  if (!b || typeof b !== 'object') return { error: '입력값이 없습니다.' };
  const d = {};
  for (const f of EMP_FIELDS) if (b[f] !== undefined && b[f] !== null) d[f] = typeof b[f] === 'string' ? b[f].trim() : b[f];
  if (d.email !== undefined) d.email = String(d.email).toLowerCase();
  if (requireEmail && !d.email) return { error: '메일은 필수입니다.' };
  if (d.email !== undefined && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return { error: '메일 형식이 올바르지 않습니다: ' + d.email };
  if (d.status !== undefined && !STATUSES.includes(d.status)) return { error: '상태는 재직/휴직/퇴사 중 하나입니다.' };
  if (d.role !== undefined) {
    if (d.role === '관리자') d.role = 'admin'; if (d.role === '일반') d.role = 'member'; if (d.role === '인사담당') d.role = 'hr';
    if (!ROLES.includes(d.role)) return { error: '권한은 관리자/인사담당/일반 중 하나입니다.' };
  }
  if (d.is_sender !== undefined) d.is_sender = (d.is_sender === true || d.is_sender === 1 || /^(1|y|yes|o|예|true)$/i.test(String(d.is_sender))) ? 1 : 0;
  if (d.sort_order !== undefined) d.sort_order = parseInt(d.sort_order, 10) || 100;
  for (const k of ['hire_date', 'leave_date']) if (d[k] && !/^\d{4}-\d{2}-\d{2}$/.test(d[k])) return { error: '날짜는 YYYY-MM-DD 형식입니다: ' + d[k] };
  return d;
}

async function insertEmployee(env, d) {
  const cols = Object.keys(d);
  return env.DB.prepare(`INSERT INTO employees (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...cols.map(c => d[c])).run();
}

async function updateEmployee(env, id, d, actor, user) {
  const before = await env.DB.prepare('SELECT * FROM employees WHERE id = ?').bind(id).first();
  if (!before) return { error: '없는 직원입니다.' };
  const protectedAdmin = adminEmails(env).includes(before.email);
  if (before.email === user.email || protectedAdmin) {
    if (d.status === '퇴사' || (d.role !== undefined && d.role !== before.role && !(protectedAdmin && d.role === 'admin')))
      return { error: (protectedAdmin ? '초기 관리자' : '본인 계정') + '은 퇴사 처리나 권한 변경을 할 수 없습니다(잠김 방지).' };
  }
  if (d.email !== undefined && d.email !== before.email) {
    const domErr = await domainError(env, d.email);
    if (domErr) return { error: domErr };
  }
  if (d.status === '퇴사' && !d.leave_date && !before.leave_date) d.leave_date = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const cols = Object.keys(d).filter(c => c !== 'email' || d.email !== before.email ? true : false);
  if (!cols.length) return { ok: true };
  const stmts = [env.DB.prepare(`UPDATE employees SET ${cols.map(c => c + ' = ?').join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...cols.map(c => d[c]), id)];
  if (d.status === '퇴사') stmts.push(env.DB.prepare('DELETE FROM sessions WHERE employee_id = ?').bind(id)); // 즉시 로그아웃
  await env.DB.batch(stmts);
  const changes = cols.filter(c => String(before[c] ?? '') !== String(d[c] ?? '')).map(c => `${c}: ${before[c] ?? ''} → ${d[c]}`);
  let action = '직원 수정';
  if (d.status === '퇴사' && before.status !== '퇴사') action = '퇴사 처리(접속 차단)';
  else if (d.status && d.status !== '퇴사' && before.status === '퇴사') action = '복직(접속 허용)';
  else if (d.role && d.role !== before.role) action = '권한 변경';
  if (changes.length) await log(env, actor, action, before.email, changes.join(' / '));
  return { ok: true };
}

/* ------------------------------------------------------------
   로그인·비밀번호 화면 (Worker가 직접 그림 — 로그인 전에도 열려야 하므로)
   ------------------------------------------------------------ */
const AUTH_CSS = `*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f5f8;color:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR","Malgun Gothic",sans-serif}
.box{background:#fff;border-radius:16px;padding:34px 30px 28px;width:100%;max-width:400px;margin:16px;box-shadow:0 10px 36px rgba(11,35,79,.10)}
.brand{font-size:12px;letter-spacing:.18em;color:#5b6476;margin:0 0 6px}h1{font-size:21px;margin:0 0 22px;color:#0b234f}
label{display:block;font-size:13px;color:#5b6476;margin:14px 0 6px}input{width:100%;font:inherit;font-size:15px;padding:11px 12px;border:1px solid #cfd4df;border-radius:9px}
input:focus{outline:2px solid #2f5fd0;outline-offset:-1px;border-color:#2f5fd0}button{width:100%;margin-top:22px;font:inherit;font-size:15px;font-weight:700;padding:12px;border:0;border-radius:9px;background:#0b234f;color:#fff;cursor:pointer}
button[disabled]{opacity:.6}.err{color:#c0392b;font-size:13.5px;margin:14px 0 0;min-height:1em;line-height:1.5}.hint{font-size:12.5px;color:#7a8191;line-height:1.6;margin:16px 0 0}a{color:#2f5fd0}`;

function authShell(title, inner, script) {
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} · 다이즈하이미디어 문서 시스템</title><style>${AUTH_CSS}</style></head>
<body><div class="box"><p class="brand">DISEHIMEDIA GROUP</p>${inner}</div><script>
function post(u,b){return fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(b)}).then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(!r.ok)throw new Error(j.error||'요청 실패');return j;});});}
${script}</script></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function loginPage(env, url) {
  const next = safeNext(url.searchParams.get('next'));
  return authShell('로그인', `<h1>공식 문서 시스템 로그인</h1>
<form id="f"><label for="email">회사 메일</label><input id="email" type="email" autocomplete="username" required placeholder="name@disehimedia.com">
<label for="pw">비밀번호</label><input id="pw" type="password" autocomplete="current-password" required>
<button id="btn">로그인</button><p class="err" id="err"></p></form>
<p class="hint">비밀번호를 잊었거나 계정이 없으면 관리자에게 요청하세요.<br><a href="/setup">초기 관리자 설정</a></p>`,
  `var NEXT=${JSON.stringify(next)};document.getElementById('f').addEventListener('submit',function(e){e.preventDefault();var b=document.getElementById('btn');b.disabled=true;document.getElementById('err').textContent='';
post('/api/login',{email:document.getElementById('email').value,password:document.getElementById('pw').value,next:NEXT}).then(function(j){location.href=j.next||'/';}).catch(function(x){document.getElementById('err').textContent=x.message;b.disabled=false;});});`);
}

function setupPage(env) {
  return authShell('초기 관리자 설정', `<h1>초기 관리자 비밀번호 만들기</h1>
<form id="f"><label for="email">관리자 메일</label><input id="email" type="email" required autocomplete="username">
<label for="code">설정 코드</label><input id="code" type="password" required autocomplete="off">
<label for="pw">새 비밀번호 (영문+숫자 8자 이상)</label><input id="pw" type="password" required autocomplete="new-password">
<label for="pw2">새 비밀번호 확인</label><input id="pw2" type="password" required autocomplete="new-password">
<button id="btn">비밀번호 만들기</button><p class="err" id="err"></p></form>
<p class="hint">처음 한 번만 쓰는 화면입니다. 설정 코드는 PC에서 <code>npx wrangler pages secret put SETUP_CODE</code>로 직접 정한 값입니다. <a href="/login">로그인으로</a></p>`,
  `document.getElementById('f').addEventListener('submit',function(e){e.preventDefault();var err=document.getElementById('err');err.textContent='';
var p=document.getElementById('pw').value;if(p!==document.getElementById('pw2').value){err.textContent='새 비밀번호가 서로 다릅니다.';return;}
var b=document.getElementById('btn');b.disabled=true;post('/api/setup',{email:document.getElementById('email').value,code:document.getElementById('code').value,password:p}).then(function(){location.href='/login';}).catch(function(x){err.textContent=x.message;b.disabled=false;});});`);
}

function passwordPage(user) {
  const forced = !!user.must_change_password;
  return authShell('비밀번호 바꾸기', `<h1>비밀번호 바꾸기</h1>
${forced ? '<p class="hint" style="margin:0 0 6px;color:#b26a00">처음 로그인했거나 관리자가 초기화한 비밀번호입니다. 새 비밀번호로 바꿔야 계속 쓸 수 있습니다.</p>' : ''}
<form id="f"><p class="hint" style="margin:0">${esc(user.email)}</p><label for="cur">지금 비밀번호</label><input id="cur" type="password" required autocomplete="current-password">
<label for="pw">새 비밀번호 (영문+숫자 8자 이상)</label><input id="pw" type="password" required autocomplete="new-password">
<label for="pw2">새 비밀번호 확인</label><input id="pw2" type="password" required autocomplete="new-password">
<button id="btn">바꾸기</button><p class="err" id="err"></p></form>
<p class="hint">${forced ? '' : '<a href="/">문서 시스템으로</a> · '}<a href="/logout">로그아웃</a></p>`,
  `document.getElementById('f').addEventListener('submit',function(e){e.preventDefault();var err=document.getElementById('err');err.textContent='';
var p=document.getElementById('pw').value;if(p!==document.getElementById('pw2').value){err.textContent='새 비밀번호가 서로 다릅니다.';return;}
var b=document.getElementById('btn');b.disabled=true;post('/api/password',{current:document.getElementById('cur').value,password:p}).then(function(j){location.href=j.next||'/';}).catch(function(x){err.textContent=x.message;b.disabled=false;});});`);
}

/* ------------------------------------------------------------
   공통 도우미
   ------------------------------------------------------------ */
async function log(env, actor, action, target, detail) {
  try {
    await env.DB.prepare('INSERT INTO audit_log (actor, action, target, detail) VALUES (?, ?, ?, ?)').bind(actor, action, target || '', detail || '').run();
  } catch (e) { console.error('audit', e); }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function htmlPage(status, title, message, extraHtml) {
  const body = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · 다이즈하이미디어 문서 시스템</title><style>${AUTH_CSS}p{line-height:1.6;color:#4a5368}</style></head>
<body><div class="box"><p class="brand">DISEHIMEDIA GROUP</p><h1>${esc(title)}</h1><p>${esc(message)}</p><p>${extraHtml || ''}</p></div></body></html>`;
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function withSecurityHeaders(res) {
  const r = new Response(res.body, res);
  r.headers.set('X-Content-Type-Options', 'nosniff');
  r.headers.set('X-Frame-Options', 'SAMEORIGIN');
  r.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  r.headers.set('Strict-Transport-Security', 'max-age=31536000');
  r.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  r.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return r;
}

function isNavigation(request) {
  return request.method === 'GET' && (request.headers.get('Accept') || '').includes('text/html');
}

function readCookie(request, name) {
  const c = request.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : '';
}

function sqlNow() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
function bytesToB64(b) { let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); }
function bytesToB64url(b) { return bytesToB64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64ToBytes(s) { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
