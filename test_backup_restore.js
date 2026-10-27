'use strict';
/* Tests for Admin → «آپلود و بازیابی نسخه پشتیبان» (Upload & Restore Backup).
 *
 * Covers: a valid backup upload (filename / size / validation / backup
 * timestamp), rejection of malformed archives, update packages, path
 * traversal, forbidden sensitive files, a broken database snapshot and the
 * upload size limit; explicit-confirmation gating; authorization (401 /
 * 403 section / 403 read-only); concurrent-operation blocking; a failed
 * safety backup; a tampered staged archive; and a full restore that swaps
 * the database + uploaded files together behind a verified safety backup.
 *
 * Everything runs against an ISOLATED TEMPORARY PROJECT COPY built in the OS
 * temp dir. The real project, its database, its uploads and any running
 * server are never touched: no production install, no production data change,
 * no deploy and no server restart happen here.
 *
 * Run:  node test_backup_restore.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const REPO_ROOT = __dirname;
const MANAGER_PATH = path.join(REPO_ROOT, 'server', 'backup-manager.js');
const APP_PATH = path.join(REPO_ROOT, 'server', 'app.js');

const results = [];
async function t(name, fn) {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (e) {
    results.push(['FAIL', name + ' :: ' + ((e && e.message) || e)]);
    if (process.env.VERBOSE) console.error(e);
  }
}

/* ─────────────────────── minimal ZIP writer ──────────────────────────── */
const CRC_TABLE = (() => {
  const tab = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    tab[n] = c >>> 0;
  }
  return tab;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
/* entries: [{ name, data|text, mode? }] — raw bytes are stored as-is. */
function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const data = e.data || Buffer.from(e.text == null ? '' : e.text, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);    // method: store
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    localParts.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4);   // version made by (unix)
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE((((e.mode || 0o100644) >>> 0) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralBuf, eocd]);
}

