/* ============================================================
   editor.js
   contenteditable 입력 필드(.editable)용 공통 편집 기능:
     1) 대괄호([ ]) 안내 문구 placeholder — 클릭하면 전체 선택되어
        바로 타이핑으로 덮어쓸 수 있음
     2) 서식 도구모음(#fmtToolbar) — 굵게/기울임/밑줄 + 서체/크기 변경

   새 템플릿에서 그대로 재사용하려면: .editable 클래스가 붙은
   contenteditable 요소들과, data-cmd 버튼(bold/italic/underline) +
   #fmtFont + #fmtSize 셀렉트가 담긴 #fmtToolbar만 마크업에 넣으면
   이 스크립트가 자동으로 연결합니다. 직접 수정할 일은 거의 없습니다 —
   서체 선택지를 늘리고 싶으면 각 템플릿의 <select id="fmtFont"> 안의
   <option>만 추가하면 됩니다.

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

})();
