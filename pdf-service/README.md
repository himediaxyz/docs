# dise-docs-pdf-service — 서버사이드 PDF 생성 API

`window.print()`가 iOS/macOS 등 기기마다 다르게 인쇄되는 문제(자세한 배경은 클로드 프로젝트의 "인쇄레이아웃_OS편차_이슈" 노트, 그리고 `shared/scripts/pagination.js` · `shared/styles/print.css` 상단 주석 참고)를 근본적으로 없애기 위한 서버사이드 PDF 생성 API입니다. 항상 같은 Linux 서버의 헤드리스 Chromium으로 렌더링하므로, 요청한 사람의 OS·브라우저가 무엇이든 결과가 항상 동일합니다.

이 폴더는 **메인 사이트(GitHub Pages)와 완전히 분리된 별도 배포 단위**입니다 — dise-docs 저장소 안에 있지만, GitHub Pages는 이 폴더가 있어도 그냥 정적 파일로 취급할 뿐 실행하지 않습니다. 실제로는 이 폴더만 별도로 Vercel에 배포합니다.

## 배포 방법 (Vercel, 최초 1회)

1. [vercel.com](https://vercel.com)에 GitHub 계정으로 로그인합니다.
2. "Add New… → Project"에서 `himediaxyz/docs` 저장소를 가져옵니다(Import).
3. **Root Directory**를 반드시 `pdf-service`로 지정합니다 — 저장소 전체가 아니라 이 폴더만 배포 대상이 되어야 합니다(그래야 메인 사이트 정적 파일과 섞이지 않습니다).
4. Framework Preset은 "Other"로 두면 됩니다(Next.js 등 프레임워크가 아니라 `api/` 폴더의 순수 서버리스 함수이므로).
5. Deploy를 누르면 몇 분 안에 `https://<프로젝트이름>.vercel.app` 형태의 주소가 생깁니다. 실제 API 주소는 그 뒤에 `/api/generate-pdf`를 붙인 것입니다.
   예: `https://dise-docs-pdf.vercel.app/api/generate-pdf`
6. 그 이후로는 `main` 브랜치에서 이 `pdf-service/` 폴더에 변경이 생길 때마다 Vercel이 자동으로 다시 배포합니다(GitHub Pages와 같은 방식).

## 배포한 주소를 사이트에 연결하기

각 템플릿(`templates/*/index.html`)의 `<script>` 블록에 있는 다음 줄을 배포한 주소로 바꿔주세요:

```js
window.DISE_PDF_API_URL = 'https://dise-docs-pdf.vercel.app/api/generate-pdf';
```

비워두면(`''`) "서버 PDF 다운로드" 버튼 자체가 화면에 나타나지 않고, 기존 "인쇄 / PDF로 저장" 버튼만 보입니다. 새 템플릿을 추가할 때도 이 한 줄만 넣으면 그 템플릿에서도 바로 쓸 수 있습니다.

## 다른 출처(도메인)에서도 쓰려면

`api/generate-pdf.js` 상단의 `ALLOWED_ORIGINS` 배열에 그 출처를 추가해야 합니다(CORS). 기본값은 `https://himediaxyz.github.io`만 허용합니다.

## 로컬에서 확인하기

```bash
cd pdf-service
npm install
npx vercel dev
```

`npx vercel dev`가 `http://localhost:3000/api/generate-pdf`로 로컬 서버를 띄웁니다. 템플릿의 `window.DISE_PDF_API_URL`을 잠깐 이 주소로 바꿔서 테스트할 수 있습니다(테스트 후 다시 되돌리는 것 잊지 마세요 — 로컬 주소를 커밋해서 배포하면 실제 사용자 브라우저에서는 당연히 접속이 안 됩니다).

## 알려진 제약

- **요청 용량 제한(약 4.5MB)**: Vercel 서버리스 함수는 플랫폼 자체적으로 요청 본문 크기에 제한이 있습니다. `shared/scripts/editor.js`가 삽입한 이미지를 base64로 문서 안에 통째로 내장하는 방식이라, 큰 이미지를 여러 장 넣으면 이 한도를 넘어 요청이 거부될 수 있습니다(안내 메시지 없이 네트워크 오류처럼 보일 수 있음 — `pdf-export.js`가 실패 시 "인쇄 / PDF로 저장"을 대신 안내합니다). 이미지를 적당히 축소해서 삽입하는 것을 권장하며, 근본적으로 해결하려면 `editor.js`의 이미지 삽입 단계에 자동 축소(canvas 리사이즈)를 추가하는 것을 고려해 보세요.
- **콜드 스타트**: 한동안 요청이 없다가 처음 호출하면 헤드리스 Chromium을 새로 띄우느라 몇 초 더 걸릴 수 있습니다(`vercel.json`에 memory 1536MB / maxDuration 60초로 여유를 둬서 타임아웃 자체는 나지 않게 해뒀습니다).
- **Vercel 무료 요금제(Hobby) 사용량**: 사내 소수 인원이 가끔 쓰는 용도라면 무료 요금제로 충분할 가능성이 높지만, 사용량이 늘면 Vercel 대시보드에서 함수 실행 시간/횟수를 확인해 보세요.

## 이 방식을 선택한 이유(설계 메모)

서버가 받는 HTML은 클라이언트가 지금 화면에 띄워 둔 문서의 `outerHTML`을 그대로 보낸 것입니다 — 즉 PDF 전용 레이아웃 코드를 새로 만든 게 아니라, `company-info.js`/`components.js`/`pagination.js` 등 이 사이트가 이미 쓰는 코드를 헤드리스 브라우저에서 그대로 다시 실행할 뿐입니다. 그래서 "화면에서 보던 것과 서버 PDF가 다르다"는 불일치가 구조적으로 생기지 않고, 새 템플릿을 추가하거나 기존 템플릿의 레이아웃을 바꿔도 이 API 쪽 코드는 전혀 손댈 필요가 없습니다.
