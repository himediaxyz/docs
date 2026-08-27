/* ============================================================
   pagination.js
   A4 문서가 화면/인쇄에서 항상 페이지를 가득 채워 보이도록 높이를
   맞추고, 화면에서만 보이는 "예상 페이지 구분선"을 그려줍니다.

   이 스크립트가 찾는 요소(관례상 아래 id/class를 그대로 써야 동작합니다):
     #sheet          전체 종이 컨테이너
     #contentFlow    본문 tbody (여기 min-height를 계산해서 채워 넣음)
     #docHeader/#docFooter  인쇄 시 position:fixed로 반복(print.css) —
                     이 스크립트가 그 높이만큼 @page 여백을 계산해 넣음
     .doc-header-band 문서 헤더 밴드 (로고)
     .doc-footer-band 문서 푸터 밴드 (주소·연락처)
     .editable       입력 필드 (입력할 때마다 다시 계산하기 위해 감지)

   window.DISE.pagination.refresh()로 바깥(예: editor.js의 그림/표
   삽입·삭제·크기 변경)에서도 다시 계산을 요청할 수 있습니다 — 타이핑이
   아닌 버튼 클릭으로 문서 길이가 바뀌는 경우는 'input' 이벤트가 발생하지
   않아서 따로 불러줘야 합니다.

   이 파일을 쓰는 곳: A4 인쇄 문서 템플릿
     <script src="../../shared/scripts/pagination.js"></script>
   ============================================================ */

(function () {
  var MM_TO_PX = 96 / 25.4;
  var PX_TO_MM = 25.4 / 96;

  // 헤더/푸터 높이를 실측해서, 본문이 짧을 때도 문서 전체가 A4 한 페이지를
  // 가득 채우도록 최소 높이를 계산합니다 (짧은 문서에서 서명 아래
  // 배경색이 중간에 끊기는 문제 방지). 같은 실측값을 인쇄용 페이지 여백
  // 계산(applyPrintPageMargins)에도 그대로 씁니다.
  function syncPageMetrics() {
    var band = document.querySelector('.doc-header-band');
    var footer = document.querySelector('.doc-footer-band');
    var contentFlow = document.getElementById('contentFlow');
    var hdrH = band ? band.getBoundingClientRect().height : 176;
    var ftrH = footer ? footer.getBoundingClientRect().height : 62;
    var pageH = 297 * MM_TO_PX;
    var minBody = Math.max(pageH - hdrH - ftrH, 0);
    if (contentFlow) contentFlow.style.minHeight = minBody + 'px';
    applyPrintPageMargins(hdrH, ftrH);
  }

  // 인쇄 시 #docHeader/#docFooter는 position:fixed로 모든 페이지에
  // 반복됩니다(print.css) — 본문이 그 자리를 침범하지 않도록, 실제
  // 헤더/푸터 높이만큼 @page 여백을 비워줍니다. 계열사마다 로고 비율이나
  // 주소 유무가 달라 헤더·푸터 높이가 문서마다 조금씩 다르므로, 정적
  // 값이 아니라 <style id="dynamicPageMargin">를 만들어(또는 갱신해)
  // print.css의 기본 @page 규칙을 덮어씁니다.
  function applyPrintPageMargins(hdrH, ftrH) {
    var styleEl = document.getElementById('dynamicPageMargin');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'dynamicPageMargin';
      document.head.appendChild(styleEl);
    }
    var hdrMm = (hdrH * PX_TO_MM).toFixed(2);
    var ftrMm = (ftrH * PX_TO_MM).toFixed(2);
    styleEl.textContent = '@page{ size:A4; margin:' + hdrMm + 'mm 0 ' + ftrMm + 'mm 0; }';
  }

  // 화면에서 실제 인쇄 시 페이지가 나뉘는 지점을 대략적으로 미리 보여주는
  // 안내선 (297mm 단위 — 실제 브라우저 인쇄 엔진 결과와 몇 px 차이가 날
  // 수 있는 근사치입니다).
  function renderPageGuides() {
    var sheet = document.getElementById('sheet');
    if (!sheet) return;
    sheet.querySelectorAll('.page-guide').forEach(function (el) { el.remove(); });
    var pageHeightPx = 297 * MM_TO_PX;
    var totalHeight = sheet.scrollHeight;
    var n = 1;
    while (n * pageHeightPx < totalHeight - 4) {
      var guide = document.createElement('div');
      guide.className = 'page-guide no-print';
      guide.style.top = (n * pageHeightPx) + 'px';
      var tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = (n + 1) + '페이지 시작 (예상)';
      guide.appendChild(tag);
      sheet.appendChild(guide);
      n++;
    }
  }

  function debounce(fn, wait) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, wait); };
  }
  var debouncedRefresh = debounce(function () { syncPageMetrics(); renderPageGuides(); }, 200);

  // .editable 요소 하나하나에 리스너를 미리 붙이는 대신 document에서
  // 위임(delegation)으로 감지합니다 — 그림/표를 넣으면서 새로 생기는
  // .editable(예: 표 셀)도 페이지 로드 이후에 만들어지지만 이 방식이면
  // 별도로 챙기지 않아도 똑같이 잡힙니다.
  document.addEventListener('input', function (e) {
    if (e.target && e.target.closest && e.target.closest('.editable')) {
      debouncedRefresh();
    }
  });

  // 타이핑이 아니라 버튼 클릭(그림 삽입/삭제/크기, 표 삽입/행렬 추가삭제
  // 등)으로 문서 길이가 바뀌는 경우를 위해 외부에서 부를 수 있게 공개.
  window.DISE = window.DISE || {};
  window.DISE.pagination = { refresh: debouncedRefresh };

  window.addEventListener('load', function () { syncPageMetrics(); renderPageGuides(); });
  window.addEventListener('resize', debouncedRefresh);
  window.addEventListener('beforeprint', syncPageMetrics);

  // 웹폰트가 늦게 로드되면 글자 크기가 바뀌면서 실제 높이가 달라지므로,
  // 폰트 로딩이 끝난 뒤 한 번 더 계산합니다.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { syncPageMetrics(); renderPageGuides(); });
  }
})();
