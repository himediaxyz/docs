/* ============================================================
   components.js
   화면/문서를 구성하는 4가지 공통 조각을 그려 넣습니다. 용어 정의는
   company-info.js 상단 주석과 shared/README.md를 참고하세요 — 요약:

     renderSiteHeader / renderSiteFooter
       → "사이트" 레벨. 화면 전용, 인쇄 안 됨, 모든 계열사·문서 공통.
     renderDocHeader / renderDocFooter
       → "문서" 레벨. 실제 레터헤드의 일부, 인쇄됨, 계열사별로 다름.

   왜 HTML을 복사-붙여넣기 하지 않고 JS로 그리나: 새 문서 템플릿을
   추가할 때 이 네 조각을 매번 타이핑할 필요 없이, 자리 표시자 id와
   함수 호출 몇 줄이면 됩니다. 로고나 주소가 바뀌면 company-info.js만
   고치면 모든 템플릿에 한번에 반영됩니다.

   사용법 (각 템플릿의 body 안 — 정확한 예시는 templates/gongmun/index.html 참고):

     화면 전용 자리:
       <div id="siteHeader" class="no-print"></div>
       ...
       <div id="siteFooter" class="no-print"></div>

     문서(종이) 자리 — 표(thead/tfoot)라서 인쇄 시 페이지마다 반복됨:
       <thead><tr><td class="cell-head" id="docHeader"></td></tr></thead>
       <tfoot><tr><td class="cell-foot" id="docFooter"></td></tr></tfoot>

     스크립트:
       <script src="../../shared/scripts/company-info.js"></script>
       <script src="../../shared/scripts/components.js"></script>
       <script>
         DISE.components.renderSiteHeader({ portalHref: '../../index.html' });
         DISE.components.renderSiteFooter();
         DISE.components.renderDocHeader({ company: 'disehimedia', docTypeTag: '공식 공문' });
         DISE.components.renderDocFooter({ company: 'disehimedia' });
       </script>

   ※ 반드시 company-info.js를 먼저 불러온 뒤에 이 파일을 불러오세요.
      네 함수 모두 pagination.js가 높이를 재는 'load' 이벤트보다 먼저
      실행되어야 하므로, <body> 안쪽 스크립트 순서만 지키면 자동으로
      만족됩니다(스크립트는 위에서 아래로 순서대로 실행됨).
   ============================================================ */

window.DISE = window.DISE || {};

// 이 스크립트 파일 자신의 <script src="..."> 경로에서 shared/ 폴더의
// 실제 위치를 자동으로 계산해둡니다 — 템플릿이 폴더 몇 단계 깊이에
//있든 로고 경로를 매번 손으로 안 넘겨줘도 되게 하기 위해서입니다.
var DISE_SHARED_ROOT = (function () {
  var s = document.currentScript;
  return s ? s.src.replace(/scripts\/components\.js.*$/, '') : '';
})();

