import { openBuilder, getToken } from './helpers.mjs';

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond });
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '   [' + detail + ']' : ''));
}

const token = await getToken();
const { browser, page, consoleErrors, pageErrors, failedRequests } = await openBuilder({ token, viewport: { width: 1440, height: 900 } });

// Wait for builder to be fully ready
await page.waitForSelector('#pb-status', { timeout: 10000 });
await page.waitForFunction(() => {
  try {
    const f = document.getElementById('pb-iframe');
    const d = f && (f.contentDocument || f.contentWindow.document);
    return !!(d && d.body && d.documentElement.getAttribute('data-pb-bound'));
  } catch (e) { return false; }
}, null, { timeout: 30000 }).catch(() => {});
await page.waitForFunction(() => {
  try {
    const f = document.getElementById('pb-iframe');
    const d = f && (f.contentDocument || f.contentWindow.document);
    return !!(d && d.body && !d.getElementById('site-loader'));
  } catch (e) { return false; }
}, null, { timeout: 30000 }).catch(() => {});
await wait(300);

// ── Section 1: Open builder and verify initial state ───────────────────────
console.log('\n── Section 1: open builder ──');

const builderOpen = await page.evaluate(() => {
  const iframe = document.getElementById('pb-iframe');
  const d = iframe && iframe.contentDocument;
  return !!(d && d.body && d.documentElement.getAttribute('data-pb-bound'));
});
check('builder opened and iframe bound', builderOpen);

const undoDisabled = await page.evaluate(() => document.getElementById('pb-undo').disabled);
const redoDisabled = await page.evaluate(() => document.getElementById('pb-redo').disabled);
check('undo initially disabled', undoDisabled);
check('redo initially disabled', redoDisabled);

// ── Section 2: Select an element ───────────────────────────────────────────
console.log('\n── Section 2: select element ──');

// The about page has a <p> with text starting with "فروشگاه تخصصی کمزی"
const selected = await page.evaluate(() => {
  const d = document.getElementById('pb-iframe').contentDocument;
  const ps = Array.from(d.querySelectorAll('#pg-body p'));
  const p = ps.find(n => (n.textContent || '').indexOf('فروشگاه تخصصی') > -1);
  if (p) {
    p.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }
  return false;
});
check('element selected', selected);
await wait(300);

const panelVisible = await page.evaluate(() => document.getElementById('pb-panel').style.display !== 'none');
check('settings panel visible after select', panelVisible);

const tagText = await page.evaluate(() => document.getElementById('pb-tag').textContent);
check('tag shows selected element', tagText && tagText.length > 0, tagText);

// ── Section 3: Edit the element ─────────────────────────────────────────────
console.log('\n── Section 3: edit element ──');

await page.fill('#pb-x', '200');
await wait(300);

const afterEdit = await page.evaluate(() => {
  const d = document.getElementById('pb-iframe').contentDocument;
  const ps = Array.from(d.querySelectorAll('#pg-body p'));
  const p = ps.find(n => (n.textContent || '').indexOf('فروشگاه تخصصی') > -1);
  return {
    left: p ? p.style.left : null,
    field: document.getElementById('pb-x').value
  };
});
check('X edit applied to element', afterEdit.left === '200px', JSON.stringify(afterEdit));

// After edit, undo should be enabled
const undoEnabledAfterEdit = await page.evaluate(() => !document.getElementById('pb-undo').disabled);
check('undo enabled after edit', undoEnabledAfterEdit);

// ── Section 4: Save ─────────────────────────────────────────────────────────
console.log('\n── Section 4: save ──');

const putResp = page.waitForResponse(r => r.url().includes('/api/admin/pages/about') && r.request().method() === 'PUT', { timeout: 15000 });
await page.click('#pb-save');
const pr = await putResp.catch(() => null);
await page.waitForFunction(() => ((document.getElementById('pb-status') || {}).textContent || '').includes('ذخیره شد'), null, { timeout: 15000 }).catch(() => {});
check('save API responded OK', pr && pr.status() >= 200 && pr.status() < 300, pr ? 'HTTP ' + pr.status() : 'no response');

const api = await fetch('http://127.0.0.1:3000/api/pages/about').then(r => r.json()).catch(e => ({ body: 'ERR ' + e }));
check('persisted body contains X=200px', /left:\s*200px/.test(api.body || ''), (api.body || '').slice(0, 200));

// ── Section 5: Reload and verify persistence ───────────────────────────────
console.log('\n── Section 5: reload ──');

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#pb-status', { timeout: 10000 });
await page.waitForFunction(() => {
  try {
    const f = document.getElementById('pb-iframe');
    const d = f && (f.contentDocument || f.contentWindow.document);
    return !!(d && d.body && d.documentElement.getAttribute('data-pb-bound'));
  } catch (e) { return false; }
}, null, { timeout: 30000 }).catch(() => {});
await page.waitForFunction(() => {
  try {
    const f = document.getElementById('pb-iframe');
    const d = f && (f.contentDocument || f.contentWindow.document);
    return !!(d && d.body && !d.getElementById('site-loader'));
  } catch (e) { return false; }
}, null, { timeout: 30000 }).catch(() => {});
await wait(300);

