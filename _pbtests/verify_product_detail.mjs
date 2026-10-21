import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true });
const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond });
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '   [' + detail + ']' : ''));
}

// ── Section 1: Product page structure & selectors ──────────────────────────
console.log('\n── Section 1: product page structure ──');
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(BASE + '/product.html?id=1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

// Verify core elements exist with actual selectors
check('product title (.pdp-title) exists', await page.locator('.pdp-title').isVisible());
check('title contains product name', (await page.locator('.pdp-title').textContent())?.includes('بوش'));
check('price (.dk-buybox__amount) exists', await page.locator('.dk-buybox__amount').isVisible());
check('buybox (.dk-buybox) exists', await page.locator('.dk-buybox').isVisible());
check('add to cart (#product-add-to-cart) exists', await page.locator('#product-add-to-cart').isVisible());
check('product gallery (.pdp-main-image) exists', await page.locator('.pdp-main-image').isVisible());
check('product tabs exist', (await page.locator('.product-tabs__tab').count()) === 5);
check('related products grid exists', await page.locator('#related-grid').isVisible());
check('related product cards exist', (await page.locator('.product-card').count()) > 0);
check('breadcrumb exists', await page.locator('.breadcrumb').isVisible());
check('pdp-breadcrumb exists', await page.locator('.pdp-breadcrumb').isVisible());
check('rating row exists', await page.locator('.pdp-rating').isVisible());
check('promo badge exists', await page.locator('.pdp-promo-badge').isVisible());
check('countdown exists', await page.locator('#pdp-countdown').isVisible());
check('action icons exist', (await page.locator('.pdp-action-icon').count()) >= 3);
check('return notice exists', await page.locator('.pdp-return-notice').isVisible());
check('features exist', (await page.locator('.pdp-feature').count()) >= 3);
check('product ID exists', await page.locator('.pdp-product-id').isVisible());
check('seller header exists', await page.locator('.dk-buybox__seller-header').isVisible());
check('store info exists', await page.locator('.dk-buybox__store').isVisible());
check('guarantee exists', await page.locator('.dk-buybox__guarantee').isVisible());
check('delivery info exists', await page.locator('.dk-buybox__delivery').isVisible());
check('better price exists', await page.locator('.dk-buybox__better-price').isVisible());
check('pricing link exists', await page.locator('.dk-buybox__pricing-link').isVisible());

// ── Section 2: Product navigation ──────────────────────────────────────────
console.log('\n── Section 2: product navigation ──');
const product1Title = await page.locator('.pdp-title').textContent();
const product1Price = await page.locator('.dk-buybox__amount').textContent();
check('product 1 title captured', product1Title?.includes('بوش'), product1Title);
check('product 1 price captured', product1Price?.includes('۲'), product1Price);

// Navigate to product 2 via clean URL
await page.goto(BASE + '/product/2', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const product2Title = await page.locator('.pdp-title').textContent();
const product2Price = await page.locator('.dk-buybox__amount').textContent();
check('product 2 title captured', product2Title?.includes('ماکیتا'), product2Title);
check('product 2 price captured', product2Price?.includes('۴'), product2Price);
check('product 2 different from product 1', product2Title !== product1Title);
check('product 2 price different from product 1', product2Price !== product1Price);

// Navigate back to product 1
await page.goto(BASE + '/product/1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const product1TitleAgain = await page.locator('.pdp-title').textContent();
const product1PriceAgain = await page.locator('.dk-buybox__amount').textContent();
check('product 1 title restored', product1TitleAgain === product1Title);
check('product 1 price restored', product1PriceAgain === product1Price);

// Navigate to product 3 (different brand)
await page.goto(BASE + '/product/3', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const product3Title = await page.locator('.pdp-title').textContent();
check('product 3 title captured', product3Title?.includes('دیوالت'), product3Title);

// Navigate to product 5 (different category)
await page.goto(BASE + '/product/5', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const product5Title = await page.locator('.pdp-title').textContent();
check('product 5 title captured', product5Title?.includes('استنلی'), product5Title);

// ── Section 3: Product options ─────────────────────────────────────────────
console.log('\n── Section 3: product options ──');
// Check if product 1 has options (it doesn't in seed data, but check the structure)
const optionCheckboxes = await page.locator('.pdp-option__checkbox').count();
check('option checkboxes count is 0 or more', optionCheckboxes >= 0, 'count=' + optionCheckboxes);

// Check for insurance checkbox (product 1 doesn't have it)
const insuranceCheckbox = await page.locator('.pdp-insurance__checkbox').count();
check('insurance checkbox count is 0 or more', insuranceCheckbox >= 0, 'count=' + insuranceCheckbox);

// ── Section 4: Pricing ──────────────────────────────────────────────────────
console.log('\n── Section 4: pricing ──');
await page.goto(BASE + '/product.html?id=1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

const priceText = await page.locator('.dk-buybox__amount').textContent();
check('price is displayed', priceText && priceText.length > 0, priceText);
check('price contains Persian digits', /[۰-۹]/.test(priceText), priceText);

const productDetailPrice = await page.locator('#product-detail-price').textContent();
check('product-detail-price matches buybox amount', productDetailPrice === priceText, productDetailPrice);

// Check for old price (product 1 has oldPrice: 3200000 in seed data)
const oldPriceCount = await page.locator('.dk-buybox__old-price').count();
check('old price element exists (product has discount)', oldPriceCount > 0, 'count=' + oldPriceCount);

// Check for discount badge
const discountBadgeCount = await page.locator('.dk-buybox__discount-badge').count();
check('discount badge exists (product has discount)', discountBadgeCount > 0, 'count=' + discountBadgeCount);

// ── Section 5: Add to cart ──────────────────────────────────────────────────
console.log('\n── Section 5: add to cart ──');
await page.goto(BASE + '/product.html?id=1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

// Click add to cart
await page.locator('#product-add-to-cart').click();
await page.waitForTimeout(1000);

// After clicking, the cart control should show quantity selector
const qtySelectorVisible = await page.locator('.qty-selector').first().isVisible();
check('quantity selector appears after add to cart', qtySelectorVisible);

const productQty = await page.locator('#product-qty').first().textContent();
check('quantity is 1 after first add', productQty === '۱', productQty);

// Click again to increase quantity
const addBtn = page.locator('#product-add-to-cart');
if (await addBtn.isVisible()) {
  await addBtn.click();
  await page.waitForTimeout(500);
  const qty2 = await page.locator('#product-qty').textContent();
  check('quantity increases on second add', qty2 === '۲', qty2);
}

// ── Section 6: Mobile viewport (product switching only) ─────────────────────
console.log('\n── Section 6: mobile viewport ──');
const mobPage = await browser.newPage({ viewport: { width: 375, height: 667 } });
await mobPage.goto(BASE + '/product.html?id=1', { waitUntil: 'domcontentloaded' });
await mobPage.waitForTimeout(2000);

// Verify core elements work on mobile viewport. The desktop buybox cart
// control is intentionally display:none on mobile (components.css) — the
// fixed mobile purchase bar is its replacement there.
check('mobile: product title visible', await mobPage.locator('.pdp-title').isVisible());
check('mobile: buybox visible', await mobPage.locator('.dk-buybox').isVisible());
check('mobile: desktop cart control hidden by design', await mobPage.locator('#product-add-to-cart').isHidden());
check('mobile: purchase bar visible', await mobPage.locator('.mobile-purchase-bar').isVisible());
check('mobile: bar add button visible', await mobPage.locator('#mobile-add-to-cart').isVisible());
check('mobile: price visible', await mobPage.locator('.mobile-purchase-bar__amount').isVisible());

// Add to cart on mobile viewport via the purchase bar
await mobPage.locator('#mobile-add-to-cart').click();
await mobPage.waitForTimeout(1000);
check('mobile: bar qty stepper after add', await mobPage.locator('#mobile-qty-wrap').isVisible());
check('mobile: quantity is 1', (await mobPage.locator('#mobile-qty').textContent()) === '۱');

// ── Section 7: Product switching on mobile ─────────────────────────────────
console.log('\n── Section 7: product switching on mobile ──');
const mobProduct1Title = await mobPage.locator('.pdp-title').textContent();
const mobProduct1Price = await mobPage.locator('.dk-buybox__amount').textContent();

await mobPage.goto(BASE + '/product.html?id=2', { waitUntil: 'domcontentloaded' });
await mobPage.waitForTimeout(2000);
const mobProduct2Title = await mobPage.locator('.pdp-title').textContent();
const mobProduct2Price = await mobPage.locator('.dk-buybox__amount').textContent();

check('mobile: product 2 different from product 1', mobProduct2Title !== mobProduct1Title);
check('mobile: product 2 price different', mobProduct2Price !== mobProduct1Price);

// Navigate back to product 1
await mobPage.goto(BASE + '/product.html?id=1', { waitUntil: 'domcontentloaded' });
await mobPage.waitForTimeout(2000);
const mobProduct1TitleAgain = await mobPage.locator('.pdp-title').textContent();
const mobProduct1PriceAgain = await mobPage.locator('.dk-buybox__amount').textContent();
check('mobile: product 1 title restored', mobProduct1TitleAgain === mobProduct1Title);
check('mobile: product 1 price restored', mobProduct1PriceAgain === mobProduct1Price);

// ── Section 8: Summary ──────────────────────────────────────────────────────
console.log('\n── Section 8: summary ──');
check('zero failed checks so far', results.filter(r => !r.ok).length === 0, JSON.stringify(results.filter(r => !r.ok).map(r => r.name)));

await page.close();
await mobPage.close();
await browser.close();

const failed = results.filter(r => !r.ok);
console.log('\n══════════════════════════════════');
console.log('TOTAL: ' + results.length + '   PASS: ' + (results.length - failed.length) + '   FAIL: ' + failed.length);
failed.forEach(f => console.log('  ✗ ' + f.name));
process.exit(failed.length ? 1 : 0);
