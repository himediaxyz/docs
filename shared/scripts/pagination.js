/* ============================================================
   pagination.js
   A4 문서를 실제 워드프로세서처럼 "진짜 페이지 여러 장"으로 화면에
   보여주고, 본문이 한 페이지를 넘으면 자동으로 새 페이지를 만들어
   내용을 이어 붙입니다(인쇄 시에도 같은 페이지 경계를 그대로 씁니다).

   예전 버전(1차 개정)은 #docHeader/#docFooter를 position:fixed로 두고
   인쇄 시에만 페이지마다 반복시키는 방식이었는데, 실제 브라우저의
   인쇄 대화상자에서 헤더가 밀려 내려오고 푸터가 하단에서 뜨는 등
   헤드리스 검증과 다르게 동작하는 문제가 있었습니다. 지금 버전은 그
   문제를 근본적으로 피하기 위해 화면에서부터 A4 크기(210mm×297mm)로
   고정된 .page 박스를 필요한 만큼 만들어 쌓아두고, 인쇄는 그 박스
   그대로(@page margin:0 + break-after:page)를 씁니다 — 화면과 인쇄가
   항상 같은 페이지 경계를 보여주므로 "화면에서는 됐는데 인쇄에서는
   다르다"는 불일치가 구조적으로 생기지 않습니다.

   이 스크립트가 찾는 요소(관례상 아래 id/class를 그대로 써야 동작합니다):
     #pages          모든 .page를 담는 컨테이너
     .page           A4 한 장 (210mm×297mm 고정)
     .page-header/.page-footer  각 페이지의 헤더/푸터 밴드(모든 페이지
                     내용이 동일 — 1페이지 것을 그대로 복제해서 씀)
     .page-body-fixed  문서번호·제목·수신처·안내문 — 페이지가 늘어나도
                     절대 옮겨지지 않고 항상 1페이지에만 있는 영역
     .flow-items     실제로 페이지를 넘나드는 "흐름 항목"(문단/목록/
                     표/그림/서명란)이 담기는 contenteditable 영역.
                     페이지마다 하나씩 있고, 넘치는 항목은 다음
                     .flow-items로 통째로(항목 단위로) 옮겨집니다.

   window.DISE.pagination.refresh()로 바깥(예: editor.js의 그림/표
   삽입·삭제·크기 변경)에서도 다시 계산을 요청할 수 있습니다 — 타이핑이
   아닌 버튼 클릭으로 문서 길이가 바뀌는 경우는 'input' 이벤트가 발생하지
   않아서 따로 불러줘야 합니다.

   이 파일을 쓰는 곳: A4 인쇄 문서 템플릿
     <script src="../../shared/scripts/pagination.js"></script>
   ============================================================ */

