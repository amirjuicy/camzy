#!/usr/bin/env node
/* check-radius.mjs — project-wide border-radius token guard.
 *
 * Scans all CSS/HTML/JS files (skipping node_modules and generated dirs)
 * and FAILS (exit 1) if any border-radius declaration uses a hard-coded
 * non-zero value instead of a design token.
 *
 *   allowed:  0 / 0px / 0%          (square)
 *             var(--...radius...)   (token reference, incl. inside calc())
 *             inherit / initial / unset / revert(-layer)
 *   failed:   10px, 50%, 999px, 2em, ...  (hard-coded literals)
 *
 * Usage:  node check-radius.mjs        (or: npm run check:radius)
 */
import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.freebuff', 'build', 'dist', 'out',
  'coverage', '.gradle', '.next', '.cache',
]);
const EXTS = new Set(['.css', '.html', '.htm', '.js', '.mjs']);
const SELF = path.basename(process.argv[1]);

/* border-radius + longhands (border-top-right-radius, ...) */
const CSS_RE = /border-(?:radius|(?:top|bottom|left|right)(?:-(?:top|bottom|left|right))?-radius)\s*:\s*([^;"'{}<>\r\n]+)/gi;
/* JS camelCase declarations: borderRadius: 'x', borderTopRightRadius: "x" ...
   (lookbehind rejects property reads like `el.borderRadius:'-'` inside ternaries;
   the second pattern catches `el.style.borderRadius = 'x'` assignments) */
const CAMEL_RES = [
  /(?<!\.)border(?:Top|Bottom|Left|Right){0,2}Radius['"]?\s*:\s*['"]?([^'",;}\r\n]+)/g,
  /border(?:Top|Bottom|Left|Right){0,2}Radius\s*=\s*['"]([^'"]+)['"]/g,
];

const CSS_WIDE = /^(?:inherit|initial|unset|revert|revert-layer)$/i;
const ZERO = /^(?:0|0px|0%)$/i;
const TOKEN = /var\(\s*--[a-z0-9-]*radius/i;   /* var(--radius-xl), var(--mobile-card-radius), calc(var(--...) + 4px) */

function splitCorners(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) { if (cur) { out.push(cur); cur = ''; } }
    else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function violationsIn(src) {
  const out = [];
  const lineAt = (idx) => src.slice(0, idx).split('\n').length;
  const check = (m, re) => {
    const raw = m[1].trim();
    const value = raw.replace(/\s*!important\s*$/i, '').trim();
    const corners = splitCorners(value);
    if (!corners.length) return;
    const bad = corners.filter((t) => !(ZERO.test(t) || TOKEN.test(t) || CSS_WIDE.test(t)));
    if (bad.length) out.push({ line: lineAt(m.index), value: raw });
  };
  for (const re of [CSS_RE, ...CAMEL_RES]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) check(m, re);
  }
  return out;
}

function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    /* `_`-prefixed files are generated/scratch artifacts (_audit.html, _shots.html, ...) */
    if (e.name.startsWith('_')) continue;
    if (e.isDirectory()) walk(p, files);
    else if (EXTS.has(path.extname(e.name).toLowerCase()) && e.name !== SELF) files.push(p);
  }
  return files;
}

const root = process.argv[2] || '.';
const files = walk(root);
let checked = 0;
const failures = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  if (!/border.*radius/i.test(src)) continue;          // cheap pre-filter
  const rel = path.relative(process.cwd(), file);
  // count declarations checked (same matches the checker uses)
  let n = 0;
  for (const re of [CSS_RE, ...CAMEL_RES]) {
    re.lastIndex = 0;
    while (re.exec(src) !== null) n++;
  }
  checked += n;
  for (const v of violationsIn(src)) {
    failures.push(`${rel}:${v.line}\tborder-radius: ${v.value}`);
  }
}

if (failures.length) {
  console.error(`✗ radius-token guard FAILED — ${failures.length} hard-coded non-zero border-radius value(s):`);
  for (const f of failures) console.error('  ' + f);
  console.error('\nReplace literals with design tokens from assets/css/design-system.css');
  console.error('  (--radius-sm 4px | md 6 | lg 8 | xl 12 | 2xl 16 | 3xl 24 | full 9999px | circle 50%)');
  process.exit(1);
}

console.log(`✓ radius-token guard passed — ${files.length} files scanned, ${checked} border-radius declarations checked, 0 hard-coded non-zero values`);
process.exit(0);
