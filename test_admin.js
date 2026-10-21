const { getDb } = require('./server/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = getDb();

const row = db.prepare('SELECT * FROM admin_users WHERE username = ?').get('admin');
console.log('row:', row);

const passwordMatch = bcrypt.compareSync('admin123', row.password_hash || '');
console.log('password match:', passwordMatch);

if (passwordMatch) {
  const token = crypto.randomBytes(32).toString('hex');
  const result = db.prepare("INSERT INTO admin_sessions (token, admin_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))").run(token, row.id);
  console.log('session created:', result);
}