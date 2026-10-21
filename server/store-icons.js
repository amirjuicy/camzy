/* Camzy — derived store icons (favicon + PWA).
 *
 * The client (assets/js/store-logo.js) points the favicon/apple-touch-icon at
 * assets/images/uploads/store/icon-{32,180,192,512}.png whenever store.logo is
 * set. This module produces those PNGs from the saved logo — and removes them
 * when the logo is cleared or invalid — so the declared URLs always resolve.
 * Rasterization uses puppeteer-core + a system/Playwright Chromium (both
 * already available), so no new dependency is required. */
const fs = require('fs');
const path = require('path');

const ICON_SIZES = [32, 180, 192, 512];
const ICON_DIR = path.join(__dirname, '..', 'assets', 'images', 'uploads', 'store');
const PROJECT_ROOT = path.resolve(path.join(__dirname, '..'));

/* Locate a Chromium/Chrome executable: PUPPETEER_EXECUTABLE_PATH, then the
 * common system locations, then Playwright's bundled Chromium. */
function findBrowser() {
  const candidates = [];
  if (process.env.PUPPETEER_EXECUTABLE_PATH) candidates.push(process.env.PUPPETEER_EXECUTABLE_PATH);
  candidates.push(
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  );
  const localAppData = process.env.LOCALAPPDATA || '';
  if (localAppData) {
    try {
      const pw = path.join(localAppData, 'ms-playwright');
      const dirs = fs.readdirSync(pw).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
      for (const d of dirs) candidates.push(path.join(pw, d, 'chrome-win64', 'chrome.exe'));
    } catch (_) {}
  }
  for (const c of candidates) {
    try { if (c && fs.existsSync(c)) return c; } catch (_) {}
  }
  return null;
}

/* Resolve a stored settings value to an absolute local file, or null when the
 * value is empty, a remote/data URL, or points outside the project root. */
function resolveLogoFile(logoValue) {
  const v = String(logoValue == null ? '' : logoValue).trim();
  if (!v) return null;
  if (/^(https?:)?\/\//i.test(v) || /^(data:|blob:)/i.test(v)) return null;
  // Root-relative paths ("/assets/...") must resolve inside PROJECT_ROOT —
  // path.resolve would treat them as drive-root absolute on Windows.
  const rel = v.charAt(0) === '/' ? v.slice(1) : v;
  const abs = path.resolve(PROJECT_ROOT, rel);
  if (abs !== PROJECT_ROOT && !abs.startsWith(PROJECT_ROOT + path.sep)) return null;
  try { if (!fs.statSync(abs).isFile()) return null; } catch (_) { return null; }
  return abs;
}

function removeIcons() {
  for (const size of ICON_SIZES) {
    try { fs.unlinkSync(path.join(ICON_DIR, 'icon-' + size + '.png')); } catch (_) {}
  }
}

/* Rasterize a local image file to square PNGs at ICON_SIZES.
 * SVG is inlined with an explicit square viewport (preserveAspectRatio meet);
 * raster formats are drawn contain-fitted onto a square canvas. */
async function rasterize(logoFile) {
  const puppeteer = require('puppeteer-core');
  const executablePath = findBrowser();
  if (!executablePath) throw new Error('No Chromium/Chrome executable found for icon generation');
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--force-device-scale-factor=1'],
  });
  try {
    const page = await browser.newPage();
    const ext = path.extname(logoFile).toLowerCase();
    const out = {};
    for (const size of ICON_SIZES) {
      let dataUrlPng;
      if (ext === '.svg') {
        const svg = fs.readFileSync(logoFile, 'utf8');
        const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
          'html,body{margin:0;padding:0}' +
          '.canvas{width:' + size + 'px;height:' + size + 'px;overflow:hidden}' +
          '</style></head><body><div class="canvas">' +
          svg.replace('<svg ', '<svg width="' + size + '" height="' + size + '" preserveAspectRatio="xMidYMid meet" ') +
          '</div></body></html>';
        await page.setContent(html);
        const el = await page.$('.canvas');
        const buf = await el.screenshot({ type: 'png' });
        dataUrlPng = 'data:image/png;base64,' + buf.toString('base64');
      } else {
        const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }[ext] || 'application/octet-stream';
        const dataUrl = 'data:' + mime + ';base64,' + fs.readFileSync(logoFile).toString('base64');
        await page.setContent('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>');
        dataUrlPng = await page.evaluate(async (src, px) => {
          const img = new Image();
          img.src = src;
          await img.decode();
          const canvas = document.createElement('canvas');
          canvas.width = px; canvas.height = px;
          const ctx = canvas.getContext('2d');
          const scale = Math.min(px / img.naturalWidth, px / img.naturalHeight);
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          ctx.drawImage(img, Math.round((px - w) / 2), Math.round((px - h) / 2), w, h);
          return canvas.toDataURL('image/png');
        }, dataUrl, size);
      }
      out[size] = Buffer.from(dataUrlPng.split(',')[1], 'base64');
    }
    return out;
  } finally {
    await browser.close();
  }
}

/* Regenerate the derived icons from the saved logo value. Removes stale icons
 * first so a cleared/invalid logo never leaves files the client would point at. */
async function syncIcons(logoValue) {
  removeIcons();
  const logoFile = resolveLogoFile(logoValue);
  if (!logoFile) return { generated: false };
  try {
    const pngs = await rasterize(logoFile);
    fs.mkdirSync(ICON_DIR, { recursive: true });
    for (const size of ICON_SIZES) {
      fs.writeFileSync(path.join(ICON_DIR, 'icon-' + size + '.png'), pngs[size]);
    }
    return { generated: true };
  } catch (e) {
    removeIcons();
    return { generated: false, error: String((e && e.message) || e) };
  }
}

module.exports = { ICON_SIZES, ICON_DIR, syncIcons, removeIcons, resolveLogoFile, findBrowser };
