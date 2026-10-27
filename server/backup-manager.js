'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const archiver = require('archiver');
const unzipper = require('unzipper');

const ROOT = process.env.PROJECT_ROOT ? path.resolve(process.env.PROJECT_ROOT) : path.join(__dirname, '..');
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'camzy.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(ROOT, 'data', 'backups');
const UPDATE_DIR = process.env.UPDATE_DIR || path.join(ROOT, 'data', 'updates');

function appVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    if (pkg && pkg.version) return String(pkg.version);
  } catch (_) {}
  return process.env.APP_VERSION || '1.0.0';
}
const APP_VERSION = appVersion();

const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'data', 'uploads', 'logs', '_pbtests', 'test-results', '.freebuff', '.kilo', '.kombai', '.vscode']);
const EXCLUDE_EXT = new Set(['.log', '.db', '.db-wal', '.db-shm', '.sqlite', '.bak', '.tmp', '.ps1', '.bat']);
const EXCLUDE_FILES = new Set(['.env', '.env.local', '.env.production', 'package-lock.json']);
// Archives created by this system are always named camzy-backup-<ISO time>.zip.
// Retention/pruning uses this pattern PLUS a manifest entry, so manually copied
// backups and the external scheduled task's camzy-*.db snapshots are never deleted.
const MANAGED_BACKUP_RE = /^camzy-backup-[A-Za-z0-9._-]+[.]zip$/;

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

function walkFiles(dir, base, opts) {
  base = base || ROOT;
  opts = opts || {};
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).replace(/\\/g, '/');
    const segs = rel.split('/');
    if (segs.some((s) => (EXCLUDE_DIRS.has(s) && !(opts.includeUploads && s === 'uploads')) || (s.startsWith('.') && s !== '.well-known'))) continue;
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, base, opts));
    } else {
      if (EXCLUDE_FILES.has(entry.name)) continue;
      if (/_cred|_session|_live/i.test(entry.name)) continue;
      // Exclude loose top-level text artifacts, but keep application text files in subfolders.
      if (rel.indexOf('/') === -1 && /\.txt$/i.test(entry.name)) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (EXCLUDE_EXT.has(ext)) continue;
      try {
        const st = fs.statSync(full);
        if (!st.isFile() || st.size > 50 * 1024 * 1024) continue;
      } catch (_) { continue; }
      out.push({ full, rel });
    }
  }
  return out;
}

function manifestPath() { return path.join(BACKUP_DIR, 'manifest.json'); }
function readManifest() {
  try { return JSON.parse(fs.readFileSync(manifestPath(), 'utf8')); } catch (_) { return { backups: [] }; }
}
function writeManifest(m) {
  ensureDir(BACKUP_DIR);
  fs.writeFileSync(manifestPath(), JSON.stringify(m, null, 2));
}

function safeName(name) {
  const base = path.basename(String(name || ''));
  if (!base || base !== String(name || '').trim()) throw new Error('Invalid filename');
  if (!/^[A-Za-z0-9._-]+\.(zip|db)$/i.test(base)) throw new Error('Invalid backup filename');
  return base;
}

function resolveBackupFile(name) {
  const base = safeName(name);
  const full = path.join(BACKUP_DIR, base);
  if (!fs.existsSync(full)) throw new Error('Backup not found');
  return full;
}

function listBackups() {
  ensureDir(BACKUP_DIR);
  const m = readManifest();
  const backups = [];
  const known = new Set();
  for (const b of (m.backups || [])) {
    if (!b || !b.filename) continue;
    const full = path.join(BACKUP_DIR, b.filename);
    // Failed attempts have no archive (it is deleted on failure) but must stay
    // visible in the history so failures are reported and retries are backed off.
    if (!fs.existsSync(full) && b.status !== 'failed') continue;
    backups.push(Object.assign({}, b, { size: (function () { try { return fs.statSync(full).size; } catch (_) { return b.size || 0; } })() }));
    known.add(b.filename);
  }
  // scan for archive files not tracked
  for (const f of fs.readdirSync(BACKUP_DIR)) {
    if (!/\.(zip|db)$/i.test(f)) continue;
    if (known.has(f)) continue;
    let st;
    try { st = fs.statSync(path.join(BACKUP_DIR, f)); } catch (_) { continue; }
    backups.push({ filename: f, createdAt: st.mtime.toISOString(), size: st.size, status: 'unknown', version: null });
  }
  backups.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return backups;
}

function getLatestBackup() {
  const list = listBackups();
  return list.length ? list[0] : null;
}

// ── Backup / update / restore operation lock ──────────────────────────────
// One in-process operation at a time: a scheduled or manual backup can never
// race an update install or a rollback (all acquire the same lock).
// Callers already holding the token pass it via options._operation.
let activeOperation = null;
function acquireOperation(kind) {
  if (activeOperation) {
    const e = new Error('Another operation is already in progress: ' + activeOperation.kind + ' (started ' + activeOperation.startedAt + ')');
    e.status = 409;
    e.code = 'operation_in_progress';
    throw e;
  }
  activeOperation = { kind: String(kind || 'operation'), startedAt: new Date().toISOString() };
  return activeOperation;
}
function releaseOperation(token) {
  if (token && activeOperation === token) activeOperation = null;
}
function currentOperation() { return activeOperation; }

async function createBackup(opts) {
  opts = opts || {};
  const operation = opts._operation || acquireOperation(opts.trigger === 'scheduled' ? 'scheduled-backup' : 'backup');
  const startedAtMs = Date.now();
  try {
    return await performCreateBackup(opts, startedAtMs);
  } finally {
    if (!opts._operation) releaseOperation(operation);
  }
}

async function performCreateBackup(opts, startedAtMs) {
  ensureDir(BACKUP_DIR);
  // Production backups include uploaded files (receipts + product/store images)
  // unless the caller explicitly opts out.
  const includeUploads = opts.includeUploads !== false;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = 'camzy-backup-' + ts + '.zip';
  const dest = path.join(BACKUP_DIR, filename);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'camzy-backup-'));
  try {
    // DB snapshot via VACUUM INTO
    const dbDir = path.join(tmp, 'database');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbSnap = path.join(dbDir, 'camzy.db');
    const db = new DatabaseSync(DB_PATH);
    try {
      try { db.exec('PRAGMA busy_timeout = 5000'); } catch (_) {}
      const safePath = dbSnap.replace(/'/g, "''");
      db.exec("VACUUM INTO '" + safePath + "'");
    } finally {
      db.close();
    }
    const vdb = new DatabaseSync(dbSnap);
    try {
      const row = vdb.prepare('PRAGMA integrity_check').get();
      const val = row ? Object.values(row)[0] : null;
      if (val !== 'ok') throw new Error('Backup DB integrity check failed: ' + JSON.stringify(row));
    } finally {
      vdb.close();
    }

    // The file list is computed once: the archive is built from it and the
    // verification below re-checks the same list (upload inclusion counts).
    const files = walkFiles(ROOT, ROOT, { includeUploads: includeUploads });

    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(dest);
      const archive = archiver('zip', { zlib: { level: 9 } });
      let finished = false;
      const done = (err) => { if (finished) return; finished = true; if (err) reject(err); else resolve(); };
      output.on('close', () => done());
      output.on('error', (e) => done(e));
      archive.on('error', (e) => done(e));
      archive.pipe(output);
      archive.file(dbSnap, { name: 'database/camzy.db' });
      for (const f of files) {
        archive.file(f.full, { name: 'app/' + f.rel });
      }
      archive.append(JSON.stringify({
        createdAt: new Date().toISOString(),
        version: APP_VERSION,
        dbPath: DB_PATH
      }, null, 2), { name: 'backup-meta.json' });
      archive.finalize();
    });

    // Verify the archive BEFORE the backup can be reported successful:
    // database snapshot integrity + queryability, meta entry, captured uploads.
    const zip = await unzipper.Open.file(dest);
    if (!zip.files || !zip.files.length) throw new Error('Backup archive is empty');
    const entryPaths = zip.files.map((f) => String(f.path || ''));
    const verified = { db: false, meta: false, archiveFiles: zip.files.length, uploadFiles: 0, expectedUploadFiles: null };

    const dbEntry = zip.files.find((f) => f.path === 'database/camzy.db');
    if (!dbEntry) throw new Error('Backup archive is missing the database snapshot');
    {
      const buf = await dbEntry.buffer();
      const verifyPath = path.join(tmp, 'verify.db');
      fs.writeFileSync(verifyPath, buf);
      const vdb2 = new DatabaseSync(verifyPath);
      try {
        const row = vdb2.prepare('PRAGMA integrity_check').get();
        const val = row ? Object.values(row)[0] : null;
        if (val !== 'ok') throw new Error('Backup archive DB integrity check failed');
        // The snapshot must actually be queryable, not merely present.
        vdb2.prepare('SELECT count(*) AS n FROM sqlite_master').get();
      } finally {
        vdb2.close();
      }
      verified.db = true;
    }

    verified.meta = entryPaths.indexOf('backup-meta.json') !== -1;
    if (!verified.meta) throw new Error('Backup archive is missing backup-meta.json');

    verified.uploadFiles = entryPaths.filter((p) => p.indexOf('app/uploads/') === 0 || p.indexOf('app/assets/images/uploads/') === 0).length;
    if (includeUploads) {
      const expected = files.filter((f) => f.rel.indexOf('uploads/') === 0 || f.rel.indexOf('assets/images/uploads/') === 0).length;
      verified.expectedUploadFiles = expected;
      if (verified.uploadFiles !== expected) {
        throw new Error('Backup archive upload mismatch: expected ' + expected + ' uploaded file(s), archived ' + verified.uploadFiles);
      }
    }

    const stat = fs.statSync(dest);
    const meta = {
      filename,
      createdAt: new Date().toISOString(),
      size: stat.size,
      status: 'success',
      version: APP_VERSION,
      managed: true,
      trigger: opts.trigger === 'scheduled' ? 'scheduled' : (opts.trigger === 'update' ? 'update' : 'manual'),
      scheduledFor: opts.scheduledFor ? String(opts.scheduledFor) : null,
      includeUploads: includeUploads,
      durationMs: Date.now() - startedAtMs,
      verified: verified
    };
    const m = readManifest();
    m.backups = Array.isArray(m.backups) ? m.backups : [];
    m.backups.unshift(meta);
    // Retention: prune ONLY archives this system created (managed filename
    // pattern + manifest entry). Manually copied backups and the external
    // scheduled task's camzy-*.db snapshots are never deleted here.
    const keepSetting = Number(opts.keep) > 0 ? Number(opts.keep) : getBackupSettings().retentionCount;
    const sorted = m.backups.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const toKeep = sorted.slice(0, keepSetting);
    const toRemove = sorted.slice(keepSetting);
    const pruned = [];
    const retained = [];
    for (const old of toRemove) {
      if (!old || !old.filename) continue;
      const full = path.join(BACKUP_DIR, old.filename);
      const exists = fs.existsSync(full);
      // Records whose archive is already gone are dead weight -> dropped.
      if (!exists) continue;
      // Archives this system did not create are never deleted AND never
      // forgotten: the operator's file and its record both survive.
      if (!MANAGED_BACKUP_RE.test(old.filename)) { retained.push(old); continue; }
      try { fs.unlinkSync(full); pruned.push(old.filename); }
      catch (_) { retained.push(old); }
    }
    meta.pruned = pruned;
    m.backups = toKeep.concat(retained);
    writeManifest(m);
    return meta;
  } catch (e) {
    try {
      const m = readManifest();
      m.backups = Array.isArray(m.backups) ? m.backups : [];
      m.backups.unshift({
        filename,
        createdAt: new Date().toISOString(),
        size: fs.existsSync(dest) ? fs.statSync(dest).size : 0,
        status: 'failed',
        error: String(e && e.message ? e.message : e),
        version: APP_VERSION,
        managed: true,
        trigger: opts.trigger === 'scheduled' ? 'scheduled' : (opts.trigger === 'update' ? 'update' : 'manual'),
        scheduledFor: opts.scheduledFor ? String(opts.scheduledFor) : null,
        durationMs: startedAtMs ? (Date.now() - startedAtMs) : null
      });
      writeManifest(m);
    } catch (_) {}
    try { if (fs.existsSync(dest)) fs.unlinkSync(dest); } catch (_) {}
    throw e;
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
}