DISE.components = {

  /* ============ 사이트 레벨 (화면 전용, 인쇄 안 됨) ============ */

  /**
   * 화면 상단의 "사이트 헤더" — 포털로 돌아가는 링크 + 도구 이름.
   * @param {Object} [opts]
   * @param {string} [opts.portalHref] - 포털(index.html)까지의 상대 경로.
   *   템플릿이 저장소 루트에서 몇 단계 깊이에 있느냐에 따라 다르므로
   *   호출하는 템플릿에서 직접 넘겨줘야 합니다 (예: '../../index.html').
   */
  renderSiteHeader: function (opts) {
    opts = opts || {};
    var target = document.getElementById('siteHeader');
    if (!target) return;
    var portalHref = opts.portalHref || 'index.html';

    target.innerHTML =
      '<a class="site-header-bar" href="' + portalHref + '">' +
        '<span class="site-header-arrow">&larr;</span>' +
        '<span class="site-header-name">' + DISE.site.nameKr + '</span>' +
      '</a>';
  },

  /**
   * 화면 하단의 "사이트 푸터" — 캡션 한 줄.
   * @param {Object} [opts]
   * @param {string} [opts.text] - 표시할 문구. 기본값은 사이트 이름.
   */
  renderSiteFooter: function (opts) {
    opts = opts || {};
    var target = document.getElementById('siteFooter');
    if (!target) return;
    var text = opts.text || DISE.site.nameKr;
    target.innerHTML = '<p class="site-footer-text">' + text + '</p>';
  },

  /* ============ 문서 레벨 (인쇄됨, 계열사별로 다름) ============ */

  /**
   * 종이 상단의 "문서 헤더" — 로고 + 회사명 + 문서 종류 태그.
   * @param {Object} [opts]
   * @param {string} [opts.company] - DISE.companies의 key (기본값 'disehimedia').
   * @param {string} [opts.docTypeTag] - "공식 공문"처럼 표시할 문서 종류 문구.
   */
  renderDocHeader: function (opts) {
    opts = opts || {};
    var companyKey = opts.company || 'disehimedia';
    var docTypeTag = opts.docTypeTag || '';
    var target = document.getElementById('docHeader');
    if (!target) return;

    var c = DISE.companies[companyKey];
    if (!c) {
      console.error('DISE.components.renderDocHeader: "' + companyKey + '" 계열사 정보가 company-info.js에 없습니다.');
      return;
    }

    // 로고 높이를 고정하고, 계열사마다 다른 로고 비율(logoRatio)에 맞춰
    // 너비를 계산합니다 — 로고가 정사각형이든 가로로 넓든 같은 높이로
    // 나란히 보이도록.
    var logoHeightPx = 56;
    var logoWidthPx = Math.round(logoHeightPx * (c.logoRatio || 1));
    var logoUrl = DISE_SHARED_ROOT + 'assets/logos/' + c.logoMark;

    target.innerHTML =
      '<div class="doc-header-band">' +
        '<div class="doc-logo" style="width:' + logoWidthPx + 'px;height:' + logoHeightPx + 'px;' +
          '-webkit-mask-image:url(\'' + logoUrl + '\');mask-image:url(\'' + logoUrl + '\');"></div>' +
        '<div class="doc-header-text">' +
          '<div class="brand-kr">' + c.nameKr + '</div>' +
          (c.nameEn && c.nameEn !== c.nameKr ? '<div class="brand-en">' + c.nameEn + '</div>' : '') +
          (docTypeTag ? '<div class="brand-tag">' + docTypeTag + '</div>' : '') +
        '</div>' +
      '</div>';
  },

  /**
   * 종이 하단의 "문서 푸터" — 주소·전화·이메일·웹사이트.
   * @param {Object} [opts]
   * @param {string} [opts.company] - DISE.companies의 key (기본값 'disehimedia').
   */
  renderDocFooter: function (opts) {
    opts = opts || {};
    var companyKey = opts.company || 'disehimedia';
    var target = document.getElementById('docFooter');
    if (!target) return;

    var c = DISE.companies[companyKey];
    if (!c) {
      console.error('DISE.components.renderDocFooter: "' + companyKey + '" 계열사 정보가 company-info.js에 없습니다.');
      return;
    }
    if (!c.addressKr) {
      // 주소 등 연락처 정보가 아직 없는 계열사(R2V/BIC/AXIS-ONE 등) —
      // 잘못된 정보를 인쇄하지 않도록 조용히 비워두고 콘솔에만 알립니다.
      console.warn('DISE.components.renderDocFooter: "' + companyKey + '"의 주소·연락처 정보가 아직 company-info.js에 없습니다.');
      return;
    }

    target.innerHTML =
      '<div class="doc-footer-band">' +
        '<div class="l1">' + c.addressKr + '</div>' +
        '<div class="l2">Tel. ' + c.phoneIntl + ' (해외) / ' + c.phoneDomestic + ' (국내) ' +
          '&nbsp;·&nbsp; ' + c.email + ' &nbsp;·&nbsp; ' + c.website +
        '</div>' +
      '</div>';
  }
};
