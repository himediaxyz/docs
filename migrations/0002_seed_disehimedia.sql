-- 1단계: 다이즈하이미디어만. 다른 회사 도메인은 관리자 페이지에서 추가.
INSERT OR IGNORE INTO allowed_domains (domain, company) VALUES ('disehimedia.com', 'disehimedia');

-- 첫 관리자
INSERT OR IGNORE INTO employees (company, email, name_kr, role, status, memo)
VALUES ('disehimedia', 'charlie@disehimedia.com', '이차우', 'admin', '재직', '초기 관리자');

-- 기존 발신인 목록(shared/scripts/sender-info.js)에 있던 분들
INSERT OR IGNORE INTO employees (company, email, name_kr, name_en, title_kr, title_en, mobile, is_sender, sort_order)
VALUES
 ('disehimedia', 'ryan@disehimedia.com',    '유정우', 'You, Jeong-woo | Ryan', '대표이사 / 회장', 'CEO / Chairman', '010-2711-4722', 1, 10),
 ('disehimedia', 'toyawon@disehimedia.com', '원종일', 'Won, Jong il | Jason',  '대표이사',        'CEO',            '010-5171-8279', 1, 20),
 ('disehimedia', 'kai@disehimedia.com',     '이성진', 'Lee, Sung jin | Kai',   '재무 부대표',     'CFO',            '010-6208-6717', 1, 30);