function isWithinRoot(fullPath) {
  try {
    const rel = path.relative(ROOT, path.resolve(fullPath));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  } catch (_) { return false; }
}

function copyDir(src, dst, opts) {
  opts = opts || {};
  const root = dst;
  let copied = 0;
  let skipped = 0;
  const exclude = new Set(opts.exclude || []);
  const excludeFiles = new Set(opts.excludeFiles || ['.env', '.env.local', '.env.production', '.env.production.local']);
  const excludeExt = new Set(opts.excludeExt || ['.pem', '.key', '.p12', '.pfx', '.crt', '.cer']);
  function walk(s, d) {
    if (!fs.existsSync(s)) return;
    if (!isWithinRoot(d)) throw new Error('Refusing to copy outside project root');
    fs.mkdirSync(d, { recursive: true });
    for (const entry of fs.readdirSync(s, { withFileTypes: true })) {
      const cs = path.join(s, entry.name);
      const cd = path.join(d, entry.name);
      const rel = path.relative(root, cd).split(path.sep).join('/');
      // Database, uploads, secrets, backups and logs are always preserved.
      if (exclude.has(entry.name) || excludeFiles.has(entry.name) || isProtectedPath(rel)) { skipped += 1; continue; }
      const ext = path.extname(entry.name).toLowerCase();
      if (excludeExt.has(ext)) { skipped += 1; continue; }
      if (entry.name === 'id_rsa' || entry.name === 'id_dsa' || /^credentials/i.test(entry.name)) { skipped += 1; continue; }
      if (!isWithinRoot(cd)) throw new Error('Refusing to copy outside project root');
      if (entry.isDirectory()) {
        walk(cs, cd);
      } else {
        fs.mkdirSync(path.dirname(cd), { recursive: true });
        fs.copyFileSync(cs, cd);
        copied += 1;
      }
    }
  }
  walk(src, dst);
  return { copied, skipped };
}

const INTRODUCED_PATH = path.join(UPDATE_DIR, 'last-introduced.json');
function readIntroduced() {
  try { const j = JSON.parse(fs.readFileSync(INTRODUCED_PATH, 'utf8')); return Array.isArray(j) ? j : []; }
  catch (_) { return []; }
}
function writeIntroduced(list) {
  try { ensureDir(UPDATE_DIR); fs.writeFileSync(INTRODUCED_PATH, JSON.stringify(list || [], null, 2)); } catch (_) {}
}
function removeIntroducedFiles() {
  const list = readIntroduced();
  for (const rel of list) {
    if (!rel || typeof rel !== 'string') continue;
    const full = path.join(ROOT, rel);
    if (!isWithinRoot(full)) continue;
    try {
      if (fs.existsSync(full)) {
        const st = fs.statSync(full);
        if (st.isFile()) fs.unlinkSync(full);
      }
    } catch (_) {}
  }
  writeIntroduced([]);
}

function validateExtractedTree(root) {
  const base = path.resolve(root);
  const stack = [base];
  while (stack.length) {
    const cur = stack.pop();
    let st;
    try { st = fs.lstatSync(cur); } catch (_) { continue; }
    if (st.isSymbolicLink()) throw new Error('Symlink in update package is not allowed: ' + cur);
    if (st.isDirectory()) {
      for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
        stack.push(path.join(cur, e.name));
      }
    }
    const rel = path.relative(base, path.resolve(cur));
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Unsafe path in update package: ' + cur);
  }
}

function extractZip(zipPath, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(dest, { recursive: true });
    const stream = fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: dest }));
    stream.on('close', () => {
      try { validateExtractedTree(dest); resolve(); }
      catch (e) { reject(e); }
    });
    stream.on('error', reject);
  });
}

async function listUpdatePackages() {
  ensureDir(UPDATE_DIR);
  const files = fs.readdirSync(UPDATE_DIR).filter((f) => /\.zip$/i.test(f));
  const out = [];
  for (const f of files) {
    const full = path.join(UPDATE_DIR, f);
    let st;
    try { st = fs.statSync(full); } catch (_) { continue; }
    let version = null;
    let notes = '';
    try {
      const zip = await unzipper.Open.file(full);
      const mf = zip.files.find((entry) => /^(manifest\.json)$/i.test(String(entry.path || '').replace(/\\/g, '/')));
      if (mf) {
        const txt = (await mf.buffer()).toString('utf8');
        try {
          const j = JSON.parse(txt);
          if (j && typeof j === 'object') {
            version = j.version ? String(j.version) : null;
            notes = j.notes ? String(j.notes) : '';
          }
        } catch (_) {}
      } else {
        const vf = zip.files.find((entry) => /^(VERSION|version\.txt)$/i.test(String(entry.path || '').replace(/\\/g, '/')));
        if (vf) {
          const txt = (await vf.buffer()).toString('utf8').trim();
          if (txt) version = txt;
        }
      }
    } catch (_) {}
    const meta = readPackageMeta(f);
    if (!version && meta && meta.version) {
      version = String(meta.version);
      notes = notes || String(meta.notes || '');
    }
    out.push({
      filename: f,
      size: st.size,
      createdAt: st.mtime.toISOString(),
      version,
      notes,
      source: meta ? (meta.source || null) : null,
      digestVerified: meta && meta.digestVerified !== undefined ? !!meta.digestVerified : null,
      digest: meta ? (meta.digest || null) : null
    });
  }
  out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return out;
}

function validateRawZipEntries(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Invalid ZIP file');
  let cdSize = buffer.readUInt32LE(eocd + 12);
  let cdOffset = buffer.readUInt32LE(eocd + 16);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    const locOffset = eocd - 20;
    if (locOffset >= 0 && buffer.readUInt32LE(locOffset) === 0x07064b50) {
      try {
        const zip64EocdOffset = Number(buffer.readBigUInt64LE(locOffset + 8));
        if (zip64EocdOffset >= 0 && buffer.readUInt32LE(zip64EocdOffset) === 0x06064b50) {
          cdSize = Number(buffer.readBigUInt64LE(zip64EocdOffset + 40));
          cdOffset = Number(buffer.readBigUInt64LE(zip64EocdOffset + 48));
        }
      } catch (_) {}
    }
  }
  if (cdOffset < 0 || cdSize < 0 || cdOffset + cdSize > buffer.length) {
    throw new Error('Invalid ZIP central directory');
  }
  let offset = cdOffset;
  const end = cdOffset + cdSize;
  let count = 0;
  while (offset < end) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Invalid ZIP central directory');
    }
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const externalAttrs = buffer.readUInt32LE(offset + 38);
    if (offset + 46 + nameLen > buffer.length) throw new Error('Invalid ZIP filename');
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLen);
    const normalized = name.replace(/\\/g, '/');
    if (!normalized || normalized === '/') throw new Error('Invalid ZIP entry name');
    if (path.isAbsolute(normalized) || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.indexOf('\0') !== -1) {
      throw new Error('Unsafe archive path: ' + name);
    }
    const segs = normalized.split('/').filter(Boolean);
    if (segs.length === 0 || segs.some((s) => s === '..')) {
      throw new Error('Unsafe archive path: ' + name);
    }
    const mode = (externalAttrs >>> 16) & 0xffff;
    if ((mode & 0xf000) === 0xa000) {
      throw new Error('Symlinks are not allowed in update packages');
    }
    offset += 46 + nameLen + extraLen + commentLen;
    count += 1;
    if (count > 100000) throw new Error('Too many ZIP entries');
  }
}

