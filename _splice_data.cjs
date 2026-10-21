/* Splice the new Camzy catalog head into assets/js/data.js */
const fs = require('fs');
const path = require('path');

const TARGET = process.argv[2] || 'C:/Users/INO/Desktop/project/camzy/assets/js/data.js';
const HEAD = process.argv[3] || 'C:/Users/INO/Desktop/project/camzy/_newdata_head.js';

const src = fs.readFileSync(TARGET, 'utf8');
const head = fs.readFileSync(HEAD, 'utf8').replace(/\r\n/g, '\n').trimEnd();

const marker = '/* ================================================================\n   Format Helpers';
const idx = src.indexOf(marker);
if (idx === -1) { console.error('marker not found'); process.exit(1); }
const tail = src.slice(idx);
const out = head + '\n\n' + tail;
fs.writeFileSync(TARGET, out, 'utf8');
console.log('spliced ->', TARGET, 'bytes:', Buffer.byteLength(out, 'utf8'));

// sanity: parse the file as JS and verify key structures
const sandbox = { window: {}, document: undefined, fetch: undefined, location: undefined, CustomEvent: function () {} };
const vm = require('vm');
const ctx = vm.createContext(sandbox);
vm.runInContext(out + '\n;this.__d = { AppData, Format };', ctx);
const d = ctx.__d;
console.log('categories:', d.AppData.categories.length,
  '| brands:', d.AppData.brands.length,
  '| products:', d.AppData.products.length,
  '| articles:', d.AppData.articles.length,
  '| reviews:', d.AppData.reviews.length,
  '| faq:', d.AppData.faqItems.length);
// validate category references
const catById = new Map(d.AppData.categories.map(c => [c.id, c]));
let bad = 0;
for (const p of d.AppData.products) {
  const c = catById.get(p.categoryId);
  if (!c) { console.log('BAD categoryId', p.id, p.categoryId); bad++; continue; }
  if (c.slug !== p.categorySlug || c.name !== p.category) { console.log('MISMATCH', p.id, p.category, p.categorySlug, '!=', c.name, c.slug); bad++; }
  if (!d.AppData.brands.some(b => b.name === p.brand)) { console.log('BAD brand', p.id, p.brand); bad++; }
}
console.log('validation problems:', bad);
// category counts
const cnt = {};
for (const p of d.AppData.products) cnt[p.categorySlug] = (cnt[p.categorySlug] || 0) + 1;
for (const c of d.AppData.categories) {
  const real = cnt[c.slug] || 0;
  if (c.count !== real) console.log('count mismatch', c.slug, 'declared', c.count, 'actual', real);
}
