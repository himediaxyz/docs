# dise-docs — 다이즈하이미디어 공식 문서 시스템

브라우저에서 바로 열람·입력·인쇄할 수 있는 다이즈하이미디어 사내 공식 문서 템플릿 모음입니다. GitHub Pages로 배포되어 링크만으로 접근할 수 있습니다.

## 폴더 구조

```
dise-docs/
├── index.html              # 전체 템플릿 목록(포털) 페이지
├── templates/               # 실제 배포되는 문서 템플릿들
│   └── gongmun/
│       └── index.html       # 공문(대외 발송용) 템플릿 — shared/ 조각을 불러 씀
├── shared/                  # 여러 템플릿이 공유하는 조각 (자세한 설명은 shared/README.md)
│   ├── styles/               # variables / document / editable / toolbar / site / print
│   ├── scripts/               # company-info / components / editor / pagination
│   └── assets/                # logos/{계열사}/{계열사}-mark.svg (규칙은 assets/logos/README.md)
└── docs/
    └── guide/                # 제작 설정 노트 & 시스템 기획안 (내부 참고용, 저장소에서만 확인)
        ├── 공식문서_제작설정.md
        └── 다이즈_공식문서_시스템_기획안.md
```

## 용어: "사이트"와 "문서"는 다릅니다

헤더/푸터가 화면 전용 **사이트** 헤더·푸터(`#siteHeader`/`#siteFooter`, 인쇄 안 됨)와, 실제 레터헤드인 **문서** 헤더·푸터(`#docHeader`/`#docFooter`, 인쇄됨, 계열사별로 다름) 두 종류로 나뉩니다. 새 템플릿을 만들 때 헷갈리지 않도록 자세한 기준은 `shared/README.md`를 먼저 읽어보세요.

## 새 템플릿을 추가하려면

1. `templates/` 아래 새 폴더를 만들고 (예: `templates/report/`) 그 안에 `index.html`을 넣습니다.
2. `<head>`에 `shared/styles/`의 6개 CSS를, `<body>` 하단에 `shared/scripts/`의 JS를 `templates/gongmun/index.html`과 같은 순서로 링크합니다(상대 경로 개수만 폴더 깊이에 맞게 조정).
3. 화면 전용 자리에 `id="siteHeader"` / `id="siteFooter"`를, 종이(표) 자리에 `id="docHeader"` / `id="docFooter"`를 두고 `DISE.components.renderSiteHeader/renderSiteFooter/renderDocHeader/renderDocFooter`를 호출하면 로고·회사 정보가 자동으로 채워집니다. `renderDocHeader`/`renderDocFooter`에는 `company` 옵션으로 어느 계열사인지 넘겨줍니다(`DISE.companies`의 key).
4. 루트 `index.html`의 카드 목록에 새 항목을 추가합니다.
5. 커밋 후 `main` 브랜치에 푸시하면 자동으로 배포됩니다.

각 CSS/JS 파일 상단에 무엇을 담당하는지, 어디서 어떻게 쓰는지 주석으로 설명해뒀으니 수정 전에 먼저 읽어보시면 됩니다.

## 배포

Settings → Pages에서 `main` 브랜치 / `root` 폴더로 배포하도록 설정되어 있습니다. 푸시할 때마다 1분 내외로 자동 반영됩니다.

## 인쇄 시 주의사항

각 템플릿에서 인쇄(Ctrl+P) 시 브라우저 인쇄 대화상자에서 **"배경 그래픽" 옵션을 켜야** 헤더/푸터의 네이비 배경색이 정상적으로 인쇄됩니다.
