const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const pages = ['account', 'account/orders', 'account/profile', 'account/addresses', 'account/wishlist', 'account/notifications', 'account/cart'];

  for (const p of pages) {
    const url = `http://127.0.0.1:3000/${p}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const sidebarInfo = await page.evaluate(() => {
      const sb = document.querySelector('.account-sidebar');
      if (!sb) return null;
      const cs = getComputedStyle(sb);
      const rect = sb.getBoundingClientRect();
      return { position: cs.position, top: cs.top, width: cs.width, zIndex: cs.zIndex, rectWidth: rect.width, rectLeft: rect.left };
    });

    const contentInfo = await page.evaluate(() => {
      const c = document.querySelector('.account-content');
      if (!c) return null;
      const cs = getComputedStyle(c);
      return { marginLeft: cs.marginLeft };
    });

    console.log(`${p}: sidebar=${JSON.stringify(sidebarInfo)} content=${JSON.stringify(contentInfo)}`);

    await page.screenshot({ path: `C:\\Users\\INO\\AppData\\Local\\Temp\\opencode\\shot-${p.replace(/\//g, '_')}.png`, fullPage: false });
  }

  await browser.close();
  console.log('DONE');
})();