async function validateUpdatePackageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Uploaded file is empty');
  }
  validateRawZipEntries(buffer);
  let zip;
  try {
    zip = await unzipper.Open.buffer(buffer);
  } catch (_) {
    throw new Error('Invalid or corrupted ZIP file');
  }
  if (!zip.files || zip.files.length === 0) {
    throw new Error('ZIP archive is empty');
  }

  let fileCount = 0;
  let totalUncompressed = 0;
  const protectedEntries = [];
  for (const entry of zip.files) {
    const p = String(entry.path || '').replace(/\\/g, '/');
    if (!p || p === '/') continue;
    if (path.isAbsolute(p) || p.startsWith('/')) {
      throw new Error('Unsafe archive path: ' + p);
    }
    const segs = p.split('/').filter(Boolean);
    if (segs.length === 0 || segs.some((s) => s === '..')) {
      throw new Error('Unsafe archive path: ' + p);
    }
    if (segs.some((s) => /^[A-Za-z]:$/.test(s))) {
      throw new Error('Unsafe archive path: ' + p);
    }
    if (p.indexOf('\0') !== -1) {
      throw new Error('Unsafe archive path: ' + p);
    }
    if (entry.type === 'Symlink') {
      throw new Error('Symlinks are not allowed in update packages');
    }
    if (!entry.isDirectory) {
      fileCount += 1;
      totalUncompressed += Number(entry.uncompressedSize || 0);
      if (isProtectedPath(p)) protectedEntries.push(p);
    }
  }
  if (fileCount === 0) throw new Error('ZIP archive contains no files');
  if (totalUncompressed > MAX_PACKAGE_BYTES) {
    throw new Error('Archive uncompressed size is too large');
  }

  let manifest = null;
  const mf = zip.files.find((entry) => /^(manifest\.json)$/i.test(String(entry.path || '').replace(/\\/g, '/')));
  if (mf) {
    let parsed;
    try {
      parsed = JSON.parse((await mf.buffer()).toString('utf8'));
    } catch (_) {
      throw new Error('Invalid manifest.json');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid manifest.json');
    }
    manifest = {
      version: parsed.version ? String(parsed.version) : null,
      notes: parsed.notes ? String(parsed.notes) : ''
    };
  } else {
    const vf = zip.files.find((entry) => /^(VERSION|version\.txt)$/i.test(String(entry.path || '').replace(/\\/g, '/')));
    if (vf) {
      const txt = (await vf.buffer()).toString('utf8').trim();
      if (txt) manifest = { version: txt, notes: '' };
    }
  }

  return {
    fileCount,
    totalUncompressed,
    manifest,
    installableFiles: fileCount - protectedEntries.length,
    protectedEntries,
    protectedCount: protectedEntries.length
  };
}

async function saveUploadedUpdate(buffer, originalName) {
  const base = path.basename(String(originalName || '').trim());
  if (!base || !/\.zip$/i.test(base)) {
    throw new Error('Only .zip files are allowed');
  }
  const validation = await validateUpdatePackageBuffer(buffer);
  const safeBase = base.replace(/[^A-Za-z0-9._-]/g, '_');
  let filename = safeBase;
  if (!/\.zip$/i.test(filename)) filename += '.zip';
  ensureDir(UPDATE_DIR);
  if (fs.existsSync(path.join(UPDATE_DIR, filename))) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    filename = filename.replace(/\.zip$/i, '') + '-' + stamp + '.zip';
  }
  fs.writeFileSync(path.join(UPDATE_DIR, filename), buffer);
  const version = validation.manifest ? validation.manifest.version : null;
  const notes = validation.manifest ? validation.manifest.notes : '';
  writePackageMeta(filename, {
    source: 'upload',
    filename: filename,
    version: version,
    notes: String(notes || '').slice(0, 4000),
    size: buffer.length,
    protectedEntries: validation.protectedEntries || [],
    uploadedAt: new Date().toISOString()
  });
  return {
    ok: true,
    filename,
    savedPath: 'data/updates/' + filename,
    version,
    notes,
    fileCount: validation.fileCount,
    totalUncompressed: validation.totalUncompressed,
    validation
  };
}

function resolveUpdateFile(name) {
  const base = path.basename(String(name || '').trim());
  if (!base || base !== String(name || '').trim()) throw new Error('Invalid filename');
  if (!/\.zip$/i.test(base)) throw new Error('Invalid update package filename');
  const full = path.join(UPDATE_DIR, base);
  if (!fs.existsSync(full)) throw new Error('Update package not found');
  return full;
}

function deleteUpdatePackage(name) {
  const base = path.basename(String(name || '').trim());
  if (!base || base !== String(name || '').trim()) throw new Error('Invalid filename');
  if (!/\.zip$/i.test(base)) throw new Error('Invalid update package filename');
  const full = path.join(UPDATE_DIR, base);
  if (!fs.existsSync(full)) throw new Error('Update package not found');
  fs.unlinkSync(full);
  removePackageMeta(base);
}

async function checkUpdate(selectedPackage) {
  ensureDir(UPDATE_DIR);
  let packages = [];
  try { packages = fs.readdirSync(UPDATE_DIR).filter((f) => /\.zip$/i.test(f)); } catch (_) { packages = []; }
  // sort by mtime desc
  packages.sort((a, b) => {
    try { return fs.statSync(path.join(UPDATE_DIR, b)).mtimeMs - fs.statSync(path.join(UPDATE_DIR, a)).mtimeMs; }
    catch (_) { return 0; }
  });

  let available = false;
  let pkg = null;
  let latestVersion = APP_VERSION;
  let notes = '';
  let remote = null;

  if (selectedPackage) {
    const selectedBase = path.basename(String(selectedPackage).trim());
    if (!packages.includes(selectedBase)) throw new Error('Selected update package not found');
    pkg = selectedBase;
  } else if (packages.length) {
    pkg = packages[0];
  }
  available = !!pkg;

  if (pkg) {
    try {
      const z = await unzipper.Open.file(path.join(UPDATE_DIR, pkg));
      const mf = z.files.find((f) => /^(manifest\.json)$/i.test(String(f.path || '').replace(/\\/g, '/')));
      if (mf) {
        const txt = (await mf.buffer()).toString('utf8');
        try {
          const j = JSON.parse(txt);
          if (j && j.version) latestVersion = String(j.version);
          if (j && j.notes) notes = String(j.notes);
        } catch (_) {
          throw new Error('Invalid manifest.json');
        }
      } else {
        const vf = z.files.find((f) => /^(VERSION|version\.txt)$/i.test(String(f.path || '').replace(/\\/g, '/')));
        if (vf) {
          const v = (await vf.buffer()).toString('utf8').trim();
          if (v) latestVersion = v;
        }
      }
    } catch (e) {
      throw e;
    }
  }

  // optional remote manifest
  const remoteUrl = process.env.UPDATE_MANIFEST_URL;
  if (remoteUrl) {
    try {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(remoteUrl, { signal: controller.signal });
      clearTimeout(to);
      if (r.ok) {
        const j = await r.json();
        remote = j;
        if (j && j.version && String(j.version) !== APP_VERSION) {
          // remote available only if newer; we keep local packages authoritative if present
          if (!pkg) {
            available = true;
            latestVersion = String(j.version);
            notes = j.notes ? String(j.notes) : notes;
          }
        }
      }
    } catch (_) {}
  }

  return {
    currentVersion: APP_VERSION,
    available,
    package: pkg,
    latestVersion,
    notes,
    updateDir: UPDATE_DIR,
    packages: await listUpdatePackages(),
    remote
  };
}

// ── Package metadata sidecar: data/updates/<file>.meta.json ──
// Pins the exact release version, digest and source to a staged file so the
// install step can demand an exact version + filename confirmation.
function metaPathFor(filename) {
  return path.join(UPDATE_DIR, path.basename(String(filename || '')) + '.meta.json');
}
function readPackageMeta(filename) {
  try {
    const j = JSON.parse(fs.readFileSync(metaPathFor(filename), 'utf8'));
    return j && typeof j === 'object' && !Array.isArray(j) ? j : null;
  } catch (_) { return null; }
}
function writePackageMeta(filename, meta) {
  try {
    ensureDir(UPDATE_DIR);
    fs.writeFileSync(metaPathFor(filename), JSON.stringify(meta, null, 2));
    return true;
  } catch (_) { return false; }
}
function removePackageMeta(filename) {
  try { fs.unlinkSync(metaPathFor(filename)); } catch (_) {}
}

