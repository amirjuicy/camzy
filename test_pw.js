const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => {
    if(msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));
  try {
    await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const header = await page.$('.site-header');
    const headerHtml = await header.evaluate(el => el.innerHTML);
    console.log('Header HTML length:', headerHtml.length);
    console.log('Header HTML (first 500):', headerHtml.slice(0, 500));
    const mobileHeader = await page.$('.mobile-header');
    const mobileHtml = await mobileHeader.evaluate(el => el.innerHTML);
    console.log('Mobile Header HTML length:', mobileHtml.length);
    console.log('Mobile Header HTML (first 500):', mobileHtml.slice(0, 500));
    const promoTopbar = await page.$('.promo-topbar');
    if(promoTopbar) {
      const promoHtml = await promoTopbar.evaluate(el => el.outerHTML);
      console.log('Promo topbar found:', promoHtml.slice(0, 200));
    } else {
      console.log('Promo topbar NOT found');
    }
    const headerMain = await page.$('.header-main');
    if(headerMain) {
      const mainHtml = await headerMain.evaluate(el => el.outerHTML);
      console.log('Header main found:', mainHtml.slice(0, 200));
    } else {
      console.log('Header main NOT found');
    }
    const headerActions = await page.$('.header-actions');
    if(headerActions) {
      const actionsHtml = await headerActions.evaluate(el => el.outerHTML);
      console.log('Header actions found:', actionsHtml.slice(0, 200));
    } else {
      console.log('Header actions NOT found');
    }
    const headerAccount = await page.$('.header-account');
    if(headerAccount) {
      const accountHtml = await headerAccount.evaluate(el => el.outerHTML);
      console.log('Header account found:', accountHtml.slice(0, 200));
    } else {
      console.log('Header account NOT found');
    }
  } catch(e) {
    console.log('Error:', e.message);
  }
  console.log('Console errors:', errors);
  await browser.close();
})();