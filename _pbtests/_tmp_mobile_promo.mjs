import { chromium } from 'playwright';
const BASE='http://127.0.0.1:3000';
const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const ctx = await browser.newContext({viewport:{width:390,height:844}, isMobile:true, hasTouch:true});
for (const route of ['/','/faq','/shop']) {
  const page = await ctx.newPage();
  await page.goto(BASE+route, {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const bars = [...document.querySelectorAll('.promo-topbar')];
    return {
      siteHeaderDisplay: getComputedStyle(document.querySelector('.site-header')||document.body).display,
      mobileHeaderDisplay: getComputedStyle(document.querySelector('.mobile-header')||document.body).display,
      bars: bars.map(b => {
        const r=b.getBoundingClientRect();
        const parent=b.parentElement;
        const active=b.querySelector('.promo-topbar__msg.is-active');
        return {
          parentClass: parent ? parent.className+'#'+parent.id : null,
          ownDisplay: getComputedStyle(b).display,
          rectH:+r.height.toFixed(1), rectTop:+r.top.toFixed(1),
          inMobile: !!(b.closest('.mobile-header')),
          vpH: b.querySelector('.promo-topbar__viewport') ? +b.querySelector('.promo-topbar__viewport').getBoundingClientRect().height.toFixed(1) : null,
          activeText: active ? (active.querySelector('.promo-topbar__text')||active).textContent.trim() : null,
          activeImgSrc: active && active.querySelector('.promo-topbar__img') ? active.querySelector('.promo-topbar__img').getAttribute('src') : 'NO-IMG-ELEMENT'
        };
      })
    };
  });
  console.log('==== route', route, JSON.stringify(info, null, 1));
  await page.close();
}
await browser.close();
