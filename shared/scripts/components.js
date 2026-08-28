/* ============================================================
   components.js
   화면/문서를 구성하는 4가지 공통 조각을 그려 넣습니다. 용어 정의는
   company-info.js 상단 주석과 shared/README.md를 참고하세요 — 요약:

     renderSiteHeader / renderSiteFooter / renderViewModeToggle
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
       <div id="viewModeToggle" class="no-print view-mode-toggle"></div>
       ...
       <div id="siteFooter" class="no-print"></div>

     문서(종이) 자리 — 1페이지(.page)의 .page-header/.page-footer 자리에
     한 번만 채워 넣으면, shared/scripts/pagination.js가 그 마크업을
     그대로 복제해 2페이지 이후의 헤더/푸터에도 반복해서 씁니다(자세한
     구조는 print.css, document.css .page 규칙 상단 주석 참고):
       <div class="page-header" id="docHeader"></div>
       ...(본문)...
       <div class="page-footer" id="docFooter"></div>

     스크립트:
       <script src="../../shared/scripts/company-info.js"></script>
       <script src="../../shared/scripts/components.js"></script>
       <script>
         DISE.components.renderSiteHeader({ portalHref: '../../index.html' });
         DISE.components.renderViewModeToggle();
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
   * 화면 상단의 "사이트 헤더" — 포털로 돌아가는 링크 + "문서 설정" 메뉴.
   * 메뉴 자체는 여기서 마크업만 그리고, 여닫기·클릭 동작은
   * shared/scripts/editor.js가 처리합니다(버튼 id: siteMenuBtn/siteMenuList,
   * 항목 id: resetDocBtn 등 — 새 항목을 추가하면 editor.js에도 wiring을
   * 추가해야 합니다).
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
      '<div class="site-header-bar">' +
        '<a class="site-header-link" href="' + portalHref + '">' +
          '<span class="site-header-arrow">&larr;</span>' +
          '<span class="site-header-name">' + DISE.site.nameKr + '</span>' +
        '</a>' +
        '<div class="site-menu">' +
          '<button type="button" class="site-menu-btn" id="siteMenuBtn">문서 설정 <span aria-hidden="true">&#9662;</span></button>' +
          '<div class="site-menu-list" id="siteMenuList" hidden>' +
            '<button type="button" id="resetDocBtn">새 문서로 초기화</button>' +
          '</div>' +
        '</div>' +
      '</div>';
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

  /**
   * 좁은 화면(휴대폰)에서만 나타나는 "모바일 보기 / 인쇄 레이아웃 보기"
   * 토글. 실제 모드 전환·저장·인쇄 시 강제 전환 로직은 모두
   * shared/scripts/pagination.js가 담당하고(버튼 id를 document 레벨
   * 클릭 위임으로 찾아서 연결), 여기서는 마크업만 그립니다 — 데스크톱
   * 에서는 shared/styles/toolbar.css의 media query로 화면에서
   * 숨겨집니다.
   */
  renderViewModeToggle: function () {
    var target = document.getElementById('viewModeToggle');
    if (!target) return;
    target.innerHTML =
      '<button type="button" id="viewModeMobileBtn">모바일 보기</button>' +
      '<button type="button" id="viewModePrintBtn">인쇄 레이아웃 보기</button>';
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
