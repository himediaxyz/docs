/* ============================================================
   quote-editor.js — 계열사 표준 견적서 (templates/quote/, 2026-10-23)

   URL: templates/quote/index.html?company=r2v|bic|axis-one|disehimedia

   - 각 계열사 레터헤드 디자인(letterhead-companies.css) 그대로 사용
   - 공급자 칸: company-info.js 값(상호·사업자등록번호·대표자·주소·업태·
     종목·전화·이메일) 자동, 없으면 빈칸 — 화면에서 바로 고칠 수 있음
   - 품목 표: [+ 행 추가] / × 삭제, 품명·규격·수량·단위·단가·비고 입력,
     공급가액(행) = 수량 × 단가(반올림), 부가세 = 합계 × 10%(원 미만 절사),
     합계금액은 숫자와 한글("일금 ○○원정")로 자동 표기
   - 품명: 직접 입력 + 품목마스터 드롭다운(송장과 같은 Apps Script
     ?action=items — 없으면 직접 입력만)
   - 회사별 기본 품목·조건은 아래 PRESETS (R2V 광고 매체, BIC 공사 등)
   - 수정 내용은 화면·인쇄·PDF에만 반영(시트 저장 없음 — 송장과 같은 정책)

   ★ editor.js·pagination.js보다 먼저 실행해 문서를 그립니다.
   ★ PDF 서버·인쇄 탭은 화면 HTML을 그대로 다시 열기 때문에, 이미 그려진
     스냅샷(<html data-quote-rendered="1">)이면 다시 그리지 않습니다.
   ============================================================ */

window.DISE = window.DISE || {};

