import { chromium } from 'playwright';
const BASE='http://127.0.0.1:3000';
const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const ctx = await browser.newContext({viewport:{width:390,height:844}, isMobile:true, hasTouch:true});
const page = await ctx.newPage();
page.on('response', r => { if (r.url().includes('/api/content')) console.log('  /api/content response', r.status(), Date.now()%100000); });
await page.goto(BASE+'/faq', {waitUntil:'domcontentloaded'});
for (const t of [300, 700, 1500, 3000, 6000]) {
  await page.waitForTimeout(t === 300 ? 300 : t - [300,700,1500,3000,6000][[300,700,1500,3000,6000].indexOf(t)-1]);
  const s = await page.evaluate(() => {
    const bar = document.querySelector('.mobile-header .promo-topbar');
    if (!bar) return 'no mobile bar';
    const active = bar.querySelector('.promo-topbar__msg.is-active');
    const img = active && active.querySelector('.promo-topbar__img');
    return {
      varH: getComputedStyle(bar).getPropertyValue('--promo-topbar-height'),
      h: +bar.getBoundingClientRect().height.toFixed(1),
      imgSrc: img ? img.getAttribute('src') : 'NO-ELEMENT',
      text: active ? (active.querySelector('.promo-topbar__text')||active).textContent.trim().slice(0,30) : null,
      authKey: (document.getElementById('mobile-header')||{}).getAttribute ? document.getElementById('mobile-header').getAttribute('data-auth-key') : null,
      mobileHtmlHasImg: !!(bar.querySelector('.promo-topbar__img'))
    };
  });
  console.log('t=' + t, JSON.stringify(s));
}
await browser.close();
