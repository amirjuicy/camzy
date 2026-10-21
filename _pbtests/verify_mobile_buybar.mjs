import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond });
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '   [' + detail + ']' : ''));
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const consoleErrors = [];
const pageErrors = [];

// ── Section 1: bar visible on load, single instance, live price ──────────
console.log('\n── Section 1: bar renders on mobile viewport ──');
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.goto(BASE + '/product.html?id=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  check('bar wrapper in DOM', (await page.locator('.mobile-purchase-bar').count()) === 1);
  check('bar visible on mobile', await page.locator('.mobile-purchase-bar').isVisible());
  check('single mobile-add-to-cart button', (await page.locator('#mobile-add-to-cart').count()) === 1);
  check('mobile add button visible before add', await page.locator('#mobile-add-to-cart').isVisible());
  check('qty wrap hidden before add', await page.locator('#mobile-qty-wrap').isHidden());

  const barAmount = await page.locator('.mobile-purchase-bar__amount').textContent();
  const boxAmount = await page.locator('.dk-buybox__amount').first().textContent();
  check('bar price matches buybox price', barAmount === boxAmount, JSON.stringify({ barAmount, boxAmount }));
  check('bar price non-empty', !!(barAmount && barAmount.trim().length), barAmount);

  // Old price / discount shown when the product has them
  const oldCount = await page.locator('.mobile-purchase-bar__old-price').count();
  check('bar shows old price (product 1 discounted)', oldCount === 1, 'count=' + oldCount);
  await ctx.close();
}

// ── Section 2: add-to-cart via the bar ────────────────────────────────────
console.log('\n── Section 2: add to cart from the bar ──');
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.goto(BASE + '/product.html?id=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  await page.locator('#mobile-add-to-cart').click();
  await page.waitForTimeout(1000);

  check('add button hidden after add', await page.locator('#mobile-add-to-cart').isHidden());
  check('qty wrap visible after add', await page.locator('#mobile-qty-wrap').isVisible());
  check('qty is ۱ after first add', (await page.locator('#mobile-qty').textContent()) === '۱');
  check('toast shown after add', await page.locator('.toast').isVisible());
  check('still exactly one bar after add', (await page.locator('.mobile-purchase-bar').count()) === 1);

  const cart = await page.evaluate(() => {
    try { return (window.App && window.App.getCart && window.App.getCart()) || []; }
    catch (e) { return []; }
  });
  check('cart has exactly one line', cart.length === 1, JSON.stringify(cart.map(c => ({ id: c.id, qty: c.quantity }))));
  check('cart line is product 1', cart[0] && cart[0].id === 1, JSON.stringify(cart[0]));
  await ctx.close();
}

// ── Section 3: quantity stepper on the bar + desktop sync ────────────────
console.log('\n── Section 3: bar stepper + desktop sync ──');
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.goto(BASE + '/product.html?id=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  await page.locator('#mobile-add-to-cart').click();
  await page.waitForTimeout(800);

  await page.locator('.mobile-purchase-bar__qty-btn[data-act="inc"]').click();
  await page.waitForTimeout(800);
  check('bar qty is ۲ after inc', (await page.locator('#mobile-qty').textContent()) === '۲');

  // Desktop control reflects the same line
  const deskQty = await page.locator('#product-qty').textContent().catch(() => null);
  check('desktop stepper shows ۲ too', deskQty === '۲', deskQty);

  await page.locator('.mobile-purchase-bar__qty-btn[data-act="dec"]').click();
  await page.waitForTimeout(800);
  check('bar qty back to ۱ after dec', (await page.locator('#mobile-qty').textContent()) === '۱');

  // Desktop stepper drives the bar as well (the desktop cart control is
  // intentionally display:none on mobile — see components.css — so drive it
  // through the same ProductDetail.updateCartQty handler its button uses)
  await page.evaluate(() => window.ProductDetail.updateCartQty(1));
  await page.waitForTimeout(800);
  check('bar qty is ۲ after desktop updateCartQty', (await page.locator('#mobile-qty').textContent()) === '۲');
  await ctx.close();
}

