// Cloudflare Pages 배포용 dist/ 만들기
//  - 사이트 파일(포털·템플릿·shared·admin)을 dist/ 로 복사 (.assetsignore 에 적힌 것 제외)
//  - worker/index.js 를 dist/_worker.js 로 (Pages "advanced mode": 모든 요청을 이 Worker가 먼저 받음)
// 사용: node scripts/build-pages.mjs   (npm run build)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const dist = path.join(root, 'dist');
const rules = fs.readFileSync(path.join(root, '.assetsignore'), 'utf8')
  .split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#')).map(s => s.replace(/\/$/, ''));
rules.push('dist', 'scripts');

function ignored(rel) {
  const name = path.basename(rel);
  const top = rel.split(/[\\/]/)[0];
  return rules.some(r => {
    if (r.startsWith('*.')) return name.endsWith(r.slice(1));
    if (r.endsWith('*')) return name.startsWith(r.slice(0, -1)) || top.startsWith(r.slice(0, -1));
    return r === top || r === rel.replace(/\\/g, '/') || r === name && !r.includes('/') && rel.split(/[\\/]/).length === 1;
  });
}

function copyDir(src, rel = '') {
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const r = rel ? path.join(rel, ent.name) : ent.name;
    if (ignored(r)) continue;
    const from = path.join(src, ent.name), to = path.join(dist, r);
    if (ent.isDirectory()) { fs.mkdirSync(to, { recursive: true }); copyDir(from, r); }
    else if (ent.isFile()) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); }
  }
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
copyDir(root);
fs.copyFileSync(path.join(root, 'worker', 'index.js'), path.join(dist, '_worker.js'));
// 없는 주소는 포털로 가지 않고 "찾을 수 없음" (404.html이 없으면 Pages가 index.html을 대신 보여 줌)
fs.writeFileSync(path.join(dist, '404.html'), '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>페이지를 찾을 수 없음</title><style>body{font-family:-apple-system,"Noto Sans KR","Malgun Gothic",sans-serif;background:#f4f5f8;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;color:#0b234f}div{background:#fff;padding:32px;border-radius:14px;text-align:center}a{color:#2f5fd0}</style></head><body><div><h1 style="font-size:20px">페이지를 찾을 수 없습니다</h1><p><a href="/">문서 시스템 첫 화면으로</a></p></div></body></html>');
// 로그인 화면 로고 티커용 공개 목록(회사 key·단색 로고 경로·비율·배율만 — 주소 등 회사 정보는 넣지 않음)
{
  const ctx = { window: {} }; ctx.window.DISE = {}; ctx.DISE = ctx.window.DISE;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'shared', 'scripts', 'company-info.js'), 'utf8'), ctx);
  const cos = ctx.DISE.companies || ctx.window.DISE.companies || {};
  const list = Object.keys(cos).filter(k => cos[k].logoMark).map(k => ({
    key: k, name: cos[k].nameKr, mark: '/shared/assets/logos/' + cos[k].logoMark,
    ratio: cos[k].logoRatio || 1, scale: cos[k].portalLogoScale || 1
  }));
  fs.writeFileSync(path.join(dist, 'login-logos.json'), JSON.stringify(list));
}
let n = 0; (function count(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? count(path.join(d, e.name)) : n++; })(dist);
console.log(`dist/ 준비 완료 — 파일 ${n}개`);
