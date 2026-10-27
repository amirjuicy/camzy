/* Focused regression tests for the GitHub updater regex fixes.
 * Run: node test_github_updater_regex.js
 *
 * Covers:
 *  - findUpdateAsset() detects camzy-update-1.0.0.zip and does not treat
 *    camzy-update-1.0.0.zip.sha256 as a ZIP
 *  - the source regexes themselves (ZIP match, API URL, extension check/removal)
 *  - the introduced-files walker normalizes Windows separators so protected
 *    directories are still excluded during applyUpdate
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { findUpdateAsset } = require('./server/backup-manager');

const B = String.fromCharCode(92);
const SRC = fs.readFileSync(path.join(__dirname, 'server', 'backup-manager.js'), 'utf8');
const LINES = SRC.split('\n');

function linesContaining(needle) {
  const hits = LINES.filter((l) => l.indexOf(needle) !== -1);
  assert.ok(hits.length, 'source line not found: ' + needle);
  return hits;
}

/* Extracts the first regex literal that opens after `marker`. */
function regexFrom(line, marker) {
  const m = line.indexOf(marker);
  assert.ok(m !== -1, 'marker not found in: ' + line.trim());
  const open = line.indexOf('/', m);
  const close = line.indexOf('/', open + 1);
  assert.ok(open !== -1 && close !== -1, 'regex delimiters not found in: ' + line.trim());
  const flags = line.slice(close + 1).match(/^[a-z]*/)[0];
  return new RegExp(line.slice(open + 1, close), flags);
}

function quotedMembers(line) {
  const inner = line.slice(line.indexOf('[') + 1, line.lastIndexOf(']'));
  return inner.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

let passed = 0;
const failed = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (e) {
    failed.push(name);
    console.log('  FAIL ' + name);
    console.log('       ' + String(e.message).split('\n').join('\n       '));
  }
}

const ZIP = 'camzy-update-1.0.0.zip';
const SHA = 'camzy-update-1.0.0.zip.sha256';
const release = { assets: [
  { name: ZIP, size: 1062269, downloadUrl: 'https://github.com/amirjuicy/camzy/releases/download/v1.0.0/' + ZIP },
  { name: SHA, size: 89, downloadUrl: 'https://github.com/amirjuicy/camzy/releases/download/v1.0.0/' + SHA }
] };

/* ---------- functional: findUpdateAsset ---------- */

test('detects camzy-update-1.0.0.zip', () => {
  const a = findUpdateAsset(release);
  assert.ok(a, 'findUpdateAsset returned null');
  assert.strictEqual(a.name, ZIP);
});

test('detects the ZIP regardless of asset order', () => {
  const reversed = { assets: release.assets.slice().reverse() };
  assert.strictEqual(findUpdateAsset(reversed).name, ZIP);
});

test('the .sha256 companion alone is not mistaken for a ZIP', () => {
  assert.strictEqual(findUpdateAsset({ assets: [{ name: SHA, size: 89 }] }), null, 'sha256 asset must not match');
});

test('exact preferred name honoured; unknown preferred name falls back to the ZIP', () => {
  assert.strictEqual(findUpdateAsset(release, ZIP).name, ZIP);
  assert.strictEqual(findUpdateAsset(release, 'other.zip').name, ZIP);
});

test('release without assets yields no asset', () => {
  assert.strictEqual(findUpdateAsset({}), null);
  assert.strictEqual(findUpdateAsset({ assets: [] }), null);
});

/* ---------- source-level: the regexes themselves ---------- */

test('findUpdateAsset matcher ends with .zip (single escape)', () => {
  const hits = linesContaining('const zips = (release.assets');
  assert.strictEqual(hits.length, 1, 'expected exactly one asset filter');
  const re = regexFrom(hits[0], '.filter(');
  assert.ok(re.test(ZIP), 'must match ' + ZIP);
  assert.ok(!re.test(SHA), 'must not match ' + SHA);
});

test('filename extension checks accept only a real .zip (upload + download paths)', () => {
  const hits = linesContaining("filename += '.zip';");
  assert.ok(hits.length >= 2, 'expected both saveUploadedUpdate and downloadGitHubReleaseAsset checks, got ' + hits.length);
  hits.forEach((line) => {
    const re = regexFrom(line, 'if (!');
    assert.ok(re.test(ZIP), 'must accept ' + ZIP + ' in: ' + line.trim());
    assert.ok(!re.test(SHA), 'must reject ' + SHA + ' in: ' + line.trim());
  });
});

