# 아이콘 (shared/assets/icons/)

서식 도구모음 버튼에 쓰는 UI 아이콘입니다. 로고(`shared/assets/logos/`)와는
성격이 다릅니다 — 로고는 계열사마다 고정된 브랜드 색이 있지만, 이 아이콘들은
버튼 상태(기본/호버/활성)에 따라 색이 계속 바뀌어야 하므로 별도 폴더로
분리했습니다.

## 이름 규칙

`{기능명}.svg` — 케밥 케이스, 버튼의 기능을 그대로 이름으로 씁니다.

| 파일 | 용도 |
|---|---|
| `bold.svg` | 굵게 |
| `italic.svg` | 기울임 |
| `underline.svg` | 밑줄 |
| `align-left.svg` | 왼쪽 정렬 |
| `align-center.svg` | 가운데 정렬 |
| `align-right.svg` | 오른쪽 정렬 |
| `align-justify.svg` | 양쪽 정렬 |
| `list-bullet.svg` | 점 목록 |
| `list-numbered.svg` | 번호 목록 |
| `indent.svg` | 들여쓰기 |
| `outdent.svg` | 내어쓰기 |

## 기술 방식: CSS mask (로고와 동일한 기법)

`<img>`가 아니라 버튼의 `background-color: currentColor` + `mask-image`로
그립니다. 이렇게 하면 버튼 글자색(`color`)이 호버/활성 상태에서 바뀔 때
아이콘 색도 자동으로 따라 바뀝니다 — 상태별 아이콘을 따로 만들 필요가
없습니다. 실제 CSS는 `shared/styles/toolbar.css`의 `.btn-icon` /
`.icon-*` 규칙을 참고하세요.

## 새 아이콘을 추가하려면

1. 24×24 뷰박스, `stroke="#000"` (또는 `fill="#000"`), 배경 투명, 다른
   색은 넣지 마세요 — mask는 모양(알파값)만 읽고, 실제 보이는 색은
   버튼이 결정합니다.
2. 이 폴더에 `{기능명}.svg`로 저장.
3. `toolbar.css`에 `.icon-{기능명}{mask-image:url(../assets/icons/{기능명}.svg);...}`
   한 줄 추가.
4. 버튼 안에 `<span class="btn-icon icon-{기능명}"></span>` 배치.
