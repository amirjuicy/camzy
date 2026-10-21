// Rendered-page theme audit for the red/white/black theme fix.
// Scans computed styles for unintended yellow and dark-on-red text, takes screenshots.
// Auth: stores a token in localStorage so account pages render signed-in state.
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3003';
const cred = JSON.parse(await (await import('fs/promises')).readFile('_live_session.json', 'utf8'));

const ROUTES = [
  ['/account', 'account-dashboard'],
  ['/account/profile', 'account-profile'],
  ['/account/addresses', 'account-addresses'],
  ['/account/orders', 'account-orders'],
  ['/account/orders/' + encodeURIComponent(cred.orderRef || 'ORD-MV533I2R'), 'account-order-detail'],
  ['/account/wishlist', 'account-wishlist'],
  ['/cart', 'account-cart'],
  ['/account/notifications', 'account-notifications'],
  ['/account/contact', 'account-contact'],
];

/* --- colour utils --- */
const parseColor = (c) => {
  const m = /rgba?\(([^)]+)\)/.exec(c || '');
  if (!m) return null;
  const p = m[1].split(',').map(Number);
  if (p.length === 4 && p[3] === 0) return null; // fully transparent
  const [r, g, b] = p;
  return { r, g, b };
};
const toHSL = ({ r, g, b }) => {
  [r, g, b] = [r, g, b].map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
};
const LUM = ({ r, g, b }) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const CONTRAST = (a, b) => {
  const l1 = LUM(a), l2 = LUM(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

const audit = async (page) => page.evaluate(() => {
  const out = { yellows: [], reds: [] };
  const parse = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return null;
    const p = m[1].split(',').map(Number);
    if (p.length === 4 && p[3] === 0) return null;
    return { r: p[0], g: p[1], b: p[2] };
  };
  const lum = ({ r, g, b }) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const hsl = ({ r, g, b }) => {
    const rr = r / 255, gg = g / 255, bb = b / 255;
    const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: l * 100 };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    return { h: h * 60, s: s * 100, l: l * 100 };
  };
  const els = document.querySelectorAll('body *');
  for (const el of els) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const rects = [...(el.getClientRects ? el.getClientRects() : [])];
    const r0 = el.getBoundingClientRect();
    if (!r0.width || !r0.height) continue;
    const bg = parse(cs.backgroundColor);
    const tag = el.tagName.toLowerCase();
    const id = el.id ? '#' + el.id : '';
    const cls = (typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 3).map(c => '.' + c).join('') : '');
    const label = `${tag}${id}${cls}`;
    const area = r0.width * r0.height;
    // yellow check on solid bg / text / borders
    for (const [kind, v] of [['bg', bg], ['text', parse(cs.color)]]) {
      if (!v) continue;
      const { h, s, l } = hsl(v);
      if (s > 28 && l > 25 && l < 92 && ((h >= 38 && h <= 70) || (h < 20 && s > 20 && l > 60 && l < 80))) {
        out.yellows.push({ label, kind, value: v && `rgb(${v.r},${v.g},${v.b})`, h: Math.round(h), s: Math.round(s), l: Math.round(l), area: Math.round(area) });
      }
    }
    // saturated red fill areas
    if (bg && area > 12000) {
      const { h, s, l } = hsl(bg);
      if ((h < 22 || h > 340) && s > 40) out.reds.push({ label, value: `rgb(${bg.r},${bg.g},${bg.b})`, area: Math.round(area) });
    }
    // box-shadow yellow: parse every rgb() tuple, flag yellow hues only
    const sh = cs.boxShadow;
    if (sh) {
      for (const m of sh.matchAll(/rgba?\(([^)]+)\)/g)) {
        const p = m[1].split(',').map(Number);
        const v = parse(`rgb(${p[0]},${p[1]},${p[2]})`);
        if (!v) continue;
        const { h, s, l } = hsl(v);
        if (s > 25 && l > 20 && l < 95 && h >= 35 && h <= 75) {
          out.yellows.push({ label, kind: 'box-shadow', value: m[0], h: Math.round(h), s: Math.round(s), l: Math.round(l), area: Math.round(area) });
          break;
        }
      }
    }
    // contrast: non-transparent text and bg
    const txt = (el.textContent || '').trim();
    if (txt && [[el, 'own']].length) {
      const fg = parse(cs.color);
      if (fg && bg) {
        const c = (lum(fg) + 0.05) / (lum(bg) + 0.05);
        const { h, s, l } = hsl(bg);
        const { h: fh, s: fs } = hsl(fg);
        const bgRed = (h < 22 || h > 340) && s > 40 && l < 55;
        const fgDark = lum(fg) < 0.25;
        if (bgRed && fgDark && [ ...el.childNodes ].some(n => n.nodeType === 3 && n.textContent.trim())) {
          out.yellows.push({ label, kind: 'contrast dark-on-red', value: `${cs.color} on ${cs.backgroundColor} ratio ${c.toFixed(2)}`, area: Math.round(area) });
        }
      }
    }
  }
  return out;
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// seed auth token before any page loads
await ctx.addInitScript(({ cred }) => {
  try {
    localStorage.setItem('as_session', JSON.stringify({
      userId: cred.userId,
      token: cred.token,
      user: cred.user,
    }));
  } catch {}
}, { cred });

