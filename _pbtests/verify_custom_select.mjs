import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push(String(e)));

console.log('=== SHOP SORT ===');
await page.goto(BASE + '/shop.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
const trigger = page.locator('#shop-sort').locator('xpath=..').locator('button.addr-province-trigger');
console.log('trigger present:', await trigger.count());
await trigger.click();
await page.waitForTimeout(300);
const menuItems = page.locator('.addr-province-menu .addr-province-menu__item');
console.log('menu items:', await menuItems.count());
// Test each option updates value and reorder
const beforeValues = await menuItems.allTextContents();
console.log('items:', beforeValues);
for (let i = 0; i < 5; i++) {
  await trigger.click().catch(()=>{});
  await page.waitForTimeout(150);
  await menuItems.nth(i).click();
  await page.waitForTimeout(400);
  console.log('  selected value:', await page.locator('#shop-sort').inputValue(), 'first product:', await page.locator('.product-card .product-card__name').first().textContent().catch(()=>'' ));
}
// keyboard navigation
await trigger.click();
await page.waitForTimeout(150);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
console.log('keyboard selected:', await page.locator('#shop-sort').inputValue());

console.log('=== CHECKOUT STEP2 ===');
const page2 = await browser.newPage();
await page2.goto(BASE + '/checkout-step2.html', { waitUntil: 'networkidle' });
await page2.waitForTimeout(1000);
const provSel = page2.locator('#f-province');
console.log('province input before:', await provSel.inputValue());
const provTrigger = provSel.locator('xpath=..').locator('button.addr-province-trigger');
console.log('province trigger present:', await provTrigger.count());
await provTrigger.click();
await page2.waitForTimeout(300);
const provItems = page2.locator('.addr-province-menu .addr-province-menu__item');
console.log('province menu items:', await provItems.count());
await provItems.filter({ hasText: 'تهران' }).click();
await page2.waitForTimeout(400);
console.log('province after:', await provSel.inputValue());
const citySel = page2.locator('#f-city');
console.log('city items:', await page2.locator('.addr-province-menu .addr-province-menu__item').count());
// open city (may already be populated)
const cityTrigger = citySel.locator('xpath=..').locator('button.addr-province-trigger');
await cityTrigger.click().catch(()=>{});
await page2.waitForTimeout(400);
const cityItems2 = page2.locator('.addr-province-menu .addr-province-menu__item');
console.log('city menu items opened:', await cityItems2.count());
if (await cityItems2.count() > 0) {
  await cityItems2.nth(1).click();
  await page2.waitForTimeout(300);
}
console.log('city after:', await citySel.inputValue());

console.log('=== CONTACT SUBJECT ===');
const page3 = await browser.newPage();
await page3.goto(BASE + '/contact.html', { waitUntil: 'networkidle' });
await page3.waitForTimeout(1000);
const sel = page3.locator('select#? , select').first();
// find select elements
const allSelects = await page3.locator('select').count();
console.log('contact selects:', allSelects);

console.log('CONSOLE ERRORS (shop+others):', JSON.stringify([...consoleErrors, ...pageErrors], null, 1));
await browser.close();