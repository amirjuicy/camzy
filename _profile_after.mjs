import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:3003';
const cred = JSON.parse(await (await import('fs/promises')).readFile('_live_session.json', 'utf8'));
const seed = async (ctx) => ctx.addInitScript(({ cred }) => {
  try { localStorage.setItem('as_session', JSON.stringify({ userId: cred.userId, token: cred.token, user: cred.user })); } catch {}
}, { cred });
const browser = await chromium.launch();
const results = [];
const log = (k, v) => { results.push(k + ': ' + v); console.log(k + ': ' + v); };

/* ── Desktop 1440×900 ── */
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await seed(ctx);
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(BASE + '/account/profile', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: 'test-results/profile/after-desktop.png', fullPage: true });
log('desktop overflow (scrollWidth/innerWidth)', await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth].join(' / ')));
log('desktop key elements', await page.evaluate(() =>
  ['#profile-form', '#profile-firstname', '#profile-lastname', '#profile-mobile', '#profile-email',
   '#password-form', '#profile-add-address-btn', '#pw-current', '#pw-next', '#pw-confirm']
    .map(s => s + '=' + (document.querySelector(s) ? 1 : 0)).join(' ')));
log('desktop pw order', await page.evaluate(() => Array.from(document.querySelectorAll('#password-form input[type="password"]')).map(i => i.id).join(',')));
log('desktop pw-input baseline-y', await page.evaluate(() => {
  const a = document.getElementById('pw-current'), b = document.getElementById('pw-next'), c = document.getElementById('pw-confirm');
  return [a, b, c].map(i => Math.round(i.getBoundingClientRect().top)).join(',');
}));
log('desktop layout', await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('.acp-card')).map(c => Math.round(c.getBoundingClientRect().width));
  const grid = document.querySelector('#profile-form .acp-grid');
  const cols = grid ? getComputedStyle(grid).gridTemplateColumns : 'none';
  const save = document.querySelector('#profile-form button[type="submit"]');
  const cs = save ? getComputedStyle(save) : null;
  return 'cards=' + cards.join('/') + ' gridCols=' + cols + ' saveBtn=' + (cs ? cs.backgroundColor + ' h=' + cs.height : 'none');
}));
log('desktop font check', await page.evaluate(() => {
  const t = document.querySelector('.acp-card__title');
  return t ? getComputedStyle(t).fontFamily.slice(0, 40) + ' | ' + getComputedStyle(t).color : 'none';
}));

/* cancel button restores edited value */
const origFn = await page.inputValue('#profile-firstname');
await page.fill('#profile-firstname', origFn + 'X');
await page.click('#profile-form button[type="button"]');
await page.waitForTimeout(500);
log('cancel restores value', await page.inputValue('#profile-firstname') === origFn ? 'PASS' : 'FAIL');

/* password validate-only toasts (no API write) */
await page.fill('#pw-current', 'test123');
await page.fill('#pw-next', 'test123');
await page.fill('#pw-confirm', 'nomatch');
await page.click('#password-form button[type="submit"]');
await page.waitForTimeout(400);
log('pw mismatch toast', await page.evaluate(() => document.body.innerText.includes('تکرار رمز عبور مطابقت ندارد') ? 'PASS' : 'FAIL'));
await page.click('#password-form button[type="button"]'); // پاک کردن
await page.waitForTimeout(200);
log('pw reset clears fields', await page.evaluate(() => Array.from(document.querySelectorAll('#password-form input[type="password"]')).every(i => i.value === '') ? 'PASS' : 'FAIL'));

/* address modal opens from inlined button */
await page.click('#profile-add-address-btn');
await page.waitForTimeout(600);
log('address modal opens', await page.evaluate(() => !!document.getElementById('address-modal-overlay') ? 'PASS' : 'FAIL'));
await page.evaluate(() => window.AccountPage.closeAddressModal());

/* save profile (write) then restore */
await page.fill('#profile-firstname', origFn + 'Y');
await page.click('#profile-form button[type="submit"]');
await page.waitForTimeout(1800);
log('save toast', await page.evaluate(() => document.body.innerText.includes('اطلاعات با موفقیت ذخیره شد') ? 'PASS' : 'FAIL'));
log('saved value in input', await page.inputValue('#profile-firstname') === origFn + 'Y' ? 'PASS' : 'FAIL: ' + await page.inputValue('#profile-firstname'));
await page.fill('#profile-firstname', origFn);
await page.click('#profile-form button[type="submit"]');
await page.waitForTimeout(1800);
log('restore toast', await page.evaluate(() => document.body.innerText.includes('اطلاعات با موفقیت ذخیره شد') ? 'PASS' : 'FAIL'));
log('restored value', await page.inputValue('#profile-firstname') === origFn ? 'PASS' : 'FAIL: ' + await page.inputValue('#profile-firstname'));
await ctx.close();

/* ── Mobile 390×844 ── */
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await seed(mctx);
const mpage = await mctx.newPage();
const merrors = [];
mpage.on('console', m => { if (m.type() === 'error') merrors.push('m-console: ' + m.text()); });
mpage.on('pageerror', e => merrors.push('m-pageerror: ' + e.message));
await mpage.goto(BASE + '/account/profile', { waitUntil: 'load', timeout: 30000 });
await mpage.waitForTimeout(1200);
await mpage.screenshot({ path: 'test-results/profile/after-mobile.png', fullPage: true });
log('mobile overflow', await mpage.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth].join(' / ')));
log('mobile grid 1col + touch targets', await mpage.evaluate(() => {
  const grid = getComputedStyle(document.querySelector('#profile-form .acp-grid')).gridTemplateColumns;
  const inH = Math.round(document.getElementById('profile-firstname').getBoundingClientRect().height);
  const btn = document.querySelector('#profile-form button[type="submit"]');
  const btnR = btn.getBoundingClientRect();
  return 'gridCols=' + grid + ' inputH=' + inH + ' saveBtn=' + Math.round(btnR.width) + 'x' + Math.round(btnR.height);
}));
log('mobile addr buttons', await mpage.evaluate(() => {
  const b = document.getElementById('profile-add-address-btn').getBoundingClientRect();
  const a = document.querySelector('#account-content');
  return 'addrBtn=' + Math.round(b.width) + 'x' + Math.round(b.height) + ' contentScrollW=' + a.scrollWidth + ' contentClientW=' + a.clientWidth;
}));
log('mobile errors', merrors.join(' | ') || 'none');
log('desktop errors', errors.join(' | ') || 'none');
await mctx.close();
await browser.close();
