-- 2026-11-04: 직원 사진(관리자 페이지에서 업로드). 브라우저에서 긴 변 1200px JPEG로 줄여 저장(보통 0.2~0.5MB)
CREATE TABLE IF NOT EXISTS employee_photos (
  employee_id  INTEGER PRIMARY KEY,
  mime         TEXT NOT NULL DEFAULT 'image/jpeg',
  data         BLOB NOT NULL,
  bytes        INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by   TEXT NOT NULL DEFAULT ''
);
