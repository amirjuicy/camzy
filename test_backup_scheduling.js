'use strict';
/* Focused regression tests for the daily production backup system.
 *
 * Covers: schedule/timezone math (incl. DST boundaries), due-slot evaluation,
 * database + upload inclusion and archive verification, retention pruning that
 * only touches managed files, failure recording/reporting, concurrent
 * operation safety (backup vs update vs rollback), restart catch-up without
 * duplicates, and the access-control wiring for backup archives.
 *
 * Every scenario runs against a throwaway temp project root (PROJECT_ROOT /
 * DB_PATH / BACKUP_DIR point into os.tmpdir()), so the production database,
 * uploads and the running server are never touched. The logger module is
 * stubbed so tests do not write into server/logs.
 *
 * Run: node test_backup_scheduling.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const unzipper = require('unzipper');

const REPO = __dirname;
const MANAGER = path.join(REPO, 'server', 'backup-manager.js');
const SCHEDULER = path.join(REPO, 'server', 'backup-scheduler.js');
const LOGGER = path.join(REPO, 'server', 'logger.js');
const ENV_KEYS = ['PROJECT_ROOT', 'DB_PATH', 'BACKUP_DIR', 'UPDATE_DIR'];

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('  ok   ' + name);
  } catch (e) {
    failed += 1;
    console.error('  FAIL ' + name + '\n       ' + String((e && e.stack) || e).split('\n').join('\n       '));
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* ── temp project root ──────────────────────────────────────────────────── */

