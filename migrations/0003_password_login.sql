-- 2026-11-04: Cloudflare Access(Zero Trust) 대신 자체 아이디·비밀번호 로그인
ALTER TABLE employees ADD COLUMN password_hash TEXT;
ALTER TABLE employees ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN failed_logins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN locked_until TEXT;
ALTER TABLE employees ADD COLUMN password_changed_at TEXT;

-- 로그인 세션(쿠키에는 무작위 토큰, DB에는 그 해시만 저장)
CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT PRIMARY KEY,
  employee_id  INTEGER NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL,
  ip           TEXT NOT NULL DEFAULT '',
  user_agent   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sessions_emp ON sessions(employee_id);

-- 로그인 시도(같은 IP에서 짧은 시간에 너무 많이 틀리면 막기)
CREATE TABLE IF NOT EXISTS login_attempts (
  id  INTEGER PRIMARY KEY AUTOINCREMENT,
  ip  TEXT NOT NULL,
  at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(ip, at);
