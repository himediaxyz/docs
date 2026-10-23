/**
 * ============================================================
 * 다이즈하이미디어 그룹 송장(인보이스) 시스템 — 마스터데이터 API
 * ============================================================
 * 이 스크립트는 "다이즈하이미디어_그룹_마스터데이터" 구글 시트에
 * 붙여서(컨테이너 바운드 스크립트) 웹 앱으로 배포합니다. dise-docs
 * 사이트(templates/invoice/)가 이 웹 앱 URL을 fetch()로 호출해서
 * 항상 이 시트의 "지금 값"을 그대로 읽어갑니다 — 즉 이 시트가
 * 회사정보·거래처·송장 데이터의 유일한 원본(master)이고, 시트에서
 * 직접 다운로드해서 보는 것과 사이트에서 뽑는 것이 항상 같은
 * 데이터를 보게 됩니다.
 *
 * ★ 이 파일의 원본은 GitHub 저장소 apps-script/Code.gs 입니다
 *   (2026-10-23부터 저장소에서 버전 관리). 시트의 Apps Script를
 *   고칠 때는 저장소 파일도 같이 고쳐 두어야 담당자가 바뀌어도
 *   이어서 관리할 수 있습니다.
 *
 * 설치 방법:
 *  1) 구글 시트 상단 메뉴 "확장 프로그램 > Apps Script" 클릭
 *  2) 기본으로 열려있는 Code.gs의 내용을 전부 지우고 이 파일 내용을
 *     그대로 붙여넣기
 *  3) 저장(디스크 아이콘 또는 Ctrl/Cmd+S)
 *  4) 오른쪽 위 "배포 > 새 배포" 클릭
 *  5) 유형 선택(톱니바퀴 아이콘)에서 "웹 앱" 선택
 *  6) "실행 대상": 나(본인 계정) / "액세스 권한이 있는 사용자": 모든 사용자
 *     (사이트가 로그인 없이 브라우저에서 바로 불러올 수 있어야 하므로
 *     "모든 사용자"로 설정해야 합니다 — 시트 자체의 편집 권한과는
 *     별개입니다. 참고: 지금은 별도 보호 장치 없이 배포하기로
 *     결정했습니다 — 필요해지면 나중에 보강할 수 있습니다.)
 *  7) "배포" 클릭 → 처음 배포할 때는 구글이 권한 승인 화면을 띄웁니다
 *     ("고급" > "이동(안전하지 않음)" 등을 눌러 본인 계정으로 승인)
 *  8) 배포 완료 후 나오는 "웹 앱" URL(.../exec 로 끝남)을 사이트의
 *     templates/invoice/index.html 안 DISE_INVOICE_API_URL 값에 넣기.
 *  9) 이 스크립트 "코드"를 고친 뒤에는 "배포 > 배포 관리 > 수정(연필
 *     아이콘) > 버전: 새 버전 > 배포"를 해야 반영됩니다. ("새 배포"가
 *     아니라 기존 배포를 수정해야 URL이 그대로 유지됩니다.) 시트
 *     "데이터"를 고치는 건 다시 배포할 필요 없이 바로 반영됩니다.
 *
 * 제공하는 API (모두 GET, JSON 응답):
 *   ?action=list&company=disehimedia
 *     → 그 회사가 발행한 송장번호 목록
 *   ?action=get&inv=DHM-2026-001
 *     → 그 송장 한 건의 전체 데이터(회사/거래처/발신인/은행/품목 포함)
 *   ?action=items&company=disehimedia        (2026-10-23 추가)
 *     → 품목마스터 목록(송장 화면의 품목명 드롭다운용)
 *       [{ itemCode, itemName, spec, unitPrice, note }, ...]
 *       - 회사 칸(회사코드 등)이 비어 있거나 "공통"/"ALL"이면 모든 회사에 표시,
 *         "disehimedia,r2v"처럼 쉼표로 여러 회사 지정 가능
 *       - 사용여부 칸이 N / 미사용 / FALSE 이면 제외
 *       - 품목마스터 탭에 회사/사용여부 칸이 없으면 전 품목을 그대로 돌려줌
 * ============================================================
 */

