/* Automated regression test for serve.js (port 3001) security hardening.
 * Assumes a running `node serve.js` instance on 127.0.0.1:3001.
 * Non-destructive: GET requests only.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:3001';
const results = [];
function rec(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
}

async function probe(path) {
  const r = await fetch(BASE + path, { redirect: 'manual' });
  return { status: r.status, ct: r.headers.get('content-type') || '' };
}

// 1. Previously exposed sensitive routes must now be blocked (404).
const blocked = [
  '/admin/', '/admin/index.html', '/admin/builder.html',
  '/admin/admin/', '/admin/foo.html',
  '/server/app.js', '/server/db.js', '/server/seed.js',
  '/data/camzy.db', '/data/camzy.db-wal', '/data/camzy.db-shm', '/data/store.db', '/data.sqlite', '/data/',
  '/_live_session.json', '/_repro_cred.json',
  '/.txt',
  '/server-err.log', '/server-out.log', '/err.txt', '/out.txt',
  '/_cb_server_err.log', '/_cb_server_out.log',
  '/.git/HEAD', '/.git/config',
  '/package.json', '/package-lock.json',
  '/admin',
];
for (const p of blocked) {
  const { status } = await probe(p);
  rec(`blocked: ${p}`, status === 404, `status=${status}`);
}

// 2. Encoded variants of blocked paths must also be blocked.
const encoded = [
  '/%2fadmin%2findex.html',
  '/%2Fserver%2Fapp.js',
  '/%2e%2e/server/app.js',
  '/data/%2e%2e/package.json',
];
for (const p of encoded) {
  const { status } = await probe(p);
  rec(`blocked (encoded): ${p}`, status === 404, `status=${status}`);
}

// 3. Path traversal must still be blocked (403/404).
const traversal = ['/../server/app.js', '/../../etc/passwd', '/%2e%2e/%2e%2e/server/app.js'];
for (const p of traversal) {
  const { status } = await probe(p);
  rec(`traversal blocked: ${p}`, status === 403 || status === 404, `status=${status}`);
}

// 4. Legitimate public routes must remain accessible (200).
const allowed = [
  { p: '/', want: 200 },
  { p: '/index.html', want: 301 },
  { p: '/shop', want: 200 },
  { p: '/shop.html', want: 301 },
  { p: '/login', want: 200 },
  { p: '/login.html', want: 301 },
  { p: '/sw.js', want: 200 },
  { p: '/manifest.webmanifest', want: 200 },
  { p: '/assets/css/base.css', want: 200 },
  { p: '/assets/js/common.js', want: 200 },
  { p: '/admin/assets/css/admin.css', want: 200 },
  { p: '/admin/assets/js/admin-auth.js', want: 200 },
];
for (const { p, want } of allowed) {
  const { status } = await probe(p);
  rec(`allowed: ${p}`, status === want, `status=${status} (want ${want})`);
}

// 5. Confirm no sensitive body leaks for a blocked route.
const r = await fetch(BASE + '/_live_session.json', { redirect: 'manual' });
const txt = await r.text();
rec('no secret body on blocked route', r.status === 404 && !txt.includes('token'), `status=${r.status} bodyLen=${txt.length}`);

console.log('\n==== SUMMARY ====');
const fails = results.filter((x) => !x.pass).length;
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name} - ${r.detail}`);
console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