// Exact version/notes of a staged package: sidecar metadata (GitHub download
// or upload) first, then an in-archive manifest.json / VERSION file.
async function readPackageInfo(pkgPath) {
  const name = path.basename(pkgPath);
  const meta = readPackageMeta(name);
  let manifest = null;
  try {
    const z = await unzipper.Open.file(pkgPath);
    const norm = (p) => String(p || '').split('\\').join('/');
    const mf = z.files.find((f) => /^(manifest\.json)$/i.test(norm(f.path)));
    if (mf) {
      const j = JSON.parse((await mf.buffer()).toString('utf8'));
      if (j && typeof j === 'object' && !Array.isArray(j)) {
        manifest = { version: j.version ? String(j.version) : null, notes: j.notes ? String(j.notes) : '' };
      }
    } else {
      const vf = z.files.find((f) => /^(VERSION|version\.txt)$/i.test(norm(f.path)));
      if (vf) {
        const t = (await vf.buffer()).toString('utf8').trim();
        if (t) manifest = { version: t, notes: '' };
      }
    }
  } catch (_) { /* unreadable manifest → version may still come from metadata */ }
  const version = (meta && meta.version) || (manifest && manifest.version) || null;
  const notes = (meta && meta.notes) || (manifest && manifest.notes) || '';
  return {
    version: version ? String(version) : null,
    notes: String(notes || ''),
    source: (meta && meta.version) ? String(meta.source || 'metadata') : ((manifest && manifest.version) ? 'manifest' : null),
    meta: meta,
    manifest: manifest
  };
}

// The install runs under the shared operation lock: no scheduled/manual backup
// and no second install can overlap it. The pre-install backup and the
// rollback receive the same token so they do not try to re-acquire it.
async function applyUpdate(options) {
  const operation = acquireOperation('update');
  try {
    return await performApplyUpdate(Object.assign({}, options || {}, { _operation: operation }));
  } finally {
    releaseOperation(operation);
  }
}

async function performApplyUpdate(options) {
  options = options || {};
  const confirm = options.confirm;
  const okConfirm = (confirm === true || confirm === 'true' || confirm === 'yes' || confirm === '1');
  if (!okConfirm) throw updaterError('Explicit admin confirmation required (confirm: true)', 400, 'confirmation_required');

  // The exact package filename AND the exact release version must both be
  // supplied by the administrator and must match the staged package — a bare
  // "yes" is never enough to touch the installation.
  const confirmVersion = String(options.version || '').trim();
  if (!confirmVersion) throw updaterError('Exact release version is required for confirmation', 400, 'confirmation_required');
  const confirmFile = String(options.filename || options.package || '').trim();
  if (!confirmFile) throw updaterError('Package filename is required for confirmation', 400, 'confirmation_required');

  ensureDir(UPDATE_DIR);
  const pkgName = path.basename(confirmFile);
  if (pkgName !== confirmFile || !/\.zip$/i.test(pkgName)) {
    throw updaterError('Invalid update package filename', 400, 'invalid_filename');
  }
  const pkgPath = path.join(UPDATE_DIR, pkgName);
  if (!fs.existsSync(pkgPath)) throw updaterError('Update package not found: ' + pkgName, 404, 'package_not_found');

  // 1) Validate ZIP structure and protected paths before touching anything.
  let validation;
  try {
    validation = await validateUpdatePackageBuffer(fs.readFileSync(pkgPath));
  } catch (e) {
    throw updaterError('Invalid update package: ' + (e && e.message ? e.message : e), 422, 'invalid_package');
  }

  // 2) Exact-version confirmation against the metadata recorded at
  //    download/upload time (GitHub release tag) or the in-archive manifest.
  const info = await readPackageInfo(pkgPath);
  if (!info.version) {
    throw updaterError('This package carries no version metadata, so the exact version cannot be confirmed', 400, 'version_unknown');
  }
  if (info.version !== confirmVersion) {
    throw updaterError('Version confirmation mismatch: expected "' + info.version + '" but got "' + confirmVersion + '"', 409, 'version_mismatch');
  }

  // 3) Create AND verify a backup first; abort if that fails.
  let backup;
  try {
    // retention comes from the configured setting; the operation token keeps
    // this pre-install backup inside the install's own lock
    backup = await createBackup({ _operation: options._operation });
  } catch (e) {
    throw updaterError('Backup failed, update aborted: ' + (e && e.message ? e.message : e), 500, 'backup_failed');
  }
  if (!backup || backup.status !== 'success') {
    throw updaterError('Backup verification failed, update aborted', 500, 'backup_failed');
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'camzy-update-'));
  try {
    const extractDir = path.join(tmp, 'extract');
    await extractZip(pkgPath, extractDir);

    // determine source root
    const appDir = path.join(extractDir, 'app');
    const sourceRoot = fs.existsSync(appDir) ? appDir : extractDir;

    // Collect files that do not already exist (so a failed update can remove
    // them) plus the protected paths that will be preserved untouched.
    const introduced = [];
    const preserved = [];
    (function walk(src, base) {
      if (!fs.existsSync(src)) return;
      for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, e.name);
        const rel = path.relative(base, s).replace(/\\/g, '/');
        if (isProtectedPath(rel)) {
          preserved.push(e.isDirectory() ? rel + '/' : rel);
          continue;
        }
        if (e.isDirectory()) walk(s, base);
        else {
          const dst = path.join(ROOT, rel);
          if (!fs.existsSync(dst)) introduced.push(rel);
        }
      }
    })(sourceRoot, sourceRoot);

    // apply (copyDir applies the same protection rules)
    const copied = copyDir(sourceRoot, ROOT, { exclude: ['data', 'node_modules', '.git', 'backups', 'logs', 'uploads'] });
    writeIntroduced(introduced);

    const appliedAt = new Date().toISOString();
    const result = {
      ok: true,
      version: info.version,
      package: pkgName,
      filesApplied: copied ? copied.copied : null,
      filesAdded: introduced.length,
      preserved: preserved.sort(),
      backup: { filename: backup.filename, size: backup.size, status: backup.status, verified: true },
      restartRequired: true,
      appliedAt: appliedAt,
      message: 'Update applied. A server restart may be required for the new code to take effect — the server was NOT restarted automatically.'
    };

    // record
    ensureDir(UPDATE_DIR);
    fs.writeFileSync(path.join(UPDATE_DIR, 'applied.json'), JSON.stringify({
      version: result.version,
      package: pkgName,
      appliedAt: appliedAt,
      backup: backup.filename,
      filesApplied: result.filesApplied,
      preserved: result.preserved
    }, null, 2));

    return result;
  } catch (e) {
    // remove files introduced by this failed update
    try { removeIntroducedFiles(); } catch (_) {}
    // rollback application files (an install never touches the database)
    try { await rollbackBackup(backup.filename, { restoreDb: false, _operation: options._operation }); } catch (_) {}
    throw updaterError('Update failed and was rolled back: ' + (e && e.message ? e.message : e), 500, 'install_failed');
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
}

// Rollbacks are serialized with backups/installs through the same lock.
async function rollbackBackup(filename, opts) {
  opts = opts || {};
  const operation = opts._operation || acquireOperation('rollback');
  try {
    return await performRollback(filename, opts);
  } finally {
    if (!opts._operation) releaseOperation(operation);
  }
}

