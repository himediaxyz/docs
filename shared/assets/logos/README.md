# logos — 계열사 로고 규칙

## 폴더/파일 이름 규칙

```
logos/{계열사-slug}/{계열사-slug}-mark.svg            단색(검정 채우기, 배경 투명, 외곽선 없음) — CSS mask로 색을 바꿔 씀
logos/{계열사-slug}/{계열사-slug}-mark-gradient.svg   그라데이션 등 원색 그대로 써야 하는 버전 (있는 계열사만)
```

- `{계열사-slug}` 폴더명은 `shared/scripts/company-info.js`의 `DISE.companies` key와 반드시 동일해야 합니다.
- 파일명은 영문 소문자 + 하이픈만 사용합니다.
- `{계열사-slug}-mark-color.svg`: 단색 원본에 계열사 원색을 칠한 문서용 로고(현재 BIC — BIC그린 다크 #1B3728). 문서 헤더에 어떤 로고를 쓸지는 `company-info.js`의 `docLogo`/`docLogoScale`로 정합니다(R2V는 `-mark-gradient.svg`, BIC는 `-mark-color.svg`, 나머지는 검정 `-mark.svg`).
- `-mark.svg`는 항상 있어야 하는 필수 파일입니다. `-mark-gradient.svg`는 브랜드 컬러가 그라데이션인 계열사에만 추가합니다(현재는 R2V만 해당).
- SVG 준비 방법(일러스트레이터 내보내기 설정 포함)은 이 대화에서 안내드린 내용을 따르면 됩니다: 채우기 검정 단색 · 배경 투명 · 외곽선 없음 · 텍스트는 윤곽선으로 변환.

## 현재 상태

| 계열사 | mark.svg | mark-gradient.svg | 문서 템플릿에 연결됨 |
|---|---|---|---|
| disehimedia | ✅ | — | ✅ (공문) |
| r2v | ✅ | ✅ | ⬜ |
| bic | ✅ | — (`bic-mark-color.svg` 있음) | ⬜ |
| axis-one | ✅ | — | ⬜ |

"문서 템플릿에 연결됨"이 ⬜인 계열사는 로고는 준비됐지만 아직 `company-info.js`에 주소·연락처 정보가 없어서 문서 푸터를 완성할 수 없는 상태입니다 — 정보가 확정되면 `company-info.js`의 해당 계열사 항목에 채워 넣고 새 템플릿(또는 기존 템플릿의 `company` 옵션)에 연결하면 됩니다.

## 새 계열사가 추가되면

1. 이 규칙대로 `logos/{새-slug}/{새-slug}-mark.svg`를 추가합니다(폴더가 비어 있으면 이 규칙에 맞는 파일이 아직 없다는 뜻입니다).
2. `shared/scripts/company-info.js`의 `DISE.companies`에 항목을 추가합니다(로고 경로, `logoRatio`, 주소·연락처).
3. 위 표에 행을 추가합니다.

## 로고 다운로드 파일 (2026-10-28, 포털 > 디자인 양식 > 회사 로고)

```
logos/{slug}/download/{slug}-color.png|jpg   컬러(docLogo가 있는 회사만)
logos/{slug}/download/{slug}-black.png|jpg   검정 단색
logos/{slug}/download/{slug}-white.png       흰색 단색(투명 배경)
```
- 긴 변 약 2,000px, PNG는 투명 배경, JPG는 흰 배경. SVG에서 만든 파일이라 SVG를 바꾸면 다시 만들어야 합니다.
- AI(일러스트레이터) 원본은 `logos/{slug}/` 에 넣고 `company-info.js`의 해당 회사에 `logoAi: '{slug}/파일명.ai'` 한 줄을 추가하면 다운로드 버튼이 켜집니다.

## 새 회사 추가 체크리스트 (예: HRA, 창업지장 신숭겸 장학재단)
1. `company-info.js` — `DISE.companies`에 항목 추가(key·국문/영문명·badgeColor·주소/연락처·docNoPrefix 등). 로고가 없어도 포털 카드는 회사명 글자로 표시됩니다.
2. 로고 — `logos/{key}/{key}-mark.svg`(+ 컬러 `docLogo`) 추가, `download/` 이미지 생성, AI 원본 등록.
3. 레터헤드 디자인 — `shared/styles/letterhead-companies.css`에 `body.lh[data-company="{key}"]` 규칙(없으면 기본 무채색 레터헤드).
4. 표 색 — `document.css`의 `body[data-company="{key}"]` 변수(없으면 기본 블루그레이).
5. 계약서(필요 시) — `shared/scripts/contracts/{key}.js` + script 한 줄.
6. 프리젠테이션 양식 — `shared/assets/presentations/{key}/`에 파일, `company-info.js`에 `pptTemplates` 등록.
포털의 레터헤드·송장·견적서·로고·프리젠테이션 항목은 1번만 하면 자동으로 생깁니다.
