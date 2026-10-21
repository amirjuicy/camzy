/* Visual proof: header stack + service-bar fully visible, no overlap (desktop + mobile). */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = 'C:/Users/INO/Desktop/project/camzy/_pbtests/shots/overlap-fix';
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: CHROME });

// Desktop @top
const d = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const dp = await d.newPage();
await dp.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await dp.waitForFunction(() => {
  const bar = document.querySelector('.promo-topbar');
  return bar && getComputedStyle(bar).getPropertyValue('--promo-topbar-height').trim() !== '';
}, null, { timeout: 20000 }).catch(() => {});
await dp.waitForTimeout(700);
await dp.screenshot({ path: path.join(SHOTS, 'desktop-top.png') });
// Clip the header+service-bar region for a close-up
await dp.screenshot({ path: path.join(SHOTS, 'desktop-header-closeup.png'), clip: { x: 0, y: 0, width: 1440, height: 320 } });
await d.close();

// Mobile @top + scrolled (sticky states)
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const mp = await m.newPage();
await mp.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await mp.waitForFunction(() => {
  const bar = document.querySelector('.promo-topbar');
  return bar && getComputedStyle(bar).getPropertyValue('--promo-topbar-height').trim() !== '';
}, null, { timeout: 20000 }).catch(() => {});
await mp.waitForTimeout(700);
await mp.screenshot({ path: path.join(SHOTS, 'mobile-top.png') });
await mp.evaluate(() => window.scrollTo(0, 500));
await mp.waitForTimeout(500);
await mp.screenshot({ path: path.join(SHOTS, 'mobile-scrolled.png') });
await m.close();

await browser.close();
console.log('screenshots saved to', SHOTS);
