import { openBuilder, getToken } from './helpers.mjs';

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond });
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '   [' + detail + ']' : ''));
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function waitReady(pg) {
  await pg.waitForSelector('#pb-status', { timeout: 10000 });
  await pg.waitForFunction(() => ((document.getElementById('pb-status') || {}).textContent || '').includes('آماده'), null, { timeout: 30000 }).catch(() => {});
  await pg.waitForFunction(() => {
    try { const f = document.getElementById('pb-iframe'); const d = f && (f.contentDocument || f.contentWindow.document); return !!(d && d.body && d.documentElement.getAttribute('data-pb-bound')); }
    catch (e) { return false; }
  }, null, { timeout: 30000 }).catch(() => {});
  await pg.waitForFunction(() => {
    try {
      const f = document.getElementById('pb-iframe'); const d = f && (f.contentDocument || f.contentWindow.document);
      if (!d || !d.body) return false;
      const body = d.getElementById('pg-body');
      const bodyReady = !body || !/در حال بارگذاری/.test(body.textContent || '');
      return bodyReady && !d.getElementById('site-loader');
    } catch (e) { return false; }
  }, null, { timeout: 30000 }).catch(() => {});
  await wait(300);
}

const token = await getToken();
const { browser, page, consoleErrors, pageErrors, failedRequests } = await openBuilder({ token, viewport: { width: 1440, height: 900 } });

// ── generic helpers ────────────────────────────────────────────────────────
const clickSel = (which) => page.evaluate((which) => {
  const d = document.getElementById('pb-iframe').contentDocument;
  const ps = Array.from(d.querySelectorAll('#pg-body p'));
  let el = null;
  if (which === 'p0') el = ps.find(n => (n.textContent || '').indexOf('Test positioning') > -1);
  else if (which === 'txt') el = ps.find(n => (n.textContent || '').trim() === 'متن جدید');
  else if (which === 'btn') el = Array.from(d.querySelectorAll('#pg-body a,#pg-body button')).find(n => (n.textContent || '').trim() === 'دکمه جدید');
  else if (which === 'hr') el = d.querySelector('#pg-body hr');
  else if (which === 'hdr') el = Array.from(d.querySelectorAll('#site-header a,#site-header button,#site-header h1,#site-header h2,#site-header span'))
    .find(n => n.offsetParent !== null && (n.textContent || '').trim());
  if (!el) return false;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return true;
}, which);

const state = (which = 'p0') => page.evaluate((which) => {
  const d = document.getElementById('pb-iframe').contentDocument;
  const g = id => document.getElementById(id);
  const ps = Array.from(d.querySelectorAll('#pg-body p'));
  let p = null;
  if (which === 'txt') p = ps.find(n => (n.textContent || '').trim() === 'متن جدید');
  else p = ps.find(n => (n.textContent || '').indexOf('Test positioning') > -1);
  const cs = p ? d.defaultView.getComputedStyle(p) : null;
  const r = p ? p.getBoundingClientRect() : null;
  return {
    tag: g('pb-tag') ? g('pb-tag').textContent : '',
    panel: g('pb-panel') ? (g('pb-panel').style.display || '') : '',
    x: g('pb-x').value, y: g('pb-y').value, w: g('pb-w').value, h: g('pb-h').value,
    rot: g('pb-rotate').value, aspect: g('pb-aspect') ? g('pb-aspect').checked : null,
    pos: p ? p.style.position : '', inline: p ? (p.getAttribute('style') || '') : '',
    cLeft: cs ? cs.left : '', cTop: cs ? cs.top : '', cW: cs ? cs.width : '', cH: cs ? cs.height : '',
    cTr: cs ? cs.transform : '', cPos: cs ? cs.position : '',
    attrs: p ? {
      xT: p.getAttribute('data-pb-x-t'), xM: p.getAttribute('data-pb-x-m'),
      yT: p.getAttribute('data-pb-y-t'), wT: p.getAttribute('data-pb-w-t'), wM: p.getAttribute('data-pb-w-m'),
      rotT: p.getAttribute('data-pb-rot-t'), rotM: p.getAttribute('data-pb-rot-m'),
      ar: p.getAttribute('data-pb-ar'), pprom: p.hasAttribute('data-pb-pprom')
    } : {},
    rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null
  };
}, which);

