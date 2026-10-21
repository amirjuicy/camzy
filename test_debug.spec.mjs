import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:3000';

test('debug product page', async ({ page }) => {
  await page.goto(BASE_URL + '/product?id=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  // Get page content
  const content = await page.content();
  console.log('=== PAGE CONTENT ===');
  console.log(content.substring(0, 10000));
  
  // Check for errors in console
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  await page.waitForTimeout(1000);
});