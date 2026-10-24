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

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

function walkFiles(dir, base) {
  base = base || ROOT;
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).replace(/\\/g, '/');
    const segs = rel.split('/');
    if (segs.some((s) => EXCLUDE_DIRS.has(s) || (s.startsWith('.') && s !== '.well-known'))) continue;
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, base));
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
    if (!fs.existsSync(full)) continue;
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

async function createBackup(opts) {
  opts = opts || {};
  ensureDir(BACKUP_DIR);
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
      const files = walkFiles(ROOT);
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

    // verify archive
    const zip = await unzipper.Open.file(dest);
    if (!zip.files || !zip.files.length) throw new Error('Backup archive is empty');
    const dbEntry = zip.files.find((f) => f.path === 'database/camzy.db');
    if (dbEntry) {
      const buf = await dbEntry.buffer();
      const verifyPath = path.join(tmp, 'verify.db');
      fs.writeFileSync(verifyPath, buf);
      const vdb2 = new DatabaseSync(verifyPath);
      try {
        const row = vdb2.prepare('PRAGMA integrity_check').get();
        const val = row ? Object.values(row)[0] : null;
        if (val !== 'ok') throw new Error('Backup archive DB integrity check failed');
      } finally {
        vdb2.close();
      }
    }

    const stat = fs.statSync(dest);
    const meta = {
      filename,
      createdAt: new Date().toISOString(),
      size: stat.size,
      status: 'success',
      version: APP_VERSION
    };
    const m = readManifest();
    m.backups = Array.isArray(m.backups) ? m.backups : [];
    m.backups.unshift(meta);
    // prune
    const keep = Number(opts.keep) > 0 ? Number(opts.keep) : 10;
    const sorted = m.backups.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const toKeep = sorted.slice(0, keep);
    const toRemove = sorted.slice(keep);
    for (const old of toRemove) {
      if (!old || !old.filename) continue;
      try { fs.unlinkSync(path.join(BACKUP_DIR, old.filename)); } catch (_) {}
    }
    m.backups = toKeep;
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
        version: APP_VERSION
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
  const exclude = new Set(opts.exclude || []);
  const excludeFiles = new Set(opts.excludeFiles || ['.env', '.env.local', '.env.production', '.env.production.local']);
  const excludeExt = new Set(opts.excludeExt || ['.pem', '.key', '.p12', '.pfx', '.crt', '.cer']);
  if (!fs.existsSync(src)) return;
  if (!isWithinRoot(dst)) throw new Error('Refusing to copy outside project root');
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (exclude.has(entry.name)) continue;
    if (excludeFiles.has(entry.name)) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (excludeExt.has(ext)) continue;
    if (entry.name === 'id_rsa' || entry.name === 'id_dsa' || /^credentials/i.test(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (!isWithinRoot(d)) throw new Error('Refusing to copy outside project root');
    if (entry.isDirectory()) {
      copyDir(s, d, opts);
    } else {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
    }
  }
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
    out.push({
      filename: f,
      size: st.size,
      createdAt: st.mtime.toISOString(),
      version,
      notes
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
    if (path.isAbsolute(normalized) || normalized.startsWith('/')) {
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
    if (entry.type === 'Symlink') {
      throw new Error('Symlinks are not allowed in update packages');
    }
    if (!entry.isDirectory) {
      fileCount += 1;
      totalUncompressed += Number(entry.uncompressedSize || 0);
    }
  }
  if (fileCount === 0) throw new Error('ZIP archive contains no files');
  if (totalUncompressed > 200 * 1024 * 1024) {
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

  return { fileCount, totalUncompressed, manifest };
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
  return {
    ok: true,
    filename,
    version: validation.manifest ? validation.manifest.version : null,
    notes: validation.manifest ? validation.manifest.notes : '',
    fileCount: validation.fileCount,
    totalUncompressed: validation.totalUncompressed
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

async function applyUpdate(options) {
  options = options || {};
  const confirm = options.confirm;
  const okConfirm = (confirm === true || confirm === 'true' || confirm === 'yes' || confirm === '1');
  if (!okConfirm) throw new Error('Explicit admin confirmation required');

  ensureDir(UPDATE_DIR);
  const check = await checkUpdate();
  const pkgName = options.package ? path.basename(String(options.package)) : check.package;
  if (!pkgName) throw new Error('No update package available');
  const pkgPath = path.join(UPDATE_DIR, pkgName);
  if (!fs.existsSync(pkgPath)) throw new Error('Update package not found: ' + pkgName);

  // Validate package structure before touching anything.
  try {
    const pkgBuffer = fs.readFileSync(pkgPath);
    await validateUpdatePackageBuffer(pkgBuffer);
  } catch (e) {
    throw new Error('Invalid update package: ' + (e && e.message ? e.message : e));
  }

  // backup first
  const backup = await createBackup({ keep: 20 });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'camzy-update-'));
  try {
    const extractDir = path.join(tmp, 'extract');
    await extractZip(pkgPath, extractDir);

    // determine source root
    const appDir = path.join(extractDir, 'app');
    const sourceRoot = fs.existsSync(appDir) ? appDir : extractDir;

    // Collect files that do not already exist, so a failed update can remove them.
    const introduced = [];
    (function walk(src, base) {
      if (!fs.existsSync(src)) return;
      for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, e.name);
        const rel = path.relative(base, s).replace(/\\\\/g, '/');
        const excludedDirs = new Set(['data', 'node_modules', '.git', 'backups', 'logs', 'uploads']);
        const segs = rel.split('/');
        if (segs.some((x) => excludedDirs.has(x))) continue;
        if (e.isDirectory()) walk(s, base);
        else {
          const dst = path.join(ROOT, rel);
          if (!fs.existsSync(dst)) introduced.push(rel);
        }
      }
    })(sourceRoot, sourceRoot);

    // version from manifest if present
    let newVersion = check.latestVersion;
    try {
      const z = await unzipper.Open.file(pkgPath);
      const mf = z.files.find((f) => /^(manifest\.json|VERSION|version\.txt)$/i.test(f.path));
      if (mf) {
        const txt = (await mf.buffer()).toString('utf8');
        try { const j = JSON.parse(txt); if (j && j.version) newVersion = String(j.version); } catch (_) { if (txt.trim()) newVersion = txt.trim(); }
      }
    } catch (_) {}

    // apply
    copyDir(sourceRoot, ROOT, { exclude: ['data', 'node_modules', '.git', 'backups', 'logs', 'uploads'] });
    writeIntroduced(introduced);

    // record
    ensureDir(UPDATE_DIR);
    fs.writeFileSync(path.join(UPDATE_DIR, 'applied.json'), JSON.stringify({
      version: newVersion,
      package: pkgName,
      appliedAt: new Date().toISOString(),
      backup: backup.filename
    }, null, 2));

    return { ok: true, version: newVersion, package: pkgName, backup: backup.filename, restartRequired: true, message: 'Update applied successfully. Server restart may be required.' };
  } catch (e) {
    // remove files introduced by this failed update
    try { removeIntroducedFiles(); } catch (_) {}
    // rollback
    try { await rollbackBackup(backup.filename); } catch (_) {}
    throw new Error('Update failed and was rolled back: ' + (e && e.message ? e.message : e));
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
}

async function rollbackBackup(filename) {
  const base = path.basename(String(filename || ''));
  const zipPath = resolveBackupFile(base);
  // remove files introduced by the last update first
  try { removeIntroducedFiles(); } catch (_) {}

  if (!/\.zip$/i.test(base)) {
    // DB-only backup: restore database only
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
    if (fs.existsSync(dbSnap)) {
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

// ── GitHub Releases update workflow ──
const PROTECTED_UPDATE_SEGMENTS = new Set(['data', 'uploads', 'backups', 'logs', 'node_modules', '.git']);

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
  const apiBaseUrl = String(process.env.GITHUB_API_BASE_URL || 'https://api.github.com').trim().replace(/\\/$/, '');
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
  if (res.status === 404) {
    err.message = (context || 'GitHub resource') + ' not found';
    return err;
  }
  if (res.status === 401) {
    err.message = 'GitHub authentication failed (check server-side token)';
    err.status = 401;
    return err;
  }
  if (res.status === 403) {
    let remaining = '';
    try { remaining = String(res.headers.get('x-ratelimit-remaining') || ''); } catch (_) {}
    if (remaining === '0') {
      err.message = 'GitHub API rate limit exceeded; try later or configure a token';
      err.status = 429;
      return err;
    }
    err.message = 'Access denied to GitHub repository (token needs read-only access)';
    err.status = 403;
    return err;
  }
  if (res.status === 429) {
    err.message = 'GitHub API rate limit exceeded; try later';
    return err;
  }
  err.message = 'GitHub API error: ' + res.status + ' ' + (res.statusText || '');
  return err;
}

async function fetchLatestGitHubRelease(cfg) {
  cfg = cfg || getGitHubConfig();
  if (!cfg.owner || !cfg.repo) {
    const e = new Error('GitHub repository is not configured (set update.github.owner/repo or env)');
    e.status = 400;
    throw e;
  }
  const url = cfg.apiBaseUrl + '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) + '/releases/latest';
  let res;
  try {
    res = await fetch(url, { headers: githubHeaders(cfg), signal: AbortSignal.timeout(20000) });
  } catch (e) {
    const err = new Error('Network failure contacting GitHub: ' + (e && e.message ? e.message : e));
    err.status = 502;
    throw err;
  }
  if (!res.ok) throw mapGitHubError(res, 'Latest release');
  let json;
  try { json = await res.json(); } catch (e) {
    const err = new Error('Invalid JSON response from GitHub API');
    err.status = 502;
    throw err;
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
  const zips = (release.assets || []).filter((a) => /\\.zip$/i.test(String(a.name || '')));
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
  return {
    currentVersion: APP_VERSION,
    repository: cfg.owner + '/' + cfg.repo,
    tokenConfigured: !!cfg.token,
    release: {
      version: release.version,
      name: release.name,
      body: release.body,
      publishedAt: release.publishedAt,
      htmlUrl: release.htmlUrl
    },
    available: !!asset,
    asset: asset ? {
      name: asset.name,
      size: asset.size,
      digest: asset.digest,
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
    const e = new Error('No update ZIP asset found in the latest GitHub Release');
    e.status = 404;
    throw e;
  }

  const headers = githubHeaders(cfg, {});
  let url = asset.downloadUrl;
  if (asset.apiUrl && /api\\.github\\.com/.test(asset.apiUrl)) {
    url = asset.apiUrl;
    headers.Accept = 'application/octet-stream';
  }
  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(120000), redirect: 'follow' });
  } catch (e) {
    const err = new Error('Network failure downloading GitHub asset: ' + (e && e.message ? e.message : e));
    err.status = 502;
    throw err;
  }
  if (!res.ok) throw mapGitHubError(res, 'Release asset');
  const buf = Buffer.from(await res.arrayBuffer());

  let digestVerified = false;
  const digest = asset.digest;
  if (digest) {
    const expected = String(digest).replace(/^sha256:/i, '').trim().toLowerCase();
    if (expected && /^[a-f0-9]{64}$/.test(expected)) {
      const actual = crypto.createHash('sha256').update(buf).digest('hex');
      if (actual !== expected) {
        const e = new Error('SHA-256 verification failed for downloaded GitHub asset');
        e.status = 400;
        throw e;
      }
      digestVerified = true;
    }
  }

  const validation = await validateUpdatePackageBuffer(buf);

  ensureDir(UPDATE_DIR);
  let filename = path.basename(String(asset.name || 'github-update.zip'));
  if (!/\\.zip$/i.test(filename)) filename += '.zip';
  filename = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  if (fs.existsSync(path.join(UPDATE_DIR, filename))) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    filename = filename.replace(/\\.zip$/i, '') + '-' + stamp + '.zip';
  }
  fs.writeFileSync(path.join(UPDATE_DIR, filename), buf);

  return {
    ok: true,
    filename,
    version: release.version,
    asset: asset.name,
    size: buf.length,
    digestVerified,
    digest: digest || null,
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
  findUpdateAsset
};
