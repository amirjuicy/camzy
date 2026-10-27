'use strict';
/* Tests for the card-to-card payment block in Admin → «جزئیات سفارش»:
 *  - receipt image persisted on the order and shown only to admins
 *  - selected bank card stored at checkout and returned exactly as configured
 *  - public/customer payloads never expose receipt URLs or card selection
 *  - receipt image endpoint: admin-only, no traversal, no unrelated uploads
 *  - clear status when no receipt exists (never a broken image)
 *
 * Runs against an ISOLATED TEMPORARY PROJECT COPY in the OS temp dir. The real
 * project, its database, uploads and any running server are never touched.
 *
 * Run:  node test_admin_order_receipt.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const REPO_ROOT = __dirname;

const results = [];
async function t(name, fn) {
  try { await fn(); results.push(['PASS', name]); }
  catch (e) {
    results.push(['FAIL', name + ' :: ' + ((e && e.message) || e)]);
    if (process.env.VERBOSE) console.error(e);
  }
}

/* 1×1 transparent PNG (valid magic bytes for the receipt upload guard). */
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  Buffer.from('camzy-receipt-bytes')
]);

const PROJECT_COPIES = [];
function makeTempProject(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'camzy-rc-' + label + '-'));
  PROJECT_COPIES.push(root);
  const copy = (rel) => {
    const src = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(src)) return;
    const dst = path.join(root, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.cpSync(src, dst, { recursive: true });
  };
  ['package.json', path.join('admin', 'index.html'), path.join('admin', 'assets', 'js', 'admin-orders.js')].forEach(copy);
  fs.cpSync(path.join(REPO_ROOT, 'server'), path.join(root, 'server'), { recursive: true });
  // The temp copy resolves its own dependencies from the real node_modules
  // (junction — no files are installed or modified).
  try {
    const nm = path.join(REPO_ROOT, 'node_modules');
    if (fs.existsSync(nm)) fs.symlinkSync(nm, path.join(root, 'node_modules'), 'junction');
  } catch (_) {}

  fs.mkdirSync(path.join(root, 'data', 'backups'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data', 'updates'), { recursive: true });
  fs.mkdirSync(path.join(root, 'server', 'logs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'uploads', 'chat'), { recursive: true });
  fs.mkdirSync(path.join(root, 'uploads', 'receipts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'assets', 'images', 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(root, 'uploads', 'chat', 'keep.txt'), 'chat-upload-original');
  return root;
}

function tempEnv(root) {
  return {
    PROJECT_ROOT: root,
    DB_PATH: path.join(root, 'data', 'camzy.db'),
    BACKUP_DIR: path.join(root, 'data', 'backups'),
    UPDATE_DIR: path.join(root, 'data', 'updates'),
    NODE_ENV: 'test'
  };
}

async function call(base, method, p, { body, token, form } = {}) {
  const headers = {};
  if (token) headers.authorization = 'Bearer ' + token;
  let payload;
  if (form) { payload = form; }
  else { headers['content-type'] = 'application/json'; payload = body === undefined ? undefined : JSON.stringify(body); }
  const res = await fetch(base + p, { method, headers, body: payload });
  const ct = res.headers.get('content-type') || '';
  let json = null; let buf = null;
  if (ct.indexOf('application/json') !== -1) { try { json = await res.json(); } catch (_) {} }
  else { buf = Buffer.from(await res.arrayBuffer()); }
  return { status: res.status, body: json, buf, headers: res.headers };
}

(async () => {
  // Safety net: prove this suite never writes into the real project's uploads.
  const realReceiptsDir = path.join(REPO_ROOT, 'uploads', 'receipts');
  const realReceiptsBefore = (() => { try { return fs.readdirSync(realReceiptsDir).sort().join('|'); } catch (_) { return ''; } })();
  const root = makeTempProject('orders');
  for (const [k, v] of Object.entries(tempEnv(root))) process.env[k] = String(v);
  for (const key of Object.keys(require.cache)) {
    if (key.indexOf(path.join(REPO_ROOT, 'server') + path.sep) !== -1) delete require.cache[key];
  }

  let app;
  // Load the TEMP COPY of the server so __dirname-based paths (receipt
  // uploads, logs, icons) resolve inside the temp project — never the real one.
  try { app = require(path.join(root, 'server', 'app.js')); }
  catch (e) {
    results.push(['FAIL', 'setup: temp server/app.js loads :: ' + ((e && e.message) || e)]);
    for (const [s, n] of results) console.log(s + '  ' + n);
    console.log('\n0/' + results.length + ' passed');
    process.exit(1);
  }

  const bcrypt = require('bcryptjs');
  const { getDb } = require('./server/db');
  const db = getDb();
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('pay.card','1'), ('pay.cod','1'), ('order.allow_guest','1')");

  // Purchase-method settings: two configured cards. A is the "default" (first
  // enabled); B is the one the customer will pick.
  db.prepare("INSERT INTO bank_cards (bank_name, card_number, card_holder, sort_order, is_enabled) VALUES (?, ?, ?, ?, 1)")
    .run('بانک ملت', '6104367500000000', 'Ali Rezaii', 0);
  db.prepare("INSERT INTO bank_cards (bank_name, card_number, card_holder, sort_order, is_enabled) VALUES (?, ?, ?, ?, 1)")
    .run('بانک سامان', '6219861000000000', 'Sara Karimi', 1);
  const cardA = db.prepare("SELECT * FROM bank_cards WHERE bank_name = 'بانک ملت'").get();
  const cardB = db.prepare("SELECT * FROM bank_cards WHERE bank_name = 'بانک سامان'").get();

  db.prepare("INSERT INTO products (id, name, slug, price, in_stock, stock_count) VALUES (1, 'Cam Test', 'cam-test', 100000, 1, 50)").run();

  // A card-to-card order from BEFORE this feature: no receipt/card stored.
  db.prepare(`INSERT INTO orders (id, date, status, status_text, total, items_count, payment_method, payment_status, timeline_json)
              VALUES ('ORD-LEGACY', '1404/01/01', 'pending', 'در انتظار تأیید پرداخت', 0, 0, 'card', 'pending', '[]')`).run();

  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;

  async function login(username, permissions) {
    const pw = 'AdminPass123!';
    db.prepare("INSERT INTO admin_users (username, password_hash, name, role, permissions) VALUES (?, ?, ?, ?, ?)")
      .run(username, bcrypt.hashSync(pw, 10), username, permissions ? 'editor' : 'superadmin', permissions ? JSON.stringify(permissions) : null);
    const r = await call(base, 'POST', '/api/admin/login', { body: { username, password: pw } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body.token;
  }

  let fullTok = null;
  try {
    fullTok = await login('rcfull');
    const limitedTok = await login('rclimited', { sections: ['dashboard'], readonly: false });
    const viewTok = await login('rcview', { sections: 'all', readonly: true });

    await t('schema: orders gained receipt_url and selected_card_id (backward compatible)', () => {
      const cols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
      assert.ok(cols.indexOf('receipt_url') !== -1, 'receipt_url column');
      assert.ok(cols.indexOf('selected_card_id') !== -1, 'selected_card_id column');
      const legacy = db.prepare("SELECT receipt_url, selected_card_id FROM orders WHERE id='ORD-LEGACY'").get();
      assert.strictEqual(legacy.receipt_url, null, 'legacy rows stay NULL, never backfilled');
      assert.strictEqual(legacy.selected_card_id, null, 'no guessed historical selection');
    });

    let receiptUrl = null;
    await t('upload: receipt image is stored and its URL returned', async () => {
      const fd = new FormData();
      fd.append('image', new Blob([PNG_BYTES], { type: 'image/png' }), 'receipt.png');
      const r = await call(base, 'POST', '/api/orders/card-receipt', { form: fd });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      assert.ok(/^\/uploads\/receipts\/receipt-[A-Za-z0-9-]+\.png$/.test(r.body.url), 'url: ' + r.body.url);
      receiptUrl = r.body.url;
      const stored = path.join(root, r.body.url.replace(/^\//, ''));
      assert.ok(fs.existsSync(stored), 'file written under uploads/receipts');
    });

    let orderId = null;
    await t('checkout: card order stores the selected card and the receipt URL', async () => {
      const r = await call(base, 'POST', '/api/orders', {
        body: {
          paymentMethod: 'card',
          items: [{ productId: 1, name: 'Cam Test', price: 100000, quantity: 1 }],
          shipping: 0, discount: 0, address: 'Tehran', province: 'Tehran', city: 'Tehran', postalCode: '123456',
          cardId: cardB.id,            // the customer picked B, NOT the default A
          cardReceiptUrl: receiptUrl
        }
      });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      orderId = r.body.id;
      assert.strictEqual(r.body.paymentMethod, 'card');
      // Customer-facing payload must not carry receipt/card data
      const dump = JSON.stringify(r.body);
      assert.ok(dump.indexOf('receiptUrl') === -1, 'receipt URL not returned to the customer');
      assert.ok(dump.indexOf('selectedCard') === -1, 'selected card not returned to the customer');
      const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      assert.strictEqual(row.receipt_url, receiptUrl, 'receipt_url persisted');
      assert.strictEqual(Number(row.selected_card_id), Number(cardB.id), 'selected_card_id persisted');
    });

    await t('checkout: non-card orders ignore card fields (no unrelated data)', async () => {
      const r = await call(base, 'POST', '/api/orders', {
        body: {
          paymentMethod: 'cod',
          items: [{ productId: 1, name: 'Cam Test', price: 100000, quantity: 1 }],
          shipping: 0, discount: 0, address: 'Tehran', cardId: cardA.id, cardReceiptUrl: receiptUrl
        }
      });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(r.body.id);
      assert.strictEqual(row.receipt_url, null, 'COD order stores no receipt');
      assert.strictEqual(row.selected_card_id, null, 'COD order stores no card selection');
    });

    await t('admin list: receipt URL and selected card id are included', async () => {
      const r = await call(base, 'GET', '/api/orders', { token: fullTok });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      const mine = r.body.find((o) => o.id === orderId);
      assert.ok(mine, 'order present');
      assert.strictEqual(mine.receiptUrl, receiptUrl, 'receiptUrl on admin payload');
      assert.strictEqual(Number(mine.selectedCardId), Number(cardB.id), 'selectedCardId on admin payload');
      const legacy = r.body.find((o) => o.id === 'ORD-LEGACY');
      assert.strictEqual(legacy.receiptUrl, null, 'legacy receipt null');
      assert.strictEqual(legacy.selectedCardId, null, 'legacy card null');
    });

    await t('admin detail: exactly the card the customer selected (never the default)', async () => {
      const r = await call(base, 'GET', '/api/orders/' + orderId, { token: fullTok });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.receiptUrl, receiptUrl, 'receiptUrl present');
      const c = r.body.selectedCard;
      assert.ok(c, 'selectedCard object present');
      assert.strictEqual(c.id, cardB.id);
      assert.strictEqual(c.bankName, 'بانک سامان', 'bank name from purchase-method settings');
      assert.strictEqual(c.cardHolder, 'Sara Karimi', 'saved cardholder name');
      assert.strictEqual(c.cardNumber, '6219861000000000', 'exact card number');
      assert.ok(c.cardNumber.indexOf(cardA.card_number) === -1, 'default card A is NOT substituted');
    });

    await t('admin detail: order without a stored selection reports none (no default card)', async () => {
      const r = await call(base, 'GET', '/api/orders/ORD-LEGACY', { token: fullTok });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.receiptUrl, null);
      assert.strictEqual(r.body.selectedCardId, null);
      assert.strictEqual(r.body.selectedCard, null, 'no guessed/default card');
      assert.ok(!('receiptUrl' in JSON.parse(JSON.stringify({}))), 'sanity');
    });

    await t('privacy: customer-facing order detail never exposes receipt or card', async () => {
      const r = await call(base, 'GET', '/api/orders/' + orderId);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      const dump = JSON.stringify(r.body);
      assert.ok(dump.indexOf('receiptUrl') === -1, 'receiptUrl leaked');
      assert.ok(dump.indexOf('receipt_url') === -1, 'receipt_url leaked');
      assert.ok(dump.indexOf('selectedCard') === -1, 'selectedCard leaked');
      assert.ok(dump.indexOf('selected_card_id') === -1, 'selected_card_id leaked');
    });

    await t('privacy: admin order list requires an admin session (401)', async () => {
      const r = await call(base, 'GET', '/api/orders');
      assert.strictEqual(r.status, 401);
    });

    await t('security: receipt image requires admin authorization', async () => {
      const anon = await call(base, 'GET', '/api/orders/' + orderId + '/receipt');
      assert.strictEqual(anon.status, 401, 'anonymous blocked');
      const limited = await call(base, 'GET', '/api/orders/' + orderId + '/receipt', { token: limitedTok });
      assert.strictEqual(limited.status, 403, 'admin without the orders section blocked');
      const viewer = await call(base, 'GET', '/api/orders/' + orderId + '/receipt', { token: viewTok });
      assert.strictEqual(viewer.status, 200, 'read-only admin may view receipts');
    });

    await t('security: public /uploads/receipts path is not served', async () => {
      const fileName = receiptUrl.split('/').pop();
      const anon = await call(base, 'GET', '/uploads/receipts/' + fileName);
      assert.strictEqual(anon.status, 401, 'public receipt fetch blocked');
      const withTok = await call(base, 'GET', '/uploads/receipts/' + fileName, { token: fullTok });
      assert.strictEqual(withTok.status, 401, 'not exposed via bearer token either');
      const chat = await call(base, 'GET', '/uploads/chat/keep.txt');
      assert.strictEqual(chat.status, 200, 'unrelated static uploads still work');
    });

    await t('security: authorized receipt fetch returns the exact image', async () => {
      const r = await call(base, 'GET', '/api/orders/' + orderId + '/receipt', { token: fullTok });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.headers.get('content-type'), 'image/png');
      assert.ok(/private/.test(r.headers.get('cache-control') || ''), 'no shared caching of receipts');
      assert.ok(r.buf && r.buf.equals(PNG_BYTES), 'exact uploaded bytes served');
    });

    await t('security: path traversal and foreign paths are rejected', async () => {
      const evil = ['/uploads/receipts/../../server/app.js', '/uploads/chat/keep.txt', '/uploads/receipts/../chat/keep.txt', 'receipts/../../data/camzy.db'];
      for (const u of evil) {
        db.prepare('UPDATE orders SET receipt_url = ? WHERE id = ?').run(u, 'ORD-LEGACY');
        const r = await call(base, 'GET', '/api/orders/ORD-LEGACY/receipt', { token: fullTok });
        assert.strictEqual(r.status, 404, 'rejected: ' + u + ' → ' + r.status);
        assert.ok(['no_receipt', 'receipt_missing', 'invalid_receipt_path'].indexOf(r.body && r.body.code) !== -1, 'code for ' + u + ': ' + JSON.stringify(r.body));
      }
      db.prepare('UPDATE orders SET receipt_url = NULL WHERE id = ?').run('ORD-LEGACY');
      // traversal in the URL segment itself never escapes either
      const r2 = await call(base, 'GET', '/api/orders/..%2F..%2Fserver/receipt', { token: fullTok });
      assert.ok(r2.status === 404 || r2.status === 400, 'traversal order id rejected: ' + r2.status);
      assert.strictEqual(fs.readFileSync(path.join(root, 'server', 'app.js'), 'utf8').indexOf('camzy-receipt-bytes'), -1, 'no file overwritten');
    });

    await t('missing receipt: clear status, 404 with a code instead of a broken image', async () => {
      const r = await call(base, 'GET', '/api/orders/ORD-LEGACY/receipt', { token: fullTok });
      assert.strictEqual(r.status, 404);
      assert.strictEqual(r.body.code, 'no_receipt');
      const detail = await call(base, 'GET', '/api/orders/ORD-LEGACY', { token: fullTok });
      assert.strictEqual(detail.body.receiptUrl, null, 'UI can tell there is no receipt');
      // receipt file removed after the order was placed
      const fileName = receiptUrl.split('/').pop();
      const stored = path.join(root, 'uploads', 'receipts', fileName);
      const backup = fs.readFileSync(stored);
      fs.unlinkSync(stored);
      const r2 = await call(base, 'GET', '/api/orders/' + orderId + '/receipt', { token: fullTok });
      assert.strictEqual(r2.status, 404);
      assert.strictEqual(r2.body.code, 'receipt_missing');
      fs.writeFileSync(stored, backup);
    });

    await t('source: admin UI renders receipt + selected card for card orders only', () => {
      const html = fs.readFileSync(path.join(REPO_ROOT, 'admin', 'index.html'), 'utf8');
      const js = fs.readFileSync(path.join(REPO_ROOT, 'admin', 'assets', 'js', 'admin-orders.js'), 'utf8');
      assert.ok(html.indexOf('id="adm-order-modal"') !== -1, 'order detail modal (shared desktop/mobile admin layout)');
      assert.ok(html.indexOf('id="adm-om-body"') !== -1, 'modal body host');
      assert.strictEqual((html.match(/data-view="orders"/g) || []).length >= 1, true, 'orders view section');
      assert.ok(js.indexOf('cardPaymentHtml') !== -1, 'card payment block');
      assert.ok(js.indexOf("paymentMethod !== 'card'") !== -1, 'only card-to-card orders');
      assert.ok(js.indexOf("'/orders/' + encodeURIComponent(o.id) + '/receipt'") !== -1, 'receipt fetched from the admin endpoint');
      assert.ok(js.indexOf("Authorization: 'Bearer ' + t") !== -1, 'receipt fetch carries the admin token');
      assert.ok(js.indexOf('target="_blank"') !== -1, 'clickable full-size preview');
      assert.ok(js.indexOf('رسیدی برای این سفارش ثبت نشده است.') !== -1, 'clear missing-receipt status');
      assert.ok(js.indexOf('وضعیت تأیید پرداخت') !== -1, 'payment verification status');
      assert.ok(js.indexOf('کارت انتخابی مشتری') !== -1, 'selected card label');
      assert.ok(js.indexOf('selectedCard') !== -1 && js.indexOf('selectedCardId') !== -1, 'uses the order-stored selection');
      assert.ok(js.indexOf('پرداخت کارت به کارت') !== -1, 'card-to-card heading');
      assert.ok(js.indexOf("paymentMethod !== 'card'") !== -1, 'other payment methods untouched');
    });
  } catch (e) {
    results.push(['FAIL', 'setup :: ' + ((e && e.message) || e)]);
    if (process.env.VERBOSE) console.error(e);
  } finally {
    await new Promise((r) => { server.close(() => r()); try { server.closeAllConnections(); } catch (_) {} });
  }

  await t('isolation: the real project uploads were never written', () => {
    const now = (() => { try { return fs.readdirSync(realReceiptsDir).sort().join('|'); } catch (_) { return ''; } })();
    assert.strictEqual(now, realReceiptsBefore, 'real uploads/receipts changed');
  });

  const failed = results.filter((r) => r[0] === 'FAIL');
  for (const [status, name] of results) console.log(status + '  ' + name);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  if (!process.env.KEEP_TEMP) {
    for (const dir of PROJECT_COPIES) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
  }
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