DISE.quote = (function () {
  var ROOT = document.documentElement;
  var TAX_RATE = 0.1;

  /* ---------- 회사별 기본값 ---------- */
  var PRESETS = {
    r2v: {
      intro: '아래와 같이 광고 게재를 견적합니다.',
      rows: [
        { name: '[매체명 — 설치 위치]', spec: '[게재 기간 / 15초 · 일 [  ]회]', unit: '개월' },
        { name: '[매체명 — 설치 위치]', spec: '[게재 기간 / 15초 · 일 [  ]회]', unit: '개월' },
        { name: '광고물 편집(선택)', spec: '[송출 규격 변환]', unit: '건' }
      ],
      conditions: [
        ['결제 조건', '게재 개시일 전일까지 계좌이체 (세금계산서 발행)'],
        ['소재 제출', '게재 개시 [5]영업일 전까지 매체 규격에 맞춰 제출'],
        ['게재 확인', '게재 종료 후 게재 사진·송출 기록 제공'],
        ['유의 사항', '광고물 심의 결과 및 관계 법령에 따라 게재가 제한될 수 있습니다.']
      ]
    },
    bic: {
      intro: '아래와 같이 견적합니다.',
      rows: [
        { name: 'LED 전광판(모듈·캐비닛)', spec: '[가로  m × 세로  m / 피치  mm]', unit: '식' },
        { name: '구조물 제작·설치', spec: '[  ]', unit: '식' },
        { name: '전기·통신 공사', spec: '[  ]', unit: '식' },
        { name: '운반·장비(크레인 등)', spec: '[  ]', unit: '식' }
      ],
      conditions: [
        ['결제 조건', '계약금 30% / 중도금 40% / 잔금 30%'],
        ['공사 기간', '착공 후 [  ]일 (허가·기상 사정에 따라 변동 가능)'],
        ['하자보수', '구조물 [2]년 / LED·전원·제어 장치 [1]년'],
        ['제외 사항', '광고물 허가 수수료, 전기 인입·건물 보강 공사, 야간·휴일 작업 할증']
      ]
    },
    _default: {
      intro: '아래와 같이 견적합니다.',
      rows: [{}, {}, {}],
      conditions: [
        ['결제 조건', '[  ]'],
        ['납기', '[  ]'],
        ['비고', '[  ]']
      ]
    }
  };

  /* ---------- 유틸 ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function nb(s) { return esc(s).replace(/ {2,}/g, function (m) { return new Array(m.length + 1).join('&nbsp;'); }); }
  function fmt(n) { return (Number(n) || 0).toLocaleString('ko-KR', { maximumFractionDigits: 2 }); }
  function parseNum(t) { var n = parseFloat(String(t || '').replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }
  function pad(x) { return (x < 10 ? '0' : '') + x; }
  function ymd(d, sep) { return d.getFullYear() + sep + pad(d.getMonth() + 1) + sep + pad(d.getDate()); }
  function param(name) { var m = new RegExp('[?&]' + name + '=([^&]+)').exec(location.search); return m ? decodeURIComponent(m[1]) : ''; }

  // 1265000 → "일백이십육만오천"
  function hangulAmount(n) {
    n = Math.floor(Math.abs(Number(n) || 0));
    if (!n) return '영';
    var D = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
    var S = ['', '십', '백', '천'], B = ['', '만', '억', '조'];
    var out = '', g = 0;
    while (n > 0) {
      var chunk = n % 10000, cs = '';
      for (var i = 0; i < 4 && chunk > 0; i++) {
        var dig = chunk % 10;
        if (dig) cs = D[dig] + S[i] + cs;
        chunk = Math.floor(chunk / 10);
      }
      if (cs) out = cs + B[g] + out;
      n = Math.floor(n / 10000); g++;
    }
    return out;
  }

  function ed(field, value, ph, extraClass) {
    return '<span class="editable q-ed' + (extraClass ? ' ' + extraClass : '') + '" contenteditable="true" spellcheck="false"' +
      (field ? ' data-field="' + field + '"' : '') + ' data-ph="' + esc(ph || '') + '">' + nb(value || '') + '</span>';
  }

  /* ---------- 품목 행 ---------- */
  function rowHTML(r) {
    r = r || {};
    return '<tr class="q-row">' +
      '<td class="q-no"></td>' +
      '<td class="q-name-cell">' + ed('name', r.name, '품명') + '<button type="button" class="q-pick-btn no-print" tabindex="-1" title="품목마스터에서 고르기">▾</button></td>' +
      '<td>' + ed('spec', r.spec, '규격') + '</td>' +
      '<td class="num">' + ed('qty', r.qty ? fmt(r.qty) : '', '0') + '</td>' +
      '<td class="c">' + ed('unit', r.unit, '단위') + '</td>' +
      '<td class="num">' + ed('price', r.price ? fmt(r.price) : '', '0') + '</td>' +
      '<td class="num q-amount">0</td>' +
      '<td>' + ed('note', r.note, '') + '</td>' +
      '<td class="q-del no-print"><button type="button" class="q-del-btn" title="이 행 삭제" aria-label="이 행 삭제">×</button></td>' +
      '</tr>';
  }

  /* ---------- 문서 그리기 ---------- */
  function build(company) {
    var c = DISE.companies[company] || {};
    var P = PRESETS[company] || PRESETS._default;
    var today = new Date();
    var until = new Date(today.getTime() + 30 * 86400000);
    var prefix = c.docNoPrefix || 'DISE';

    var set = function (id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; };
    set('qNo', ed('', prefix + '-Q' + ymd(today, '') + '-01', '견적번호'));
    set('qDate', ed('', ymd(today, '.'), '견적일'));
    set('qValid', ed('', ymd(until, '.') + '까지 (30일)', '유효기간'));
    set('qTo', ed('', '', '[고객사 상호]') + ' 귀하');
    set('qToRef', '참조: ' + ed('', '', '[담당자 / 연락처]'));
    set('qProject', '건명: ' + ed('', '', '[견적 건명]'));

    var sup = [
      ['등록번호', c.bizNo || ''],
      ['상호', c.nameKr || ''],
      ['대표자', c.ceo || '', true],
      ['주소', c.addressKr || ''],
      ['업태 / 종목', (c.bizType || '') + (c.bizItem ? ' / ' + c.bizItem : '')],
      ['전화', c.phoneDomestic || ''],
      ['이메일', c.email || '']
    ];
    set('qSupplier', '<tbody>' + sup.map(function (r) {
      return '<tr><th>' + r[0] + '</th><td>' + ed('', r[1], '[  ]') + (r[2] ? ' <span class="q-seal">(인)</span>' : '') + '</td></tr>';
    }).join('') + '</tbody>');

    set('qIntro', nb(P.intro));
    set('qItemsBody', P.rows.map(rowHTML).join(''));
    set('qConditions', '<tbody>' + P.conditions.map(function (r) {
      return '<tr><th>' + ed('', r[0], '항목') + '</th><td>' + ed('', r[1], '[  ]') + '</td></tr>';
    }).join('') + '</tbody>');
    set('qContact', '담당: ' + ed('', '', '[이름]') + ' &nbsp;/&nbsp; ' + ed('', c.phoneDomestic || '', '[연락처]') + ' &nbsp;/&nbsp; ' + ed('', c.email || '', '[이메일]'));
    ROOT.setAttribute('data-quote-rendered', '1');
  }

  /* ---------- 계산 ---------- */
  function recalc() {
    var subtotal = 0, no = 0;
    Array.prototype.forEach.call(document.querySelectorAll('.q-row'), function (tr) {
      var g = function (f) { var e = tr.querySelector('[data-field="' + f + '"]'); return e ? e.textContent : ''; };
      var qty = parseNum(g('qty')), price = parseNum(g('price'));
      var amount = Math.round(qty * price);
      var blank = !g('name').trim() && !g('spec').trim() && !qty && !price;
      tr.classList.toggle('is-blank', blank);
      if (!blank) no++;
      tr.querySelector('.q-no').textContent = blank ? '' : no;
      tr.querySelector('.q-amount').textContent = amount ? fmt(amount) : '';
      subtotal += amount;
    });
    var taxEl = document.getElementById('qTaxable');
    var taxable = !taxEl || taxEl.checked;
    var tax = taxable ? Math.floor(subtotal * TAX_RATE) : 0;
    var total = subtotal + tax;
    var t = function (id, v) { var e = document.getElementById(id); if (e) e.textContent = v; };
    t('qSubtotal', fmt(subtotal) + '원');
    t('qTax', taxable ? fmt(tax) + '원' : '면세');
    t('qTotal', fmt(total) + '원');
    t('qGrandWords', '일금 ' + hangulAmount(total) + '원정');
    t('qGrandNum', '(₩' + fmt(total) + (taxable ? ', 부가세 포함)' : ', 면세)'));
  }

  function refreshLayout() { if (DISE.pagination && DISE.pagination.refresh) DISE.pagination.refresh(); }

  function addRow(focus) {
    var body = document.querySelector('.q-row') ? document.querySelector('.q-row').parentNode : document.getElementById('qItemsBody');
    var tmp = document.createElement('tbody');
    tmp.innerHTML = rowHTML({});
    var tr = tmp.firstChild;
    body.appendChild(tr);
    recalc(); refreshLayout();
    if (focus) tr.querySelector('[data-field="name"]').focus();
  }

  /* ---------- 품목마스터 드롭다운 (송장과 같은 방식) ---------- */
  var items = [], picker = { el: null, cell: null, list: [], active: -1 };
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }

  function loadItems(company) {
    var api = window.DISE_INVOICE_API_URL;
    if (!api) return;
    fetch(api + '?action=items&company=' + encodeURIComponent(company))
      .then(function (r) { return r.json(); })
      .then(function (b) {
        if (!b || b.ok === false) return;
        items = (b.data || []).filter(function (i) { return i && i.itemName; });
        ROOT.classList.toggle('q-has-items', items.length > 0);
      }).catch(function () { /* 직접 입력만 */ });
  }
  function pickerEl() {
    if (picker.el) return picker.el;
    var el = document.createElement('div');
    el.className = 'q-picker no-print'; el.hidden = true;
    el.addEventListener('mousedown', function (e) { e.preventDefault(); });
    el.addEventListener('click', function (e) {
      var o = e.target.closest ? e.target.closest('.q-picker-opt') : null;
      if (o) choose(Number(o.getAttribute('data-idx')));
    });
    document.body.appendChild(el);
    return (picker.el = el);
  }
  function closePicker() { if (picker.el) picker.el.hidden = true; picker.cell = null; picker.list = []; picker.active = -1; }
  function openPicker(cell, all) {
    if (!items.length) return;
    picker.cell = cell;
    var q = all ? '' : norm(cell.textContent);
    picker.list = items.filter(function (it) { return !q || norm(it.itemName + it.itemCode + it.spec).indexOf(q) !== -1; }).slice(0, 80);
    picker.active = -1;
    var el = pickerEl();
    if (!picker.list.length) { el.hidden = true; return; }
    el.innerHTML = picker.list.map(function (it, i) {
      return '<div class="q-picker-opt" data-idx="' + i + '"><div class="nm">' + esc(it.itemName) + '</div><div class="mt">' +
        esc([it.spec, it.unitPrice ? fmt(it.unitPrice) + '원' : '', it.itemCode].filter(Boolean).join(' · ')) + '</div></div>';
    }).join('');
    var r = (cell.closest('td') || cell).getBoundingClientRect();
    el.style.left = (r.left + window.scrollX) + 'px';
    el.style.top = (r.bottom + window.scrollY + 2) + 'px';
    el.style.minWidth = Math.max(r.width, 280) + 'px';
    el.hidden = false;
  }
  function highlight() {
    Array.prototype.forEach.call(picker.el.querySelectorAll('.q-picker-opt'), function (o, i) { o.classList.toggle('is-active', i === picker.active); });
  }
  function choose(i) {
    var it = picker.list[i], cell = picker.cell;
    closePicker();
    if (!it || !cell) return;
    var tr = cell.closest('.q-row');
    var f = function (n) { return tr.querySelector('[data-field="' + n + '"]'); };
    f('name').textContent = it.itemName;
    f('spec').textContent = it.spec || '';
    f('price').textContent = it.unitPrice ? fmt(it.unitPrice) : '';
    if (!parseNum(f('qty').textContent)) f('qty').textContent = '1';
    recalc(); refreshLayout();
    f('qty').focus();
  }

  /* ---------- 이벤트 ---------- */
  function wire() {
    document.addEventListener('input', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('.q-row')) recalc();
      if (t.getAttribute && t.getAttribute('data-field') === 'name') openPicker(t, false);
    });
    document.addEventListener('focusin', function (e) {
      var t = e.target;
      if (t.getAttribute && t.getAttribute('data-field') === 'name' && !t.textContent.trim()) openPicker(t, true);
    });
    document.addEventListener('focusout', function (e) {
      var t = e.target, f = t.getAttribute && t.getAttribute('data-field');
      if (f === 'name') setTimeout(function () { if (picker.cell && document.activeElement !== picker.cell) closePicker(); }, 120);
      if (f === 'qty' || f === 'price') {
        var raw = t.textContent.trim();
        t.textContent = raw ? fmt(parseNum(raw)) : '';
        recalc();
      }
    });
    document.addEventListener('keydown', function (e) {
      var t = e.target;
      if (picker.cell && t === picker.cell && picker.el && !picker.el.hidden && !e.isComposing) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          var n = picker.list.length;
          picker.active = picker.active < 0 ? (e.key === 'ArrowDown' ? 0 : n - 1) : (picker.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
          highlight(); return;
        }
        if (e.key === 'Escape') { closePicker(); return; }
        if (e.key === 'Enter' && picker.active >= 0) { e.preventDefault(); e.stopPropagation(); choose(picker.active); return; }
        if (e.key === 'Enter') closePicker();
      }
      if (!t.closest || !t.closest('.q-ed') || e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      var row = t.closest('.q-row');
      if (!row) { t.blur(); return; }
      var cells = Array.prototype.slice.call(row.querySelectorAll('.q-ed'));
      var i = cells.indexOf(t);
      if (i < cells.length - 1) { cells[i + 1].focus(); return; }
      var next = row.nextElementSibling;
      if (next) next.querySelector('.q-ed').focus(); else addRow(true);
    }, true);
    document.addEventListener('paste', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.q-ed') : null;
      if (!t) return;
      e.preventDefault();
      document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text').replace(/\s*\n\s*/g, ' '));
    });
    document.addEventListener('mousedown', function (e) {
      var b = e.target.closest ? e.target.closest('.q-pick-btn') : null;
      if (!b) return;
      e.preventDefault();
      var cell = b.closest('td').querySelector('[data-field="name"]');
      cell.focus(); openPicker(cell, true);
    });
    document.addEventListener('click', function (e) {
      var d = e.target.closest ? e.target.closest('.q-del-btn') : null;
      if (d) {
        var tr = d.closest('.q-row'), body = tr.parentNode;
        tr.parentNode.removeChild(tr);
        if (!body.querySelector('.q-row')) addRow(false);
        recalc(); refreshLayout();
      }
      if (e.target.closest && e.target.closest('#qAddRow')) addRow(true);
    });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && /^[zy]$/i.test(e.key)) setTimeout(recalc, 0);
    });
    var tax = document.getElementById('qTaxable');
    if (tax) tax.addEventListener('change', function () {
      // 스냅샷(outerHTML)에도 체크 상태가 남도록 속성으로 반영
      if (tax.checked) tax.setAttribute('checked', ''); else tax.removeAttribute('checked');
      recalc();
    });
    window.addEventListener('beforeprint', closePicker);
  }

  function init(opts) {
    var company = opts.company;
    if (ROOT.getAttribute('data-quote-rendered') === '1') return; // PDF·인쇄 스냅샷 — 그대로 둠
    build(company);
    wire();
    loadItems(company);
    recalc();
  }

  return { init: init, hangulAmount: hangulAmount };
})();
