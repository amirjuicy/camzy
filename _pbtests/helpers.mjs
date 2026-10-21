import { chromium } from 'playwright';

export const BASE = 'http://127.0.0.1:3000';
export const BUILDER = BASE + '/admin/builder.html?slug=about';

export async function getToken() {
  const r = await fetch(BASE + '/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const j = await r.json();
  if (!j.token) throw new Error('login failed: ' + JSON.stringify(j));
  return j.token;
}

export async function openBuilder({ token, viewport = { width: 1440, height: 900 }, url = BUILDER } = {}) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  });
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('requestfailed', r => failedRequests.push(r.url() + ' :: ' + (r.failure()?.errorText || '')));
  page.on('response', r => { if (r.status() >= 400) failedRequests.push(r.url() + ' :: HTTP ' + r.status()); });
  await page.addInitScript((t) => {
    localStorage.setItem('as_admin_session', JSON.stringify({ token: t, role: 'admin', username: 'admin', ts: Date.now() }));
  }, token);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#pb-status', { timeout: 10000 });
  await page.waitForFunction(() => (document.getElementById('pb-status')?.textContent || '').includes('آماده'), null, { timeout: 30000 }).catch(() => {});
  // wait for iframe doc bound
  await page.waitForFunction(() => {
    try {
      const f = document.getElementById('pb-iframe');
      const d = f && (f.contentDocument || f.contentWindow.document);
      return !!(d && d.body && d.documentElement.getAttribute('data-pb-bound'));
    } catch (e) { return false; }
  }, null, { timeout: 30000 }).catch(() => {});
  // a real user waits out the preview's loading overlay — it is inert and blocks canvas hits
  await page.waitForFunction(() => {
    try {
      const f = document.getElementById('pb-iframe');
      const d = f && (f.contentDocument || f.contentWindow.document);
      return !!(d && d.body && !d.getElementById('site-loader'));
    } catch (e) { return false; }
  }, null, { timeout: 30000 }).catch(() => {});
  return { browser, page, consoleErrors, pageErrors, failedRequests };
}

export async function frame(page) {
  return page.frameLocator('#pb-iframe');
}

export async function getFrameBody(page) {
  const el = await page.$('#pb-iframe');
  return el.contentFrame();
}

export function log(...a) { console.log(...a); }
export function check(name, cond, detail = '') {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '   [' + detail + ']' : ''));
  return cond;
}
