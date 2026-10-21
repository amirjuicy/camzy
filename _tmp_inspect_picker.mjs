import { chromium } from 'playwright';

const RES = await fetch('http://127.0.0.1:3000/api/admin/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' })
});
const login = await RES.json();
const token = login.token;
const admin = login.admin;

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--no-sandbox'] });
const out = {};
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') out['consoleErr_' + (out._i = (out._i || 0) + 1)] = m.text().slice(0, 160); });
  await page.goto('http://127.0.0.1:3000/login.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ t, a }) => {
    localStorage.setItem('as_admin_session', JSON.stringify({ token: t, admin: a, userId: a.id, loginAt: Date.now() }));
  }, { t: token, a: admin });
  await page.goto('http://127.0.0.1:3000/admin/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  out.url = page.url();
  out.navLinks = await page.evaluate(() => Array.from(document.querySelectorAll('.admin-nav__link')).map(a => a.getAttribute('data-view')));

  const catLink = await page.$('.admin-nav__link[data-view="categories"]');
  if (catLink) { await catLink.click(); await page.waitForTimeout(900); }
  out.catViewVisible = await page.evaluate(() => { const s = document.querySelector('[data-view="categories"]'); return s ? s.classList.contains('is-active') || getComputedStyle(s).display !== 'none' : false; });

  out.buttonsForMedia = await page.evaluate(() => Array.from(document.querySelectorAll('[data-media-target]')).map(b => ({ id: b.getAttribute('data-media-target'), text: b.textContent.trim(), visible: b.offsetParent !== null })));

  const addCat = await page.$('#adm-add-category, [data-cm-add], #adm-add-category-btn, [data-cat-add]');
  out.addCatFound = !!addCat;
  out.allButtons = await page.evaluate(() => Array.from(document.querySelectorAll('button, a')).filter(b => /دسته|category/i.test(b.id + ' ' + b.className)).map(b => b.id || b.className).slice(0, 20));
  if (addCat) { await addCat.click(); await page.waitForTimeout(600); }
  out.catModalOpen = await page.evaluate(() => { const m = document.getElementById('adm-category-modal') || document.querySelector('.adm-modal.is-open'); return m ? m.id : null; });

  const mediaBtn = await page.$('[data-media-target="adm-cm-icon"]');
  out.mediaBtnFound = !!mediaBtn;
  if (mediaBtn) {
    await mediaBtn.click();
    await page.waitForTimeout(2500);
    out.overlay = await page.evaluate(() => {
      const o = document.querySelector('#adm-media-picker');
      return o ? { open: o.classList.contains('is-open'), items: o.querySelectorAll('[data-mp-pick]').length } : null;
    });
    out.gridStyle = await page.evaluate(() => {
      const g = document.querySelector('#adm-mp-grid');
      if (!g) return null;
      const cs = getComputedStyle(g);
      return { display: cs.display, cols: cs.gridTemplateColumns, gap: cs.gap, maxHeight: cs.maxHeight, overflow: cs.overflow };
    });
    out.firstTile = await page.evaluate(() => {
      const b = document.querySelector('#adm-mp-grid [data-mp-pick]');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      const img = b.querySelector('img'); const nameEl = b.querySelector('.adm-mp-name');
      return { w: Math.round(r.width), h: Math.round(r.height), name: nameEl ? nameEl.textContent : null, imgLoaded: img ? (img.complete && img.naturalWidth > 0) : null, src: img ? img.getAttribute('src') : null };
    });
    out.svgCount = await page.evaluate(() => Array.from(document.querySelectorAll('#adm-mp-grid img')).filter(i => /\.svg(\?|$)/i.test(i.getAttribute('src') || '')).length);
    out.rasterCount = await page.evaluate(() => Array.from(document.querySelectorAll('#adm-mp-grid img')).filter(i => /\.(png|jpe?g|webp|gif|avif|bmp|ico)(\?|$)/i.test(i.getAttribute('src') || '')).length);
    await page.screenshot({ path: 'C:\\Users\\INO\\AppData\\Local\\Temp\\opencode\\picker-before.png', fullPage: false });

    out.before = await page.evaluate(() => { const f = document.querySelector('#adm-cm-icon'); return f ? f.value : null; });
    await page.click('#adm-mp-grid [data-mp-pick]');
    await page.waitForTimeout(700);
    out.afterSingleClick = await page.evaluate(() => ({
      fieldValue: document.querySelector('#adm-cm-icon') ? document.querySelector('#adm-cm-icon').value : null,
      previewSrc: (function () { const p = document.querySelector('#adm-cm-icon-preview'); return p ? p.getAttribute('src') : null; })(),
      overlayOpen: document.querySelector('#adm-media-picker').classList.contains('is-open')
    }));

    // reopen and test backdrop click
    if (!out.afterSingleClick.overlayOpen && mediaBtn) {
      await mediaBtn.click();
      await page.waitForTimeout(1500);
      out.reopenedItems = await page.evaluate(() => document.querySelectorAll('#adm-mp-grid [data-mp-pick]').length);
      const box = await page.$('#adm-media-picker .adm-modal__box');
      if (box) { await page.mouse.click(5, 5); await page.waitForTimeout(500); }
      out.afterBackdropClick = await page.evaluate(() => document.querySelector('#adm-media-picker').classList.contains('is-open'));
    }
  }
  await ctx.close();
} catch (e) { out.error = String(e).slice(0, 500); }
console.log(JSON.stringify(out, null, 2));
await browser.close();
