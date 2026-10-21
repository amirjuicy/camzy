import { openBuilder, getToken, check } from './helpers.mjs';

const token = await getToken();
const { browser, page, consoleErrors, pageErrors, failedRequests } = await openBuilder({ token });

const info = await page.evaluate(() => {
  const de = document.documentElement;
  return {
    winScrollH: de.scrollHeight, winClientH: de.clientHeight, innerH: window.innerHeight,
    bodyScrollH: document.body.scrollHeight,
    topbar: document.querySelector('.pb-topbar')?.getBoundingClientRect().height,
    layout: document.querySelector('.pb-layout')?.getBoundingClientRect().height,
    stage: (() => { const e = document.querySelector('.pb-stage'); const r = e.getBoundingClientRect(); return { h: r.height, scrollH: e.scrollHeight, oy: getComputedStyle(e).overflowY }; })(),
    side: (() => { const e = document.querySelector('.pb-side'); const r = e.getBoundingClientRect(); return { h: r.height, scrollH: e.scrollHeight, oy: getComputedStyle(e).overflowY }; })(),
    iframeH: document.getElementById('pb-iframe').getBoundingClientRect().height
  };
});
console.log('LAYOUT', JSON.stringify(info, null, 1));
check('page does not scroll (scrollHeight <= clientHeight)', info.winScrollH <= info.winClientH + 1, info.winScrollH + ' vs ' + info.winClientH);
check('sidebar overflows (scrollable)', info.side.scrollH > info.side.h, info.side.scrollH + ' vs ' + info.side.h);
check('stage overflows (scrollable)', info.stage.scrollH > info.stage.h, info.stage.scrollH + ' vs ' + info.stage.h);

// --- scroll sidebar: does stage/page move? ---
const before = await page.evaluate(() => ({
  stage: document.querySelector('.pb-stage').scrollTop,
  side: document.querySelector('.pb-side').scrollTop,
  win: window.scrollY
}));
await page.hover('.pb-side h2');
await page.mouse.wheel(0, 400);
await page.waitForTimeout(300);
const afterSide = await page.evaluate(() => ({
  stage: document.querySelector('.pb-stage').scrollTop,
  side: document.querySelector('.pb-side').scrollTop,
  win: window.scrollY
}));
console.log('WHEEL OVER SIDEBAR:', JSON.stringify({ before, afterSide }));
check('sidebar scrolled', afterSide.side > before.side, before.side + '->' + afterSide.side);
check('stage not moved by sidebar scroll', afterSide.stage === before.stage, before.stage + '->' + afterSide.stage);
check('page not moved by sidebar scroll', afterSide.win === before.win, before.win + '->' + afterSide.win);

// --- scroll stage: does sidebar/page move? ---
const b2 = await page.evaluate(() => ({
  stage: document.querySelector('.pb-stage').scrollTop,
  side: document.querySelector('.pb-side').scrollTop,
  win: window.scrollY
}));
await page.hover('.pb-stage .pb-frame');
await page.mouse.wheel(0, 400);
await page.waitForTimeout(300);
const a2 = await page.evaluate(() => ({
  stage: document.querySelector('.pb-stage').scrollTop,
  side: document.querySelector('.pb-side').scrollTop,
  win: window.scrollY
}));
console.log('WHEEL OVER STAGE:', JSON.stringify({ b2, a2 }));
check('stage scrolled', a2.stage > b2.stage, b2.stage + '->' + a2.stage);
check('sidebar not moved by stage scroll', a2.side === b2.side, b2.side + '->' + a2.side);
check('page not moved by stage scroll', a2.win === b2.win, b2.win + '->' + a2.win);

// --- select the about object and read controls ---
const fbody = await page.evaluateHandle(() => document.getElementById('pb-iframe').contentDocument.body);
await page.evaluate(() => {
  const d = document.getElementById('pb-iframe').contentDocument;
  const p = d.querySelector('#pg-body p');
  if (p) p.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
});
await page.waitForTimeout(300);
const ctl = await page.evaluate(() => {
  const g = id => (document.getElementById(id)?.value ?? null);
  const d = document.getElementById('pb-iframe').contentDocument;
  const p = d.querySelector('#pg-body p');
  const cs = p ? d.defaultView.getComputedStyle(p) : null;
  return {
    tag: document.getElementById('pb-tag')?.textContent,
    x: g('pb-x'), y: g('pb-y'), w: g('pb-w'), h: g('pb-h'), rot: g('pb-rotate'),
    aspect: document.getElementById('pb-aspect')?.checked,
    inline: p ? p.getAttribute('style') : null,
    computed: cs ? { left: cs.left, top: cs.top, width: cs.width, height: cs.height, transform: cs.transform, position: cs.position } : null,
    rect: p ? (() => { const r = p.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })() : null
  };
});
console.log('CONTROLS ON SELECT:', JSON.stringify(ctl, null, 1));

// --- change X ---
await page.fill('#pb-x', '180');
await page.waitForTimeout(250);
const afterX = await page.evaluate(() => {
  const d = document.getElementById('pb-iframe').contentDocument;
  const p = d.querySelector('#pg-body p');
  const r = p.getBoundingClientRect();
  return { styleLeft: p.style.left, rectX: Math.round(r.x), input: document.getElementById('pb-x').value };
});
console.log('AFTER X=180:', JSON.stringify(afterX));
check('X edit changes rendered position', Math.abs(afterX.rectX - ctl.rect.x - 80) < 12, 'rect x ' + ctl.rect.x + ' -> ' + afterX.rectX);

// --- change rotation ---
await page.fill('#pb-rotate', '90');
await page.waitForTimeout(250);
const afterR = await page.evaluate(() => {
  const d = document.getElementById('pb-iframe').contentDocument;
  const p = d.querySelector('#pg-body p');
  return { inline: p.style.transform, computed: d.defaultView.getComputedStyle(p).transform };
});
console.log('AFTER ROT=90:', JSON.stringify(afterR));

console.log('CONSOLE ERRORS:', JSON.stringify(consoleErrors, null, 1));
console.log('PAGE ERRORS:', JSON.stringify(pageErrors, null, 1));
console.log('FAILED REQ:', JSON.stringify(failedRequests.slice(0, 20), null, 1));

await browser.close();
