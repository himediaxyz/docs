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
     5) 컴포넌트 도구모음(#componentToolbar) — 그림 삽입 + 크기 조절,
        표 삽입(격자 피커) + 표 설정(테두리/여백/행·열 추가삭제)
     6) 실행취소/다시 실행(Ctrl+Z / Ctrl+Shift+Z) — 색상·글자크기·
        들여쓰기·목록 모양·그림·표처럼 브라우저 기본 되돌리기가 못 잡는
        변경까지 포함해 문서 전체를 하나의 흐름으로 되돌립니다
     7) 상단 도구모음의 "문서 양식" / "발신인" 드롭다운 — 문서 양식은
        template-registry.js 목록을 읽어 다른 템플릿으로 이동(내용이
        있으면 확인창), 발신인은 sender-info.js 목록을 읽어 서명란만
        교체(확인창 없음)

   새 템플릿에서 그대로 재사용하려면: .editable 클래스가 붙은
   contenteditable 요소들과, 아래 id/data-cmd를 그대로 쓴 버튼·셀렉트를
   마크업에 넣으면 이 스크립트가 자동으로 연결합니다. 정확한 마크업
   예시는 templates/gongmun/index.html을 그대로 복사하는 게 가장
   빠릅니다.

   이 파일을 쓰는 곳: 사용자가 직접 입력하는 문서 템플릿
     <script src="../../shared/scripts/editor.js"></script>
   ============================================================ */

