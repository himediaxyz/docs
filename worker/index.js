/* ============================================================
   worker/index.js — 다이즈하이미디어 공식 문서 시스템 (Cloudflare Worker)

   모든 요청이 이 Worker를 먼저 지나갑니다(wrangler.jsonc의
   assets.run_worker_first). 하는 일:

   1) 로그인 확인 — Cloudflare Access가 붙여주는 JWT(Cf-Access-Jwt-Assertion)를
      서명·만료·AUD까지 직접 검증합니다. Access 설정이 빠져 있으면 문을
      열지 않습니다(fail closed).
   2) 직원 명부(D1) 확인 — 허용 도메인 메일인지, 퇴사 처리된 사람인지,
      관리자인지. 명부에 없는 회사 메일로 처음 들어오면 '일반'으로 자동 등록.
   3) 사이트 파일 제공 — 기존 정적 사이트(템플릿·포털)를 그대로 내보냅니다.
   4) API
        GET  /api/me             로그인한 사람 정보
        GET  /api/senders.js     직원 명부의 발신인을 DISE.senders에 합쳐 주는 스크립트
        POST /api/pdf            문서 HTML → PDF (Cloudflare Browser Rendering)
        /api/admin/*             관리자 전용(직원 명부·도메인·작업 기록·설정 상태)
   ============================================================ */

import puppeteer from '@cloudflare/puppeteer';

const STATUSES = ['재직', '휴직', '퇴사'];
const ROLES = ['admin', 'member'];
const EMP_FIELDS = ['company', 'email', 'name_kr', 'name_en', 'dept', 'title_kr', 'title_en',
  'mobile', 'phone', 'hire_date', 'leave_date', 'status', 'role', 'is_sender', 'sort_order', 'memo'];

export default {
  async fetch(request, env, ctx) {
    try {
      const res = await handle(request, env, ctx);
      return withSecurityHeaders(res);
    } catch (err) {
      console.error(err);
      return withSecurityHeaders(json({ error: '서버 오류: ' + (err && err.message || err) }, 500));
    }
  }
};

async function handle(request, env, ctx) {
  const url = new URL(request.url);

  // ---- 1) 로그인 확인 ----
  const auth = await authenticate(request, env);
  if (auth.response) return auth.response;
  const email = auth.email;

  // ---- 2) 직원 명부 확인 ----
  const gate = await authorize(email, env);
  if (gate.response) return gate.response;
  const user = gate.user;

  if (isNavigation(request) && user.id) {
    ctx.waitUntil(env.DB.prepare(
      "UPDATE employees SET last_seen_at = datetime('now') WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < datetime('now','-10 minutes'))"
    ).bind(user.id).run().catch(() => {}));
  }

  // 쓰기 요청은 같은 사이트에서 온 것만(CSRF 방지)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('Origin');
    if (!origin || origin !== url.origin) return json({ error: '허용되지 않은 요청 출처입니다.' }, 403);
  }

  const path = url.pathname;

  // ---- 3) API ----
  if (path === '/api/me') return json(publicUser(user));
  if (path === '/api/senders.js') return sendersScript(env);
  if (path === '/api/pdf') return handlePdf(request, env, url);
  if (path.startsWith('/api/admin/')) {
    if (user.role !== 'admin') return json({ error: '관리자만 사용할 수 있습니다.' }, 403);
    return handleAdmin(request, env, url, user);
  }
  if (path.startsWith('/api/')) return json({ error: '없는 API입니다.' }, 404);

  // ---- 관리자 페이지 ----
  if (path === '/admin' || path.startsWith('/admin/')) {
    if (user.role !== 'admin') return htmlPage(403, '관리자 전용', '관리자 페이지는 관리자 권한이 있는 직원만 열 수 있습니다.', '<a href="/">문서 시스템으로 돌아가기</a>');
  }

  // ---- 4) 사이트 파일 ----
  return env.ASSETS.fetch(request);
}

