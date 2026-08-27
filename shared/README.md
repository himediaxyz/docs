# shared

여러 문서 템플릿이 공통으로 쓰는 조각을 모아둔 폴더입니다. 색상·폰트·로고·주소가 바뀌면 여기 파일만 고치면 모든 템플릿에 한번에 반영됩니다.

## 용어: "사이트" vs "문서"

이 시스템 전체에서 헤더/푸터는 두 종류로 나뉩니다. 새 컴포넌트를 만들거나 기존 걸 수정할 때 헷갈리지 않도록 먼저 정리합니다.

| | 사이트 (site) | 문서 (document) |
|---|---|---|
| 정체 | 이 도구(웹페이지) 자체의 UI | 실제 공식 문서(레터헤드) 그 자체 |
| 인쇄 여부 | 화면에만 보임, **인쇄 안 됨** | **인쇄/PDF에 그대로 나감** |
| 계열사별 차이 | 없음 — 모든 페이지 공통 | 있음 — 로고·주소가 계열사마다 다름 |
| 예시 | 포털로 돌아가는 상단 바, 화면 하단 캡션 | 종이 상단 로고 밴드, 종이 하단 주소 밴드 |
| 자리 id | `#siteHeader`, `#siteFooter` | `#docHeader`, `#docFooter` |
| CSS 클래스 | `.site-header-bar`, `.site-footer-text` (site.css) | `.doc-header-band`, `.doc-footer-band` (document.css) |
| 렌더 함수 | `renderSiteHeader()`, `renderSiteFooter()` | `renderDocHeader()`, `renderDocFooter()` |

즉 한 페이지에 헤더가 2개, 푸터가 2개 있는 셈입니다 — 사이트 헤더는 `.sheet`(종이) 바깥의 화면 전용 영역에, 문서 헤더는 `.sheet` 안쪽 `<thead>`에 위치합니다.

## styles/

각 파일 상단에 담당 범위와 사용법 주석이 있습니다. 템플릿의 `<head>`에서 이 순서대로 링크합니다.

| 파일 | 담당 |
|---|---|
| `variables.css` | 색상·폰트 변수, 인쇄 배경색 유지, 기본 리셋 |
| `document.css` | **문서** 레벨 — A4 종이·표 구조, 문서 헤더/푸터 밴드, 제목·본문·서명란 |
| `editable.css` | contenteditable 입력 필드, 예상 페이지 구분선 |
| `toolbar.css` | 화면 전용 안내 카드 + 서식 도구모음 UI |
| `site.css` | **사이트** 레벨 — 포털 링크 상단 바, 화면 하단 캡션 |
| `print.css` | 인쇄 전용 규칙 (항상 마지막에 링크) |

## scripts/

템플릿의 `<body>` 하단에서 이 순서대로 불러옵니다.

| 파일 | 담당 |
|---|---|
| `company-info.js` | `DISE.site`(사이트 이름) + `DISE.companies`(계열사별 로고·주소·연락처) — 가장 먼저 로드 |
| `components.js` | `renderSiteHeader/Footer`, `renderDocHeader/Footer` 네 함수 — 각각 `#siteHeader`/`#siteFooter`/`#docHeader`/`#docFooter`에 렌더링 |
| `editor.js` | 서식 도구모음(굵게/기울임/밑줄/서체/크기), placeholder 자동 선택 |
| `pagination.js` | A4 페이지 높이 계산, 예상 페이지 구분선 표시 |

## assets/

`logos/{계열사-slug}/` 아래에 계열사별 로고 SVG가 들어갑니다. 이름 규칙과 현재 준비 상태는 `assets/logos/README.md`를 참고하세요.
