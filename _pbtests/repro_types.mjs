import { openBuilder, getToken } from './helpers.mjs';

const token = await getToken();
const { browser, page, consoleErrors, pageErrors, failedRequests } = await openBuilder({ token });
const evalF = async (fn) => (page.frames().find(fr => fr !== page.mainFrame() && /\/page\//.test(fr.url()))).evaluate(fn);

async function setField(id, val) {
  await page.evaluate(({ id, val }) => { const el = document.getElementById(id); el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }, { id, val });
  await page.waitForTimeout(80);
}

// wait for content
await page.waitForFunction(() => {
  try { const f = document.getElementById('pb-iframe'); const d = f && (f.contentDocument || f.contentWindow.document); const b = d.getElementById('pg-body'); return !!(b && b.querySelector('p') && !/در حال بارگذاری/.test(b.textContent)); } catch (e) { return false; }
}, null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(300);

// 1. Add a 2-column section
await page.evaluate(() => document.querySelector('[data-pb-add="section-2"]').click());
await page.waitForTimeout(200);
// 2. Add an image
await page.evaluate(() => document.querySelector('[data-pb-add="image"]').click());
await page.waitForTimeout(200);

// select the image (last img in body) and set desktop geometry
await evalF(() => { const imgs = document.getElementById('pg-body').querySelectorAll('img'); const img = imgs[imgs.length - 1]; img.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
await page.waitForTimeout(200);
console.log('selected:', await page.evaluate(() => document.getElementById('pb-tag').textContent));
await setField('pb-x', '90');
await setField('pb-y', '40');
await setField('pb-w', '250');
await setField('pb-h', '150');

// count sections/images BEFORE save
const beforeCounts = await evalF(() => ({
  sections: document.querySelectorAll('[data-pb-sec]').length,
  cols: document.querySelectorAll('[data-pb-col]').length,
  imgs: document.querySelectorAll('#pg-body img').length,
}));
console.log('DOM before save:', JSON.stringify(beforeCounts));

// SAVE
await page.click('#pb-save');
await page.waitForTimeout(1300);
console.log('save status:', await page.evaluate(() => document.getElementById('pb-status').textContent));

// RELOAD
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { try { const f = document.getElementById('pb-iframe'); const d = f && (f.contentDocument || f.contentWindow.document); return !!(d && d.body && d.documentElement.getAttribute('data-pb-bound')); } catch (e) { return false; } }, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(700);

const after = await evalF(() => {
  const imgs = document.querySelectorAll('#pg-body img');
  const last = imgs[imgs.length - 1];
  const cs = last ? getComputedStyle(last) : null;
  return {
    sections: document.querySelectorAll('[data-pb-sec]').length,
    cols: document.querySelectorAll('[data-pb-col]').length,
    imgs: imgs.length,
    imgStyle: last ? last.getAttribute('style') : null,
    imgComputed: cs ? { left: cs.left, top: cs.top, width: cs.width, height: cs.height } : null,
  };
});
console.log('DOM after reload:', JSON.stringify(after, null, 2));

const countsOk = after.sections === beforeCounts.sections && after.cols === beforeCounts.cols && after.imgs === beforeCounts.imgs;
const geomOk = after.imgComputed && after.imgComputed.left === '90px' && after.imgComputed.top === '40px' && after.imgComputed.width === '250px' && after.imgComputed.height === '150px';
console.log('SECTION/IMAGE COUNTS PERSIST?', countsOk, `(${JSON.stringify(beforeCounts)} -> ${JSON.stringify({ sections: after.sections, cols: after.cols, imgs: after.imgs })})`);
console.log('IMAGE GEOMETRY PERSISTS?', geomOk);
console.log('CONSOLE ERRORS:', consoleErrors);
console.log('PAGE ERRORS:', pageErrors);
console.log('FAILED REQUESTS:', failedRequests);

await browser.close();