/* ------------------------------------------------------------
   로그인 (Cloudflare Access JWT 검증)
   ------------------------------------------------------------ */
let certCache = { at: 0, keys: null, team: '' };

async function authenticate(request, env) {
  // 로컬 개발(wrangler dev)에서만 .dev.vars의 DEV_USER_EMAIL 사용
  if (env.DEV_USER_EMAIL) {
    const host = new URL(request.url).hostname;
    if (host === 'localhost' || host === '127.0.0.1') return { email: env.DEV_USER_EMAIL.toLowerCase() };
  }
  const team = (env.ACCESS_TEAM_DOMAIN || '').replace(/\/+$/, '');
  const aud = env.ACCESS_AUD || '';
  if (!team || !aud) {
    return { response: htmlPage(503, '로그인 설정 전', '아직 로그인(Cloudflare Access) 설정이 끝나지 않아 사이트를 열 수 없습니다.', '관리자: wrangler.jsonc의 ACCESS_TEAM_DOMAIN · ACCESS_AUD 값을 채워 다시 배포하세요.') };
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || readCookie(request, 'CF_Authorization');
  if (!token) return { response: htmlPage(401, '로그인 필요', '회사 메일로 로그인한 뒤 이용할 수 있습니다.', '<a href="/">다시 시도</a>') };
  try {
    const payload = await verifyJwt(token, team, aud);
    if (!payload.email) throw new Error('메일 정보 없음');
    return { email: String(payload.email).toLowerCase() };
  } catch (e) {
    return { response: htmlPage(401, '로그인 확인 실패', '로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.', '<a href="/cdn-cgi/access/logout">다시 로그인</a>') };
  }
}

async function verifyJwt(token, team, aud) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('형식 오류');
  const header = JSON.parse(b64urlToString(parts[0]));
  const payload = JSON.parse(b64urlToString(parts[1]));
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) throw new Error('만료');
  if (payload.nbf && payload.nbf > now + 60) throw new Error('nbf');
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) throw new Error('aud');
  if (payload.iss && payload.iss.replace(/\/+$/, '') !== team) throw new Error('iss');

  let keys = await getCerts(team, false);
  let jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) { keys = await getCerts(team, true); jwk = keys.find(k => k.kid === header.kid); }
  if (!jwk) throw new Error('kid');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('서명');
  return payload;
}

async function getCerts(team, force) {
  if (!force && certCache.keys && certCache.team === team && Date.now() - certCache.at < 3600e3) return certCache.keys;
  const res = await fetch(team + '/cdn-cgi/access/certs');
  if (!res.ok) throw new Error('certs ' + res.status);
  const data = await res.json();
  certCache = { at: Date.now(), keys: data.keys || [], team };
  return certCache.keys;
}

/* ------------------------------------------------------------
   직원 명부 확인
   ------------------------------------------------------------ */