const scrolls = () => page.evaluate(() => {
  const f = document.getElementById('pb-iframe'); const d = f.contentDocument;
  return {
    win: window.scrollY,
    stage: document.querySelector('.pb-stage').scrollTop,
    side: document.querySelector('.pb-side').scrollTop,
    frame: Math.max(f.contentWindow.scrollY || 0, d.documentElement.scrollTop || 0, d.body.scrollTop || 0)
  };
});
// measures how much scrollable overflow the preview document really has
// (uses behavior:'instant' — the site CSS sets scroll-behavior:smooth)
const frameProbe = (pg = page) => pg.evaluate(async () => {
  const f = document.getElementById('pb-iframe'); const d = f.contentDocument, w = f.contentWindow;
  const read = () => ({ w: w.scrollY || 0, de: d.documentElement.scrollTop || 0, b: d.body.scrollTop || 0 });
  const instant = t => { try { w.scrollTo({ top: t, behavior: 'instant' }); } catch (e) { w.scrollTo(0, t); } };
  const before = read();
  instant(before.w + 1000);
  d.documentElement.scrollTop = before.de + 1000; d.body.scrollTop = before.b + 1000;
  await new Promise(r => setTimeout(r, 150));
  const after = read();
  const delta = Math.max(after.w - before.w, after.de - before.de, after.b - before.b);
  instant(before.w);
  d.documentElement.scrollTop = before.de; d.body.scrollTop = before.b;
  await new Promise(r => setTimeout(r, 100));
  return delta;
});
async function box(sel) { const b = await page.locator(sel).boundingBox(); if (!b) throw new Error('no box ' + sel); return b; }
async function wheelAt(x, y, dy) { await page.mouse.move(x, y); await page.mouse.wheel(0, dy); await wait(250); }
const childPos = (which) => page.evaluate((which) => {
  const d = document.getElementById('pb-iframe').contentDocument;
  const ps = Array.from(d.querySelectorAll('#pg-body p'));
  const p = which === 'txt' ? ps.find(n => (n.textContent || '').trim() === 'متن جدید')
    : ps.find(n => (n.textContent || '').indexOf('Test positioning') > -1);
  if (!p) return -1;
  return Array.from(p.parentNode.children).indexOf(p);
}, which);
const yOf = (which) => page.evaluate((which) => {
  const d = document.getElementById('pb-iframe').contentDocument;
  const ps = Array.from(d.querySelectorAll('#pg-body p'));
  const p = which === 'txt' ? ps.find(n => (n.textContent || '').trim() === 'متن جدید')
    : ps.find(n => (n.textContent || '').indexOf('Test positioning') > -1);
  return p ? Math.round(p.getBoundingClientRect().y) : null;
}, which);
const bodyOrder = () => page.evaluate(() => {
  const d = document.getElementById('pb-iframe').contentDocument;
  return Array.from(d.querySelector('#pg-body').children).map(n => n.tagName === 'HR' ? 'HR' : (n.textContent || '').trim().slice(0, 10));
});
const mnum = tr => { const m = /matrix\(([^)]+)\)/.exec(tr || ''); return m ? m[1].split(',').map(v => parseFloat(v)) : null; };
const fill = async (id, v) => { await page.fill('#' + id, v); await wait(200); };

// ══════ 1. SCROLL INDEPENDENCE (desktop) ══════════════════════════════════
console.log('\n── Section 1: independent scrolling (desktop 1440×900) ──');
check('select object opens settings panel', (await clickSel('p0')) && (await state()).panel !== 'none');

const dims = await page.evaluate(() => {
  const side = document.querySelector('.pb-side'), stage = document.querySelector('.pb-stage'), html = document.documentElement;
  return {
    sideScroll: side.scrollHeight, sideClient: side.clientHeight,
    stageScroll: stage.scrollHeight, stageClient: stage.clientHeight,
    htmlOverflow: getComputedStyle(html).overflow,
    sideOsb: getComputedStyle(side).overscrollBehavior, stageOsb: getComputedStyle(stage).overscrollBehavior,
    topbarY: Math.round(document.querySelector('.pb-topbar').getBoundingClientRect().top),
    iframeH: Math.round(document.getElementById('pb-iframe').getBoundingClientRect().height),
    winScrollH: html.scrollHeight, winClientH: html.clientHeight
  };
});
check('sidebar content exceeds its box (scrollable)', dims.sideScroll > dims.sideClient + 50, dims.sideScroll + ' vs ' + dims.sideClient);
check('page cannot scroll (html overflow hidden)', /hidden|clip/.test(dims.htmlOverflow) && dims.winScrollH <= dims.winClientH + 1, dims.htmlOverflow + ' ' + dims.winScrollH + '/' + dims.winClientH);
check('overscroll-behavior contained on sidebar', /contain/.test(dims.sideOsb || ''), dims.sideOsb);
check('overscroll-behavior contained on stage', /contain/.test(dims.stageOsb || ''), dims.stageOsb);
check('toolbar pinned at viewport top', dims.topbarY === 0, 'top=' + dims.topbarY);
check('preview iframe fills the stage window', dims.iframeH > 500, 'iframeH=' + dims.iframeH);

const sideBox = await box('.pb-side'), stageBox = await box('.pb-stage'), fBox = await box('#pb-iframe');
// 1a. wheel over sidebar → sidebar to bottom, canvas + page still
let a = await scrolls();
await wheelAt(sideBox.x + sideBox.width / 2, sideBox.y + 40, 4000);
let b = await scrolls();
const sideAtBottom = b.side >= (dims.sideScroll - dims.sideClient) - 2;
check('scrolling sidebar reaches its bottom', sideAtBottom, b.side + '/' + (dims.sideScroll - dims.sideClient));
check('canvas stationary while sidebar scrolls', b.stage === a.stage && b.frame === a.frame, JSON.stringify({ a, b }));
check('page stationary while sidebar scrolls', b.win === a.win, a.win + '->' + b.win);
// sidebar at its end + extra wheel → still no page/canvas movement
a = await scrolls();
await wheelAt(sideBox.x + sideBox.width / 2, sideBox.y + 40, 400);
b = await scrolls();
check('no scroll chaining past sidebar end', b.win === a.win && b.stage === a.stage, JSON.stringify({ a, b }));

// 1b. wheel over canvas (preview iframe)
const frameOv = await frameProbe();
a = await scrolls();
await wheelAt(fBox.x + fBox.width / 2, fBox.y + Math.min(300, fBox.height / 2), 400);
b = await scrolls();
if (frameOv > 0) check('scrolling canvas (preview) works', b.frame > a.frame, a.frame + '->' + b.frame + ' (inner overflow ' + frameOv + 'px)');
else check('canvas wheel exercised (preview content fits its window — no inner overflow)', b.frame === a.frame, 'inner overflow 0px');
check('sidebar stationary while canvas scrolls', b.side === a.side, a.side + '->' + b.side);
check('page stationary while canvas scrolls', b.win === a.win, a.win + '->' + b.win);
// canvas scrolled to its end → no chaining to sidebar/page
await page.evaluate(() => { const f = document.getElementById('pb-iframe'); const d = f.contentDocument; f.contentWindow.scrollTo(0, d.documentElement.scrollHeight); d.body.scrollTop = d.body.scrollHeight; });
await wait(200);
a = await scrolls();
await wheelAt(fBox.x + fBox.width / 2, fBox.y + Math.min(300, fBox.height / 2), 400);
b = await scrolls();
check('no scroll chaining past canvas end', b.win === a.win && b.side === a.side && b.stage === a.stage, JSON.stringify({ a, b }));

