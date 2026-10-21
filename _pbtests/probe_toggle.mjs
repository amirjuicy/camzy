/* Toggle probe: home.topbar.enabled=0 must hide the bar AND release the
   reserved space (no dead gap, no overlap); re-enable must restore exactly. */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function apiLogin() {
  const r = await fetch(BASE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const j = await r.json();
  if (!j.token) throw new Error('admin login failed');
  return j;
}
async function putContent(patch) {
  const login = await apiLogin();
  const r = await fetch(BASE + '/api/content', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token },
    body: JSON.stringify(patch)
  });
  return r.json();
}

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

async function measure(label) {
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => {
    const bar = document.querySelector('.promo-topbar');
    return bar && getComputedStyle(bar).display !== 'none' || (bar && getComputedStyle(bar).display === 'none');
  }, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(700);
  const m = await page.evaluate(() => {
    const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), h: +b.height.toFixed(1) }; };
    const cs = el => el ? getComputedStyle(el) : null;
    const header = document.querySelector('.site-header');
    const promo = document.querySelector('.promo-topbar');
    const service = document.querySelector('.service-bar');
    const bodyPad = cs(document.body).paddingTop;
    return {
      bodyPad,
      promoDisplay: cs(promo).display,
      header: r(header),
      service: r(service),
      overlap: header && service ? +(header.bottom - service.top).toFixed(1) : null
    };
  });
  await page.close();
  const ok = m.promoDisplay === 'none' ? (m.overlap <= 0.5) : true;
  console.log(`${label}: bodyPad=${m.bodyPad} promo=${m.promoDisplay} header.h=${m.header ? m.header.h : 'n/a'} service.top=${m.service ? m.service.top : 'n/a'} overlap=${m.overlap}px ${ok ? 'OK' : 'FAIL'}`);
  return m;
}

// 1. Disabled at height 100
await putContent({ 'home.topbar.enabled': '0', 'promo.topbar.height': '100' });
await measure('disabled@100');

// 2. Re-enabled at height 100
await putContent({ 'home.topbar.enabled': '1', 'promo.topbar.height': '100' });
await measure('enabled@100 ');

// 3. Restore original state: enabled, height 60
await putContent({ 'home.topbar.enabled': '1', 'promo.topbar.height': '60' });
await measure('restored@60  ');

await browser.close();
