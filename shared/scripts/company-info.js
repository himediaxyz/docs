/* ============================================================
   company-info.js
   회사 공통 정보를 담아두는 단일 저장소.

   ★ 주소, 전화번호, 이메일 등이 바뀌면 이 파일 하나만 고치면
     모든 문서 템플릿의 푸터·헤더에 자동으로 반영됩니다.
     (components.js의 renderHeader()/renderFooter()가 이 값을 읽어서
     화면에 그립니다.)

   이 파일을 쓰는 곳: 모든 문서 템플릿 — company-info.js를 먼저 불러온
   뒤에 components.js를 불러와야 합니다.
     <script src="../../shared/scripts/company-info.js"></script>
   ============================================================ */

window.DISE = window.DISE || {};

DISE.company = {
  nameKr: '다이즈하이미디어',
  nameEn: 'DISEHIMEDIA',
  addressKr: '인천광역시 부평구 백범로 577번길 20',
  phoneIntl: '+82-32-573-3114',      // 해외에서 걸 때
  phoneDomestic: '032-573-3114',      // 국내에서 걸 때
  email: 'hidise@disehimedia.com',
  website: 'www.disehimedia.com'
};

/* 공문 등에서 쓰는 기본 발신인 값 — 문서마다 다른 담당자로 바꿔야 하면
   각 템플릿의 서명란 마크업에서 직접 수정하면 됩니다(이 값은 "기본값"
   참고용입니다). */
DISE.defaultSender = {
  nameKr: '유정우',
  nameEn: 'You, Jeong-woo | Ryan',
  title: '대표이사',
  phone: '032-573-3114',
  email: 'ryan@disehimedia.com'
};

/* 문서번호 체계: 다이즈-YYYY-순번 (예: 다이즈-2026-001) */
DISE.docNumberPrefix = '다이즈';
