/* ============================================================
   invoice-loader.js
   templates/invoice/ 전용 스크립트. 구글 시트(다이즈하이미디어_그룹_
   마스터데이터)에 붙인 Apps Script 웹 앱(shared/README.md의
   "마스터 데이터" 설명 참고)에서 송장 데이터를 읽어와 화면을 채우고,
   화면에서 바로 입력·수정할 수 있게 합니다.

   ★ 왜 이렇게 나누었나 (2026-09-16): "회사정보·거래처·송장 항목은
   구글 드라이브의 스프레드시트 한 곳에서만 관리하고, 시트에서 직접
   다운로드해서 보든 이 사이트에서 뽑든 항상 같은 데이터를 보여준다"는
   결정에 따른 것입니다. 그래서 이 문서는 company-info.js의 정적
   정보(로고 등 "디자인 자산")만 재사용하고, 실제 업무 데이터(주소·
   전화·거래처·품목·금액)는 전부 API로 받아온 값을 씁니다.

   ★ 화면 편집 (2026-10-23 추가):
     - 품목 표: [+ 행 추가] 버튼으로 행 추가, 각 행 오른쪽 ×로 삭제.
       품목명·규격/단위·수량·단가 칸을 직접 입력/수정.
     - 공급가액(행) = 수량 × 단가 (원 미만 반올림)
       공급가액 소계 = 행 공급가액 합
       세액 = 소계 × 10% (원 미만 절사) — "부가세 10% 적용" 체크 해제 시 비과세
       합계금액 = 소계 + 세액
     - 송장번호·발행일·결제기한·수신(거래처)·비고도 직접 수정 가능.
     - [+ 새 송장 작성]: 공급자(발신)·입금계좌는 그대로 두고 나머지를
       비운 빈 양식으로 시작.
     - 품목명: 직접 입력 + 품목마스터 자동완성 드롭다운(아래 "품목명
       자동완성" 섹션, Apps Script ?action=items 필요).
     - 수정 내용은 화면(인쇄/PDF)에만 반영되고 구글 시트에는 저장되지
       않습니다. 시트 저장(Apps Script doPost)은 로그인 관문(Cloudflare
       Access) 작업과 함께 추후 진행 — 프로젝트 문서 "송장(인보이스)
       시스템 진행상황" 참고.

   ★ PDF/인쇄 스냅샷 보호: pdf-export.js는 지금 화면의 outerHTML을
   통째로 PDF 서버(또는 인쇄용 새 탭)로 보내는데, 그 HTML 안에 이
   스크립트도 들어 있어서 그쪽에서 다시 실행되면 시트 데이터를 새로
   불러와 사용자가 고친 내용을 덮어써 버립니다. 그래서 한 번이라도
   화면을 채우면 <html data-inv-rendered="1">을 표시해두고, 그 표시가
   이미 있는 상태로 실행되면(=스냅샷) 아무것도 불러오지 않습니다.

   window.DISE_INVOICE_API_URL / window.DISE_INVOICE_COMPANY 는
   templates/invoice/index.html의 인라인 스크립트가 미리 설정해둡니다.
   ============================================================ */

