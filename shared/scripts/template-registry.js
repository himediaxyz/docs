/* ============================================================
   template-registry.js
   저장소에 있는 "문서 양식(템플릿)" 전체 목록 — 한 곳에서만 관리합니다.

   ★ 왜 필요한가: 각 문서 템플릿 상단 도구모음의 "문서 양식" 드롭다운
     (템플릿을 잘못 열었을 때 다른 양식으로 바로 전환하는 메뉴)이 이
     목록을 그대로 읽어서 그립니다(shared/scripts/editor.js 섹션 12).
     새 템플릿을 추가할 때 이 배열에 항목 하나만 더하면, 이미 만들어진
     모든 템플릿 페이지의 드롭다운에도 자동으로 나타납니다 — index.html의
     TEMPLATES_BY_COMPANY(그룹사 포털의 "이 회사가 쓸 수 있는 템플릿"
     목록)와는 별개입니다. 그쪽은 회사별로 어떤 템플릿을 보여줄지
     고르는 목록이고, 이 파일은 "전체 템플릿이 몇 개, 어디 있는지"를
     아는 단일 저장소입니다.

   path: 저장소 루트 기준 폴더 경로(끝에 슬래시). index.html에서 쓰는
   href와 같은 규칙입니다.

   이 파일을 쓰는 곳: 사용자가 직접 입력하는 문서 템플릿(company-info.js
   보다 먼저, editor.js보다는 먼저 불러오면 됩니다 — 순서 자체는
   중요하지 않고 editor.js가 실행되기 전에만 로드되면 됩니다)
     <script src="../../shared/scripts/template-registry.js"></script>
   ============================================================ */

window.DISE = window.DISE || {};

// 이 스크립트 자신의 <script src="..."> 경로에서 저장소 루트(사이트
// 최상위 폴더)의 실제 위치를 자동으로 계산해둡니다 — 템플릿이 폴더
// 몇 단계 깊이에 있든 링크를 매번 손으로 안 넘겨줘도 되게 하기 위해서.
var DISE_SITE_ROOT = (function () {
  var s = document.currentScript;
  return s ? s.src.replace(/shared\/scripts\/template-registry\.js.*$/, '') : '';
})();

DISE.templates = [
  {
    // 2026-09-02: "공문 (대외 발송용)" → "레터헤드 (영문)"으로 개편 —
    // gongmun-premium(레터헤드 국문)과 같은 레터헤드 포맷의 영문판입니다
    // (템플릿 폴더/키는 그대로 'gongmun'이고 이름만 바뀌었습니다).
    key: 'gongmun',
    nameKr: '레터헤드 (영문)',
    path: 'templates/gongmun/'
  },
  {
    // 2026-09-02: "공문 — 프리미엄 레터헤드" → "레터헤드 (국문)"으로 개편.
    key: 'gongmun-premium',
    nameKr: '레터헤드 (국문)',
    path: 'templates/gongmun-premium/'
  },
  {
    // 2026-09-16 추가 — 구글 시트(다이즈하이미디어_그룹_송장관리시스템)를
    // 마스터 데이터로 삼아 Apps Script API로 읽어와 채우는 송장(인보이스)
    // 문서. 4개사 공용 템플릿이며 ?company= 파라미터로 계열사를 구분합니다
    // (index.html의 TEMPLATES_BY_COMPANY 참고). 자세한 구조는
    // shared/scripts/invoice-loader.js 상단 주석 참고.
    key: 'invoice',
    nameKr: '송장 (인보이스)',
    path: 'templates/invoice/'
  },
  {
    // 2026-10-23 — 계약서(?company=&type=). 본문은 shared/scripts/contracts/
    // {회사}.js 데이터로 그립니다. 현재 R2V·BIC 계약서 데이터가 있습니다.
    key: 'contract',
    nameKr: '계약서',
    path: 'templates/contract/'
  },
  {
    // 2026-10-23 — 계열사 표준 견적서(?company=). shared/scripts/quote-editor.js
    key: 'quote',
    nameKr: '견적서',
    path: 'templates/quote/'
  }
  // 새 템플릿(보고서, 기안문 등)이 생기면 여기에 { key, nameKr, path }
  // 형식으로 추가하면 됩니다.
];

/**
 * key에 해당하는 템플릿의 절대 경로(href)를 돌려줍니다. 목록에 없는
 * key면 null.
 * @param {string} key
 * @returns {string|null}
 */
DISE.templateHref = function (key) {
  var match = null;
  for (var i = 0; i < DISE.templates.length; i++) {
    if (DISE.templates[i].key === key) { match = DISE.templates[i]; break; }
  }
  return match ? DISE_SITE_ROOT + match.path : null;
};
