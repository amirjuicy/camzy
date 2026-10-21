import { chromium } from 'playwright';
const UTOK = 'c0d33ec90a0ef45be4a70114cc75352f0264dd6c54627dac2f1e561630f39eeb';
const ATOK = 'dd3f9994ce86ef67ec24882ec33efba790fede4198552c9c2ba1019b90392e1c';
const TITLE = 'FLOW-TEST-' + Date.now();
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--no-sandbox'] });
const out = {};
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:3000/login.html');
  await page.evaluate((tok) => {
    const user = { id: 'u_mucd2sgsiwhpu', firstName: 'X', lastName: 'Y', mobile: '09303797187', email: 'a@b.c' };
    localStorage.setItem('as_session', JSON.stringify({ userId: user.id, token: tok, user }));
    sessionStorage.clear();
  }, UTOK);
  // storefront page (logged in)
  await page.goto('http://127.0.0.1:3000/shop.html');
  await page.waitForSelector('[data-notif-bell]', { timeout: 20000 });
  out.bellPresent = true;
  // admin creates notification AFTER user is active
  const created = await page.evaluate(async ({ a, t }) => {
    const r = await fetch('/api/admin/notifications', { method: 'POST', headers: { Authorization: 'Bearer ' + a, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t, message: 'popup flow body', type: 'info', target: 'all', isActive: true }) });
    return { status: r.status, body: await r.text() };
  }, { a: ATOK, t: TITLE });
  out.adminCreate = created.status;
  // wait for natural poll popup (poll=30s)
  await page.waitForSelector('.notif-popup', { timeout: 60000 });
  out.popupAppeared = await page.evaluate(() => document.querySelector('.notif-popup').innerText.slice(0, 120));
  out.popupHasClose = await page.evaluate(() => !!document.querySelector('.notif-popup__close'));
  // close popup via ×
  await page.click('.notif-popup__close');
  await page.waitForFunction(() => !document.querySelector('.notif-popup'), null, { timeout: 5000 });
  out.popupClosed = true;
  // bell badge still shows unread
  out.badgeAfterClose = await page.evaluate(() => {
    const b = document.querySelector('.header-notif__badge');
    return { text: b ? b.innerText : null, visible: b ? getComputedStyle(b).display !== 'none' : false };
  });
  // open bell panel
  await page.click('.header-notif__btn');
  await page.waitForSelector('.header-notif.is-open', { timeout: 5000 });
  out.panelListsNew = await page.evaluate((t) => {
    const l = document.querySelector('.header-notif__list');
    return l ? l.innerText.includes(t) : false;
  }, TITLE);
  // click the notification → read persists, badge clears
  await page.evaluate((t) => {
    const items = [...document.querySelectorAll('.header-notif__item')];
    const it = items.find(x => x.innerText.includes(t));
    if (it) it.click();
  }, TITLE);
  await page.waitForFunction(() => {
    const b = document.querySelector('.header-notif__badge');
    return b && getComputedStyle(b).display === 'none';
  }, null, { timeout: 10000 });
  out.badgeClearedAfterRead = true;
  // login page: no bell
  await page.goto('http://127.0.0.1:3000/login.html');
  await page.waitForTimeout(1500);
  out.noBellOnLogin = await page.evaluate(() => !document.querySelector('[data-notif-bell]'));
  // mobile viewport: bell present
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await mctx.newPage();
  await mp.goto('http://127.0.0.1:3000/login.html');
  await mp.evaluate((tok) => {
    const user = { id: 'u_mucd2sgsiwhpu', firstName: 'X', lastName: 'Y', mobile: '09303797187', email: 'a@b.c' };
    localStorage.setItem('as_session', JSON.stringify({ userId: user.id, token: tok, user }));
  }, UTOK);
  await mp.goto('http://127.0.0.1:3000/shop.html');
  await mp.waitForSelector('#mobile-header [data-notif-bell]', { timeout: 20000 });
  out.mobileBellPresent = true;
  await mctx.close();
  await ctx.close();
} catch (e) { out.error = String(e).slice(0, 500); }
console.log(JSON.stringify(out, null, 2));
await browser.close();
