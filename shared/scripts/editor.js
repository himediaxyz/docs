/* ============================================================
   editor.js
   contenteditable 입력 필드(.editable)용 공통 편집 기능 + 화면 UI
   여닫기 동작 전반을 담당합니다:
     1) 대괄호([ ]) 안내 문구 placeholder — 클릭하면 전체 선택되어
        바로 타이핑으로 덮어쓸 수 있음
     2) 서식 도구모음(#fmtToolbar) — 굵게/기울임/밑줄/서체/크기/
        글자색/정렬/목록 모양/들여쓰기-내어쓰기
     3) 도움말(?) 팝업 여닫기 (#helpBtn / #helpModal)
     4) 사이트 헤더의 "문서 설정" 메뉴 여닫기 + 초기화 (#siteMenuBtn 등)

   새 템플릿에서 그대로 재사용하려면: .editable 클래스가 붙은
   contenteditable 요소들과, 아래 id/data-cmd를 그대로 쓴 버튼·셀렉트를
   마크업에 넣으면 이 스크립트가 자동으로 연결합니다. 정확한 마크업
   예시는 templates/gongmun/index.html을 그대로 복사하는 게 가장
   빠릅니다.

   이 파일을 쓰는 곳: 사용자가 직접 입력하는 문서 템플릿
     <script src="../../shared/scripts/editor.js"></script>
   ============================================================ */

