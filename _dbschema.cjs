const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[2] || 'data/camzy.db');
const t = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('orders','order_items','products','categories','brands','articles','admin_users','users','product_options')").all();
for (const r of t) {
  console.log('\n=== ' + r.name + ' ===');
  console.log(r.sql);
}
console.log('\n=== sample order_items ===');
console.log(JSON.stringify(db.prepare('SELECT * FROM order_items LIMIT 5').all(), null, 1));
console.log('\n=== sample products ===');
console.log(JSON.stringify(db.prepare('SELECT id,name,slug,price,image,category,category_slug FROM products LIMIT 5').all(), null, 1));
console.log('\n=== article_categories ===');
console.log(JSON.stringify(db.prepare('SELECT * FROM article_categories').all()));
console.log('\n=== articles ===');
console.log(JSON.stringify(db.prepare('SELECT id,slug,title,category,category_slug,image,status FROM articles').all(), null, 1));
console.log('\n=== admin_users ===');
console.log(JSON.stringify(db.prepare('SELECT id,username,name,role,is_active FROM admin_users').all()));
db.close();