// 1c. wheel over stage padding → nothing moves
a = await scrolls();
await wheelAt(stageBox.x + 6, stageBox.y + 30, 300);
b = await scrolls();
check('stage-area wheel does not chain to sidebar/page', b.side === a.side && b.win === a.win, JSON.stringify({ a, b }));

// ══════ 2. SELECTION + NUMERIC CONTROLS ═══════════════════════════════════
console.log('\n── Section 2: selection & geometry controls ──');
await page.evaluate(() => { const f = document.getElementById('pb-iframe'); f.contentWindow.scrollTo(0, 0); document.querySelector('.pb-side').scrollTop = 0; });
await clickSel('p0');
let st = await state();
check('controls populated with actual values (not zeros/stale)',
  st.x === '100px' && st.y === '50px' && st.w === '300px' && st.h === '200px' && st.rot === '45',
  JSON.stringify({ x: st.x, y: st.y, w: st.w, h: st.h, rot: st.rot }));
check('controls match rendered state',
  parseFloat(st.cLeft) === 100 && parseFloat(st.cTop) === 50 && Math.round(parseFloat(st.cW)) === 300 && Math.round(parseFloat(st.cH)) === 200,
  JSON.stringify({ l: st.cLeft, t: st.cTop, w: st.cW, h: st.cH }));

const r0 = st.rect;
await fill('pb-x', '180');
st = await state();
check('X edit applies immediately to object', st.cLeft === '180px', 'computed left=' + st.cLeft);
check('X edit moves object visually (+80px)', st.rect && Math.abs(st.rect.x - r0.x - 80) < 2, r0.x + '->' + st.rect.x);
await fill('pb-y', '120');
st = await state();
check('Y edit applies immediately to object', st.cTop === '120px', 'computed top=' + st.cTop);
check('Y edit moves object visually (+70px)', st.rect && Math.abs(st.rect.y - r0.y - 70) < 2, r0.y + '->' + st.rect.y);

await fill('pb-w', '350');
st = await state();
check('width edit renders (bare number → px)', st.cW === '350px', 'computed width=' + st.cW);
await fill('pb-h', '250');
st = await state();
check('height edit renders (bare number → px)', st.cH === '250px', 'computed height=' + st.cH);

// invalid values must not corrupt
await fill('pb-x', 'abc');
let st2 = await state();
check('invalid X ignored (no corruption)', st2.cLeft === '180px', st2.cLeft);
await fill('pb-w', '0');
st2 = await state();
check('invalid width (0) rejected', st2.cW === '350px', st2.cW);
await fill('pb-w', '-10');
st2 = await state();
check('invalid width (-10) rejected', st2.cW === '350px', st2.cW);
await fill('pb-y', '12.5');
st2 = await state();
check('decimal Y accepted', st2.cTop === '12.5px', st2.cTop);
await fill('pb-y', '120');

// percentage width
const pw = await page.evaluate(() => { const d = document.getElementById('pb-iframe').contentDocument; return d.querySelector('#pg-body p').parentNode.clientWidth; });
await fill('pb-w', '50%');
st = await state();
check('percentage width applies', Math.abs(parseFloat(st.cW) - pw * 0.5) < 2, st.cW + ' vs ' + (pw * 0.5));
await fill('pb-w', '350');

// rotation
await fill('pb-rotate', '90');
st = await state();
let m = mnum(st.cTr);
check('rotation visibly applies (90°)', m && Math.abs(m[0]) < 0.01 && Math.abs(m[1] - 1) < 0.01, st.cTr);
check('rotation changes rendered bounding box', st.rect && st.rect.w < st.rect.h, JSON.stringify(st.rect));
await fill('pb-rotate', '-45');
st = await state();
m = mnum(st.cTr);
check('negative rotation applies (-45°)', m && Math.abs(m[0] - 0.7071) < 0.01 && Math.abs(m[1] + 0.7071) < 0.01, st.cTr);
await fill('pb-rotate', '45');

// aspect-ratio lock
await fill('pb-w', '300'); await fill('pb-h', '200');
await page.click('#pb-aspect'); await wait(150);
st = await state();
check('aspect lock captures actual ratio (1.5)', st.aspect === true && Math.abs(parseFloat(st.attrs.ar) - 1.5) < 0.01, 'ar=' + st.attrs.ar);
await fill('pb-w', '600');
st = await state();
check('aspect lock: width 600 → height 400', st.h === '400px' && st.cH === '400px', st.h + '/' + st.cH);
await fill('pb-h', '300');
st = await state();
check('aspect lock: height 300 → width 450', st.w === '450px' && st.cW === '450px', st.w + '/' + st.cW);
const pw2 = await page.evaluate(() => { const d = document.getElementById('pb-iframe').contentDocument; return d.querySelector('#pg-body p').parentNode.clientWidth; });
await fill('pb-w', '50%');
st = await state();
const ratio = parseFloat(st.cW) / parseFloat(st.cH);
check('aspect lock holds with % width (ratio ≈ 1.5)', Math.abs(ratio - 1.5) < 0.02, 'ratio=' + ratio.toFixed(3));
await page.uncheck('#pb-aspect'); await wait(150);
const hBefore = (await state()).cH;
await fill('pb-w', '350');
st = await state();
check('aspect lock disabled → height untouched', st.cW === '350px' && st.cH === hBefore, st.cW + '/' + st.cH + ' (was ' + hBefore + ')');
check('aspect checkbox state readable from object', st.aspect === false && st.attrs.ar === null, 'ar=' + st.attrs.ar);