var SHEET_NAMES = {
  COMPANY: '회사정보',
  SENDER: '발신인정보',
  BANK: '은행계좌정보',
  CUSTOMER: '거래처',
  INVOICE: '송장',
  LINE: '송장항목',
  ITEM: '품목마스터'
};

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';
  var payload;
  try {
    if (action === 'list') {
      payload = { ok: true, data: listInvoices_(e.parameter.company) };
    } else if (action === 'get') {
      payload = { ok: true, data: getInvoice_(e.parameter.inv) };
    } else if (action === 'items') {
      payload = { ok: true, data: listItems_(e.parameter.company) };
    } else {
      payload = { ok: false, error: '알 수 없는 action입니다 (list, get, items 중 하나를 쓰세요)' };
    }
  } catch (err) {
    payload = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 헤더 셀 텍스트를 깔끔한 키 이름으로 정리합니다.
 * 예: "회사코드*" → "회사코드", "거래처명(자동)" → "거래처명",
 *     "단가(공급가,KRW)*" → "단가", "_key(자동, 건드리지 마세요)" → "_key"
 */
function normalizeHeader_(h) {
  h = String(h || '');
  h = h.replace(/\([^)]*\)/g, ''); // (…) 안내문 제거
  h = h.replace(/\*/g, '');        // 필수 표시(*) 제거
  return h.trim();
}

/**
 * 시트 하나를 [{헤더: 값, ...}, ...] 형태의 배열로 읽어옵니다. 첫 번째
 * 칸이 빈 행은 건너뜁니다(빈 줄/안내 줄 방지).
 */
function sheetObjects_(sheetName) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh) throw new Error('시트를 찾을 수 없습니다: ' + sheetName);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(normalizeHeader_);
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (row[0] === '' || row[0] === null) continue; // 빈 행 건너뜀
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      obj[headers[c]] = row[c];
    }
    rows.push(obj);
  }
  return rows;
}

function findByField_(rows, field, value) {
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][field]) === String(value)) return rows[i];
  }
  return null;
}

/**
 * 여러 후보 헤더 이름 중 그 행에 실제로 있는 첫 번째 값을 돌려줍니다.
 * 품목마스터 탭의 칸 이름이 조금 달라도(예: "규격/단위" vs "규격")
 * 동작하도록 하기 위한 것입니다. 없으면 undefined.
 */
function pick_(row, names) {
  for (var i = 0; i < names.length; i++) {
    if (Object.prototype.hasOwnProperty.call(row, names[i])) return row[names[i]];
  }
  return undefined;
}

function fmtDate_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd');
  }
  return String(v);
}

function listInvoices_(companyCode) {
  if (!companyCode) throw new Error('company 파라미터가 필요합니다');
  var rows = sheetObjects_(SHEET_NAMES.INVOICE);
  return rows
    .filter(function (r) { return String(r['발행회사코드']) === String(companyCode); })
    .map(function (r) { return r['송장번호']; })
    .filter(function (v) { return !!v; });
}

/**
 * 품목마스터 목록 (송장 화면 품목명 드롭다운용).
 */
function listItems_(companyCode) {
  var rows = sheetObjects_(SHEET_NAMES.ITEM);
  var company = String(companyCode || '').trim().toLowerCase();

  return rows
    .filter(function (r) {
      // 사용여부: N / 미사용 / FALSE / 0 이면 제외 (칸이 없거나 비어 있으면 사용)
      var use = pick_(r, ['사용여부', '사용', '활성']);
      if (use === false) return false;
      var u = String(use == null ? '' : use).trim().toUpperCase();
      if (u === 'N' || u === 'NO' || u === 'FALSE' || u === '0' || u === '미사용') return false;

      // 회사: 비어 있거나 공통/ALL이면 모든 회사, 아니면 쉼표 목록에 포함될 때만
      if (!company) return true;
      var co = pick_(r, ['회사코드', '발행회사코드', '사용회사코드', '회사']);
      var c = String(co == null ? '' : co).trim().toLowerCase();
      if (!c || c === '공통' || c === 'all') return true;
      return c.split(/\s*,\s*/).indexOf(company) !== -1;
    })
    .map(function (r) {
      return {
        itemCode: String(pick_(r, ['품목코드', '코드']) || ''),
        itemName: String(pick_(r, ['품목명', '품명', '항목']) || ''),
        spec: String(pick_(r, ['규격/단위', '규격', '단위']) || ''),
        unitPrice: Number(String(pick_(r, ['단가', '기본단가', '공급단가']) || '').replace(/[^0-9.\-]/g, '')) || 0,
        note: String(pick_(r, ['비고', '설명']) || '')
      };
    })
    .filter(function (it) { return !!it.itemName; });
}

