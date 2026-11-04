# Cloudflare 배포 안내 (로그인 · 직원 명부 · PDF)

github.io(공개 사이트)를 Cloudflare Worker로 옮기면서 다음이 추가됩니다. **Zero Trust·카드 등록 없이** 무료 요금제만 씁니다.

| 기능 | 설명 |
|---|---|
| 로그인 | 회사 메일(아이디) + 비밀번호. 비밀번호는 PBKDF2 해시로만 저장. 5번 틀리면 15분 잠금, 같은 IP에서 15분에 20번 넘게 틀리면 차단. 로그인 유지 12시간 |
| 직원 명부 (`/admin/`) | 관리자 전용. 직원 추가(임시 비밀번호 자동 발급)·수정, 비밀번호 초기화, 퇴사 처리(즉시 로그아웃·차단)·복직, 권한(관리자/일반), 발신인 표시, CSV 내보내기·가져오기, 작업 기록 |
| 첫 로그인 | 관리자가 준 임시 비밀번호로 로그인 → 새 비밀번호로 바꿔야 다음 화면으로 |
| 로그인 허용 도메인 | 1단계는 `disehimedia.com`만. 계열사는 관리자 페이지에서 도메인 추가. 도메인 삭제 시 그 도메인 직원 모두 차단 |
| 발신인 자동 반영 | 명부에서 "발신인"으로 표시한 직원이 레터헤드·계약서·견적서 발신인 목록에 나타남(`/api/senders.js`) |
| PDF | Vercel 대신 같은 사이트의 `/api/pdf`(Cloudflare Browser Rendering) |
| 송장·견적서 | 양식만 제공(구글 시트 연결 안 함) — 직접 입력해 작성 |

github.io 주소는 지금처럼 그대로 동작합니다(PDF는 Vercel, 송장은 시트). Cloudflare가 확인되면 github.io를 끄고 저장소를 비공개로 바꿉니다.

## 주소

- 운영: https://dise-docs.charlie-6fb.workers.dev
- 로그인 `/login` · 관리자 `/admin/` · 비밀번호 바꾸기 `/account/password` · 로그아웃 `/logout` · 초기 관리자 설정 `/setup`

## 파일

- `wrangler.jsonc` — Worker 설정(D1 `dise-docs`, Browser, `ADMIN_EMAILS`)
- `worker/index.js` — 로그인·API
- `migrations/` — DB 구조와 초기 데이터(다이즈 도메인, 관리자, 기존 발신인 3명, 비밀번호·세션)
- `admin/index.html` — 관리자 페이지
- `.assetsignore` — 사이트 파일로 올리지 않을 것(코드·설정·md)

## 배포 (Windows PC `C:\Users\himed\Projects\docs`, PowerShell)

```
git switch dev; git pull; npm install
npx wrangler d1 migrations apply dise-docs --remote
npx wrangler deploy
```

## 초기 관리자 (처음 한 번)

1. PC에서 `npx wrangler secret put SETUP_CODE` → 설정 코드를 직접 입력(8자 이상, 본인만 아는 값)
2. https://dise-docs.charlie-6fb.workers.dev/setup 에서 관리자 메일·설정 코드·새 비밀번호 입력
3. `/login`에서 로그인 → 포털 오른쪽 위 "관리자 페이지"
4. (선택) 설정이 끝나면 `npx wrangler secret delete SETUP_CODE` — 비밀번호가 이미 있는 계정에는 어차피 다시 쓸 수 없습니다.

## 직원 등록

관리자 페이지 > 직원 명부 > **+ 직원 추가** → 저장하면 임시 비밀번호가 한 번 나옵니다 → 본인에게 직접 전달.
기존 발신인(유정우·원종일·이성진)은 명부에 있지만 비밀번호가 없습니다 — 쓰실 분은 **수정 → 첫 비밀번호 발급**.

## 이후

- **미리보기 후 공개:** 대시보드 > dise-docs > 설정 > 빌드 > GitHub 연결(저장소 `himediaxyz/docs`, 프로덕션 브랜치 `main`). 지금은 `preview_urls: false`라 운영 주소 하나만 열려 있습니다.
- **PDF:** Browser Rendering은 무료 요금제에서 하루 사용 시간 제한이 있습니다. 넘으면 "인쇄하기"를 쓰거나 유료(월 $5)로 전환.
- **정리:** Cloudflare 확인 후 GitHub Pages 끄기 → 저장소 비공개 → Vercel PDF 서버·Apps Script 웹 앱 배포 중지.

## 로컬 미리보기

```
copy .dev.vars.example .dev.vars
npx wrangler d1 migrations apply dise-docs --local
npx wrangler dev
```
http://localhost:8787/setup 에서 `.dev.vars`의 SETUP_CODE로 관리자 비밀번호를 만든 뒤 로그인.

## 안전장치

- `ADMIN_EMAILS`(현재 charlie@)는 항상 관리자이며 퇴사·일반 권한·삭제 불가 — 관리자가 모두 잠기는 일 방지
- 본인 계정·본인 메일 도메인은 스스로 차단할 수 없음
- 비밀번호 변경 시 다른 기기 로그인 해제, 초기화·퇴사 시 모든 기기 로그아웃
- 쓰기 요청은 같은 사이트에서 온 것만 받음(CSRF), 로그인 후 이동 주소는 사이트 안으로만
- 보안 헤더·검색엔진 차단(noindex), 모든 변경은 작업 기록에 남음
