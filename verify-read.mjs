import { chromium } from 'playwright';
const UTOK = 'c0d33ec90a0ef45be4a70114cc75352f0264dd6c54627dac2f1e561630f39eeb';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--no-sandbox'] });
const out = {};
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:3000/login.html');
  await page.evaluate((tok) => {
    const user = { id: 'u_mucd2sgsiwhpu', firstName: 'X', lastName: 'Y', mobile: '09303797187', email: 'a@b.c' };
    localStorage.setItem('as_session', JSON.stringify({ userId: user.id, token: tok, user }));
  }, UTOK);
  await page.goto('http://127.0.0.1:3000/shop.html');
  await page.waitForSelector('[data-notif-bell]', { timeout: 20000 });
  await page.waitForFunction(() => {
    const b = document.querySelector('.header-notif__badge');
    return b && getComputedStyle(b).display !== 'none';
  }, null, { timeout: 20000 });
  out.before = await page.evaluate(() => document.querySelector('.header-notif__badge').innerText);
  await page.click('.header-notif__btn');
  await page.waitForSelector('.header-notif.is-open', { timeout: 5000 });
  const target = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.header-notif__item.is-unread')];
    return items.length ? items[0].getAttribute('data-notif-id') : null;
  });
  out.clickedId = target;
  await page.evaluate((id) => {
    document.querySelector('.header-notif__item[data-notif-id="' + id + '"]').click();
  }, target);
  await page.waitForTimeout(3000);
  out.after = await page.evaluate(() => {
    const b = document.querySelector('.header-notif__badge');
    return { text: b.innerText, visible: getComputedStyle(b).display !== 'none' };
  });
  out.serverState = await page.evaluate(async ({ tok, id }) => {
    const r = await fetch('/api/notifications', { headers: { Authorization: 'Bearer ' + tok } });
    const j = await r.json();
    const it = j.items.find(x => String(x.id) === String(id));
    return { unreadCount: j.unreadCount, isRead: it ? it.isRead : null };
  }, { tok: UTOK, id: target });
  await ctx.close();
} catch (e) { out.error = String(e).slice(0, 300); }
console.log(JSON.stringify(out, null, 2));
await browser.close();
