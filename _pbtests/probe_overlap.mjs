/* Overlap probe: measure promo-topbar vs header rows on the live served copy.
   Usage: node probe_overlap.mjs [height]   (height = promo.topbar.height to set via admin API; default = current)
   Measures desktop + mobile geometry at scroll 0 and scrolled (sticky) state. */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const heightArg = process.argv[2] ? parseInt(process.argv[2], 10) : null;

async function apiLogin() {
  const r = await fetch(BASE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const j = await r.json();
  if (!j.token) throw new Error('admin login failed: ' + JSON.stringify(j));
  return j;
}
async function getContent() { return await (await fetch(BASE + '/api/content')).json(); }
async function setContent(patch) {
  const login = await apiLogin();
  const r = await fetch(BASE + '/api/content', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token },
    body: JSON.stringify(patch)
  });
  return r.json();
}

const browser = await chromium.launch({ headless: true, executablePath: CHROME });

async function measure(ctx, label, scrollY) {
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  // wait for CMS content to apply (banner image + height var)
  await page.waitForFunction(() => {
    const bar = document.querySelector('.promo-topbar');
    return bar && getComputedStyle(bar).getPropertyValue('--promo-topbar-height').trim() !== '';
  }, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600);
  if (scrollY > 0) { await page.evaluate(y => window.scrollTo(0, y), scrollY); await page.waitForTimeout(500); }
  const m = await page.evaluate(() => {
    const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), h: +b.height.toFixed(1) }; };
    const cs = el => el ? getComputedStyle(el) : null;
    const bodyPadTop = cs(document.body).paddingTop;
    const header = document.querySelector('.site-header');
    const mHeader = document.querySelector('.mobile-header');
    const promo = document.querySelector('.promo-topbar');
    const service = document.querySelector('.service-bar');
    const shortcuts = document.querySelector('.mobile-shortcuts');
    const addr = document.querySelector('.mobile-address-bar');
    return {
      bodyPadTop,
      header: r(header),
      headerPos: cs(header).position,
      mobileHeader: r(mHeader),
      mobileHeaderDisplay: cs(mHeader).display,
      mobileHeaderPos: cs(mHeader).position,
      promo: r(promo),
      promoVar: promo ? cs(promo).getPropertyValue('--promo-topbar-height').trim() : null,
      service: r(service),
      serviceDisplay: cs(service).display,
      shortcuts: r(shortcuts),
      shortcutsTop: cs(shortcuts).top,
      shortcutsPos: cs(shortcuts).position,
      shortcutsDisplay: cs(shortcuts).display,
      addr: r(addr),
      addrDisplay: cs(addr).display,
      scrollY: window.scrollY
    };
  });
  await page.close();
  return { label, ...m };
}

function report(m) {
  console.log(`\n=== ${m.label} (scrollY=${m.scrollY}) ===`);
  console.log(`body padding-top: ${m.bodyPadTop}  | promo var: ${m.promoVar}`);
  if (m.promo) console.log(`promo bar:        top=${m.promo.top} bottom=${m.promo.bottom} h=${m.promo.h}`);
  if (m.headerDisplay !== 'none' && m.header) console.log(`site-header (${m.headerPos}): top=${m.header.top} bottom=${m.header.bottom} h=${m.header.h}`);
  if (m.mobileHeaderDisplay !== 'none' && m.mobileHeader) console.log(`mobile-header (${m.mobileHeaderPos}): top=${m.mobileHeader.top} bottom=${m.mobileHeader.bottom} h=${m.mobileHeader.h}`);
  if (m.shortcutsDisplay !== 'none' && m.shortcuts) console.log(`shortcuts (${m.shortcutsPos}, top:${m.shortcutsTop}): top=${m.shortcuts.top} bottom=${m.shortcuts.bottom}`);
  if (m.addrDisplay !== 'none' && m.addr) console.log(`address-bar: top=${m.addr.top} bottom=${m.addr.bottom}`);
  if (m.serviceDisplay !== 'none' && m.service) console.log(`service-bar: top=${m.service.top} bottom=${m.service.bottom} h=${m.service.h}`);

  // Overlap checks (only where elements are actually rendered; content
  // scrolling under a fixed/sticky header past scrollY=0 is normal behavior)
  const overlaps = [];
  if (m.header && m.service && m.serviceDisplay !== 'none' && m.scrollY === 0) {
    const ov = m.header.bottom - m.service.top;
    if (ov > 0.5) overlaps.push(`FIXED header overlaps service-bar by ${ov.toFixed(1)}px`);
  }
  if (m.mobileHeader && m.shortcuts && m.shortcutsDisplay !== 'none') {
    const ov = m.mobileHeader.bottom - m.shortcuts.top;
    if (ov > 0.5) overlaps.push(`mobile-header overlaps shortcuts by ${ov.toFixed(1)}px`);
  }
  if (m.shortcuts && m.service && m.shortcutsDisplay !== 'none' && m.serviceDisplay !== 'none') {
    const ov = m.shortcuts.bottom - m.service.top;
    if (ov > 0.5) overlaps.push(`shortcuts overlaps service-bar by ${ov.toFixed(1)}px`);
  }
  if (m.addr && m.service && m.addrDisplay !== 'none' && m.serviceDisplay !== 'none') {
    const ov = m.addr.bottom - m.service.top;
    if (ov > 0.5) overlaps.push(`address-bar overlaps service-bar by ${ov.toFixed(1)}px`);
  }
  if (overlaps.length) overlaps.forEach(o => console.log('  OVERLAP → ' + o));
  else console.log('  no overlap ✓');
}

// Optionally set a new promo height through the admin API (requires the endpoint; fall back silently)
if (heightArg && heightArg >= 20 && heightArg <= 100) {
  try { await setContent({ 'promo.topbar.height': String(heightArg) }); console.log(`set promo.topbar.height = ${heightArg}`); }
  catch (e) { console.log('could not set height via API:', e.message); }
}

// Desktop
const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
report(await measure(dCtx, 'desktop 1440 @top', 0));
report(await measure(dCtx, 'desktop 1440 scrolled', 400));
await dCtx.close();

// Mobile
const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
report(await measure(mCtx, 'mobile 390 @top', 0));
report(await measure(mCtx, 'mobile 390 scrolled', 400));
await mCtx.close();

await browser.close();
