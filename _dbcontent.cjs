const { DatabaseSync } = require('node:sqlite');
const file = process.argv[2] || 'data/camzy.db';
const db = new DatabaseSync(file);
const tables = ['site_content', 'site_pages', 'hero_slides', 'article_categories', 'shipping_methods', 'seo_meta', 'discount_codes'];
for (const t of tables) {
  console.log('\n===== ' + t + ' =====');
  try {
    const rows = db.prepare('SELECT * FROM ' + t).all();
    for (const r of rows) {
      const o = {};
      for (const [k, v] of Object.entries(r)) {
        let s = v == null ? '' : String(v);
        if (s.length > 220) s = s.slice(0, 220) + '…';
        o[k] = s;
      }
      console.log(JSON.stringify(o));
    }
  } catch (e) { console.log('ERR', e.message); }
}
db.close();