(function () {
  var MM_TO_PX = 96 / 25.4;
  var A4_HEIGHT_PX = 297 * MM_TO_PX;

  function heightOf(el) {
    return el ? el.getBoundingClientRect().height : 0;
  }

  // el.getBoundingClientRect().height는 테두리 상자(border box)까지만
  // 재고 바깥 여백(margin)은 빼놓습니다. 문단(<p>) 등은 위/아래로
  // 16px씩 마진이 있는데, 정작 화면에서 항목과 항목 사이에 실제로
  // 벌어지는 간격은 "위 항목의 margin-bottom과 아래 항목의 margin-top
  // 중 더 큰 값"입니다(CSS 인접 형제 마진 겹침 규칙) — 단순히 더하는
  // 게 아닙니다. 이걸 셈에 넣지 않으면 항목을 쌓을 때마다 실제보다
  // 조금씩 작게 계산되어, 여러 항목이 누적되면 실제 화면에서는 이미
  // 푸터를 한참 넘었는데도 계산상으로는 아직 여유가 있는 것처럼 나와
  // 페이지 분할이 한참 늦게 일어나는 문제가 생깁니다.
  function marginTopBottom(el) {
    var cs = window.getComputedStyle(el);
    return {
      top: parseFloat(cs.marginTop) || 0,
      bottom: parseFloat(cs.marginBottom) || 0
    };
  }

  // 헤더/푸터 내용은 모든 페이지가 동일합니다(components.js가 1페이지
  // 것만 채우고, 나머지 페이지는 그 마크업을 그대로 복제해서 쓰기
  // 때문) — 그래서 높이도 1페이지 기준으로 한 번만 실측해서 .pages에
  // CSS 변수로 심어두면, document.css의 .page-body{top/bottom}이 모든
  // 페이지에서 자동으로 같은 값을 상속해 씁니다. 계열사마다 로고
  // 비율이나 주소 유무가 달라 문서마다 높이가 조금씩 다르므로 고정
  // px가 아니라 매번 다시 재는 방식입니다.
  function measureHeaderFooter(pagesRoot, firstPage) {
    var hdr = heightOf(firstPage.querySelector('.page-header')) || 176;
    var ftr = heightOf(firstPage.querySelector('.page-footer')) || 62;
    pagesRoot.style.setProperty('--hdr-h', hdr + 'px');
    pagesRoot.style.setProperty('--ftr-h', ftr + 'px');
    return { hdr: hdr, ftr: ftr };
  }

  // 2페이지 이후를 새로 만들 때 쓰는 틀 — 헤더/푸터 마크업은 1페이지
  // 것을 그대로 복제하고(내용이 항상 같으므로), 본문은 흐름 항목을
  // 담을 빈 .flow-items 하나만 둡니다(고정 영역인 문서번호/제목/
  // 수신처/안내문은 1페이지 전용이라 복제하지 않습니다).
  function buildPage(headerHTML, footerHTML) {
    var page = document.createElement('div');
    page.className = 'page';

    var header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = headerHTML;
    page.appendChild(header);

    var body = document.createElement('div');
    body.className = 'page-body';

    var flow = document.createElement('div');
    flow.className = 'cell-guide flow-items editable editable-block';
    flow.setAttribute('contenteditable', 'true');
    flow.setAttribute('spellcheck', 'false');
    body.appendChild(flow);
    page.appendChild(body);

    var footer = document.createElement('div');
    footer.className = 'page-footer';
    footer.innerHTML = footerHTML;
    page.appendChild(footer);

    return page;
  }

  // ---- 커서 위치 저장/복원 ----
  // 페이지를 다시 나누면서 문단 DOM 노드를 다른 .flow-items로
  // appendChild로 "이동"시키는데, 이때 그 문단 안에 커서가 있었다면
  // 브라우저에 따라 선택이 풀리거나 엉뚱한 곳에 남을 수 있습니다.
  // appendChild는 노드 자체(참조)는 그대로 유지한 채 위치만 옮기므로,
  // 이동 전에 커서의 (노드, 오프셋)만 기억해뒀다가 이동이 끝난 뒤 같은
  // 노드 참조로 다시 Range를 만들어 정확히 그 자리에 복원합니다.
  function captureSelection() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.anchorNode) return null;
    var host = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentNode;
    if (!host || !host.closest || !host.closest('.flow-items')) return null;
    return {
      anchorNode: sel.anchorNode, anchorOffset: sel.anchorOffset,
      focusNode: sel.focusNode, focusOffset: sel.focusOffset
    };
  }
  function restoreSelection(saved) {
    if (!saved) return;
    try {
      var host = saved.anchorNode.nodeType === 1 ? saved.anchorNode : saved.anchorNode.parentNode;
      var flowHost = host && host.closest ? host.closest('.flow-items') : null;
      if (flowHost && document.activeElement !== flowHost) flowHost.focus();
      var range = document.createRange();
      range.setStart(saved.anchorNode, saved.anchorOffset);
      range.setEnd(saved.focusNode, saved.focusOffset);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {
      // 이동 중에 노드 자체가 삭제된 경우 등 — 조용히 무시(커서가
      // 어딘가 안전한 기본 위치로 남는 것으로 충분합니다).
    }
  }

  // ---- 실제 재배치 ----
  // "측정 → 계산 → 이동"의 3단계로 나눠 처리합니다. 항목들은 아직
  // 옮기기 전에 전부 한 번에 순서대로 훑으며 어느 페이지에 들어갈지
  // 먼저 계산부터 끝내고(페이지 개수·순서를 확정), 그 다음에야 실제
  // DOM 이동을 합니다 — 그래야 페이지를 만들고 지우는 도중에 순서가
  // 꼬이지 않습니다.
  function repaginate() {
    if (composing) return; // 조합 중에는 compositionend가 다시 불러줍니다.
    try {
      repaginateInner();
    } catch (e) {
      // 페이지 재배치 도중 예외가 나면 화면이 "아무 일도 안 일어난 것
      // 처럼" 조용히 멈출 수 있습니다(디버그하기 가장 어려운 상태) —
      // 그래서 콘솔에 반드시 남겨서, 문제가 생기면 F12 콘솔에서 바로
      // 원인을 확인할 수 있게 합니다.
      console.error('[pagination] repaginate() 실패:', e);
    }
  }

  function repaginateInner() {
    var pagesRoot = document.getElementById('pages');
    var firstPage = pagesRoot && pagesRoot.querySelector('.page');
    if (!pagesRoot || !firstPage) return;

    var metrics = measureHeaderFooter(pagesRoot, firstPage);
    var bodyBudget = A4_HEIGHT_PX - metrics.hdr - metrics.ftr;
    var fixedPrefixH = heightOf(firstPage.querySelector('.page-body-fixed'));
    var firstPageBudget = Math.max(bodyBudget - fixedPrefixH, 0);

    var headerHTML = firstPage.querySelector('.page-header').innerHTML;
    var footerHTML = firstPage.querySelector('.page-footer').innerHTML;

    // 아직 아무것도 옮기기 전, 지금 DOM에 있는 순서 그대로 전체 흐름
    // 항목을 모읍니다 — 여러 페이지에 걸쳐 있어도 페이지 순서대로
    // 읽으므로 항상 원래 문서 순서와 같습니다.
    var items = Array.prototype.slice.call(pagesRoot.querySelectorAll('.flow-items > *'));

    var assignment = []; // [{item, pageIndex}, ...]
    var pageIndex = 0, used = 0, budget = firstPageBudget;
    // 같은 페이지에서 직전 항목의 margin-bottom — 다음 항목의
    // margin-top과 겹침 계산에 씁니다. 페이지가 막 시작된 상태(맨 위)
    // 에서는 "직전 항목"이 없으므로 0으로 취급합니다(맨 위 항목의
    // margin-top은 페이지 상단과 겹쳐 실제 화면 공간을 차지하지
    // 않습니다 — 실측으로 확인된 동작입니다).
    var prevMarginBottom = 0;
    items.forEach(function (item) {
      var rectH = item.getBoundingClientRect().height;
      var m = marginTopBottom(item);
      var isFirstOnPage = used === 0;
      var gap = isFirstOnPage ? 0 : Math.max(m.top, prevMarginBottom);
      var h = gap + rectH;
      // 이미 그 페이지에 뭔가 있는데 이 항목까지 더하면 넘칠 때만 다음
      // 페이지로 — 페이지가 비어있는 상태에서 항목 하나가 페이지보다
      // 커도 무한정 새 페이지를 만들지 않고 일단 그 페이지에 넣습니다
      // (매우 큰 그림 등 예외적인 경우의 안전장치).
      if (used > 0 && used + h > budget) {
        pageIndex++; used = 0; budget = bodyBudget;
        // 새 페이지의 맨 위 항목이 되므로 위쪽 마진은 겹치지 않습니다.
        gap = 0; h = rectH;
      }
      assignment.push({ item: item, pageIndex: pageIndex });
      used += h;
      prevMarginBottom = m.bottom;
    });
    var pageCount = pageIndex + 1;

    // 페이지가 모자라면 필요한 만큼 새로 만듭니다(새 페이지는 항상
    // 비어있는 상태로 시작하므로 이 단계는 커서/IME와 무관하게 안전).
    for (var i = pagesRoot.children.length; i < pageCount; i++) {
      pagesRoot.appendChild(buildPage(headerHTML, footerHTML));
    }
    var flowByPage = [];
    for (var p = 0; p < pageCount; p++) {
      flowByPage[p] = pagesRoot.children[p].querySelector('.flow-items');
    }

    // 실제로 자리를 옮겨야 하는 항목만 골라서 옮깁니다 — 타이핑 중
    // 대부분의 재계산은 "지금 페이지에 이미 다 들어간다"는 결론으로
    // 끝나므로, 그런 경우는 DOM을 전혀 건드리지 않습니다. 이게 중요한
    // 이유: 이동이 필요 없는데도 습관적으로 모든 항목을 appendChild하면
    // — 결과 위치는 같아도 — 지금 한글 입력기(IME)로 글자를 조합 중인
    // 문단까지 매번 떼었다 붙이게 되어, 조합이 깨지면서 자음이 중복
    // 입력되는 등 오타가 생깁니다(사용자가 실제로 겪은 증상). 그래서
    // "현재 위치가 이미 맞는지" 먼저 확인하고, 정말 다른 위치로 가야
    // 하는 항목만 그때그때 옮기면서 다음 항목의 "맞는 위치"를 다시
    // 계산합니다(한 번 옮기고 나면 그다음 항목의 기준점도 바뀌므로,
    // 전부 미리 계산해두지 않고 옮길 때마다 다시 확인합니다).
    var cursorByPage = {};
    var savedSel = null;
    var movedAny = false;
    assignment.forEach(function (a) {
      var container = flowByPage[a.pageIndex];
      var prevNode = cursorByPage.hasOwnProperty(a.pageIndex) ? cursorByPage[a.pageIndex] : null;
      var insertionPoint = prevNode ? prevNode.nextSibling : container.firstChild;
      if (a.item !== insertionPoint) {
        if (!movedAny) { savedSel = captureSelection(); movedAny = true; }
        container.insertBefore(a.item, insertionPoint);
      }
      cursorByPage[a.pageIndex] = a.item;
    });
    if (movedAny) restoreSelection(savedSel);

    // 더는 쓰지 않는 뒤쪽 페이지 정리(최소 1페이지는 항상 유지).
    for (var r = pagesRoot.children.length - 1; r >= Math.max(pageCount, 1); r--) {
      pagesRoot.removeChild(pagesRoot.children[r]);
    }
  }

  function debounce(fn, wait) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, wait); };
  }
  var debouncedRepaginate = debounce(repaginate, 200);

  // ---- .page-body가 몰래 스크롤되는 것 막기 ----
  // .page-body는 overflow:hidden이라 화면에 스크롤바는 안 보이지만,
  // 그렇다고 스크롤이 아예 불가능한 건 아닙니다(scrollTop을 코드로
  // 바꾸는 건 여전히 됩니다). 문제는 브라우저가 "커서가 화면 밖으로
  // 나가면 보이는 곳까지 자동으로 스크롤해서 따라가는" 동작을 할 때,
  // contenteditable(.flow-items)의 커서를 따라가려고 가장 가까운
  // "스크롤 가능한 조상"인 .page-body를 실제로 스크롤시켜 버린다는
  // 것입니다(오버플로만 hidden일 뿐 스크롤 컨테이너로는 취급됨). 이
  // 렇게 되면 페이지 상단의 문서번호/제목/수신처(.page-body-fixed)
  // 까지 통째로 위로 밀려 올라가 헤더 밑으로 사라지는 것처럼 보입니다
  // (사용자가 실제로 겪은 증상). 페이지 분할이 제때 일어나면 애초에
  // 이런 스크롤이 생길 이유가 없지만(커서가 항상 보이는 범위 안에
  // 있으므로), 타이핑 도중 다시 계산되기 전까지의 짧은 순간에도 이
  // 현상이 전혀 안 생기도록 이중 안전장치를 둡니다 — .page-body가
  // 스크롤되는 순간(scroll 이벤트) 즉시 0으로 되돌립니다. scroll
  // 이벤트는 버블링되지 않으므로 document에 캡처 단계로 등록해서
  // 모든 .page-body(2페이지 이후 새로 생기는 것 포함)를 한 번에
  // 잡습니다.
  document.addEventListener('scroll', function (e) {
    var t = e.target;
    if (t && t.nodeType === 1 && t.classList && t.classList.contains('page-body') && t.scrollTop !== 0) {
      t.scrollTop = 0;
    }
  }, true);

  // ---- 한글 등 IME 조합 중에는 재배치를 미룹니다 ----
  // 위에서 "실제로 옮길 항목만 옮기도록" 최소화했지만, 그래도 조합 중인
  // 문단 자체가 페이지 경계를 넘어가야 하는 경우(드물지만 가능)라면
  // 그 문단을 옮기는 순간 조합이 깨질 수 있습니다. 한글은 자음+모음을
  // 조합해서 한 글자를 완성하는 동안(compositionstart~compositionend)
  // 브라우저가 그 글자를 임시 상태로 들고 있는데, 이 사이에 DOM을
  // 건드리면(같은 자리로 다시 넣어도) 조합이 취소되면서 방금 친 자음이
  // 한 번 더 입력되는 등의 오타가 생깁니다. 그래서 조합이 진행 중인
  // 동안은 재배치를 아예 미뤘다가, 조합이 끝나는 순간(글자가 확정되는
  // 순간) 한 번 더 계산합니다.
  var composing = false;
  document.addEventListener('compositionstart', function (e) {
    if (e.target && e.target.closest && e.target.closest('.flow-items')) composing = true;
  });
  document.addEventListener('compositionend', function (e) {
    if (e.target && e.target.closest && e.target.closest('.flow-items')) {
      composing = false;
      debouncedRepaginate();
    }
  });

  // .flow-items 요소 하나하나에 리스너를 미리 붙이는 대신 document에서
  // 위임(delegation)으로 감지합니다 — 페이지가 늘어나며 새로 생기는
  // .flow-items도 별도로 챙기지 않아도 똑같이 잡힙니다.
  document.addEventListener('input', function (e) {
    if (composing) return; // 조합 중에는 compositionend에서 한 번만 처리
    if (e.target && e.target.closest && e.target.closest('.flow-items')) {
      debouncedRepaginate();
    }
  });

  // 타이핑이 아니라 버튼 클릭(그림 삽입/삭제/크기, 표 삽입/행렬 추가삭제
  // 등)으로 문서 길이가 바뀌는 경우를 위해 외부에서 부를 수 있게 공개.
  window.DISE = window.DISE || {};
  window.DISE.pagination = { refresh: debouncedRepaginate };

  window.addEventListener('load', repaginate);
  window.addEventListener('resize', debouncedRepaginate);
  window.addEventListener('beforeprint', repaginate);

  // 웹폰트가 늦게 로드되면 글자 크기가 바뀌면서 실제 높이가 달라지므로,
  // 폰트 로딩이 끝난 뒤 한 번 더 계산합니다.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(repaginate);
  }
})();
