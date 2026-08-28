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
       <div id="editorUI" class="no-print"></div>
       ...
       <div id="siteFooter" class="no-print"></div>

     "editorUI" 자리 하나에 문서 양식/발신인 드롭다운·도움말·인쇄
     버튼·서식 도구모음·표/그림 플로팅 툴바까지 전부 renderEditorUI()가
     그려 넣습니다(아래 renderEditorUI 함수 주석 참고) — 예전처럼
     이 마크업 전체를 템플릿 파일마다 복사-붙여넣기 할 필요가 없습니다.

     문서(종이) 자리 — 1페이지(.page)의 .page-header/.page-footer 자리에
     한 번만 채워 넣으면, shared/scripts/pagination.js가 그 마크업을
     그대로 복제해 2페이지 이후의 헤더/푸터에도 반복해서 씁니다(자세한
     구조는 print.css, document.css .page 규칙 상단 주석 참고):
       <div class="page-header" id="docHeader"></div>
       ...(본문)...
       <div class="page-footer" id="docFooter"></div>

     스크립트:
       <script src="../../shared/scripts/company-info.js"></script>
       <script src="../../shared/scripts/sender-info.js"></script>
       <script src="../../shared/scripts/template-registry.js"></script>
       <script src="../../shared/scripts/components.js"></script>
       <script>
         window.DISE_CURRENT_TEMPLATE = 'gongmun'; // template-registry.js의 key
         window.DISE_CURRENT_COMPANY = 'disehimedia';

         DISE.components.renderSiteHeader({ portalHref: '../../index.html' });
         DISE.components.renderEditorUI({ templateKey: DISE_CURRENT_TEMPLATE, company: DISE_CURRENT_COMPANY });
         DISE.components.renderViewModeToggle(); // renderEditorUI보다 반드시 나중에
         DISE.components.renderSiteFooter();
         DISE.components.renderDocHeader({ company: 'disehimedia', docTypeTag: '공식 공문' });
         DISE.components.renderDocFooter({ company: 'disehimedia' });
       </script>

   ※ 반드시 company-info.js → sender-info.js → template-registry.js →
      components.js 순서로 불러오세요. 이 파일의 함수들은 pagination.js가
      높이를 재는 'load' 이벤트보다 먼저 실행되어야 하므로, <body> 안쪽
      스크립트 순서만 지키면 자동으로 만족됩니다(스크립트는 위에서
      아래로 순서대로 실행됨).
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

  /**
   * 화면 전용 편집 UI 전체 — 문서 양식/발신인 드롭다운 + 도움말(?) 버튼·
   * 팝업 + 인쇄 버튼, 그 아래 모바일/인쇄 보기 토글 자리, 서식 도구모음
   * (굵게/기울임/서체/크기/색상/정렬/목록/들여쓰기/그림·표 삽입), 표
   * 설정 플로팅 아이콘·팝업, 이미지 선택 플로팅 툴바까지 한 번에
   * #editorUI 자리에 그려 넣습니다.
   *
   * ★ 왜 이렇게 하나로 모았나: 예전에는 이 마크업 전체를 템플릿마다
   * 그대로 복사-붙여넣기 했는데, 그러다 보니 템플릿이 하나 늘 때마다
   * "문서 양식" 드롭다운의 초기 라벨 문구를 그 템플릿에 맞게 손으로
   * 다시 타이핑해야 했고(예: templates/gongmun-premium/index.html의
   * #docTypeLabel), 실수로 안 바꾸거나 나중에 template-registry.js의
   * 표시 문구만 바꾸고 템플릿 파일들은 안 고치면 드롭다운 버튼에 보이는
   * 글자와 실제 목록이 서로 어긋나는 사고가 났습니다. 지금은 그 라벨도
   * DISE.templates/DISE.senders를 그대로 읽어서 만들기 때문에, 새
   * 템플릿을 추가할 때 손으로 옮겨 적어야 하는 마크업이 전혀 없습니다
   * (템플릿 쪽에는 <div id="editorUI" class="no-print"></div> 자리
   * 하나와 이 함수 호출 한 줄만 있으면 됩니다).
   *
   * 반드시 renderViewModeToggle()보다 먼저 호출하세요 — 이 함수가
   * #viewModeToggle 자리 자체를 새로 만들어 넣기 때문에, 그 자리가
   * 아직 없는 상태에서 renderViewModeToggle()을 먼저 부르면 아무 일도
   * 일어나지 않습니다.
   *
   * @param {Object} [opts]
   * @param {string} [opts.templateKey] - window.DISE_CURRENT_TEMPLATE와
   *   같은 값을 넘겨주세요(문서 양식 드롭다운의 처음 라벨 문구를
   *   DISE.templates에서 찾아 채우는 데 씁니다).
   * @param {string} [opts.company] - window.DISE_CURRENT_COMPANY와 같은
   *   값(발신인 드롭다운의 처음 라벨을 DISE.senders에서 찾는 데 씁니다).
   */
  renderEditorUI: function (opts) {
    opts = opts || {};
    var target = document.getElementById('editorUI');
    if (!target) return;

    var templateKey = opts.templateKey || '';
    var companyKey = opts.company || 'disehimedia';

    var templateList = (window.DISE && DISE.templates) || [];
    var currentTemplateName = '';
    for (var i = 0; i < templateList.length; i++) {
      if (templateList[i].key === templateKey) { currentTemplateName = templateList[i].nameKr; break; }
    }
    if (!currentTemplateName && templateList.length) currentTemplateName = templateList[0].nameKr;

    var senderList = (window.DISE && DISE.senders && DISE.senders[companyKey]) || [];
    var defaultSenderName = senderList.length ? senderList[0].nameKr : '(미지정)';

    target.innerHTML =
      '<div class="toolbar no-print">' +
        '<div class="toolbar-card">' +
          '<div class="toolbar-card-title">' +
            '<span class="dropdown-anchor doc-type-anchor">' +
              '<button type="button" class="doc-type-btn" id="docTypeBtn" aria-haspopup="true" aria-expanded="false">' +
                '<span id="docTypeLabel">' + currentTemplateName + '</span>' +
                '<span class="dd-caret" aria-hidden="true">&#9662;</span>' +
              '</button>' +
              '<div class="doc-type-popover" id="docTypePopover" hidden></div>' +
            '</span>' +
            '<span class="dropdown-anchor sender-anchor">' +
              '<button type="button" class="sender-btn" id="senderBtn" aria-haspopup="true" aria-expanded="false">' +
                '<span id="senderLabel">발신: ' + defaultSenderName + '</span>' +
                '<span class="dd-caret" aria-hidden="true">&#9662;</span>' +
              '</button>' +
              '<div class="sender-popover" id="senderPopover" hidden></div>' +
            '</span>' +
            '<button type="button" class="help-btn" id="helpBtn" title="사용법 안내" aria-label="사용법 안내">?</button>' +
          '</div>' +
          '<button class="print-btn" onclick="window.print()">인쇄 / PDF로 저장</button>' +
        '</div>' +

        '<div class="view-mode-toggle no-print" id="viewModeToggle"></div>' +

        '<div class="help-modal no-print" id="helpModal" hidden>' +
          '<div class="help-modal-card">' +
            '<button type="button" class="help-modal-close" id="helpModalClose" aria-label="닫기">&times;</button>' +
            '<h2>사용법 안내</h2>' +
            '<p>점선 테두리가 있는 <b>문서번호 · 제목 · 수신처 · 본문</b> 영역은 브라우저에서 바로 클릭해서 입력할 수 있습니다. 대괄호([ ])로 된 안내 문구는 클릭하면 자동으로 전체 선택되어 바로 타이핑하면 덮어써집니다. 시행일자는 오늘 날짜로 자동 채워집니다.</p>' +
            '<p>본문이 길어지면 실제 A4 낱장 모양의 페이지가 화면에도 그대로 쌓여서 늘어나며, 인쇄할 때도 같은 페이지 경계를 그대로 씁니다(워드처럼 헤더·본문·푸터가 항상 같은 자리에 고정). 아래 서식 도구모음으로 굵게·기울임·밑줄, 서체·글자 크기, 글자색, 정렬, 목록, 들여쓰기, 그림·표 삽입까지 바꿀 수 있습니다(먼저 글자를 드래그로 선택한 뒤 버튼을 눌러주세요). 표 안에 커서를 두면 그 표 오른쪽 위에 작은 설정 아이콘이 뜹니다.</p>' +
            '<p>휴대폰 등 좁은 화면에서는 위에 <b>모바일 보기 / 인쇄 레이아웃 보기</b> 선택 버튼이 나타납니다. 모바일 보기는 페이지 구분 없이 메모장처럼 이어서 편하게 입력하는 모드이고, 인쇄 레이아웃 보기는 실제 A4 페이지 그대로를 화면에 맞춰 축소해 보여주는 미리보기입니다. 어느 쪽을 보고 있든 인쇄·PDF 저장 결과물은 항상 인쇄 레이아웃과 동일하게 나옵니다.</p>' +
            '<div class="legend">' +
              '<span><i class="swatch kr"></i>한글 = Asta Sans</span>' +
              '<span><i class="swatch en"></i>영문/숫자 = Open Sans</span>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="editor-toolbar">' +
          '<div class="fmt-toolbar" id="fmtToolbar">' +
            '<button type="button" data-cmd="bold" title="굵게" aria-label="굵게"><span class="btn-icon icon-bold"></span></button>' +
            '<button type="button" data-cmd="italic" title="기울임" aria-label="기울임"><span class="btn-icon icon-italic"></span></button>' +
            '<button type="button" data-cmd="underline" title="밑줄" aria-label="밑줄"><span class="btn-icon icon-underline"></span></button>' +
            '<span class="fmt-sep"></span>' +
            '<select id="fmtFont" title="서체">' +
              '<option value="\'Asta Sans\', \'Open Sans\', sans-serif">Asta Sans (한/영)</option>' +
              '<option value="\'Open Sans\', \'Asta Sans\', sans-serif">Open Sans (영)</option>' +
            '</select>' +
            '<select id="fmtSize" title="글자 크기">' +
              '<option value="11">11px</option>' +
              '<option value="12">12px</option>' +
              '<option value="13">13px</option>' +
              '<option value="14" selected>14px</option>' +
              '<option value="15">15px</option>' +
              '<option value="16">16px</option>' +
              '<option value="18">18px</option>' +
              '<option value="20">20px</option>' +
              '<option value="24">24px</option>' +
              '<option value="28">28px</option>' +
            '</select>' +
            '<span class="fmt-sep"></span>' +
            '<span class="dropdown-anchor">' +
              '<button type="button" class="color-btn" id="colorBtn" title="글자색" aria-label="글자색">' +
                '<span class="swatch-current"></span>' +
              '</button>' +
              '<div class="color-popover" id="colorPopover" hidden></div>' +
            '</span>' +
            '<span class="fmt-sep"></span>' +
            '<button type="button" data-cmd="justifyLeft" title="왼쪽 정렬" aria-label="왼쪽 정렬"><span class="btn-icon icon-align-left"></span></button>' +
            '<button type="button" data-cmd="justifyCenter" title="가운데 정렬" aria-label="가운데 정렬"><span class="btn-icon icon-align-center"></span></button>' +
            '<button type="button" data-cmd="justifyRight" title="오른쪽 정렬" aria-label="오른쪽 정렬"><span class="btn-icon icon-align-right"></span></button>' +
            '<button type="button" data-cmd="justifyFull" title="양쪽 정렬" aria-label="양쪽 정렬"><span class="btn-icon icon-align-justify"></span></button>' +
            '<span class="fmt-sep"></span>' +
            '<span class="dropdown-anchor">' +
              '<button type="button" id="bulletListBtn" title="점 목록 — 눌러서 모양 선택" aria-label="점 목록"><span class="btn-icon icon-list-bullet"></span></button>' +
              '<div class="list-popover" id="bulletStylePopover" hidden>' +
                '<button type="button" data-list-style="disc">● 채운 원</button>' +
                '<button type="button" data-list-style="circle">○ 빈 원</button>' +
                '<button type="button" data-list-style="square">■ 사각형</button>' +
              '</div>' +
            '</span>' +
            '<span class="dropdown-anchor">' +
              '<button type="button" id="numberListBtn" title="번호 목록 — 눌러서 모양 선택" aria-label="번호 목록"><span class="btn-icon icon-list-numbered"></span></button>' +
              '<div class="list-popover" id="numberStylePopover" hidden>' +
                '<button type="button" data-list-style="decimal">1, 2, 3</button>' +
                '<button type="button" data-list-style="circled-decimal">①, ②, ③</button>' +
                '<button type="button" data-list-style="lower-alpha">a, b, c</button>' +
                '<button type="button" data-list-style="upper-roman">I, II, III</button>' +
              '</div>' +
            '</span>' +
            '<span class="fmt-sep"></span>' +
            '<button type="button" id="outdentBtn" title="내어쓰기" aria-label="내어쓰기"><span class="btn-icon icon-outdent"></span></button>' +
            '<button type="button" id="indentBtn" title="들여쓰기" aria-label="들여쓰기"><span class="btn-icon icon-indent"></span></button>' +
            '<span class="fmt-sep"></span>' +
            '<button type="button" id="insertImageBtn" title="그림 삽입" aria-label="그림 삽입"><span class="btn-icon icon-image"></span></button>' +
            '<input type="file" id="imageFileInput" accept="image/*" hidden>' +
            '<span class="dropdown-anchor">' +
              '<button type="button" id="insertTableBtn" title="표 삽입" aria-label="표 삽입"><span class="btn-icon icon-table"></span></button>' +
              '<div class="grid-picker" id="tableGridPicker" hidden>' +
                '<p class="grid-picker-label" id="gridPickerLabel">표 크기 선택</p>' +
                '<div class="grid-picker-grid" id="gridPickerGrid"></div>' +
              '</div>' +
            '</span>' +
            '<span class="fmt-hint">서식은 글자를 먼저 드래그로 선택, 그림·표는 넣고 싶은 위치에 커서를 두고 버튼을 눌러주세요</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="table-toolbar no-print" id="tableToolbar" hidden>' +
        '<button type="button" id="tableSettingsBtn" title="표 설정" aria-label="표 설정"><span class="btn-icon icon-table-settings"></span></button>' +
      '</div>' +
      '<div class="table-settings-popover no-print" id="tableSettingsPopover" hidden>' +
        '<div class="ts-group">' +
          '<p class="ts-group-label">테두리 두께</p>' +
          '<div class="ts-row" data-ts-prop="border-width">' +
            '<button type="button" data-value="1px">얇게</button>' +
            '<button type="button" data-value="1.5px">보통</button>' +
            '<button type="button" data-value="2.5px">굵게</button>' +
          '</div>' +
        '</div>' +
        '<div class="ts-group">' +
          '<p class="ts-group-label">테두리 종류</p>' +
          '<div class="ts-row" data-ts-prop="border-style">' +
            '<button type="button" data-value="solid">실선</button>' +
            '<button type="button" data-value="dashed">점선</button>' +
            '<button type="button" data-value="double">이중선</button>' +
          '</div>' +
        '</div>' +
        '<div class="ts-group">' +
          '<p class="ts-group-label">셀 여백</p>' +
          '<div class="ts-row" data-ts-prop="pad">' +
            '<button type="button" data-value="4px">좁게</button>' +
            '<button type="button" data-value="8px">보통</button>' +
            '<button type="button" data-value="14px">넓게</button>' +
          '</div>' +
        '</div>' +
        '<div class="ts-group">' +
          '<p class="ts-group-label">행 / 열</p>' +
          '<div class="ts-row">' +
            '<button type="button" id="tsAddRow">행 추가</button>' +
            '<button type="button" id="tsDelRow" class="danger">행 삭제</button>' +
            '<button type="button" id="tsAddCol">열 추가</button>' +
            '<button type="button" id="tsDelCol" class="danger">열 삭제</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="image-toolbar no-print" id="imageToolbar" hidden>' +
        '<button type="button" data-img-align="left" title="왼쪽 정렬" aria-label="왼쪽 정렬"><span class="btn-icon icon-align-left"></span></button>' +
        '<button type="button" data-img-align="center" title="가운데 정렬" aria-label="가운데 정렬"><span class="btn-icon icon-align-center"></span></button>' +
        '<button type="button" data-img-align="right" title="오른쪽 정렬" aria-label="오른쪽 정렬"><span class="btn-icon icon-align-right"></span></button>' +
        '<span class="img-sep"></span>' +
        '<button type="button" data-img-w="25%">25%</button>' +
        '<button type="button" data-img-w="50%">50%</button>' +
        '<button type="button" data-img-w="75%">75%</button>' +
        '<button type="button" data-img-w="100%">100%</button>' +
        '<span class="img-sep"></span>' +
        '<button type="button" class="img-delete-btn" id="imgDeleteBtn" title="삭제" aria-label="삭제"><span class="btn-icon icon-delete"></span></button>' +
      '</div>';
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
    //
    // ★ 되돌림 기록(2026-08-28): 원래 로고는 <img>가 아니라 CSS mask(부모
    // .doc-logo에 -webkit-mask-image/mask-image + background-color)로
    // 그렸었는데, 실제 아이폰(iOS는 Safari·Chrome 모두 같은 WebKit 엔진)
    // 에서 인쇄해보니 마스크가 적용되지 않고 background-color 사각형이
    // 그대로 다 칠해진 채로 나와("로고가 까만 박스 안에 갇힌" 것처럼
    // 보임) 인쇄가 깨졌습니다. 화면(데스크톱 포함)에서는 멀쩡해서
    // 자동/헤드리스 테스트로는 못 잡아낸 문제입니다 — 이 프로젝트가 이미
    // 여러 번 겪은 "화면·헤드리스와 실제 모바일 인쇄 렌더링 경로가
    // 다르다"는 것과 같은 종류의 버그입니다. 그래서 지금은 mask를 완전히
    // 버리고 평범한 <img> + CSS filter로 바꿨습니다(색 규칙은
    // shared/styles/document.css의 .doc-logo img 참고) — <img>와
    // filter는 인쇄 렌더링에서 훨씬 안정적입니다.
    var logoHeightPx = 56;
    var logoWidthPx = Math.round(logoHeightPx * (c.logoRatio || 1));
    var logoUrl = DISE_SHARED_ROOT + 'assets/logos/' + c.logoMark;

    target.innerHTML =
      '<div class="doc-header-band">' +
        '<div class="doc-logo" style="width:' + logoWidthPx + 'px;height:' + logoHeightPx + 'px;">' +
          '<img src="' + logoUrl + '" alt="' + c.nameKr + ' 로고">' +
        '</div>' +
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