// ── Section 4: options pass-through (where applicable) ───────────────────
console.log('\n── Section 4: option selection reaches the cart ──');
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.goto(BASE + '/product.html?id=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // Inject one add-on option using the existing .pdp-option markup
  await page.evaluate(() => {
    const host = document.querySelector('.pdp-layout__info') || document.body;
    const label = document.createElement('label');
    label.className = 'pdp-option';
    label.setAttribute('data-opt-price', '50000');
    label.innerHTML = '<input type="checkbox" class="pdp-option__checkbox" value="999">' +
      '<span class="pdp-option__details"><span class="pdp-option__name">بسته‌بندی هدیه</span></span>';
    host.appendChild(label);
    label.querySelector('input').checked = true;
  });
  await page.locator('#mobile-add-to-cart').click();
  await page.waitForTimeout(800);

  const line = await page.evaluate(() => {
    try {
      const cart = (window.App && window.App.getCart && window.App.getCart()) || [];
      return cart[0] || null;
    } catch (e) { return null; }
  });
  check('cart line carries the selected option', !!(line && line.options && line.options.length === 1), JSON.stringify(line && line.options));
  check('line price = base + option', line && line.price === line.basePrice + 50000 && line.basePrice === 2850000,
    JSON.stringify({ price: line && line.price, basePrice: line && line.basePrice }));
  await ctx.close();
}

// ── Section 5: second product + reload (no duplicates) ───────────────────
console.log('\n── Section 5: second product and reload ──');
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));

  await page.goto(BASE + '/product.html?id=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const amount1 = await page.locator('.mobile-purchase-bar__amount').textContent();

  await page.goto(BASE + '/product.html?id=2', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  check('bar visible on product 2', await page.locator('.mobile-purchase-bar').isVisible());
  check('single bar on product 2', (await page.locator('.mobile-purchase-bar').count()) === 1);
  const amount2 = await page.locator('.mobile-purchase-bar__amount').textContent();
  check('product 2 bar price differs from product 1', amount2 !== amount1, JSON.stringify({ amount1, amount2 }));

  await page.locator('#mobile-add-to-cart').click();
  await page.waitForTimeout(800);
  check('product 2 added via bar', (await page.locator('#mobile-qty').textContent()) === '۱');

  // Reload: cart persists, bar must re-mount exactly once and show the stepper
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  check('single bar after reload', (await page.locator('.mobile-purchase-bar').count()) === 1);
  check('single mobile-add button node after reload', (await page.locator('#mobile-add-to-cart').count()) <= 1);
  check('stepper restored after reload (qty wrap visible)', await page.locator('#mobile-qty-wrap').isVisible());
  check('restored qty is ۱', (await page.locator('#mobile-qty').textContent()) === '۱');
  await ctx.close();
}

// ── Section 6: desktop unaffected ─────────────────────────────────────────
console.log('\n── Section 6: desktop layout untouched ──');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.goto(BASE + '/product.html?id=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  check('bar hidden on desktop', await page.locator('.mobile-purchase-bar').isHidden());
  check('desktop buybox visible', await page.locator('.dk-buybox').isVisible());
  await page.locator('#product-add-to-cart').click();
  await page.waitForTimeout(800);
  check('desktop stepper appears', await page.locator('#product-cart-control .qty-selector').isVisible());
  await page.locator('#product-cart-control .qty-selector__btn--plus').click();
  await page.waitForTimeout(800);
  check('desktop plus increases qty to ۲', (await page.locator('#product-qty').textContent()) === '۲');
  const deskCart = await page.evaluate(() => {
    try { return (window.App && window.App.getCart && window.App.getCart()) || []; }
    catch (e) { return []; }
  });
  check('desktop cart line qty is 2', deskCart.length === 1 && deskCart[0].quantity === 2, JSON.stringify(deskCart.map(c => c.quantity)));
  await ctx.close();
}

// ── Section 7: console errors ─────────────────────────────────────────────
console.log('\n── Section 7: console errors ──');
const noise = (consoleErrors.concat(pageErrors)).filter(e => !/store-logo|favicon/i.test(e));
check('zero console/page errors', noise.length === 0, JSON.stringify(noise.slice(0, 5)));

await browser.close();
const failed = results.filter(r => !r.ok);
console.log('\n══════════════════════════════════');
console.log('TOTAL: ' + results.length + '   PASS: ' + (results.length - failed.length) + '   FAIL: ' + failed.length);
failed.forEach(f => console.log('  ✗ ' + f.name));
process.exit(failed.length ? 1 : 0);
