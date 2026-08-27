/* ============================================================
   components.js
   여러 문서 템플릿이 공통으로 쓰는 "조각" — 헤더 밴드(로고+회사명)와
   푸터 밴드(주소·연락처)를 화면에 그려 넣습니다.

   왜 HTML을 복사-붙여넣기 하지 않고 JS로 그리나:
   새 문서 템플릿(보고서, 명함 등)을 추가할 때 이 두 조각을 매번
   똑같이 타이핑할 필요 없이, 아래처럼 자리 표시자만 두고 함수 두 줄만
   호출하면 됩니다. 로고나 주소가 바뀌면 company-info.js만 고치면
   모든 템플릿에 한번에 반영됩니다.

   사용법 (각 템플릿의 body 안):
     <thead><tr><td class="cell-head" id="siteHeader"></td></tr></thead>
     ...
     <tfoot><tr><td class="cell-foot" id="siteFooter"></td></tr></tfoot>
     ...
     <script src="../../shared/scripts/company-info.js"></script>
     <script src="../../shared/scripts/components.js"></script>
     <script>
       DISE.components.renderHeader({ docTypeTag: '공식 공문' }); // 문서 종류 표시
       DISE.components.renderFooter();
     </script>

   ※ 반드시 company-info.js를 먼저 불러온 뒤에 이 파일을 불러오고,
      renderHeader/renderFooter 호출은 pagination.js가 높이를 재는
      'load' 이벤트보다 먼저 실행되도록 <body> 안쪽에 두세요
      (스크립트는 위에서 아래로 순서대로 실행되므로, 이 파일들을 다른
      스크립트보다 먼저 불러오기만 하면 자동으로 만족됩니다).
   ============================================================ */

window.DISE = window.DISE || {};

DISE.components = {

  /**
   * 상단 헤더 밴드(로고 + 회사명 + 문서 종류 태그)를 #siteHeader 자리에 그립니다.
   * @param {Object} [opts]
   * @param {string} [opts.docTypeTag] - "공식 공문"처럼 밴드 하단에 표시할 문서 종류 문구.
   */
  renderHeader: function (opts) {
    opts = opts || {};
    var docTypeTag = opts.docTypeTag || '';
    var target = document.getElementById('siteHeader');
    if (!target) return;
    var c = DISE.company;

    target.innerHTML =
      '<div class="band">' +
        // TODO(로고): 실제 로고 파일을 받으면 아래 텍스트 칩 대신
        // <img src="../../shared/assets/logo.svg" alt="' + c.nameKr + ' 로고"> 로 교체하세요.
        '<div class="logo-chip"><span class="mark">DISE<br>HIMEDIA</span></div>' +
        '<div class="band-text">' +
          '<div class="brand-kr">' + c.nameKr + '</div>' +
          '<div class="brand-en">' + c.nameEn + '</div>' +
          (docTypeTag ? '<div class="brand-tag">' + docTypeTag + '</div>' : '') +
        '</div>' +
      '</div>';
  },

  /**
   * 하단 푸터 밴드(주소·전화·이메일·웹사이트)를 #siteFooter 자리에 그립니다.
   */
  renderFooter: function () {
    var target = document.getElementById('siteFooter');
    if (!target) return;
    var c = DISE.company;

    target.innerHTML =
      '<div class="footer-band">' +
        '<div class="l1">' + c.addressKr + '</div>' +
        '<div class="l2">Tel. ' + c.phoneIntl + ' (해외) / ' + c.phoneDomestic + ' (국내) ' +
          '&nbsp;·&nbsp; ' + c.email + ' &nbsp;·&nbsp; ' + c.website +
        '</div>' +
      '</div>';
  }
};
