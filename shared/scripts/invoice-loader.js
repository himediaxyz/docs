/* ============================================================
   invoice-loader.js
   templates/invoice/ 전용 스크립트. 구글 시트(다이즈하이미디어_그룹_
   송장관리시스템)에 붙인 Apps Script 웹 앱(shared/README.md의
   "마스터 데이터" 설명 참고)에서 송장 데이터를 그대로 읽어와 화면을
   채웁니다.

   ★ 왜 이렇게 나누었나 (2026-09-16): "회사정보·거래처·송장 항목은
   구글 드라이브의 스프레드시트 한 곳에서만 관리하고, 시트에서 직접
   다운로드해서 보든 이 사이트에서 뽑든 항상 같은 데이터를 보여준다"는
   결정에 따른 것입니다. 그래서 이 문서는 company-info.js의 정적
   정보(로고 파일 경로·비율·배지색 — 자주 안 바뀌는 "디자인 자산")만
   재사용하고, 실제로 자주 바뀌는 업무 데이터(주소·전화·이메일·
   거래처·품목·금액)는 전부 이 스크립트가 API로 받아온 값을 그대로
   씁니다. 즉 이 문서를 열 때마다 시트의 "지금" 값을 그대로 보여주고,
   시트를 고치면 다음에 열 때 바로 반영됩니다(사이트 코드를 고치거나
   다시 배포할 필요 없음 — Apps Script 코드 자체를 바꿨을 때만 재배포
   필요).

   window.DISE_INVOICE_API_URL / window.DISE_INVOICE_COMPANY 는
   templates/invoice/index.html의 인라인 스크립트가 미리 설정해둡니다.
   ============================================================ */

