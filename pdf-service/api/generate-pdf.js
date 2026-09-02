/* ============================================================
   generate-pdf.js
   다이즈하이미디어 공식 문서 시스템 — 서버사이드 PDF 생성 API
   (Vercel Node.js 서버리스 함수: POST /api/generate-pdf)

   ---------------------------------------------------------------
   왜 필요한가 (배경은 claude 프로젝트 노트
   "인쇄레이아웃_OS편차_이슈" 참고)

   브라우저의 window.print()는 OS/브라우저마다(특히 iOS AirPrint) 인쇄
   여백을 다르게 강제로 집어넣어서, 같은 문서인데도 macOS/iOS에서는
   푸터가 다음 페이지로 밀리는 등 결과물이 기기마다 달라지는 문제가
   있었습니다. shared/scripts/pagination.js가 이미 .page 높이를
   287mm(297mm - 안전여백 10mm)로 줄여 상당 부분 완화했지만, 이는 "실기기가
   강제로 먹는 여백"을 추정치로 미리 빼두는 보정일 뿐이라 기기·브라우저
   버전에 따라 여전히 어긋날 수 있습니다.

   이 함수는 그 대신 클라이언트가 보낸 "완성된 문서 HTML"을 항상 같은
   Linux 서버의 헤드리스 Chromium으로 렌더링해서 PDF를 만들어 돌려줍니다
   — 요청한 사람의 OS·브라우저가 무엇이든 결과가 항상 동일합니다.

   ---------------------------------------------------------------
   왜 별도의 PDF 레이아웃 엔진(react-pdf/pdfmake 등)을 새로 만들지 않았나

   클라이언트(shared/scripts/pdf-export.js)는 document.documentElement.
   outerHTML — 즉 지금 화면에 떠 있는 문서와 완전히 똑같은 HTML(이미
   사용자가 입력한 내용이 그대로 박혀 있고, <base href>만 추가됨) —을
   그대로 이 함수에 보냅니다. 이 함수는 그 HTML을 헤드리스 Chromium에
   그대로 불러들이므로, company-info.js/components.js/pagination.js 같은
   기존 스크립트가 서버에서도 그대로 다시 실행됩니다. 즉 "화면에 보이는
   레이아웃을 계산하는 코드"와 "PDF를 만드는 코드"가 완전히 같은
   코드입니다 — 별도의 PDF 템플릿을 만들어 유지보수 대상을 늘리지
   않으면서, 화면·인쇄(window.print)·서버 PDF 세 가지가 항상 같은 결과를
   보장합니다.

   ---------------------------------------------------------------
   알려진 제약

   1) Vercel 서버리스 함수는 요청 본문 크기에 플랫폼 자체 제한(약 4.5MB)이
      있습니다. 문서에 이미지를 여러 장 크게 삽입하면(shared/scripts/
      editor.js가 이미지를 base64로 문서에 통째로 내장하는 방식이라) 이
      한도를 넘어 요청 자체가 거부될 수 있습니다 — 이 함수 코드가 실행되기
      전에 플랫폼이 먼저 막으므로 아래 MAX_HTML_BYTES 체크로는 못 잡습니다.
      완화책: 이미지를 큰 원본 그대로 넣지 말고 적당히 축소해서 삽입하거나,
      추후 editor.js의 이미지 삽입 단계에 자동 축소(canvas 리사이즈)를
      추가하는 것을 고려하세요.
   2) 콜드 스타트 + 크로미움 실행 + 렌더링에 몇 초가 걸릴 수 있어
      vercel.json에 넉넉한 maxDuration/memory를 지정해뒀습니다(README 참고).

   실행 전 필요 패키지: puppeteer-core, @sparticuz/chromium
     (pdf-service/package.json 참고 — Vercel이 배포 시 자동 설치)
   ============================================================ */

