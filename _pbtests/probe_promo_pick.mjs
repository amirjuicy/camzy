/* Probe 2: does selecting an image actually fill the field + update preview? does upload work? */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const r = await fetch(BASE + '/api/admin/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' })
});
const login = await r.json();

const browser = await chromium.launch({ headless: true, executablePath: chromePath });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR ' + String(e)));
page.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
await page.addInitScript((s) => {
  try { localStorage.setItem('as_admin_session', JSON.stringify(s)); } catch (e) {}
}, { token: login.token, admin: login.admin, userId: login.admin.id, remember: true, loginAt: Date.now() });

await page.goto(BASE + '/admin/index.html#/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

// clear field first
await page.evaluate(() => { const el = document.getElementById('home-promo-1-image'); if (el) el.value = ''; });

await page.click('button[data-media-target="home-promo-1-image"]');
await page.waitForTimeout(1500);
const before = await page.evaluate(() => (document.getElementById('home-promo-1-image') || {}).value);
console.log('before pick:', JSON.stringify(before));

// click first item
const clicked = await page.evaluate(() => {
  const it = document.querySelector('#adm-mp-grid .adm-mp-item');
  if (!it) return null;
  const u = it.getAttribute('data-mp-pick');
  it.click();
  return u;
});
await page.waitForTimeout(1200);
const after = await page.evaluate(() => ({
  val: (document.getElementById('home-promo-1-image') || {}).value,
  previewSrc: (document.getElementById('home-promo-1-preview') || {}).getAttribute?.('src'),
  previewDisplay: (document.getElementById('home-promo-1-preview') || {}).style?.display,
  pickerOpen: document.getElementById('adm-media-picker')?.classList.contains('is-open'),
  livePreviewHasImg: !!document.querySelector('#home-topbar-preview-msg img')
}));
console.log('clicked item url:', clicked);
console.log('after pick:', JSON.stringify(after, null, 2));

// Now test upload
const fs = await import('node:fs');
const path = await import('node:path');
const tmpPng = path.join(process.env.TEMP || '.', 'probe-banner.png');
fs.writeFileSync(tmpPng, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJElEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC', 'base64'));

await page.click('button[data-media-target="home-promo-2-image"]');
await page.waitForTimeout(1200);
await page.setInputFiles('#adm-mp-file', tmpPng);
await page.waitForTimeout(4000);
const afterUpload = await page.evaluate(() => ({
  val: (document.getElementById('home-promo-2-image') || {}).value,
  pickerOpen: document.getElementById('adm-media-picker')?.classList.contains('is-open'),
  gridCount: document.querySelectorAll('#adm-mp-grid .adm-mp-item').length
}));
console.log('after upload:', JSON.stringify(afterUpload, null, 2));

console.log('ERRORS:', JSON.stringify(errs, null, 2));
await browser.close();
