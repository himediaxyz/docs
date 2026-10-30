# promo — 판촉물 발주 파일 (2026-10-30)

포털 > 디자인 양식 > 판촉물 발주 (`templates/promo/?company=`)에서 내려받는 AI 원본 파일을 두는 곳입니다.

| 회사 | 폴더 | 파일 이름(그대로 저장) |
|---|---|---|
| 다이즈하이미디어 | `disehimedia/` | `envelope-large.ai`(대봉투), `envelope-small.ai`(소봉투), `pp-holder.ai`(PP홀더), 사각 포스트잇 3개 — `post-it-pad.ai`(내지), `post-it-cover-out.ai`(커버 겉), `post-it-cover-in.ai`(커버 안) |
| R2V | `r2v/` | `envelope-large.ai`(대봉투), `envelope-small.ai`(소봉투) |

- 정해진 이름으로 넣으면 설정 수정 없이 다운로드 버튼이 켜집니다(없으면 "준비 중").
- **미리보기 사진**: 같은 폴더에 `{항목 key}.jpg`로 넣으면 자동 표시(없으면 아이콘).
  - 이름: `envelope-large.jpg`, `envelope-small.jpg`, `pp-holder.jpg`, `post-it.jpg`(포스트잇은 사진 1장)
  - 규격(통일): **1200 × 900px(가로 4:3) JPG**, sRGB, 품질 80% 안팎, 1장 300KB 이하
  - 촬영/연출: 모든 사진 같은 배경(연회색 #F2F3F6 또는 흰색 무지), 같은 각도(정면 또는 45°)·같은 조명, 제품을 가운데에 두고 상하좌우 여백 10% 이상(화면에서 가장자리가 조금 잘릴 수 있음)
  - 다른 이름을 쓰려면 `company-info.js`의 해당 항목에 `thumb: '{회사}/파일명.jpg'` 추가
- 한 항목에 파일이 여러 개면 `files: [{ label, file }, ...]`로 등록합니다(예: 포스트잇).
- 항목을 늘리거나 다른 회사에 추가하려면 `company-info.js`의 해당 회사 `promoItems`에 `{ key, title, file }`를 추가합니다.
- GitHub는 파일 하나당 100MB까지 올릴 수 있습니다(50MB 넘으면 경고). AI 저장 시 "PDF 호환 파일 만들기"를 끄면 용량이 줄어듭니다.