test('timestamped rename strips exactly one .zip', () => {
  const hits = linesContaining("+ '-' + stamp + '.zip';");
  assert.ok(hits.length >= 2, 'expected both timestamped rename sites, got ' + hits.length);
  hits.forEach((line) => {
    const re = regexFrom(line, '.replace(');
    assert.strictEqual(ZIP.replace(re, ''), 'camzy-update-1.0.0', 'strip failed in: ' + line.trim());
    assert.strictEqual(ZIP.replace(re, '') + '-2026.zip', 'camzy-update-1.0.0-2026.zip');
  });
});

test('GitHub API URL matcher matches api.github.com only', () => {
  const line = linesContaining('if (asset.apiUrl && ')[0];
  const re = regexFrom(line, 'asset.apiUrl && ');
  assert.ok(re.test('https://api.github.com/repos/amirjuicy/camzy/releases/assets/674403175'), 'api.github.com must match');
  assert.ok(!re.test('https://uploads.github.com/repos/amirjuicy/camzy/releases/assets/674403175'), 'uploads.github.com must not match');
});

test('no double-escaped dot remains anywhere in the file', () => {
  const needle = B + B + '.';
  const bad = [];
  LINES.forEach((l, i) => {
    let p = l.indexOf(needle);
    while (p !== -1) {
      bad.push((i + 1) + ': ' + l.trim());
      p = l.indexOf(needle, p + 1);
    }
  });
  assert.deepStrictEqual(bad, [], 'double-escaped dot(s) found:' + '\n' + bad.join('\n'));
});

/* ---------- applyUpdate introduced-files walker (line 643) ---------- */

test('introduced-files walker normalizes Windows separators so protected dirs are excluded', () => {
  const line = linesContaining('const rel = path.relative(base, s).replace(')[0];
  const norm = regexFrom(line, '.replace(');

  const rel = path.win32.relative('C:' + B + 'camzy', 'C:' + B + 'camzy' + B + 'data' + B + 'data.sqlite').replace(norm, '/');
  assert.strictEqual(rel, 'data/data.sqlite', 'Windows separators must be normalized to /');

  // Protected dirs are excluded by the walker through isProtectedPath(),
  // whose segment allow-list lives in PROTECTED_UPDATE_SEGMENTS.
  const walkLine = linesContaining('if (isProtectedPath(rel))')[0];
  assert.ok(walkLine, 'the update walker must gate on isProtectedPath()');
  const segLine = linesContaining('const PROTECTED_UPDATE_SEGMENTS = new Set(')[0];
  const excluded = quotedMembers(segLine);
  ['data', 'uploads', 'backups', 'logs', 'node_modules', '.git'].forEach((seg) => {
    assert.ok(excluded.indexOf(seg) !== -1, 'walker exclusion list is missing: ' + seg);
    const r = path.win32.relative('C:' + B + 'camzy', 'C:' + B + 'camzy' + B + seg + B + 'file.txt').replace(norm, '/');
    assert.ok(r.split('/').indexOf(seg) !== -1, seg + ' would NOT be excluded, rel=' + r);
  });

  // The backup walker's own segment list still drops data/log/build dirs.
  const exclLine = linesContaining('const EXCLUDE_DIRS = new Set(')[0];
  const backupExcluded = quotedMembers(exclLine);
  ['data', 'uploads', 'logs', 'node_modules', '.git'].forEach((seg) => {
    assert.ok(backupExcluded.indexOf(seg) !== -1, 'backup walker exclusion list is missing: ' + seg);
  });

  const app = path.win32.relative('C:' + B + 'camzy', 'C:' + B + 'camzy' + B + 'server' + B + 'app.js').replace(norm, '/');
  assert.strictEqual(app, 'server/app.js');
  assert.ok(!app.split('/').some((x) => excluded.indexOf(x) !== -1), 'a normal source file must not be excluded');
});

console.log('');
console.log(passed + ' passed, ' + failed.length + ' failed');
if (failed.length) {
  console.log('failed: ' + failed.join(' | '));
  process.exitCode = 1;
}