async function performRollback(filename, opts) {
  opts = opts || {};
  // A failed install never touches the database (data/ is protected), so the
  // default install rollback restores application files only. Pass
  // { restoreDb: true } to also roll the database back (manual rollback).
  const restoreDb = opts.restoreDb !== false;
  const base = path.basename(String(filename || ''));
  const zipPath = resolveBackupFile(base);
  // remove files introduced by the last update first
  try { removeIntroducedFiles(); } catch (_) {}

  if (!/\.zip$/i.test(base)) {
    // DB-only backup: restore database only
    if (!restoreDb) return { ok: true, message: 'Rollback completed (database untouched)' };
    try {
      if (fs.existsSync(DB_PATH)) {
        const pre = DB_PATH + '.pre-rollback-' + Date.now() + '.bak';
        fs.copyFileSync(DB_PATH, pre);
      }
    } catch (_) {}
    fs.copyFileSync(zipPath, DB_PATH);
    for (const suf of ['-wal', '-shm']) { try { fs.unlinkSync(DB_PATH + suf); } catch (_) {} }
    return { ok: true, message: 'Rollback completed (database restored)' };
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'camzy-rollback-'));
  try {
    const extractDir = path.join(tmp, 'extract');
    await extractZip(zipPath, extractDir);

    // restore DB
    const dbSnap = path.join(extractDir, 'database', 'camzy.db');
    if (restoreDb && fs.existsSync(dbSnap)) {
      try {
        if (fs.existsSync(DB_PATH)) {
          const pre = DB_PATH + '.pre-rollback-' + Date.now() + '.bak';
          fs.copyFileSync(DB_PATH, pre);
        }
      } catch (_) {}
      fs.copyFileSync(dbSnap, DB_PATH);
      for (const suf of ['-wal', '-shm']) { try { fs.unlinkSync(DB_PATH + suf); } catch (_) {} }
    }

    // restore app files
    const appDir = path.join(extractDir, 'app');
    if (fs.existsSync(appDir)) {
      copyDir(appDir, ROOT, { exclude: ['data', 'node_modules', '.git', 'backups', 'logs', 'uploads'] });
    }

    return { ok: true, message: 'Rollback completed' };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── Upload & restore a backup archive (Admin → «آپلود و بازیابی پشتیبان») ──
// Deliberately separate from the GitHub update-package workflow: only archives
// produced by createBackup() are accepted. Every archive is validated (ZIP
// structure, backup metadata, database integrity and allowed paths) BEFORE it
// is staged, and validated AGAIN before a restore may touch production. A
// restore then runs under the shared operation lock and only after a freshly
// created + verified safety backup of the current data.
const RESTORE_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;          // compressed upload
const RESTORE_MAX_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;   // zip-bomb guard
const RESTORE_MAX_ENTRIES = 100000;
const BACKUP_DB_ENTRY = 'database/camzy.db';
const BACKUP_META_ENTRY = 'backup-meta.json';
// Segments that a generated backup never contains and that must never be
// restored (live database, secrets-adjacent dumps, logs, staged updates …).
const BACKUP_FORBIDDEN_SEGMENTS = new Set([
  'data', 'backups', 'logs', 'updates', 'node_modules', '.git', '.svn', '.hg', '.freebuff', '.kilo', '.kombai'
]);
const BACKUP_FORBIDDEN_FILE_RE = /^(\.env(\..*)?|id_(rsa|dsa|ecdsa|ed25519)|credentials.*)$/i;
const BACKUP_FORBIDDEN_EXT_RE = /\.(db|db-wal|db-shm|sqlite|sqlite3|bak|pem|key|p12|pfx|crt|cer)$/i;
// Root markers that identify a GitHub/update package rather than a backup.
const UPDATE_MARKER_RE = /^(manifest\.json|version|version\.txt)$/i;

function restoreError(message, status, code) {
  return updaterError(message, status, code);
}

// Normalizes an archive entry path, rejecting traversal, absolute paths,
// drive letters and NUL bytes. Returns null when the path is unsafe.
function normalizeArchivePath(raw) {
  const p = String(raw || '').split('\\').join('/');
  if (!p || p.indexOf('\0') !== -1) return null;
  if (path.isAbsolute(p) || p.startsWith('/') || /^[A-Za-z]:/.test(p)) return null;
  const segs = p.split('/').filter(Boolean);
  if (!segs.length) return null;
  if (segs.some((s) => s === '..')) return null;
  return segs.join('/');
}

// A backup archive may only hold: backup-meta.json, database/camzy.db and
// app/<project-relative files>. Anything sensitive that slips past the
// generator (secrets, keys, stray databases, dot-directories) is rejected.
function isSensitiveBackupEntry(rel) {
  const segs = String(rel || '').split('/').filter(Boolean);
  if (!segs.length) return true;
  for (const s of segs) {
    if (BACKUP_FORBIDDEN_FILE_RE.test(s)) return true;
    if (BACKUP_FORBIDDEN_SEGMENTS.has(s)) return true;
    if (s.startsWith('.') && s !== '.well-known') return true;
  }
  if (rel === BACKUP_DB_ENTRY) return false;
  return BACKUP_FORBIDDEN_EXT_RE.test(segs[segs.length - 1]);
}

async function validateBackupArchiveBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw restoreError('Uploaded file is empty', 400, 'empty_file');
  }
  if (buffer.length > RESTORE_MAX_UPLOAD_BYTES) {
    throw restoreError('Backup archive exceeds the ' + Math.round(RESTORE_MAX_UPLOAD_BYTES / (1024 * 1024)) + ' MB upload limit', 413, 'upload_too_large');
  }

  // 1) Raw ZIP structure: malformed archives, traversal, absolute paths,
  //    NUL bytes and symlink entries are rejected before anything is parsed.
  try {
    validateRawZipEntries(buffer);
  } catch (e) {
    const m = String((e && e.message) || e)
      .replace('Symlinks are not allowed in update packages', 'Symlinks are not allowed in backup archives');
    throw restoreError(m, 422, 'invalid_archive');
  }

  let zip;
  try { zip = await unzipper.Open.buffer(buffer); }
  catch (_) { throw restoreError('Invalid or corrupted ZIP file', 422, 'invalid_archive'); }
  const entries = (zip && zip.files) || [];
  if (!entries.length) throw restoreError('ZIP archive is empty', 422, 'invalid_archive');
  if (entries.length > RESTORE_MAX_ENTRIES) throw restoreError('Archive contains too many entries', 422, 'invalid_archive');

  const seen = [];
  for (const entry of entries) {
    const norm = normalizeArchivePath(entry.path);
    if (!norm) throw restoreError('Unsafe archive path: ' + String(entry.path || ''), 422, 'invalid_archive');
    if (entry.type === 'Symlink') throw restoreError('Symlinks are not allowed in backup archives', 422, 'invalid_archive');
    seen.push({ norm: norm, dir: !!entry.isDirectory, entry: entry });
  }

  // 2) Shape: a Camzy backup always carries the database snapshot AND the
  //    metadata file. Anything else is either an update package or junk.
  const hasDb = seen.some((e) => e.norm === BACKUP_DB_ENTRY && !e.dir);
  const hasMeta = seen.some((e) => e.norm === BACKUP_META_ENTRY && !e.dir);
  if (!hasDb || !hasMeta) {
    const rootMarker = seen.some((e) => e.norm.indexOf('/') === -1 && !e.dir && UPDATE_MARKER_RE.test(e.norm));
    const appMarker = seen.some((e) => !e.dir && (e.norm === 'index.html' || e.norm === 'app/index.html' || e.norm === 'app/package.json' || e.norm === 'app/server/app.js'));
    if (rootMarker || appMarker) {
      throw restoreError('This is an update package, not a backup archive. Update packages are installed from «نصب آپدیت», never restored here.', 422, 'update_package');
    }
    throw restoreError('Not a Camzy backup archive: missing ' + (hasDb ? BACKUP_META_ENTRY : BACKUP_DB_ENTRY), 422, 'invalid_backup_structure');
  }

  // 3) Allowed paths + sensitive files + size guards.
  let fileCount = 0;
  let uploadFiles = 0;
  let totalUncompressed = 0;
  for (const e of seen) {
    const segs = e.norm.split('/');
    const top = segs[0];
    if (isSensitiveBackupEntry(e.norm)) {
      throw restoreError('Backup archive contains a forbidden file: ' + e.norm, 422, 'sensitive_file');
    }
    if (e.dir) {
      if (top !== 'app' && top !== 'database') {
        throw restoreError('Unexpected path in backup archive: ' + e.norm, 422, 'invalid_backup_structure');
      }
      continue;
    }
    fileCount += 1;
    totalUncompressed += Number(e.entry.uncompressedSize || 0);
    if (top === 'app') {
      if (segs.length < 2) throw restoreError('Unexpected path in backup archive: ' + e.norm, 422, 'invalid_backup_structure');
      if (segs.indexOf('uploads') !== -1) uploadFiles += 1;
    } else if (top === 'database') {
      if (e.norm !== BACKUP_DB_ENTRY) throw restoreError('Unexpected path in backup archive: ' + e.norm, 422, 'invalid_backup_structure');
    } else if (e.norm !== BACKUP_META_ENTRY) {
      throw restoreError('Unexpected path in backup archive: ' + e.norm, 422, 'invalid_backup_structure');
    }
  }
  if (fileCount === 0) throw restoreError('ZIP archive contains no files', 422, 'invalid_archive');
  if (totalUncompressed > RESTORE_MAX_UNCOMPRESSED_BYTES) {
    throw restoreError('Archive uncompressed size is too large', 422, 'archive_too_large');
  }

  // 4) Backup metadata (source of the backup timestamp shown to the admin).
  const metaEntry = entries.find((e) => normalizeArchivePath(e.path) === BACKUP_META_ENTRY && !e.isDirectory);
  let meta;
  try { meta = JSON.parse((await metaEntry.buffer()).toString('utf8')); }
  catch (_) { throw restoreError(BACKUP_META_ENTRY + ' is not valid JSON', 422, 'invalid_backup_meta'); }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    throw restoreError(BACKUP_META_ENTRY + ' must contain a JSON object', 422, 'invalid_backup_meta');
  }
  let backupTimestamp = null;
  if (meta.createdAt != null && meta.createdAt !== '') {
    const parsed = Date.parse(String(meta.createdAt));
    if (!Number.isFinite(parsed)) {
      throw restoreError(BACKUP_META_ENTRY + ' has an invalid createdAt timestamp', 422, 'invalid_backup_meta');
    }
    backupTimestamp = new Date(parsed).toISOString();
  }

  // 5) Database integrity: the snapshot must be a readable, healthy SQLite
  //    database that answers queries — checked in a private temp file, never
  //    anywhere near the live database.
  const dbEntry = seen.find((e) => e.norm === BACKUP_DB_ENTRY && !e.dir);
  const verifyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'camzy-restore-verify-'));
  try {
    const verifyPath = path.join(verifyDir, 'snapshot.db');
    fs.writeFileSync(verifyPath, await dbEntry.entry.buffer(), { mode: 0o600 });
    let vdb = null;
    try { vdb = new DatabaseSync(verifyPath); }
    catch (e) {
      throw restoreError('Backup database snapshot is not a readable SQLite database: ' + String((e && e.message) || e), 422, 'db_integrity_failed');
    }
    try {
      const row = vdb.prepare('PRAGMA integrity_check').get();
      const val = row ? Object.values(row)[0] : null;
      if (val !== 'ok') throw restoreError('Backup database failed the integrity check: ' + JSON.stringify(row), 422, 'db_integrity_failed');
      vdb.prepare('SELECT count(*) AS n FROM sqlite_master').get();
    } catch (e) {
      if (e && e.code === 'db_integrity_failed') throw e;
      throw restoreError('Backup database is not queryable: ' + String((e && e.message) || e), 422, 'db_integrity_failed');
    } finally {
      try { if (vdb) vdb.close(); } catch (_) {}
    }
  } finally {
    try { fs.rmSync(verifyDir, { recursive: true, force: true }); } catch (_) {}
  }

  return {
    ok: true,
    archiveFiles: entries.length,
    fileCount: fileCount,
    uploadFiles: uploadFiles,
    totalUncompressed: totalUncompressed,
    backupTimestamp: backupTimestamp,
    version: meta.version != null ? String(meta.version) : null,
    meta: { createdAt: meta.createdAt != null ? String(meta.createdAt) : null, version: meta.version != null ? String(meta.version) : null },
    dbIntegrity: 'ok',
    sha256: crypto.createHash('sha256').update(buffer).digest('hex')
  };
}

