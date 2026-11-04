-- 다이즈하이미디어 공식 문서 시스템 — 사내 로그인·인사(직원 명부) DB
-- Cloudflare D1. 적용: npx wrangler d1 migrations apply dise-docs --remote

-- 직원 명부 = 사이트 접속 권한의 기준
--   status : 재직 | 휴직 | 퇴사   (퇴사 → 사이트 접속 즉시 차단)
--   role   : admin(관리자 페이지 사용) | member(일반)
--   is_sender : 1이면 레터헤드·계약서·견적서의 "발신인" 목록에 표시
CREATE TABLE IF NOT EXISTS employees (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company       TEXT NOT NULL DEFAULT 'disehimedia',
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name_kr       TEXT NOT NULL DEFAULT '',
  name_en       TEXT NOT NULL DEFAULT '',
  dept          TEXT NOT NULL DEFAULT '',
  title_kr      TEXT NOT NULL DEFAULT '',
  title_en      TEXT NOT NULL DEFAULT '',
  mobile        TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  hire_date     TEXT NOT NULL DEFAULT '',
  leave_date    TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT '재직',
  role          TEXT NOT NULL DEFAULT 'member',
  is_sender     INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 100,
  memo          TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(company, status);

-- 로그인 허용 메일 도메인(회사별). 관리자 페이지에서 추가하면
-- Cloudflare Access 정책도 같이 갱신(API 토큰 설정 시).
CREATE TABLE IF NOT EXISTS allowed_domains (
  domain      TEXT PRIMARY KEY COLLATE NOCASE,
  company     TEXT NOT NULL DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 작업 기록(누가 언제 무엇을 바꿨는지)
CREATE TABLE IF NOT EXISTS audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL DEFAULT (datetime('now')),
  actor   TEXT NOT NULL,
  action  TEXT NOT NULL,
  target  TEXT NOT NULL DEFAULT '',
  detail  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
