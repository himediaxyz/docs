# Cloudflare 배포 안내 (로그인 · 직원 명부 · PDF)

github.io(공개 사이트)를 Cloudflare Worker로 옮기면서 다음이 추가됩니다.

| 기능 | 설명 |
|---|---|
| 로그인 관문 | Cloudflare Access — 회사 메일로 받은 인증코드(OTP)로 로그인. Worker가 Access 토큰을 서명까지 다시 검증(설정이 빠지면 열리지 않음) |
| 직원 명부 (`/admin/`) | 관리자 전용. 직원 추가·수정, 퇴사 처리(즉시 접속 차단)·복직, 권한(관리자/일반), 발신인 표시, CSV 내보내기·가져오기, 작업 기록 |
| 로그인 허용 도메인 | 1단계는 `disehimedia.com`만. 계열사는 관리자 페이지에서 도메인 추가 |
| 발신인 자동 반영 | 명부에서 "발신인"으로 표시한 직원이 레터헤드·계약서·견적서 발신인 목록에 나타남(`/api/senders.js`) |
| PDF | Vercel 대신 같은 사이트의 `/api/pdf`(Cloudflare Browser Rendering) |
| 송장·견적서 | 양식만 제공(구글 시트 연결 안 함) — 직접 입력해 작성 |

github.io 주소는 지금처럼 그대로 동작합니다(PDF는 Vercel, 송장은 시트). Cloudflare가 확인되면 github.io를 끄고 저장소를 비공개로 바꿉니다.

## 파일

- `wrangler.jsonc` — Worker 설정(D1·Browser·환경값)
- `worker/index.js` — 로그인 확인·API
- `migrations/` — DB 구조와 초기 데이터(다이즈 도메인, 관리자, 기존 발신인 3명)
- `admin/index.html` — 관리자 페이지
- `.assetsignore` — 사이트 파일로 올리지 않을 것(코드·설정·md)

## 처음 한 번 — 배포 순서

Windows PC(`C:\Users\himed\Projects\docs`) PowerShell 기준.

1. `git switch dev; git pull; npm install`
2. `npx wrangler login` — 브라우저가 열리면 charlie@disehimedia.com Cloudflare 계정으로 **허용**
3. `npx wrangler d1 create dise-docs` — 나온 `database_id`를 `wrangler.jsonc`의 `REPLACE_WITH_D1_ID` 자리에
4. `npx wrangler d1 migrations apply dise-docs --remote`
5. `npx wrangler deploy` — 주소 `https://dise-docs.<계정이름>.workers.dev`
   이 시점에는 Access 값이 비어 있어 "로그인 설정 전" 화면만 나옵니다(안전).
6. **Access 켜기** — 대시보드 > Workers & Pages > dise-docs > 설정 > 도메인 및 경로 > `workers.dev` 항목에서 **Cloudflare Access** 사용
   - Zero Trust를 처음 쓰면 팀 이름을 정하고 Free 요금제 선택(결제수단 등록을 요구할 수 있음, 50명까지 무료)
7. Zero Trust > Access > 애플리케이션 > dise-docs
   - 정책: Include → **Emails ending in** `@disehimedia.com` (기본으로 계정 소유자 메일만 들어가 있으면 바꿈)
   - 로그인 방법: **One-time PIN**
   - 개요의 **Application Audience (AUD) 태그**와 팀 도메인 `https://<팀>.cloudflareaccess.com` 을 복사
8. `wrangler.jsonc`의 `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`에 넣고 `npx wrangler deploy`
9. 회사 메일로 로그인 → 포털 오른쪽 위 "관리자 페이지"

## 이후

- **미리보기 후 공개:** 대시보드 > dise-docs > 설정 > 빌드 > GitHub 연결(저장소 `himediaxyz/docs`, 프로덕션 브랜치 `main`). dev에 push하면 미리보기 주소, main에 합치면 실제 사이트에 반영. 미리보기 주소도 Worker가 로그인 토큰을 검사하므로 로그인 없이는 열리지 않습니다.
- **계열사 추가:** 관리자 페이지 > 로그인 허용 도메인에서 추가. Access 정책에도 같은 도메인을 넣어야 로그인 화면을 통과합니다. 자동으로 하려면:
  - API 토큰(권한: Account > Access: Apps and Policies > Edit) 만들기 → `npx wrangler secret put CF_API_TOKEN`
  - `wrangler.jsonc`에 `CF_ACCOUNT_ID`, `ACCESS_POLICY_ID`(정책 ID, 앱 전용 정책이면 `ACCESS_APP_ID`도) 입력 후 배포
- **PDF:** Browser Rendering은 무료 요금제에서 하루 사용 시간 제한이 있습니다(대시보드에서 확인). 넘으면 "인쇄하기"를 쓰거나 유료(월 $5)로 전환.
- **정리:** Cloudflare 확인 후 GitHub Pages 끄기 → 저장소 비공개 → Vercel PDF 서버·Apps Script 웹 앱 배포 중지.

## 로컬 미리보기

```
copy .dev.vars.example .dev.vars
npx wrangler d1 migrations apply dise-docs --local
npx wrangler dev
```
http://localhost:8787 — `.dev.vars`의 `DEV_USER_EMAIL`로 로그인한 것으로 간주(로컬에서만).

## 안전장치

- `ADMIN_EMAILS`(현재 charlie@)는 항상 관리자이며 퇴사·일반 권한·삭제 불가 — 관리자가 모두 잠기는 일 방지
- 본인 계정·본인 메일 도메인은 스스로 차단할 수 없음
- 쓰기 요청은 같은 사이트에서 온 것만 받음(CSRF), 보안 헤더·검색엔진 차단(noindex)
- 모든 변경은 작업 기록에 남음