/* ─────────────────────── isolated temp project ───────────────────────── */
const PROJECT_COPIES = [];
function makeTempProject(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'camzy-rs-' + label + '-'));
  PROJECT_COPIES.push(root);
  const copy = (rel) => {
    const src = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(src)) return;
    const dst = path.join(root, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.cpSync(src, dst, { recursive: true });
  };
  ['package.json', 'index.html', '404.html', path.join('admin', 'index.html')].forEach(copy);
  fs.cpSync(path.join(REPO_ROOT, 'server'), path.join(root, 'server'), { recursive: true });

  fs.mkdirSync(path.join(root, 'data', 'updates'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data', 'backups'), { recursive: true });
  fs.mkdirSync(path.join(root, 'server', 'logs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'uploads', 'chat'), { recursive: true });
  fs.mkdirSync(path.join(root, 'uploads', 'receipts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'assets', 'images', 'uploads'), { recursive: true });
  fs.mkdirSync(path.join(root, 'assets', 'js'), { recursive: true });

  const dbPath = path.join(root, 'data', 'camzy.db');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS camzy_test_orders (id TEXT PRIMARY KEY, total INTEGER NOT NULL);
    INSERT OR REPLACE INTO camzy_test_orders (id, total) VALUES ('ord-1', 12345);
    INSERT OR REPLACE INTO settings (key, value) VALUES ('update.github.owner', 'camzy-owner'), ('update.github.repo', 'camzy-repo');
  `);
  db.close();

  fs.writeFileSync(path.join(root, '.env'), 'SECRET_TOKEN=do-not-overwrite\n');
  fs.writeFileSync(path.join(root, 'server', 'logs', '2026-10-26-requests.log'), 'log-line-original\n');
  fs.writeFileSync(path.join(root, 'uploads', 'receipts', 'keep.txt'), 'upload-original\n');
  fs.writeFileSync(path.join(root, 'assets', 'images', 'uploads', 'keep.png'), 'png-original');
  fs.writeFileSync(path.join(root, 'index.html'), '<html>ORIGINAL_INDEX</html>\n');
  return root;
}
function tempEnv(root, extra) {
  return Object.assign({
    PROJECT_ROOT: root,
    DB_PATH: path.join(root, 'data', 'camzy.db'),
    BACKUP_DIR: path.join(root, 'data', 'backups'),
    UPDATE_DIR: path.join(root, 'data', 'updates'),
    NODE_ENV: 'test'
  }, extra || {});
}

/* ─────────────────────── backup archive fixtures ─────────────────────── */
const BACKUP_CREATED_AT = '2026-10-01T12:00:00.000Z';

// A real snapshot of the live database (VACUUM INTO → standalone file),
// optionally mutated — i.e. exactly what the backup system archives.
function snapshotLiveDb(root, mutate) {
  const src = path.join(root, 'data', 'camzy.db');
  const tmp = path.join(os.tmpdir(), 'camzy-snap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.db');
  const db = new DatabaseSync(src);
  try {
    db.exec("VACUUM INTO '" + tmp.replace(/'/g, "''") + "'");
  } finally { db.close(); }
  if (mutate) { const d2 = new DatabaseSync(tmp); try { mutate(d2); } finally { d2.close(); } }
  const bytes = fs.readFileSync(tmp);
  try { fs.unlinkSync(tmp); } catch (_) {}
  return bytes;
}

function backupMeta(extra) {
  return JSON.stringify(Object.assign({
    createdAt: BACKUP_CREATED_AT,
    version: '1.0.0',
    dbPath: 'data/camzy.db'
  }, extra || {}), null, 2);
}

// A well-formed Camzy backup archive (database snapshot + metadata + uploads).
function makeValidBackup(root, markerTotal, extraEntries) {
  const entries = [
    { name: 'backup-meta.json', text: backupMeta() },
    { name: 'database/camzy.db', data: snapshotLiveDb(root, (db) => {
      db.exec("INSERT OR REPLACE INTO camzy_test_orders (id, total) VALUES ('ord-backup', " + Number(markerTotal) + ");");
    }) },
    { name: 'app/uploads/receipts/from-backup.txt', text: 'receipt-from-backup\n' },
    { name: 'app/assets/images/uploads/from-backup.png', data: Buffer.from('png-from-backup') }
  ].concat(extraEntries || []);
  return buildZip(entries);
}

function listZips(dir) {
  try { return fs.readdirSync(dir).filter((f) => /\.zip$/i.test(f)).sort(); } catch (_) { return []; }
}

/* ─────────────────────── HTTP helpers ────────────────────────────────── */
async function call(base, method, p, { body, token, raw } = {}) {
  const headers = {};
  if (token) headers.authorization = 'Bearer ' + token;
  if (raw) {
    // multipart upload
    const res = await fetch(base + p, { method, headers, body: raw });
    let json = null;
    try { json = await res.json(); } catch (_) {}
    return { status: res.status, body: json };
  }
  headers['content-type'] = 'application/json';
  const res = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch (_) {}
  return { status: res.status, body: json };
}

function uploadForm(bytes, filename) {
  const fd = new FormData();
  fd.append('file', new Blob([bytes], { type: 'application/zip' }), filename);
  return fd;
}

/* ─────────────────────────── test phases ─────────────────────────────── */

function phaseSource() {
  const appSrc = fs.readFileSync(APP_PATH, 'utf8');
  const html = fs.readFileSync(path.join(REPO_ROOT, 'admin', 'index.html'), 'utf8');
  const bk = fs.readFileSync(path.join(REPO_ROOT, 'admin', 'assets', 'js', 'admin-backup.js'), 'utf8');

  const routeLines = appSrc.split('\n').filter((l) => /api\.(get|post|put|delete)\(\s*['"`]\/admin\/backup\/restore/.test(l));
  t('source: both restore routes exist and sit behind requireAdmin', () => {
    assert.strictEqual(routeLines.length, 2, 'expected upload + apply routes, found ' + routeLines.length);
    for (const l of routeLines) assert.ok(l.indexOf('requireAdmin') !== -1, 'route missing requireAdmin: ' + l.trim());
  });

  t('source: upload size limit is enforced from RESTORE_MAX_UPLOAD_BYTES', () => {
    assert.ok(appSrc.indexOf('fileSize: backupManager.RESTORE_MAX_UPLOAD_BYTES') !== -1, 'multer limit wiring');
    assert.ok(/const restoreUpload = multer\(/.test(appSrc), 'dedicated restore multer instance');
  });

  t('source: update-package upload/install routes are unchanged and separate', () => {
    assert.ok(appSrc.indexOf("api.post('/admin/updates/upload'") !== -1, 'update upload route still present');
    assert.ok(appSrc.indexOf("api.post('/admin/backup/update/apply'") !== -1, 'update apply route still present');
    assert.ok(appSrc.indexOf("api.delete('/admin/updates/:file'") !== -1, 'update delete route still present');
    assert.ok(bk.indexOf('/api/admin/updates/upload') !== -1, 'update upload still called from the UI');
    assert.ok(bk.indexOf('/api/admin/backup/update/apply') !== -1, 'update install still called from the UI');
    assert.ok(bk.indexOf("id=\"bu-upload-file\"") === -1, 'file input lives in the HTML, not the JS');
    assert.ok(html.indexOf('id="bu-upload-file"') !== -1, 'existing update upload input kept');
    assert.ok(html.indexOf('id="bu-confirm-apply"') !== -1, 'existing update confirmation kept');
    assert.ok(html.indexOf('id="bu-update-btn"') !== -1, 'existing update install button kept');
  });

  t('source: admin UI has the dedicated Upload & Restore Backup section', () => {
    assert.ok(html.indexOf('data-view="backup-update"') !== -1, 'shared backup-update view');
    assert.ok(html.indexOf('id="bu-restore-card"') !== -1, 'section card');
    assert.ok(html.indexOf('آپلود و بازیابی نسخه پشتیبان') !== -1, 'section title');
    assert.ok(html.indexOf('id="bu-restore-file"') !== -1, 'file input');
    assert.ok(html.indexOf('id="bu-restore-upload"') !== -1, 'upload button');
    assert.ok(html.indexOf('id="bu-restore-name"') !== -1, 'filename field');
    assert.ok(html.indexOf('id="bu-restore-size"') !== -1, 'size field');
    assert.ok(html.indexOf('id="bu-restore-time"') !== -1, 'backup timestamp field');
    assert.ok(html.indexOf('id="bu-restore-result"') !== -1, 'validation result field');
    assert.ok(html.indexOf('id="bu-restore-confirm"') !== -1, 'explicit confirmation panel');
    assert.ok(html.indexOf('id="bu-restore-check"') !== -1, 'confirmation checkbox');
    assert.ok(html.indexOf('id="bu-restore-apply"') !== -1, 'restore button');
    assert.ok(bk.indexOf('/api/admin/backup/restore/upload') !== -1, 'UI calls the upload endpoint');
    assert.ok(bk.indexOf('/api/admin/backup/restore/apply') !== -1, 'UI calls the restore endpoint');
    assert.ok(bk.indexOf('confirm: true') !== -1, 'restore is sent with an explicit confirmation');
  });
}

async function phaseHttp() {
  const root = makeTempProject('http');
  const prevEnv = tempEnv(root);
  for (const [k, v] of Object.entries(prevEnv)) process.env[k] = String(v);

  // Drop every cached server module so app.js picks up THIS temp copy's env.
  for (const key of Object.keys(require.cache)) {
    if (key.indexOf(path.join(REPO_ROOT, 'server') + path.sep) !== -1) delete require.cache[key];
  }

  let app;
  try {
    app = require(APP_PATH);
  } catch (e) {
    results.push(['FAIL', 'http: server/app.js loads :: ' + ((e && e.message) || e)]);
    return;
  }
  const bcrypt = require('bcryptjs');
  const { getDb } = require('./server/db');
  const db = getDb();
  const pw = bcrypt.hashSync('AdminPass123!', 10);
  db.prepare("INSERT INTO admin_users (username, password_hash, name, role) VALUES (?, ?, ?, 'superadmin')")
    .run('fulladmin', pw, 'Full Admin');
  db.prepare("INSERT INTO admin_users (username, password_hash, name, role, permissions) VALUES (?, ?, ?, 'viewer', ?)")
    .run('viewadmin', pw, 'Readonly Admin', JSON.stringify({ sections: 'all', readonly: true }));
  db.prepare("INSERT INTO admin_users (username, password_hash, name, role, permissions) VALUES (?, ?, ?, 'editor', ?)")
    .run('limitedadmin', pw, 'Limited Admin', JSON.stringify({ sections: ['dashboard'], readonly: false }));

  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const bm = require(MANAGER_PATH);   // the very instance the app uses

  const BACKUP_DIR = path.join(root, 'data', 'backups');
  const DB_PATH = path.join(root, 'data', 'camzy.db');

  async function login(username) {
    const r = await call(base, 'POST', '/api/admin/login', { body: { username, password: 'AdminPass123!' } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body.token;
  }

  let fullTok = null;
  try {
    fullTok = await login('fulladmin');
    const viewTok = await login('viewadmin');
    const limTok = await login('limitedadmin');

    // Snapshot AFTER the logins, so the archive carries the admin users and
    // sessions a real backup would contain (the restored server keeps serving
    // its administrators).
    const validBytes = makeValidBackup(root, 777);

    await t('auth: restore endpoints require an authenticated admin (401)', async () => {
      const up = await call(base, 'POST', '/api/admin/backup/restore/upload', { raw: uploadForm(validBytes, 'camzy-backup-x.zip') });
      assert.strictEqual(up.status, 401);
      const ap = await call(base, 'POST', '/api/admin/backup/restore/apply', { body: { confirm: true, file: 'x.zip' } });
      assert.strictEqual(ap.status, 401);
    });

    await t('auth: read-only admin can read but never upload or restore (403)', async () => {
      const read = await call(base, 'GET', '/api/admin/backup/status', { token: viewTok });
      assert.strictEqual(read.status, 200);
      const up = await call(base, 'POST', '/api/admin/backup/restore/upload', { token: viewTok, raw: uploadForm(validBytes, 'camzy-backup-ro.zip') });
      assert.strictEqual(up.status, 403);
      const ap = await call(base, 'POST', '/api/admin/backup/restore/apply', { token: viewTok, body: { confirm: true, file: 'x.zip' } });
      assert.strictEqual(ap.status, 403);
    });

    await t('auth: admin without the backup-update section is rejected (403)', async () => {
      const up = await call(base, 'POST', '/api/admin/backup/restore/upload', { token: limTok, raw: uploadForm(validBytes, 'camzy-backup-lim.zip') });
      assert.strictEqual(up.status, 403);
      const ap = await call(base, 'POST', '/api/admin/backup/restore/apply', { token: limTok, body: { confirm: true, file: 'x.zip' } });
      assert.strictEqual(ap.status, 403);
    });

    let stagedFile = null;
    await t('upload: a valid backup reports filename, size, validation and backup timestamp', async () => {
      const before = listZips(BACKUP_DIR);
      const r = await call(base, 'POST', '/api/admin/backup/restore/upload', {
        token: fullTok, raw: uploadForm(validBytes, 'camzy-backup-valid.zip')
      });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.ok, true);
      stagedFile = r.body.filename;
      assert.ok(/^camzy-backup-valid.*\.zip$/.test(stagedFile), 'filename: ' + stagedFile);
      assert.strictEqual(r.body.size, validBytes.length, 'size reported');
      assert.strictEqual(r.body.backupTimestamp, BACKUP_CREATED_AT, 'backup timestamp from metadata');
      const v = r.body.validation;
      assert.ok(v, 'validation reported');
      assert.strictEqual(v.ok, true);
      assert.strictEqual(v.dbIntegrity, 'ok');
      assert.strictEqual(v.backupTimestamp, BACKUP_CREATED_AT);
      assert.strictEqual(v.uploadFiles, 2, 'both uploaded files seen');
      assert.ok(v.sha256 && v.sha256.length === 64, 'sha256 reported');
      // staged into data/backups, and nothing was restored by the upload itself
      const after = listZips(BACKUP_DIR);
      assert.strictEqual(after.length, before.length + 1, 'exactly one staged archive added');
      assert.ok(after.indexOf(stagedFile) !== -1, 'staged file present');
      const live = new DatabaseSync(DB_PATH, { readOnly: true });
      const row = live.prepare("SELECT total FROM camzy_test_orders WHERE id = 'ord-1'").get();
      live.close();
      assert.strictEqual(row.total, 12345, 'production data untouched by an upload');
    });

    await t('validation: the compressed upload limit is enforced (413)', async () => {
      const big = Buffer.alloc(bm.RESTORE_MAX_UPLOAD_BYTES + 1);
      let err = null;
      try { await bm.validateBackupArchiveBuffer(big); } catch (e) { err = e; }
      assert.ok(err, 'oversized upload rejected');
      assert.strictEqual(err.status, 413);
      assert.strictEqual(err.code, 'upload_too_large');
    });

    await t('reject: malformed archive (not a ZIP) is refused and cleaned up', async () => {
      const before = listZips(BACKUP_DIR);
      const r = await call(base, 'POST', '/api/admin/backup/restore/upload', {
        token: fullTok, raw: uploadForm(Buffer.from('this is definitely not a zip file'), 'camzy-backup-garbage.zip')
      });
      assert.strictEqual(r.status, 422, JSON.stringify(r.body));
      assert.strictEqual(r.body.code, 'invalid_archive');
      assert.deepStrictEqual(listZips(BACKUP_DIR), before, 'rejected upload left no file behind');
    });

    await t('reject: an archive that is not a Camzy backup is refused', async () => {
      const r = await call(base, 'POST', '/api/admin/backup/restore/upload', {
        token: fullTok, raw: uploadForm(buildZip([{ name: 'foo.txt', text: 'hello' }]), 'random.zip')
      });
      assert.strictEqual(r.status, 422, JSON.stringify(r.body));
      assert.strictEqual(r.body.code, 'invalid_backup_structure');
    });

    await t('reject: update packages are refused, not restored', async () => {
      const before = listZips(BACKUP_DIR);
      const withManifest = buildZip([
        { name: 'manifest.json', text: JSON.stringify({ version: '2.0.0', notes: 'x' }) },
        { name: 'index.html', text: '<html>UPDATE</html>' }
      ]);
      const r = await call(base, 'POST', '/api/admin/backup/restore/upload', {
        token: fullTok, raw: uploadForm(withManifest, 'camzy-update-2.0.0.zip')
      });
      assert.strictEqual(r.status, 422, JSON.stringify(r.body));
      assert.strictEqual(r.body.code, 'update_package');

      const appPayload = buildZip([
        { name: 'app/package.json', text: JSON.stringify({ name: 'camzy', version: '2.0.0' }) },
        { name: 'app/index.html', text: '<html>UPDATE</html>' }
      ]);
      const r2 = await call(base, 'POST', '/api/admin/backup/restore/upload', {
        token: fullTok, raw: uploadForm(appPayload, 'camzy-update-payload.zip')
      });
      assert.strictEqual(r2.status, 422, JSON.stringify(r2.body));
      assert.strictEqual(r2.body.code, 'update_package');
      assert.deepStrictEqual(listZips(BACKUP_DIR), before, 'rejected update packages never staged');
    });

    await t('reject: path traversal entries are refused', async () => {
      const before = listZips(BACKUP_DIR);
      const traversal = buildZip([
        { name: 'backup-meta.json', text: backupMeta() },
        { name: 'database/camzy.db', data: snapshotLiveDb(root) },
        { name: '../evil.txt', text: 'pwned' }
      ]);
      const r = await call(base, 'POST', '/api/admin/backup/restore/upload', {
        token: fullTok, raw: uploadForm(traversal, 'camzy-backup-traversal.zip')
      });
      assert.strictEqual(r.status, 422, JSON.stringify(r.body));
      assert.strictEqual(r.body.code, 'invalid_archive');
      assert.ok(/Unsafe archive path/.test(r.body.error), r.body.error);

      const absolute = buildZip([
        { name: 'backup-meta.json', text: backupMeta() },
        { name: 'database/camzy.db', data: snapshotLiveDb(root) },
        { name: '/etc/passwd', text: 'root:x' }
      ]);
      const r2 = await call(base, 'POST', '/api/admin/backup/restore/upload', {
        token: fullTok, raw: uploadForm(absolute, 'camzy-backup-absolute.zip')
      });
      assert.strictEqual(r2.status, 422, JSON.stringify(r2.body));
      assert.strictEqual(r2.body.code, 'invalid_archive');
      assert.deepStrictEqual(listZips(BACKUP_DIR), before, 'traversal archives never staged');
      assert.ok(!fs.existsSync(path.join(root, 'evil.txt')), 'nothing written outside the project');
    });

    await t('reject: archives with sensitive files are refused', async () => {
      const before = listZips(BACKUP_DIR);
      const withEnv = buildZip([
        { name: 'backup-meta.json', text: backupMeta() },
        { name: 'database/camzy.db', data: snapshotLiveDb(root) },
        { name: 'app/.env', text: 'GITHUB_TOKEN=leak\n' }
      ]);
      const r = await call(base, 'POST', '/api/admin/backup/restore/upload', {
        token: fullTok, raw: uploadForm(withEnv, 'camzy-backup-secret.zip')
      });
      assert.strictEqual(r.status, 422, JSON.stringify(r.body));
      assert.strictEqual(r.body.code, 'sensitive_file');

      const withKey = buildZip([
        { name: 'backup-meta.json', text: backupMeta() },
        { name: 'database/camzy.db', data: snapshotLiveDb(root) },
        { name: 'app/server/id_rsa', text: 'PRIVATE KEY' }
      ]);
      const r2 = await call(base, 'POST', '/api/admin/backup/restore/upload', {
        token: fullTok, raw: uploadForm(withKey, 'camzy-backup-key.zip')
      });
      assert.strictEqual(r2.status, 422, JSON.stringify(r2.body));
      assert.strictEqual(r2.body.code, 'sensitive_file');
      assert.deepStrictEqual(listZips(BACKUP_DIR), before, 'sensitive archives never staged');
    });

    await t('reject: a broken database snapshot fails the integrity check', async () => {
      const before = listZips(BACKUP_DIR);
      const broken = buildZip([
        { name: 'backup-meta.json', text: backupMeta() },
        { name: 'database/camzy.db', data: Buffer.from('this is definitely not a sqlite database') }
      ]);
      const r = await call(base, 'POST', '/api/admin/backup/restore/upload', {
        token: fullTok, raw: uploadForm(broken, 'camzy-backup-brokendb.zip')
      });
      assert.strictEqual(r.status, 422, JSON.stringify(r.body));
      assert.strictEqual(r.body.code, 'db_integrity_failed');
      assert.deepStrictEqual(listZips(BACKUP_DIR), before, 'broken archive never staged');
    });

    await t('restore: explicit confirmation is required', async () => {
      const r = await call(base, 'POST', '/api/admin/backup/restore/apply', { token: fullTok, body: { file: stagedFile } });
      assert.strictEqual(r.status, 400, JSON.stringify(r.body));
      assert.strictEqual(r.body.code, 'confirmation_required');

      const r2 = await call(base, 'POST', '/api/admin/backup/restore/apply', { token: fullTok, body: { confirm: false, file: stagedFile } });
      assert.strictEqual(r2.status, 400);
      assert.strictEqual(r2.body.code, 'confirmation_required');

      const live = new DatabaseSync(DB_PATH, { readOnly: true });
      const row = live.prepare("SELECT total FROM camzy_test_orders WHERE id = 'ord-1'").get();
      live.close();
      assert.strictEqual(row.total, 12345, 'production data untouched without confirmation');
    });

    await t('restore: an unknown archive is reported as missing (404)', async () => {
      const r = await call(base, 'POST', '/api/admin/backup/restore/apply', {
        token: fullTok, body: { confirm: true, file: 'camzy-backup-does-not-exist.zip' }
      });
      assert.strictEqual(r.status, 404, JSON.stringify(r.body));
      assert.strictEqual(r.body.code, 'backup_not_found');
    });

    await t('restore: a concurrent backup/restore/update operation blocks it (409)', async () => {
      const tok = bm.acquireOperation('scheduled-backup');
      try {
        const r = await call(base, 'POST', '/api/admin/backup/restore/apply', {
          token: fullTok, body: { confirm: true, file: stagedFile }
        });
        assert.strictEqual(r.status, 409, JSON.stringify(r.body));
        assert.strictEqual(r.body.code, 'operation_in_progress');
      } finally {
        bm.releaseOperation(tok);
      }
      assert.strictEqual(bm.currentOperation(), null, 'lock released after the rejected restore');
    });

    // A second staged archive that gets tampered with AFTER validation.
    let tamperedFile = null;
    await t('restore: a staged archive tampered with after validation is re-rejected', async () => {
      const r = await call(base, 'POST', '/api/admin/backup/restore/upload', {
        token: fullTok, raw: uploadForm(makeValidBackup(root, 888), 'camzy-backup-tampered.zip')
      });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      tamperedFile = r.body.filename;
      fs.writeFileSync(path.join(BACKUP_DIR, tamperedFile), 'no longer a zip');

      const before = fs.readFileSync(DB_PATH);
      const ap = await call(base, 'POST', '/api/admin/backup/restore/apply', {
        token: fullTok, body: { confirm: true, file: tamperedFile }
      });
      assert.strictEqual(ap.status, 422, JSON.stringify(ap.body));
      assert.strictEqual(ap.body.code, 'invalid_archive');
      assert.ok(fs.readFileSync(DB_PATH).equals(before), 'production database untouched');
      assert.ok(!fs.existsSync(path.join(root, 'uploads', 'receipts', 'from-backup.txt')), 'uploads untouched');
    });

    await t('restore: a failed safety backup aborts the restore (500)', async () => {
      // Every backup attempt fails because its manifest cannot be written —
      // the restore must abort before touching any production data.
      const manifest = path.join(BACKUP_DIR, 'manifest.json');
      const hadManifest = fs.existsSync(manifest);
      const manifestBackup = hadManifest ? fs.readFileSync(manifest) : null;
      fs.mkdirSync(manifest, { recursive: true });
      try {
        const before = fs.readFileSync(DB_PATH);
        const r = await call(base, 'POST', '/api/admin/backup/restore/apply', {
          token: fullTok, body: { confirm: true, file: stagedFile }
        });
        assert.strictEqual(r.status, 500, JSON.stringify(r.body));
        assert.strictEqual(r.body.code, 'safety_backup_failed');
        assert.ok(fs.readFileSync(DB_PATH).equals(before), 'production database untouched');
        assert.ok(!fs.existsSync(path.join(root, 'uploads', 'receipts', 'from-backup.txt')), 'uploads untouched');
        assert.ok(listZips(BACKUP_DIR).indexOf(stagedFile) !== -1, 'staged archive kept for a retry');
        assert.strictEqual(bm.currentOperation(), null, 'operation lock released after the failed safety backup');
      } finally {
        fs.rmSync(manifest, { recursive: true, force: true });
        if (hadManifest) fs.writeFileSync(manifest, manifestBackup);
      }
    });

    let restoreBody = null;
    await t('restore: a validated backup restores the database and uploads behind a verified safety backup', async () => {
      const r = await call(base, 'POST', '/api/admin/backup/restore/apply', {
        token: fullTok, body: { confirm: true, file: stagedFile }
      });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      restoreBody = r.body;
      assert.strictEqual(r.body.ok, true);
      assert.strictEqual(r.body.database, 'restored');
      assert.strictEqual(r.body.uploadsRestored, 2, 'both uploaded files restored');
      assert.strictEqual(r.body.backupTimestamp, BACKUP_CREATED_AT);

      // safety backup: created AND verified before anything was overwritten
      const sb = r.body.safetyBackup;
      assert.ok(sb, 'safety backup reported');
      assert.strictEqual(sb.status, 'success');
      assert.strictEqual(sb.verified, true);
      assert.ok(/^camzy-backup-.*\.zip$/.test(sb.filename), 'safety backup filename: ' + sb.filename);
      const manifest = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, 'manifest.json'), 'utf8'));
      const entry = (manifest.backups || []).find((b) => b.filename === sb.filename);
      assert.ok(entry, 'safety backup recorded in the manifest');
      assert.strictEqual(entry.status, 'success');
      assert.strictEqual(entry.verified.db, true);
      assert.ok(listZips(BACKUP_DIR).indexOf(sb.filename) !== -1, 'safety backup archive exists');

      // database swapped to the backup's content
      const fresh = new DatabaseSync(DB_PATH, { readOnly: true });
      const marker = fresh.prepare("SELECT total FROM camzy_test_orders WHERE id = 'ord-backup'").get();
      const tables = fresh.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get();
      fresh.close();
      assert.ok(marker, 'restored row present');
      assert.strictEqual(marker.total, 777, 'restored value');
      assert.ok(tables.n > 1, 'restored snapshot is queryable');

      // uploads restored together with the database
      assert.strictEqual(fs.readFileSync(path.join(root, 'uploads', 'receipts', 'from-backup.txt'), 'utf8'), 'receipt-from-backup\n');
      assert.strictEqual(fs.readFileSync(path.join(root, 'assets', 'images', 'uploads', 'from-backup.png'), 'utf8'), 'png-from-backup');
      // pre-existing uploads and secrets/config are preserved
      assert.strictEqual(fs.readFileSync(path.join(root, 'uploads', 'receipts', 'keep.txt'), 'utf8'), 'upload-original\n');
      assert.strictEqual(fs.readFileSync(path.join(root, '.env'), 'utf8'), 'SECRET_TOKEN=do-not-overwrite\n');
      // a copy of the replaced database is kept next to it
      const baks = fs.readdirSync(path.join(root, 'data')).filter((f) => /\.pre-restore-.*\.bak$/.test(f));
      assert.strictEqual(baks.length, 1, 'pre-restore copy kept');
      // nothing outside the project was written
      assert.ok(!fs.existsSync(path.join(root, 'evil.txt')), 'no traversal file');
      assert.strictEqual(bm.currentOperation(), null, 'operation lock released');
    });

    await t('restore: the server is never restarted automatically', () => {
      assert.strictEqual(typeof process.pid, 'number');
      assert.strictEqual(restoreBody.restartRequired, true, 'restart requirement reported instead of restarting');
    });

    await t('restore: the admin API still answers after the restore', async () => {
      const r = await call(base, 'GET', '/api/admin/backup/status', { token: fullTok });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.ok, true);
      assert.ok(Array.isArray(r.body.backups) && r.body.backups.length >= 1, 'backup list refreshed');
    });
  } catch (e) {
    results.push(['FAIL', 'http: phase setup :: ' + ((e && e.message) || e)]);
    if (process.env.VERBOSE) console.error(e);
  } finally {
    await new Promise((r) => {
      server.close(() => r());
      try { server.closeAllConnections(); } catch (_) {}
    });
  }
}

/* ───────────────────── frontend (DOM) verification ───────────────────── */
async function phaseDom() {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'admin', 'index.html'), 'utf8');
  const bkSrc = fs.readFileSync(path.join(REPO_ROOT, 'admin', 'assets', 'js', 'admin-backup.js'), 'utf8');

  // jsdom is a declared dependency of this repo but may be absent in a
  // checkout without node_modules — the static assertions above still cover
  // the UI wiring, so only the interactive DOM checks are skipped then.
  try { require.resolve('jsdom'); }
  catch (_) {
    results.push(['SKIP', 'dom: jsdom is not installed — interactive admin UI checks skipped (run npm install to enable them)']);
    return;
  }

  await t('dom: upload → validate → explicit confirm → restore request', async () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/admin/index.html' });
    const win = dom.window;
    const calls = [];
    const staged = {
      ok: true,
      filename: 'camzy-backup-2026-10-01.zip',
      savedPath: 'data/backups/camzy-backup-2026-10-01.zip',
      size: 4096,
      backupTimestamp: '2026-10-01T12:00:00.000Z',
      validation: {
        ok: true, archiveFiles: 5, fileCount: 4, uploadFiles: 2, totalUncompressed: 4096,
        backupTimestamp: '2026-10-01T12:00:00.000Z', version: '1.0.0', dbIntegrity: 'ok',
        sha256: 'a'.repeat(64)
      }
    };
    win.fetch = function (url, opts) {
      opts = opts || {};
      calls.push({ url: url, opts: opts });
      let body = { ok: true };
      if (url.indexOf('/admin/backup/restore/upload') !== -1) body = staged;
      else if (url.indexOf('/admin/backup/restore/apply') !== -1) {
        body = {
          ok: true, file: staged.filename, backupTimestamp: staged.backupTimestamp,
          safetyBackup: { filename: 'camzy-backup-safety.zip', status: 'success', verified: true },
          database: 'restored', uploadsRestored: 2, restartRequired: true, restoredAt: new Date().toISOString()
        };
      } else if (url.indexOf('/backup/status') !== -1) body = { ok: true, version: '1.0.0', latestBackup: null, backups: [], update: { available: false } };
      else if (url.indexOf('/github/config') !== -1) body = { ok: true, owner: '', repo: '', tokenConfigured: false };
      else if (url.indexOf('/api/admin/updates') !== -1) body = { ok: true, packages: [] };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    };
    win.localStorage.setItem('as_admin_session', JSON.stringify({ token: 'test-admin-token', admin: { id: 1, role: 'superadmin' } }));
    win.eval(bkSrc);
    assert.ok(win.CamzyAdminBackup && typeof win.CamzyAdminBackup.load === 'function', 'module exposed its loader');

    // pick a file (jsdom has no DataTransfer, so the list is injected)
    const input = win.document.getElementById('bu-restore-file');
    assert.ok(input, 'file input present');
    const file = new win.File(['zip-bytes'], 'camzy-backup-2026-10-01.zip', { type: 'application/zip' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });

    win.document.getElementById('bu-restore-upload').click();
    await new Promise((r) => setTimeout(r, 30));

    const uploadCall = calls.find((c) => c.url.indexOf('/admin/backup/restore/upload') !== -1);
    assert.ok(uploadCall, 'upload request sent');
    assert.strictEqual(uploadCall.opts.headers.Authorization, 'Bearer test-admin-token', 'admin bearer token sent');

    // details shown
    assert.strictEqual(win.document.getElementById('bu-restore-name').value, staged.filename, 'filename shown');
    assert.strictEqual(win.document.getElementById('bu-restore-size').value, '4.0 KB', 'size shown');
    assert.strictEqual(win.document.getElementById('bu-restore-time').value, new Date(staged.backupTimestamp).toLocaleString('fa-IR'), 'backup timestamp shown');
    assert.ok(win.document.getElementById('bu-restore-result').value.indexOf('معتبر') !== -1, 'validation result shown');
    const details = win.document.getElementById('bu-restore-validation').textContent;
    assert.ok(details.indexOf('صحت پایگاه داده') !== -1, 'validation details rendered');
    assert.ok(details.indexOf(staged.validation.sha256) !== -1, 'sha256 rendered');

    // confirmation is required before the restore button becomes usable
    const panel = win.document.getElementById('bu-restore-confirm');
    assert.strictEqual(panel.style.display, '', 'confirmation panel opened after validation');
    const chk = win.document.getElementById('bu-restore-check');
    const applyBtn = win.document.getElementById('bu-restore-apply');
    assert.strictEqual(applyBtn.disabled, true, 'restore disabled before explicit confirmation');
    assert.strictEqual(win.document.getElementById('bu-restore-summary').textContent, staged.filename, 'exact filename in the confirmation text');

    chk.checked = true;
    chk.dispatchEvent(new win.Event('change', { bubbles: true }));
    assert.strictEqual(applyBtn.disabled, false, 'restore enabled after explicit confirmation');

    applyBtn.click();
    await new Promise((r) => setTimeout(r, 30));

    const applyCall = calls.find((c) => c.url.indexOf('/admin/backup/restore/apply') !== -1);
    assert.ok(applyCall, 'restore request sent');
    const sent = JSON.parse(applyCall.opts.body);
    assert.strictEqual(sent.confirm, true, 'explicit confirmation sent');
    assert.strictEqual(sent.file, staged.filename, 'exact staged filename sent');
    assert.strictEqual(applyCall.opts.headers['Content-Type'], 'application/json');
    assert.ok(win.document.getElementById('bu-restore-msg').textContent.indexOf('بازیابی انجام شد') !== -1, 'success message shown');
    assert.ok(win.document.getElementById('bu-restore-msg').textContent.indexOf('ری‌استارت') !== -1, 'restart note shown');

    // the GitHub update workflow is untouched in the same module
    assert.ok(win.document.getElementById('bu-upload-file'), 'update upload input still wired');
    assert.ok(win.document.getElementById('bu-confirm-apply'), 'update install button still wired');
    dom.window.close();
  });

  await t('dom: a rejected upload reports the error and clears the confirmation', async () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/admin/index.html' });
    const win = dom.window;
    win.fetch = function (url, opts) {
      opts = opts || {};
      if (String(url).indexOf('/admin/backup/restore/upload') !== -1) {
        return Promise.resolve({ ok: false, status: 422, json: () => Promise.resolve({ error: 'This is an update package, not a backup archive.', code: 'update_package' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, backups: [], update: {} }) });
    };
    win.localStorage.setItem('as_admin_session', JSON.stringify({ token: 'test-admin-token' }));
    win.eval(bkSrc);

    const input = win.document.getElementById('bu-restore-file');
    const file = new win.File(['zip-bytes'], 'camzy-update-2.0.0.zip', { type: 'application/zip' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });

    win.document.getElementById('bu-restore-upload').click();
    await new Promise((r) => setTimeout(r, 30));

    assert.strictEqual(win.document.getElementById('bu-restore-confirm').style.display, 'none', 'confirmation never opened');
    assert.strictEqual(win.document.getElementById('bu-restore-apply').disabled, true, 'restore stays disabled');
    assert.ok(win.document.getElementById('bu-restore-msg').textContent.indexOf('update package') !== -1, 'rejection reason shown');
    assert.strictEqual(win.document.getElementById('bu-restore-result').value, 'نامعتبر', 'validation result marked invalid');
    dom.window.close();
  });
}

/* ───────────────────────────── runner ────────────────────────────────── */
(async () => {
  phaseSource();
  await phaseHttp();
  await phaseDom();

  const failed = results.filter((r) => r[0] === 'FAIL');
  for (const [status, name] of results) console.log(status + '  ' + name);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  if (!process.env.KEEP_TEMP) {
    for (const dir of PROJECT_COPIES) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
  } else {
    console.log('temp copies kept at:\n  ' + PROJECT_COPIES.join('\n  '));
  }
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
