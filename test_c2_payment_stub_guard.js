/* C2 regression: unverified callbacks must never mint `paid`; online fulfillment
 * requires verified payment; admin overrides are recorded. COD/card unchanged.
 * Isolated: temp DB via DB_PATH, ephemeral port. No live data touched.
 * Run: node test_c2_payment_stub_guard.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c2-test-'));
process.env.DB_PATH = path.join(tmpDir, 'c2.db');

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

const ORDER_BODY = (paymentMethod) => ({
  address: 'Tehran, Test Street, No 123',
  province: 'Tehran',
  city: 'Tehran',
  postalCode: '1234567890',
  paymentMethod,
  shipping: 0,
  items: [{ productId: 1, quantity: 1, pricingMode: 'retail', options: [] }],
});

async function main() {
  const db = getDb();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  try {
    // Setup: product, user, superadmin, COD enabled.
    db.prepare(`INSERT INTO products (id, name, slug, price, in_stock, stock_count)
      VALUES (1, 'C2 Product', 'c2-product', 100000, 1, 50)`).run();
    const reg = await req(port, 'POST', '/api/auth/register', {
      firstName: 'C2', lastName: 'Test', mobile: '09200000001', password: 'valid-pass-123',
    });
    check('setup register -> 201', reg.status === 201, `got ${reg.status} ${reg.raw}`);
    const userToken = reg.json && reg.json.token;
    const uh = { Authorization: 'Bearer ' + userToken };
    const ahash = bcrypt.hashSync('admin-test-123', 10);
    const ainfo = db.prepare('INSERT INTO admin_users (username, password_hash, name, role) VALUES (?, ?, ?, ?)')
      .run('c2admin', ahash, 'C2 Admin', 'superadmin');
    const adminToken = 'c2admintoken1234567890abcdef';
    db.prepare("INSERT INTO admin_sessions (token, admin_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))")
      .run(adminToken, ainfo.lastInsertRowid);
    const ah = { Authorization: 'Bearer ' + adminToken };
    const set = await req(port, 'PUT', '/api/settings', { 'pay.cod': '1' }, ah);
    check('setup enable COD -> 200', set.status === 200, `got ${set.status} ${set.raw}`);

    // Online order + initiate.
    const o1 = await req(port, 'POST', '/api/orders', ORDER_BODY('online'), uh);
    check('online order -> 201 pending', o1.status === 201 && o1.json.paymentStatus === 'pending', `got ${o1.status} ${o1.raw}`);
    const id1 = o1.json.id;
    const init = await req(port, 'POST', `/api/orders/${id1}/payment/initiate`, {}, uh);
    check('initiate -> 201 authority+amount', init.status === 201 && !!init.json.authority && init.json.amount === o1.json.total,
      `got ${init.status} ${init.raw}`);
    const authority = init.json.authority;

    // T1: forged success with CORRECT authority must NOT mint paid.
    const forged = await req(port, 'POST', `/api/orders/${id1}/payment/callback`, { authority, success: true }, uh);
    check('forged success -> 409 gateway-not-connected', forged.status === 409 && forged.json && forged.json.error === 'gateway-not-connected',
      `got ${forged.status} ${forged.raw}`);
    const st1 = await req(port, 'GET', `/api/orders/${id1}/payment`, undefined, uh);
    check('still pending, no refId/paidAt', st1.json.paymentStatus === 'pending' && st1.json.refId == null && st1.json.paidAt == null,
      `got ${st1.status} ${st1.raw}`);
    const ev1 = await req(port, 'GET', `/api/orders/${id1}/payment/events`, undefined, ah);
    check('verify-skipped event recorded', Array.isArray(ev1.json) && ev1.json.some((e) => e.event === 'verify-skipped'),
      `got ${ev1.status} ${ev1.raw}`);

    // T2: wrong authority -> 403, still pending.
    const wrong = await req(port, 'POST', `/api/orders/${id1}/payment/callback`, { authority: 'WRONG', success: true }, uh);
    check('wrong authority -> 403', wrong.status === 403, `got ${wrong.status} ${wrong.raw}`);
    const st2 = await req(port, 'GET', `/api/orders/${id1}/payment`, undefined, uh);
    check('still pending after wrong authority', st2.json.paymentStatus === 'pending', `got ${st2.status} ${st2.raw}`);

    // T3: repeated callbacks stay 409/pending (no double-mint).
    const rep = await req(port, 'POST', `/api/orders/${id1}/payment/callback`, { authority, success: 'ok' }, uh);
    check('repeated callback -> 409 still pending', rep.status === 409 && (await req(port, 'GET', `/api/orders/${id1}/payment`, undefined, uh)).json.paymentStatus === 'pending',
      `got ${rep.status} ${rep.raw}`);

    // T4: fulfillment blocked for unpaid online order.
    for (const s of ['processing', 'shipped', 'delivered']) {
      const p = await req(port, 'PATCH', `/api/orders/${id1}`, { status: s }, ah);
      check(`unpaid online -> ${s} blocked 409`, p.status === 409, `got ${p.status} ${p.raw}`);
    }

    // T5 (hardened): generic PATCH must NOT mark an online order paid while the
    // gateway is disconnected — standalone, case-variant, or combined with status.
    const ov = await req(port, 'PATCH', `/api/orders/${id1}`, { paymentStatus: 'paid' }, ah);
    check('online paid override standalone -> 409 gateway-not-connected',
      ov.status === 409 && ov.json && ov.json.error === 'gateway-not-connected', `got ${ov.status} ${ov.raw}`);
    const ovUpper = await req(port, 'PATCH', `/api/orders/${id1}`, { payment_status: 'PAID' }, ah);
    check('online paid override case-variant -> 409', ovUpper.status === 409, `got ${ovUpper.status} ${ovUpper.raw}`);
    const st3 = await req(port, 'GET', `/api/orders/${id1}/payment`, undefined, uh);
    check('online still pending after override attempts', st3.json.paymentStatus === 'pending', `got ${st3.status} ${st3.raw}`);
    const ev2 = await req(port, 'GET', `/api/orders/${id1}/payment/events`, undefined, ah);
    check('no admin-payment-override event for blocked online override',
      Array.isArray(ev2.json) && !ev2.json.some((e) => e.event === 'admin-payment-override'),
      `got ${ev2.status} ${ev2.raw}`);
    const proc = await req(port, 'PATCH', `/api/orders/${id1}`, { status: 'processing' }, ah);
    check('unpaid online still cannot enter processing', proc.status === 409, `got ${proc.status} ${proc.raw}`);

    // Combined forged PATCH (paid + processing/shipped in one request) blocked.
    const o2 = await req(port, 'POST', '/api/orders', ORDER_BODY('online'), uh);
    const both = await req(port, 'PATCH', `/api/orders/${o2.json.id}`, { status: 'processing', paymentStatus: 'paid' }, ah);
    check('combined paid+processing -> 409', both.status === 409, `got ${both.status} ${both.raw}`);
    const bothShip = await req(port, 'PATCH', `/api/orders/${o2.json.id}`, { status: 'shipped', payment_status: 'paid' }, ah);
    check('combined paid+shipped -> 409', bothShip.status === 409, `got ${bothShip.status} ${bothShip.raw}`);
    const st4 = await req(port, 'GET', `/api/orders/${o2.json.id}`, undefined, uh);
    check('combined attempt changed nothing', st4.json.status === 'pending' && st4.json.paymentStatus === 'pending',
      `got ${st4.status} ${st4.raw}`);

    // T6: COD flow unchanged (unpaid -> approval -> processing; no online routes).
    const cod = await req(port, 'POST', '/api/orders', ORDER_BODY('cod'), uh);
    check('COD order -> 201 awaiting_order_approval/unpaid',
      cod.status === 201 && cod.json.status === 'awaiting_order_approval' && cod.json.paymentStatus === 'unpaid',
      `got ${cod.status} ${cod.raw}`);
    const codInit = await req(port, 'POST', `/api/orders/${cod.json.id}/payment/initiate`, {}, uh);
    check('COD initiate -> 409 not online', codInit.status === 409, `got ${codInit.status} ${codInit.raw}`);
    const codCb = await req(port, 'POST', `/api/orders/${cod.json.id}/payment/callback`, { authority: 'x', success: true }, uh);
    check('COD callback -> 409 not online', codCb.status === 409, `got ${codCb.status} ${codCb.raw}`);
    const codAp = await req(port, 'PATCH', `/api/orders/${cod.json.id}`, { status: 'approved' }, ah);
    check('COD approved -> 200', codAp.status === 200, `got ${codAp.status} ${codAp.raw}`);
    const codPr = await req(port, 'PATCH', `/api/orders/${cod.json.id}`, { status: 'processing' }, ah);
    check('COD approved -> processing -> 200', codPr.status === 200, `got ${codPr.status} ${codPr.raw}`);
    const codOv = await req(port, 'PATCH', `/api/orders/${cod.json.id}`, { paymentStatus: 'paid' }, ah);
    check('COD paid override still allowed -> 200', codOv.status === 200 && codOv.json.paymentStatus === 'paid',
      `got ${codOv.status} ${codOv.raw}`);
    const codEv = await req(port, 'GET', `/api/orders/${cod.json.id}/payment/events`, undefined, ah);
    check('COD admin-payment-override event recorded',
      Array.isArray(codEv.json) && codEv.json.some((e) => e.event === 'admin-payment-override'),
      `got ${codEv.status} ${codEv.raw}`);

    // T7: card flow unchanged.
    const card = await req(port, 'POST', '/api/orders', ORDER_BODY('card'), uh);
    check('card order -> 201 awaiting_payment_approval',
      card.status === 201 && card.json.status === 'awaiting_payment_approval', `got ${card.status} ${card.raw}`);
    const cardAp = await req(port, 'PATCH', `/api/orders/${card.json.id}`, { status: 'approved' }, ah);
    check('card approved -> 200', cardAp.status === 200, `got ${cardAp.status} ${cardAp.raw}`);
    const cardPr = await req(port, 'PATCH', `/api/orders/${card.json.id}`, { status: 'processing' }, ah);
    check('card approved -> processing -> 200', cardPr.status === 200, `got ${cardPr.status} ${cardPr.raw}`);
  } finally {
    await new Promise((r) => server.close(r));
    try { db.close(); } catch (_) {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(failures === 0 ? 'ALL C2 CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('TEST ERROR', e); process.exit(1); });
