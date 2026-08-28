/* ============================================================
   sender-info.js
   회사(계열사)별 "발신인" 후보 목록 — 문서 상단 도구모음의 발신인
   드롭다운(shared/scripts/editor.js 섹션 12)이 이 목록을 그대로 읽어
   보여주고, 고르면 문서 하단 서명란(.sign-block)의 이름·직함·연락처를
   그 사람 정보로 바꿔치기합니다.

   본문 내용과는 무관하게 바뀌는 정보라 문서 양식 전환과 달리 확인창
   없이 바로 바뀝니다.

   ★ company-info.js에 있던 DISE.defaultSender(다이즈하이미디어 대표
   발신인 1명만 담던 값)를 이 파일의 구조로 옮겼습니다 — 회사마다
   발신인이 여러 명일 수 있어 배열로 관리합니다.

   id: 드롭다운에서 어떤 항목을 선택했는지 구분하는 값 — 같은 회사
   안에서만 겹치지 않으면 됩니다.

   지금은 이 배열을 직접 손으로 고쳐서 추가/수정/삭제하지만, 이후
   "발신인 관리" 페이지가 생기면 그 페이지가 이 파일과 같은 형식의
   코드를 만들어주고, 지금처럼 파일로 받아 git 커밋하는 식으로
   이어집니다(관리 페이지 자체가 서버에 저장하지는 않습니다 — 이
   사이트는 서버/DB가 없는 순수 정적 사이트이기 때문입니다).

   이 파일을 쓰는 곳: 사용자가 직접 입력하는 문서 템플릿(company-info.js
   다음, editor.js보다는 먼저 불러오면 됩니다)
     <script src="../../shared/scripts/sender-info.js"></script>
   ============================================================ */

window.DISE = window.DISE || {};

DISE.senders = {

  disehimedia: [
    {
      // "발신인"이 특정 개인이 아니라 회사 자체인 경우(회사 공식 명의
      // 발송) — nameEn이 정확히 'DISEHIMEDIA'이면 서명란에 표시될 때
      // components.js의 diseWordmarkHTML()이 자동으로 DISE(가장 굵게)
      // /HI(중간 굵기)/MEDIA(얇게) 세 부분으로 나눠서 그려줍니다(문서
      // 헤더 로고 옆 브랜드명과 같은 처리 — shared/styles/document.css의
      // .dise-wordmark 참고). title을 비워두지 않고 '회사 공식 발신'을
      // 넣은 이유 두 가지: (1) 발신인 드롭다운에서 다른 사람 항목들은
      // 직함이 뱃지로 붙어 한 줄 높이가 더 큰데, 이 항목만 비어있으면
      // 목록에서 유독 낮아 보여서(요청: "높이를 맞추면 좋겠다") 맞춰주는
      // 용도. (2) 실제 서명란에도 그대로 찍혀서, 개인 직함 대신 "회사
      // 명의로 보낸다"는 뜻을 분명히 밝혀줍니다.
      id: 'disehimedia-official',
      nameKr: '다이즈하이미디어',
      nameEn: 'DISEHIMEDIA',
      title: '회사 공식 발신',
      phone: '032-573-3114',
      email: 'hidise@disehimedia.com'
    },
    {
      // title 표기 규칙(2026-08-28): "한글 직함(여러 개면 / 로 구분) |
      // 영문 직함(여러 개면 / 로 구분)" — 유정우 대표님은 대표이사·회장
      // 두 직함을 함께 쓰셔서 "대표이사 / 회장 | CEO / Chairman"이
      // 됩니다.
      //
      // isDefault: 새 문서를 처음 열었을 때 서명란/발신인 버튼에 미리
      // 채워져 있을 발신인을 표시합니다. 배열 순서(드롭다운에 뜨는
      // 순서 — "회사 공식"을 맨 위에 두고 싶어서 0번)와는 다른
      // 개념이라 따로 표시합니다 — 이 표시가 없으면
      // shared/scripts/components.js의 renderEditorUI()가 배열의 0번을
      // 기본값으로 쓰는데, 그러면 문서 상단 버튼엔 "다이즈하이미디어"가
      // 뜨면서 정작 서명란(templates/*/index.html에 미리 써둔 초기
      // 내용)은 유정우로 남아 서로 어긋납니다. 이 표시가 붙은 사람이
      // 곧 각 템플릿 파일의 서명란 초기 내용과 같아야 합니다.
      id: 'yoo-jeongwoo',
      nameKr: '유정우',
      nameEn: 'You, Jeong-woo | Ryan',
      title: '대표이사 / 회장 | CEO / Chairman',
      phone: '010-2711-4722',
      email: 'ryan@disehimedia.com',
      isDefault: true
    },
    {
      id: 'won-jongil',
      nameKr: '원종일',
      nameEn: 'Won, Jong il | Jason',
      title: '대표이사 | CEO',
      phone: '010-5171-8279',
      email: 'toyawon@disehimedia.com'
    },
    {
      id: 'lee-sungjin',
      nameKr: '이성진',
      nameEn: 'Lee, Sung jin | Kai',
      title: '재무 부대표 | CFO',
      phone: '010-6208-6717',
      email: 'kai@disehimedia.com'
    }
    // 담당자가 늘어나면 같은 형식으로 추가
  ]

  // r2v / bic / axis-one: 발신인 정보 확정되면 disehimedia와 동일한
  // 형식으로 키를 추가
};