const summary = {};
for (const view of ['desktop', 'mobile']) {
  for (const [route, name] of ROUTES) {
    const page = await ctx.newPage();
    if (view === 'mobile') {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ media: 'screen' });
    }
    try {
      const resp = await page.goto(BASE + route, { waitUntil: 'load', timeout: 30000 });
      if (!resp || resp.status() >= 400) { console.log(`FAIL ${route} HTTP ${resp && resp.status()}`); continue; }
      await page.waitForTimeout(600);
      const url = page.url();
      const res = await audit(page);
      await page.screenshot({ path: `test-results/theme/${view}-${name}.png`, fullPage: false });
      summary[`${view}/${url}`] = 'ok';
      const flat = [...res.yellows, ...res.reds.map(r => ({ label: r.label, kind: 'big-red-fill', value: `${r.value} area=${r.area}`, h: 'red', s: 'red', l: 'red', area: r.area }))];
      console.log(`\n== ${view.toUpperCase()} ${url}`);
      if (flat.length === 0) console.log('  clean: no unintended yellow, no dark-on-red, no oversized red fills');
      for (const y of flat.slice(0, 40)) console.log(`  [${y.kind}] ${y.label} → ${y.value}`);
      await page.close();
    } catch (e) {
      console.log(`ERROR ${view} ${route}: ${e.message}`);
    }
  }
}

// Auth pages render redirected-to-dashboard when a session exists → guest context
{
  const guestCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const mobCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  for (const [ctxv, view] of [[guestCtx, 'desktop'], [mobCtx, 'mobile']]) {
    for (const [route, name] of [['/login', 'login'], ['/register', 'register']]) {
      const page = await ctxv.newPage();
      try {
        const resp = await page.goto(BASE + route, { waitUntil: 'load', timeout: 30000 });
        if (!resp || resp.status() >= 400) { console.log(`FAIL ${route} HTTP ${resp && resp.status()}`); continue; }
        await page.waitForTimeout(500);
        const res = await audit(page);
        await page.screenshot({ path: `test-results/theme/${view}-${name}.png`, fullPage: false });
        const flat = res.yellows;
        console.log(`\n== GUEST-${view.toUpperCase()} ${page.url()}`);
        if (flat.length === 0) console.log('  clean');
        for (const y of flat.slice(0, 40)) console.log(`  [${y.kind}] ${y.label} → ${y.value}`);
      } catch (e) { console.log(`ERROR guest ${view} ${route}: ${e.message}`); }
      await page.close();
    }
  }
  await guestCtx.close(); await mobCtx.close();
}
await browser.close();
console.log('\nDONE');