(function () {
  var API_URL = window.DISE_INVOICE_API_URL || '';
  var COMPANY = window.DISE_INVOICE_COMPANY || 'disehimedia';

  var els = {
    select: document.getElementById('invoiceSelect'),
    status: document.getElementById('invStatus'),
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

  function setStatus(text, isError) {
    if (!els.status) return;
    els.status.textContent = text || '';
    els.status.classList.toggle('is-error', !!isError);
  }

  function won(n) {
    n = Number(n) || 0;
    return n.toLocaleString('ko-KR') + '원';
  }

  // pagination.js가 헤더/푸터 높이를 다시 재도록 알려주는 best-effort
  // 신호입니다. 데이터가 비동기(fetch)로 나중에 들어오다 보니 최초
  // 'load' 이벤트 시점엔 아직 반영이 안 돼 있을 수 있어서입니다.
  // 실제 페이지 넘침 재계산 방식은 pagination.js 구현에 따라 다를 수
  // 있으므로, 실제 배포 후 화면에서 한 번 확인이 필요합니다.
  function notifyLayoutChanged() {
    try { window.dispatchEvent(new Event('resize')); } catch (e) { /* no-op */ }
  }

  function renderDocFooterFromApi(company) {
    // components.js의 renderDocFooter()는 company-info.js(정적 파일)만
    // 읽으므로 여기서는 같은 모양(.doc-footer-band/.l1/.l2)을 API로 받은
        // 값으로 직접 그립니다.
    if (!els.docFooter) return;
    if (!company || !company.addressKr) {
      els.docFooter.innerHTML = '';
      return;
    }
    var phoneParts = [];
    if (company.phoneDomestic) phoneParts.push(company.phoneDomestic + ' (국내)');
    if (company.phoneIntl) phoneParts.push(company.phoneIntl + ' (해외)');
    var l2 = [];
    if (phoneParts.length) l2.push('Tel. ' + phoneParts.join(' / '));
    if (company.email) l2.push(company.email);
    if (company.homepage) l2.push(company.homepage);

    els.docFooter.innerHTML =
      '<div class="doc-footer-band">' +
        '<div class="l1">' + company.addressKr + '</div>' +
        (l2.length ? '<div class="l2">' + l2.join(' &nbsp;&middot;&nbsp; ') + '</div>' : '') +
      '</div>';
  }

  function renderInvoice(data) {
    els.invNo.textContent = data.invoiceNo || '';
    els.invDate.textContent = data.issueDate || '';
    els.invDue.textContent = data.dueDate || '(미정)';

    var c = data.customer || {};
    els.custName.textContent = c.nameKr || '(거래처 정보 없음)';
    els.custBiz.textContent = c.bizNo ? '사업자등록번호 ' + c.bizNo : '';
    els.custAddr.textContent = c.address || '';
    var custContactParts = [];
    if (c.contactName) custContactParts.push(c.contactName + (c.contactTitle ? ' ' + c.contactTitle : ''));
    if (c.contactPhone) custContactParts.push(c.contactPhone);
    if (c.contactEmail) custContactParts.push(c.contactEmail);
    els.custContact.textContent = custContactParts.join(' · ');

    var co = data.company || {};
    els.supName.textContent = co.nameKr ? co.nameKr + (co.nameEn ? ' (' + co.nameEn + ')' : '') : '';
    els.supBiz.textContent = co.bizNo ? '사업자등록번호 ' + co.bizNo : '';
    els.supAddr.textContent = co.addressKr || '';
    var supContactParts = [];
    if (co.phoneDomestic) supContactParts.push(co.phoneDomestic);
    if (co.email) supContactParts.push(co.email);
    els.supContact.textContent = supContactParts.join(' · ');

    var s = data.sender || {};
    els.supSender.textContent = s.nameKr ?
      '담당자 ' + s.nameKr + (s.titleKr ? ' ' + s.titleKr : '') + (s.phone ? ' · ' + s.phone : '') :
      '';

    renderDocFooterFromApi(co);

    var items = data.items || [];
    if (!items.length) {
      els.itemsBody.innerHTML = '<tr class="inv-empty-row"><td colspan="5">등록된 품목이 없습니다</td></tr>';
    } else {
      els.itemsBody.innerHTML = items.map(function (it) {
        return '<tr>' +
          '<td>' + (it.itemName || '') + '</td>' +
          '<td>' + (it.spec || '') + '</td>' +
          '<td class="num">' + (it.qty || 0).toLocaleString('ko-KR') + '</td>' +
          '<td class="num">' + won(it.unitPrice) + '</td>' +
          '<td class="num">' + won(it.amount) + '</td>' +
        '</tr>';
      }).join('');
    }

    els.subtotal.textContent = won(data.subtotal);
    els.tax.textContent = data.taxable ? won(data.tax) : '비과세';
    els.total.textContent = won(data.total);

    var b = data.bank || {};
    els.bank.textContent = (b.bankName || b.accountNo) ?
      [b.bankName, b.accountNo, b.accountHolder ? '(예금주: ' + b.accountHolder + ')' : ''].filter(Boolean).join(' ') :
      '(등록된 계좌 정보 없음)';
    els.note.textContent = data.note || '(없음)';

    notifyLayoutChanged();
  }

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
        renderInvoice(data);
        setStatus('');
      })
      .catch(function (err) {
        setStatus('송장을 불러오지 못했습니다: ' + err.message, true);
      });
  }

  function init() {
    if (!API_URL) {
      setStatus('DISE_INVOICE_API_URL이 아직 설정되지 않았습니다 — templates/invoice/index.html 참고', true);
      els.select.innerHTML = '<option value="">(API 주소 미설정)</option>';
      return;
    }

    setStatus('송장 목록을 불러오는 중…');
    fetchJson(API_URL + '?action=list&company=' + encodeURIComponent(COMPANY))
      .then(function (list) {
        if (!list || !list.length) {
          els.select.innerHTML = '<option value="">(발행된 송장 없음)</option>';
          setStatus('');
          return;
        }
        els.select.innerHTML = list.map(function (no) {
          return '<option value="' + no + '">' + no + '</option>';
        }).join('');
        setStatus('');
        loadInvoice(list[0]); // 기본으로 가장 최근(마지막) 항목 하나를 바로 보여줍니다
      })
      .catch(function (err) {
        setStatus('송장 목록을 불러오지 못했습니다: ' + err.message, true);
        els.select.innerHTML = '<option value="">(불러오기 실패)</option>';
      });

    els.select.addEventListener('change', function () {
      loadInvoice(els.select.value);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
