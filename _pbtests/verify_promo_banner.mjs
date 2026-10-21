/* Browser-level verification for the top promo bar banner feature
   Admin → مدیریت صفحه اصلی → بنرهای تبلیغاتی → upload/select image → save
   → verify rendering on the storefront (desktop + mobile), then change
   top bar height / image dimensions, verify visually, verify persistence
   through /api/content, and collect console errors.
   Served copy under test: C:\Users\INO\Desktop\project\camzy\camzy\ */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:3000';
const ROOT = 'C:/Users/INO/Desktop/project/camzy';
const SHOTS = path.join(ROOT, '_pbtests', 'shots', 'promo-topbar');
fs.mkdirSync(SHOTS, { recursive: true });
const TEST_PNG = path.join(SHOTS, 'promo-topbar-test-banner.png');

const results = [];
function check(name, cond, detail = '') {
  const line = (cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '   [' + detail + ']' : '');
  console.log(line);
  results.push({ name, ok: !!cond, detail });
  return !!cond;
}
function hook(page, logs) {
  page.on('console', m => { if (m.type() === 'error') logs.consoleErrors.push(m.text()); });
  page.on('pageerror', e => logs.pageErrors.push(String(e)));
  page.on('requestfailed', r => logs.failed.push(r.url() + ' :: ' + (r.failure()?.errorText || '')));
  page.on('response', r => { if (r.status() >= 400) logs.failed.push(r.url() + ' :: HTTP ' + r.status()); });
}
async function apiLogin() {
  const r = await fetch(BASE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const j = await r.json();
  if (!j.token) throw new Error('admin login failed: ' + JSON.stringify(j));
  return j;
}
async function getContent() {
  return await (await fetch(BASE + '/api/content')).json();
}

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath: chromePath });
const adminLogs = { consoleErrors: [], pageErrors: [], failed: [] };
const storeLogs = { consoleErrors: [], pageErrors: [], failed: [] };

/* ── Phase 0: create a REAL test image (rendered by a real browser) ── */
{
  const p = await browser.newPage({ viewport: { width: 640, height: 128 } });
  await p.setContent(`<!doctype html><html dir="rtl"><body style="margin:0">
    <div style="width:640px;height:128px;background:linear-gradient(90deg,#e53935 0%,#fb8c00 100%);display:flex;align-items:center;justify-content:center;color:#fff;font-family:sans-serif;font-size:30px;font-weight:700">تست بنر نوار تبلیغاتی - کمزی</div>
  </body></html>`);
  await p.screenshot({ path: TEST_PNG });
  await p.close();
  check('test image created (real png)', fs.existsSync(TEST_PNG) && fs.statSync(TEST_PNG).size > 1000, fs.statSync(TEST_PNG).size + ' bytes');
}

/* ── Phase 1: Admin UI — upload/select image in بنرهای تبلیغاتی ── */
const login = await apiLogin();
const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const adminPage = await adminCtx.newPage();
hook(adminPage, adminLogs);
await adminPage.addInitScript((s) => {
  try { localStorage.setItem('as_admin_session', JSON.stringify(s)); } catch (e) {}
}, { token: login.token, admin: login.admin, userId: login.admin.id, remember: true, loginAt: Date.now() });