// Validates and stages an uploaded backup archive. The bytes are only written
// to a private temp directory while validating; the archive is moved into
// data/backups/ only after every check passed, so a rejected upload never
// leaves a file behind (multer itself buffers uploads in memory).
async function stageUploadedBackup(buffer, originalName) {
  const raw = String(originalName || '').trim();
  const base = path.basename(raw);
  if (!base || base !== raw || !/\.zip$/i.test(base)) {
    throw restoreError('Only .zip backup archives are allowed', 400, 'invalid_filename');
  }
  const validation = await validateBackupArchiveBuffer(buffer);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'camzy-restore-upload-'));
  try {
    const tmpZip = path.join(tmp, 'staged.zip');
    fs.writeFileSync(tmpZip, buffer, { mode: 0o600 });
    ensureDir(BACKUP_DIR);
    let filename = base.replace(/[^A-Za-z0-9._-]/g, '_');
    if (!/\.zip$/i.test(filename)) filename += '.zip';
    if (!/^[A-Za-z0-9._-]+\.zip$/.test(filename)) {
      throw restoreError('Invalid backup filename', 400, 'invalid_filename');
    }
    if (fs.existsSync(path.join(BACKUP_DIR, filename))) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      filename = filename.replace(/\.zip$/i, '') + '-' + stamp + '.zip';
    }
    const dest = path.join(BACKUP_DIR, filename);
    fs.copyFileSync(tmpZip, dest);
    const stat = fs.statSync(dest);
    return {
      ok: true,
      filename: filename,
      savedPath: 'data/backups/' + filename,
      size: stat.size,
      backupTimestamp: validation.backupTimestamp,
      validation: validation
    };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
}

// Collects the uploaded files (any path with an `uploads` segment) that the
// archive will restore into the project root.
function collectRestoreUploadFiles(appDir) {
  const out = [];
  // rel is relative to the PROJECT ROOT (the archive's `app/` container is
  // not part of the path that is written back).
  const stack = [{ dir: appDir, rel: '' }];
  while (stack.length) {
    const cur = stack.pop();
    if (!fs.existsSync(cur.dir)) continue;
    let entries = [];
    try { entries = fs.readdirSync(cur.dir, { withFileTypes: true }); } catch (_) { continue; }
    for (const entry of entries) {
      const full = path.join(cur.dir, entry.name);
      const rel = cur.rel ? cur.rel + '/' + entry.name : entry.name;
      if (entry.isSymbolicLink()) throw restoreError('Symlink in backup archive is not allowed: ' + rel, 422, 'invalid_archive');
      if (entry.isDirectory()) { stack.push({ dir: full, rel: rel }); continue; }
      if (!entry.isFile()) continue;
      if (rel.split('/').indexOf('uploads') === -1) continue;
      out.push({ src: full, rel: rel });
    }
  }
  return out;
}

// Drains and truncates the live write-ahead log. The running server keeps its
// database connection open, so on Windows the live file cannot be renamed over
// and the -wal/-shm files cannot be deleted while they are in use (EPERM /
// EBUSY). A checkpoint is the safe way to guarantee that no stale WAL frame is
// replayed over the restored content afterwards.
function checkpointLiveWal() {
  if (!fs.existsSync(DB_PATH)) return;
  let db = null;
  try {
    db = new DatabaseSync(DB_PATH);
    try { db.exec('PRAGMA busy_timeout = 5000'); } catch (_) {}
    const row = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    // busy > 0 → another connection was mid-write and the WAL could not be
    // drained (abort rather than risk a mixed database). -1 → not WAL mode.
    const busy = row && row.busy != null ? Number(row.busy) : 0;
    if (Number.isFinite(busy) && busy > 0) throw new Error('the live write-ahead log is still busy');
  } finally {
    try { if (db) db.close(); } catch (_) {}
  }
}

// Swaps the live database for the verified snapshot:
// 1. verify the snapshot and a copy of it placed next to the live file;
// 2. keep a .pre-restore-*.bak copy of the database being replaced;
// 3. drain the WAL, then overwrite the live file in place — copyFileSync works
//    while the server holds the file open (renameSync fails with EPERM on
//    Windows), exactly like the existing rollback path already does;
// 4. re-verify the live file and put the previous database back if it is not
//    healthy. A .pre-restore-*.bak copy survives every attempt.
function swapLiveDatabase(srcDb) {
  const { verifyBackup } = require('./restore');
  const check = (p, status, code) => {
    try { verifyBackup(p); }
    catch (e) { throw restoreError('Database verification failed: ' + String((e && e.message) || e), status, code); }
  };
  check(srcDb, 422, 'db_integrity_failed');
  ensureDir(path.dirname(DB_PATH));

  // Pre-verify a copy at a fresh path, where no open handle can interfere.
  const tmpDest = DB_PATH + '.restore.tmp';
  fs.copyFileSync(srcDb, tmpDest);
  try { check(tmpDest, 422, 'db_integrity_failed'); }
  catch (e) { try { fs.unlinkSync(tmpDest); } catch (_) {} throw e; }

  let previousCopy = null;
  if (fs.existsSync(DB_PATH)) {
    previousCopy = DB_PATH + '.pre-restore-' + Date.now() + '.bak';
    try { fs.copyFileSync(DB_PATH, previousCopy); } catch (_) { previousCopy = null; }
  }

  try {
    checkpointLiveWal();
    fs.copyFileSync(tmpDest, DB_PATH);
  } catch (e) {
    throw restoreError('Could not replace the live database: ' + String((e && e.message) || e), 500, 'restore_failed');
  } finally {
    try { fs.unlinkSync(tmpDest); } catch (_) {}
  }

  try {
    check(DB_PATH, 500, 'restore_failed');
  } catch (e) {
    if (previousCopy) { try { fs.copyFileSync(previousCopy, DB_PATH); } catch (_) {} }
    throw restoreError('The restored database did not verify, so the previous database was put back: ' + String((e && e.message) || e), 500, 'restore_failed');
  }

  for (const suf of ['-wal', '-shm']) { try { fs.unlinkSync(DB_PATH + suf); } catch (_) {} }
}

async function performRestore(zipPath, validation, safety) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'camzy-restore-'));
  try {
    const extractDir = path.join(tmp, 'extract');
    await extractZip(zipPath, extractDir);   // re-checks symlinks + unsafe paths on disk

    const dbSrc = path.join(extractDir, 'database', 'camzy.db');
    if (!fs.existsSync(dbSrc)) {
      throw restoreError('Backup archive is missing ' + BACKUP_DB_ENTRY, 422, 'invalid_backup_structure');
    }
    // Deep validation of the extracted snapshot (integrity + key table counts)
    // before a single production byte is touched.
    const { validateRestore } = require('./restore-validate');
    let counts = {};
    try { counts = validateRestore(dbSrc).counts || {}; }
    catch (e) { throw restoreError('Backup database failed restore validation: ' + String((e && e.message) || e), 422, 'db_integrity_failed'); }

    // Uploaded files first (the database swap below is the point of no return).
    const uploads = collectRestoreUploadFiles(path.join(extractDir, 'app'));
    let uploadsRestored = 0;
    for (const f of uploads) {
      const dst = path.join(ROOT, f.rel);
      if (!isWithinRoot(dst)) throw restoreError('Refusing to restore outside the project root: ' + f.rel, 422, 'invalid_backup_structure');
      ensureDir(path.dirname(dst));
      fs.copyFileSync(f.src, dst);
      uploadsRestored += 1;
    }

    swapLiveDatabase(dbSrc);

    return {
      ok: true,
      file: path.basename(zipPath),
      backupTimestamp: validation.backupTimestamp || null,
      backupVersion: validation.version || null,
      safetyBackup: {
        filename: safety.filename,
        size: safety.size,
        status: safety.status,
        createdAt: safety.createdAt,
        verified: true
      },
      database: 'restored',
      tables: counts,
      uploadsRestored: uploadsRestored,
      restoredAt: new Date().toISOString(),
      restartRequired: true,
      message: 'Backup restored (database + uploaded files). The running server keeps its already-open database handle until a manual restart — the server was NOT restarted automatically.'
    };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
}

// Restores a staged backup archive. Requires an explicit confirmation, holds
// the shared operation lock for the whole run and creates + verifies a safety
// backup of the current production data first — if that fails, nothing is
// touched and the error is surfaced as safety_backup_failed.
async function restoreBackupArchive(options) {
  options = options || {};
  const okConfirm = options.confirm === true || options.confirm === 'true' || options.confirm === 'yes' || options.confirm === '1';
  if (!okConfirm) {
    throw restoreError('Explicit admin confirmation required to restore (confirm: true)', 400, 'confirmation_required');
  }
  const requested = String(options.file || options.filename || '').trim();
  if (!requested) throw restoreError('Backup filename is required', 400, 'invalid_filename');

  let staged;
  try { staged = resolveBackupFile(requested); }
  catch (_) { throw restoreError('Backup not found: ' + requested, 404, 'backup_not_found'); }

  // Re-validate the staged archive immediately before anything destructive.
  const validation = await validateBackupArchiveBuffer(fs.readFileSync(staged));

  const operation = acquireOperation('restore');
  try {
    let safety;
    try {
      safety = await createBackup({ _operation: operation });
    } catch (e) {
      throw restoreError('Safety backup failed, restore aborted: ' + String((e && e.message) || e), 500, 'safety_backup_failed');
    }
    if (!safety || safety.status !== 'success' || !safety.verified || safety.verified.db !== true) {
      throw restoreError('Safety backup verification failed, restore aborted', 500, 'safety_backup_failed');
    }
    return await performRestore(staged, validation, safety);
  } finally {
    releaseOperation(operation);
  }
}

