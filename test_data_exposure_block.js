/* Emergency fix regression: database files under /data/ must not be reachable.
 * Status-only checks (HEAD): no response body is read, no DB contents downloaded.
 * Isolated: temp DB via DB_PATH, ephemeral port. No live data touched.
 * Run: node test_data_exposure_block.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datablock-test-'));
process.env.DB_PATH = path.join(tmpDir, 'block.db');

const app = require('./server/app');

function head(port, rawPath) {
  return new Promise((resolve, reject) => {
    const r = http.request(
      { host: '127.0.0.1', port, path: rawPath, method: 'HEAD' },
      (res) => {
        // Drain without buffering content; HEAD must carry no body anyway.
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      }
    );
    r.on('error', reject);
    r.end();
  });
}

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log(`PASS: ${name}`); }
  else { failures += 1; console.log(`FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  try {
    const blocked = [
      '/data/camzy.db',
      '/data/camzy.db-wal',
      '/data/camzy.db-shm',
      '/data/store.db',
      '/DATA/ABZAR-SHOKRI.DB',
      '/%64ata/camzy.db',
      '/data/camzy%2edb',
      '/data/camzy%2Edb-wal',
      '/data%2fcamzy.db',
    ];
    for (const u of blocked) {
      const st = await head(port, u);
      check(`blocked ${u} -> 404`, st === 404, `got ${st}`);
    }
    check('GET / -> 200', (await head(port, '/')) === 200, 'storefront unreachable');
    check('GET /api/products?limit=1 -> 200', (await head(port, '/api/products?limit=1')) === 200, 'API unreachable');
  } finally {
    await new Promise((r) => server.close(r));
    try { require('./server/db').getDb().close(); } catch (_) {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(failures === 0 ? 'ALL DATA-BLOCK CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('TEST ERROR', e); process.exit(1); });