await adminPage.goto(BASE + '/admin/index.html#/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
await adminPage.waitForSelector('a.admin-nav__link[data-view="home"]', { timeout: 15000 }).catch(() => {});
await adminPage.click('a.admin-nav__link[data-view="home"]').catch(() => {});
await adminPage.waitForSelector('#home-topbar-height', { state: 'visible', timeout: 20000 }).catch(() => {});
const bannersCardVisible = await adminPage.evaluate(() => {
  const h2 = [...document.querySelectorAll('.adm-card__title')].find(h => h.textContent.includes('بنرهای تبلیغاتی'));
  return !!(h2 && h2.getBoundingClientRect().height > 0);
});
check('admin: card بنرهای تبلیغاتی visible in مدیریت صفحه اصلی', bannersCardVisible);

// Upload a real image through پیام ۱ picker
const beforeUpload = await adminPage.inputValue('#home-promo-1-image').catch(() => '');
await adminPage.click('button[data-media-target="home-promo-1-image"]');
await adminPage.waitForSelector('#adm-media-picker.is-open', { timeout: 10000 });
await adminPage.setInputFiles('#adm-mp-file', TEST_PNG);
// The form may already hold a previously-saved URL: wait for the field to
// point at a NEW (different) file so we track this run's upload.
await adminPage.waitForFunction((prev) => {
  const el = document.getElementById('home-promo-1-image');
  return !!(el && el.value && el.value !== prev);
}, beforeUpload, { timeout: 20000 }).catch(() => {});
const uploadedUrl = await adminPage.inputValue('#home-promo-1-image').catch(() => '');
check('admin: uploaded image auto-filled into پیام ۱ field', !!uploadedUrl && uploadedUrl !== beforeUpload, uploadedUrl || 'empty');

// Admin live-preview widgets right after picking (before saving)
const previewAfterPick = await adminPage.evaluate(() => {
  const pv = document.getElementById('home-promo-1-preview');
  const clearBtn = document.querySelector('[data-promo-clear-image="1"]');
  const liveMsg = document.getElementById('home-topbar-preview-msg');
  return {
    previewDisplay: pv ? pv.style.display : 'n/a',
    previewSrc: pv ? pv.getAttribute('src') : 'n/a',
    clearVisible: clearBtn ? clearBtn.style.display !== 'none' : false,
    liveHasImg: !!(liveMsg && liveMsg.querySelector('img'))
  };
});
check('admin: 32px preview thumbnail updates right after picking image',
  previewAfterPick.previewSrc === uploadedUrl && previewAfterPick.previewDisplay !== 'none',
  JSON.stringify(previewAfterPick));

// Select the same image for پیام ۲ and پیام ۳ from the gallery grid
for (const n of [2, 3]) {
  await adminPage.click(`button[data-media-target="home-promo-${n}-image"]`);
  await adminPage.waitForSelector('#adm-media-picker.is-open', { timeout: 10000 });
  await adminPage.click(`#adm-mp-grid [data-mp-pick="${uploadedUrl}"]`).catch(() => {});
  await adminPage.waitForFunction((u) => {
    const el = document.getElementById('home-promo-' + u.n + '-image');
    return !!(el && el.value === u.url);
  }, { n, url: uploadedUrl }, { timeout: 10000 }).catch(() => {});
  const v = await adminPage.inputValue(`#home-promo-${n}-image`).catch(() => '');
  check(`admin: image selected from gallery into پیام ${n}`, v === uploadedUrl, v || 'empty');
}

await adminPage.fill('#home-promo-1', 'ارسال رایگان ویژه تست بنر');
await adminPage.fill('#home-promo-2', 'تضمین اصالت کالا');
await adminPage.fill('#home-promo-3', '۷ روز ضمانت بازگشت کالا');
await adminPage.screenshot({ path: path.join(SHOTS, 'admin-banners-after-pick.png') });
await adminPage.click('button[data-home-save="banners"]');
await adminPage.waitForTimeout(1500);

let c1 = await getContent();
check('api: promo.topbar.1.image persisted', c1['promo.topbar.1.image'] === uploadedUrl, String(c1['promo.topbar.1.image']));
check('api: promo.topbar.2.image persisted', c1['promo.topbar.2.image'] === uploadedUrl, String(c1['promo.topbar.2.image']));
check('api: promo.topbar.3.image persisted', c1['promo.topbar.3.image'] === uploadedUrl, String(c1['promo.topbar.3.image']));
check('api: promo.topbar.1 text persisted', c1['promo.topbar.1'] === 'ارسال رایگان ویژه تست بنر', String(c1['promo.topbar.1']));

/* ── Phase 2: storefront rendering (desktop) ── */
const ROUTES = ['/', '/shop', '/brands', '/faq'];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function inspectRoute(ctx, route, tag) {
  const page = await ctx.newPage();
  hook(page, storeLogs);
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => {
    const bars = document.querySelectorAll('.promo-topbar');
    if (!bars.length) return false;
    let saw = false;
    bars.forEach(b => b.querySelectorAll('.promo-topbar__img').forEach(i => { if (i.getAttribute('src')) saw = true; }));
    return saw;
  }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(700);
  // A freshly-saved banner image may still be decoding when we measure;
  // wait (bounded) for the visible bar's active image to report intrinsic
  // size so naturalWidth checks aren't a capture-timing coin flip.
  await page.waitForFunction(() => {
    const bar = [...document.querySelectorAll('.promo-topbar')].find(b => b.getBoundingClientRect().height > 0);
    const i = bar && bar.querySelector('.promo-topbar__msg.is-active .promo-topbar__img');
    return !i || i.naturalWidth > 0;
  }, null, { timeout: 8000 }).catch(() => {});
  const info = await page.evaluate(() => {
    return [...document.querySelectorAll('.promo-topbar')].map(bar => {
      const cs = getComputedStyle(bar); const r = bar.getBoundingClientRect();
      const vp = bar.querySelector('.promo-topbar__viewport');
      const vr = vp ? vp.getBoundingClientRect() : null;
      const vcs = vp ? getComputedStyle(vp) : null;
      const activeMsg = bar.querySelector('.promo-topbar__msg.is-active');
      return {
        inMobileHeader: !!bar.closest('.mobile-header'),
        display: cs.display, barH: +r.height.toFixed(1), barW: +r.width.toFixed(1), barTop: +r.top.toFixed(1),
        vpH: vr ? +vr.height.toFixed(1) : null, varH: vcs ? vcs.getPropertyValue('--promo-topbar-height') : null,
        activeText: activeMsg ? (activeMsg.querySelector('.promo-topbar__text') || activeMsg).textContent.trim() : '',
        activeImg: activeMsg && activeMsg.querySelector('.promo-topbar__img') ? (i => ({
          src: i.getAttribute('src'), display: getComputedStyle(i).display, natW: i.naturalWidth, natH: i.naturalHeight,
          w: +i.getBoundingClientRect().width.toFixed(1), h: +i.getBoundingClientRect().height.toFixed(1),
          top: +i.getBoundingClientRect().top.toFixed(1)
        }))(activeMsg.querySelector('.promo-topbar__img')) : null,
        anyImg: !!bar.querySelector('.promo-topbar__img[src]'),
        activeTextDisplay: activeMsg && activeMsg.querySelector('.promo-topbar__text') ? getComputedStyle(activeMsg.querySelector('.promo-topbar__text')).display : 'n/a'
      };
    });
  });
  await page.screenshot({ path: path.join(SHOTS, `store-${tag}-${route === '/' ? 'home' : route.slice(1)}.png`) });
  await page.close();
  return info;
}

function assertBars(tag, route, info, expect) {
  if (!info.length) { check(`${tag} ${route}: promo bar exists`, false, 'no .promo-topbar'); return; }
  // The actually visible bar (desktop header is display:none with a zero rect
  // on mobile viewports and vice versa).
  const bar = info.find(b => b.barH > 0) || info.find(b => b.display !== 'none') || info[0];
  check(`${tag} ${route}: promo bar visible`, bar.display !== 'none' && bar.barH > 0, JSON.stringify({ mobile: bar.inMobileHeader, d: bar.display, h: bar.barH }));
  const img = bar.activeImg;
  check(`${tag} ${route}: active message has banner image rendered`,
    !!(img && img.src && img.display !== 'none' && img.natW > 0 && img.w > 0 && img.h > 0),
    JSON.stringify(img));
  if (expect && expect.text) {
    check(`${tag} ${route}: visible bar shows CMS text`, bar.activeText === expect.text, bar.activeText);
  }
  if (expect && expect.barH) {
    check(`${tag} ${route}: bar height matches setting`, Math.abs(bar.barH - expect.barH) <= 2, `bar=${bar.barH} want=${expect.barH}`);
  }
  if (expect && expect.vpH) {
    check(`${tag} ${route}: message viewport height matches setting`, Math.abs((bar.vpH || 0) - expect.vpH) <= 1.5, `vp=${bar.vpH} want=${expect.vpH}`);
  }
  if (expect && expect.fullBleed) {
    check(`${tag} ${route}: banner image fills bar edge-to-edge`,
      img && Math.abs(img.w - bar.barW) <= 2 && Math.abs(img.h - bar.barH) <= 2,
      `img=${img ? img.w + 'x' + img.h : 'n/a'} bar=${bar.barW + 'x' + bar.barH}`);
    check(`${tag} ${route}: text hidden behind banner image`,
      bar.activeTextDisplay === 'none', String(bar.activeTextDisplay));
  }
}

const CMS_TEXT1 = 'ارسال رایگان ویژه تست بنر';
const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
for (const route of ROUTES) {
  const info = await inspectRoute(desktopCtx, route, 'desktop');
  assertBars('desktop', route, info, { text: CMS_TEXT1 });
  await sleep(8000); // stay under the 120 req/min general API limiter
}

/* ── Phase 3: storefront rendering (mobile) ── */
const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
for (const route of ROUTES) {
  const info = await inspectRoute(mobileCtx, route, 'mobile');
  assertBars('mobile', route, info, { text: CMS_TEXT1 });
  await sleep(8000);
}

/* ── Phase 4: change top bar height + image dimensions ── */
await adminPage.bringToFront();
await adminPage.fill('#home-topbar-height', '60');
await adminPage.fill('#home-topbar-img-height', '40');
await adminPage.fill('#home-topbar-img-width', '64');
await adminPage.screenshot({ path: path.join(SHOTS, 'admin-banners-dims-set.png') });
await adminPage.click('button[data-home-save="banners"]');
await adminPage.waitForTimeout(1500);
const c2 = await getContent();
check('api: height/img dims persisted', c2['promo.topbar.height'] === '60' && c2['promo.topbar.img_height'] === '40' && c2['promo.topbar.img_width'] === '64',
  `${c2['promo.topbar.height']}/${c2['promo.topbar.img_height']}/${c2['promo.topbar.img_width']}`);

const DIMS = { barH: 61, vpH: 60, fullBleed: true, text: CMS_TEXT1 };
for (const route of ROUTES) {
  const info = await inspectRoute(desktopCtx, route, 'desktop-dims');
  assertBars('desktop-dims', route, info, DIMS);
  await sleep(8000);
}
// Mobile CSS: viewport = var - 5px → 55px, bar = 55 + 1px border = 56px
const DIMS_MOBILE = { barH: 56, vpH: 55, fullBleed: true, text: CMS_TEXT1 };
for (const route of ROUTES) {
  const info = await inspectRoute(mobileCtx, route, 'mobile-dims');
  assertBars('mobile-dims', route, info, DIMS_MOBILE);
  await sleep(8000);
}

/* ── Phase 5: persistence — fresh reloads (paced to stay clear of the
      120 req/min general API limiter) ── */
await sleep(20000);
await adminPage.reload({ waitUntil: 'domcontentloaded' });
await adminPage.waitForFunction(() => {
  const h = document.getElementById('home-topbar-height');
  return !!(h && h.value);
}, null, { timeout: 20000 }).catch(() => {});
const persistedForm = await adminPage.evaluate(() => ({
  h: (document.getElementById('home-topbar-height') || {}).value,
  ih: (document.getElementById('home-topbar-img-height') || {}).value,
  iw: (document.getElementById('home-topbar-img-width') || {}).value,
  img1: (document.getElementById('home-promo-1-image') || {}).value,
  msg1: (document.getElementById('home-promo-1') || {}).value,
  previewSrc: (document.getElementById('home-promo-1-preview') || {}).getAttribute?.('src')
}));
check('admin reload: form re-populated from /api/content',
  persistedForm.h === '60' && persistedForm.ih === '40' && persistedForm.iw === '64' &&
  persistedForm.img1 === uploadedUrl && persistedForm.msg1 === 'ارسال رایگان ویژه تست بنر',
  JSON.stringify(persistedForm));
await adminPage.screenshot({ path: path.join(SHOTS, 'admin-banners-after-reload.png') });

const c3 = await getContent();
check('reload: /api/content still holds image + dims',
  c3['promo.topbar.1.image'] === uploadedUrl && c3['promo.topbar.height'] === '60' &&
  c3['promo.topbar.img_width'] === '64' && c3['promo.topbar.img_height'] === '40');

const infoAfterReload = await inspectRoute(desktopCtx, '/', 'desktop-reload');
assertBars('desktop-reload', '/', infoAfterReload, DIMS);

/* ── Phase 6: console errors ── */
console.log('\n── admin console errors (' + adminLogs.consoleErrors.length + ') ──');
adminLogs.consoleErrors.forEach(e => console.log('  ERR ' + e));
console.log('── admin page errors (' + adminLogs.pageErrors.length + ') ──');
adminLogs.pageErrors.forEach(e => console.log('  PAGEERR ' + e));
console.log('── admin failed requests (' + adminLogs.failed.length + ') ──');
[...new Set(adminLogs.failed)].forEach(e => console.log('  REQ ' + e));
console.log('── storefront console errors (' + storeLogs.consoleErrors.length + ') ──');
storeLogs.consoleErrors.forEach(e => console.log('  ERR ' + e));
console.log('── storefront page errors (' + storeLogs.pageErrors.length + ') ──');
storeLogs.pageErrors.forEach(e => console.log('  PAGEERR ' + e));
console.log('── storefront failed requests (' + storeLogs.failed.length + ') ──');
[...new Set(storeLogs.failed)].forEach(e => console.log('  REQ ' + e));

const pass = results.filter(r => r.ok).length;
console.log(`\n== ${pass}/${results.length} checks passed ==`);
fs.writeFileSync(path.join(SHOTS, 'results.json'), JSON.stringify({ results, adminLogs, storeLogs }, null, 2));
await browser.close();
