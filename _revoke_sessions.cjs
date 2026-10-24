/* Revocation + safe inspection. Prints NO secrets: only counts/booleans. */
const fs = require('fs');
const path = require('path');
const { getDb } = require('./server/db');

const BASE = 'http://127.0.0.1:3000';
const db = getDb();

function sessionInfo(token) {
  // returns counts/booleans only
  let cust = 0, custExpired = 0, admin = 0, adminExpired = 0;
  try {
    const r = db.prepare("SELECT expires_at FROM customer_sessions WHERE token = ?").get(token);
    if (r) { cust = 1; custExpired = (new Date(r.expires_at.replace(' ', 'T') + 'Z') <= new Date()) ? 1 : 0; }
  } catch (_) {}
  try {
    const r = db.prepare("SELECT expires_at FROM admin_sessions WHERE token = ?").get(token);
    if (r) { admin = 1; adminExpired = (new Date(r.expires_at.replace(' ', 'T') + 'Z') <= new Date()) ? 1 : 0; }
  } catch (_) {}
  return { cust, custExpired, admin, adminExpired };
}

const files = ['_live_session.json', '_repro_cred.json'];
const tokens = [];
for (const f of files) {
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const t = j && j.token;
    if (t) tokens.push({ file: f, token: t, userId: j.userId || null });
    console.log(`${f}: parsed OK; hasToken=${!!t}; userIdPresent=${!!(j && j.userId)}; userFields=${j && j.user ? Object.keys(j.user).join(',') : '-'}`);
  } catch (e) {
    console.log(`${f}: parse error (${e.message})`);
  }
}

// Pre-revocation status (counts only)
console.log('\nPre-revocation session status (counts only):');
for (const { file, token } of tokens) {
  const info = sessionInfo(token);
  console.log(`  ${file}: customer_session=${info.cust} (expired=${info.custExpired}), admin_session=${info.admin} (expired=${info.adminExpired})`);
}

// Revoke via the application's supported HTTP mechanism (never prints token)
async function main() {
console.log('\nRevoking via application logout endpoints...');
for (const { file, token } of tokens) {
  for (const ep of ['/api/auth/logout', '/api/admin/logout']) {
    try {
      const res = await fetch(BASE + ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      });
      const body = await res.text().catch(() => '');
      console.log(`  ${file} ${ep}: HTTP ${res.status}`);
    } catch (e) {
      console.log(`  ${file} ${ep}: error (${e.message})`);
    }
  }
}

// Post-revocation status
console.log('\nPost-revocation session status (counts only):');
for (const { file, token } of tokens) {
  const info = sessionInfo(token);
  console.log(`  ${file}: customer_session=${info.cust} (expired=${info.custExpired}), admin_session=${info.admin} (expired=${info.adminExpired})`);
}

// .txt safe inspection (classification only, no content/secrets printed)
console.log('\n.txt safe inspection (classification only):');
try {
  const buf = fs.readFileSync('.txt');
  const head = buf.slice(0, 16);
  let isUtf8 = true;
  try { buf.toString('utf8'); } catch (_) { isUtf8 = false; }
  let isJson = false;
  try { JSON.parse(buf.toString('utf8')); isJson = true; } catch (_) { isJson = false; }
  const text = isUtf8 ? buf.toString('utf8') : '';
  const lower = text.toLowerCase();
  const kw = (k) => (lower.match(new RegExp(k, 'g')) || []).length;
  console.log(`  sizeBytes=${buf.length}`);
  console.log(`  firstBytesHex=${head.toString('hex')}`);
  console.log(`  validUtf8=${isUtf8} validJson=${isJson}`);
  console.log(`  lineCount=${text ? text.split(/\r?\n/).length : 0}`);
  console.log(`  keywordCounts: token=${kw('token')} password=${kw('password')} secret=${kw('secret')} bearer=${kw('bearer')} apikey=${kw('apikey')} authorization=${kw('authorization')}`);
  console.log(`  containsUrl=${/https?:\/\//.test(text)} containsEmail=${/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)}`);
} catch (e) {
  console.log(`  error: ${e.message}`);
}

console.log('\nDone. Files left in place (not deleted) per safe-handling policy.');

}
main().catch((e) => { console.error(e); process.exit(1); });