// ── GitHub Releases update workflow ──
const PROTECTED_UPDATE_SEGMENTS = new Set(['data', 'uploads', 'backups', 'logs', 'node_modules', '.git']);
// Secrets / runtime state that an update package must never overwrite.
const PROTECTED_UPDATE_FILES = new Set(['.env', '.env.local', '.env.production', '.env.production.local', '.env.development', '.env.development.local', '.dev.vars', 'id_rsa', 'id_dsa']);
const PROTECTED_UPDATE_EXT = new Set(['.pem', '.key', '.p12', '.pfx', '.crt', '.cer']);
// Max compressed size of an update package accepted from GitHub or upload.
const MAX_PACKAGE_BYTES = 200 * 1024 * 1024;
// Request timeouts (overridable so tests can use short values).
const GH_API_TIMEOUT_MS = Number(process.env.GITHUB_TIMEOUT_MS) > 0 ? Number(process.env.GITHUB_TIMEOUT_MS) : 20000;
const GH_DOWNLOAD_TIMEOUT_MS = Number(process.env.GITHUB_DOWNLOAD_TIMEOUT_MS) > 0 ? Number(process.env.GITHUB_DOWNLOAD_TIMEOUT_MS) : 120000;

// A path (relative to the project root) is "protected" when it holds the
// database, uploads, secrets, backups or logs: those are preserved verbatim
// on install and reported as skipped.
function isProtectedPath(rel) {
  const norm = String(rel || '').split('\\').join('/');
  if (!norm) return false;
  const segs = norm.split('/').filter(Boolean);
  if (!segs.length) return false;
  for (const seg of segs) {
    if (PROTECTED_UPDATE_SEGMENTS.has(seg)) return true;
    if (PROTECTED_UPDATE_FILES.has(seg)) return true;
    if (/^credentials/i.test(seg)) return true;
  }
  return PROTECTED_UPDATE_EXT.has(path.extname(segs[segs.length - 1]).toLowerCase());
}

function updaterError(message, status, code) {
  const e = new Error(message);
  e.status = status || 400;
  e.code = code || 'update_error';
  return e;
}

function readSettingFromDb(key) {
  try {
    const db = new DatabaseSync(DB_PATH);
    try {
      try { db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT \'\', updated_at TEXT NOT NULL DEFAULT (datetime(\'now\')))'); } catch (_) {}
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      return row ? String(row.value == null ? '' : row.value) : null;
    } finally {
      db.close();
    }
  } catch (_) {
    return null;
  }
}

// ── Backup schedule / retention settings (persisted in the settings table) ─
const BACKUP_SETTINGS = {
  enabled: { key: 'backup.schedule.enabled', def: 'true' },
  time: { key: 'backup.schedule.time', def: '00:00' },
  timezone: { key: 'backup.schedule.timezone', def: '' },
  retentionCount: { key: 'backup.retention.count', def: '20' }
};

function writeSettingToDb(key, value) {
  const db = new DatabaseSync(DB_PATH);
  try {
    db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT (datetime('now')))");
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(String(key), String(value));
  } finally {
    db.close();
  }
}

