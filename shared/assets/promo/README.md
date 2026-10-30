# promo — 판촉물 발주 파일 (2026-10-30)

포털 > 디자인 양식 > 판촉물 발주 (`templates/promo/?company=`)에서 내려받는 AI 원본 파일을 두는 곳입니다.

| 회사 | 폴더 | 파일 이름(그대로 저장) |
|---|---|---|
| 다이즈하이미디어 | `disehimedia/` | `envelope-large.ai`(대봉투), `envelope-small.ai`(소봉투), `pp-holder.ai`(PP홀더), 사각 포스트잇 3개 — `post-it-pad.ai`(내지), `post-it-cover-out.ai`(커버 겉), `post-it-cover-in.ai`(커버 안) |
| R2V | `r2v/` | `envelope-large.ai`(대봉투), `envelope-small.ai`(소봉투) |

- 정해진 이름으로 넣으면 설정 수정 없이 다운로드 버튼이 켜집니다(없으면 "준비 중").
- 미리보기 이미지를 넣으려면 같은 폴더에 PNG를 두고 `company-info.js`의 `promoItems` 항목에 `thumb: '{회사}/파일명.png'`를 추가합니다.
- 한 항목에 파일이 여러 개면 `files: [{ label, file }, ...]`로 등록합니다(예: 포스트잇).
- 항목을 늘리거나 다른 회사에 추가하려면 `company-info.js`의 해당 회사 `promoItems`에 `{ key, title, file }`를 추가합니다.
- GitHub는 파일 하나당 100MB까지 올릴 수 있습니다(50MB 넘으면 경고). AI 저장 시 "PDF 호환 파일 만들기"를 끄면 용량이 줄어듭니다.