(function () {
  var ROOT = document.documentElement;
  // 스냅샷(PDF 서버·인쇄 탭)에서는 아무것도 하지 않습니다 — 위 설명 참고.
  if (ROOT.getAttribute('data-inv-rendered') === '1') return;

  var API_URL = window.DISE_INVOICE_API_URL || '';
  var COMPANY = window.DISE_INVOICE_COMPANY || 'disehimedia';
  var TAX_RATE = 0.1;
  var NEW_VALUE = '__new__';

  var els = {
    select: document.getElementById('invoiceSelect'),
    status: document.getElementById('invStatus'),
    newBtn: document.getElementById('invNewBtn'),
    taxable: document.getElementById('invTaxable'),
    editNote: document.getElementById('invEditNote'),
    addRow: document.getElementById('invAddRow'),
    invNo: document.getElementById('invNo'),
    invDate: document.getElementById('invDate'),
    invDue: document.getElementById('invDue'),
    custName: document.getElementById('custName'),
    custBiz: document.getElementById('custBiz'),
    custAddr: document.getElementById('custAddr'),
    custContact: document.getElementById('custContact'),
    supName: document.getElementById('supName'),
    supBiz: document.getElementById('supBiz'),
    supAddr: document.getElementById('supAddr'),
    supContact: document.getElementById('supContact'),
    supSender: document.getElementById('supSender'),
    itemsBody: document.getElementById('invItemsBody'),
    subtotal: document.getElementById('invSubtotal'),
    tax: document.getElementById('invTax'),
    total: document.getElementById('invTotal'),
    bank: document.getElementById('invBank'),
    note: document.getElementById('invNote'),
    docFooter: document.getElementById('docFooter')
  };

  // 화면에서 직접 고칠 수 있는 머리 부분 칸들과 빈 칸일 때 보일 안내 문구
  var HEADER_FIELDS = [
    ['invNo', '송장번호'],
    ['invDate', 'YYYY-MM-DD'],
    ['invDue', '(미정)'],
    ['custName', '거래처명'],
    ['custBiz', '사업자등록번호'],
    ['custAddr', '주소'],
    ['custContact', '담당자 · 연락처 · 이메일'],
    ['note', '비고']
  ];

  var lastData = null;   // 마지막으로 시트에서 받은 송장(공급자·계좌 재사용용)
  var dirty = false;     // 화면에서 수정했는지
  var currentValue = ''; // 셀렉트의 현재 선택값(변경 취소 시 되돌리기용)

  /* ---------- 공통 유틸 ---------- */
  function setStatus(text, isError) {
    if (!els.status) return;
    els.status.textContent = text || '';
    els.status.classList.toggle('is-error', !!isError);
  }

  function fmt(n) {
    n = Number(n) || 0;
    return n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  }
  function won(n) { return fmt(n) + '원'; }

  // "1,200원", " 3.5 " 같은 입력을 숫자로. 숫자가 없으면 0.
  function parseNum(text) {
    var cleaned = String(text || '').replace(/[^0-9.\-]/g, '');
    var n = parseFloat(cleaned);
    return isFinite(n) ? n : 0;
  }

  function today() {
    var d = new Date();
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function refreshLayout() {
    if (window.DISE && DISE.pagination && DISE.pagination.refresh) DISE.pagination.refresh();
    else { try { window.dispatchEvent(new Event('resize')); } catch (e) { /* no-op */ } }
  }

  function markRendered() { ROOT.setAttribute('data-inv-rendered', '1'); }

  function setDirty(v) {
    dirty = v;
    if (els.editNote) els.editNote.classList.toggle('is-dirty', v);
  }

  /* ---------- 편집 칸 만들기 ----------
     contenteditable <span>을 씁니다(<input> 아님). pdf-export.js가
     outerHTML로 화면을 통째로 보내는데, <input>에 입력한 값은 HTML에
     남지 않아 PDF에서 사라지기 때문입니다. editor.js의 공통 .editable
     스타일(점선 테두리)·되돌리기(Ctrl+Z)도 그대로 적용됩니다. */
  function makeEditable(el, placeholder, field) {
    el.classList.add('editable', 'inv-ed');
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'false');
    if (placeholder) el.setAttribute('data-ph', placeholder);
    if (field) el.setAttribute('data-field', field);
    return el;
  }

  function setText(el, text) {
    // &nbsp; 등 공백만 있으면 빈 칸으로 — :empty 안내 문구가 보이도록
    el.textContent = (text == null ? '' : String(text)).trim();
  }

  function cellSpan(field, value, placeholder) {
    var span = makeEditable(document.createElement('span'), placeholder, field);
    setText(span, value);
    return span;
  }

  /* ---------- 품목 행 ---------- */
  function buildRow(it) {
    it = it || {};
    var tr = document.createElement('tr');
    tr.className = 'inv-item-row';

    if (it.itemCode) tr.setAttribute('data-item-code', it.itemCode);

    var tdName = document.createElement('td');
    tdName.className = 'inv-name-cell';
    tdName.appendChild(cellSpan('itemName', it.itemName, '품목명'));
    // ▾ 품목마스터에서 고르기 (화면 전용) — 품목 목록을 못 불러오면 CSS로 숨김
    var pickBtn = document.createElement('button');
    pickBtn.type = 'button';
    pickBtn.className = 'inv-pick-btn no-print';
    pickBtn.title = '품목마스터에서 고르기';
    pickBtn.setAttribute('aria-label', '품목마스터에서 고르기');
    pickBtn.setAttribute('tabindex', '-1');
    pickBtn.textContent = '▾';
    tdName.appendChild(pickBtn);

    var tdSpec = document.createElement('td');
    tdSpec.appendChild(cellSpan('spec', it.spec, '규격/단위'));

    var tdQty = document.createElement('td');
    tdQty.className = 'num';
    var q = cellSpan('qty', it.qty ? fmt(it.qty) : '', '0');
    q.setAttribute('inputmode', 'decimal');
    tdQty.appendChild(q);

    var tdPrice = document.createElement('td');
    tdPrice.className = 'num';
    var pr = cellSpan('unitPrice', it.unitPrice ? fmt(it.unitPrice) : '', '0');
    pr.setAttribute('inputmode', 'numeric');
    tdPrice.appendChild(pr);
    var wonSfx = document.createElement('span');
    wonSfx.className = 'inv-won';
    wonSfx.textContent = '원';
    tdPrice.appendChild(wonSfx);

    var tdAmt = document.createElement('td');
    tdAmt.className = 'num inv-amount';
    tdAmt.textContent = won(0);

    var tdDel = document.createElement('td');
    tdDel.className = 'inv-col-del no-print';
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'inv-del-btn';
    del.title = '이 행 삭제';
    del.setAttribute('aria-label', '이 행 삭제');
    del.textContent = '×';
    tdDel.appendChild(del);

    [tdName, tdSpec, tdQty, tdPrice, tdAmt, tdDel].forEach(function (td) { tr.appendChild(td); });
    return tr;
  }

  function renderItems(items) {
    els.itemsBody.innerHTML = '';
    (items && items.length ? items : [{}]).forEach(function (it) {
      els.itemsBody.appendChild(buildRow(it));
    });
    recalc();
  }

  function addRow(focus) {
    var empty = els.itemsBody.querySelector('.inv-empty-row');
    if (empty) empty.parentNode.removeChild(empty);
    var tr = buildRow({});
    els.itemsBody.appendChild(tr);
    recalc();
    refreshLayout();
    if (focus) tr.querySelector('[data-field="itemName"]').focus();
    setDirty(true);
    return tr;
  }

  function deleteRow(tr) {
    tr.parentNode.removeChild(tr);
    // 표가 완전히 비지 않도록 최소 한 행은 남겨둡니다
    if (!els.itemsBody.querySelector('.inv-item-row')) els.itemsBody.appendChild(buildRow({}));
    recalc();
    refreshLayout();
    setDirty(true);
  }

  /* ---------- 자동 계산 ----------
     화면(DOM)에 있는 값만으로 매번 처음부터 다시 계산합니다 — 따로
     상태를 들고 있지 않으므로 Ctrl+Z(editor.js가 표 HTML을 통째로
     되돌림) 뒤에도 그대로 맞게 계산됩니다. */
  function recalc() {
    var subtotal = 0;
    var rows = document.querySelectorAll('.inv-item-row');
    Array.prototype.forEach.call(rows, function (tr) {
      var get = function (f) { var el = tr.querySelector('[data-field="' + f + '"]'); return el ? el.textContent : ''; };
      var qty = parseNum(get('qty'));
      var price = parseNum(get('unitPrice'));
      var amount = Math.round(qty * price);
      subtotal += amount;
      var amtEl = tr.querySelector('.inv-amount');
      if (amtEl) amtEl.textContent = won(amount);
      // 품목명·규격·수량·단가가 모두 빈 행은 인쇄/PDF에서 숨김
      var blank = !get('itemName').trim() && !get('spec').trim() && !qty && !price;
      tr.classList.toggle('is-blank', blank);
    });

    var taxable = !els.taxable || els.taxable.checked;
    var tax = taxable ? Math.floor(subtotal * TAX_RATE) : 0;
    els.subtotal.textContent = won(subtotal);
    els.tax.textContent = taxable ? won(tax) : '비과세';
    els.total.textContent = won(subtotal + tax);
  }

  /* ---------- 문서 푸터 ---------- */
  function renderDocFooterFromApi(company) {
    // components.js의 renderDocFooter()는 company-info.js(정적 파일)만
    // 읽으므로 여기서는 같은 모양(.doc-footer-band/.l1/.l2)을 API로 받은
    // 값으로 직접 그립니다.
    if (!els.docFooter) return;
    if (!company || !company.addressKr) { els.docFooter.innerHTML = ''; return; }
    var phoneParts = [];
    if (company.phoneDomestic) phoneParts.push(company.phoneDomestic + ' (국내)');
    if (company.phoneIntl) phoneParts.push(company.phoneIntl + ' (해외)');
    var l2 = [];
    if (phoneParts.length) l2.push('Tel. ' + phoneParts.join(' / '));
    if (company.email) l2.push(company.email);
    if (company.homepage) l2.push(company.homepage);

    var band = document.createElement('div');
    band.className = 'doc-footer-band';
    var l1El = document.createElement('div');
    l1El.className = 'l1';
    l1El.textContent = company.addressKr;
    band.appendChild(l1El);
    if (l2.length) {
      var l2El = document.createElement('div');
      l2El.className = 'l2';
      l2El.textContent = l2.join('  ·  ');
      band.appendChild(l2El);
    }
    els.docFooter.innerHTML = '';
    els.docFooter.appendChild(band);
  }

  /* ---------- 공급자(발신)·계좌 — 시트 값 그대로(수정 불가) ---------- */
  function renderSupplier(data) {
    var co = (data && data.company) || {};
    els.supName.textContent = co.nameKr ? co.nameKr + (co.nameEn ? ' (' + co.nameEn + ')' : '') : '';
    els.supBiz.textContent = co.bizNo ? '사업자등록번호 ' + co.bizNo : '';
    els.supAddr.textContent = co.addressKr || '';
    var supContactParts = [];
    if (co.phoneDomestic) supContactParts.push(co.phoneDomestic);
    if (co.email) supContactParts.push(co.email);
    els.supContact.textContent = supContactParts.join(' · ');

    var s = (data && data.sender) || {};
    els.supSender.textContent = s.nameKr ?
      '담당자 ' + s.nameKr + (s.titleKr ? ' ' + s.titleKr : '') + (s.phone ? ' · ' + s.phone : '') :
      '';

    renderDocFooterFromApi(co);

    var b = (data && data.bank) || {};
    els.bank.textContent = (b.bankName || b.accountNo) ?
      [b.bankName, b.accountNo, b.accountHolder ? '(예금주: ' + b.accountHolder + ')' : ''].filter(Boolean).join(' ') :
      '(등록된 계좌 정보 없음)';
  }

  /* ---------- 송장 전체 그리기 ---------- */
  function renderInvoice(data) {
    setText(els.invNo, data.invoiceNo);
    setText(els.invDate, data.issueDate);
    setText(els.invDue, data.dueDate);

    var c = data.customer || {};
    setText(els.custName, c.nameKr);
    setText(els.custBiz, c.bizNo ? '사업자등록번호 ' + c.bizNo : '');
    setText(els.custAddr, c.address);
    var custContactParts = [];
    if (c.contactName) custContactParts.push(c.contactName + (c.contactTitle ? ' ' + c.contactTitle : ''));
    if (c.contactPhone) custContactParts.push(c.contactPhone);
    if (c.contactEmail) custContactParts.push(c.contactEmail);
    setText(els.custContact, custContactParts.join(' · '));

    renderSupplier(data);
    setText(els.note, data.note);

    if (els.taxable) els.taxable.checked = data.taxable !== false;
    renderItems(data.items || []);

    markRendered();
    setDirty(false);
    refreshLayout();
  }

  function renderBlankInvoice() {
    renderInvoice({
      invoiceNo: '',
      issueDate: today(),
      dueDate: '',
      customer: {},
      company: lastData ? lastData.company : null,
      sender: lastData ? lastData.sender : null,
      bank: lastData ? lastData.bank : null,
      note: '',
      taxable: true,
      items: []
    });
    setStatus('새 송장 — 내용을 입력하세요');
    var first = els.custName;
    if (first) first.focus();
  }

  /* ---------- API ---------- */
  function fetchJson(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (body) {
      if (!body || body.ok === false) throw new Error((body && body.error) || '알 수 없는 오류');
      return body.data;
    });
  }

  function loadInvoice(invoiceNo) {
    if (!invoiceNo) return;
    setStatus('불러오는 중…');
    fetchJson(API_URL + '?action=get&inv=' + encodeURIComponent(invoiceNo))
      .then(function (data) {
        lastData = data;
        renderInvoice(data);
        setStatus('');
      })
      .catch(function (err) {
        setStatus('송장을 불러오지 못했습니다: ' + err.message, true);
      });
  }

  function ensureNewOption() {
    if (els.select.querySelector('option[value="' + NEW_VALUE + '"]')) return;
    var opt = document.createElement('option');
    opt.value = NEW_VALUE;
    opt.textContent = '(새 송장 작성 중)';
    els.select.insertBefore(opt, els.select.firstChild);
  }

  function confirmDiscard() {
    return !dirty || window.confirm('화면에서 수정한 내용이 사라집니다. 계속할까요?\n(수정 내용은 시트에 저장되지 않습니다)');
  }

  /* ---------- 품목명 자동완성 드롭다운 (2026-10-23) ----------
     품목명 칸 하나로 "직접 입력"과 "품목마스터에서 고르기"를 함께 합니다.
       - 글자를 입력하면 품목마스터에서 그 글자가 들어간 품목만 보여줌
         (품목명·품목코드·규격 모두 검색, 띄어쓰기·대소문자 무시)
       - ▾ 버튼(또는 빈 칸에 커서)으로 전체 목록
       - 고르면 품목명·규격·단가가 채워지고 수량이 비어 있으면 1
       - 목록에 없는 이름은 그냥 입력하면 끝(직접 입력) — 새 품목을
         품목마스터에 추가하는 건 시트 저장 기능과 함께 추후 진행
       - ↑↓ 이동, Enter 선택, Esc 닫기, 한글 조합 중 Enter는 무시
     드롭다운은 문서(.page) 밖 <body>에 붙는 화면 전용 요소라 인쇄·PDF·
     되돌리기(Ctrl+Z) 스냅샷에 섞이지 않습니다. 품목 목록은 페이지를
     열 때 한 번만 불러옵니다(?action=items). Apps Script가 아직 이
     기능이 없는 옛 버전이면 조용히 실패하고 ▾ 버튼만 숨겨집니다 —
     직접 입력은 그대로 됩니다. */
  var masterItems = [];
  var picker = { el: null, cell: null, list: [], active: -1 };
  var MAX_PICK = 80;

  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }

  function loadMasterItems() {
    if (!API_URL) return;
    fetchJson(API_URL + '?action=items&company=' + encodeURIComponent(COMPANY))
      .then(function (list) {
        masterItems = (list || []).filter(function (it) { return it && it.itemName; });
        ROOT.classList.toggle('inv-has-items', masterItems.length > 0);
      })
      .catch(function () { /* 옛 Apps Script — 직접 입력만 사용 */ });
  }

  function ensurePickerEl() {
    if (picker.el) return picker.el;
    var el = document.createElement('div');
    el.className = 'inv-picker no-print';
    el.setAttribute('role', 'listbox');
    el.hidden = true;
    // 목록을 눌러도 입력 칸의 포커스가 빠지지 않도록
    el.addEventListener('mousedown', function (e) { e.preventDefault(); });
    el.addEventListener('click', function (e) {
      var opt = e.target.closest ? e.target.closest('.inv-picker-opt') : null;
      if (!opt) return;
      choose(Number(opt.getAttribute('data-idx')));
    });
    document.body.appendChild(el);
    picker.el = el;
    return el;
  }

  function closePicker() {
    if (picker.el) picker.el.hidden = true;
    picker.cell = null;
    picker.list = [];
    picker.active = -1;
  }

  function positionPicker() {
    if (!picker.cell || !picker.el) return;
    var td = picker.cell.closest('td') || picker.cell;
    var r = td.getBoundingClientRect();
    picker.el.style.left = (r.left + window.scrollX) + 'px';
    picker.el.style.top = (r.bottom + window.scrollY + 2) + 'px';
    picker.el.style.minWidth = Math.max(r.width, 280) + 'px';
  }

  function renderPicker() {
    var el = ensurePickerEl();
    var typed = picker.cell ? picker.cell.textContent.trim() : '';
    el.innerHTML = '';
    picker.list.forEach(function (it, i) {
      var opt = document.createElement('div');
      opt.className = 'inv-picker-opt' + (i === picker.active ? ' is-active' : '');
      opt.setAttribute('role', 'option');
      opt.setAttribute('data-idx', i);
      var name = document.createElement('div');
      name.className = 'nm';
      name.textContent = it.itemName;
      var meta = document.createElement('div');
      meta.className = 'mt';
      meta.textContent = [it.spec, it.unitPrice ? won(it.unitPrice) : '', it.itemCode].filter(Boolean).join(' · ');
      opt.appendChild(name);
      opt.appendChild(meta);
      el.appendChild(opt);
    });
    var exact = picker.list.some(function (it) { return norm(it.itemName) === norm(typed); });
    if (typed && !exact) {
      var hint = document.createElement('div');
      hint.className = 'inv-picker-hint';
      hint.textContent = picker.list.length ?
        '목록에 없으면 그대로 입력하세요 — "' + typed + '" 직접 입력' :
        '일치하는 품목 없음 — "' + typed + '" 직접 입력으로 사용';
      el.appendChild(hint);
    }
    if (!picker.list.length && !typed) { closePicker(); return; }
    el.hidden = false;
    positionPicker();
    var act = el.querySelector('.is-active');
    if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
  }

  function openPicker(cell, showAll) {
    if (!masterItems.length) return;
    picker.cell = cell;
    var q = showAll ? '' : norm(cell.textContent);
    picker.list = masterItems.filter(function (it) {
      return !q || norm(it.itemName + ' ' + it.itemCode + ' ' + it.spec).indexOf(q) !== -1;
    }).slice(0, MAX_PICK);
    picker.active = -1;
    renderPicker();
  }

  function moveActive(delta) {
    if (!picker.list.length) return;
    var n = picker.list.length;
    picker.active = picker.active < 0 ? (delta > 0 ? 0 : n - 1) : (picker.active + delta + n) % n;
    renderPicker();
  }

  function placeCaretAtEnd(el) {
    el.focus();
    var r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function choose(idx) {
    var it = picker.list[idx];
    var cell = picker.cell;
    if (!it || !cell) return;
    var tr = cell.closest('.inv-item-row');
    closePicker();
    if (!tr) return;
    var f = function (name) { return tr.querySelector('[data-field="' + name + '"]'); };
    setText(f('itemName'), it.itemName);
    setText(f('spec'), it.spec);
    setText(f('unitPrice'), it.unitPrice ? fmt(it.unitPrice) : '');
    if (!parseNum(f('qty').textContent)) setText(f('qty'), '1');
    if (it.itemCode) tr.setAttribute('data-item-code', it.itemCode);
    else tr.removeAttribute('data-item-code');
    recalc();
    setDirty(true);
    refreshLayout();
    placeCaretAtEnd(f('qty'));
  }

  function isNameCell(t) {
    return t && t.getAttribute && t.getAttribute('data-field') === 'itemName';
  }

  function wirePicker() {
    // 입력할 때마다 걸러서 보여주기 (한글 조합 중에도 갱신)
    document.addEventListener('input', function (e) {
      if (!isNameCell(e.target)) return;
      // 품목명을 손으로 바꾸면 품목코드 연결은 끊습니다(다른 품목이 될 수 있으므로)
      var tr = e.target.closest('.inv-item-row');
      if (tr) tr.removeAttribute('data-item-code');
      openPicker(e.target, false);
    });
    // 빈 품목명 칸에 들어가면 전체 목록
    document.addEventListener('focusin', function (e) {
      if (isNameCell(e.target) && !e.target.textContent.trim()) openPicker(e.target, true);
    });
    document.addEventListener('focusout', function (e) {
      if (isNameCell(e.target)) setTimeout(function () {
        if (picker.cell && document.activeElement !== picker.cell) closePicker();
      }, 120);
    });
    // ▾ 버튼
    document.addEventListener('mousedown', function (e) {
      var btn = e.target.closest ? e.target.closest('.inv-pick-btn') : null;
      if (!btn) return;
      e.preventDefault();
      var cell = btn.closest('td').querySelector('[data-field="itemName"]');
      if (picker.cell === cell && picker.el && !picker.el.hidden) { closePicker(); return; }
      placeCaretAtEnd(cell);
      openPicker(cell, true);
    });
    // 키보드 — capture 단계에서 먼저 받아, 목록이 열려 있을 때의 Enter가
    // "다음 칸으로 이동"(아래 wireEvents의 keydown)보다 먼저 처리되게 합니다.
    document.addEventListener('keydown', function (e) {
      if (!picker.cell || e.target !== picker.cell || !picker.el || picker.el.hidden) return;
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
      else if (e.key === 'Escape') { e.preventDefault(); closePicker(); }
      else if (e.key === 'Enter' && picker.active >= 0) {
        e.preventDefault();
        e.stopPropagation();
        choose(picker.active);
      } else if (e.key === 'Enter' || e.key === 'Tab') { closePicker(); } // 직접 입력으로 확정
    }, true);
    window.addEventListener('resize', positionPicker);
    window.addEventListener('scroll', positionPicker, true);
    window.addEventListener('beforeprint', closePicker);
  }

  /* ---------- 이벤트 ---------- */
  function wireEvents() {
    // 머리 부분 칸들을 편집 가능하게
    HEADER_FIELDS.forEach(function (f) {
      var el = els[f[0]];
      if (!el) return;
      makeEditable(el, f[1]);
      if (el.tagName === 'DIV' || el.tagName === 'P') el.classList.add('editable-block');
      setText(el, el.textContent);
    });

    // 입력할 때마다 재계산 (표 + 머리 칸 모두 수정 표시)
    document.addEventListener('input', function (e) {
      var t = e.target;
      if (!t || !t.closest || !t.closest('.inv-ed')) return;
      setDirty(true);
      if (t.closest('.inv-item-row')) recalc();
    });

    // 숫자 칸: 포커스가 빠질 때 천 단위 쉼표로 정리
    document.addEventListener('focusout', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var f = t.getAttribute('data-field');
      if (f !== 'qty' && f !== 'unitPrice') return;
      var raw = t.textContent.trim();
      setText(t, raw === '' ? '' : fmt(parseNum(raw)));
      recalc();
    });

    // 편집 칸 공통 키 처리: Enter는 줄바꿈 대신 다음 칸으로 이동,
    // 마지막 행의 마지막 칸(단가)에서 Enter → 새 행 추가
    document.addEventListener('keydown', function (e) {
      var t = e.target;
      if (!t || !t.closest || !t.closest('.inv-ed')) return;
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      var row = t.closest('.inv-item-row');
      if (!row) { t.blur(); return; }
      var cells = Array.prototype.slice.call(row.querySelectorAll('.inv-ed'));
      var idx = cells.indexOf(t);
      if (idx < cells.length - 1) { cells[idx + 1].focus(); return; }
      var next = row.nextElementSibling;
      if (next && next.classList.contains('inv-item-row')) next.querySelector('.inv-ed').focus();
      else addRow(true);
    });

    // 붙여넣기는 서식 없는 한 줄 텍스트로만
    document.addEventListener('paste', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.inv-ed') : null;
      if (!t) return;
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text').replace(/\s*\n\s*/g, ' ');
      document.execCommand('insertText', false, text);
    });

    // 행 삭제(× 버튼) — 표가 페이지를 넘어가도 잡히도록 document 위임
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.inv-del-btn') : null;
      if (!btn) return;
      var tr = btn.closest('.inv-item-row');
      if (tr) deleteRow(tr);
    });
    // + 행 추가 (pagination이 버튼을 옮겨도 같은 노드이므로 직접 연결)
    if (els.addRow) els.addRow.addEventListener('click', function () { addRow(true); });

    // Ctrl+Z / Ctrl+Y(editor.js가 표 HTML을 통째로 되돌림) 뒤 재계산
    document.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      var k = (e.key || '').toLowerCase();
      if (k === 'z' || k === 'y') setTimeout(recalc, 0);
    });

    if (els.taxable) els.taxable.addEventListener('change', function () { recalc(); setDirty(true); });

    if (els.newBtn) els.newBtn.addEventListener('click', function () {
      if (!confirmDiscard()) return;
      ensureNewOption();
      els.select.value = NEW_VALUE;
      currentValue = NEW_VALUE;
      renderBlankInvoice();
    });

    els.select.addEventListener('change', function () {
      if (!confirmDiscard()) { els.select.value = currentValue; return; }
      currentValue = els.select.value;
      if (currentValue === NEW_VALUE) renderBlankInvoice();
      else loadInvoice(currentValue);
    });

    window.addEventListener('beforeunload', function (e) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  function init() {
    wireEvents();
    wirePicker();
    renderItems([]); // 데이터가 오기 전에도 바로 입력할 수 있도록 빈 행 하나
    markRendered();

    if (!API_URL) {
      setStatus('DISE_INVOICE_API_URL이 아직 설정되지 않았습니다 — 빈 양식으로 작성할 수 있습니다', true);
      els.select.innerHTML = '<option value="">(API 주소 미설정)</option>';
      return;
    }

    loadMasterItems();
    setStatus('송장 목록을 불러오는 중…');
    fetchJson(API_URL + '?action=list&company=' + encodeURIComponent(COMPANY))
      .then(function (list) {
        if (!list || !list.length) {
          els.select.innerHTML = '<option value="">(발행된 송장 없음)</option>';
          setStatus('[+ 새 송장 작성]으로 빈 양식을 작성할 수 있습니다');
          return;
        }
        els.select.innerHTML = '';
        list.forEach(function (no) {
          var opt = document.createElement('option');
          opt.value = no;
          opt.textContent = no;
          els.select.appendChild(opt);
        });
        setStatus('');
        currentValue = list[0];
        loadInvoice(list[0]); // 기본으로 가장 최근 항목 하나를 바로 보여줍니다
      })
      .catch(function (err) {
        setStatus('송장 목록을 불러오지 못했습니다: ' + err.message, true);
        els.select.innerHTML = '<option value="">(불러오기 실패)</option>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