function getInvoice_(invoiceNo) {
  if (!invoiceNo) throw new Error('inv 파라미터가 필요합니다');

  var invoices = sheetObjects_(SHEET_NAMES.INVOICE);
  var inv = findByField_(invoices, '송장번호', invoiceNo);
  if (!inv) throw new Error('해당 송장번호를 찾을 수 없습니다: ' + invoiceNo);

  var companies = sheetObjects_(SHEET_NAMES.COMPANY);
  var company = findByField_(companies, '회사코드', inv['발행회사코드']) || {};

  var customers = sheetObjects_(SHEET_NAMES.CUSTOMER);
  var customer = findByField_(customers, '거래처코드', inv['거래처코드']) || {};

  var senders = sheetObjects_(SHEET_NAMES.SENDER);
  var sender = findByField_(senders, 'id', inv['담당발신인id']) || {};

  var banks = sheetObjects_(SHEET_NAMES.BANK);
  var bank = findByField_(banks, '회사코드', inv['발행회사코드']) || {};

  var allLines = sheetObjects_(SHEET_NAMES.LINE);
  var items = allLines
    .filter(function (r) { return String(r['송장번호']) === String(invoiceNo); })
    .map(function (r) {
      var qty = Number(r['수량']) || 0;
      var unitPrice = Number(r['단가']) || 0;
      var amount = Number(r['공급가액']);
      if (!amount) amount = qty * unitPrice; // 시트 계산이 비어있으면 직접 계산(안전장치)
      return {
        itemCode: r['품목코드'] || '',
        itemName: r['품목명'] || '',
        spec: r['규격/단위'] || '',
        qty: qty,
        unitPrice: unitPrice,
        amount: amount,
        note: r['비고'] || ''
      };
    });

  return {
    invoiceNo: inv['송장번호'],
    companyCode: inv['발행회사코드'],
    customerCode: inv['거래처코드'],
    issueDate: fmtDate_(inv['발행일']),
    dueDate: fmtDate_(inv['결제기한']),
    taxable: String(inv['과세여부']).toUpperCase() === 'Y',
    subtotal: Number(inv['공급가액']) || 0,
    tax: Number(inv['세액']) || 0,
    total: Number(inv['합계금액']) || 0,
    paymentStatus: inv['결제상태'] || '',
    note: inv['비고'] || '',

    company: {
      code: company['회사코드'] || inv['발행회사코드'],
      nameKr: company['정식명칭_한글'] || '',
      nameEn: company['정식명칭_영문'] || '',
      badgeColor: company['배지색상'] || '',
      phoneDomestic: company['전화_국내'] || '',
      phoneIntl: company['전화_해외'] || '',
      email: company['이메일'] || '',
      addressKr: company['주소_한글'] || '',
      homepage: company['홈페이지'] || '',
      bizNo: company['사업자등록번호'] || '',
      docPrefix: company['문서번호_접두사'] || ''
    },
    customer: {
      code: customer['거래처코드'] || inv['거래처코드'],
      nameKr: customer['거래처명'] || '',
      bizNo: customer['사업자등록번호'] || '',
      ceo: customer['대표자명'] || '',
      address: customer['주소'] || '',
      contactName: customer['담당자명'] || '',
      contactTitle: customer['담당자직급'] || '',
      contactPhone: customer['담당자연락처'] || '',
      contactEmail: customer['담당자이메일'] || ''
    },
    sender: {
      id: sender['id'] || '',
      nameKr: sender['이름_한글'] || '',
      nameRoman: sender['이름_로마자'] || '',
      titleKr: sender['직함_한글'] || '',
      titleEn: sender['직함_영문'] || '',
      phone: sender['전화'] || '',
      email: sender['이메일'] || ''
    },
    bank: {
      bankName: bank['은행명'] || '',
      accountNo: bank['계좌번호'] || '',
      accountHolder: bank['예금주'] || ''
    },
    items: items
  };
}
