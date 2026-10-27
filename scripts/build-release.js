'use strict';

/*
 * Builds the update package published as a GitHub Release asset, consumed by
 * the admin page «پشتیبان‌گیری و آپدیت» (server/backup-manager.js).
 *
 *   node scripts/build-release.js [version]
 *
 * Output (release/):
 *   camzy-update-<version>.zip          manifest.json (root) + app/ payload
 *   camzy-update-<version>.zip.sha256   companion asset `<asset>.sha256`
 *
 * Payload = git project source (tracked + untracked, non-ignored), minus
 * databases, uploads, backups, logs, secrets (.env/.pem/.key), node_modules,
 * .git and local-only tooling files. Nothing is published or pushed here.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const archiver = require('archiver');
const bm = require('../server/backup-manager.js');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(process.env.RELEASE_OUTPUT_DIR || path.join(ROOT, 'release-output'));

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = String(process.argv[2] || pkg.version || '0.0.0').trim();
if (!/^[A-Za-z0-9._-]+$/.test(VERSION)) {
  console.error('Invalid version: ' + VERSION);
  process.exit(1);
}
const ZIP_NAME = 'camzy-update-' + VERSION + '.zip';
const SHA_NAME = ZIP_NAME + '.sha256';

// Directories never shipped in an update package.
const EXCLUDE_DIRS = new Set([
  'data', 'uploads', 'backups', 'logs', 'node_modules', '.git',
  '.freebuff', '.vscode', 'release', 'release-output', 'test-results', 'playwright-report'
]);
// Local-only helper files at the repo root.
const EXCLUDE_FILES = new Set(['.GitHub-Push.bat']);
// Secret / runtime-state extensions.
const EXCLUDE_EXT = /\.(db|db-wal|db-shm|sqlite|sqlite3|log|pem|key|p12|pfx|crt|cer|bak|tmp)$/i;

// `data`, `uploads`, `backups` and `logs` match anywhere because the update
// manager's isProtectedPath() treats any such segment as protected (never
// installed), so shipping them would only add dead weight — including
// assets/data/iran-cities.json. The credential/session name heuristic only
// applies to data-dump extensions: every real dump (_live_session.json,
// _repro_cred.json, …) is already gitignored, while tracked source such as
// _revoke_sessions.cjs must ship.
const LOCAL_DUMP_EXT = /\.(json|txt|log|db|env|ya?ml)$/i;
function excluded(rel) {
  const segs = rel.split('/');
  for (const seg of segs) {
    if (EXCLUDE_DIRS.has(seg)) return true;
    if (/^\.env(\.|$)/.test(seg)) return true;          // .env, .env.local, …
    if (/^credentials/i.test(seg)) return true;
  }
  const base = segs[segs.length - 1];
  if (EXCLUDE_FILES.has(base)) return true;
  if (EXCLUDE_EXT.test(base)) return true;
  if (/_cred|_session|_live/i.test(base) && LOCAL_DUMP_EXT.test(base)) return true;
  return false;
}

function gitLines(args) {
  const out = execFileSync('git', args, { cwd: ROOT, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  return out.toString('utf8').split('\0').filter(Boolean);
}

function collectFiles() {
  const tracked = gitLines(['ls-files', '-z']);
  const untracked = gitLines(['ls-files', '-z', '--others', '--exclude-standard']);
  const seen = new Set();
  const files = [];
  for (const rel of tracked.concat(untracked)) {
    const norm = rel.split('\\').join('/');
    if (seen.has(norm)) continue;
    seen.add(norm);
    if (excluded(norm)) continue;
    const full = path.join(ROOT, norm);
    let st;
    try { st = fs.lstatSync(full); } catch (_) { continue; }
    if (!st.isFile()) continue;              // no directories, no symlinks
    files.push({ rel: norm, full, size: st.size });
  }
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return files;
}

function buildZip(files) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const dest = path.join(OUT_DIR, ZIP_NAME);
    const out = fs.createWriteStream(dest);
    const archive = archiver('zip', { zlib: { level: 9 } });
    let settled = false;
    const done = (err) => { if (settled) return; settled = true; err ? reject(err) : resolve(dest); };
    out.on('close', () => done());
    out.on('error', done);
    archive.on('error', done);
    archive.pipe(out);
    archive.append(JSON.stringify({
      name: 'camzy',
      version: VERSION,
      notes: 'بسته بروزرسانی گیت‌هاب ' + VERSION + ' — فقط فایل‌های برنامه؛ دیتابیس، فایل‌های آپلودی، پشتیبان‌ها، لاگ‌ها و تنظیمات محرمانه دست‌نخورده می‌مانند.\n'
        + 'GitHub release ' + VERSION + ' — application source only; database, uploads, backups, logs and secrets are preserved.',
      createdAt: new Date().toISOString()
    }, null, 2), { name: 'manifest.json' });
    for (const f of files) archive.file(f.full, { name: 'app/' + f.rel });
    archive.finalize();
  });
}

async function main() {
  const files = collectFiles();
  if (!files.length) throw new Error('No source files found to package');

  const existingDest = path.join(OUT_DIR, ZIP_NAME);
  if (fs.existsSync(existingDest)) {
    throw new Error('Release ZIP already exists, refusing to overwrite: ' + existingDest);
  }

  const dest = await buildZip(files);
  const buf = fs.readFileSync(dest);
  const digest = crypto.createHash('sha256').update(buf).digest('hex');
  const shaPath = path.join(OUT_DIR, SHA_NAME);
  fs.writeFileSync(shaPath, digest + '  ' + ZIP_NAME + '\n');

  // ── Validate with the update manager's own rules ──
  const validation = await bm.validateUpdatePackageBuffer(buf);
  const info = await bm.readPackageInfo(dest);

  const problems = [];
  if (!info.version) problems.push('package carries no version metadata');
  if (info.version !== VERSION) problems.push('manifest version ' + JSON.stringify(info.version) + ' != release version ' + JSON.stringify(VERSION));
  if (validation.protectedCount > 0) {
    problems.push('protected entries present: ' + JSON.stringify(validation.protectedEntries));
  }
  if (buf.length > 200 * 1024 * 1024) problems.push('package exceeds the 200 MB limit');

  const report = {
    zip: path.relative(ROOT, dest).split('\\').join('/'),
    sha256File: path.relative(ROOT, shaPath).split('\\').join('/'),
    version: VERSION,
    size: buf.length,
    sha256: digest,
    fileCount: validation.fileCount,
    totalUncompressed: validation.totalUncompressed,
    installableFiles: validation.installableFiles,
    protectedCount: validation.protectedCount,
    manifest: validation.manifest,
    packageInfo: { version: info.version, source: info.source },
    problems
  };
  console.log(JSON.stringify(report, null, 2));
  if (problems.length) {
    console.error('VALIDATION FAILED: ' + problems.length + ' problem(s)');
    process.exit(2);
  }
  console.log('VALIDATION OK');
  console.log('ZIP_PATH=' + dest);
  console.log('VERSION=' + VERSION);
  console.log('SIZE=' + buf.length);
  console.log('SHA256=' + digest);
}

main().catch((e) => {
  console.error('BUILD FAILED: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