function adminEmails(env) {
  return String(env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

async function authorize(email, env) {
  if (!env.DB) return { response: htmlPage(503, '설정 오류', 'DB(D1)가 연결되지 않았습니다.', '') };
  const domain = email.split('@')[1] || '';
  const isBootstrapAdmin = adminEmails(env).includes(email);

  const dom = await env.DB.prepare('SELECT domain, company FROM allowed_domains WHERE domain = ? AND active = 1').bind(domain).first();
  if (!dom && !isBootstrapAdmin) {
    return { response: htmlPage(403, '접속 권한 없음', email + ' 계정은 이 문서 시스템을 사용할 수 없습니다.', '회사 메일로 다시 로그인하거나 관리자에게 문의하세요. <a href="/cdn-cgi/access/logout">로그아웃</a>') };
  }

  let emp = await env.DB.prepare('SELECT * FROM employees WHERE email = ?').bind(email).first();
  if (!emp) {
    // 허용 도메인의 새 직원 — 일반 권한으로 자동 등록(관리자가 명부에서 정보 보완)
    const company = dom ? dom.company : 'disehimedia';
    await env.DB.prepare("INSERT OR IGNORE INTO employees (company, email, name_kr, role, status, memo) VALUES (?, ?, ?, ?, '재직', '첫 접속 시 자동 등록')")
      .bind(company, email, email.split('@')[0], isBootstrapAdmin ? 'admin' : 'member').run();
    await log(env, email, '자동 등록', email, '첫 접속');
    emp = await env.DB.prepare('SELECT * FROM employees WHERE email = ?').bind(email).first();
  }

  if (isBootstrapAdmin) emp.role = 'admin'; // 초기 관리자는 잠기지 않도록 항상 관리자
  if (emp.status === '퇴사' && !isBootstrapAdmin) {
    return { response: htmlPage(403, '접속이 차단된 계정', '퇴사 처리된 계정이라 문서 시스템을 사용할 수 없습니다.', '잘못 처리된 경우 관리자에게 문의하세요. <a href="/cdn-cgi/access/logout">로그아웃</a>') };
  }
  return { user: emp };
}

function publicUser(u) {
  return {
    email: u.email, company: u.company, nameKr: u.name_kr, nameEn: u.name_en, dept: u.dept,
    titleKr: u.title_kr, titleEn: u.title_en, mobile: u.mobile, phone: u.phone,
    status: u.status, role: u.role, isAdmin: u.role === 'admin', logoutUrl: '/cdn-cgi/access/logout'
  };
}

/* ------------------------------------------------------------
   발신인 스크립트 — 기존 sender-info.js 목록 위에 직원 명부를 합칩니다.
   같은 메일은 명부 값으로 갱신(기본 발신인 표시·id는 유지), 새 사람은 추가,
   퇴사자는 목록에서 제거.
   ------------------------------------------------------------ */
async function sendersScript(env) {
  const { results: rows } = await env.DB.prepare(
    "SELECT * FROM employees WHERE is_sender = 1 AND status != '퇴사' ORDER BY company, sort_order, name_kr").all();
  const { results: gone } = await env.DB.prepare("SELECT email FROM employees WHERE status = '퇴사'").all();
  const add = {};
  for (const r of rows) {
    (add[r.company] = add[r.company] || []).push({
      id: 'emp-' + r.id,
      nameKr: r.name_kr,
      nameEn: r.name_en,
      title: [r.title_kr, r.title_en].filter(Boolean).join(' | '),
      phone: r.mobile || r.phone,
      email: r.email
    });
  }
  const js = `/* 직원 명부(관리자 페이지)에서 자동 생성 */
(function () {
  var D = window.DISE = window.DISE || {}; D.senders = D.senders || {};
  var add = ${JSON.stringify(add)};
  var gone = ${JSON.stringify(gone.map(g => g.email.toLowerCase()))};
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
   PDF — 기존 Vercel pdf-service와 같은 방식(요청 가로채기)으로
   Cloudflare Browser Rendering에서 렌더링. 사이트 파일은 로그인 관문을
   거치지 않고 ASSETS에서 직접 읽어 넣습니다.
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

  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1600 });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    await page.setRequestInterception(true);
    page.on('request', async req => {
      try {
        const u = req.url();
        if (u === baseHref) {
          return req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
        }
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
async function handleAdmin(request, env, url, user) {
  const path = url.pathname.replace(/^\/api\/admin/, '');
  const method = request.method;
  const actor = user.email;

  // 설정 상태
  if (path === '/status' && method === 'GET') {
    const counts = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM employees GROUP BY status").all();
    return json({
      access: !!(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD),
      accessTeam: env.ACCESS_TEAM_DOMAIN || '',
      pdf: !!env.BROWSER,
      accessSync: !!(env.CF_API_TOKEN && env.CF_ACCOUNT_ID && env.ACCESS_POLICY_ID),
      adminEmails: adminEmails(env),
      counts: counts.results,
      me: publicUser(user)
    });
  }

  // 직원 명부
  if (path === '/employees' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM employees ORDER BY company, CASE status WHEN \'재직\' THEN 0 WHEN \'휴직\' THEN 1 ELSE 2 END, sort_order, name_kr').all();
    return json(results);
  }
  if (path === '/employees' && method === 'POST') {
    const data = cleanEmployee(await request.json(), true);
    if (data.error) return json(data, 400);
    try {
      const r = await insertEmployee(env, data);
      await log(env, actor, '직원 추가', data.email, data.name_kr);
      return json({ ok: true, id: r.meta.last_row_id });
    } catch (e) {
      if (/UNIQUE/i.test(e.message)) return json({ error: '이미 등록된 메일입니다: ' + data.email }, 409);
      throw e;
    }
  }
  if (path === '/employees/import' && method === 'POST') {
    const rows = await request.json();
    if (!Array.isArray(rows)) return json({ error: '목록 형식이 아닙니다.' }, 400);
    let added = 0, updated = 0; const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const data = cleanEmployee(rows[i], true);
      if (data.error) { errors.push((i + 2) + '행: ' + data.error); continue; }
      const exist = await env.DB.prepare('SELECT id FROM employees WHERE email = ?').bind(data.email).first();
      if (exist) { await updateEmployee(env, exist.id, data, actor, user); updated++; }
      else { await insertEmployee(env, data); added++; }
    }
    await log(env, actor, '명부 가져오기', '', `추가 ${added} · 갱신 ${updated} · 오류 ${errors.length}`);
    return json({ ok: true, added, updated, errors });
  }
  let m = path.match(/^\/employees\/(\d+)$/);
  if (m && method === 'PUT') {
    const id = Number(m[1]);
    const data = cleanEmployee(await request.json(), false);
    if (data.error) return json(data, 400);
    const res = await updateEmployee(env, id, data, actor, user);
    return res.error ? json(res, 400) : json({ ok: true });
  }
  if (m && method === 'DELETE') {
    const id = Number(m[1]);
    const emp = await env.DB.prepare('SELECT email, name_kr FROM employees WHERE id = ?').bind(id).first();
    if (!emp) return json({ error: '없는 직원입니다.' }, 404);
    if (emp.email === actor) return json({ error: '본인 계정은 삭제할 수 없습니다.' }, 400);
    if (adminEmails(env).includes(emp.email)) return json({ error: '초기 관리자(ADMIN_EMAILS)는 삭제할 수 없습니다.' }, 400);
    await env.DB.prepare('DELETE FROM employees WHERE id = ?').bind(id).run();
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
    const sync = await syncAccessPolicy(env);
    return json({ ok: true, sync });
  }
  m = path.match(/^\/domains\/(.+)$/);
  if (m && method === 'DELETE') {
    const domain = decodeURIComponent(m[1]).toLowerCase();
    if (domain === (actor.split('@')[1] || '')) return json({ error: '본인 메일 도메인은 삭제할 수 없습니다(잠김 방지).' }, 400);
    await env.DB.prepare('DELETE FROM allowed_domains WHERE domain = ?').bind(domain).run();
    await log(env, actor, '도메인 삭제', domain, '');
    const sync = await syncAccessPolicy(env);
    return json({ ok: true, sync });
  }
  if (path === '/access-sync' && method === 'POST') {
    return json(await syncAccessPolicy(env));
  }

  // 작업 기록
  if (path === '/audit' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 300').all();
    return json(results);
  }

  return json({ error: '없는 관리자 API입니다.' }, 404);
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
    if (d.role === '관리자') d.role = 'admin'; if (d.role === '일반') d.role = 'member';
    if (!ROLES.includes(d.role)) return { error: '권한은 관리자/일반 중 하나입니다.' };
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
    if (d.status === '퇴사' || d.role === 'member') return { error: (protectedAdmin ? '초기 관리자' : '본인 계정') + '은 퇴사·일반 권한으로 바꿀 수 없습니다(잠김 방지).' };
  }
  if (d.status === '퇴사' && !d.leave_date && !before.leave_date) d.leave_date = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const cols = Object.keys(d).filter(c => c !== 'email' || d.email !== before.email);
  if (!cols.length) return { ok: true };
  await env.DB.prepare(`UPDATE employees SET ${cols.map(c => c + ' = ?').join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .bind(...cols.map(c => d[c]), id).run();
  const changes = cols.filter(c => String(before[c] ?? '') !== String(d[c] ?? '')).map(c => `${c}: ${before[c] ?? ''} → ${d[c]}`);
  let action = '직원 수정';
  if (d.status === '퇴사' && before.status !== '퇴사') action = '퇴사 처리(접속 차단)';
  else if (d.status && d.status !== '퇴사' && before.status === '퇴사') action = '복직(접속 허용)';
  else if (d.role && d.role !== before.role) action = '권한 변경';
  if (changes.length) await log(env, actor, action, before.email, changes.join(' / '));
  return { ok: true };
}

/* Cloudflare Access 정책의 "포함(include)" 규칙을 허용 도메인 목록과 맞춥니다.
   필요한 값: CF_ACCOUNT_ID, ACCESS_POLICY_ID(재사용 정책 ID), 비밀 CF_API_TOKEN
   (권한: Access: Apps and Policies — Edit). ACCESS_APP_ID가 있으면 앱 전용 정책 경로 사용. */
async function syncAccessPolicy(env) {
  if (!(env.CF_API_TOKEN && env.CF_ACCOUNT_ID && env.ACCESS_POLICY_ID)) {
    return { synced: false, message: 'Access 자동 갱신이 설정되지 않았습니다 — Cloudflare 대시보드의 Access 정책에 도메인을 직접 추가해 주세요.' };
  }
  const { results } = await env.DB.prepare('SELECT domain FROM allowed_domains WHERE active = 1').all();
  const base = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access`;
  const endpoint = env.ACCESS_APP_ID ? `${base}/apps/${env.ACCESS_APP_ID}/policies/${env.ACCESS_POLICY_ID}` : `${base}/policies/${env.ACCESS_POLICY_ID}`;
  const headers = { Authorization: 'Bearer ' + env.CF_API_TOKEN, 'Content-Type': 'application/json' };
  const cur = await (await fetch(endpoint, { headers })).json();
  if (!cur.success) return { synced: false, message: 'Access 정책을 읽지 못했습니다: ' + JSON.stringify(cur.errors || '') };
  const p = cur.result;
  const keepAdmins = adminEmails(env).map(e => ({ email: { email: e } }));
  const body = {
    name: p.name, decision: p.decision || 'allow',
    include: [...results.map(r => ({ email_domain: { domain: r.domain } })), ...keepAdmins],
    exclude: p.exclude || [], require: p.require || []
  };
  if (p.session_duration) body.session_duration = p.session_duration;
  const put = await (await fetch(endpoint, { method: 'PUT', headers, body: JSON.stringify(body) })).json();
  if (!put.success) return { synced: false, message: 'Access 정책 갱신 실패: ' + JSON.stringify(put.errors || '') };
  return { synced: true, message: 'Cloudflare Access 로그인 허용 목록도 갱신했습니다(' + results.length + '개 도메인).' };
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
<title>${esc(title)} · 다이즈하이미디어 문서 시스템</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f5f7;color:#212B43;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}
.box{background:#fff;border-radius:14px;padding:36px 32px;max-width:440px;margin:16px;box-shadow:0 8px 30px rgba(33,43,67,.08)}h1{font-size:20px;margin:0 0 12px}p{line-height:1.6;margin:8px 0;color:#4a5368}a{color:#2f5fd0}</style></head>
<body><div class="box"><h1>${esc(title)}</h1><p>${esc(message)}</p><p>${extraHtml || ''}</p></div></body></html>`;
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

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlToString(s) { return new TextDecoder().decode(b64urlToBytes(s)); }
