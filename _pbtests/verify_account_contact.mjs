import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage();
page.on('console', m=>{ if(m.type()==='error') console.log('ERR', m.text()); });
await page.goto('http://127.0.0.1:3000/account-contact.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
console.log('selects:', await page.locator('select').count());
console.log('triggers:', await page.locator('.addr-province-trigger').count());
await browser.close();