// static element promotion (added text element created in section 4 — do it here)
await page.click('[data-pb-add="text"]'); await wait(300);
await clickSel('txt');
st = await state('txt');
check('new (static) object: controls show real values, not zeros',
  st.x === '' && parseFloat(st.cW) > 0 && st.cPos === 'static' && st.w === Math.round(parseFloat(st.cW)) + 'px',
  JSON.stringify({ x: st.x, w: st.w, pos: st.cPos }));
const tx0 = st.rect.x;
await fill('pb-x', '100');
st = await state('txt');
check('X on static object promotes it to relative', st.pos === 'relative' && st.attrs.pprom === true, st.pos);
check('X on static object moves it (+100px)', st.cLeft === '100px' && Math.abs(st.rect.x - tx0 - 100) < 2, tx0 + '->' + st.rect.x);
await fill('pb-x', ''); await fill('pb-y', '');
st = await state('txt');
check('clearing X/Y restores original positioning', st.pos === '' && st.attrs.pprom === false && st.cPos === 'static', st.pos + '/' + st.cPos);

// ══════ 3. DRAG ON CANVAS ═════════════════════════════════════════════════
console.log('\n── Section 3: canvas drag ──');
await clickSel('p0');
await fill('pb-x', '180'); await fill('pb-y', '120');
await page.evaluate(() => { const d = document.getElementById('pb-iframe').contentDocument; d.querySelector('#pg-body p').scrollIntoView({ block: 'center' }); });
await wait(250);
const c = await page.evaluate(() => {
  const f = document.getElementById('pb-iframe');
  const p = f.contentDocument.querySelector('#pg-body p');
  const r = p.getBoundingClientRect(), fr = f.getBoundingClientRect();
  return { x: fr.left + r.left + r.width / 2, y: fr.top + r.top + r.height / 2 };
});
await page.mouse.move(c.x, c.y);
await page.mouse.down();
await page.mouse.move(c.x + 60, c.y + 40, { steps: 6 });
await wait(120);
await page.mouse.up();
await wait(300);
st = await state();
check('drag moves the object (+60/+40)', parseFloat(st.cLeft) === 240 && parseFloat(st.cTop) === 160, st.cLeft + '/' + st.cTop);
check('drag updates X/Y fields from stored position', st.x === '240px' && st.y === '160px', st.x + '/' + st.y);

// ══════ 4. OBJECT SWITCHING (no stale values) ═════════════════════════════
console.log('\n── Section 4: switching objects ──');
const afterDrag = await state();
check('header zone rendered (switch target exists)', await clickSel('hdr'), '');
let hs = await state();
check('selecting another object refreshes controls', hs.tag && hs.tag !== afterDrag.tag, hs.tag);
const hw = await page.evaluate(() => {
  const d = document.getElementById('pb-iframe').contentDocument;
  const el = Array.from(d.querySelectorAll('#site-header a,#site-header button,#site-header h1,#site-header h2,#site-header span'))
    .find(n => n.offsetParent !== null && (n.textContent || '').trim());
  return el ? Math.round(parseFloat(d.defaultView.getComputedStyle(el).width)) : null;
});
check('other object shows its real width', hs.w !== '' && Math.abs(parseInt(hs.w) - hw) <= 1, hs.w + ' vs rendered ' + hw);
check('other object shows a valid position value', hs.x !== 'NaN' && hs.x !== undefined && hs.x !== '0', 'x=' + hs.x);
await clickSel('p0');
st = await state();
check('reselecting original object restores its exact values (no stale)',
  st.x === afterDrag.x && st.y === afterDrag.y && st.w === afterDrag.w && st.h === afterDrag.h && st.rot === afterDrag.rot,
  JSON.stringify({ x: st.x, y: st.y, w: st.w, h: st.h, rot: st.rot }));

// ══════ 5. LAYER ORDER ════════════════════════════════════════════════════
console.log('\n── Section 5: layer order controls ──');
await page.click('[data-pb-add="button"]'); await wait(250);
await page.click('[data-pb-add="divider"]'); await wait(250);
let ord = await bodyOrder();
check('three test siblings added (plus original)', ord.length === 4, JSON.stringify(ord));

await clickSel('txt');
await page.click('#pb-layer-backward'); await wait(150);
check('backward: moves one step back', (await childPos('txt')) === 0, 'idx=' + (await childPos('txt')));
await page.click('#pb-layer-forward'); await wait(150);
check('forward: moves one step forward', (await childPos('txt')) === 1, 'idx=' + (await childPos('txt')));
await page.click('#pb-layer-front'); await wait(150);
const tFront = await childPos('txt'), yT = await yOf('txt'), yHr = await yOf('hr');
check('front: moves to top of layer stack', tFront === 3, 'idx=' + tFront);
check('front: visibly changes stacking (renders last)', yT > yHr, 'y=' + yT + ' vs hr y=' + yHr);
await page.click('#pb-layer-back'); await wait(150);
const tBack = await childPos('txt');
check('back: moves to bottom of layer stack', tBack === 0, 'idx=' + tBack);
check('back: visibly changes stacking (renders first)', (await yOf('txt')) < (await yOf('p0')), 'y=' + (await yOf('txt')) + ' vs p0 y=' + (await yOf('p0')));

