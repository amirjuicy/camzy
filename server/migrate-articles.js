/* One-off (idempotent) migration: import legacy AppData.articles from
 * assets/js/data.js into the SQLite `articles` table.
 * - Read-only wrt original data (never modifies data.js).
 * - Safe to re-run: upserts by UNIQUE slug (INSERT ... ON CONFLICT DO UPDATE).
 * - Legacy storefront articles are all publicly visible => status 'published'.
 */
const fs = require('fs');
const path = require('path');
const { getDb } = require('./db');
const { migrate } = require('./migrate');

migrate();
const db = getDb();

function loadLegacyArticles() {
  const candidates = [
    path.join(__dirname, '..', 'assets', 'js', 'data.js'),
    path.join(__dirname, '..', '..', 'assets', 'js', 'data.js'),
  ];
  const seen = new Map(); // slug -> article
  for (const f of candidates) {
    let src;
    try { src = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    // Extract the `articles: [ ... ]` array literal and evaluate it safely.
    const idx = src.indexOf('articles:');
    if (idx === -1) continue;
    const start = src.indexOf('[', idx);
    let depth = 0, end = -1, instr = null;
    for (let i = start; i < src.length; i++) {
      const ch = src[i];
      if (instr) {
        if (ch === instr && src[i - 1] !== '\\') instr = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') instr = ch;
      else if (ch === '[') depth++;
      else if (ch === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end === -1) continue;
    let arr;
    try { arr = new Function('return (' + src.slice(start, end) + ')')(); } catch (_) { continue; }
    for (const a of arr) {
      if (!a || !a.slug) continue;
      if (!seen.has(String(a.slug))) seen.set(String(a.slug), { ...a, _src: f });
    }
  }
  return [...seen.values()];
}

const articles = loadLegacyArticles();
console.log(`Found ${articles.length} legacy article(s).`);

try { var _cols=db.prepare('PRAGMA table_info(articles)').all().map(function(c){return c.name;}); if(_cols.indexOf('category')===-1) db.exec("ALTER TABLE articles ADD COLUMN category TEXT NOT NULL DEFAULT ''"); } catch(_){}
try { var _cols2=db.prepare('PRAGMA table_info(articles)').all().map(function(c){return c.name;}); if(_cols2.indexOf('category_slug')===-1) db.exec("ALTER TABLE articles ADD COLUMN category_slug TEXT NOT NULL DEFAULT ''"); } catch(_){}
try { var _cols3=db.prepare('PRAGMA table_info(articles)').all().map(function(c){return c.name;}); if(_cols3.indexOf('category_id')===-1) db.exec('ALTER TABLE articles ADD COLUMN category_id INTEGER'); } catch(_){}
db.exec(`CREATE TABLE IF NOT EXISTS article_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
var _seed=db.prepare('INSERT OR IGNORE INTO article_categories (name, slug) VALUES (?, ?)');
_seed.run('راهنمای خرید دوربین', 'buying-guide');
_seed.run('آموزش نصب دوربین', 'installation-tutorial');
_seed.run('مقایسه دوربین', 'camera-comparison');
_seed.run('نگهداری سیستم امنیتی', 'security-maintenance');
_seed.run('اخبار فناوری امنیتی', 'security-news');
const upsert = db.prepare(`INSERT INTO articles (title, slug, excerpt, content, image, status, category, category_slug, created_at, updated_at)
  VALUES (@title, @slug, @excerpt, @content, @image, @status, @category, @category_slug, datetime('now'), datetime('now'))
  ON CONFLICT(slug) DO UPDATE SET title=excluded.title, excerpt=excluded.excerpt,
    content=excluded.content, image=excluded.image, status=excluded.status,
    category=excluded.category, category_slug=excluded.category_slug, updated_at=datetime('now')`);

let n = 0;
for (const a of articles) {
  upsert.run({
    title: String(a.title || ''),
    slug: String(a.slug),
    excerpt: String(a.excerpt || ''),
    content: String(a.content || ''),
    image: String(a.image || ''),
    status: 'published',
    category: String(a.category || ''),
    category_slug: String(a.categorySlug || a.category_slug || ''),
  });
  n++;
}
// Backfill category_id from the article_categories table (by slug, then name).
try {
  var _cats=db.prepare('SELECT id, name, slug FROM article_categories').all();
  var _upd=db.prepare('UPDATE articles SET category = ?, category_slug = ?, category_id = ? WHERE category_slug = ? OR category = ?');
  for (const _c of _cats) _upd.run(_c.name, _c.slug, _c.id, _c.slug, _c.name);
} catch(_){}
console.log(`Upserted ${n} article(s) by slug (idempotent).`);
const total = db.prepare('SELECT COUNT(*) AS n FROM articles').get().n;
console.log(`articles table now holds ${total} row(s).`);
console.log(db.prepare('SELECT id, slug, status FROM articles ORDER BY id').all()
  .map((r) => `  #${r.id} ${r.slug} [${r.status}]`).join('\n'));
