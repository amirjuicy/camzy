import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:3003';
const cred = JSON.parse(await (await import('fs/promises')).readFile('_live_session.json', 'utf8'));
const browser = await chromium.launch();

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(({ cred }) => {
  try { localStorage.setItem('as_session', JSON.stringify({ userId: cred.userId, token: cred.token, user: cred.user })); } catch {}
}, { cred });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(BASE + '/account/profile', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: 'test-results/profile/before-desktop.png', fullPage: true });
console.log('desktop scrollWidth vs innerWidth:', await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth].join(' / ')));
console.log('profile content HTML:', (await page.evaluate(() => document.getElementById('account-content')?.innerText?.slice(0, 400) || 'NONE')));
const mobCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await mobCtx.addInitScript(({ cred }) => {
  try { localStorage.setItem('as_session', JSON.stringify({ userId: cred.userId, token: cred.token, user: cred.user })); } catch {}
}, { cred });
const mpage = await mobCtx.newPage();
mpage.on('console', m => { if (m.type() === 'error') errors.push('m-console: ' + m.text()); });
mpage.on('pageerror', e => errors.push('m-pageerror: ' + e.message));
await mpage.goto(BASE + '/account/profile', { waitUntil: 'load', timeout: 30000 });
await mpage.waitForTimeout(1200);
await mpage.screenshot({ path: 'test-results/profile/before-mobile.png', fullPage: true });
console.log('mobile scrollWidth vs innerWidth:', await mpage.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth].join(' / ')));
console.log(errors.join('\n') || 'no console errors');
await browser.close();
