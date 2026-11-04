/* ============================================================
   session-bar.js — 로그인한 사람 표시(오른쪽 위 작은 띠)
   Cloudflare 사이트에서만 동작합니다(/api/me). github.io나 로컬 http
   서버처럼 API가 없으면 아무것도 그리지 않습니다.
   관리자에게는 "관리자 페이지" 링크를 함께 보여줍니다.

   쓰는 곳: 포털(index.html)
     <script src="shared/scripts/session-bar.js"></script>
   ============================================================ */
(function () {
  if (/github\.io$/.test(location.hostname)) return;
  fetch('/api/me', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (me) {
      if (!me || !me.email) return;
      var bar = document.createElement('div');
      bar.className = 'no-print dise-session-bar';
      bar.style.cssText = 'position:fixed;top:10px;right:12px;z-index:50;display:flex;gap:10px;align-items:center;' +
        'background:rgba(255,255,255,.96);border:1px solid #e1e4ec;border-radius:20px;padding:6px 14px;' +
        'font-size:12.5px;color:#3c4456;box-shadow:0 2px 10px rgba(11,35,79,.08);font-family:inherit';
      function link(text, href) {
        var a = document.createElement('a'); a.textContent = text; a.href = href;
        a.style.cssText = 'color:#0b234f;text-decoration:none;font-weight:600'; return a;
      }
      var who = document.createElement('span');
      who.textContent = (me.nameKr && me.nameKr !== me.email.split('@')[0] ? me.nameKr + ' · ' : '') + me.email;
      bar.appendChild(who);
      if (me.isAdmin) bar.appendChild(link('관리자 페이지', '/admin/'));
      else if (me.isHR) bar.appendChild(link('인사 관리', '/admin/'));
      bar.appendChild(link('비밀번호 바꾸기', me.passwordUrl || '/account/password'));
      bar.appendChild(link('로그아웃', me.logoutUrl || '/logout'));
      document.body.appendChild(bar);
    })
    .catch(function () { /* API 없음 — 표시 안 함 */ });
})();
