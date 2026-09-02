/* ============================================================
   pdf-export.js
   "서버 PDF 다운로드" 버튼(#pdfDownloadBtn) 클릭 처리 — 지금 화면에 떠
   있는 문서를 서버(헤드리스 Chromium, pdf-service/api/generate-pdf.js)
   에서 PDF로 렌더링해 내려받습니다.

   ---------------------------------------------------------------
   왜 필요한가

   기존 "인쇄 / PDF로 저장"(window.print())은 브라우저·OS의 인쇄 엔진에
   기대는 방식이라, iOS/macOS 등 기기에 따라 강제 여백이 달라 푸터가
   다음 페이지로 밀리는 등 결과물이 달라지는 문제가 있었습니다(자세한
   배경은 claude 프로젝트의 "인쇄레이아웃_OS편차_이슈" 노트, 그리고
   shared/scripts/pagination.js·shared/styles/print.css 상단 주석 참고).
   이 버튼은 window.print() 대신, 지금 문서를 서버의 헤드리스
   Chromium으로 보내 PDF로 직접 만들어 받습니다 — 어떤 기기로 요청했든
   서버 쪽 렌더링 엔진은 항상 같으므로 결과가 항상 동일합니다.

   ---------------------------------------------------------------
   무엇을 보내나

   document.documentElement.outerHTML을 그대로 보냅니다 — 지금 화면에
   보이는 문서(사용자가 입력한 내용이 이미 DOM에 박혀 있음)와 완전히
   같은 HTML이며, company-info.js·components.js·pagination.js 등 이
   문서가 원래 쓰는 스크립트까지 그대로 포함됩니다. 다만 두 가지를
   보냅니다:
     1) <base href="..."> 태그를 <head> 맨 앞에 끼워 넣어, 상대 경로로
        되어 있는 CSS·스크립트·로고 이미지(../../shared/...)가 서버의
        헤드리스 브라우저에서도 실제 배포 주소를 기준으로 정상적으로
        불러와지게 합니다.
     2) 보내기 직전에 window.DISE.pagination.setMode('print', ...)를
        호출해, 혹시 지금 "모바일 보기"(페이지 구분 없이 한 흐름으로
        보이는 모드)였더라도 실제 인쇄용 다중 페이지 분할을 미리
        계산해둔 상태로 보냅니다 — pagination.js의 window.print() 대응
        beforeprint 핸들러와 같은 이유입니다(모바일 보기 상태 그대로
        보내면 본문이 페이지 하나에 다 뭉쳐 있어 서버에서도 그 상태
        그대로 잘려 나갑니다).

   서버(generate-pdf.js)는 이 HTML을 그대로 불러들여 렌더링만 할 뿐,
   레이아웃을 계산하는 코드는 이 문서가 원래 쓰는 것과 완전히
   같습니다 — 그래서 "화면에서 보던 것과 PDF가 다르다"는 불일치가
   구조적으로 생기지 않습니다.

   이 파일을 쓰는 곳: 사용자가 직접 입력하는 문서 템플릿(components.js
   보다 나중, editor.js/pagination.js보다는 나중에 불러오세요 — 이 버튼
   자체가 renderEditorUI()로 그려지고, window.DISE.pagination이 있어야
   동작합니다)
     <script src="../../shared/scripts/pdf-export.js"></script>

   버튼을 보이게 하려면 각 템플릿에서 renderEditorUI() 호출보다 먼저
   window.DISE_PDF_API_URL에 배포된 API 주소를 지정해야 합니다(예:
   'https://dise-docs-pdf.vercel.app/api/generate-pdf'). 비워두면
   components.js가 버튼 자체를 그리지 않습니다. 배포 방법은
   pdf-service/README.md 참고.
   ============================================================ */