(function () {

  /* ---------- 1) [ ] placeholder 클릭 시 전체 선택 ---------- */
  function isPlaceholder(el) {
    var t = el.textContent.trim();
    return t.startsWith('[') && t.endsWith(']');
  }
  document.querySelectorAll('.editable').forEach(function (el) {
    el.addEventListener('focus', function () {
      if (isPlaceholder(el)) {
        var range = document.createRange();
        range.selectNodeContents(el);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
  });

  /* ---------- 2) 서식 도구모음 ---------- */
  try { document.execCommand('styleWithCSS', false, true); } catch (e) {}

  // 툴바의 <select>를 클릭하는 순간 브라우저가 텍스트 선택을 해제해버리므로,
  // selectionchange 이벤트로 "직전에 편집 영역 안에서 선택했던 범위"를
  // 계속 기억해뒀다가 버튼/셀렉트 조작 시 그 선택을 복원해서 사용합니다.
  var savedRange = null;
  function isInsideEditable(node) {
    var el = node && node.nodeType === 3 ? node.parentElement : node;
    return !!(el && el.closest && el.closest('.editable'));
  }
  document.addEventListener('selectionchange', function () {
    var sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    var range = sel.getRangeAt(0);
    if (isInsideEditable(range.commonAncestorContainer)) {
      savedRange = range.cloneRange();
    }
  });
  function restoreSelection() {
    if (!savedRange) return false;
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
    return true;
  }

  // execCommand('fontSize')는 옛날 1~7 단계 값만 지원해서 원하는 px 값을
  // 못 주기 때문에, 선택 영역을 <span style="...">으로 직접 감싸는 방식으로
  // 서체/글자 크기를 적용합니다.
  function wrapSelectionWithStyle(styleProp, value) {
    if (!restoreSelection()) return;
    var sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    var range = sel.getRangeAt(0);
    var span = document.createElement('span');
    span.style[styleProp] = value;
    try {
      range.surroundContents(span);
    } catch (e) {
      // 선택 영역이 여러 태그에 걸쳐 있으면 surroundContents가 실패하므로
      // extractContents로 내용만 꺼내 span에 담는 방식으로 대체합니다.
      var content = range.extractContents();
      span.appendChild(content);
      range.insertNode(span);
    }
    sel.removeAllRanges();
    var newRange = document.createRange();
    newRange.selectNodeContents(span);
    sel.addRange(newRange);
    savedRange = newRange.cloneRange();
  }

  document.querySelectorAll('.fmt-toolbar button[data-cmd]').forEach(function (btn) {
    // mousedown에서 preventDefault를 해줘야 버튼 클릭으로 텍스트 선택이
    // 풀리지 않습니다.
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    btn.addEventListener('click', function () {
      if (!restoreSelection()) return;
      document.execCommand(btn.getAttribute('data-cmd'), false, null);
    });
  });

  var fmtFont = document.getElementById('fmtFont');
  if (fmtFont) fmtFont.addEventListener('change', function () {
    wrapSelectionWithStyle('fontFamily', fmtFont.value);
  });

  var fmtSize = document.getElementById('fmtSize');
  if (fmtSize) fmtSize.addEventListener('change', function () {
    wrapSelectionWithStyle('fontSize', fmtSize.value + 'px');
  });

  /* ---------- 3) 팝업형 드롭다운 공통 처리 ----------
     버튼을 누르면 바로 옆에 작은 팝업이 열리고, 팝업 안의 항목을 고르면
     적용 후 자동으로 닫힙니다. 글자색 팝업과 점/번호 목록의 모양 팝업이
     이 방식을 함께 씁니다.
     버튼을 아이콘(<span class="btn-icon">)이 채우고 있어서, 사용자가
     버튼 "안의 아이콘"을 클릭하면 클릭 이벤트의 target은 버튼이 아니라
     그 아이콘 span이 됩니다 — 그래서 바깥 클릭 판정은 꼭 btn.contains()
     로 검사해야 합니다(단순히 e.target !== btn으로 비교하면 아이콘을
     클릭하는 순간 "바깥 클릭"으로 오인해서 열자마자 다시 닫혀버립니다). */
  function wireDropdown(btn, popover) {
    if (!btn || !popover) return;
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    btn.addEventListener('click', function () {
      popover.hidden = !popover.hidden;
    });
    document.addEventListener('click', function (e) {
      if (!popover.hidden && !popover.contains(e.target) && !btn.contains(e.target)) {
        popover.hidden = true;
      }
    });
  }

  /* ---------- 4) 글자 색상 ----------
     원색을 피한 모노톤 8색. 색상을 바꾸거나 추가/삭제하려면 이 배열만
     고치면 팝업 버튼이 자동으로 다시 그려집니다. 색약 사용자를 위해
     색상만으로 구분하지 않도록 각 버튼에 이름을 title(마우스 오버 시
     표시)로 붙입니다. */
  var COLOR_PALETTE = [
    { name: '잉크 블랙', hex: '#1a1a1a' },
    { name: '다이즈 네이비', hex: '#0b234f' },
    { name: '슬레이트 그레이', hex: '#4a5568' },
    { name: '웜 그레이', hex: '#6b6355' },
    { name: '딥 버건디', hex: '#6b2c3e' },
    { name: '포레스트 그린', hex: '#2f4a3e' },
    { name: '딥 틸', hex: '#1f3a3a' },
    { name: '브론즈', hex: '#5c4a2e' }
  ];
  var colorBtn = document.getElementById('colorBtn');
  var colorPopover = document.getElementById('colorPopover');
  if (colorBtn && colorPopover) {
    COLOR_PALETTE.forEach(function (c) {
      var swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.style.background = c.hex;
      swatch.title = c.name;
      swatch.setAttribute('aria-label', c.name);
      swatch.addEventListener('mousedown', function (e) { e.preventDefault(); });
      swatch.addEventListener('click', function () {
        wrapSelectionWithStyle('color', c.hex);
        colorPopover.hidden = true;
      });
      colorPopover.appendChild(swatch);
    });
    wireDropdown(colorBtn, colorPopover);
  }

  /* ---------- 5) 목록 모양 ----------
     이전에는 목록 버튼 옆에 모양을 고르는 <select>가 항상 붙어있었지만,
     지금은 버튼을 누르면 모양 팝업이 열리는 방식으로 바꿨습니다(글자색과
     동일한 UX). 아래 칸(둘째 줄)을 그림·표 같은 다른 컴포넌트를 위해
     비워두기 위함입니다.
     팝업의 모양 항목을 클릭하면 한 번에 두 가지가 일어납니다:
       (1) 선택 영역이 아직 이 종류의 목록이 아니면 execCommand로 목록을
           먼저 만들고(다른 종류의 목록이었다면 브라우저가 알아서
           변환합니다),
       (2) 그 목록에 고른 모양을 적용합니다. */
  function getListElement(node) {
    var el = node && node.nodeType === 3 ? node.parentElement : node;
    while (el && el.nodeType === 1 && el.tagName !== 'UL' && el.tagName !== 'OL') {
      if (el.classList && el.classList.contains('editable')) return null;
      el = el.parentElement;
    }
    return el;
  }
  function setListStyle(list, styleValue) {
    if (styleValue === 'circled-decimal') {
      // 원문자(①②③...)는 CSS 표준 키워드가 없어서 document.css에 정의된
      // 커스텀 @counter-style(.list-circled)을 대신 사용합니다.
      list.style.listStyleType = '';
      list.classList.add('list-circled');
    } else {
      list.classList.remove('list-circled');
      list.style.listStyleType = styleValue;
    }
  }
  function wireListPopover(btn, popover, insertCmd) {
    if (!btn || !popover) return;
    wireDropdown(btn, popover);
    popover.querySelectorAll('button[data-list-style]').forEach(function (opt) {
      opt.addEventListener('mousedown', function (e) { e.preventDefault(); });
      opt.addEventListener('click', function () {
        if (!restoreSelection()) { popover.hidden = true; return; }
        var sel = window.getSelection();
        if (!sel.rangeCount) { popover.hidden = true; return; }
        var wantUL = insertCmd === 'insertUnorderedList';
        var list = getListElement(sel.getRangeAt(0).commonAncestorContainer);
        if (!list || (list.tagName === 'UL') !== wantUL) {
          document.execCommand(insertCmd, false, null);
          sel = window.getSelection();
          list = sel.rangeCount ? getListElement(sel.getRangeAt(0).commonAncestorContainer) : null;
        }
        if (list) setListStyle(list, opt.getAttribute('data-list-style'));
        popover.hidden = true;
      });
    });
  }
  wireListPopover(
    document.getElementById('bulletListBtn'),
    document.getElementById('bulletStylePopover'),
    'insertUnorderedList'
  );
  wireListPopover(
    document.getElementById('numberListBtn'),
    document.getElementById('numberStylePopover'),
    'insertOrderedList'
  );

  /* ---------- 6) 들여쓰기 / 내어쓰기 ----------
     브라우저 기본 execCommand('indent')는 구현마다 동작이 달라 예측이
     어려워서, 선택 영역이 속한 블록 요소의 margin-left를 직접 조절하는
     방식으로 만듭니다. */
  var INDENT_STEP_PX = 24;
  function getBlockElement(node) {
    var el = node && node.nodeType === 3 ? node.parentElement : node;
    while (el && el.nodeType === 1 && !/^(P|LI|DIV|H[1-6]|BLOCKQUOTE)$/.test(el.tagName)) {
      if (el.classList && el.classList.contains('editable')) return el;
      el = el.parentElement;
    }
    return el;
  }
  function adjustIndent(stepPx) {
    if (!restoreSelection()) return;
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var block = getBlockElement(sel.getRangeAt(0).commonAncestorContainer);
    if (!block) return;
    var current = parseInt(block.style.marginLeft || '0', 10);
    block.style.marginLeft = Math.max(0, current + stepPx) + 'px';
  }
  var indentBtn = document.getElementById('indentBtn');
  if (indentBtn) {
    indentBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    indentBtn.addEventListener('click', function () { adjustIndent(INDENT_STEP_PX); });
  }
  var outdentBtn = document.getElementById('outdentBtn');
  if (outdentBtn) {
    outdentBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    outdentBtn.addEventListener('click', function () { adjustIndent(-INDENT_STEP_PX); });
  }

  /* ---------- 7) 도움말(?) 팝업 ----------
     내용(문단)은 각 템플릿의 #helpModal 안에 그대로 두고, 여기서는
     여닫기 동작만 처리합니다. */
  var helpBtn = document.getElementById('helpBtn');
  var helpModal = document.getElementById('helpModal');
  if (helpBtn && helpModal) {
    helpBtn.addEventListener('click', function () { helpModal.hidden = false; });
    var helpCloseBtn = helpModal.querySelector('.help-modal-close');
    if (helpCloseBtn) helpCloseBtn.addEventListener('click', function () { helpModal.hidden = true; });
    // 배경(카드 바깥) 클릭 시 닫기
    helpModal.addEventListener('click', function (e) {
      if (e.target === helpModal) helpModal.hidden = true;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !helpModal.hidden) helpModal.hidden = true;
    });
  }

  /* ---------- 8) 사이트 헤더 "문서 설정" 메뉴 ----------
     새 메뉴 항목을 components.js의 renderSiteHeader()에 추가하면
     여기에도 그 항목의 동작을 추가해야 합니다. */
  var siteMenuBtn = document.getElementById('siteMenuBtn');
  var siteMenuList = document.getElementById('siteMenuList');
  if (siteMenuBtn && siteMenuList) {
    siteMenuBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      siteMenuList.hidden = !siteMenuList.hidden;
    });
    document.addEventListener('click', function (e) {
      if (!siteMenuList.hidden && e.target !== siteMenuBtn && !siteMenuList.contains(e.target)) {
        siteMenuList.hidden = true;
      }
    });
  }
  var resetDocBtn = document.getElementById('resetDocBtn');
  if (resetDocBtn) {
    resetDocBtn.addEventListener('click', function () {
      // 이 도구는 서버에 아무것도 저장하지 않으므로, 페이지를 새로
      // 불러오는 것 자체가 "초기화"입니다.
      if (window.confirm('작성 중인 내용이 모두 사라지고 빈 템플릿으로 초기화됩니다. 계속할까요?')) {
        window.location.reload();
      }
    });
  }

})();
