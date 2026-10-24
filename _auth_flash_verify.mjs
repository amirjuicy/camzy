/* Post-fix verification for the /admin authentication flow.
 * Checks (all against the real server, real browser + real API):
 *  A. Logged out: /admin never serves admin HTML (server redirects), APIs stay 401,
 *     public storefront pages still work.
 *  B. Valid session (real login): cookie issued; /admin loads; neutral boot gate
 *     reveals the panel only after server confirmation; APIs 200.
 *  C. Cookie-only valid session (localStorage empty): panel still works (no dead loop).
 *  D. Expired session (DB row expired): page + APIs blocked.
 *  E. Invalid/forged session cookie: page + APIs blocked.
 *  F. Admin logout clears the cookie; protected page becomes unreachable again.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:3003';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = () => sleep(900); /* keep the shared 120/min API limiter calm */

/* fetch with strict patience: only transient 429/5xx are retried, so an auth
 * verdict (401/200/302) is always the real server's answer. */
async function probe(ctx, method, path, opts = {}, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await ctx.request.fetch(BASE + path, { method, ...opts });
    if (r.status() === 429 || r.status() >= 500) { await sleep(2500); continue; }
    return r;
  }
  return ctx.request.fetch(BASE + path, { method, ...opts }); // final honest result
}

const results = [];
function rec(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
}