// ══════ 6. RESPONSIVE MODE INDEPENDENCE ═══════════════════════════════════
console.log('\n── Section 6: desktop / tablet / mobile independence ──');
const mode = async m => { await page.click('[data-pb-stylemode="' + m + '"]'); await wait(450); };
await clickSel('p0');
await fill('pb-x', '150'); await fill('pb-y', '99'); await fill('pb-w', '320'); await fill('pb-h', '200'); await fill('pb-rotate', '30');
if (await page.isChecked('#pb-aspect')) { await page.uncheck('#pb-aspect'); await wait(150); }
st = await state();
check('desktop baseline set (inline)', st.cLeft === '150px' && st.cW === '320px', st.cLeft + '/' + st.cW);

await mode('tablet');
st = await state();
check('switching to tablet refreshes controls from tablet values', st.x === '' && st.w === '' && st.rot === '', JSON.stringify({ x: st.x, w: st.w, rot: st.rot }));
await fill('pb-x', '60'); await fill('pb-w', '260'); await fill('pb-rotate', '60');
st = await state();
check('tablet edit writes responsive attributes (not inline)',
  st.attrs.xT === '60px' && st.attrs.wT === '260px' && st.attrs.rotT === 'rotate(60deg)' &&
  /left:\s*150px/.test(st.inline) && /width:\s*320px/.test(st.inline) && /rotate\(30deg\)/.test(st.inline),
  JSON.stringify({ attrs: st.attrs, inline: st.inline }));
check('tablet override actually renders at tablet width',
  parseFloat(st.cLeft) === 60 && Math.round(parseFloat(st.cW)) === 260 && Math.abs(mnum(st.cTr)[0] - 0.5) < 0.01,
  st.cLeft + '/' + st.cW + '/' + st.cTr);
check('desktop values untouched by tablet edits', /left:\s*150px/.test(st.inline) && /rotate\(30deg\)/.test(st.inline), 'inline kept');

// drag in tablet mode must edit tablet values only (target the *selected* p0 — the
// layer test moved the added <p>تمتن جدید> to the front, so a bare querySelector would miss)
const c2 = await page.evaluate(() => {
  const f = document.getElementById('pb-iframe');
  const d = f.contentDocument;
  const p = Array.from(d.querySelectorAll('#pg-body p')).find(n => (n.textContent || '').indexOf('Test positioning') > -1);
  p.scrollIntoView({ block: 'center' });
  const r = p.getBoundingClientRect(), fr = f.getBoundingClientRect();
  return { x: fr.left + r.left + r.width / 2, y: fr.top + r.top + r.height / 2 };
});
await wait(250);
await page.mouse.move(c2.x, c2.y); await page.mouse.down();
await page.mouse.move(c2.x + 30, c2.y + 10, { steps: 5 }); await wait(120);
await page.mouse.up(); await wait(300);
st = await state();
check('drag in tablet mode updates tablet attrs only',
  st.attrs.xT === '90px' && st.attrs.yT === '109px' && /left:\s*150px/.test(st.inline) && /top:\s*99px/.test(st.inline),
  JSON.stringify({ xT: st.attrs.xT, yT: st.attrs.yT, inline: st.inline.slice(0, 80) }));
check('drag in tablet mode updates X/Y fields', st.x === '90px' && st.y === '109px', st.x + '/' + st.y);
// drop the drag-created tablet top override so mobile inherits desktop's top:99px
await fill('pb-y', '');

await mode('mobile');
await fill('pb-x', '20'); await fill('pb-w', '200'); await fill('pb-rotate', '10');
st = await state();
check('mobile edit writes its own attributes',
  st.attrs.xM === '20px' && st.attrs.wM === '200px' && st.attrs.rotM === 'rotate(10deg)',
  JSON.stringify({ xM: st.attrs.xM, wM: st.attrs.wM, rotM: st.attrs.rotM }));
check('mobile edit does not overwrite desktop/tablet values',
  st.attrs.xT === '90px' && st.attrs.wT === '260px' && /left:\s*150px/.test(st.inline) && /width:\s*320px/.test(st.inline),
  JSON.stringify({ xT: st.attrs.xT, wT: st.attrs.wT }));
check('mobile renders its own values (and inherits desktop top)',
  parseFloat(st.cLeft) === 20 && Math.round(parseFloat(st.cW)) === 200 && parseFloat(st.cTop) === 99 && Math.abs(mnum(st.cTr)[0] - Math.cos(10 * Math.PI / 180)) < 0.01,
  st.cLeft + '/' + st.cW + '/' + st.cTop + '/' + st.cTr);

await mode('desktop');
st = await state();
check('return to desktop restores desktop values',
  st.x === '150px' && st.y === '99px' && st.w === '320px' && st.rot === '30' &&
  parseFloat(st.cLeft) === 150 && Math.round(parseFloat(st.cW)) === 320 && Math.abs(mnum(st.cTr)[0] - Math.cos(30 * Math.PI / 180)) < 0.01,
  JSON.stringify({ x: st.x, y: st.y, w: st.w, rot: st.rot, cLeft: st.cLeft, cW: st.cW }));
await mode('tablet');
st = await state();
check('return to tablet restores tablet values',
  st.x === '90px' && st.y === '' && st.w === '260px' && st.rot === '60' && Math.round(parseFloat(st.cW)) === 260 && parseFloat(st.cTop) === 99,
  JSON.stringify({ x: st.x, y: st.y, w: st.w, rot: st.rot, cW: st.cW, cTop: st.cTop }));
