import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond });
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '   [' + detail + ']' : ''));
}

// ── Section 1: Create a guest order ────────────────────────────────────────
console.log('\n── Section 1: create guest order ──');

// Create a guest order (no auth)
const orderResp = await fetch(BASE + '/api/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    items: [{ productId: 1, quantity: 1 }],
    address: 'تهران، خیابان ولیعصر، پلاک ۱۲۳۴',
    paymentMethod: 'online'
  })
});

const order = await orderResp.json();
check('guest order created', orderResp.status === 201, 'status=' + orderResp.status);
check('order has access_token', !!order.accessToken && order.accessToken.length > 0, order.accessToken?.slice(0, 16) + '...');
check('order has no user_id', !order.userId, 'userId=' + order.userId);

const orderId = order.id;
const accessToken = order.accessToken;

// ── Section 2: Guest order access without token ────────────────────────────
console.log('\n── Section 2: guest order access without token ──');

const noTokenResp = await fetch(BASE + '/api/orders/' + orderId);
check('access without token rejected (401)', noTokenResp.status === 401, 'status=' + noTokenResp.status);

const noTokenBody = await noTokenResp.json();
check('error message mentions access token', /access token/i.test(noTokenBody.error || ''), noTokenBody.error);

// ── Section 3: Guest order access with wrong token ──────────────────────────
console.log('\n── Section 3: guest order access with wrong token ──');

const wrongTokenResp = await fetch(BASE + '/api/orders/' + orderId + '?access_token=wrong-token-123');
check('access with wrong token rejected (401)', wrongTokenResp.status === 401, 'status=' + wrongTokenResp.status);

// ── Section 4: Guest order access with correct token ───────────────────────
console.log('\n── Section 4: guest order access with correct token ──');

const correctTokenResp = await fetch(BASE + '/api/orders/' + orderId + '?access_token=' + accessToken);
check('access with correct token allowed', correctTokenResp.status === 200, 'status=' + correctTokenResp.status);

const correctTokenBody = await correctTokenResp.json();
check('order data returned', correctTokenBody.id === orderId, correctTokenBody.id);

// ── Section 5: Payment callback without token ──────────────────────────────
console.log('\n── Section 5: payment callback without token ──');

const callbackNoTokenResp = await fetch(BASE + '/api/orders/' + orderId + '/payment/callback', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ success: true })
});
check('callback without token rejected (401)', callbackNoTokenResp.status === 401, 'status=' + callbackNoTokenResp.status);

// ── Section 6: Payment initiate without token ───────────────────────────────
console.log('\n── Section 6: payment initiate without token ──');

const initiateNoTokenResp = await fetch(BASE + '/api/orders/' + orderId + '/payment/initiate', {
  method: 'POST'
});
check('initiate without token rejected (401)', initiateNoTokenResp.status === 401, 'status=' + initiateNoTokenResp.status);

// ── Section 7: Payment GET without token ───────────────────────────────────
console.log('\n── Section 7: payment GET without token ──');

const paymentGetNoTokenResp = await fetch(BASE + '/api/orders/' + orderId + '/payment');
check('payment GET without token rejected (401)', paymentGetNoTokenResp.status === 401, 'status=' + paymentGetNoTokenResp.status);

// ── Section 8: Authenticated customer cannot access guest order ────────────
console.log('\n── Section 8: authenticated customer cannot access guest order ──');

// Register a new customer (use unique mobile to avoid conflict)
const uniqueMobile = '0912' + Date.now().toString().slice(-7);
const regResp = await fetch(BASE + '/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    firstName: 'Test',
    lastName: 'User',
    mobile: uniqueMobile,
    password: 'testpass123'
  })
});
const regData = await regResp.json();
check('customer registered', regResp.status === 201, 'status=' + regResp.status);

// Try to access guest order with customer token
const customerAccessResp = await fetch(BASE + '/api/orders/' + orderId, {
  headers: { 'Authorization': 'Bearer ' + regData.token }
});
check('customer cannot access guest order (403)', customerAccessResp.status === 403, 'status=' + customerAccessResp.status);

// ── Section 9: Payment callback with correct token (STUB flow) ─────────────
console.log('\n── Section 9: payment callback with correct token ──');

// First initiate payment to get authority
const initiateResp = await fetch(BASE + '/api/orders/' + orderId + '/payment/initiate?access_token=' + accessToken, {
  method: 'POST'
});
check('initiate with token allowed', initiateResp.status === 201, 'status=' + initiateResp.status);

const initiateData = await initiateResp.json();
check('payment authority returned', !!initiateData.authority, initiateData.authority?.slice(0, 16) + '...');

// Now call callback with correct token and authority
const callbackResp = await fetch(BASE + '/api/orders/' + orderId + '/payment/callback?access_token=' + accessToken, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ success: true, authority: initiateData.authority })
});
check('callback with token allowed', callbackResp.status === 200, 'status=' + callbackResp.status);

const callbackData = await callbackResp.json();
check('payment status is paid', callbackData.paymentStatus === 'paid', callbackData.paymentStatus);

// ── Section 10: Verify access_token not returned in subsequent reads ───────
console.log('\n── Section 10: access_token not returned in subsequent reads ──');

const readResp = await fetch(BASE + '/api/orders/' + orderId + '?access_token=' + accessToken);
const readData = await readResp.json();
check('access_token not in read response', !readData.accessToken, 'accessToken=' + readData.accessToken);

// ── Summary ─────────────────────────────────────────────────────────────────
const failed = results.filter(r => !r.ok);
console.log('\n══════════════════════════════════');
console.log('TOTAL: ' + results.length + '   PASS: ' + (results.length - failed.length) + '   FAIL: ' + failed.length);
failed.forEach(f => console.log('  ✗ ' + f.name));
process.exit(failed.length ? 1 : 0);
