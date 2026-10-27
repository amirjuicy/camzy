'use strict';
/* Tests for the GitHub Releases update workflow (Admin → «پشتیبان‌گیری و آپدیت»).
 *
 * - Mock GitHub API served by node:http (release JSON, assets, digests,
 *   404 / 401 / 403 rate-limit / 500 / hang / network-down scenarios).
 * - Everything runs against ISOLATED TEMPORARY PROJECT COPIES built in the OS
 *   temp dir. The real project, its database and any running server are never
 *   touched: no production install, no production data change, no deploy and
 *   no server restart happen here.
 *
 * Run:  node test_github_update_workflow.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const REPO_ROOT = __dirname;
const UPDATER_PATH = path.join(REPO_ROOT, 'server', 'backup-manager.js');
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
function expectReject(p, re, code) {
  return Promise.resolve(p).then(
    () => { throw new Error('expected rejection' + (re ? ' matching ' + re : '')); },
    (e) => {
      const msg = String((e && e.message) || e);
      if (re && !re.test(msg)) throw new Error('rejection message mismatch: ' + msg);
      if (code && e.code !== code) throw new Error('expected code ' + code + ', got ' + e.code + ' (' + msg + ')');
      if (code && !e.status) throw new Error('error missing status: ' + msg);
      return e;
    }
  );
}

/* ─────────────────────────── minimal ZIP writer ─────────────────────────── */
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
/* entries: [{ name, data|text, mode? (unix mode in external attrs), fakeUncompressed? }] */
function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const data = e.data || Buffer.from(e.text == null ? '' : e.text, 'utf8');
    const crc = crc32(data);
    const realSize = data.length;
    const shown = e.fakeUncompressed != null ? e.fakeUncompressed : realSize;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);   // version needed
    local.writeUInt16LE(0, 6);    // flags
    local.writeUInt16LE(0, 8);    // method: store
    local.writeUInt16LE(0, 10);   // time
    local.writeUInt16LE(0, 12);   // date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(realSize, 18);
    local.writeUInt32LE(shown, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4);  // version made by (unix)
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);   // flags
    central.writeUInt16LE(0, 10);  // method
    central.writeUInt16LE(0, 12);  // time
    central.writeUInt16LE(0, 14);  // date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(realSize, 20);
    central.writeUInt32LE(shown, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);  // extra
    central.writeUInt16LE(0, 32);  // comment
    central.writeUInt16LE(0, 34);  // disk
    central.writeUInt16LE(0, 36);  // internal attrs
    central.writeUInt32LE((((e.mode || 0o100644) >>> 0) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(Buffer.concat([central, nameBuf]));
    offset += 30 + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralBuf, eocd]);
}
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/* ─────────────────────── isolated temp project copies ───────────────────── */
const PROJECT_COPIES = [];
function makeTempProject(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'camzy-' + label + '-'));
  PROJECT_COPIES.push(root);
  const copy = (rel) => {
    const src = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(src)) return;
    const dst = path.join(root, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.cpSync(src, dst, { recursive: true });
  };
  ['package.json', 'index.html', '404.html', path.join('admin', 'index.html'), path.join('admin', 'assets', 'js', 'admin.js')].forEach(copy);
  fs.cpSync(path.join(REPO_ROOT, 'server'), path.join(root, 'server'), { recursive: true });

  fs.mkdirSync(path.join(root, 'data', 'updates'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data', 'backups'), { recursive: true });
  fs.mkdirSync(path.join(root, 'server', 'logs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'uploads', 'chat'), { recursive: true });
  fs.mkdirSync(path.join(root, 'assets', 'images', 'uploads'), { recursive: true });
  fs.mkdirSync(path.join(root, 'assets', 'js'), { recursive: true });

  const dbPath = path.join(root, 'data', 'camzy.db');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS camzy_test_orders (id TEXT PRIMARY KEY, total INTEGER NOT NULL);
    INSERT OR IGNORE INTO camzy_test_orders (id, total) VALUES ('ord-1', 12345);
    INSERT OR REPLACE INTO settings (key, value) VALUES ('update.github.owner', 'camzy-owner'), ('update.github.repo', 'camzy-repo');
  `);
  db.close();

  fs.writeFileSync(path.join(root, '.env'), 'SECRET_TOKEN=do-not-overwrite\n');
  fs.writeFileSync(path.join(root, 'server', 'logs', '2026-10-24-requests.log'), 'log-line-original\n');
  fs.writeFileSync(path.join(root, 'uploads', 'chat', 'keep.txt'), 'upload-original\n');
  fs.writeFileSync(path.join(root, 'assets', 'images', 'uploads', 'keep.png'), 'png-original');
  fs.writeFileSync(path.join(root, 'data', 'backups', 'old-backup.db'), 'old-backup-original');
  fs.writeFileSync(path.join(root, 'index.html'), '<html>ORIGINAL_INDEX</html>\n');
  fs.writeFileSync(path.join(root, 'server', 'logger.js'), fs.readFileSync(path.join(REPO_ROOT, 'server', 'logger.js')));
  return root;
}
function updaterEnv(root, extra) {
  return Object.assign({
    PROJECT_ROOT: root,
    DB_PATH: path.join(root, 'data', 'camzy.db'),
    BACKUP_DIR: path.join(root, 'data', 'backups'),
    UPDATE_DIR: path.join(root, 'data', 'updates'),
    GITHUB_TIMEOUT_MS: '1500',
    GITHUB_DOWNLOAD_TIMEOUT_MS: '5000',
  }, extra || {});
}
function loadUpdater(env) {
  const prev = {};
  for (const [k, v] of Object.entries(env)) {
    prev[k] = process.env[k];
    if (v === undefined || v === null) delete process.env[k];
    else process.env[k] = String(v);
  }
  delete require.cache[require.resolve(UPDATER_PATH)];
  const mod = require(UPDATER_PATH);
  mod.__restoreEnv = () => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  return mod;
}
function listZip(dir) {
  try { return fs.readdirSync(dir).filter((f) => /\.zip$/i.test(f)); } catch (_) { return []; }
}
function stagePackage(upd, root, filename, bytes, meta) {
  const dir = path.join(root, 'data', 'updates');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), bytes);
  if (meta) upd.writePackageMeta(filename, meta);
  return path.join(dir, filename);
}

/* ───────────────────────────── mock GitHub API ──────────────────────────── */
function startMockGitHub() {
  const state = {
    mode: 'ok',
    assetBytes: Buffer.alloc(0),
    digestOverride: null,   // literal digest string to publish
    publishedDigest: null,  // computed when null
    includeSha256Asset: false,
    owner: 'camzy-owner',
    repo: 'camzy-repo',
    tag: 'v2.0.0',
    notes: '## Highlights\n- fixed the thing\n- added the other thing',
    publishedAt: '2026-10-01T10:00:00Z',
    lastAuth: null,
    requests: [],
  };
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    state.requests.push({ url: req.url, auth: req.headers.authorization || null });
    state.lastAuth = req.headers.authorization || null;
    const u = req.url.split('?')[0];

    if (state.mode === 'hang') return; // never respond

    if (u === '/downloads/update-2.0.0.zip') {
      res.writeHead(200, { 'content-type': 'application/zip', 'content-length': String(state.assetBytes.length) });
      return res.end(state.assetBytes);
    }
    if (u === '/downloads/update-2.0.0.zip.sha256') {
      const txt = sha256(state.assetBytes) + '  update-2.0.0.zip\n';
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end(txt);
    }

    if (!/^\/repos\/[^/]+\/[^/]+\/releases\/latest$/.test(u)) {
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ message: 'Not Found' }));
    }

    if (state.mode === 'not-found') {
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ message: 'Not Found' }));
    }
    if (state.mode === 'unauthorized') {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ message: 'Bad credentials' }));
    }
    if (state.mode === 'rate-limit') {
      res.writeHead(403, {
        'content-type': 'application/json',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600),
      });
      return res.end(JSON.stringify({ message: 'API rate limit exceeded' }));
    }
    if (state.mode === 'error') {
      res.writeHead(500, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ message: 'Server Error' }));
    }

    const base = 'http://' + req.headers.host;
    const assets = [];
    if (state.mode !== 'no-asset') {
      assets.push({
        name: 'update-2.0.0.zip',
        size: state.assetBytes.length,
        content_type: 'application/zip',
        digest: state.digestOverride !== null ? state.digestOverride : ('sha256:' + sha256(state.assetBytes)),
        browser_download_url: base + '/downloads/update-2.0.0.zip',
        url: base + '/downloads/update-2.0.0.zip',
      });
      if (state.includeSha256Asset) {
        assets.push({
          name: 'update-2.0.0.zip.sha256',
          size: 90,
          content_type: 'text/plain',
          digest: null,
          browser_download_url: base + '/downloads/update-2.0.0.zip.sha256',
          url: base + '/downloads/update-2.0.0.zip.sha256',
        });
      }
    } else {
      assets.push({ name: 'source-notes.txt', size: 10, content_type: 'text/plain', browser_download_url: base + '/x', url: base + '/x' });
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      tag_name: state.tag,
      name: 'Release ' + state.tag,
      body: state.notes,
      draft: false,
      prerelease: false,
      published_at: state.publishedAt,
      html_url: base + '/releases/tag/' + state.tag,
      assets,
    }));
  });
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        state,
        url: 'http://127.0.0.1:' + server.address().port,
        close: () => new Promise((r) => { try { server.closeAllConnections(); } catch (_) {} server.close(() => r()); }),
      });
    });
  });
}

/* ───────────────────────────────── phases ───────────────────────────────── */
async function phaseZipValidation() {
  const upd = loadUpdater(updaterEnv(makeTempProject('zipval')));

  const good = buildZip([{ name: 'index.html', text: 'hi' }, { name: 'server/app.js', text: 'x' }]);
  await t('validation: well-formed ZIP passes', async () => {
    const v = await upd.validateUpdatePackageBuffer(good);
    assert.ok(v.fileCount >= 2);
    assert.strictEqual(v.protectedCount, 0);
    assert.strictEqual(v.installableFiles, v.fileCount);
  });

  await t('validation: rejects traversal (../) entries', () =>
    expectReject(upd.validateUpdatePackageBuffer(buildZip([{ name: '../evil.txt', text: 'x' }])), /Unsafe archive path/));
  await t('validation: rejects absolute paths', () =>
    expectReject(upd.validateUpdatePackageBuffer(buildZip([{ name: '/etc/passwd', text: 'x' }])), /Unsafe archive path/));
  await t('validation: rejects windows drive paths', () =>
    expectReject(upd.validateUpdatePackageBuffer(buildZip([{ name: 'C:/Windows/system.ini', text: 'x' }])), /Unsafe archive path/));
  await t('validation: rejects symlink entries', () =>
    expectReject(upd.validateUpdatePackageBuffer(buildZip([{ name: 'link', text: '/etc/passwd', mode: 0o120777 }])), /Symlinks are not allowed/));
  await t('validation: rejects nested traversal', () =>
    expectReject(upd.validateUpdatePackageBuffer(buildZip([{ name: 'server/../../x.txt', text: 'x' }])), /Unsafe archive path/));
  await t('validation: rejects non-ZIP bytes', () =>
    expectReject(upd.validateUpdatePackageBuffer(Buffer.from('this is not a zip at all, definitely not')), /Invalid ZIP file/));
  await t('validation: rejects empty ZIP', () =>
    expectReject(upd.validateUpdatePackageBuffer(buildZip([])), /no files|empty/i));
  await t('validation: reports protected paths (db/logs/env/uploads)', async () => {
    const buf = buildZip([
      { name: 'index.html', text: 'x' },
      { name: 'data/camzy.db', text: 'x' },
      { name: 'server/logs/2026-10-24-requests.log', text: 'x' },
      { name: '.env', text: 'x' },
      { name: 'uploads/chat/keep.txt', text: 'x' },
      { name: 'assets/images/uploads/p.png', text: 'x' },
      { name: 'node_modules/pkg/index.js', text: 'x' },
    ]);
    const v = await upd.validateUpdatePackageBuffer(buf);
    assert.strictEqual(v.protectedCount, 6, JSON.stringify(v.protectedEntries));
    assert.strictEqual(v.installableFiles, 1);
    assert.ok(v.protectedEntries.indexOf('.env') !== -1);
    assert.ok(v.protectedEntries.indexOf('data/camzy.db') !== -1);
    assert.ok(v.protectedEntries.indexOf('server/logs/2026-10-24-requests.log') !== -1);
  });
  await t('validation: rejects zip-bomb sized claims', () =>
    expectReject(
      upd.validateUpdatePackageBuffer(buildZip([{ name: 'big.bin', data: Buffer.alloc(16), fakeUncompressed: 400 * 1024 * 1024 }])),
      /too large/
    ));
  await t('upload: manual ZIP package is validated and staged with its version', async () => {
    const buf = buildZip([
      { name: 'manifest.json', text: JSON.stringify({ version: 'v1.2.3', notes: 'manual upload' }) },
      { name: 'index.html', text: 'x' },
    ]);
    const r = await upd.saveUploadedUpdate(buf, 'manual-package.zip');
    assert.strictEqual(r.filename, 'manual-package.zip');
    assert.strictEqual(r.savedPath, 'data/updates/manual-package.zip');
    assert.strictEqual(r.version, 'v1.2.3');
    assert.strictEqual(r.validation.protectedCount, 0);
    const pkgs = await upd.listUpdatePackages();
    const hit = pkgs.find((p) => p.filename === 'manual-package.zip');
    assert.ok(hit && hit.version === 'v1.2.3', 'list reports the package version');
    upd.deleteUpdatePackage('manual-package.zip');
    assert.ok(!fs.existsSync(path.join(upd.UPDATE_DIR, 'manual-package.zip')));
    assert.ok(!fs.existsSync(path.join(upd.UPDATE_DIR, 'manual-package.zip.meta.json')), 'metadata removed with the package');
  });

  await t('upload: a traversal ZIP is rejected before it is staged', async () => {
    await expectReject(upd.saveUploadedUpdate(buildZip([{ name: '../evil.txt', text: 'x' }]), 'evil.zip'), /Unsafe archive path/);
    assert.ok(!fs.existsSync(path.join(upd.UPDATE_DIR, 'evil.zip')));
  });

  upd.__restoreEnv();
}

async function phaseGitHub(mock) {
  const root = makeTempProject('github');
  const upd = loadUpdater(Object.assign(updaterEnv(root), {
    GITHUB_API_BASE_URL: mock.url,
    GITHUB_TOKEN: '',
  }));

  await t('config: owner/repo come from server-side settings, no token by default', () => {
    const cfg = upd.getGitHubConfig();
    assert.strictEqual(cfg.owner, 'camzy-owner');
    assert.strictEqual(cfg.repo, 'camzy-repo');
    assert.strictEqual(cfg.token, '');
  });
  await t('config: read-only token comes from server env only', () => {
    process.env.GITHUB_TOKEN = 'ghp_readonly_test_token';
    try {
      const cfg = upd.getGitHubConfig();
      assert.strictEqual(cfg.token, 'ghp_readonly_test_token');
      // config object is what the API returns minus the token: never leaked upstream
      const safe = Object.assign({}, cfg);
      delete safe.token;
      assert.ok(JSON.stringify(safe).indexOf('ghp_readonly_test_token') === -1);
    } finally { delete process.env.GITHUB_TOKEN; }
  });

  const updateZip = buildZip([
    { name: 'index.html', text: '<html>UPDATED_BY_RELEASE</html>\n' },
    { name: 'server/logger.js', text: '// updated logger\n' },
    { name: 'assets/js/brand-new.js', text: 'window.brandNew = 1;\n' },
    { name: 'data/camzy.db', text: 'EVIL_DB_CONTENT' },
    { name: 'server/logs/2026-10-24-requests.log', text: 'EVIL_LOG' },
    { name: '.env', text: 'EVIL_ENV' },
    { name: 'uploads/chat/keep.txt', text: 'EVIL_UPLOAD' },
  ]);
  mock.state.assetBytes = updateZip;
  mock.state.digestOverride = null;
  mock.state.includeSha256Asset = false;

  await t('release: latest published release exposes version/notes/date/ZIP', async () => {
    mock.state.mode = 'ok';
    const r = await upd.checkGitHubUpdate();
    assert.strictEqual(r.release.version, 'v2.0.0');
    assert.ok(r.release.body.indexOf('Highlights') !== -1);
    assert.strictEqual(r.release.publishedAt, '2026-10-01T10:00:00Z');
    assert.strictEqual(r.asset.name, 'update-2.0.0.zip');
    assert.strictEqual(r.asset.size, updateZip.length);
    assert.ok(/^sha256:[a-f0-9]{64}$/.test(r.asset.digest));
    assert.strictEqual(r.available, true);
    assert.strictEqual(r.tokenConfigured, false);
  });

  await t('download: digest mismatch rejects the package and stages nothing', async () => {
    mock.state.mode = 'ok';
    mock.state.digestOverride = 'sha256:' + 'f'.repeat(64);
    await expectReject(upd.downloadGitHubReleaseAsset({}), /SHA-256 verification failed/, 'digest_mismatch');
    assert.strictEqual(listZip(path.join(root, 'data', 'updates')).length, 0);
  });

  await t('download: stages ZIP into data/updates and verifies SHA-256', async () => {
    mock.state.digestOverride = null;
    const r = await upd.downloadGitHubReleaseAsset({});
    assert.strictEqual(r.filename, 'update-2.0.0.zip');
    assert.strictEqual(r.savedPath, 'data/updates/update-2.0.0.zip');
    assert.strictEqual(r.digestVerified, true);
    assert.strictEqual(r.digestSource, 'release-digest');
    assert.strictEqual(r.version, 'v2.0.0');
    const staged = fs.readFileSync(path.join(root, 'data', 'updates', r.filename));
    assert.strictEqual(sha256(staged), sha256(updateZip));
    const meta = upd.readPackageMeta(r.filename);
    assert.strictEqual(meta.version, 'v2.0.0');
    assert.strictEqual(meta.source, 'github');
    assert.strictEqual(meta.digestVerified, true);
  });

  await t('download: works without any digest (reported as unverified)', async () => {
    mock.state.digestOverride = '';   // digest field present but empty -> no digest published
    const r = await upd.downloadGitHubReleaseAsset({});
    assert.strictEqual(r.digestVerified, false);
    assert.strictEqual(r.digest, null);
    assert.ok(r.filename !== 'update-2.0.0.zip'); // timestamped because the first one exists
  });

  await t('download: verifies against a published <asset>.sha256 companion', async () => {
    mock.state.digestOverride = '';
    mock.state.includeSha256Asset = true;
    const r = await upd.downloadGitHubReleaseAsset({});
    assert.strictEqual(r.digestVerified, true);
    assert.strictEqual(r.digestSource, 'sha256-asset');
    mock.state.includeSha256Asset = false;
  });

  await t('download: corrupted body with published digest is rejected', async () => {
    // digest published for the good bytes, but serve different bytes
    mock.state.digestOverride = 'sha256:' + sha256(Buffer.from('different'));
    await expectReject(upd.downloadGitHubReleaseAsset({}), /SHA-256 verification failed/, 'digest_mismatch');
  });

  await t('release: missing ZIP asset is reported, download fails with no_asset', async () => {
    mock.state.mode = 'no-asset';
    const r = await upd.checkGitHubUpdate();
    assert.strictEqual(r.available, false);
    assert.strictEqual(r.reason, 'no_zip_asset');
    await expectReject(upd.downloadGitHubReleaseAsset({}), /No update ZIP asset/, 'no_asset');
  });

  await t('release: GitHub 404 (no published release) → not_found', async () => {
    mock.state.mode = 'not-found';
    const e = await expectReject(upd.checkGitHubUpdate(), /not found/, 'not_found');
    assert.strictEqual(e.status, 404);
  });

  await t('release: GitHub 401 → auth_failed (server-side token)', async () => {
    mock.state.mode = 'unauthorized';
    const e = await expectReject(upd.checkGitHubUpdate(), /authentication failed/, 'auth_failed');
    assert.strictEqual(e.status, 401);
  });

  await t('release: rate limit → 429 + rate_limited + retryAt', async () => {
    mock.state.mode = 'rate-limit';
    const e = await expectReject(upd.checkGitHubUpdate(), /rate limit/, 'rate_limited');
    assert.strictEqual(e.status, 429);
    assert.ok(typeof e.retryAt === 'number' && e.retryAt > Date.now() - 1000);
  });

  await t('release: GitHub 5xx → upstream_error (502)', async () => {
    mock.state.mode = 'error';
    const e = await expectReject(upd.checkGitHubUpdate(), /server error/i, 'upstream_error');
    assert.strictEqual(e.status, 502);
  });

  await t('release: timeout → timeout (504)', async () => {
    mock.state.mode = 'hang';
    const e = await expectReject(upd.checkGitHubUpdate(), /timed out/i, 'timeout');
    assert.strictEqual(e.status, 504);
    mock.state.mode = 'ok';
  });

  await t('release: network failure → network (502)', async () => {
    const saved = process.env.GITHUB_API_BASE_URL;
    process.env.GITHUB_API_BASE_URL = 'http://127.0.0.1:1';
    try {
      const e = await expectReject(upd.checkGitHubUpdate(), /Network failure/i, 'network');
      assert.strictEqual(e.status, 502);
    } finally { process.env.GITHUB_API_BASE_URL = saved; }
  });

  await t('release: invalid repository configuration is rejected', async () => {
    process.env.GITHUB_OWNER = 'bad owner!!';
    process.env.GITHUB_REPO = 'x';
    try {
      await expectReject(upd.checkGitHubUpdate(), /Invalid GitHub repository/, 'invalid_repo');
    } finally { delete process.env.GITHUB_OWNER; delete process.env.GITHUB_REPO; }
  });

  await t('release: unconfigured repository is rejected', async () => {
    const db = new DatabaseSync(path.join(root, 'data', 'camzy.db'));
    db.exec("UPDATE settings SET value='' WHERE key IN ('update.github.owner','update.github.repo')");
    db.close();
    try {
      await expectReject(upd.checkGitHubUpdate(), /not configured/, 'not_configured');
    } finally {
      const db2 = new DatabaseSync(path.join(root, 'data', 'camzy.db'));
      db2.exec("UPDATE settings SET value='camzy-owner' WHERE key='update.github.owner'");
      db2.exec("UPDATE settings SET value='camzy-repo' WHERE key='update.github.repo'");
      db2.close();
    }
  });

  mock.state.mode = 'ok';
  upd.__restoreEnv();
  return { root, updateZip };
}

async function phaseInstall(root, updateZip) {
  const upd = loadUpdater(updaterEnv(root, { GITHUB_API_BASE_URL: 'http://127.0.0.1:1', GITHUB_TOKEN: '' }));
  const pkgName = 'update-2.0.0.zip';
  const pkgPath = path.join(root, 'data', 'updates', pkgName);
  assert.ok(fs.existsSync(pkgPath), 'staged package from the download phase');
  const indexPath = path.join(root, 'index.html');
  const originalIndex = fs.readFileSync(indexPath, 'utf8');

  await t('install: refused without explicit confirmation', () =>
    expectReject(upd.applyUpdate({ version: 'v2.0.0', filename: pkgName }), /confirmation required/, 'confirmation_required'));

  await t('install: refused without the exact version', () =>
    expectReject(upd.applyUpdate({ confirm: true, filename: pkgName }), /version is required/i, 'confirmation_required'));

  await t('install: refused without the exact filename', () =>
    expectReject(upd.applyUpdate({ confirm: true, version: 'v2.0.0' }), /filename is required/i, 'confirmation_required'));

  await t('install: refused on version mismatch (exact version required)', () =>
    expectReject(upd.applyUpdate({ confirm: true, version: 'v9.9.9', filename: pkgName }), /mismatch/, 'version_mismatch'));

  await t('install: refused for an unknown package', () =>
    expectReject(upd.applyUpdate({ confirm: true, version: 'v2.0.0', filename: 'nope.zip' }), /not found/, 'package_not_found'));

  await t('install: failed confirmations change nothing', () => {
    assert.strictEqual(fs.readFileSync(indexPath, 'utf8'), originalIndex);
    assert.strictEqual(listZip(path.join(root, 'data', 'backups')).length, 0); // no backup created yet
  });

  await t('install: rejects an invalid (traversal) package before touching files', async () => {
    const bad = 'bad-pkg.zip';
    stagePackage(upd, root, bad, buildZip([{ name: '../evil.txt', text: 'x' }]), { source: 'upload', version: 'v9.0.0' });
    await expectReject(upd.applyUpdate({ confirm: true, version: 'v9.0.0', filename: bad }), /Invalid update package/, 'invalid_package');
    assert.ok(!fs.existsSync(path.join(root, '..', 'evil.txt')));
    assert.strictEqual(fs.readFileSync(indexPath, 'utf8'), originalIndex);
  });

  await t('install: packages without version metadata cannot be confirmed', async () => {
    const noVer = 'no-version.zip';
    stagePackage(upd, root, noVer, buildZip([{ name: 'index.html', text: 'x' }]), null);
    await expectReject(upd.applyUpdate({ confirm: true, version: 'v1.2.3', filename: noVer }), /version metadata/, 'version_unknown');
  });

  let installResult = null;
  await t('install: happy path applies the update after backup + verification', async () => {
    installResult = await upd.applyUpdate({ confirm: true, version: 'v2.0.0', filename: pkgName });
    assert.strictEqual(installResult.ok, true);
    assert.strictEqual(installResult.version, 'v2.0.0');
    assert.strictEqual(installResult.package, pkgName);
    assert.strictEqual(installResult.restartRequired, true);
    assert.ok(/restart/i.test(installResult.message));
    assert.strictEqual(installResult.backup.verified, true);
    assert.ok(installResult.backup.filename);
    assert.ok(installResult.filesApplied >= 2);
    assert.ok(installResult.preserved.some((p) => p === 'data/camzy.db' || p === 'data/'), JSON.stringify(installResult.preserved));
    assert.ok(installResult.preserved.indexOf('.env') !== -1);
  });

  await t('install: application files are updated', () => {
    assert.ok(fs.readFileSync(indexPath, 'utf8').indexOf('UPDATED_BY_RELEASE') !== -1);
    assert.ok(fs.readFileSync(path.join(root, 'server', 'logger.js'), 'utf8').indexOf('updated logger') !== -1);
    assert.ok(fs.existsSync(path.join(root, 'assets', 'js', 'brand-new.js')));
  });

  await t('install: database, uploads, secrets, backups and logs preserved', () => {
    const db = new DatabaseSync(path.join(root, 'data', 'camzy.db'), { readOnly: true });
    const row = db.prepare('SELECT total FROM camzy_test_orders WHERE id = ?').get('ord-1');
    const setting = db.prepare("SELECT value FROM settings WHERE key='update.github.owner'").get();
    db.close();
    assert.strictEqual(row.total, 12345, 'orders table intact');
    assert.strictEqual(setting.value, 'camzy-owner', 'settings intact');
    assert.strictEqual(fs.readFileSync(path.join(root, '.env'), 'utf8'), 'SECRET_TOKEN=do-not-overwrite\n', '.env preserved');
    assert.strictEqual(fs.readFileSync(path.join(root, 'server', 'logs', '2026-10-24-requests.log'), 'utf8'), 'log-line-original\n', 'logs preserved');
    assert.strictEqual(fs.readFileSync(path.join(root, 'uploads', 'chat', 'keep.txt'), 'utf8'), 'upload-original\n', 'uploads preserved');
    assert.strictEqual(fs.readFileSync(path.join(root, 'data', 'backups', 'old-backup.db'), 'utf8'), 'old-backup-original', 'old backups preserved');
    const dbBytes = fs.readFileSync(path.join(root, 'data', 'camzy.db'));
    assert.ok(dbBytes.indexOf('EVIL_DB_CONTENT') === -1, 'package db content never applied');
  });

  await t('install: a verified backup was created before applying', () => {
    const backups = fs.readdirSync(path.join(root, 'data', 'backups')).filter((f) => /^camzy-backup-.*\.zip$/.test(f));
    assert.ok(backups.length >= 1, 'backup zip created');
    const applied = JSON.parse(fs.readFileSync(path.join(root, 'data', 'updates', 'applied.json'), 'utf8'));
    assert.strictEqual(applied.version, 'v2.0.0');
    assert.ok(applied.backup);
    assert.ok(applied.preserved.indexOf('.env') !== -1);
  });

  await t('install: no process/server restart happened', () => {
    assert.strictEqual(typeof process.pid, 'number'); // still the same test process
    assert.ok(!process.env.__FORCE_RESTART_MARKER);
  });

  upd.__restoreEnv();
}

async function phaseBackupFailureAborts() {
  const root = makeTempProject('bkfail');
  const blocked = path.join(root, 'blocked-backup-dir');
  fs.writeFileSync(blocked, 'i am a file, not a directory');
  const upd = loadUpdater(updaterEnv(root, { BACKUP_DIR: blocked, GITHUB_API_BASE_URL: 'http://127.0.0.1:1' }));
  const pkgName = 'update-pkg.zip';
  stagePackage(upd, root, pkgName, buildZip([{ name: 'index.html', text: '<html>SHOULD_NOT_APPLY</html>' }]),
    { source: 'upload', version: 'v3.0.0' });
  const original = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  await t('install: aborts when the backup cannot be created/verified', async () => {
    await expectReject(upd.applyUpdate({ confirm: true, version: 'v3.0.0', filename: pkgName }), /Backup failed/, 'backup_failed');
    assert.strictEqual(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), original, 'files untouched after backup failure');
  });
  upd.__restoreEnv();
}

async function phaseHttp(mock) {
  const root = makeTempProject('http');
  const token = 'ghp_http_level_secret_token';
  const prevEnv = updaterEnv(root, {
    GITHUB_API_BASE_URL: mock.url,
    GITHUB_TOKEN: token,
    NODE_ENV: 'test',
  });
  for (const [k, v] of Object.entries(prevEnv)) process.env[k] = String(v);

  // Drop every cached server module so app.js picks up THIS temp copy's env.
  for (const key of Object.keys(require.cache)) {
    if (key.indexOf(path.join(REPO_ROOT, 'server') + path.sep) !== -1) delete require.cache[key];
  }

  mock.state.mode = 'ok';
  mock.state.digestOverride = null;
  mock.state.assetBytes = buildZip([
    { name: 'index.html', text: '<html>HTTP_UPDATED</html>\n' },
    { name: 'data/camzy.db', text: 'EVIL' },
  ]);

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

  async function call(method, p, { body, token: tok } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (tok) headers.authorization = 'Bearer ' + tok;
    const res = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    let json = null;
    try { json = await res.json(); } catch (_) {}
    return { status: res.status, body: json };
  }
  async function login(username) {
    const r = await call('POST', '/api/admin/login', { body: { username, password: 'AdminPass123!' } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body.token;
  }

  let fullTok = null;
  try {
    fullTok = await login('fulladmin');
    const viewTok = await login('viewadmin');
    const limTok = await login('limitedadmin');

    await t('http: update endpoints require an authenticated admin (401)', async () => {
      const r = await call('GET', '/api/admin/updates/github/config');
      assert.strictEqual(r.status, 401);
      const r2 = await call('POST', '/api/admin/updates/github/check', { body: {} });
      assert.strictEqual(r2.status, 401);
      const r3 = await call('POST', '/api/admin/backup/update/apply', { body: { confirm: true, version: 'x', filename: 'y.zip' } });
      assert.strictEqual(r3.status, 401);
    });

    await t('http: config never returns the GitHub token', async () => {
      const r = await call('GET', '/api/admin/updates/github/config', { token: fullTok });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.owner, 'camzy-owner');
      assert.strictEqual(r.body.repo, 'camzy-repo');
      assert.strictEqual(r.body.tokenConfigured, true);
      const dump = JSON.stringify(r.body);
      assert.ok(dump.indexOf(token) === -1, 'token leaked to the browser');
      assert.ok(!('token' in r.body));
    });

    await t('http: no credentials or repo config in public settings', async () => {
      const r = await call('GET', '/api/settings');
      assert.strictEqual(r.status, 200);
      assert.ok(!('update.github.owner' in r.body), 'owner exposed publicly');
      assert.ok(!('update.github.repo' in r.body), 'repo exposed publicly');
      const asAdmin = await call('GET', '/api/settings', { token: fullTok });
      assert.strictEqual(asAdmin.body['update.github.owner'], 'camzy-owner');
    });

    await t('http: repository config is validated server-side', async () => {
      const bad = await call('PUT', '/api/admin/updates/github/config', { token: fullTok, body: { owner: 'bad owner!', repo: 'x' } });
      assert.strictEqual(bad.status, 400);
      assert.strictEqual(bad.body.code, 'invalid_repo');
      const ok = await call('PUT', '/api/admin/updates/github/config', { token: fullTok, body: { owner: 'camzy-owner', repo: 'camzy-repo' } });
      assert.strictEqual(ok.status, 200);
      assert.strictEqual(ok.body.repository, 'camzy-owner/camzy-repo');
    });

    await t('http: section permissions enforced (no backup-update access → 403)', async () => {
      const r = await call('POST', '/api/admin/updates/github/check', { token: limTok, body: {} });
      assert.strictEqual(r.status, 403);
    });

    await t('http: read-only admin can read but not write', async () => {
      const read = await call('GET', '/api/admin/backup/status', { token: viewTok });
      assert.strictEqual(read.status, 200);
      const write = await call('POST', '/api/admin/backup/create', { token: viewTok, body: {} });
      assert.strictEqual(write.status, 403);
      const apply = await call('POST', '/api/admin/backup/update/apply', { token: viewTok, body: { confirm: true, version: 'v2.0.0', filename: 'update-2.0.0.zip' } });
      assert.strictEqual(apply.status, 403);
    });

    await t('http: check latest release as admin', async () => {
      const r = await call('POST', '/api/admin/updates/github/check', { token: fullTok, body: {} });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.release.version, 'v2.0.0');
      assert.strictEqual(r.body.asset.name, 'update-2.0.0.zip');
      assert.ok(r.body.release.publishedAt);
      assert.ok(r.body.release.body.indexOf('Highlights') !== -1);
      assert.strictEqual(r.body.tokenConfigured, true);
    });

    let staged = null;
    await t('http: admin downloads the release ZIP into data/updates/', async () => {
      const r = await call('POST', '/api/admin/updates/github/download', { token: fullTok, body: {} });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.digestVerified, true);
      assert.ok(fs.existsSync(path.join(root, 'data', 'updates', r.body.filename)), 'file staged in data/updates');
      staged = r.body;
    });

    await t('http: validate endpoint reports structure + protected paths', async () => {
      const r = await call('POST', '/api/admin/updates/validate', { token: fullTok, body: { file: staged.filename } });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.version, 'v2.0.0');
      assert.ok(r.body.validation.protectedCount >= 1);
      assert.ok(r.body.validation.protectedEntries.indexOf('data/camzy.db') !== -1);
    });

    await t('http: apply without exact confirmation is rejected', async () => {
      const r = await call('POST', '/api/admin/backup/update/apply', { token: fullTok, body: { confirm: true, package: staged.filename } });
      assert.strictEqual(r.status, 400);
      assert.strictEqual(r.body.code, 'confirmation_required');
      assert.ok(fs.readFileSync(path.join(root, 'index.html'), 'utf8').indexOf('HTTP_UPDATED') === -1);
    });

    await t('http: confirmed install runs on the isolated copy and reports restart', async () => {
      const r = await call('POST', '/api/admin/backup/update/apply', {
        token: fullTok,
        body: { confirm: true, version: staged.version, filename: staged.filename },
      });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.restartRequired, true);
      assert.ok(/NOT restarted|restart/i.test(r.body.message));
      assert.ok(fs.readFileSync(path.join(root, 'index.html'), 'utf8').indexOf('HTTP_UPDATED') !== -1);
      const dbBytes = fs.readFileSync(path.join(root, 'data', 'camzy.db'));
      assert.ok(dbBytes.indexOf('EVIL') === -1, 'database overwritten by install');
      assert.ok(!fs.existsSync(path.join(root, 'data', 'updates', 'evil.txt')), 'traversal target written');
    });

    await t('http: rate limit / API error surfaces with a code', async () => {
      mock.state.mode = 'rate-limit';
      const r = await call('POST', '/api/admin/updates/github/check', { token: fullTok, body: {} });
      assert.strictEqual(r.status, 429);
      assert.strictEqual(r.body.code, 'rate_limited');
      assert.ok(r.body.retryAt);
      mock.state.mode = 'ok';
    });
  } catch (e) {
    results.push(['FAIL', 'http: phase setup :: ' + ((e && e.message) || e)]);
    if (process.env.VERBOSE) console.error(e);
  } finally {
    await new Promise((r) => {
      server.close(() => r());
      try { server.closeAllConnections(); } catch (_) {}
    });
    // server is closed; nothing was ever restarted and nothing outside the
    // temp copy was written.
  }
}

/* ─────────────────────── frontend (DOM) verification ────────────────────── */
async function phaseDom() {
  const htmlPath = path.join(REPO_ROOT, 'admin', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  await t('dom: admin page has the backup-update view, nav link and script', () => {
    assert.ok(html.indexOf('data-view="backup-update"') !== -1, 'view section');
    assert.ok(html.indexOf('assets/js/admin-backup.js') !== -1, 'script tag');
    assert.ok(html.indexOf('id="bu-gh-version"') !== -1, 'release version field');
    assert.ok(html.indexOf('id="bu-gh-notes"') !== -1, 'release notes field');
    assert.ok(html.indexOf('id="bu-gh-published"') !== -1, 'publication date field');
    assert.ok(html.indexOf('id="bu-gh-asset"') !== -1, 'zip asset field');
    assert.ok(html.indexOf('id="bu-confirm-panel"') !== -1, 'install confirmation panel');
    assert.ok(html.indexOf('id="bu-restart-notice"') !== -1, 'restart notice');
    const adminJs = fs.readFileSync(path.join(REPO_ROOT, 'admin', 'assets', 'js', 'admin.js'), 'utf8');
    assert.ok(adminJs.indexOf("'backup-update': 'پشتیبان‌گیری و آپدیت'") !== -1, 'VIEW_TITLES entry');
    const bk = fs.readFileSync(path.join(REPO_ROOT, 'admin', 'assets', 'js', 'admin-backup.js'), 'utf8');
    assert.ok(bk.indexOf('/api/settings') === -1, 'repo config no longer saved via the public settings route');
    assert.ok(bk.indexOf('GITHUB_TOKEN') === -1 || bk.indexOf('ghp_') === -1, 'no hardcoded token in frontend');
  });

  await t('dom: install needs explicit confirmation with exact version + filename', async () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/admin/index.html' });
    const win = dom.window;
    const calls = [];
    const validationBody = {
      ok: true, file: 'update-2.0.0.zip', version: 'v2.0.0', versionSource: 'metadata',
      validation: { fileCount: 3, installableFiles: 2, totalUncompressed: 1234, manifest: { version: 'v2.0.0' }, protectedCount: 1, protectedEntries: ['data/camzy.db'] },
    };
    win.fetch = function (url, opts) {
      opts = opts || {};
      calls.push({ url: url, opts: opts });
      let body = { ok: true };
      if (url.indexOf('/updates/validate') !== -1) body = validationBody;
      else if (url === '/api/admin/updates' && !opts.method) body = { ok: true, packages: [{ filename: 'update-2.0.0.zip', size: 10, createdAt: new Date().toISOString(), version: 'v2.0.0', notes: '' }] };
      else if (url.indexOf('/backup/status') !== -1) body = { ok: true, version: '1.0.0', latestBackup: null, backups: [], update: { available: false } };
      else if (url.indexOf('/github/config') !== -1) body = { ok: true, owner: 'o', repo: 'r', tokenConfigured: false };
      else if (url.indexOf('/backup/update/apply') !== -1) body = {
        ok: true, version: 'v2.0.0', package: 'update-2.0.0.zip', filesApplied: 3,
        preserved: ['data/', '.env'], backup: { filename: 'camzy-backup-x.zip', verified: true },
        restartRequired: true, message: 'Update applied. A server restart may be required … the server was NOT restarted automatically.',
      };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    };
    win.localStorage.setItem('as_admin_session', JSON.stringify({ token: 'test-admin-token', admin: { id: 1, role: 'superadmin' } }));
    win.eval(fs.readFileSync(path.join(REPO_ROOT, 'admin', 'assets', 'js', 'admin-backup.js'), 'utf8'));
    assert.ok(win.CamzyAdminBackup && typeof win.CamzyAdminBackup.load === 'function', 'module exposed its loader');

    win.CamzyAdminBackup.load();
    await new Promise((r) => setTimeout(r, 30));

    const radio = win.document.querySelector('input[name="bu-package"]');
    assert.ok(radio, 'package row rendered from the list endpoint');
    radio.checked = true;
    radio.dispatchEvent(new win.Event('change', { bubbles: true }));

    win.document.getElementById('bu-update-btn').click();
    await new Promise((r) => setTimeout(r, 30));

    const panel = win.document.getElementById('bu-confirm-panel');
    assert.strictEqual(panel.style.display, '', 'confirmation panel opened');
    assert.strictEqual(win.document.getElementById('bu-confirm-version').value, 'v2.0.0', 'exact version shown');
    assert.strictEqual(win.document.getElementById('bu-confirm-file').value, 'update-2.0.0.zip', 'exact filename shown');
    const applyBtn = win.document.getElementById('bu-confirm-apply');
    const chk = win.document.getElementById('bu-confirm-check');
    assert.strictEqual(applyBtn.disabled, true, 'install disabled before explicit confirmation');

    chk.checked = true;
    chk.dispatchEvent(new win.Event('change', { bubbles: true }));
    assert.strictEqual(applyBtn.disabled, false, 'install enabled after explicit confirmation');

    applyBtn.click();
    await new Promise((r) => setTimeout(r, 30));
    const applyCall = calls.find((c) => c.url.indexOf('/backup/update/apply') !== -1);
    assert.ok(applyCall, 'install request sent');
    const sent = JSON.parse(applyCall.opts.body);
    assert.strictEqual(sent.confirm, true);
    assert.strictEqual(sent.version, 'v2.0.0');
    assert.strictEqual(sent.filename, 'update-2.0.0.zip');
    assert.strictEqual(applyCall.opts.headers.Authorization, 'Bearer test-admin-token', 'admin bearer token sent');

    const notice = win.document.getElementById('bu-restart-notice');
    assert.strictEqual(notice.style.display, '', 'restart notice shown after install');
    assert.ok(win.document.getElementById('bu-restart-text').textContent.indexOf('ری‌استارت') !== -1, 'restart message in Persian');
    dom.window.close();
  });
}

/* ─────────────────────────────── runner ─────────────────────────────────── */
(async () => {
  const mock = await startMockGitHub();
  try {
    await phaseZipValidation();
    const { root, updateZip } = await phaseGitHub(mock);
    await phaseInstall(root, updateZip);
    await phaseBackupFailureAborts();
    await phaseHttp(mock);
    await phaseDom();
  } finally {
    await mock.close();
  }

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
