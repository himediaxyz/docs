/* ============================================================
   contract-renderer.js
   templates/contract/ 전용. shared/scripts/contracts/{회사}.js 의
   계약서 데이터(DISE.contracts[회사])를 읽어 문서 본문을 그립니다.

   URL: templates/contract/index.html?company=r2v&type=ad-master

   ★ editor.js보다 먼저 실행되어야 합니다 — editor.js가 처음 상태를
     "수정 전 원본"으로 기억하고, 되돌리기(Ctrl+Z)·양식 전환 경고가
     그 기준으로 동작하기 때문입니다.
   ★ 본문은 #docBody(.flow-items) 안에 "조항 하나 = 블록 하나"로 넣습니다.
     pagination.js가 블록 단위로 페이지를 나누므로 조항 제목과 내용이
     서로 다른 페이지로 갈라지지 않습니다.
   ============================================================ */

window.DISE = window.DISE || {};

DISE.contractRenderer = (function () {
  var CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&]+)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function makeText(company) {
    var c = DISE.companies[company] || {};
    return function (s) {
      // 빈칸 "[   ]"의 연속 공백이 HTML에서 하나로 줄어들지 않도록 &nbsp;로
      return esc(s).replace(/\{R2V\}/g, esc(c.nameKr || ''))
        .replace(/ {2,}/g, function (m) { return new Array(m.length + 1).join('&nbsp;'); });
    };
  }

  function partyDisplay(p) {
    if (p.r2v) return '{R2V}';
    return '[' + String(p.label).replace(/\(.*?\)/g, '').trim() + ' 상호]';
  }

  /* ---------- 조항 ---------- */
  function renderPara(para, num, T) {
    var html = '';
    var text = para, items = null;
    if (Array.isArray(para)) { text = para[0]; items = para[1]; }
    html += '<p class="ct-p">' + (num ? '<span class="ct-num">' + num + '</span> ' : '') + T(text) + '</p>';
    if (items) {
      items.forEach(function (it, i) {
        html += '<p class="ct-item">' + (i + 1) + '. ' + T(it) + '</p>';
      });
    }
    return html;
  }

  function renderArticle(art, n, T) {
    var title = art[0], body = art[1];
    var paras = Array.isArray(body) ? body : [body];
    var multi = paras.length > 1;
    var html = '<div class="ct-art"><p class="ct-art-h">제' + n + '조 (' + T(title) + ')</p>';
    paras.forEach(function (p, i) {
      html += renderPara(p, multi ? CIRCLED.charAt(i) : '', T);
    });
    return html + '</div>';
  }

  /* ---------- 블록(서식·별지) ---------- */
  function renderBlock(b, T) {
    if (b.t === 'h') return '<p class="ct-h">' + T(b.text) + '</p>';
    if (b.t === 'p') return '<p class="ct-p">' + T(b.text) + '</p>';
    if (b.t === 'table') {
      var h = '<table class="doc-table ct-table' + (b.head ? '' : ' ct-kv') + '">';
      if (b.head) h += '<thead><tr>' + b.head.map(function (x) { return '<th>' + T(x) + '</th>'; }).join('') + '</tr></thead>';
      h += '<tbody>' + b.rows.map(function (r) {
        return '<tr>' + r.map(function (x, i) {
          return (!b.head && i === 0 ? '<th>' : '<td>') + T(x) + (!b.head && i === 0 ? '</th>' : '</td>');
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
      return h;
    }
    return '';
  }

  /* ---------- 서명란 ---------- */
  function signCol(p, roleName, title, company, T) {
    var c = DISE.companies[company] || {};
    var r2v = p && p.r2v;
    var rows = [
      ['상호', r2v ? T(c.nameKr) : T('[          ]')],
      ['주소', r2v && c.addressKr ? T(c.addressKr) : T('[                    ]')],
      ['사업자등록번호', r2v && c.bizNo ? T(c.bizNo) : T('[     -    -          ]')],
      ['대표자', (r2v && c.ceo ? T(c.ceo) : T('[          ]')) + ' <span class="ct-seal">(인)</span>']
    ];
    var head = title || (roleName + (p ? ' (' + T(p.label) + ')' : ''));
    return '<div class="ct-sign-col">' +
      (head ? '<p class="ct-sign-h">' + head + '</p>' : '') +
      '<table class="ct-sign-t"><tbody>' +
      rows.map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }

  function renderSign(item, company, T) {
    var parties = item.parties || [];
    var titles = item.signTitle || [];
    var html = '<div class="ct-signoff"><p class="ct-date">20&nbsp;&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;일</p><div class="ct-sign">';
    if (item.signOnly === 'r2v') {
      html += '<div class="ct-sign-col ct-sign-spacer"></div>' + signCol({ r2v: true, label: '' }, '', titles[1] || '', company, T);
    } else {
      html += signCol(parties[0], '갑', titles[0], company, T) + signCol(parties[1], '을', titles[1], company, T);
    }
    return html + '</div></div>';
  }

  /* ---------- 본문 전체 ---------- */
  function renderItem(item, company) {
    var T = makeText(company);
    var html = '';
    if (item.articles) {
      var pre = item.preambleOverride ||
        (partyDisplay(item.parties[0]) + '(이하 "갑"이라 한다)와 ' + partyDisplay(item.parties[1]) +
         '(이하 "을"이라 한다)는 ' + item.subject + '에 관하여 다음과 같이 계약(이하 "본 계약")을 체결한다.');
      html += '<p class="ct-p ct-preamble">' + T(pre) + '</p>';
      item.articles.forEach(function (a, i) { html += renderArticle(a, i + 1, T); });
      html += '<p class="ct-p ct-closing">' + T(item.closing ||
        '본 계약의 성립을 증명하기 위하여 계약서 2통을 작성하여 갑과 을이 서명(또는 기명날인)한 후 각 1통씩 보관한다.') + '</p>';
      html += renderSign(item, company, T);
      if (item.annex) {
        html += '<div class="ct-annex">' + item.annex.map(function (b) { return renderBlock(b, T); }).join('') + '</div>';
      }
    } else if (item.blocks) {
      item.blocks.forEach(function (b) { html += renderBlock(b, T); });
      if (item.closing) html += '<p class="ct-p ct-closing">' + T(item.closing) + '</p>';
      html += renderSign(item, company, T);
    }
    return html;
  }

  function buildSelect(data, company, current) {
    var sel = document.getElementById('contractSelect');
    if (!sel) return;
    sel.innerHTML = data.groups.map(function (g) {
      var opts = data.items.filter(function (it) { return it.group === g.key; });
      if (!opts.length) return '';
      return '<optgroup label="' + esc(g.label) + '">' + opts.map(function (it) {
        return '<option value="' + it.key + '"' + (it.key === current ? ' selected' : '') + '>' + esc(it.title) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
  }

  function render(opts) {
    var company = opts.company;
    var data = DISE.contracts && DISE.contracts[company];
    var body = document.getElementById('docBody');
    var titleEl = document.getElementById('docTitle');
    var descEl = document.getElementById('contractDesc');
    if (!data || !data.items.length) {
      titleEl.textContent = '계약서';
      body.innerHTML = '<p>이 회사의 계약서 양식은 아직 준비되지 않았습니다.</p>';
      var bar = document.getElementById('contractBar');
      if (bar) bar.hidden = true;
      return null;
    }
    var key = param('type');
    var item = null;
    data.items.forEach(function (it) { if (it.key === key) item = it; });
    if (!item) item = data.items[0];

    titleEl.textContent = item.title;
    document.title = item.title + ' | ' + (DISE.companies[company] || {}).nameKr + ' 계약서';
    if (descEl) descEl.textContent = item.desc || '';
    body.innerHTML = renderItem(item, company);
    buildSelect(data, company, item.key);

    // 계약서 종류 바꾸기 — 수정한 내용이 있으면 확인
    // (pagination.js가 조항을 다음 페이지 흐름으로 옮겨도 순서대로 이으면 같은 값)
    function snapshot() {
      return Array.prototype.map.call(document.querySelectorAll('.flow-items'), function (f) { return f.innerHTML; }).join('') +
        '|' + titleEl.innerHTML;
    }
    var initial = snapshot();
    var sel = document.getElementById('contractSelect');
    if (sel) sel.addEventListener('change', function () {
      var changed = snapshot() !== initial;
      if (changed && !window.confirm('작성 중인 내용이 있습니다. 다른 계약서로 바꾸면 입력한 내용이 사라집니다. 계속할까요?')) {
        sel.value = item.key;
        return;
      }
      location.search = '?company=' + encodeURIComponent(company) + '&type=' + encodeURIComponent(sel.value);
    });
    return item;
  }

  return { render: render, renderItem: renderItem };
})();