// ★ 2026-09-02 수정: require를 파일 맨 위(모듈 로드 시점)가 아니라
// handler() 안, 실제로 필요한 순간(POST 요청이 들어와 렌더링을 시작할
// 때)으로 옮겼습니다. 원래는 파일 맨 위에서 바로 require했는데, 이
// 두 패키지(특히 @sparticuz/chromium의 바이너리 로딩) 중 하나가 Vercel의
// 실행 환경에서 어떤 이유로든 require 자체에서 실패하면 — 그 실패가
// module.exports가 만들어지기도 전에 일어나므로 — GET/OPTIONS를 포함한
// *모든* 요청이 우리 코드가 한 줄도 실행되기 전에 "FUNCTION_INVOCATION_
// FAILED"로 죽어버리고, 우리가 만든 try/catch(아래)는 전혀 작동하지
// 못해 원인을 알 수 없는 채로 크래시만 남습니다(실제로 겪은 증상 —
// GET 요청조차 405가 아니라 500으로 죽음). require를 handler 안
// try/catch로 옮기면: (1) GET/OPTIONS/잘못된 요청은 이 무거운 패키지를
// 아예 건드리지 않고 원래 의도대로 빠르게 처리되고, (2) 실제 POST
// 요청에서 로드가 실패해도 그 에러 메시지를 그대로 JSON 응답에 담아
// 돌려줄 수 있어 원인을 바로 알 수 있습니다.
// ★ 2026-09-02 추가 수정: 실제 배포 후 확인된 에러 —
// "require() of ES Module .../@sparticuz/chromium/build/index.js ...
//  not supported. Instead change the require ... to a dynamic import()".
// @sparticuz/chromium 최신 버전(패키지가 이번에 ESM 전용으로 바뀜)은
// puppeteer-core(CommonJS)처럼 require()로 못 불러오고 동적 import()로만
// 불러올 수 있습니다. import()는 함수처럼 쓰는 표현식이라 이 파일을
// ESM으로 바꾸거나 확장자를 .mjs로 바꾸지 않아도 CommonJS 파일 안에서
// 그대로 쓸 수 있습니다(Node 공식 안내 문구 그대로). ESM 모듈을 import()
// 하면 default export가 있는 경우 결과 객체의 .default에 실제 값이
// 담기므로 그 경우까지 같이 처리합니다.
var chromium, puppeteer;
async function loadPdfEngine() {
  if (!puppeteer) puppeteer = require('puppeteer-core');
  if (!chromium) {
    var mod = await import('@sparticuz/chromium');
    chromium = mod && mod.default ? mod.default : mod;
  }
  return { chromium: chromium, puppeteer: puppeteer };
}

// 이 API를 호출할 수 있는 출처(다이즈 문서 사이트) 화이트리스트.
// 그룹사별로 별도 도메인/서브패스를 쓰게 되면 여기에 추가하세요.
const ALLOWED_ORIGINS = [
  'https://himediaxyz.github.io'
];

// 서버 코드 자체의 방어적 상한선(참고 1번 참고 — 실제로는 Vercel 플랫폼의
// 약 4.5MB 제한이 이보다 먼저 적용됩니다).
const MAX_HTML_BYTES = 8 * 1024 * 1024;

