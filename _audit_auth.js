const {getDb}=require('./server/db');
const db=getDb();
console.log('admins:', JSON.stringify(db.prepare('SELECT id,username,name,role,is_active FROM admin_users').all()));
console.log('users count:', db.prepare('SELECT COUNT(*) c FROM users').get());
console.log('sample users:', JSON.stringify(db.prepare('SELECT id,first_name,last_name,mobile,email,is_blocked FROM users LIMIT 5').all()));
console.log('products count:', db.prepare('SELECT COUNT(*) c FROM products').get());
console.log('active products:', db.prepare('SELECT COUNT(*) c FROM products WHERE is_active=1').get());
console.log('settings website:', db.prepare("SELECT value FROM settings WHERE key='store.website'").get());
console.log('store name:', db.prepare("SELECT value FROM settings WHERE key='store.name'").get());