(function () {
  function sanitizeFileNamePart(text) {
    if (!text) return '';
    return text.replace(/[\\/:*?"<>|\r\n]/g, '').trim();
  }

  // 파일명은 "문서번호_제목" 형태로 — 제목이 안내 문구([ ]로 시작)
  // 그대로면 의미가 없으므로 그 경우는 제목을 빼고 문서번호만 씁니다.
  function buildFileName() {
    var docNoEl = document.getElementById('docNo');
    var docTitleEl = document.getElementById('docTitle');
    var docNo = docNoEl ? sanitizeFileNamePart(docNoEl.textContent) : '';
    var titleText = docTitleEl ? docTitleEl.textContent.trim() : '';
    var isPlaceholder = titleText.indexOf('[') === 0 && titleText.indexOf(']') === titleText.length - 1;
    var title = isPlaceholder ? '' : sanitizeFileNamePart(titleText);
    var parts = [docNo, title].filter(function (s) { return !!s; });
    return parts.length ? parts.join('_') : 'document';
  }

  // outerHTML 문자열의 <head> 여는 태그 바로 뒤에 <base href>를
  // 끼워 넣습니다 — 정규식으로 <head ...> 하나만(문서에 head는 항상
  // 하나뿐이므로) 찾아 바꿉니다.
  function withBaseHref(html, baseHref) {
    return html.replace(/<head([^>]*)>/i, function (match) {
      return match + '<base href="' + baseHref + '">';
    });
  }

  function setButtonBusy(btn, busy, busyLabel, idleLabel) {
    btn.disabled = busy;
    btn.textContent = busy ? busyLabel : idleLabel;
  }

  function downloadBlob(blob, fileName) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 브라우저가 다운로드를 실제로 시작할 시간을 준 뒤 정리합니다.
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  async function handleClick(btn) {
    var apiUrl = window.DISE_PDF_API_URL;
    if (!apiUrl) {
      window.alert('서버 PDF 기능이 아직 이 문서에 설정되지 않았습니다(window.DISE_PDF_API_URL 미설정). "인쇄 / PDF로 저장" 버튼을 이용해 주세요.');
      return;
    }

    var pagination = window.DISE && window.DISE.pagination;
    var modeBefore = pagination ? pagination.getMode() : null;

    setButtonBusy(btn, true, 'PDF 생성 중…', '서버 PDF 다운로드');
    try {
      // 모바일 보기 상태였다면 실제 인쇄용 다중 페이지 분할을 먼저
      // 계산해둡니다(위 파일 상단 설명 참고). skipSave:true로 사용자가
      // 실제로 고른 보기 모드(localStorage)는 건드리지 않습니다.
      if (pagination && modeBefore !== 'print') {
        pagination.setMode('print', { skipSave: true });
      }

      var rawHtml = '<!doctype html>\n' + document.documentElement.outerHTML;
      var html = withBaseHref(rawHtml, document.baseURI);
      var fileName = buildFileName();

      var response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: html, fileName: fileName })
      });

      if (!response.ok) {
        var message = 'PDF 생성에 실패했습니다.';
        try {
          var errJson = await response.json();
          if (errJson && errJson.error) message = errJson.error;
        } catch (parseErr) { /* 서버가 JSON이 아닌 응답을 준 경우 — 기본 메시지 사용 */ }
        window.alert(message);
        return;
      }

      var blob = await response.blob();
      downloadBlob(blob, fileName + '.pdf');
    } catch (err) {
      console.error('[pdf-export] 서버 PDF 다운로드 실패:', err);
      window.alert('서버에 연결할 수 없습니다. 인터넷 연결을 확인하시거나 "인쇄 / PDF로 저장" 버튼을 이용해 주세요.');
    } finally {
      // 원래 보고 있던 화면 모드로 되돌립니다(모바일 보기 중이었다면).
      if (pagination && modeBefore !== null && pagination.getMode() !== modeBefore) {
        pagination.setMode(modeBefore, { skipSave: true });
      }
      setButtonBusy(btn, false, 'PDF 생성 중…', '서버 PDF 다운로드');
    }
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('#pdfDownloadBtn');
    if (!btn || btn.disabled) return;
    handleClick(btn);
  });
})();
