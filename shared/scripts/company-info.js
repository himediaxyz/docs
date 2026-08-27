/* ============================================================
   company-info.js
   회사/계열사 정보를 담아두는 단일 저장소.

   ★ 주소, 전화번호, 로고 경로 등이 바뀌면 이 파일 하나만 고치면
     모든 문서 템플릿에 자동으로 반영됩니다.

   ---------------------------------------------------------------
   용어 정리 (전체 시스템 공통 — components.js와 각 템플릿 주석에서도
   이 용어를 그대로 씁니다):

     "사이트(site)"   = 이 도구 자체(문서 시스템 웹페이지). 화면에만
                        보이고 인쇄되지 않습니다. 모든 페이지에 공통.
                        예) 포털로 돌아가는 상단 바, 화면 하단 캡션.

     "문서(document)" = 실제 공식 문서(레터헤드) 그 자체. 인쇄/PDF에
                        그대로 나갑니다. 계열사마다 로고·주소가 다름.
                        예) 종이 상단의 로고 밴드, 종이 하단의 주소 밴드.

   즉 헤더/푸터가 "사이트 헤더·푸터"와 "문서 헤더·푸터" 이렇게 두
   종류로 나뉩니다. 자세한 내용은 shared/README.md 참고.
   ---------------------------------------------------------------

   이 파일을 쓰는 곳: 모든 문서 템플릿 — company-info.js를 먼저 불러온
   뒤에 components.js를 불러와야 합니다.
     <script src="../../shared/scripts/company-info.js"></script>
   ============================================================ */

window.DISE = window.DISE || {};

/* ---------- 사이트(도구) 자체 정보 ---------- */
DISE.site = {
  nameKr: '다이즈하이미디어 공식 문서 시스템'
};

/* ---------- 계열사 정보 ----------
   key는 로고 폴더명(shared/assets/logos/ 아래 폴더)과 반드시 동일하게
   맞춥니다. 새 계열사가 생기면 여기 항목을 추가하고, 로고 파일은
   shared/assets/logos/{key}/{key}-mark.svg 규칙으로 넣으면 됩니다.
   (자세한 로고 네이밍 규칙은 shared/assets/logos/README.md 참고)

   logoRatio: 로고 원본 SVG의 viewBox 가로/세로 비율(가로 ÷ 세로).
   문서 헤더에서 로고 높이를 고정하고 이 비율로 너비를 자동 계산하는 데
   씁니다 — 계열사마다 로고 비율이 달라도 시각적 무게감이 맞도록.
   (실제 viewBox 값을 그대로 나눈 값이며, 로고 파일이 바뀌면 같이
   업데이트해야 합니다.) */
DISE.companies = {

  disehimedia: {
    nameKr: '다이즈하이미디어',
    nameEn: 'DISEHIMEDIA',
    logoMark: 'disehimedia/disehimedia-mark.svg',
    logoRatio: 180 / 100,
    addressKr: '인천광역시 부평구 백범로 577번길 20',
    phoneIntl: '+82-32-573-3114',      // 해외에서 걸 때
    phoneDomestic: '032-573-3114',      // 국내에서 걸 때
    email: 'hidise@disehimedia.com',
    website: 'www.disehimedia.com'
  },

  r2v: {
    nameKr: 'R2V',                       // TODO: 정식 한글 표기 확정되면 교체
    nameEn: 'R2V',
    logoMark: 'r2v/r2v-mark.svg',                  // 단색 · mask 기법용
    logoMarkGradient: 'r2v/r2v-mark-gradient.svg', // 그라데이션 원본 · 색 고정 용도
    logoRatio: 200 / 108
    // TODO: 주소·전화·이메일 확정되면 disehimedia 항목과 동일한 형식으로 추가
  },

  bic: {
    nameKr: 'BIC',                       // TODO: 정식 한글 표기 확정되면 교체
    nameEn: 'BIC',
    logoMark: 'bic/bic-mark.svg',
    logoRatio: 200 / 68
    // TODO: 주소·전화·이메일 확정되면 추가
  },

  'axis-one': {
    nameKr: 'AXIS ONE',                  // TODO: 정식 한글 표기 확정되면 교체
    nameEn: 'AXIS ONE',
    logoMark: 'axis-one/axis-one-mark.svg',
    logoRatio: 108 / 108
    // TODO: 주소·전화·이메일 확정되면 추가
  }
};

/* 공문 등에서 쓰는 기본 발신인 값(다이즈하이미디어 기준) — 문서마다 다른
   담당자로 바꿔야 하면 각 템플릿의 서명란 마크업에서 직접 수정하면
   됩니다(이 값은 "기본값" 참고용입니다). */
DISE.defaultSender = {
  nameKr: '유정우',
  nameEn: 'You, Jeong-woo | Ryan',
  title: '대표이사',
  phone: '032-573-3114',
  email: 'ryan@disehimedia.com'
};

/* 문서번호 체계: 다이즈-YYYY-순번 (예: 다이즈-2026-001) */
DISE.docNumberPrefix = '다이즈';
