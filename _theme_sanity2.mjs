import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:3003';
const browser = await chromium.launch();

const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null; const p = m[1].split(',').map(Number); if (p.length === 4 && p[3] === 0) return null; return { r: p[0], g: p[1], b: p[2] }; };
const lum = ({ r, g, b }) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const hsl = ({ r, g, b }) => {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min; const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h; if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0); else if (max === gg) h = (bb - rr) / d + 2; else h = (rr - gg) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
};

const audit = (page) => page.evaluate(() => {
  const out = { yellows: [], darkOnRed: [] };
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null; const p = m[1].split(',').map(Number); if (p.length === 4 && p[3] === 0) return null; return { r: p[0], g: p[1], b: p[2] }; };
  const lum = ({ r, g, b }) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const hsl = ({ r, g, b }) => {
    const rr = r / 255, gg = g / 255, bb = b / 255;
    const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: l * 100 };
    const d = max - min; const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h; if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0); else if (max === gg) h = (bb - rr) / d + 2; else h = (rr - gg) / d + 4;
    return { h: h * 60, s: s * 100, l: l * 100 };
  };
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r0 = el.getBoundingClientRect();
    if (!r0.width || !r0.height) continue;
    const id = el.id ? '#' + el.id : '';
    const cls = (typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).map(c => '.' + c).join('') : '');
    const label = `${el.tagName.toLowerCase()}${id}${cls}`;
    for (const [kind, v] of [['bg', parse(cs.backgroundColor)], ['text', parse(cs.color)]]) {
      if (!v) continue;
      const { h, s, l } = hsl(v);
      if (s > 28 && l > 25 && l < 92 && h >= 38 && h <= 70) out.yellows.push({ label, kind, value: `rgb(${v.r},${v.g},${v.b})` });
    }
    const fg = parse(cs.color), bg = parse(cs.backgroundColor);
    const txt = el.childNodes && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (txt && fg && bg) {
      const { h, s, l } = hsl(bg);
      if ((h < 22 || h > 340) && s > 40 && l < 55 && lum(fg) < 0.25) {
        out.darkOnRed.push({ label, value: `${cs.color} on ${cs.backgroundColor}` });
      }
      const yf = hsl(fg);
      if (yf.s > 28 && l > 25 && l < 92 && yf.h >= 38 && yf.h <= 70) out.yellows.push({ label, kind: 'text', value: cs.color });
    }
  }
  return out;
});

for (const route of ['/', '/contact', '/about']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE + route, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  const res = await audit(page);
  await page.screenshot({ path: `test-results/theme/sanity${route === '/' ? '_home' : route.replace(/\//g, '_')}.png` });
  console.log(`\n== ${route}`);
  if (res.yellows.length === 0 && res.darkOnRed.length === 0) console.log('  clean');
  res.yellows.slice(0, 20).forEach(y => console.log(`  [yellow ${y.kind}] ${y.label} → ${y.value}`));
  res.darkOnRed.slice(0, 20).forEach(d => console.log(`  [dark-on-red] ${d.label} → ${d.value}`));
  await page.close();
}
await browser.close();
console.log('\nDONE');