/* - A. logged out - */
{
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const seen = [];
  page.on('response', (r) => {
    if (/(\/admin($|\/)|\/login)/.test(new URL(r.url()).pathname)) {
      seen.push(`${r.status()} ${new URL(r.url()).pathname}`);
    }
  });

  const r0 = await ctx.request.get(BASE + '/admin', { maxRedirects: 0 });
  rec('A1 logged-out GET /admin x 302, no admin HTML', r0.status() === 302,
    `status=${r0.status()} location=${r0.headers()['location'] || '-'}`);
  await r0.dispose?.().catch?.(() => {});

  await page.goto(BASE + '/admin', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  const finalUrl = page.url();
  const inDom = await page.evaluate(() => !!document.querySelector('.admin-layout'));
  rec('A2 logged-out browser /admin ends on login page', /\/login(\?|$)/.test(finalUrl), `finalUrl=${finalUrl}`);
  rec('A3 logged-out admin UI never in DOM', !inDom, `adminLayoutInDom=${inDom}`);
  rec('A4 no 200 for /admin HTML while logged out', !seen.some((s) => s.startsWith('200 /admin')),
    JSON.stringify(seen));

  // protected APIs logged out (throttled to stay under the 120/min limiter)
  const apiChecks = [
    ['GET', '/api/admin/me'],
    ['GET', '/api/admin/users'],
    ['GET', '/api/admin/summary'],
    ['GET', '/api/orders'],
    ['GET', '/api/admin/notifications'],
    ['GET', '/api/admin/logs'],
  ];
  for (const [m, p] of apiChecks) {
    await pause();
    const r = await probe(ctx, m, p);
    rec(`A5 logged-out ${m} ${p}`, r.status() === 401, `status=${r.status()}`);
  }
  await pause();
  const rPost = await probe(ctx, 'POST', '/api/products', { data: { name: 'x' } });
  rec('A6 logged-out POST /api/products (write)', rPost.status() === 401, `status=${rPost.status()}`);

  // public storefront routes unaffected
  const pubChecks = [['GET', '/'], ['GET', '/shop'], ['GET', '/login'], ['GET', '/api/categories'], ['GET', '/api/products?limit=1']];
  for (const [m, p] of pubChecks) {
    await pause();
    const r = await probe(ctx, m, p);
    rec(`A7 public ${m} ${p} unaffected`, r.status() === 200, `status=${r.status()}`);
  }
  await browser.close();
}

/* helper: real login in a fresh context (cookie jar shared w/ pages) */
async function freshAdminContext(browser, { seedStorage = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const login = await ctx.request.post(BASE + '/api/admin/login', {
    data: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  const body = await login.json().catch(() => ({}));
  const setCookie = login.headers()['set-cookie'] || '';
  return { ctx, login, token: body.token, setCookie };
}

/* - B. valid session - */
{
  const browser = await chromium.launch();
  const { ctx, login, token, setCookie } = await freshAdminContext(browser);
  rec('B1 admin login 200 + token issued', login.status() === 200 && !!token, `status=${login.status()} tokenLen=${(token || '').length}`);
  rec('B2 login sets HttpOnly cookie cam_admin_token',
    /cam_admin_token=/.test(setCookie) && /httponly/i.test(setCookie),
    `setCookie=${String(setCookie).split(';')[0]}${/httponly/i.test(setCookie) ? ' [HttpOnly]' : ''}`);

  const page = await ctx.newPage();
  // boot gate behavior observed from first paint
  await page.addInitScript(() => {
    window.__bootObs = { gateSeen: null, sidebarVisibleEarly: null };
    const obs = () => {
      const g = document.getElementById('admin-boot');
      if (g && window.__bootObs.gateSeen === null) window.__bootObs.gateSeen = true;
      const sb = document.querySelector('.admin-sidebar');
      if (sb) {
        const r = sb.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && window.__bootObs.sidebarVisibleEarly === null) {
          window.__bootObs.sidebarVisibleEarly = (document.getElementById('admin-boot') ? 'AFTER-gate-shown' : 'immediate');
        }
      }
    };
    new MutationObserver(obs).observe(document, { childList: true, subtree: true });
  });
  await page.goto(BASE + '/admin', { waitUntil: 'load', timeout: 30000 });
  const early = await page.evaluate(() => ({ ...window.__bootObs }));
  const gateNow = await page.evaluate(() => !!document.getElementById('admin-boot'));
  rec('B3 neutral boot gate shown on load', early.gateSeen === true || gateNow, `gateSeenOnInit=${early.gateSeen} gateStill=${gateNow}`);
  rec('B4 admin sidebar not visible before gate resolves', early.sidebarVisibleEarly !== 'immediate',
    `sidebar=${early.sidebarVisibleEarly ?? 'not-seen'}`);

  // wait for the gate to resolve + panel reveal
  const ok = await page.waitForFunction(() => !document.getElementById('admin-boot'), null, { timeout: 15000 })
    .then(() => true).catch(() => false);
  const active = await page.evaluate(() => document.querySelector('.admin-view.is-active')?.getAttribute('data-view'));
  await pause();
  const meApi = await probe(ctx, 'GET', '/api/admin/me', { headers: { Authorization: 'Bearer ' + token } });
  rec('B5 gate resolves and dashboard renders', ok && active === 'dashboard', `gateRemoved=${ok} activeView=${active} /admin/me=${meApi.status()}`);
  rec('B6 Bearer-token API still works', meApi.status() === 200, `status=${meApi.status()}`);

  // listing API with cookie only (no Authorization header at all)
  await pause();
  const cookieOnly = await probe(ctx, 'GET', '/api/admin/users');
  rec('B7 cookie-only admin API works', cookieOnly.status() === 200, `status=${cookieOnly.status()}`);
  await browser.close();
}

/* - C. cookie-only session (cleared localStorage) - */
{
  await sleep(40000); /* let the /api rate limiter window drain */
  const browser = await chromium.launch();
  const { ctx } = await freshAdminContext(browser);
  const page = await ctx.newPage();
  await page.goto(BASE + '/admin', { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await sleep(20000);
  await page.goto(BASE + '/admin', { waitUntil: 'load', timeout: 30000 });
  const gateGone = await page.waitForFunction(() => !document.getElementById('admin-boot'), null, { timeout: 30000 })
    .then(() => true).catch(() => false);
  const url = page.url();
  const active = await page.evaluate(() => document.querySelector('.admin-view.is-active')?.getAttribute('data-view') || null);
  rec('C1 cookie-only session renders panel (no redirect loop)', gateGone && /\/admin/.test(url) && active === 'dashboard',
    `url=${url} gateRemoved=${gateGone} activeView=${active}`);
  await browser.close();
}

/* - D. expired session - */
{
  await sleep(40000); /* let the /api rate limiter window drain */
  const browser = await chromium.launch();
  const { ctx, token } = await freshAdminContext(browser);
  // force-expire the session row just issued
  await ctx.request.post(BASE + '/api/admin/logout', { headers: { Authorization: 'Bearer ' + token } });
  await sleep(300);
  await pause();
    const r = await ctx.request.get(BASE + '/admin', { maxRedirects: 0 });
  rec('D1 revoked+cookie GET /admin x 302 login', r.status() === 302 && /login\.html/.test(r.headers()['location'] || ''),
    `status=${r.status()} location=${r.headers()['location'] || '-'}`);
  const page = await ctx.newPage();
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  const finalUrl = page.url();
  const inDom = await page.evaluate(() => !!document.querySelector('.admin-layout'));
  rec('D2 expired session browser ends on login', /\/login(\?|$)/.test(finalUrl) && !inDom, `finalUrl=${finalUrl} inDom=${inDom}`);
  await pause();
  const me = await probe(ctx, 'GET', '/api/admin/me', { headers: { Authorization: 'Bearer ' + token } });
  rec('D3 expired token rejected by API', me.status() === 401, `status=${me.status()}`);
  await browser.close();
}

/* - E. forged cookie - */
{
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'cam_admin_token', value: 'f00d'.repeat(16), url: BASE, httpOnly: true, sameSite: 'Lax' }]);
  await sleep(300);
  await pause();
    const r = await ctx.request.get(BASE + '/admin', { maxRedirects: 0 });
  rec('E1 forged cookie GET /admin x 302 login', r.status() === 302 && /login\.html/.test(r.headers()['location'] || ''),
    `status=${r.status()} location=${r.headers()['location'] || '-'}`);
  await sleep(300);
  await pause();
  const api = await probe(ctx, 'GET', '/api/admin/users');
  rec('E2 forged cookie API blocked', api.status() === 401, `status=${api.status()}`);
  await browser.close();
}

/* - F. logout round-trip - */
{
  const browser = await chromium.launch();
  const { ctx, token } = await freshAdminContext(browser);
  const page = await ctx.newPage();
  await page.goto(BASE + '/admin', { waitUntil: 'load', timeout: 30000 });
  const gateGone = await page.waitForFunction(() => !document.getElementById('admin-boot'), null, { timeout: 15000 }).then(() => true).catch(() => false);
  rec('F1 panel loads with valid session', gateGone, `gateRemoved=${gateGone}`);
  // logout through the panel's own logout call
  await sleep(300);
  await pause();
  const out = await probe(ctx, 'POST', '/api/admin/logout', { headers: { Authorization: 'Bearer ' + token } });
  const clear = out.headers()['set-cookie'] || '';
  rec('F2 logout 200 + clears cookie', out.status() === 200 && /cam_admin_token=;\s*Path=\/;\s*HttpOnly/.test(clear),
    `status=${out.status()} setCookie=${String(clear).split(';').slice(0, 2).join(';')}`);
  await sleep(300);
  await pause();
    const r = await ctx.request.get(BASE + '/admin', { maxRedirects: 0 });
  rec('F3 after logout GET /admin x 302 login', r.status() === 302, `status=${r.status()} location=${r.headers()['location'] || '-'}`);
  await browser.close();
}

console.log('\n==== SUMMARY ====');
let fails = 0;
for (const r of results) { if (!r.pass) fails++; console.log(`${r.pass ? '-' : 'x'} ${r.name} - ${r.detail}`); }
console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);

