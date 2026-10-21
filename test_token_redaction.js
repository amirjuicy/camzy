/* Token-redaction regression: sensitive query values must never reach log files.
 * Uses only synthetic canary strings (never real credentials) and asserts they
 * are absent from today's log files, while path + status info is preserved.
 * Isolated server (temp DB_PATH, ephemeral port). Run: node test_token_redaction.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redact-test-'));
process.env.DB_PATH = path.join(tmpDir, 'redact.db');

const { redactUrl } = require('./server/logger');

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log(`PASS: ${name}`); }
  else { failures += 1; console.log(`FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

function req(port, method, url) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: url, method }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    r.on('error', reject);
    r.end();
  });
}

async function main() {
  // 1. Unit: redaction keeps structure, drops secrets.
  const cases = [
    ['/api/orders/O1?access_token=SYNTHETIC-CANARY-AAA', 'access_token=[REDACTED]'],
    ['/api/orders/O1?Access_Token=SYNTHETIC-CANARY-BBB', 'Access_Token=[REDACTED]'],
    ['/api/orders/O1?access%5Ftoken=SYNTHETIC-CANARY-CCC', 'access%5Ftoken=[REDACTED]'],
    ['/api/x?token=SYNTHETIC-CANARY-DDD&foo=bar', 'token=[REDACTED]'],
    ['/api/x?password=SYNTHETIC-CANARY-EEE', 'password=[REDACTED]'],
    ['/api/x?payment_authority=SYNTHETIC-CANARY-FFF', 'payment_authority=[REDACTED]'],
    ['/api/x?cardNumber=SYNTHETIC-CANARY-GGG', 'cardNumber=[REDACTED]'],
    ['/api/x?CVV=SYNTHETIC-CANARY-HHH', 'CVV=[REDACTED]'],
  ];
  for (const [input, expectedFrag] of cases) {
    const out = redactUrl(input);
    const canary = input.split('=')[1];
    check(`redact ${input.split('?')[1].split('=')[0]}`, out.includes(expectedFrag) && !out.includes(canary), `got ${out}`);
  }
  const benign = redactUrl('/api/products?limit=1&page=2');
  check('benign query preserved', benign === '/api/products?limit=1&page=2', `got ${benign}`);
  check('no query unchanged', redactUrl('/shop') === '/shop', 'mutated');
  check('non-string passthrough', redactUrl(null) === null && redactUrl(undefined) === undefined, 'mutated');

  // 2. End-to-end: synthetic canary in a real request must not land in log files.
  const CANARY = 'SYNTHETIC-CANARY-ZZZ9';
  const app = require('./server/app');
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const port = server.address().port;
    const st = await req(port, 'GET', `/api/orders/NOPE-ORDER?access_token=${CANARY}`);
    check('canary request logged as 4xx', st === 401 || st === 404, `got ${st}`);
    await new Promise((r) => setTimeout(r, 300));
    const today = new Date().toISOString().slice(0, 10);
    let leaked = false;
    let redactedSeen = false;
    for (const t of ['warnings', 'requests', 'errors', 'security']) {
      const f = path.join(__dirname, 'server', 'logs', `${today}-${t}.log`);
      let text = '';
      try { text = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
      if (text.includes(CANARY)) leaked = true;
      if (text.includes('NOPE-ORDER') && text.includes('[REDACTED]')) redactedSeen = true;
    }
    check('canary token absent from all log files', !leaked, 'LEAKED');
    check('path + [REDACTED] preserved in logs', redactedSeen, 'missing');
  } finally {
    await new Promise((r) => server.close(r));
    try { require('./server/db').getDb().close(); } catch (_) {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(failures === 0 ? 'ALL REDACTION CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('TEST ERROR', e); process.exit(1); });