(function () {

  // 그림·표를 넣거나 지우거나 크기를 바꾸면 문서 높이가 바뀌는데, 이런
  // 변화는 (타이핑과 달리) 브라우저의 'input' 이벤트를 발생시키지
  // 않으므로 예상 페이지 구분선이 갱신되지 않습니다. pagination.js가
  // 자신을 window.DISE.pagination.refresh로 공개해두면, 여기서 그때그때
  // 직접 불러서 다시 계산하게 합니다(pagination.js가 이 스크립트보다
  // 나중에 로드되어도, 실제 호출은 사용자가 버튼을 누르는 훨씬 나중
  // 시점이라 문제없습니다).
  function refreshPagination() {
    if (window.DISE && window.DISE.pagination) window.DISE.pagination.refresh();
  }

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

  // 툴바의 버튼/셀렉트를 클릭하는 순간 브라우저가 선택(또는 커서 위치)을
  // 지워버리므로, selectionchange 이벤트로 "직전에 편집 영역 안에 있던
  // 선택 또는 커서 위치"를 계속 기억해뒀다가 버튼 조작 시 복원해서
  // 씁니다. 드래그로 글자를 선택한 경우뿐 아니라, 그냥 클릭만 해서
  // 커서만 놓은 경우(collapsed selection)도 함께 저장합니다 — 표 안을
  // 클릭한 뒤 "표 설정"을 누르거나, 문단 중간을 클릭한 뒤 정렬 버튼을
  // 누르는 것처럼 "드래그 선택 없이 위치만" 필요한 기능들이 여럿이라서
  // 입니다(선택이 필요한 기능들은 각자 restoreSelection() 이후에
  // sel.isCollapsed를 스스로 확인합니다).
  var savedRange = null;
  function isInsideEditable(node) {
    var el = node && node.nodeType === 3 ? node.parentElement : node;
    return !!(el && el.closest && el.closest('.editable'));
  }
  document.addEventListener('selectionchange', function () {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
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
    recordBeforeChange();
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
      recordBeforeChange();
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
     그룹사 4곳(다이즈하이미디어/BIC/R2V/AXIS ONE)의 공식 브랜드 컬러
     차트(2026-08-28 확정본) 기준 12색. 색상을 바꾸거나 추가/삭제하려면
     이 배열만 고치면 팝업 버튼이 자동으로 다시 그려집니다. 색약
     사용자를 위해 색상만으로 구분하지 않도록 각 버튼에 이름을
     title(마우스 오버 시 표시)로 붙입니다.

     주의: BIC그린(라이트)·R2V옐로우·AXIS라이트·다이즈라이트·R2V오렌지는
     흰 종이 위 본문 글자색으로 쓰면 명도 대비가 낮아 읽기 어려울 수
     있습니다(WCAG 기준 대비 미달 또는 근접). 제목·포인트 강조처럼
     짧고 굵은 글자에만 쓰는 것을 권장합니다. */
  var COLOR_PALETTE = [
    { name: '다이즈블랙', hex: '#1D1D1D' },
    { name: '다이즈블루', hex: '#212B43' },
    { name: '다이즈라이트', hex: '#6B77A4' },
    { name: 'BIC그린 다크', hex: '#1B3728' },
    { name: 'BIC그린 미드', hex: '#428363' },
    { name: 'BIC그린 라이트', hex: '#74BF96' },
    { name: 'R2V레드', hex: '#A82B24' },
    { name: 'R2V오렌지', hex: '#DA4F1E' },
    { name: 'R2V옐로우', hex: '#EBC11F' },
    { name: 'AXIS다크', hex: '#180E1C' },
    { name: 'AXIS퍼플', hex: '#573369' },
    { name: 'AXIS라이트', hex: '#9F79B4' }
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
        recordBeforeChange();
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
    recordBeforeChange();
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

  /* ---------- 9) 그림 삽입 ----------
     서버가 없는 정적 사이트라, 파일을 업로드하는 대신 선택한 이미지를
     base64로 인코딩해 문서 안에 통째로 내장합니다(<img src="data:...">).
     삽입된 이미지를 클릭하면 그 이미지 위에 크기 프리셋(25/50/75/100%)
     + 삭제 버튼이 있는 작은 툴바가 뜹니다. */
  var insertImageBtn = document.getElementById('insertImageBtn');
  var imageFileInput = document.getElementById('imageFileInput');
  var imageToolbar = document.getElementById('imageToolbar');
  var selectedImg = null;

  // 그림/표를 넣을 때 커서 위치가 하나도 저장되어 있지 않으면(사용자가
  // 아직 본문을 한 번도 클릭한 적이 없는 등) 문서 맨 끝, 즉 마지막
  // 페이지의 흐름 영역(.flow-items) 끝에 붙입니다. 페이지가 여러 장일
  // 수 있으므로 항상 1페이지의 #docBody가 아니라 "지금 존재하는
  // .flow-items 중 마지막 것"을 찾아야 합니다.
  function getLastFlowContainer() {
    var flows = document.querySelectorAll('.flow-items');
    return flows.length ? flows[flows.length - 1] : document.getElementById('docBody');
  }

  function insertNodeAtSavedOrEnd(node, fallbackContainer) {
    // restoreSelection()으로 되살아나는 위치가 없으면(사용자가 아직
    // 편집 영역을 한 번도 클릭한 적이 없는 등) 지정한 컨테이너의 맨
    // 끝에 붙입니다.
    if (!restoreSelection()) {
      if (!fallbackContainer) return false;
      var range = document.createRange();
      range.selectNodeContents(fallbackContainer);
      range.collapse(false);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    return true;
  }

  // 그림/표는 커서가 있던 "글자 한가운데"가 아니라 그 글자가 속한
  // 문단(블록) 바로 뒤에, 별도의 한 줄로 끼워 넣습니다. execCommand로
  // 커서 위치에 그대로 넣으면 문단 중간에 이미지가 끼어서 글이 이미지를
  // 피해 흐르는 것처럼 보이는 문제가 있어서, 항상 "그 문단이 끝난 다음
  // 줄"에 통째로 들어가도록 만들었습니다. 리스트(li) 안이었다면 그
  // 리스트 전체 다음에 넣습니다(li 밖에 표를 끼워 넣으면 목록 구조가
  // 깨지기 때문). 삽입 후에는 바로 뒤에 빈 문단을 하나 만들어 커서를
  // 옮겨서, 계속 이어서 타이핑할 자리를 마련합니다.
  function insertBlockAsSibling(newEl, fallbackContainer) {
    if (!insertNodeAtSavedOrEnd(null, fallbackContainer)) return false;
    var sel = window.getSelection();
    var anchor = null;
    var appendInto = null;
    if (sel.rangeCount) {
      var block = getBlockElement(sel.getRangeAt(0).commonAncestorContainer);
      if (block && block.classList && block.classList.contains('editable')) {
        // getBlockElement는 P/LI/DIV/H1-6/BLOCKQUOTE를 찾아 올라가는데,
        // .flow-items 컨테이너 자신도 DIV라서 "그 안에 특정 문단이 아니라
        // 편집 영역 자체"에 커서가 있는 경우(예: 문서를 열자마자 문단을
        // 한 번도 클릭하지 않고 바로 삽입 버튼을 누른 경우) 컨테이너
        // 자기 자신이 반환됩니다. 이때 "형제로 끼워넣기"를 하면
        // 컨테이너 바깥(.page-body)으로 빠져나가 페이지 재배치 대상에서
        // 아예 빠지게 되므로, 이 경우만 예외로 컨테이너 맨 끝에 바로
        // 붙입니다.
        appendInto = block;
      } else if (block && block.tagName === 'LI') {
        anchor = (block.closest && block.closest('ol,ul')) || block;
      } else {
        anchor = block;
      }
    }
    if (appendInto) {
      appendInto.appendChild(newEl);
    } else if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(newEl, anchor.nextSibling);
    } else if (fallbackContainer) {
      fallbackContainer.appendChild(newEl);
    } else {
      return false;
    }
    var p = document.createElement('p');
    p.innerHTML = '<br>';
    newEl.parentNode.insertBefore(p, newEl.nextSibling);
    var newRange = document.createRange();
    newRange.setStart(p, 0);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    savedRange = newRange.cloneRange();
    refreshPagination();
    return true;
  }

  function wireImage(img) {
    img.setAttribute('data-wired', '1');
    img.addEventListener('click', function (e) {
      e.stopPropagation();
      selectImage(img);
    });
  }

  function positionImageToolbar() {
    if (!selectedImg || !imageToolbar) return;
    var r = selectedImg.getBoundingClientRect();
    imageToolbar.style.left = Math.max(8, r.left) + 'px';
    imageToolbar.style.top = Math.max(8, r.top - 42) + 'px';
  }

  function updateImageToolbarActiveState() {
    if (!selectedImg || !imageToolbar) return;
    var currentW = selectedImg.style.width || '';
    imageToolbar.querySelectorAll('button[data-img-w]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-img-w') === currentW);
    });
    var wrap = selectedImg.closest('.img-wrap') || selectedImg.parentElement;
    var currentAlign = (wrap && wrap.style.textAlign) || 'left';
    imageToolbar.querySelectorAll('button[data-img-align]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-img-align') === currentAlign);
    });
  }

  function selectImage(img) {
    if (selectedImg) selectedImg.classList.remove('img-selected');
    selectedImg = img;
    img.classList.add('img-selected');
    if (imageToolbar) imageToolbar.hidden = false;
    positionImageToolbar();
    updateImageToolbarActiveState();
  }

  function deselectImage() {
    if (selectedImg) selectedImg.classList.remove('img-selected');
    selectedImg = null;
    if (imageToolbar) imageToolbar.hidden = true;
  }

  if (insertImageBtn && imageFileInput) {
    insertImageBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    insertImageBtn.addEventListener('click', function () {
      imageFileInput.click();
    });
    imageFileInput.addEventListener('change', function () {
      var file = imageFileInput.files && imageFileInput.files[0];
      imageFileInput.value = ''; // 같은 파일을 다시 골라도 change가 또 발생하도록 초기화
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        recordBeforeChange();
        // <p class="img-wrap"><img></p> — 문단으로 감싸는 이유는 (1) 문단
        // 자체가 자연스럽게 block이라 이미지가 항상 독립된 줄을 차지하고,
        // (2) 이 문단의 text-align으로 정렬 버튼을 그대로 재사용할 수
        // 있기 때문입니다(이미지 자체는 document.css에서 inline-block).
        var wrap = document.createElement('p');
        wrap.className = 'img-wrap';
        var img = document.createElement('img');
        img.src = reader.result;
        wrap.appendChild(img);
        insertBlockAsSibling(wrap, getLastFlowContainer());
        wireImage(img);
      };
      reader.readAsDataURL(file);
    });
  }

  if (imageToolbar) {
    imageToolbar.querySelectorAll('button[data-img-align]').forEach(function (btn) {
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      btn.addEventListener('click', function () {
        if (!selectedImg) return;
        recordBeforeChange();
        var wrap = selectedImg.closest('.img-wrap') || selectedImg.parentElement;
        wrap.style.textAlign = btn.getAttribute('data-img-align');
        updateImageToolbarActiveState();
      });
    });
    imageToolbar.querySelectorAll('button[data-img-w]').forEach(function (btn) {
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      btn.addEventListener('click', function () {
        if (!selectedImg) return;
        recordBeforeChange();
        selectedImg.style.width = btn.getAttribute('data-img-w');
        selectedImg.style.height = 'auto';
        positionImageToolbar();
        updateImageToolbarActiveState();
        refreshPagination();
      });
    });
    var imgDeleteBtn = document.getElementById('imgDeleteBtn');
    if (imgDeleteBtn) {
      imgDeleteBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      imgDeleteBtn.addEventListener('click', function () {
        if (!selectedImg) return;
        recordBeforeChange();
        // 이미지를 감싸는 <p class="img-wrap"> 문단째로 지워서 빈 문단이
        // 남지 않게 합니다.
        var wrap = selectedImg.closest('.img-wrap');
        if (wrap) { wrap.remove(); } else { selectedImg.remove(); }
        deselectImage();
        refreshPagination();
      });
    }
  }
  // 이미지·툴바 바깥을 클릭하면 선택을 해제합니다.
  document.addEventListener('click', function (e) {
    if (selectedImg && e.target !== selectedImg && (!imageToolbar || !imageToolbar.contains(e.target))) {
      deselectImage();
    }
  });
  // 문서가 길어 스크롤되거나 창 크기가 바뀌면 떠 있는 이미지 툴바 위치를
  // 다시 계산합니다(캡처 단계로 등록해야 어느 요소가 스크롤되든 잡힙니다).
  window.addEventListener('scroll', function () { if (selectedImg) positionImageToolbar(); }, true);
  window.addEventListener('resize', function () { if (selectedImg) positionImageToolbar(); });

  /* ---------- 10) 표 삽입 / 표 설정 ----------
     버튼을 누르면 몇×몇 표를 넣을지 격자에서 마우스로 미리보고
     고릅니다(구글독스와 같은 방식). 삽입된 표는 .doc-table 클래스를
     가지며, 실제 테두리·여백 기본값은 document.css의 .doc-table
     규칙(CSS 변수 --tbl-*)을 따릅니다. 표 안에 커서가 있을 때 "표
     설정" 버튼을 누르면 그 변수를 바꾸는 팝업이 열리고, 같은 팝업에서
     행/열도 추가·삭제합니다. */
  var GRID_MAX = 8;
  var insertTableBtn = document.getElementById('insertTableBtn');
  var tableGridPicker = document.getElementById('tableGridPicker');
  var gridPickerGrid = document.getElementById('gridPickerGrid');
  var gridPickerLabel = document.getElementById('gridPickerLabel');

  function getTableElement(node) {
    var el = node && node.nodeType === 3 ? node.parentElement : node;
    while (el && el.nodeType === 1 && !(el.tagName === 'TABLE' && el.classList.contains('doc-table'))) {
      if (el.classList && el.classList.contains('editable')) return null;
      el = el.parentElement;
    }
    return el;
  }

  function insertTable(rows, cols) {
    recordBeforeChange();
    var table = document.createElement('table');
    table.className = 'doc-table';
    for (var r = 0; r < rows; r++) {
      var tr = document.createElement('tr');
      for (var c = 0; c < cols; c++) {
        var cell = document.createElement(r === 0 ? 'th' : 'td');
        cell.innerHTML = '<br>'; // 빈 셀도 클릭해서 커서를 놓을 수 있도록
        tr.appendChild(cell);
      }
      table.appendChild(tr);
    }
    // 표도 그림과 같은 규칙으로, 커서가 있던 문단 "다음 줄"에 통째로
    // 끼워 넣습니다(insertBlockAsSibling — 섹션 9 참고).
    insertBlockAsSibling(table, getLastFlowContainer());
  }

  if (insertTableBtn && tableGridPicker && gridPickerGrid) {
    for (var gr = 1; gr <= GRID_MAX; gr++) {
      for (var gc = 1; gc <= GRID_MAX; gc++) {
        var gcell = document.createElement('div');
        gcell.className = 'grid-picker-cell';
        gcell.setAttribute('data-row', gr);
        gcell.setAttribute('data-col', gc);
        gridPickerGrid.appendChild(gcell);
      }
    }
    var gridCells = gridPickerGrid.querySelectorAll('.grid-picker-cell');
    gridPickerGrid.addEventListener('mousemove', function (e) {
      if (!e.target.classList.contains('grid-picker-cell')) return;
      var hr = parseInt(e.target.getAttribute('data-row'), 10);
      var hc = parseInt(e.target.getAttribute('data-col'), 10);
      gridCells.forEach(function (cell) {
        var cr = parseInt(cell.getAttribute('data-row'), 10);
        var cc = parseInt(cell.getAttribute('data-col'), 10);
        cell.classList.toggle('on', cr <= hr && cc <= hc);
      });
      if (gridPickerLabel) gridPickerLabel.textContent = hr + ' × ' + hc + ' 표';
    });
    gridPickerGrid.addEventListener('mouseleave', function () {
      gridCells.forEach(function (cell) { cell.classList.remove('on'); });
      if (gridPickerLabel) gridPickerLabel.textContent = '표 크기 선택';
    });
    gridPickerGrid.addEventListener('mousedown', function (e) { e.preventDefault(); });
    gridPickerGrid.addEventListener('click', function (e) {
      if (!e.target.classList.contains('grid-picker-cell')) return;
      var rows = parseInt(e.target.getAttribute('data-row'), 10);
      var cols = parseInt(e.target.getAttribute('data-col'), 10);
      insertTable(rows, cols);
      tableGridPicker.hidden = true;
    });
    wireDropdown(insertTableBtn, tableGridPicker);
  }

  // ---- 표 설정 플로팅 아이콘 + 팝업 ----
  // 예전에는 도구모음에 "표 설정" 버튼이 항상 떠 있고, 표 밖에서 누르면
  // 안내창(alert)만 뜨는 방식이었습니다. 지금은 그림을 클릭했을 때
  // 뜨는 이미지 툴바와 같은 방식으로 바꿨습니다 — 커서가 표 안에 있는
  // 동안에만 그 표 오른쪽 위에 톱니바퀴 아이콘이 뜨고, 표 밖으로
  // 나가면 사라집니다. 버튼 자체가 "표 안에 있을 때만" 보이므로 안내창이
  // 필요 없어졌습니다.
  var tableToolbar = document.getElementById('tableToolbar');
  var tableSettingsBtn = document.getElementById('tableSettingsBtn');
  var tableSettingsPopover = document.getElementById('tableSettingsPopover');
  var activeTable = null; // 설정 팝업이 실제로 적용될 표(아이콘이 떠 있는 동안 계속 갱신됨)
  var TS_PROP_MAP = {
    'border-width': '--tbl-border-w',
    'border-style': '--tbl-border-style',
    'pad': '--tbl-pad'
  };

  function positionTableToolbar() {
    if (!activeTable || !tableToolbar) return;
    var r = activeTable.getBoundingClientRect();
    // 표의 오른쪽 위 모서리에 아이콘 오른쪽 끝이 맞춰지도록.
    var tw = tableToolbar.offsetWidth || 36;
    tableToolbar.style.left = Math.max(8, r.right - tw) + 'px';
    tableToolbar.style.top = Math.max(8, r.top - 38) + 'px';
  }
  function positionTableSettingsPopover() {
    if (!tableToolbar || !tableSettingsPopover) return;
    var r = tableToolbar.getBoundingClientRect();
    tableSettingsPopover.style.left = Math.max(8, r.right - tableSettingsPopover.offsetWidth) + 'px';
    tableSettingsPopover.style.top = (r.bottom + 6) + 'px';
  }
  function showTableToolbarFor(table) {
    activeTable = table;
    if (tableToolbar) tableToolbar.hidden = false;
    positionTableToolbar();
  }
  function hideTableToolbar() {
    activeTable = null;
    if (tableToolbar) tableToolbar.hidden = true;
    if (tableSettingsPopover) tableSettingsPopover.hidden = true;
  }
  // 문서 안에서 선택(커서)이 바뀔 때마다 지금 표 안에 있는지 검사합니다.
  // 도구모음 버튼을 누르는 등 선택이 편집 영역 "바깥"으로 잠깐 나가는
  // 경우는 무시해서(직전 상태 유지), 아이콘을 누르러 가는 동안 아이콘이
  // 먼저 사라져버리는 일이 없게 합니다 — 실제로 사라지는 시점은 아래
  // "바깥 클릭" 리스너가 담당합니다.
  document.addEventListener('selectionchange', function () {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    if (!isInsideEditable(range.commonAncestorContainer)) return;
    var table = getTableElement(range.commonAncestorContainer);
    if (table) showTableToolbarFor(table); else hideTableToolbar();
  });
  document.addEventListener('click', function (e) {
    if (activeTable && tableToolbar && tableSettingsPopover &&
        !tableToolbar.contains(e.target) && !tableSettingsPopover.contains(e.target) &&
        !activeTable.contains(e.target)) {
      hideTableToolbar();
    }
  });
  window.addEventListener('scroll', function () { if (activeTable) { positionTableToolbar(); if (tableSettingsPopover && !tableSettingsPopover.hidden) positionTableSettingsPopover(); } }, true);
  window.addEventListener('resize', function () { if (activeTable) { positionTableToolbar(); if (tableSettingsPopover && !tableSettingsPopover.hidden) positionTableSettingsPopover(); } });

  function syncTableSettingsUI() {
    if (!activeTable || !tableSettingsPopover) return;
    var cs = getComputedStyle(activeTable);
    Object.keys(TS_PROP_MAP).forEach(function (propKey) {
      var current = cs.getPropertyValue(TS_PROP_MAP[propKey]).trim();
      tableSettingsPopover.querySelectorAll('.ts-row[data-ts-prop="' + propKey + '"] button').forEach(function (b) {
        b.classList.toggle('on', b.getAttribute('data-value') === current);
      });
    });
  }

  if (tableSettingsBtn && tableSettingsPopover) {
    tableSettingsBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    tableSettingsBtn.addEventListener('click', function () {
      if (!activeTable) return; // 아이콘이 떠 있다는 것 자체가 activeTable이 있다는 뜻이지만 방어적으로 확인
      tableSettingsPopover.hidden = !tableSettingsPopover.hidden;
      if (!tableSettingsPopover.hidden) {
        positionTableSettingsPopover();
        syncTableSettingsUI();
      }
    });
    tableSettingsPopover.querySelectorAll('.ts-row[data-ts-prop]').forEach(function (row) {
      var cssVar = TS_PROP_MAP[row.getAttribute('data-ts-prop')];
      row.querySelectorAll('button[data-value]').forEach(function (btn) {
        btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
        btn.addEventListener('click', function () {
          if (!activeTable) return;
          recordBeforeChange();
          activeTable.style.setProperty(cssVar, btn.getAttribute('data-value'));
          syncTableSettingsUI();
          refreshPagination();
        });
      });
    });
  }

  function currentColCount(table) {
    var firstRow = table.rows[0];
    return firstRow ? firstRow.cells.length : 0;
  }
  var tsAddRow = document.getElementById('tsAddRow');
  var tsDelRow = document.getElementById('tsDelRow');
  var tsAddCol = document.getElementById('tsAddCol');
  var tsDelCol = document.getElementById('tsDelCol');
  if (tsAddRow) {
    tsAddRow.addEventListener('mousedown', function (e) { e.preventDefault(); });
    tsAddRow.addEventListener('click', function () {
      if (!activeTable) return;
      recordBeforeChange();
      var cols = currentColCount(activeTable);
      var tr = document.createElement('tr');
      for (var i = 0; i < cols; i++) {
        var td = document.createElement('td');
        td.innerHTML = '<br>';
        tr.appendChild(td);
      }
      activeTable.appendChild(tr);
      refreshPagination();
    });
  }
  if (tsDelRow) {
    tsDelRow.addEventListener('mousedown', function (e) { e.preventDefault(); });
    tsDelRow.addEventListener('click', function () {
      if (!activeTable || activeTable.rows.length <= 1) return;
      recordBeforeChange();
      activeTable.deleteRow(activeTable.rows.length - 1);
      refreshPagination();
    });
  }
  if (tsAddCol) {
    tsAddCol.addEventListener('mousedown', function (e) { e.preventDefault(); });
    tsAddCol.addEventListener('click', function () {
      if (!activeTable) return;
      recordBeforeChange();
      Array.prototype.forEach.call(activeTable.rows, function (row, idx) {
        var isHeaderRow = row.cells[0] && row.cells[0].tagName === 'TH';
        var cell = document.createElement(isHeaderRow ? 'th' : 'td');
        cell.innerHTML = '<br>';
        row.appendChild(cell);
      });
      refreshPagination();
    });
  }
  if (tsDelCol) {
    tsDelCol.addEventListener('mousedown', function (e) { e.preventDefault(); });
    tsDelCol.addEventListener('click', function () {
      if (!activeTable || currentColCount(activeTable) <= 1) return;
      recordBeforeChange();
      Array.prototype.forEach.call(activeTable.rows, function (row) {
        if (row.cells.length) row.removeChild(row.cells[row.cells.length - 1]);
      });
      refreshPagination();
    });
  }

  /* ---------- 11) 실행취소 / 다시 실행 (Ctrl+Z / Ctrl+Shift+Z) ----------
     색상·글자크기(섹션 4), 목록 모양(섹션 5), 들여쓰기(섹션 6), 그림·표
     삽입/설정(섹션 9·10)처럼 execCommand를 쓰지 않고 DOM을 직접 조작하는
     기능들은 브라우저 기본 실행취소 목록에 잡히지 않습니다(굵게/기울임/
     밑줄/정렬처럼 execCommand로 처리되는 기능과 달리, 이 함수들은 코드가
     몰래 DOM을 바꿔치기하는 것이라 브라우저가 그 변화를 모릅니다).

     타이핑을 포함해 이 문서의 모든 편집을 하나의 흐름으로 되돌릴 수
     있도록, 브라우저 기본 실행취소는 완전히 꺼두고(아래 keydown에서
     가로채 preventDefault) 이 문서 전용 스냅샷 기반 되돌리기 스택을
     대신 씁니다 — 일반 워드프로세서처럼 Ctrl+Z 한 번에 방금 한 동작이
     그대로 되돌아갑니다.

     스냅샷 1개 = 문서번호·제목·수신처 3칸 + 본문 전체(흐름 항목)의
     내용. 본문은 여러 페이지에 나뉘어 있어도 실제로는 한 흐름이므로
     (pagination.js가 그때그때 몇 페이지로 나눌지 다시 계산하는
     것뿐이므로), 모든 .flow-items의 내용을 순서대로 이어붙인 문자열
     하나로 저장합니다. 되돌릴 때는 1페이지 흐름 영역 하나에 그 문자열을
     통째로 넣고 pagination.js에게 다시 나눠 달라고 요청합니다(주의:
     내용을 통째로 다시 그리므로 이전 커서가 있던 정확한 위치까지는
     복원하지 못하고, 대신 본문 맨 끝에 커서를 둡니다).

     기록 시점은 두 가지로 나뉩니다:
       - 타이핑: 'beforeinput'(변경 직전)에 그 순간 상태를 기억해뒀다가,
         타이핑이 잠깐(약 0.6초) 멈추면 그제서야 스택에 쌓습니다 — 한
         글자마다 쌓으면 Ctrl+Z 한 번에 글자 하나씩만 지워져 불편하므로,
         쉬지 않고 이어 친 구간을 한 덩어리로 묶습니다(일반 워드프로세서
         동작과 동일).
       - 버튼 조작(색상/크기/들여쓰기/목록모양/그림/표 등): 각 기능이
         실제로 DOM을 바꾸기 직전에 이 섹션의 recordBeforeChange()를
         호출해서(위 섹션 2/4/5/6/9/10 각 함수 첫머리 참고) 그 시점
         상태를 즉시 스택에 쌓습니다. */
  var UNDO_LIMIT = 100;
  var undoStack = [];
  var redoStack = [];
  var suppressCapture = false;
  var pendingBeforeTyping = null;
  var typingTimer = null;
  var TYPING_GROUP_MS = 600;

  function captureSnapshot() {
    var docNoEl = document.getElementById('docNo');
    var docTitleEl = document.getElementById('docTitle');
    var docToEl = document.getElementById('docTo');
    var flows = Array.prototype.slice.call(document.querySelectorAll('.flow-items'));
    return {
      docNo: docNoEl ? docNoEl.innerHTML : null,
      docTitle: docTitleEl ? docTitleEl.innerHTML : null,
      docTo: docToEl ? docToEl.innerHTML : null,
      flowHTML: flows.map(function (f) { return f.innerHTML; }).join('')
    };
  }

  function flushPendingTyping() {
    if (pendingBeforeTyping === null) return;
    clearTimeout(typingTimer);
    undoStack.push(pendingBeforeTyping);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
    pendingBeforeTyping = null;
  }

  // 버튼으로 서식/구조를 바꾸는 기능들이 실제로 DOM을 건드리기 직전에
  // 호출합니다.
  function recordBeforeChange() {
    flushPendingTyping();
    var snap = captureSnapshot();
    undoStack.push(snap);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
    // 이 직후 실행되는 execCommand(목록 만들기 등)가 브라우저 자체
    // 'input' 이벤트를 동시에 일으켜도, 방금 위에서 기록한 스냅샷과
    // 중복으로 또 쌓이지 않도록 이번 실행 흐름이 끝날 때까지만 잠깐
    // 캡처를 막아둡니다.
    suppressCapture = true;
    setTimeout(function () { suppressCapture = false; }, 0);
  }

  document.addEventListener('beforeinput', function (e) {
    if (suppressCapture) return;
    if (!(e.target && e.target.closest && e.target.closest('.editable'))) return;
    if (pendingBeforeTyping === null) pendingBeforeTyping = captureSnapshot();
  }, true);
  document.addEventListener('input', function (e) {
    if (suppressCapture) return;
    if (!(e.target && e.target.closest && e.target.closest('.editable'))) return;
    clearTimeout(typingTimer);
    typingTimer = setTimeout(flushPendingTyping, TYPING_GROUP_MS);
  }, true);

  function applySnapshot(snap) {
    if (!snap) return;
    suppressCapture = true;
    var docNoEl = document.getElementById('docNo');
    var docTitleEl = document.getElementById('docTitle');
    var docToEl = document.getElementById('docTo');
    if (docNoEl && snap.docNo !== null) docNoEl.innerHTML = snap.docNo;
    if (docTitleEl && snap.docTitle !== null) docTitleEl.innerHTML = snap.docTitle;
    if (docToEl && snap.docTo !== null) docToEl.innerHTML = snap.docTo;

    var pagesRoot = document.getElementById('pages');
    var firstFlow = null;
    if (pagesRoot) {
      var pages = pagesRoot.querySelectorAll('.page');
      for (var i = pages.length - 1; i >= 1; i--) pages[i].parentNode.removeChild(pages[i]);
      firstFlow = pagesRoot.querySelector('.flow-items');
      if (firstFlow) firstFlow.innerHTML = snap.flowHTML;
    }
    if (firstFlow) {
      // innerHTML로 다시 그려진 이미지는 이전에 붙여둔 클릭 리스너가
      // 사라지므로(섹션 9 wireImage) 다시 연결해줘야 클릭해서 선택할
      // 수 있습니다.
      firstFlow.querySelectorAll('img').forEach(function (img) {
        img.removeAttribute('data-wired');
        wireImage(img);
      });
      var r = document.createRange();
      r.selectNodeContents(firstFlow);
      r.collapse(false);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
    refreshPagination();
    setTimeout(function () { suppressCapture = false; }, 0);
  }

  function undo() {
    flushPendingTyping();
    if (!undoStack.length) return;
    var current = captureSnapshot();
    var prev = undoStack.pop();
    redoStack.push(current);
    if (redoStack.length > UNDO_LIMIT) redoStack.shift();
    applySnapshot(prev);
  }
  function redo() {
    if (!redoStack.length) return;
    var current = captureSnapshot();
    var next = redoStack.pop();
    undoStack.push(current);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    applySnapshot(next);
  }

  document.addEventListener('keydown', function (e) {
    var mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    var key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  }, true);

  /* ---------- 12) "문서 양식" / "발신인" 드롭다운 ----------
     상단 도구모음 제목 자리의 두 드롭다운(마크업은 templates/gongmun/
     index.html의 .toolbar-card-title 참고).

     문서 양식(#docTypeBtn/#docTypePopover): shared/scripts/
     template-registry.js의 DISE.templates를 읽어 목록을 그리고,
     고르면 그 템플릿 페이지로 이동합니다. 본문에 이미 입력한 내용이
     있으면(=페이지를 처음 열었을 때와 달라졌으면) #resetDocBtn과 같은
     방식(window.confirm)으로 한 번 확인합니다 — "달라졌는지"는 이 위
     섹션 11의 captureSnapshot()을 그대로 재사용해서 판단합니다.

     "처음 열었을 때" 스냅샷은 window의 load 이벤트 리스너 안에서도
     setTimeout(...,0)으로 한 번 더 미뤄서 찍습니다 — pagination.js도
     load 시점에 첫 페이지 분할(repaginate)을 하는데, editor.js가 먼저
     실행되어 load 리스너를 먼저 등록하므로 그냥 load 안에서 바로
     찍으면 pagination.js가 아직 손대기 전 상태를 찍어버릴 수 있습니다
     (실제로는 초기 본문이 한 페이지 안에 다 들어가서 거의 문제가 안
     되지만, 만에 하나를 대비한 안전장치입니다).

     발신인(#senderBtn/#senderPopover): shared/scripts/sender-info.js의
     DISE.senders[회사키]를 읽어 목록을 그리고, 고르면 서명란(.sign-block)
     의 이름/직함/연락처만 바꿉니다. 본문 흐름(.flow-items) 안의 내용이라
     recordBeforeChange()를 먼저 불러서 Ctrl+Z로도 되돌릴 수 있게 하되,
     본문 내용 자체를 지우는 게 아니므로 확인창은 없습니다. */
  var initialDocSnapshot = null;
  window.addEventListener('load', function () {
    setTimeout(function () { initialDocSnapshot = captureSnapshot(); }, 0);
  });

  function isDocModifiedFromInitial() {
    if (!initialDocSnapshot) return false;
    var now = captureSnapshot();
    return now.docNo !== initialDocSnapshot.docNo ||
      now.docTitle !== initialDocSnapshot.docTitle ||
      now.docTo !== initialDocSnapshot.docTo ||
      now.flowHTML !== initialDocSnapshot.flowHTML;
  }

  // ---- 문서 양식 드롭다운 ----
  var docTypeBtn = document.getElementById('docTypeBtn');
  var docTypePopover = document.getElementById('docTypePopover');
  if (docTypeBtn && docTypePopover && window.DISE && DISE.templates) {
    var currentTemplateKey = window.DISE_CURRENT_TEMPLATE || '';

    docTypePopover.innerHTML = DISE.templates.map(function (t) {
      var isCurrent = t.key === currentTemplateKey;
      return '<button type="button" data-template-key="' + t.key + '"' +
        (isCurrent ? ' class="current"' : '') + '>' + t.nameKr + '</button>';
    }).join('');

    docTypeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      docTypePopover.hidden = !docTypePopover.hidden;
    });
    document.addEventListener('click', function (e) {
      if (!docTypePopover.hidden && e.target !== docTypeBtn &&
        !docTypePopover.contains(e.target) && !docTypeBtn.contains(e.target)) {
        docTypePopover.hidden = true;
      }
    });
    docTypePopover.addEventListener('click', function (e) {
      var optBtn = e.target.closest('[data-template-key]');
      if (!optBtn) return;
      var key = optBtn.getAttribute('data-template-key');
      docTypePopover.hidden = true;
      if (key === currentTemplateKey) return;
      var href = DISE.templateHref ? DISE.templateHref(key) : null;
      if (!href) return;
      if (isDocModifiedFromInitial() &&
        !window.confirm('작성 중인 내용이 있습니다. 다른 문서 양식으로 이동하면 지금까지 입력한 내용이 사라집니다. 계속할까요?')) {
        return;
      }
      window.location.href = href;
    });
  }

  // ---- 발신인 드롭다운 ----
  var senderBtn = document.getElementById('senderBtn');
  var senderPopover = document.getElementById('senderPopover');
  var senderLabel = document.getElementById('senderLabel');

  function currentSenderList() {
    var companyKey = window.DISE_CURRENT_COMPANY || 'disehimedia';
    return (window.DISE && DISE.senders && DISE.senders[companyKey]) || [];
  }

  function applySender(sender) {
    var signBlock = document.querySelector('.sign-block');
    if (!signBlock || !sender) return;
    var nameEl = signBlock.querySelector('.name');
    var titleEl = signBlock.querySelector('.title');
    var rightEl = signBlock.querySelector('.sign-right');
    if (nameEl) {
      // sender.nameEn이 정확히 'DISEHIMEDIA'면(회사 자체가 발신인인
      // 경우) components.js의 diseWordmarkHTML()이 DISE/HI/MEDIA를
      // 서로 다른 굵기로 나눠 그려줍니다 — 문서 헤더의 브랜드명과 같은
      // 처리입니다(shared/scripts/sender-info.js 주석 참고).
      var nameEnHTML = (window.DISE && DISE.components && DISE.components.diseWordmarkHTML) ?
        DISE.components.diseWordmarkHTML(sender.nameEn || '') : (sender.nameEn || '');
      nameEl.innerHTML = sender.nameKr +
        (sender.nameEn ? ' <span class="en">(' + nameEnHTML + ')</span>' : '');
    }
    if (titleEl) titleEl.textContent = sender.title || '';
    if (rightEl) {
      rightEl.innerHTML = (sender.phone || '') + (sender.phone && sender.email ? '<br>' : '') + (sender.email || '');
    }
    if (senderLabel) senderLabel.textContent = '발신: ' + sender.nameKr;
  }

  if (senderBtn && senderPopover) {
    var senderList = currentSenderList();
    senderPopover.innerHTML = senderList.map(function (s) {
      return '<button type="button" data-sender-id="' + s.id + '">' +
        s.nameKr +
        (s.title ? '<span class="sp-title">' + s.title + '</span>' : '') +
        '</button>';
    }).join('');

    senderBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      senderPopover.hidden = !senderPopover.hidden;
    });
    document.addEventListener('click', function (e) {
      if (!senderPopover.hidden && e.target !== senderBtn &&
        !senderPopover.contains(e.target) && !senderBtn.contains(e.target)) {
        senderPopover.hidden = true;
      }
    });
    senderPopover.addEventListener('click', function (e) {
      var optBtn = e.target.closest('[data-sender-id]');
      if (!optBtn) return;
      senderPopover.hidden = true;
      var sender = senderList.filter(function (s) { return s.id === optBtn.getAttribute('data-sender-id'); })[0];
      if (!sender) return;
      recordBeforeChange();
      applySender(sender);
    });
  }

})();