await mode('mobile');
st = await state();
check('return to mobile restores mobile values',
  st.x === '20px' && st.w === '200px' && st.rot === '10' && Math.round(parseFloat(st.cW)) === 200,
  JSON.stringify({ x: st.x, w: st.w, rot: st.rot, cW: st.cW }));
await mode('desktop');

// ══════ 7. UNSAVED-CHANGE SAFETY + SAVE + RELOAD ══════════════════════════
console.log('\n── Section 7: persistence ──');
await clickSel('p0');
await fill('pb-y', '99');
await clickSel('p0'); await wait(200); // re-select so the fields hold canonical (unit-suffixed) values
const preSwitch = await state();
await clickSel('txt'); await wait(150);
await clickSel('p0'); await wait(150);
st = await state();
check('unsaved changes survive object switch', st.x === preSwitch.x && st.y === preSwitch.y && st.w === preSwitch.w,
  JSON.stringify({ before: { x: preSwitch.x, y: preSwitch.y, w: preSwitch.w }, after: { x: st.x, y: st.y, w: st.w } }));
await mode('tablet'); await mode('desktop');
st = await state();
check('unsaved changes survive mode round-trip', st.x === '150px' && st.y === '99px' && st.w === '320px', st.x + '/' + st.y + '/' + st.w);

const putResp = page.waitForResponse(r => r.url().includes('/api/admin/pages/about') && r.request().method() === 'PUT', { timeout: 15000 });
await page.click('#pb-save');
const pr = await putResp.catch(() => null);
await page.waitForFunction(() => ((document.getElementById('pb-status') || {}).textContent || '').includes('ذخیره شد'), null, { timeout: 15000 }).catch(() => {});
check('save API responded OK', pr && pr.status() >= 200 && pr.status() < 300, pr ? 'HTTP ' + pr.status() : 'no response');
check('save status reported in UI', ((await page.textContent('#pb-status')) || '').includes('ذخیره شد'), await page.textContent('#pb-status'));

const api = await fetch('http://127.0.0.1:3000/api/pages/about').then(r => r.json()).catch(e => ({ body: 'ERR ' + e }));
check('persisted body contains desktop styles', /left:\s*150px/.test(api.body || '') && /width:\s*320px/.test(api.body || ''), (api.body || '').slice(0, 200));
check('persisted body contains tablet attrs', (api.body || '').includes('data-pb-x-t="90px"') && (api.body || '').includes('data-pb-w-t="260px"'));
check('persisted body contains mobile attrs', (api.body || '').includes('data-pb-x-m="20px"') && (api.body || '').includes('data-pb-w-m="200px"'));
check('persisted body embeds responsive CSS', (api.body || '').includes('data-pb-responsive') && (api.body || '').includes('@media'));
check('builder artifacts stripped from saved body',
  !(api.body || '').includes('data-pb-id') && !(api.body || '').includes('contenteditable') && !(api.body || '').includes('data-pb-sel') && !(api.body || '').includes('pb-moving'));

// reload and verify everything is restored
await page.reload({ waitUntil: 'domcontentloaded' });
await waitReady(page);
await clickSel('p0');
st = await state();
check('after reload: desktop values restored into controls',
  st.x === '150px' && st.y === '99px' && st.w === '320px' && st.h === '200px' && st.rot === '30',
  JSON.stringify({ x: st.x, y: st.y, w: st.w, h: st.h, rot: st.rot }));
check('after reload: canvas shows restored values',
  parseFloat(st.cLeft) === 150 && parseFloat(st.cTop) === 99 && Math.round(parseFloat(st.cW)) === 320 && Math.round(parseFloat(st.cH)) === 200 &&
  Math.abs(mnum(st.cTr)[0] - Math.cos(30 * Math.PI / 180)) < 0.01,
  st.cLeft + '/' + st.cTop + '/' + st.cW + '/' + st.cH + '/' + st.cTr);
await mode('tablet');
st = await state();
check('after reload: tablet values restored', st.x === '90px' && st.y === '' && st.w === '260px' && st.rot === '60' && Math.round(parseFloat(st.cW)) === 260,
  JSON.stringify({ x: st.x, y: st.y, w: st.w, rot: st.rot, cW: st.cW }));
await mode('mobile');
st = await state();
check('after reload: mobile values restored', st.x === '20px' && st.w === '200px' && st.rot === '10' && Math.round(parseFloat(st.cW)) === 200,
  JSON.stringify({ x: st.x, w: st.w, rot: st.rot, cW: st.cW }));
await mode('desktop');
ord = await bodyOrder();
check('after reload: layer order persisted', JSON.stringify(ord) === JSON.stringify(['متن جدید', 'Test posit', 'دکمه جدید', 'HR']), JSON.stringify(ord));

