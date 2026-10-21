import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:3003';
const cred = JSON.parse(await (await import('fs/promises')).readFile('_live_session.json', 'utf8'));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(({ cred }) => {
  try { localStorage.setItem('as_session', JSON.stringify({ userId: cred.userId, token: cred.token, user: cred.user })); } catch {}
}, { cred });
const page = await ctx.newPage();
await page.goto(BASE + '/account/profile', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1000);
await page.locator('#profile-form button[type="submit"]').scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.screenshot({ path: 'test-results/profile/after-mobile-viewport.png' });
const r = await page.evaluate(() => {
  const b = document.querySelector('#profile-form button[type="submit"]').getBoundingClientRect();
  return { btnBottom: Math.round(b.bottom), vh: window.innerHeight };
});
console.log('save button bottom viewport-relative vs vh:', r.btnBottom, '/', r.vh);
await browser.close();
