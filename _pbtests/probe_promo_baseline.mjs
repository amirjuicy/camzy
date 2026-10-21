/* Baseline probe: what currently works / fails in Admin → بنرهای تبلیغاتی */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function apiLogin() {
  const r = await fetch(BASE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const j = await r.json();
  if (!j.token) throw new Error('admin login failed: ' + JSON.stringify(j));
  return j;
}

const login = await apiLogin();
const browser = await chromium.launch({ headless: true, executablePath: chromePath });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR ' + String(e)));
await page.addInitScript((s) => {
  try { localStorage.setItem('as_admin_session', JSON.stringify(s)); } catch (e) {}
}, { token: login.token, admin: login.admin, userId: login.admin.id, remember: true, loginAt: Date.now() });

await page.goto(BASE + '/admin/index.html#/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

const state = await page.evaluate(() => {
  const out = {};
  out.hasMediaPicker = typeof window.CamzyMediaPicker;
  out.promo1 = !!document.getElementById('home-promo-1');
  out.promo2 = !!document.getElementById('home-promo-2');
  out.promo3 = !!document.getElementById('home-promo-3');
  out.promo4 = !!document.getElementById('home-promo-4');
  out.btn1 = !!document.querySelector('button[data-media-target="home-promo-1-image"]');
  out.btnCount = document.querySelectorAll('[data-media-target^="home-promo-"]').length;
  out.topbarH = (document.getElementById('home-topbar-height') || {}).value;
  out.imgH = (document.getElementById('home-topbar-img-height') || {}).value;
  out.imgW = (document.getElementById('home-topbar-img-width') || {}).value;
  out.dimsText = (document.getElementById('home-topbar-dims-display') || {}).textContent;
  out.previewHtml = (document.getElementById('home-topbar-preview') || {}).outerHTML?.slice(0, 500);
  out.msgCount = document.querySelectorAll('#home-topbar-preview .promo-topbar__msg').length;
  out.titleVisible = (() => {
    const h2 = [...document.querySelectorAll('.adm-card__title')].find(h => h.textContent.includes('بنرهای تبلیغاتی'));
    return !!(h2 && h2.getBoundingClientRect().height > 0);
  })();
  return out;
});
console.log('BASELINE STATE:', JSON.stringify(state, null, 2));

// Try clicking the picker button
if (state.btn1) {
  await page.click('button[data-media-target="home-promo-1-image"]').catch(e => console.log('click failed', e.message));
  await page.waitForTimeout(2500);
  const picker = await page.evaluate(() => {
    const o = document.getElementById('adm-media-picker');
    if (!o) return { exists: false };
    return {
      exists: true,
      open: o.classList.contains('is-open'),
      gridHtml: (document.getElementById('adm-mp-grid') || {}).innerHTML?.slice(0, 400),
      itemCount: document.querySelectorAll('#adm-mp-grid .adm-mp-item').length,
      hasUpload: !!document.getElementById('adm-mp-file')
    };
  });
  console.log('PICKER AFTER CLICK:', JSON.stringify(picker, null, 2));
} else {
  console.log('PICKER BUTTON MISSING — cannot test');
}

console.log('CONSOLE ERRORS:', JSON.stringify(errs, null, 2));
await browser.close();