function makeRoot(opts) {
  opts = opts || {};
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'camzy-bktest-'));
  const dataDir = path.join(root, 'data');
  const backupDir = path.join(dataDir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'camzy-test', version: '0.0.7' }, null, 2));
  fs.writeFileSync(path.join(root, '.env'), 'SECRET_KEY=must-never-be-archived\n');

  fs.mkdirSync(path.join(root, 'server'), { recursive: true });
  fs.writeFileSync(path.join(root, 'server', 'app.js'), '// app code\n');

  fs.mkdirSync(path.join(root, 'assets', 'js'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets', 'js', 'shop.js'), '// shop js\n');

  // upload locations used by the real app: receipts/chat + product/store images
  fs.mkdirSync(path.join(root, 'uploads', 'receipts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'uploads', 'receipts', 'receipt-1.jpg'), Buffer.from('receipt-bytes'));
  fs.mkdirSync(path.join(root, 'assets', 'images', 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets', 'images', 'uploads', 'product-1.png'), Buffer.from('product-image'));

  const dbPath = path.join(dataDir, 'camzy.db');
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL);" +
    "INSERT INTO products (name) VALUES ('CAM-4MP');" +
    "PRAGMA user_version = 7;");
  db.close();

  return {
    root: root,
    dbPath: dbPath,
    backupDir: backupDir,
    env: {
      PROJECT_ROOT: root,
      DB_PATH: dbPath,
      BACKUP_DIR: backupDir,
      UPDATE_DIR: path.join(dataDir, 'updates')
    }
  };
}

// Break the database AFTER settings were written, so every backup attempt on
// this root must fail (used by the failure-reporting tests).
function corruptDatabase(t) {
  fs.writeFileSync(t.dbPath, 'this is definitely not a sqlite database');
}

function cleanupRoot(t) {
  try { fs.rmSync(t.root, { recursive: true, force: true }); } catch (_) {}
}

function writeSettings(t, s) {
  const db = new DatabaseSync(t.dbPath);
  try {
    db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT (datetime('now')))");
    const ins = db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at");
    if (s.enabled !== undefined) ins.run('backup.schedule.enabled', String(s.enabled));
    if (s.time !== undefined) ins.run('backup.schedule.time', String(s.time));
    if (s.timezone !== undefined) ins.run('backup.schedule.timezone', String(s.timezone));
    if (s.retention !== undefined) ins.run('backup.retention.count', String(s.retention));
  } finally { db.close(); }
}

/* ── fresh module load (config is read at require time) ─────────────────── */

function freshLoad(target, env) {
  const saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  for (const k of ENV_KEYS) if (env && env[k] !== undefined) process.env[k] = env[k];

  const loggerPath = require.resolve(LOGGER);
  for (const p of [MANAGER, SCHEDULER, LOGGER]) {
    try { delete require.cache[require.resolve(p)]; } catch (_) {}
  }
  // Stub the logger so scheduler runs never append to the real server/logs.
  require.cache[loggerPath] = {
    id: loggerPath, filename: loggerPath, loaded: true, children: [], paths: [],
    exports: { logInfo() {}, logError() {}, logWarn() {}, logSecurity() {} }
  };
  try {
    return require(target);
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

// Load scheduler + the exact backup-manager instance it uses, configured for t.
function load(t) {
  const sch = freshLoad(SCHEDULER, t.env);
  const bm = require(MANAGER);
  return { sch: sch, bm: bm };
}

const TZ = 'Asia/Tehran'; // UTC+3:30, no DST — the server's local zone

/* ── tests ──────────────────────────────────────────────────────────────── */

async function main() {
  const temps = [];

  await test('timezone math: slot keys and 00:00 boundaries (Tehran)', async () => {
    const t = makeRoot(); temps.push(t);
    const { sch } = load(t);
    const i = sch._internals;

    // 13:30 Tehran on 25 Oct is 10:00 UTC the same day.
    assert.strictEqual(i.localDateKey(Date.UTC(2026, 9, 25, 10, 0), TZ), '2026-10-25');
    // 19:00 UTC is already 22:30 Tehran -> still the same local day.
    assert.strictEqual(i.localDateKey(Date.UTC(2026, 9, 25, 19, 0), TZ), '2026-10-25');
    // 21:00 UTC is 00:30 the NEXT day in Tehran.
    assert.strictEqual(i.localDateKey(Date.UTC(2026, 9, 25, 21, 0), TZ), '2026-10-26');
    // 00:00 Tehran == 20:30 UTC the previous day.
    assert.strictEqual(i.slotStartFor('2026-10-25', '00:00', TZ), Date.UTC(2026, 9, 24, 20, 30));
    // and it maps back to the intended wall clock
    assert.deepStrictEqual(
      ((p) => ({ h: p.hour, m: p.minute }))(i.zonedParts(i.slotStartFor('2026-10-25', '00:00', TZ), TZ)),
      { h: 0, m: 0 }
    );
    // next occurrence strictly after a moment just before the slot
    const before = i.slotStartFor('2026-10-25', '00:00', TZ) - 60000;
    assert.strictEqual(i.nextRunAfter(before, '00:00', TZ), i.slotStartFor('2026-10-25', '00:00', TZ));
    // and the day after that
    assert.strictEqual(
      i.nextRunAfter(i.slotStartFor('2026-10-25', '00:00', TZ), '00:00', TZ),
      i.slotStartFor('2026-10-26', '00:00', TZ)
    );
    cleanupRoot(t);
  });

  await test('timezone math: DST boundaries (23h and 25h days, skipped midnight)', async () => {
    const t = makeRoot(); temps.push(t);
    const { sch } = load(t);
    const i = sch._internals;

    // US DST 2026: begins Sun 8 Mar, ends Sun 1 Nov.
    assert.strictEqual(i.slotStartFor('2026-03-08', '00:00', 'America/New_York'), Date.UTC(2026, 2, 8, 5, 0)); // EST
    assert.strictEqual(i.slotStartFor('2026-03-09', '00:00', 'America/New_York'), Date.UTC(2026, 2, 9, 4, 0)); // EDT
    assert.strictEqual(i.slotStartFor('2026-11-01', '00:00', 'America/New_York'), Date.UTC(2026, 10, 1, 4, 0)); // EDT
    assert.strictEqual(i.slotStartFor('2026-11-02', '00:00', 'America/New_York'), Date.UTC(2026, 10, 2, 5, 0)); // EST

    const spring = i.slotStartFor('2026-03-08', '00:00', 'America/New_York');
    // The spring-forward day is 23h long: the next 00:00 comes 23h later.
    assert.strictEqual(i.nextRunAfter(spring - 1000, '00:00', 'America/New_York'), spring);
    assert.strictEqual(i.nextRunAfter(spring + 3600000, '00:00', 'America/New_York'), Date.UTC(2026, 2, 9, 4, 0));
    const fall = i.slotStartFor('2026-11-01', '00:00', 'America/New_York');
    assert.strictEqual(i.nextRunAfter(fall + 3600000, '00:00', 'America/New_York'), Date.UTC(2026, 10, 2, 5, 0));

    // Zones where local midnight is skipped or repeated by DST must still
    // resolve to a real instant, and the slot must fire no later than 01:00
    // local on the intended day (never a day late).
    const prevKey = (key) => {
      const d = new Date(key + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    };
    for (const zone of ['America/Santiago', 'America/Havana', 'America/Sao_Paulo']) {
      for (let day = 1; day <= 28; day += 1) {
        const key = '2026-09-' + String(day).padStart(2, '0');
        const ts = i.slotStartFor(key, '00:00', zone);
        assert.ok(Number.isFinite(ts), zone + ' ' + key + ' produced ' + ts);
        const p = i.zonedParts(ts, zone);
        assert.strictEqual(p.minute, 0, zone + ' ' + key + ' minute drift');
        assert.ok(p.hour === 0 || p.hour === 23, zone + ' ' + key + ' resolved to ' + p.hour + ':' + p.minute);
        const dk = i.localDateKey(ts, zone);
        assert.ok(dk === key || dk === prevKey(key), zone + ' ' + key + ' landed on ' + dk);
        // the slot is satisfied by 01:00 local on the target day
        assert.ok(ts <= i.zonedToUtc(2026, 9, day, 1, 0, zone), zone + ' ' + key + ' fires too late');
      }
    }
    cleanupRoot(t);
  });

  await test('due-slot evaluation: not due, due, already completed, disabled', async () => {
    const t = makeRoot(); temps.push(t);
    writeSettings(t, { enabled: 'true', time: '00:00', timezone: TZ, retention: '20' });
    const { sch, bm } = load(t);
    const cfg = bm.getBackupSettings();
    const slotStart = sch._internals.slotStartFor('2026-10-25', '00:00', TZ);

    let st = sch.evaluateDue(slotStart - 60000, cfg, []);
    // 23:59 local on the previous day evaluates *that* day's slot — a missed
    // slot stays due (that is what catch-up relies on), it is never skipped.
    assert.strictEqual(st.dayKey, '2026-10-24');
    assert.strictEqual(st.due, true);
    assert.ok(st.nextRun === slotStart, 'next run is the upcoming 00:00 slot');

    st = sch.evaluateDue(slotStart + 60000, cfg, []);
    assert.strictEqual(st.due, true);
    assert.strictEqual(st.reason, 'due');
    assert.strictEqual(st.dayKey, '2026-10-25');
    assert.ok(st.nextRun > slotStart, 'next run must be the following day');

    st = sch.evaluateDue(slotStart + 3600000, cfg, [
      { scheduledFor: '2026-10-25', status: 'success', createdAt: new Date(slotStart + 60000).toISOString() }
    ]);
    assert.strictEqual(st.due, false);
    assert.strictEqual(st.reason, 'already_completed');

    const off = Object.assign({}, cfg, { enabled: false });
    st = sch.evaluateDue(slotStart + 60000, off, []);
    assert.strictEqual(st.due, false);
    assert.strictEqual(st.reason, 'disabled');
    cleanupRoot(t);
  });

  await test('due-slot evaluation: a recent backup from another writer covers the slot', async () => {
    const t = makeRoot(); temps.push(t);
    writeSettings(t, { enabled: 'true', time: '00:00', timezone: TZ });
    const { sch, bm } = load(t);
    const cfg = bm.getBackupSettings();
    const slotStart = sch._internals.slotStartFor('2026-10-25', '00:00', TZ);

    // External 02:30-style snapshot created shortly after the slot start.
    const external = path.join(t.backupDir, 'camzy-2026-10-24T23-00-00-000Z.db');
    fs.writeFileSync(external, 'x');
    const near = new Date(slotStart + 90 * 60000); // 01:30 local
    fs.utimesSync(external, near, near);

    let st = sch.evaluateDue(slotStart + 120 * 60000, cfg, []);
    assert.strictEqual(st.due, false);
    assert.strictEqual(st.reason, 'covered_by_recent_backup');

    // A stale file (well before the dedupe window) must not cover the slot.
    const old = new Date(slotStart - 6 * 3600000);
    fs.utimesSync(external, old, old);
    st = sch.evaluateDue(slotStart + 120 * 60000, cfg, []);
    assert.strictEqual(st.due, true);
    assert.strictEqual(st.reason, 'due');
    fs.unlinkSync(external);
    cleanupRoot(t);
  });

  await test('due-slot evaluation: failure retries back off 1h, cap at 3 attempts', async () => {
    const t = makeRoot(); temps.push(t);
    writeSettings(t, { enabled: 'true', time: '00:00', timezone: TZ });
    const { sch, bm } = load(t);
    const cfg = bm.getBackupSettings();
    const slotStart = sch._internals.slotStartFor('2026-10-25', '00:00', TZ);
    const now = slotStart + 10 * 60000;
    const fail = (at) => ({ scheduledFor: '2026-10-25', status: 'failed', createdAt: new Date(at).toISOString() });

    // one failure 5 minutes ago -> wait for the 1h backoff
    let st = sch.evaluateDue(now, cfg, [fail(now - 5 * 60000)]);
    assert.strictEqual(st.due, false);
    assert.strictEqual(st.reason, 'retry_backoff');
    assert.strictEqual(st.attempts, 1);

    // one failure 61 minutes ago -> retry allowed
    st = sch.evaluateDue(now, cfg, [fail(now - 61 * 60000)]);
    assert.strictEqual(st.due, true);
    assert.strictEqual(st.attempts, 1);

    // three failures -> give up until the next day
    st = sch.evaluateDue(now, cfg, [fail(now - 61 * 60000), fail(now - 62 * 60000), fail(now - 63 * 60000)]);
    assert.strictEqual(st.due, false);
    assert.strictEqual(st.reason, 'max_attempts_reached');
    assert.strictEqual(st.attempts, sch._constants.MAX_ATTEMPTS_PER_SLOT);
    cleanupRoot(t);
  });

  await test('createBackup: archives database + uploads, verifies before success', async () => {
    const t = makeRoot(); temps.push(t);
    writeSettings(t, { enabled: 'true', time: '00:00', timezone: TZ, retention: '20' });
    const { bm } = load(t);

    const meta = await bm.createBackup({ trigger: 'manual' });
    assert.strictEqual(meta.status, 'success');
    assert.strictEqual(meta.verified.db, true, 'database snapshot must be verified');
    assert.strictEqual(meta.verified.meta, true, 'backup-meta.json must be present');
    assert.strictEqual(meta.verified.uploadFiles, 2, 'both upload locations must be captured');
    assert.strictEqual(meta.verified.expectedUploadFiles, 2);
    assert.ok(meta.verified.archiveFiles >= 5, 'app files must be archived');
    assert.strictEqual(meta.trigger, 'manual');

    const zipPath = path.join(t.backupDir, meta.filename);
    assert.ok(fs.existsSync(zipPath), 'archive written to backup dir');
    assert.ok(meta.size > 0);

    // manifest records the success
    const m = JSON.parse(fs.readFileSync(path.join(t.backupDir, 'manifest.json'), 'utf8'));
    assert.strictEqual(m.backups[0].filename, meta.filename);
    assert.strictEqual(m.backups[0].status, 'success');
    assert.strictEqual(m.backups[0].managed, true);

    // archive contents
    const zip = await unzipper.Open.file(zipPath);
    const paths = zip.files.map((f) => String(f.path || ''));
    assert.ok(paths.includes('database/camzy.db'), 'db snapshot in archive');
    assert.ok(paths.includes('backup-meta.json'), 'meta in archive');
    assert.ok(paths.includes('app/server/app.js'), 'application files in archive');
    assert.ok(paths.includes('app/uploads/receipts/receipt-1.jpg'), 'receipt uploads in archive');
    assert.ok(paths.includes('app/assets/images/uploads/product-1.png'), 'product images in archive');
    assert.ok(paths.includes('app/assets/js/shop.js'), 'shared assets in archive');
    assert.ok(!paths.some((p) => p.indexOf('app/data/') === 0), 'data dir must never be archived');
    assert.ok(!paths.some((p) => p.indexOf('.env') !== -1), '.env must never be archived');
    assert.ok(!paths.some((p) => p.indexOf('.db') !== -1 && p !== 'database/camzy.db'), 'only the snapshot db');

    // the snapshot is a working database containing the live rows
    const dbEntry = zip.files.find((f) => f.path === 'database/camzy.db');
    const verifyFile = path.join(os.tmpdir(), 'camzy-test-verify-' + Date.now() + '.db');
    fs.writeFileSync(verifyFile, await dbEntry.buffer());
    try {
      const vdb = new DatabaseSync(verifyFile);
      try {
        assert.strictEqual(vdb.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
        assert.strictEqual(vdb.prepare('SELECT name FROM products LIMIT 1').get().name, 'CAM-4MP');
        assert.strictEqual(vdb.prepare('PRAGMA user_version').get().user_version, 7);
      } finally { vdb.close(); }
    } finally { try { fs.unlinkSync(verifyFile); } catch (_) {} }

    cleanupRoot(t);
  });

  await test('createBackup: includeUploads:false skips uploads without failing verification', async () => {
    const t = makeRoot(); temps.push(t);
    const { bm } = load(t);
    const meta = await bm.createBackup({ includeUploads: false });
    assert.strictEqual(meta.status, 'success');
    assert.strictEqual(meta.includeUploads, false);
    assert.strictEqual(meta.verified.uploadFiles, 0);
    const zip = await unzipper.Open.file(path.join(t.backupDir, meta.filename));
    const paths = zip.files.map((f) => String(f.path || ''));
    assert.ok(!paths.some((p) => p.indexOf('app/uploads/') === 0 || p.indexOf('app/assets/images/uploads/') === 0));
    assert.ok(paths.includes('app/server/app.js'), 'app files still archived');
    cleanupRoot(t);
  });

  await test('retention: prunes only managed archives, never manual or external files', async () => {
    const t = makeRoot(); temps.push(t);
    writeSettings(t, { enabled: 'true', time: '00:00', timezone: TZ, retention: '20' });
    const { bm } = load(t);

    const managedOld = [
      'camzy-backup-2026-10-20T00-00-00-000Z.zip',
      'camzy-backup-2026-10-21T00-00-00-000Z.zip'
    ];
    const externalDb = 'camzy-2026-10-22T23-00-00-000Z.db';   // external task style
    const manualZip = 'operator-manual-copy.zip';              // manually created

    const entries = [];
    const oldDates = ['2026-10-20T00:00:00.000Z', '2026-10-21T00:00:00.000Z'];
    managedOld.forEach((name, idx) => {
      fs.writeFileSync(path.join(t.backupDir, name), 'zip-bytes');
      entries.push({ filename: name, createdAt: oldDates[idx], status: 'success', managed: true, trigger: 'manual' });
    });
    // manifest also lists a manually registered archive (does not match the
    // managed filename pattern, so pruning must skip it)
    fs.writeFileSync(path.join(t.backupDir, manualZip), 'zip-bytes');
    entries.push({ filename: manualZip, createdAt: '2026-10-19T00:00:00.000Z', status: 'success', managed: false });
    // a record whose archive has vanished is dead weight and may be dropped
    entries.push({ filename: 'camzy-backup-2026-10-18T00-00-00-000Z.zip', createdAt: '2026-10-18T00:00:00.000Z', status: 'success', managed: true });
    // external task's .db is on disk but never in our manifest
    fs.writeFileSync(path.join(t.backupDir, externalDb), 'sqlite-bytes');

    fs.writeFileSync(path.join(t.backupDir, 'manifest.json'), JSON.stringify({ backups: entries }, null, 2));

    const meta = await bm.createBackup({ keep: 2 });
    assert.strictEqual(meta.status, 'success');
    assert.ok(Array.isArray(meta.pruned));

    // managed archives: keep=newest+next, prune the oldest; unmanaged untouched
    assert.ok(!fs.existsSync(path.join(t.backupDir, managedOld[0])), 'oldest managed archive pruned');
    assert.ok(fs.existsSync(path.join(t.backupDir, managedOld[1])), 'kept managed archive must survive');
    // unmanaged files are untouched
    assert.ok(fs.existsSync(path.join(t.backupDir, externalDb)), 'external .db must never be deleted');
    assert.ok(fs.existsSync(path.join(t.backupDir, manualZip)), 'manual archive must never be deleted');
    assert.ok(fs.existsSync(path.join(t.backupDir, meta.filename)), 'new backup present');

    const m = JSON.parse(fs.readFileSync(path.join(t.backupDir, 'manifest.json'), 'utf8'));
    const names = m.backups.map((b) => b.filename);
    assert.strictEqual(m.backups.length, 3, 'newest two managed + the retained manual record');
    assert.ok(names.includes(manualZip), 'manual entry retained in manifest');
    assert.ok(names.includes(meta.filename), 'new backup recorded');
    assert.ok(names.includes(managedOld[1]), 'kept managed archive recorded');
    assert.ok(!names.includes(managedOld[0]), 'pruned archive removed from manifest');
    assert.ok(!names.includes('camzy-backup-2026-10-18T00-00-00-000Z.zip'), 'dead record dropped');
    cleanupRoot(t);
  });

  await test('failure reporting: failed attempt recorded and visible in history', async () => {
    const t = makeRoot(); temps.push(t);
    corruptDatabase(t);
    const { bm, sch } = load(t);
    // settings are passed explicitly: this root's database is deliberately
    // unreadable, so schedule config cannot come from the settings table here.
    const cfg = { enabled: true, time: '00:00', timezone: TZ, retentionCount: 20, timezoneSource: 'setting' };

    let threw = null;
    try { await bm.createBackup({ trigger: 'scheduled', scheduledFor: '2026-10-25' }); } catch (e) { threw = e; }
    assert.ok(threw, 'a corrupt database must fail the backup');

    const list = bm.listBackups();
    assert.strictEqual(list.length, 1, 'failed attempt must appear in history');
    assert.strictEqual(list[0].status, 'failed');
    assert.strictEqual(list[0].trigger, 'scheduled');
    assert.strictEqual(list[0].scheduledFor, '2026-10-25');
    assert.ok(list[0].error && list[0].error.length > 0, 'error message recorded');
    assert.strictEqual(list[0].managed, true);
    assert.ok(!fs.existsSync(path.join(t.backupDir, list[0].filename)), 'no partial archive is left behind');

    const slotStart = sch._internals.slotStartFor('2026-10-25', '00:00', TZ);
    const s = sch.describeSchedule({ settings: cfg, now: slotStart + 60000 });
    assert.ok(s.lastFailure, 'status payload exposes the failure');
    assert.strictEqual(s.lastFailure.scheduledFor, '2026-10-25');
    assert.strictEqual(s.stale, true, 'no successful backup -> stale');
    assert.strictEqual(s.staleReason, 'no_successful_backup');
    cleanupRoot(t);
  });

  await test('failure reporting: scheduler records a failed scheduled attempt and backs off', async () => {
    const t = makeRoot(); temps.push(t);
    corruptDatabase(t);
    const { bm, sch } = load(t);
    const cfg = { enabled: true, time: '00:00', timezone: TZ, retentionCount: 20, timezoneSource: 'setting' };

    const slotStart = sch._internals.slotStartFor('2026-10-25', '00:00', TZ);
    const now = slotStart + 60000;
    const r = await sch.runScheduledBackupIfDue({ now: now, settings: cfg });

    assert.strictEqual(r.ran, true, 'the due slot must be attempted');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'backup_failed');
    assert.ok(r.error, 'error surfaced to the caller');

    const list = bm.listBackups();
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].status, 'failed');
    assert.strictEqual(list[0].trigger, 'scheduled');
    assert.strictEqual(list[0].scheduledFor, '2026-10-25', 'attempt tied to its slot');

    // Pin the recorded attempt onto the synthetic timeline so retry math is
    // deterministic (the run itself stamped the real clock).
    const manifestPath = path.join(t.backupDir, 'manifest.json');
    const man = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    man.backups[0].createdAt = new Date(now).toISOString();
    fs.writeFileSync(manifestPath, JSON.stringify(man, null, 2));

    // immediate re-run must NOT retry (backoff), after 61 minutes it may
    let st = sch.evaluateDue(now + 5 * 60000, cfg, bm.listBackups());
    assert.strictEqual(st.reason, 'retry_backoff');
    st = sch.evaluateDue(now + 61 * 60000, cfg, bm.listBackups());
    assert.strictEqual(st.due, true);
    cleanupRoot(t);
  });

  await test('concurrency: operation lock blocks backups, installs and rollbacks', async () => {
    const t = makeRoot(); temps.push(t);
    writeSettings(t, { enabled: 'true', time: '00:00', timezone: TZ, retention: '20' });
    const { bm, sch } = load(t);

    // 1) a held lock refuses a new backup with 409 and creates nothing
    const tok = bm.acquireOperation('update');
    assert.strictEqual(bm.currentOperation().kind, 'update');
    let err = null;
    try { await bm.createBackup({}); } catch (e) { err = e; }
    assert.strictEqual(err && err.code, 'operation_in_progress');
    assert.strictEqual(err && err.status, 409);
    assert.ok(!fs.readdirSync(t.backupDir).some((f) => /\.zip$/i.test(f)), 'no archive while locked');

    // 2) the scheduler reports "busy" instead of burning a failed attempt
    const slotStart = sch._internals.slotStartFor('2026-10-25', '00:00', TZ);
    const r = await sch.runScheduledBackupIfDue({ now: slotStart + 60000, settings: bm.getBackupSettings() });
    assert.strictEqual(r.ran, false);
    assert.strictEqual(r.reason, 'busy');
    assert.strictEqual(bm.listBackups().length, 0, 'busy is not an attempt');

    // 3) install refused while a backup/rollback holds the lock
    let e2 = null;
    try { await bm.applyUpdate({}); } catch (e) { e2 = e; }
    assert.strictEqual(e2 && e2.code, 'operation_in_progress');

    // 4) a nested backup that receives the caller's token does not deadlock
    //    and does not release the outer lock (applyUpdate's pre-install backup)
    const meta = await bm.createBackup({ _operation: tok, includeUploads: false });
    assert.strictEqual(meta.status, 'success');
    assert.strictEqual(bm.currentOperation(), tok, 'outer lock still held after nested backup');
    bm.releaseOperation(tok);
    assert.strictEqual(bm.currentOperation(), null);

    // 5) applyUpdate releases its own lock when it fails (no lock leak)
    let e3 = null;
    try { await bm.applyUpdate({}); } catch (e) { e3 = e; }
    assert.strictEqual(e3 && e3.code, 'confirmation_required', 'validation error, not a lock error');
    assert.strictEqual(bm.currentOperation(), null, 'lock released after failed install attempt');

    // 6) rollback honours a caller token, and is refused when another
    //    operation holds the lock (no file is touched in either case)
    const tok2 = bm.acquireOperation('rollback');
    let e4 = null;
    try { await bm.rollbackBackup('missing.zip', { _operation: tok2 }); } catch (e) { e4 = e; }
    assert.strictEqual(e4 && e4.message, 'Backup not found', 'token avoids a 409');
    bm.releaseOperation(tok2);

    const tok3 = bm.acquireOperation('scheduled-backup');
    let e5 = null;
    try { await bm.rollbackBackup('missing.zip'); } catch (e) { e5 = e; }
    assert.strictEqual(e5 && e5.code, 'operation_in_progress');
    bm.releaseOperation(tok3);
    assert.strictEqual(bm.currentOperation(), null);
    cleanupRoot(t);
  });

  await test('restart catch-up: runs the missed slot once, restart never duplicates it', async () => {
    const t = makeRoot(); temps.push(t);
    writeSettings(t, { enabled: 'true', time: '00:00', timezone: TZ, retention: '20' });

    // First boot: catch-up runs the pending slot.
    const first = load(t);
    const started = first.sch.startBackupScheduler({ catchUpDelayMs: 50 });
    assert.strictEqual(started.started, true);
    assert.ok(started.schedule, 'boot reports the schedule');

    let got = false;
    for (let n = 0; n < 60 && !got; n += 1) {
      await sleep(100);
      const slot = first.sch.describeSchedule({ settings: first.bm.getBackupSettings() }).currentSlot;
      got = first.bm.listBackups().some((b) => b.status === 'success' && b.trigger === 'scheduled' && b.scheduledFor === slot);
    }
    assert.ok(got, 'catch-up created the scheduled backup');
    first.sch.stopBackupScheduler();

    const zips = () => fs.readdirSync(t.backupDir).filter((f) => /\.zip$/i.test(f));
    assert.strictEqual(zips().length, 1, 'exactly one archive after catch-up');

    // Simulated restart: fresh module state, same data directory.
    const second = load(t);
    const restarted = second.sch.startBackupScheduler({ catchUpDelayMs: 50 });
    assert.strictEqual(restarted.started, true);
    await sleep(600);
    second.sch.stopBackupScheduler();

    assert.strictEqual(zips().length, 1, 'restart must not create a duplicate backup');
    const success = second.bm.listBackups().filter((b) => b.status === 'success' && b.trigger === 'scheduled');
    assert.strictEqual(success.length, 1, 'still exactly one scheduled success for the slot');
    assert.strictEqual(success[0].scheduledFor, second.sch.describeSchedule({ settings: second.bm.getBackupSettings() }).currentSlot);
    cleanupRoot(t);
  });

  await test('access control: archives are behind admin auth and the /data block', async () => {
    const src = fs.readFileSync(path.join(REPO, 'server', 'app.js'), 'utf8');

    // every backup/update admin route is registered with requireAdmin
    const routeLines = src.split('\n').filter((l) => /api\.(get|post|put|delete)\(\s*['"`]\/admin\/(backup|backups|backup-update|updates)/.test(l));
    assert.ok(routeLines.length >= 8, 'expected the backup/update routes, found ' + routeLines.length);
    for (const l of routeLines) {
      assert.ok(l.indexOf('requireAdmin') !== -1, 'route missing requireAdmin: ' + l.trim());
    }

    // /data (backup archives) is blocked before the static file server runs
    assert.ok(src.indexOf(String.raw`/^\/data(\/|$)/i`) !== -1, 'static /data rule present');
    const idxBlock = src.indexOf('app.use(blockSensitivePaths)');
    const idxStatic = src.indexOf('app.use(express.static(ROOT');
    assert.ok(idxBlock !== -1 && idxStatic !== -1 && idxBlock < idxStatic, 'static root must be served behind blockSensitivePaths');
    // download endpoint itself is admin-gated
    assert.ok(/api\.get\('\/admin\/backup\/download[^']*'.*requireAdmin/.test(src), 'download route admin-only');
  });

  for (const t of temps) cleanupRoot(t);

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
