import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage();
const errs = [], fails = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e));
page.on('response', r => { if (r.status() >= 400) fails.push(r.url() + ' ' + r.status()); });
await page.goto('http://127.0.0.1:3000/page.html?slug=about', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const r = await page.evaluate(() => ({
  header: (document.getElementById('site-header')?.innerHTML || '').length,
  footer: (document.getElementById('site-footer')?.innerHTML || '').length,
  body: (document.getElementById('pg-body')?.innerHTML || '').slice(0, 200),
  title: document.getElementById('pg-title')?.textContent
}));
console.log(JSON.stringify(r, null, 1));
console.log('ERRORS:', JSON.stringify(errs, null, 1));
console.log('FAILED:', JSON.stringify(fails, null, 1));
await browser.close();