// ══════ 8. CLEANUP (restore the about page) ═══════════════════════════════
console.log('\n── Section 8: cleanup + final save ──');
await clickSel('txt'); await page.click('#pb-delete'); await wait(200);
await clickSel('btn'); await page.click('#pb-delete'); await wait(200);
await clickSel('hr'); await page.click('#pb-delete'); await wait(200);
check('test siblings removed', JSON.stringify(await bodyOrder()) === JSON.stringify(['Test posit']), JSON.stringify(await bodyOrder()));
await clickSel('p0');
await fill('pb-x', '100'); await fill('pb-y', '50'); await fill('pb-w', '300'); await fill('pb-h', '200'); await fill('pb-rotate', '45');
if (await page.isChecked('#pb-aspect')) { await page.uncheck('#pb-aspect'); await wait(150); }
await mode('tablet'); await fill('pb-x', ''); await fill('pb-w', ''); await fill('pb-rotate', '');
await mode('mobile'); await fill('pb-x', ''); await fill('pb-w', ''); await fill('pb-rotate', '');
await mode('desktop');
const put2 = page.waitForResponse(r => r.url().includes('/api/admin/pages/about') && r.request().method() === 'PUT', { timeout: 15000 });
await page.click('#pb-save');
const pr2 = await put2.catch(() => null);
await page.waitForFunction(() => ((document.getElementById('pb-status') || {}).textContent || '').includes('ذخیره شد'), null, { timeout: 15000 }).catch(() => {});
check('cleanup save OK', pr2 && pr2.status() >= 200 && pr2.status() < 300, pr2 ? 'HTTP ' + pr2.status() : 'no response');
const api2 = await fetch('http://127.0.0.1:3000/api/pages/about').then(r => r.json()).catch(e => ({ body: 'ERR ' + e }));
const fb = api2.body || '';
check('about page restored to original geometry',
  /left:\s*100px/.test(fb) && /top:\s*50px/.test(fb) && /width:\s*300px/.test(fb) && /height:\s*200px/.test(fb) && /rotate\(45deg\)/.test(fb) && /font-size:\s*18px/.test(fb),
  fb.slice(0, 220));
check('no leftover responsive overrides on about page',
  !fb.includes('data-pb-x-t') && !fb.includes('data-pb-x-m') && !fb.includes('data-pb-rot-') && !fb.includes('متن جدید'), fb.slice(0, 120));

// ══════ 9. MOBILE VIEWPORT (390×844) ══════════════════════════════════════
console.log('\n── Section 9: narrow mobile viewport 390×844 ──');
const mob = await openBuilder({ token, viewport: { width: 390, height: 844 } });
const mp = mob.page;
const mbox = async sel => await mp.locator(sel).boundingBox();
async function mwheel(x, y, dy) { await mp.mouse.move(x, y); await mp.mouse.wheel(0, dy); await wait(250); }
const mscrolls = () => mp.evaluate(() => {
  const f = document.getElementById('pb-iframe'); const d = f.contentDocument;
  return { win: window.scrollY, stage: document.querySelector('.pb-stage').scrollTop, side: document.querySelector('.pb-side').scrollTop,
    frame: Math.max(f.contentWindow.scrollY || 0, d.documentElement.scrollTop || 0, d.body.scrollTop || 0) };
});
const mdims = await mp.evaluate(() => {
  const side = document.querySelector('.pb-side'), stage = document.querySelector('.pb-stage'), html = document.documentElement;
  return { sideH: Math.round(side.getBoundingClientRect().height), sideScroll: side.scrollHeight, sideClient: side.clientHeight,
    stageH: Math.round(stage.getBoundingClientRect().height), iframeH: Math.round(document.getElementById('pb-iframe').getBoundingClientRect().height),
    topbarY: Math.round(document.querySelector('.pb-topbar').getBoundingClientRect().top),
    htmlOverflow: getComputedStyle(html).overflow, sideOsb: getComputedStyle(side).overscrollBehavior, stageOsb: getComputedStyle(stage).overscrollBehavior };
});
check('mobile: toolbar visible at top', mdims.topbarY === 0, 'top=' + mdims.topbarY);
check('mobile: both panels have usable height', mdims.stageH > 200 && mdims.sideH > 150, 'stage=' + mdims.stageH + ' side=' + mdims.sideH);
check('mobile: preview iframe fits stage (no clipping)', mdims.iframeH > 250 && mdims.iframeH <= mdims.stageH, 'iframe=' + mdims.iframeH + ' stage=' + mdims.stageH);
check('mobile: page cannot scroll', /hidden|clip/.test(mdims.htmlOverflow), mdims.htmlOverflow);
check('mobile: overscroll contained', /contain/.test(mdims.sideOsb) && /contain/.test(mdims.stageOsb), mdims.sideOsb + '/' + mdims.stageOsb);
check('mobile: select object works', await mp.evaluate(() => {
  const d = document.getElementById('pb-iframe').contentDocument;
  const p = Array.from(d.querySelectorAll('#pg-body p')).find(n => (n.textContent || '').indexOf('Test positioning') > -1);
  if (!p) return false;
  p.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true;
}) && (await mp.evaluate(() => document.getElementById('pb-panel').style.display)) !== 'none', '');
const mst = await mp.evaluate(() => ({ x: document.getElementById('pb-x').value, w: document.getElementById('pb-w').value, tag: document.getElementById('pb-tag').textContent }));
check('mobile: controls populated', mst.x === '100px' && mst.w === '300px', JSON.stringify(mst));
await mp.fill('#pb-x', '170'); await wait(250);
const mgeo = await mp.evaluate(() => {
  const d = document.getElementById('pb-iframe').contentDocument;
  const p = Array.from(d.querySelectorAll('#pg-body p')).find(n => (n.textContent || '').indexOf('Test positioning') > -1);
  return { left: d.defaultView.getComputedStyle(p).left, field: document.getElementById('pb-x').value };
});
check('mobile: X edit applies', mgeo.left === '170px' && /^170(px)?$/.test(mgeo.field), JSON.stringify(mgeo));
await mp.fill('#pb-x', '100'); await wait(200);