// 클라이언트가 보낸 HTML의 <head> 안에서 pdf-export.js가 넣어준
// <base href="..."> 값을 그대로 꺼내옵니다. 아래 "문서 로딩 방식" 설명
// 참고 — 이 주소가 실제로 페이지를 불러오는 목적지가 됩니다.
function extractBaseHref(html) {
  var m = html.match(/<base\s+href=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

// baseHref가 우리가 허용한 출처(ALLOWED_ORIGINS) 안에 있는지 확인합니다.
// 이 확인이 없으면 이 API가 "아무 URL이나 그 오리진인 척 렌더링해주는"
// 열린 프록시처럼 악용될 수 있습니다(SSRF류 위험) — CORS 헤더는
// 브라우저에서 온 요청에만 적용되고 curl 같은 직접 호출은 우회할 수
// 있으므로, 이 검사를 CORS와 별개로 서버 쪽에서 반드시 해야 합니다.
function isAllowedTargetUrl(urlStr) {
  try {
    var origin = new URL(urlStr).origin;
    return ALLOWED_ORIGINS.indexOf(origin) !== -1;
  } catch (e) {
    return false;
  }
}

function setCorsHeaders(req, res) {
  var origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// 파일명에 쓸 수 없는 문자를 제거 — 클라이언트가 문서 제목을 그대로
// 넘길 수 있으므로(한글 포함) 최소한의 안전 장치만 둡니다.
function sanitizeFileName(name) {
  var fallback = 'document';
  if (!name || typeof name !== 'string') return fallback;
  var cleaned = name.replace(/[\\/:*?"<>|\r\n]/g, '').trim();
  return cleaned || fallback;
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST 요청만 지원합니다.' });
    return;
  }

  var body = req.body || {};
  var html = body.html;
  var fileName = sanitizeFileName(body.fileName);

  if (!html || typeof html !== 'string') {
    res.status(400).json({ error: 'html 필드가 필요합니다.' });
    return;
  }
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    res.status(413).json({ error: '문서 용량이 너무 큽니다. 삽입한 이미지를 줄여서 다시 시도해 주세요.' });
    return;
  }

  var baseHref = extractBaseHref(html);
  if (!baseHref || !isAllowedTargetUrl(baseHref)) {
    res.status(400).json({ error: '허용되지 않은 문서 출처입니다.' });
    return;
  }

  var browser = null;
  try {
    var engine = await loadPdfEngine();
    var chromium = engine.chromium, puppeteer = engine.puppeteer;
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      // 최신 puppeteer-core의 새 헤드리스 모드 식별자. chromium.headless
      // 속성은 @sparticuz/chromium 최신 버전에는 없습니다.
      headless: 'shell'
    });

    var page = await browser.newPage();
    // ---- 반드시 넓은 뷰포트로 고정 ----
    // shared/scripts/pagination.js는 화면 폭이 860px보다 좁으면(휴대폰
    // 등) "모바일 보기"로 판단해 페이지 나누기 자체를 하지 않고 본문을
    // 통째로 1페이지에 몰아넣습니다(MOBILE_BREAKPOINT 참고). @sparticuz/
    // chromium의 기본 뷰포트가 이보다 넓어서 우연히 문제가 안 될 수도
    // 있지만, 그 기본값에 기대면 패키지 버전이 바뀌거나 launch 옵션이
    // 조금만 달라져도 조용히 "모바일 보기"로 렌더링되어 버퍼가 통째로
    // 1페이지로 뭉쳐 나오는 사고가 날 수 있습니다(로컬 검증 중 실제로
    // puppeteer-core의 기본 800×600 뷰포트에서 이 사고가 재현됐습니다 —
    // 2026-09-02). 그래서 여기서 명시적으로 넉넉히 넓은 뷰포트를
    // 강제합니다 — 문서 내용과 무관하게 항상 '인쇄 레이아웃' 모드로
    // 계산되게 하기 위한 것으로, 실제 PDF 페이지 크기(A4)와는 무관합니다.
    await page.setViewport({ width: 1400, height: 1600 });
    // 문서 스크립트가 혹시라도 확인창(confirm/alert)을 띄우면(예:
    // editor.js의 "새 문서로 초기화" 관련 코드가 어떤 경로로든 실행되는
    // 경우) 렌더링이 영원히 멈추지 않도록 자동으로 닫아버립니다.
    page.on('dialog', function (dialog) { dialog.dismiss().catch(function () {}); });

    // ---- 문서 로딩 방식: page.setContent()가 아니라 요청 가로채기 ----
    // page.setContent(html)로 바로 넣으면 문서의 오리진이 'null'(불투명)
    // 이 되어, 실제로는 사이트 자기 자신에서 오는 리소스(서식 도구모음
    // 아이콘 SVG 등)조차 "Access to ... from origin 'null' has been
    // blocked by CORS policy"로 막히는 문제가 있었습니다(2026-09-02,
    // Playwright로 로컬 재현 후 확인). 그래서 대신 실제 사이트 주소
    // (클라이언트가 <base href>로 넘겨준 값 — 위 baseHref)로 요청을
    // 가로채서 우리가 만든 HTML로 직접 응답하는 방식을 씁니다. 이러면
    // 문서의 실제 오리진이 진짜 사이트 오리진이 되므로, 그 안의 상대
    // 경로 리소스(CSS/JS/로고 이미지)는 전부 진짜 같은 오리진 요청으로
    // 취급되어 정상적으로 불러와집니다 — 화면에서 직접 열었을 때와
    // 완전히 같은 네트워크 조건입니다.
    await page.setRequestInterception(true);
    page.on('request', function (req) {
      if (req.url() === baseHref) {
        req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      } else {
        req.continue();
      }
    });
    await page.goto(baseHref, { waitUntil: 'networkidle0', timeout: 30000 });
    // 웹폰트(Asta Sans/Open Sans)가 늦게 적용되면 실제 렌더링 높이가
    // pagination.js가 계산해둔 값과 어긋날 수 있으므로, 클라이언트의
    // pagination.js와 똑같이 폰트 로딩 완료를 기다립니다.
    await page.evaluate(function () {
      return (document.fonts && document.fonts.ready) ? document.fonts.ready : null;
    });

    // page.pdf()는 기본적으로 인쇄(print) CSS를 기준으로 렌더링하지만,
    // 명시적으로 지정해 의도를 분명히 해둡니다.
    await page.emulateMediaType('print');

    var pdfBuffer = await page.pdf({
      printBackground: true,
      // shared/styles/print.css의 @page{size:A4;margin:0} 규칙을 그대로
      // 따르게 합니다 — A4/Letter 같은 하드코딩된 값 대신 문서 자신의
      // CSS가 페이지 크기를 결정하므로, 새 템플릿이 다른 용지를 쓰게
      // 되어도 이 함수를 고칠 필요가 없습니다.
      preferCSSPageSize: true
    });

    await browser.close();
    browser = null;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '.pdf"');
    res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error('[generate-pdf] PDF 생성 실패:', err);
    if (browser) {
      try { await browser.close(); } catch (closeErr) { /* 이미 죽은 브라우저 — 무시 */ }
    }
    // ★ 2026-09-02: 배포 환경(Vercel)에서 크로미움 실행 자체가 실패하는
    // 원인을 대시보드 로그 없이 바로 확인할 수 있도록, 실제 에러 메시지를
    // 잠시 응답에 그대로 노출합니다. 이 API는 다이즈하이미디어 내부
    // 문서 사이트에서만 쓰는 도구라 위험이 크지 않지만, 원인이 확인되고
    // 나면 아래 메시지를 다시 고정 문구로 되돌리는 것을 권장합니다.
    res.status(500).json({
      error: 'PDF 생성 중 서버 오류가 발생했습니다: ' + (err && err.message ? err.message : String(err))
    });
  }
};