// Re-select the element
await page.evaluate(() => {
  const d = document.getElementById('pb-iframe').contentDocument;
  const ps = Array.from(d.querySelectorAll('#pg-body p'));
  const p = ps.find(n => (n.textContent || '').indexOf('فروشگاه تخصصی') > -1);
  if (p) p.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
});
await wait(300);

const afterReload = await page.evaluate(() => {
  const d = document.getElementById('pb-iframe').contentDocument;
  const ps = Array.from(d.querySelectorAll('#pg-body p'));
  const p = ps.find(n => (n.textContent || '').indexOf('فروشگاه تخصصی') > -1);
  return {
    left: p ? p.style.left : null,
    field: document.getElementById('pb-x').value
  };
});
check('after reload: X=200px restored', afterReload.left === '200px' && afterReload.field === '200px', JSON.stringify(afterReload));

// ── Section 6: Undo ────────────────────────────────────────────────────────
console.log('\n── Section 6: undo ──');

// Make a new edit so we have something to undo
await page.fill('#pb-x', '150');
await wait(300);

const beforeUndo = await page.evaluate(() => {
  const d = document.getElementById('pb-iframe').contentDocument;
  const ps = Array.from(d.querySelectorAll('#pg-body p'));
  const p = ps.find(n => (n.textContent || '').indexOf('فروشگاه تخصصی') > -1);
  return { left: p ? p.style.left : null, field: document.getElementById('pb-x').value };
});
check('pre-undo state: X=150px', beforeUndo.left === '150px', JSON.stringify(beforeUndo));

// Click undo
await page.click('#pb-undo');
await wait(500);

const afterUndo = await page.evaluate(() => {
  const d = document.getElementById('pb-iframe').contentDocument;
  const ps = Array.from(d.querySelectorAll('#pg-body p'));
  const p = ps.find(n => (n.textContent || '').indexOf('فروشگاه تخصصی') > -1);
  return { left: p ? p.style.left : null, field: document.getElementById('pb-x').value };
});
check('undo reverted X to 200px', afterUndo.left === '200px' && afterUndo.field === '200px', JSON.stringify(afterUndo));

// Redo should be enabled now
const redoEnabledAfterUndo = await page.evaluate(() => !document.getElementById('pb-redo').disabled);
check('redo enabled after undo', redoEnabledAfterUndo);

// ── Section 7: Redo ────────────────────────────────────────────────────────
console.log('\n── Section 7: redo ──');

await page.click('#pb-redo');
await wait(500);

const afterRedo = await page.evaluate(() => {
  const d = document.getElementById('pb-iframe').contentDocument;
  const ps = Array.from(d.querySelectorAll('#pg-body p'));
  const p = ps.find(n => (n.textContent || '').indexOf('فروشگاه تخصصی') > -1);
  return { left: p ? p.style.left : null, field: document.getElementById('pb-x').value };
});
check('redo restored X to 150px', afterRedo.left === '150px' && afterRedo.field === '150px', JSON.stringify(afterRedo));

// Undo again to restore original state
await page.click('#pb-undo');
await wait(500);

const afterUndo2 = await page.evaluate(() => {
  const d = document.getElementById('pb-iframe').contentDocument;
  const ps = Array.from(d.querySelectorAll('#pg-body p'));
  const p = ps.find(n => (n.textContent || '').indexOf('فروشگاه تخصصی') > -1);
  return { left: p ? p.style.left : null, field: document.getElementById('pb-x').value };
});
check('undo again: X back to 200px', afterUndo2.left === '200px', JSON.stringify(afterUndo2));

// ── Section 8: Save and cleanup ────────────────────────────────────────────
console.log('\n── Section 8: save and cleanup ──');

const put2 = page.waitForResponse(r => r.url().includes('/api/admin/pages/about') && r.request().method() === 'PUT', { timeout: 15000 });
await page.click('#pb-save');
const pr2 = await put2.catch(() => null);
await page.waitForFunction(() => ((document.getElementById('pb-status') || {}).textContent || '').includes('ذخیره شد'), null, { timeout: 15000 }).catch(() => {});
check('cleanup save OK', pr2 && pr2.status() >= 200 && pr2.status() < 300, pr2 ? 'HTTP ' + pr2.status() : 'no response');

const api2 = await fetch('http://127.0.0.1:3000/api/pages/about').then(r => r.json()).catch(e => ({ body: 'ERR ' + e }));
check('about page X=200px persisted', /left:\s*200px/.test(api2.body || ''), (api2.body || '').slice(0, 200));

// ── Section 9: Console errors ───────────────────────────────────────────────
console.log('\n── Section 9: console errors ──');
check('zero console errors', consoleErrors.length === 0, JSON.stringify(consoleErrors));
check('zero page errors', pageErrors.length === 0, JSON.stringify(pageErrors));
check('zero failed requests', failedRequests.length === 0, JSON.stringify(failedRequests));

await browser.close();

const failed = results.filter(r => !r.ok);
console.log('\n══════════════════════════════════');
console.log('TOTAL: ' + results.length + '   PASS: ' + (results.length - failed.length) + '   FAIL: ' + failed.length);
failed.forEach(f => console.log('  ✗ ' + f.name));
process.exit(failed.length ? 1 : 0);
