import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:3003';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const route of ['/', '/contact', '/about', '/checkout/step4']) {
  await page.goto(BASE + route, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(700);
  await page.screenshot({ path: `test-results/theme/sanity${route.replace(/\//g, '_') || '_home'}.png` });
  console.log('shot', route);
}
await browser.close();
