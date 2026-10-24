/* Baseline probe for the /admin auth flash bug.
 * Documents:
 *  1. what an UNAUTHENTICATED browser GET /admin actually receives (HTTP level)
 *  2. whether the admin UI visibly renders/exists in the DOM while logged out
 *  3. protected admin API status codes while logged out
 *  4. valid-session behavior (via real login)
 *  5. expired/invalid session behavior
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:3003';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

const results = [];
function rec(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
}

/* ── 1+2: network + DOM while logged out ─────────────────────── */
{
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const responses = [];
  page.on('response', (r) => {
    if (r.url().startsWith(BASE + '/admin') || r.url().startsWith(BASE + '/login')) {
      responses.push(`${r.status()} ${r.url().replace(BASE, '')}${r.request().redirectedFrom() ? ' (redirect target)' : ''}`);
    }
  });

  // Top-level navigation as a user typing /admin would do
  let adminHtmlLeak = null;
  const r0 = await ctx.request.get(BASE + '/admin', { maxRedirects: 0 }).catch((e) => ({ error: String(e) }));
  const st0 = 'status' in (r0 || {}) ? r0.status() : undefined;
  const loc0 = r0 && r0.headers ? r0.headers()['location'] : undefined;
  rec('logged-out GET /admin is not 200 admin HTML', !(st0 === 200),
    `status=${st0} location=${loc0 ?? '-'}`);
  if (st0 === 200) {
    adminHtmlLeak = await r0.text().then((t) => t.slice(0, 300));
  }

  await page.goto(BASE + '/admin', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  const finalUrl = page.url();
  const sidebarSeen = await page.evaluate(() => {
    const sb = document.querySelector('.admin-sidebar');
    if (!sb) return null;
    const r = sb.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? 'VISIBLE' : 'in-dom-hidden';
  });
  const inDom = await page.evaluate(() => !!document.querySelector('.admin-layout'));
  rec('logged-out browser /admin ends on login page', /login/.test(finalUrl), `finalUrl=${finalUrl}`);
  rec('logged-out admin UI never present in DOM', !inDom && sidebarSeen === null,
    `adminLayoutInDom=${inDom} sidebar=${sidebarSeen ?? 'absent'}`);
  rec('logged-out protected admin HTML served over wire', adminHtmlLeak === null,
    adminHtmlLeak ? '200 with admin HTML body (FLASH SOURCE): ' + adminHtmlLeak : 'no 200 admin body');
  console.log('  navigations seen:', JSON.stringify(responses));
  await browser.close();
}

/* ── 3: protected APIs logged out ───────────────────────────── */
{
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const req = ctx.request;
  const checks = [
    ['GET', '/api/admin/me', 401],
    ['GET', '/api/admin/validate', null /* valid:false body not 401 on old code */],
    ['GET', '/api/admin/users', 401],
    ['GET', '/api/admin/summary', 401],
    ['GET', '/api/orders', 401],
    ['PUT', '/api/settings', 401],
    ['POST', '/api/products', 401],
    ['GET', '/api/admin/notifications', 401],
    ['GET', '/api/admin/logs', 401],
  ];
  for (const [m, p, want] of checks) {
    const r = await req.fetch(BASE + p, { method: m, data: m === 'PUT' || m === 'POST' ? { _probe: 1 } : undefined }).catch(() => null);
    const got = r ? r.status() : 'ERR';
    const ok = want == null ? true : got === want;
    rec(`logged-out ${m} ${p}`, ok, `status=${got}${want == null ? '' : ' (want ' + want + ')'}`);
  }
  // Write-possibility check with a FAKE token (violent proof 401 is enforced)
  const rf = await req.fetch(BASE + '/api/admin/users', { headers: { Authorization: 'Bearer deadbeef' } }).catch(() => null);
  rec('logged-out admin API with forged token blocked', rf && rf.status() === 401, `status=${rf ? rf.status() : 'ERR'}`);
  await browser.close();
}

/* ── 4+5: valid session & expired session ────────────────────── */
{
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Real login through the panel API (same as the panel's login page)
  const login = await ctx.request.post(BASE + '/api/admin/login', {
    data: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  rec('admin login API works (existing flow intact)', login.status() === 200, `status=${login.status()}`);
  const inj = await login.json();
  const token = inj.token;
  rec('login response carries token', !!token, `tokenLen=${(token || '').length}`);

  // expire & forge variants of injected localStorage session (old panel flow)
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});

  // (4) valid session via localStorage seeding (existing flow)
  await page.evaluate(({ t, u }) => localStorage.setItem('as_admin_session', JSON.stringify({
    token: t, admin: { id: 1, username: u, name: 'admin', role: 'admin', permissions: { sections: 'all' } },
    userId: 1, remember: true, loginAt: Date.now(),
  })), { t: token, u: ADMIN_USER });
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle', timeout: 30000 });
  const dashOk = await page.evaluate(() => {
    const v = document.querySelector('.admin-view.is-active');
    return v ? v.getAttribute('data-view') : null;
  });
  const me = await ctx.request.get(BASE + '/api/admin/me', { headers: { Authorization: 'Bearer ' + token } });
  rec('valid session: panel stays/loads dashboard', dashOk === 'dashboard', `activeView=${dashOk} /api/admin/me=${me.status()}`);

  // (5) expired/invalid session
  await page.evaluate((u) => localStorage.setItem('as_admin_session', JSON.stringify({
    token: 'deadbeef'.repeat(6), admin: { id: 1, username: u, name: 'admin', role: 'admin' },
    userId: 1, remember: true, loginAt: Date.now(),
  })), ADMIN_USER);
  const dead = await ctx.request.get(BASE + '/api/admin/me', { headers: { Authorization: 'Bearer ' + 'deadbeef'.repeat(6) } });
  rec('expired/invalid token rejected by /api/admin/me', dead.status() === 401, `status=${dead.status()}`);
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  const finalUrl5 = page.url();
  rec('expired/invalid session: /admin leaves panel', /login/.test(finalUrl5), `finalUrl=${finalUrl5}`);
  await browser.close();
}

console.log('\n==== SUMMARY ====');
for (const r of results) console.log(`${r.pass ? '✅' : '❌'} ${r.name} — ${r.detail}`);
