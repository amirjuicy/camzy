/* UI-level end-to-end: storefront login flow with admin credentials still
 * leads to the panel, then the panel logout returns to the login page. */
import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:3003';
await new Promise((r) => setTimeout(r, 45000)); /* let the API rate limiter window drain */
const browser = await chromium.launch();

// Log in through the real storefront login form
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(BASE + '/login', { waitUntil: 'load', timeout: 30000 });
await page.fill('#login-identifier', 'admin');
await page.fill('#login-password', 'admin123');
await page.click('#login-password-form button[type=submit]');
await page.waitForTimeout(2500);
const toast = await page.evaluate(() => {
  const t = document.querySelector('.toast, [class*=toast]');
  return t ? t.textContent.trim() : null;
});
console.log('login toast/msg:', toast);
await page.waitForURL(/\/(account|admin)/, { timeout: 20000 }).catch(() => {});
console.log('after storefront login url:', page.url());
console.log('set-cookie captured on login POST:', (await ctx.cookies()).some(c => c.name === 'cam_admin_token'));

// Navigate to /admin with ONLY the cookie (fresh navigation, no localStorage seeding)
await page.goto(BASE + '/admin', { waitUntil: 'load', timeout: 30000 });
const gateGone = await page.waitForFunction(() => !document.getElementById('admin-boot'), null, { timeout: 20000 }).then(() => true).catch(() => false);
const active = await page.evaluate(() => document.querySelector('.admin-view.is-active')?.getAttribute('data-view') || null);
console.log('RESULT storefront-login -> /admin:', gateGone && active === 'dashboard' ? 'PASS' : 'FAIL',
  `url=${page.url()} gateRemoved=${gateGone} activeView=${active}`);

// Page load performed without any localStorage token (cookie-only)? clear and reload
await page.evaluate(() => localStorage.clear());
await page.goto(BASE + '/admin', { waitUntil: 'load', timeout: 30000 });
const again = await page.waitForFunction(() => !document.getElementById('admin-boot'), null, { timeout: 20000 }).then(() => true).catch(() => false);
const active2 = await page.evaluate(() => document.querySelector('.admin-view.is-active')?.getAttribute('data-view') || null);
console.log('RESULT cookie-only reload:', again && active2 === 'dashboard' ? 'PASS' : 'FAIL', `activeView=${active2}`);

// Panel logout via the sidebar button (confirm dialog accepted)
page.once('dialog', (d) => d.accept());
await page.click('.admin-nav__logout, [data-logout]');
await page.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {});
console.log('after panel logout url:', page.url());
console.log('cookie removed:', !(await ctx.cookies()).some(c => c.name === 'cam_admin_token' && c.value));
await page.goto(BASE + '/admin', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
console.log('RESULT after logout /admin blocked:', /\/login/.test(page.url()) ? 'PASS' : 'FAIL', `url=${page.url()}`);
await browser.close();
