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
  nameKr: '다이즈하이미디어 그룹 공식 문서 시스템'
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
   업데이트해야 합니다.)

   badgeColor: index.html 포털 페이지의 원형 배지(그룹사 선택 버튼)
   배경색 — 각 계열사 "메인 컬러"입니다. BIC는 다크/미드/라이트 3단계 중
   지정이 없어 중간 톤(미드, #428363)을 메인 컬러로 사용했습니다. 다른
   톤을 메인으로 쓰기로 하면 이 값만 바꾸면 됩니다.

   docLogo / docLogoScale (2026-10-23): 공식 문서(레터헤드·송장 등) 헤더에
   쓰는 로고. theme-mono는 원래 모든 계열사 로고를 검정 단색으로 썼는데,
   R2V는 그라데이션 원색, BIC는 BIC그린 다크 원색으로 쓰기로 결정했습니다.
     docLogo      — 문서용 컬러 로고 파일. 있으면 logoMark(단색) 대신
                    이 파일을 색 필터 없이 원본 그대로 씁니다. 없으면
                    기존대로 logoMark(검정).
     docLogoScale — 문서 헤더 로고 높이 배율(기본 1 = 56px). BIC 로고는
                    가로로 넓어 같은 높이면 커 보여서 줄였습니다.
   포털(index.html)의 계열사 카드는 배지색 위 단색 로고 그대로입니다.

   docNoPrefix / lhShowName (2026-10-23, 계열사 레터헤드):
     docNoPrefix — 레터헤드 문서번호 예시 접두사(예: R2V-2026-001).
     lhShowName  — 레터헤드 헤더 오른쪽에 회사명(영문/국문)을 함께 표시.
   계열사별 레터헤드 디자인 자체는 shared/styles/letterhead-companies.css
   참고(R2V B안·BIC B안·AXIS ONE C안). */
DISE.companies = {

  disehimedia: {
    nameKr: '다이즈하이미디어',
    nameEn: 'DISEHIMEDIA',
    logoMark: 'disehimedia/disehimedia-mark.svg',
    logoRatio: 180 / 100,
    badgeColor: '#212B43',              // 다이즈블루
    addressKr: '인천광역시 부평구 백범로577번길 20, 724, 725, 751호 (경인센타, 공장동)',
    // 좁은 칸(견적서 공급자 표, 계약서 서명란)에서 줄을 나눌 위치 — 문서 하단
    // 푸터처럼 넓은 곳은 위 addressKr 한 줄 그대로 씁니다(2026-10-23).
    addressKrLines: ['인천광역시 부평구 백범로577번길 20,', '724, 725, 751호 (경인센타, 공장동)'],
    // 영문 문서(예: templates/gongmun "레터헤드 (영문)")의 푸터에서만
    // 씁니다 — shared/scripts/components.js의 renderDocFooter({lang:'en'})
    // 참고. 없으면 자동으로 addressKr로 대체됩니다.
    addressEn: '20 Baekbeom-ro 577beon-gil, Bupyeong-gu, Incheon, Republic of Korea (Rm. 724, 725, 751, Gyeongin Center, Factory Bldg.)',
    phoneIntl: '+82-32-573-3114',      // 해외에서 걸 때
    phoneDomestic: '032-573-3114',      // 국내에서 걸 때
    email: 'hidise@disehimedia.com',
    website: 'www.disehimedia.com',
    // 판촉물 발주 파일(디자인 양식 > 판촉물 발주, 2026-10-30) — AI 원본은
    // shared/assets/promo/{회사}/ 에 아래 file 이름 그대로 넣으면 다운로드가
    // 켜집니다(파일이 없으면 "준비 중"). thumb(선택)는 미리보기 이미지.
    // 파일이 여러 개면 file 대신 files: [{ label, file }, ...].
    promoItems: [
      { key: 'envelope-large', title: '대봉투', file: 'disehimedia/envelope-large.ai' },
      { key: 'envelope-small', title: '소봉투', file: 'disehimedia/envelope-small.ai' },
      { key: 'pp-holder', title: 'PP홀더', file: 'disehimedia/pp-holder.ai' },
      // 파일이 여러 개인 항목은 files 배열(label별 버튼)
      { key: 'post-it', title: '사각 포스트잇', files: [
        { label: '내지', file: 'disehimedia/post-it-pad.ai' },
        { label: '커버(겉)', file: 'disehimedia/post-it-cover-out.ai' },
        { label: '커버(안)', file: 'disehimedia/post-it-cover-in.ai' }
      ] }
    ]
  },

  r2v: {
    nameKr: '알투뷔',
    nameEn: 'R2V',
    logoMark: 'r2v/r2v-mark.svg',                  // 단색 · mask 기법용
    logoMarkGradient: 'r2v/r2v-mark-gradient.svg', // 그라데이션 원본 · 색 고정 용도
    docLogo: 'r2v/r2v-mark-gradient.svg',          // 문서 헤더: 그라데이션 원색
    docNoPrefix: 'R2V',
    lhShowName: true,                              // 레터헤드 B안: 로고 오른쪽에 R2V / 알투뷔
    promoItems: [                                  // 판촉물 발주 파일(위 disehimedia 설명 참고)
      { key: 'envelope-large', title: '대봉투', file: 'r2v/envelope-large.ai' },
      { key: 'envelope-small', title: '소봉투', file: 'r2v/envelope-small.ai' }
    ],
    logoRatio: 200 / 108,
    badgeColor: '#DA4F1E'                // R2V오렌지
    // TODO: 주소·전화·이메일 확정되면 disehimedia 항목과 동일한 형식으로 추가
  },

  bic: {
    nameKr: '비아이씨',
    nameEn: 'BIC',
    logoMark: 'bic/bic-mark.svg',
    docLogo: 'bic/bic-mark-color.svg',   // 문서 헤더: BIC그린 다크(#1B3728)
    docLogoScale: 0.65,                  // 문서 헤더 로고 56px → 약 36px
    docNoPrefix: 'BIC',
    logoRatio: 200 / 68,
    badgeColor: '#428363'                // BIC그린 미드(메인 톤으로 사용)
    // TODO: 주소·전화·이메일 확정되면 추가
  },

  'axis-one': {
    nameKr: '엑시스 원',
    nameEn: 'AXIS ONE',
    logoMark: 'axis-one/axis-one-mark.svg',
    docNoPrefix: 'AXIS',
    logoRatio: 108 / 108,
    badgeColor: '#180E1C'                // AXIS다크
    // TODO: 주소·전화·이메일 확정되면 추가
  }
};

/* 회사별 "발신인" 후보 목록(문서 상단 발신인 드롭다운용)은
   shared/scripts/sender-info.js(DISE.senders)로 옮겼습니다 — 회사마다
   발신인이 여러 명일 수 있어 이 파일과 분리했습니다. */

/* 문서번호 체계: 다이즈-YYYY-순번 (예: 다이즈-2026-001) */
DISE.docNumberPrefix = '다이즈';