let ms = await mscrolls();
const mSide = await mbox('.pb-side'), mFrame = await mbox('#pb-iframe');
await mwheel(mSide.x + mSide.width / 2, mSide.y + 40, 600);
let ms2 = await mscrolls();
check('mobile: sidebar scrolls', ms2.side > ms.side + 50, ms.side + '->' + ms2.side);
check('mobile: canvas/page stationary while sidebar scrolls', ms2.stage === ms.stage && ms2.frame === ms.frame && ms2.win === ms.win, JSON.stringify({ ms, ms2 }));
ms = ms2;
const mOv = await frameProbe(mp);
await mwheel(mFrame.x + mFrame.width / 2, mFrame.y + Math.min(150, mFrame.height / 2), 400);
ms2 = await mscrolls();
if (mOv > 0) check('mobile: canvas (preview) scrolls', ms2.frame > ms.frame, ms.frame + '->' + ms2.frame + ' (inner overflow ' + mOv + 'px)');
else check('mobile: canvas wheel exercised (no inner overflow)', ms2.frame === ms.frame, 'overflow=0');
check('mobile: sidebar/page stationary while canvas scrolls', ms2.side === ms.side && ms2.win === ms.win, JSON.stringify({ ms, ms2 }));
check('mobile: zero console errors', mob.consoleErrors.length === 0 && mob.pageErrors.length === 0, JSON.stringify(mob.consoleErrors.concat(mob.pageErrors)));
check('mobile: zero failed requests', mob.failedRequests.length === 0, JSON.stringify(mob.failedRequests));
await mob.browser.close();

// ══════ 10. TABLET VIEWPORT SANITY (768×1024) ═════════════════════════════
console.log('\n── Section 10: tablet viewport 768×1024 ──');
const tab = await openBuilder({ token, viewport: { width: 768, height: 1024 } });
const tp = tab.page;
const tdims = await tp.evaluate(() => ({
  win: window.scrollY, htmlOverflow: getComputedStyle(document.documentElement).overflow,
  sideH: Math.round(document.querySelector('.pb-side').getBoundingClientRect().height),
  stageH: Math.round(document.querySelector('.pb-stage').getBoundingClientRect().height),
  iframeH: Math.round(document.getElementById('pb-iframe').getBoundingClientRect().height),
  topbarY: Math.round(document.querySelector('.pb-topbar').getBoundingClientRect().top)
}));
check('tablet: no page scroll, topbar pinned, both panels usable',
  tdims.win === 0 && /hidden|clip/.test(tdims.htmlOverflow) && tdims.topbarY === 0 && tdims.stageH > 200 && tdims.sideH > 200,
  JSON.stringify(tdims));
// open the settings panel so the sidebar actually overflows before testing its scroll
const tabSel = await tp.evaluate(() => {
  const d = document.getElementById('pb-iframe').contentDocument;
  const p = Array.from(d.querySelectorAll('#pg-body p')).find(n => (n.textContent || '').indexOf('Test positioning') > -1);
  if (!p) return false;
  p.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return true;
});
await wait(400);
const tabPanel = await tp.evaluate(() => document.getElementById('pb-panel').style.display);
check('tablet: object selectable, settings panel opens', tabSel && tabPanel !== 'none', 'sel=' + tabSel + ' panel=' + tabPanel);
const tbSide = await tp.locator('.pb-side').boundingBox(); const tbFrame = await tp.locator('#pb-iframe').boundingBox();
const t0 = await tp.evaluate(() => document.querySelector('.pb-side').scrollTop);
await tp.mouse.move(tbSide.x + tbSide.width / 2, tbSide.y + 40); await tp.mouse.wheel(0, 400); await wait(250);
const t1 = await tp.evaluate(() => ({ side: document.querySelector('.pb-side').scrollTop, win: window.scrollY, stage: document.querySelector('.pb-stage').scrollTop }));
check('tablet: sidebar scrolls independently', t1.side > t0 && t1.win === 0 && t1.stage === 0, JSON.stringify({ t0, t1 }));
const tOv = await frameProbe(tp);
await tp.mouse.move(tbFrame.x + tbFrame.width / 2, tbFrame.y + Math.min(200, tbFrame.height / 2)); await tp.mouse.wheel(0, 400); await wait(250);
const t2 = await tp.evaluate(() => {
  const f = document.getElementById('pb-iframe'); const d = f.contentDocument;
  return { side: document.querySelector('.pb-side').scrollTop, win: window.scrollY,
    frame: Math.max(f.contentWindow.scrollY || 0, d.documentElement.scrollTop || 0, d.body.scrollTop || 0) };
});
if (tOv > 0) check('tablet: canvas scrolls, sidebar/page stay', t2.frame > 0 && t2.side === t1.side && t2.win === 0, JSON.stringify({ t2, tOv }));
else check('tablet: canvas wheel exercised (no inner overflow), sidebar/page stay', t2.frame === 0 && t2.side === t1.side && t2.win === 0, JSON.stringify({ t2, tOv }));
check('tablet: zero console errors', tab.consoleErrors.length === 0 && tab.pageErrors.length === 0, JSON.stringify(tab.consoleErrors.concat(tab.pageErrors)));
check('tablet: zero failed requests', tab.failedRequests.length === 0, JSON.stringify(tab.failedRequests));
await tab.browser.close();

// ══════ 11. DESKTOP CONSOLE / NETWORK ═════════════════════════════════════
console.log('\n── Section 11: desktop console & network ──');
check('desktop: zero console errors', consoleErrors.length === 0, JSON.stringify(consoleErrors));
check('desktop: zero page errors', pageErrors.length === 0, JSON.stringify(pageErrors));
check('desktop: zero failed/4xx requests', failedRequests.length === 0, JSON.stringify(failedRequests));

await browser.close();
const failed = results.filter(r => !r.ok);
console.log('\n══════════════════════════════════');
console.log('TOTAL: ' + results.length + '   PASS: ' + (results.length - failed.length) + '   FAIL: ' + failed.length);
failed.forEach(f => console.log('  ✗ ' + f.name));
process.exit(failed.length ? 1 : 0);