// The scheduled backup runs at the configured wall-clock time in this
// timezone (default 00:00 server-local). The timezone is explicit: settings
// value -> TZ env -> the OS zone reported by Node.
function defaultBackupTimezone() {
  const fromEnv = String(process.env.TZ || '').trim();
  if (fromEnv) return fromEnv;
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (_) { return 'UTC'; }
}
function isValidTimezone(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: String(tz || '') }); return true; } catch (_) { return false; }
}
function isValidTimeOfDay(t) {
  const parts = String(t || '').split(':');
  if (parts.length !== 2) return false;
  if (parts[0].length !== 2 || parts[1].length !== 2) return false;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  return Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function getBackupSettings() {
  const rawEnabled = String(readSettingFromDb(BACKUP_SETTINGS.enabled.key) || '').trim();
  const enabled = !(rawEnabled === 'false' || rawEnabled === '0');
  const rawTime = String(readSettingFromDb(BACKUP_SETTINGS.time.key) || '').trim() || BACKUP_SETTINGS.time.def;
  const time = isValidTimeOfDay(rawTime) ? rawTime : BACKUP_SETTINGS.time.def;
  const rawTz = String(readSettingFromDb(BACKUP_SETTINGS.timezone.key) || '').trim();
  const tzValid = !!rawTz && isValidTimezone(rawTz);
  const timezone = tzValid ? rawTz : defaultBackupTimezone();
  const rawRet = Number(readSettingFromDb(BACKUP_SETTINGS.retentionCount.key));
  const retentionCount = Number.isInteger(rawRet) && rawRet >= 1 && rawRet <= 365 ? rawRet : Number(BACKUP_SETTINGS.retentionCount.def);
  return {
    enabled,
    time,
    timezone,
    timezoneSource: tzValid ? 'setting' : 'system',
    retentionCount
  };
}

function saveBackupScheduleSettings(input) {
  input = input || {};
  if (input.enabled !== undefined) writeSettingToDb(BACKUP_SETTINGS.enabled.key, input.enabled ? 'true' : 'false');
  if (input.time !== undefined) {
    // Empty input keeps the default 00:00 rather than failing the save.
    const t = String(input.time || '').trim() || BACKUP_SETTINGS.time.def;
    if (!isValidTimeOfDay(t)) throw updaterError('Invalid schedule time (expected HH:MM)', 400, 'invalid_schedule_time');
    writeSettingToDb(BACKUP_SETTINGS.time.key, t);
  }
  if (input.timezone !== undefined) {
    // Empty input clears the override: fall back to the system timezone.
    const tz = String(input.timezone || '').trim();
    if (tz && !isValidTimezone(tz)) throw updaterError('Invalid timezone: ' + tz, 400, 'invalid_timezone');
    writeSettingToDb(BACKUP_SETTINGS.timezone.key, tz);
  }
  if (input.retentionCount !== undefined) {
    const n = Number(input.retentionCount);
    if (!Number.isInteger(n) || n < 1 || n > 365) throw updaterError('Invalid retention count (1-365)', 400, 'invalid_retention');
    writeSettingToDb(BACKUP_SETTINGS.retentionCount.key, String(n));
  }
  return getBackupSettings();
}

function getGitHubConfig() {
  let owner = String(process.env.GITHUB_UPDATE_OWNER || process.env.GITHUB_OWNER || '').trim();
  let repo = String(process.env.GITHUB_UPDATE_REPO || process.env.GITHUB_REPO || '').trim();
  if (!owner || !repo) {
    const envRepo = String(process.env.GITHUB_REPOSITORY || process.env.GITHUB_UPDATE_REPOSITORY || '').trim();
    if (envRepo.includes('/')) {
      const parts = envRepo.split('/');
      if (!owner) owner = String(parts[0] || '').trim();
      if (!repo) repo = String(parts[1] || '').trim();
    }
  }
  if (!owner) {
    const v = readSettingFromDb('update.github.owner');
    if (v) owner = v.trim();
  }
  if (!repo) {
    const v = readSettingFromDb('update.github.repo');
    if (v) repo = v.trim();
  }
  const token = String(process.env.GITHUB_TOKEN || process.env.GITHUB_UPDATE_TOKEN || process.env.GH_TOKEN || '').trim();
  const apiBaseUrl = String(process.env.GITHUB_API_BASE_URL || 'https://api.github.com').trim().replace(/\/$/, '');
  return { owner, repo, token, apiBaseUrl };
}

function githubHeaders(cfg, extra) {
  const h = Object.assign({ 'User-Agent': 'Camzy-Updater', 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, extra || {});
  if (cfg.token) h.Authorization = 'Bearer ' + cfg.token;
  return h;
}

function mapGitHubError(res, context) {
  const err = new Error();
  err.status = res.status;
  const what = context || 'GitHub resource';
  if (res.status === 404) {
    err.message = what + ' not found (repository or published release does not exist)';
    err.code = 'not_found';
    return err;
  }
  if (res.status === 401) {
    err.message = 'GitHub authentication failed (check the server-side token)';
    err.status = 401;
    err.code = 'auth_failed';
    return err;
  }
  if (res.status === 403 || res.status === 429) {
    let remaining = '';
    let reset = '';
    try { remaining = String(res.headers.get('x-ratelimit-remaining') || ''); } catch (_) {}
    try { reset = String(res.headers.get('x-ratelimit-reset') || ''); } catch (_) {}
    if (remaining === '0' || res.status === 429) {
      err.status = 429;
      err.code = 'rate_limited';
      let when = '';
      if (/^\d+$/.test(reset)) {
        err.retryAt = Number(reset) * 1000;
        when = ' (resets at ' + new Date(Number(reset) * 1000).toISOString() + ')';
      }
      err.message = 'GitHub API rate limit exceeded' + when + '; try later or configure a server-side token';
      return err;
    }
    err.status = 403;
    err.code = 'forbidden';
    err.message = 'Access denied to GitHub repository (the server-side token needs read-only access)';
    return err;
  }
  if (res.status >= 500) {
    err.status = 502;
    err.code = 'upstream_error';
    err.message = 'GitHub API server error: ' + res.status + ' ' + (res.statusText || '');
    return err;
  }
  err.code = 'api_error';
  err.message = 'GitHub API error: ' + res.status + ' ' + (res.statusText || '');
  return err;
}

async function fetchLatestGitHubRelease(cfg) {
  cfg = cfg || getGitHubConfig();
  if (!cfg.owner || !cfg.repo) {
    throw updaterError('GitHub repository is not configured (set owner/repository on this page)', 400, 'not_configured');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(cfg.owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(cfg.repo)) {
    throw updaterError('Invalid GitHub repository configuration (owner/repository)', 400, 'invalid_repo');
  }
  const url = cfg.apiBaseUrl + '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) + '/releases/latest';
  let res;
  try {
    res = await fetch(url, { headers: githubHeaders(cfg), signal: AbortSignal.timeout(GH_API_TIMEOUT_MS) });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw updaterError('Timed out contacting the GitHub API', 504, 'timeout');
    }
    throw updaterError('Network failure contacting GitHub: ' + (e && e.message ? e.message : e), 502, 'network');
  }
  if (!res.ok) throw mapGitHubError(res, 'Latest release');
  let json;
  try { json = await res.json(); } catch (e) {
    throw updaterError('Invalid JSON response from GitHub API', 502, 'bad_response');
  }
  const assets = Array.isArray(json.assets) ? json.assets.map((a) => ({
    name: String(a.name || ''),
    size: Number(a.size || 0),
    downloadUrl: a.browser_download_url || a.url || '',
    apiUrl: a.url || '',
    digest: a.digest || a.sha256 || null,
    contentType: a.content_type || ''
  })) : [];
  return {
    owner: cfg.owner,
    repo: cfg.repo,
    version: String(json.tag_name || json.name || '').trim(),
    name: String(json.name || json.tag_name || '').trim(),
    body: String(json.body || ''),
    publishedAt: String(json.published_at || ''),
    htmlUrl: String(json.html_url || ''),
    assets
  };
}

function findUpdateAsset(release, preferredName) {
  const zips = (release.assets || []).filter((a) => /\.zip$/i.test(String(a.name || '')));
  if (preferredName) {
    const found = zips.find((a) => String(a.name) === String(preferredName));
    if (found) return found;
  }
  if (!zips.length) return null;
  const preferred = zips.find((a) => /update|release/i.test(String(a.name || '')));
  return preferred || zips[0];
}

async function checkGitHubUpdate(options) {
  options = options || {};
  const cfg = getGitHubConfig();
  const release = await fetchLatestGitHubRelease(cfg);
  const asset = findUpdateAsset(release, options.asset);
  const sha256Asset = asset
    ? (release.assets || []).find((a) => String(a.name) === asset.name + '.sha256') || null
    : null;
  return {
    currentVersion: APP_VERSION,
    repository: cfg.owner + '/' + cfg.repo,
    tokenConfigured: !!cfg.token,
    release: {
      version: release.version,
      name: release.name,
      body: release.body,
      notes: release.body,
      publishedAt: release.publishedAt,
      htmlUrl: release.htmlUrl
    },
    available: !!asset,
    reason: asset ? null : 'no_zip_asset',
    asset: asset ? {
      name: asset.name,
      size: asset.size,
      digest: asset.digest || null,
      digestSource: asset.digest ? 'release-digest' : (sha256Asset ? 'sha256-asset' : null),
      sha256Asset: sha256Asset ? sha256Asset.name : null,
      downloadUrl: asset.downloadUrl
    } : null,
    assets: release.assets
  };
}

async function downloadGitHubReleaseAsset(options) {
  options = options || {};
  const cfg = getGitHubConfig();
  const release = await fetchLatestGitHubRelease(cfg);
  const asset = findUpdateAsset(release, options.asset || options.assetName);
  if (!asset || !asset.downloadUrl) {
    throw updaterError('No update ZIP asset found in the latest GitHub Release', 404, 'no_asset');
  }

  const headers = githubHeaders(cfg, {});
  let url = asset.downloadUrl;
  if (asset.apiUrl && /api\.github\.com/.test(asset.apiUrl)) {
    url = asset.apiUrl;
    headers.Accept = 'application/octet-stream';
  }
  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(GH_DOWNLOAD_TIMEOUT_MS), redirect: 'follow' });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw updaterError('Timed out downloading the GitHub release asset', 504, 'timeout');
    }
    throw updaterError('Network failure downloading GitHub asset: ' + (e && e.message ? e.message : e), 502, 'network');
  }
  if (!res.ok) throw mapGitHubError(res, 'Release asset');
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MAX_PACKAGE_BYTES) throw updaterError('Release asset is too large to stage', 413, 'package_too_large');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_PACKAGE_BYTES) throw updaterError('Release asset is too large to stage', 413, 'package_too_large');

  // ── SHA-256 verification against the published digest ──
  // Source 1: the `digest` field GitHub publishes on release assets.
  // Source 2: a `<asset>.sha256` companion asset in the same release.
  // When neither exists the package is staged unverified and the response
  // says so explicitly (digestVerified: false, digest: null).
  let digest = asset.digest ? String(asset.digest) : '';
  let digestSource = digest ? 'release-digest' : '';
  if (!digest) {
    const sidecar = (release.assets || []).find((a) => String(a.name) === asset.name + '.sha256');
    if (sidecar && sidecar.downloadUrl) {
      try {
        const sr = await fetch(sidecar.downloadUrl, { headers: githubHeaders(cfg, { Accept: 'text/plain' }), signal: AbortSignal.timeout(30000), redirect: 'follow' });
        if (sr.ok) {
          const txt = ((await sr.text()) || '').trim().split(/\s+/)[0] || '';
          if (/^[a-f0-9]{64}$/i.test(txt)) { digest = txt; digestSource = 'sha256-asset'; }
        }
      } catch (_) { /* sidecar unavailable → staged unverified, reported below */ }
    }
  }
  let digestVerified = false;
  if (digest) {
    const expected = String(digest).replace(/^sha256:/i, '').trim().toLowerCase();
    if (/^[a-f0-9]{64}$/.test(expected)) {
      const actual = crypto.createHash('sha256').update(buf).digest('hex');
      if (actual !== expected) {
        // Reject the package: nothing is written into data/updates.
        throw updaterError(
          'SHA-256 verification failed for "' + asset.name + '" (expected ' + expected.slice(0, 12) + '…, got ' + actual.slice(0, 12) + '…). Package rejected.',
          422, 'digest_mismatch');
      }
      digestVerified = true;
    } else {
      digest = '';
      digestSource = '';
    }
  }

  const validation = await validateUpdatePackageBuffer(buf);

  ensureDir(UPDATE_DIR);
  let filename = path.basename(String(asset.name || 'github-update.zip'));
  if (!/\.zip$/i.test(filename)) filename += '.zip';
  filename = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  if (fs.existsSync(path.join(UPDATE_DIR, filename))) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    filename = filename.replace(/\.zip$/i, '') + '-' + stamp + '.zip';
  }
  fs.writeFileSync(path.join(UPDATE_DIR, filename), buf);
  const downloadedAt = new Date().toISOString();
  // Sidecar metadata pins the exact release version to the staged file, so
  // the install step can demand an exact version + filename confirmation.
  writePackageMeta(filename, {
    source: 'github',
    filename: filename,
    asset: asset.name,
    version: release.version,
    notes: String(release.body || '').slice(0, 4000),
    size: buf.length,
    digest: digest || null,
    digestSource: digestSource || null,
    digestVerified: digestVerified,
    release: { tag: release.version, publishedAt: release.publishedAt, htmlUrl: release.htmlUrl },
    downloadedAt: downloadedAt
  });

  return {
    ok: true,
    filename,
    savedPath: 'data/updates/' + filename,
    version: release.version,
    notes: String(release.body || ''),
    asset: asset.name,
    size: buf.length,
    digest: digest || null,
    digestSource: digestSource || null,
    digestVerified,
    downloadedAt,
    validation
  };
}

module.exports = {
  ROOT,
  DB_PATH,
  BACKUP_DIR,
  UPDATE_DIR,
  APP_VERSION,
  getAppVersion: () => APP_VERSION,
  createBackup,
  acquireOperation,
  releaseOperation,
  currentOperation,
  getBackupSettings,
  saveBackupScheduleSettings,
  defaultBackupTimezone,
  isValidTimezone,
  listBackups,
  getLatestBackup,
  resolveBackupFile,
  checkUpdate,
  applyUpdate,
  rollbackBackup,
  copyDir,
  extractZip,
  walkFiles,
  removeIntroducedFiles,
  readIntroduced,
  writeIntroduced,
  listUpdatePackages,
  validateUpdatePackageBuffer,
  saveUploadedUpdate,
  resolveUpdateFile,
  deleteUpdatePackage,
  getGitHubConfig,
  fetchLatestGitHubRelease,
  checkGitHubUpdate,
  downloadGitHubReleaseAsset,
  findUpdateAsset,
  isProtectedPath,
  updaterError,
  validateBackupArchiveBuffer,
  stageUploadedBackup,
  restoreBackupArchive,
  RESTORE_MAX_UPLOAD_BYTES,
  readPackageMeta,
  writePackageMeta,
  readPackageInfo
};
