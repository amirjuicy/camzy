/* C1 regression: login must never issue a token without a valid password hash.
 * Isolated: uses a temp DB via DB_PATH, ephemeral port. No live data touched.
 * Run: node test_c1_login_password_required.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c1-test-'));
const dbPath = path.join(tmpDir, 'c1.db');
process.env.DB_PATH = dbPath;

const bcrypt = require('bcryptjs');
const app = require('./server/app');
const { getDb } = require('./server/db');

function req(port, method, url, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body !== undefined ? JSON.stringify(body) : null;
    const r = http.request({
      host: '127.0.0.1', port, path: url, method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(headers || {}),
      },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        let json = null;
        try { json = chunks ? JSON.parse(chunks) : null; } catch (_) {}
        resolve({ status: res.statusCode, json, raw: chunks });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log(`PASS: ${name}`); }
  else { failures += 1; console.log(`FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  const db = getDb();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  try {
    // 1. Register a normal user (valid password policy >= 8)
    const mobile = '09190000001';
    const goodPass = 'correct-password-1';
    const reg = await req(port, 'POST', '/api/auth/register', {
      firstName: 'C1', lastName: 'Test', mobile, password: goodPass,
    });
    check('register with valid password -> 201', reg.status === 201, `got ${reg.status} ${reg.raw}`);

    // 2. Correct login -> 200 + token
    const ok = await req(port, 'POST', '/api/auth/login', { identifier: mobile, password: goodPass });
    check('login correct password -> 200 + token', ok.status === 200 && !!(ok.json && ok.json.token), `got ${ok.status} ${ok.raw}`);

    // 3. Wrong password -> 401, no token
    const wrong = await req(port, 'POST', '/api/auth/login', { identifier: mobile, password: 'wrong-password-xyz' });
    check('login wrong password -> 401 no token', wrong.status === 401 && !(wrong.json && wrong.json.token), `got ${wrong.status} ${wrong.raw}`);

    // 4. Missing password -> 401, no token
    const missing = await req(port, 'POST', '/api/auth/login', { identifier: mobile });
    check('login missing password -> 401 no token', missing.status === 401 && !(missing.json && missing.json.token), `got ${missing.status} ${missing.raw}`);

    // 5. Legacy NULL-hash account must not be loggable in (core C1)
    const nullId = 'u_c1_nullhash';
    db.prepare(`INSERT INTO users (id, first_name, last_name, mobile, email, password_hash, join_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(nullId, 'Legacy', 'Null', '09190000002', null, null, '1405/01/01');
    const nullLogin = await req(port, 'POST', '/api/auth/login', { identifier: '09190000002' });
    check('login NULL-hash account identifier-only -> 401 no token', nullLogin.status === 401 && !(nullLogin.json && nullLogin.json.token), `got ${nullLogin.status} ${nullLogin.raw}`);
    const nullLoginPw = await req(port, 'POST', '/api/auth/login', { identifier: '09190000002', password: 'anything123' });
    check('login NULL-hash account with password -> 401 no token', nullLoginPw.status === 401 && !(nullLoginPw.json && nullLoginPw.json.token), `got ${nullLoginPw.status} ${nullLoginPw.raw}`);

    // 6. Empty-string hash
    db.prepare(`INSERT INTO users (id, first_name, last_name, mobile, email, password_hash, join_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run('u_c1_empty', 'Legacy', 'Empty', '09190000003', null, '', '1405/01/01');
    const emptyLogin = await req(port, 'POST', '/api/auth/login', { identifier: '09190000003', password: 'anything123' });
    check('login empty-hash account -> 401 no token', emptyLogin.status === 401 && !(emptyLogin.json && emptyLogin.json.token), `got ${emptyLogin.status} ${emptyLogin.raw}`);

    // 7. Whitespace hash
    db.prepare(`INSERT INTO users (id, first_name, last_name, mobile, email, password_hash, join_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run('u_c1_ws', 'Legacy', 'WS', '09190000004', null, '   ', '1405/01/01');
    const wsLogin = await req(port, 'POST', '/api/auth/login', { identifier: '09190000004', password: 'anything123' });
    check('login whitespace-hash account -> 401 no token', wsLogin.status === 401 && !(wsLogin.json && wsLogin.json.token), `got ${wsLogin.status} ${wsLogin.raw}`);

    // 8. Admin-created users require a valid password (server-side)
    const adminHash = bcrypt.hashSync('admin-test-123', 10);
    const info = db.prepare('INSERT INTO admin_users (username, password_hash, name, role) VALUES (?, ?, ?, ?)').run('c1admin', adminHash, 'C1 Admin', 'admin');
    const adminToken = 'c1admintoken1234567890abcdef';
    db.prepare("INSERT INTO admin_sessions (token, admin_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))").run(adminToken, info.lastInsertRowid);
    const ah = { Authorization: 'Bearer ' + adminToken };
    const noPw = await req(port, 'POST', '/api/users', { firstName: 'A', lastName: 'B', mobile: '09190000005' }, ah);
    check('POST /users without password -> 400', noPw.status === 400, `got ${noPw.status} ${noPw.raw}`);
    const shortPw = await req(port, 'POST', '/api/users', { firstName: 'A', lastName: 'B', mobile: '09190000005', password: 'short' }, ah);
    check('POST /users short password -> 400', shortPw.status === 400, `got ${shortPw.status} ${shortPw.raw}`);
    const created = await req(port, 'POST', '/api/users', { firstName: 'A', lastName: 'B', mobile: '09190000005', password: 'valid-pass-123' }, ah);
    check('POST /users valid password -> 201', created.status === 201, `got ${created.status} ${created.raw}`);
    if (created.status === 201) {
      const loginNew = await req(port, 'POST', '/api/auth/login', { identifier: '09190000005', password: 'valid-pass-123' });
      check('login admin-created user -> 200 + token', loginNew.status === 200 && !!(loginNew.json && loginNew.json.token), `got ${loginNew.status} ${loginNew.raw}`);
      const row = db.prepare('SELECT password_hash FROM users WHERE mobile = ?').get('09190000005');
      check('stored hash is non-empty bcrypt hash', !!(row && row.password_hash && String(row.password_hash).startsWith('$2')), `got ${row && row.password_hash}`);
    }
  } finally {
    await new Promise((r) => server.close(r));
    try { db.close(); } catch (_) {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(failures === 0 ? 'ALL C1 CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('TEST ERROR', e); process.exit(1); });
