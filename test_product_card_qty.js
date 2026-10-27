/*
 * Regression tests for the shared product-card cart control.
 *
 * Covers:
 *  - add-button -> quantity-selector markup swap without changing the box
 *  - + / - changing the real cart quantity
 *  - card display following cart changes made outside the card
 *  - removing the last unit restores the original add button
 *
 * Run with: node test_product_card_qty.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  ({ chromium } = require('@playwright/test'));
}

const ROOT = __dirname;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const FIXTURE = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/assets/css/design-system.css">
  <link rel="stylesheet" href="/assets/css/base.css">
  <link rel="stylesheet" href="/assets/css/components.css">
  <link rel="stylesheet" href="/assets/css/homepage.css">
  <link rel="stylesheet" href="/assets/css/pages.css">
  <link rel="stylesheet" href="/assets/css/desktop.css">
</head>
<body>
  <div style="width:250px;padding:12px">
    <div id="grid"></div>
  </div>
  <script src="/assets/js/data.js"></script>
  <script src="/assets/js/icons.js"></script>
  <script src="/assets/js/common.js"></script>
</body>
</html>`;

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/test-product-card-qty') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(FIXTURE);
      return;
    }
    if (url.pathname.indexOf('/api/') === 0) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
      return;
    }
    const file = path.resolve(ROOT, '.' + decodeURIComponent(url.pathname));
    if (file.indexOf(ROOT) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function waitForApp(page) {
  await page.waitForFunction(() => window.App && typeof window.App.renderProductCard === 'function');
}

async function resetCard(page) {
  await page.evaluate(() => {
    App.clearCart();
    window.__testProduct = AppData.products[0];
    document.getElementById('grid').innerHTML = App.renderProductCard(window.__testProduct);
  });
  await page.waitForSelector('.product-card__add-to-cart');
}

async function box(page, selector) {
  return page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      radius: cs.borderRadius,
      display: cs.display,
    };
  });
}

function assertSameBox(before, after, label) {
  const near = (a, b) => Math.abs(a - b) < 0.6;
  assert(near(before.left, after.left), `${label}: left moved ${before.left} -> ${after.left}`);
  assert(near(before.top, after.top), `${label}: top moved ${before.top} -> ${after.top}`);
  assert(near(before.width, after.width), `${label}: width changed ${before.width} -> ${after.width}`);
  assert(near(before.height, after.height), `${label}: height changed ${before.height} -> ${after.height}`);
  assert.strictEqual(before.radius, after.radius, `${label}: radius changed`);
}

async function cartQuantity(page) {
  return page.evaluate(() => {
    const cart = App.getCart();
    return cart.length ? cart[0].quantity : 0;
  });
}

async function displayedQuantity(page) {
  return page.locator('.product-card__qty-value').textContent();
}

async function run() {
  const server = await startServer();
  const port = server.address().port;
  const launchOptions = { headless: true };
  if (fs.existsSync(CHROME)) launchOptions.executablePath = CHROME;
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const results = [];
  const test = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log('PASS  ' + name);
    } catch (err) {
      results.push({ name, ok: false, err });
      console.log('FAIL  ' + name + '  ' + (err && err.message));
    }
  };

  try {
    await page.goto(`http://127.0.0.1:${port}/test-product-card-qty`, { waitUntil: 'domcontentloaded' });
    await waitForApp(page);

    for (const viewport of [{ width: 1280, height: 720 }, { width: 375, height: 667 }]) {
      await test(`layout stays identical at ${viewport.width}px`, async () => {
        await page.setViewportSize(viewport);
        await resetCard(page);
        const buttonBox = await box(page, '.product-card__add-to-cart');
        const cardBox = await box(page, '.product-card');

        await page.locator('.product-card__add-to-cart').click();
        await page.waitForSelector('.product-card__qty');

        const qtyBox = await box(page, '.product-card__qty');
        const cardAfter = await box(page, '.product-card');
        assertSameBox(buttonBox, qtyBox, 'cart control');
        assert.strictEqual(cardAfter.height, cardBox.height, 'product card height changed');

        assert.strictEqual(await cartQuantity(page), 1, 'add button did not add one unit');
        assert.strictEqual(await displayedQuantity(page), '۱', 'stepper does not show the cart quantity');
      });
    }

    await test('plus/minus update the real cart and the card display', async () => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await resetCard(page);
      await page.locator('.product-card__add-to-cart').click();
      await page.waitForSelector('.product-card__qty');

      await page.locator('.product-card__qty .qty-selector__btn--plus').click();
      assert.strictEqual(await cartQuantity(page), 2, 'plus did not increase the cart');
      assert.strictEqual(await displayedQuantity(page), '۲', 'plus did not refresh the card value');

      await page.locator('.product-card__qty .qty-selector__btn--minus').click();
      assert.strictEqual(await cartQuantity(page), 1, 'minus did not decrease the cart');
      assert.strictEqual(await displayedQuantity(page), '۱', 'minus did not refresh the card value');
    });

    await test('card follows cart changes made outside the card', async () => {
      await page.evaluate(() => {
        App.updateCartQty(App.getCart()[0].key, 2);
      });
      assert.strictEqual(await cartQuantity(page), 3, 'external cart update was not applied');
      assert.strictEqual(await displayedQuantity(page), '۳', 'card did not follow the external cart update');

      await page.evaluate(() => {
        App.addToCart(AppData.products[0].id);
      });
      assert.strictEqual(await cartQuantity(page), 4, 'external add was not applied');
      assert.strictEqual(await displayedQuantity(page), '۴', 'card did not follow the external add');
    });

    await test('zero quantity restores the original add button', async () => {
      for (const expected of ['۳', '۲', '۱']) {
        await page.locator('.product-card__qty .qty-selector__btn--minus').click();
        assert.strictEqual(await displayedQuantity(page), expected, 'unexpected quantity before reaching zero');
      }
      await page.locator('.product-card__qty .qty-selector__btn--minus').click();
      await page.waitForSelector('.product-card__add-to-cart');
      assert.strictEqual(await page.locator('.product-card__qty').count(), 0, 'stepper is still rendered at zero');
      assert.strictEqual(await cartQuantity(page), 0, 'cart still contains the removed line');
    });

    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      console.error('\n' + failed.length + ' product-card cart test(s) failed.');
      process.exitCode = 1;
    } else {
      console.log('\nAll ' + results.length + ' product-card cart tests passed.');
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
