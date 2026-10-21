import { chromium } from 'playwright';
const REAL_USER_TOKEN = 'c0d33ec90a0ef45be4a70114cc75352f0264dd6c54627dac2f1e561630f39eeb';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--no-sandbox'] });
const page = await browser.newPage();
const reqs = [];
page.on('response', async r => {
  if (r.url().includes('/api/notifications')) {
    reqs.push({ status: r.status(), body: (await r.text()).slice(0, 200) });
  }
});
await page.goto('http://127.0.0.1:3000/login.html');
await page.evaluate((tok) => {
  const user = { id: 'u_mucd2sgsiwhpu', firstName: 'X', lastName: 'Y', mobile: '09303797187', email: 'a@b.c' };
  localStorage.setItem('as_session', JSON.stringify({ userId: user.id, token: tok, user }));
}, REAL_USER_TOKEN);
await page.goto('http://127.0.0.1:3000/account.html');
await page.waitForSelector('#ac-notifs', { timeout: 15000 });
await page.waitForFunction(() => {
  const el = document.getElementById('ac-notifs-list');
  return el && !el.textContent.includes('در حال بارگذاری');
}, null, { timeout: 15000 });
const result = await page.evaluate(() => ({
  acNotifsExists: !!document.getElementById('ac-notifs'),
  accountJsLoaded: !!document.querySelector('script[src*="account.js"]'),
  commonLoaded: typeof window.App !== 'undefined',
  listNotificationsRuns: typeof window.App !== 'undefined' && typeof App.listNotifications,
  listText: document.getElementById('ac-notifs-list').innerText.slice(0, 500),
  newNotifVisible: document.getElementById('ac-notifs-list').innerText.includes('REAL-USER-VISIBLE'),
}));
console.log(JSON.stringify({ ...result, notifApiResponses: reqs }, null, 2));
await browser.close();
