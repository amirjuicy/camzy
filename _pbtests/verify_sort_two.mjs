import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage();
page.on('console', m => { if (m.type()==='error') console.log('ERR', m.text()); });
await page.goto('http://127.0.0.1:3000/shop.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const trigger = page.locator('.addr-province-trigger').first();
await trigger.click();
await page.waitForTimeout(300);
const items = page.locator('.addr-province-menu__item');
console.log('count open:', await items.count());
await items.nth(1).click(); // newest
await page.waitForTimeout(800);
console.log('after 2nd:', await page.locator('#shop-sort').inputValue());
// verify product order changed maybe
const firstCard = page.locator('.product-card').first();
console.log('first card text:', await firstCard.textContent().catch(()=> 'NA'));
await browser.close();