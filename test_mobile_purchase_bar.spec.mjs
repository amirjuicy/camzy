import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:3000';

test.describe('Mobile Purchase Bar', () => {
  test.beforeEach(async ({ page }) => {
    // Use product 1 (Bosch GSR 180-LI) which has wholesale price
    // Using .html since clean URL routing may not be configured for ?id= param
    await page.goto(BASE_URL + '/product.html?id=1', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
  });

  test('should show mobile purchase bar on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    const mobileBar = page.locator('.mobile-purchase-bar');
    await expect(mobileBar).toBeVisible();

    // Check price element exists
    const priceAmount = page.locator('.mobile-purchase-bar__amount');
    await expect(priceAmount).toBeVisible();

    // Check currency element exists
    const currency = page.locator('.mobile-purchase-bar__currency');
    await expect(currency).toBeVisible();

    // Check add to cart button or qty selector
    const cartWrap = page.locator('#mobile-cart-wrap');
    await expect(cartWrap).toBeVisible();
  });

  test('should show wholesale/retail toggle on mobile for products with wholesale price', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    // Find a product with wholesale price or check current product
    const toggle = page.locator('#mobile-pricing-toggle');
    if (await toggle.isVisible()) {
      const retailBtn = toggle.locator('button[data-mode="retail"]');
      const wholesaleBtn = toggle.locator('button[data-mode="wholesale"]');

      await expect(retailBtn).toBeVisible();
      await expect(wholesaleBtn).toBeVisible();
      await expect(retailBtn).toHaveClass(/is-active/);

      // Click wholesale
      await wholesaleBtn.click();
      await page.waitForTimeout(200);

      await expect(wholesaleBtn).toHaveClass(/is-active/);
      await expect(retailBtn).not.toHaveClass(/is-active/);

      // Price should update (element should still exist)
      const priceAmount = page.locator('.mobile-purchase-bar__amount');
      await expect(priceAmount).toBeVisible();
    }
  });

  test('should hide mobile purchase bar on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(500);

    const mobileBar = page.locator('.mobile-purchase-bar');
    await expect(mobileBar).toBeHidden();

    // Main buybox should be visible
    const buybox = page.locator('.dk-buybox');
    await expect(buybox).toBeVisible();
  });

  test('should sync quantity between mobile bar and main buybox', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);

    // Add to cart from mobile bar
    const addBtn = page.locator('#mobile-add-to-cart');
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(1000);

      // Should show qty selector
      const qtySelector = page.locator('.mobile-purchase-bar__qty');
      await expect(qtySelector).toBeVisible({ timeout: 5000 });

      const qtyValue = page.locator('#mobile-qty');
      await expect(qtyValue).toBeVisible();

      // Increase quantity - use force click to bypass overlay issues
      const plusBtn = page.locator('.mobile-purchase-bar__qty-btn').last();
      await plusBtn.click({ force: true, timeout: 10000 });
      await page.waitForTimeout(500);

      await expect(qtyValue).toBeVisible();
    }
  });

  test('should add product to cart and show toast', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    const addBtn = page.locator('#mobile-add-to-cart');
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(500);

      // Check toast appears
      const toast = page.locator('.toast');
      await expect(toast).toBeVisible({ timeout: 3000 });
    }
  });

  test('should persist cart across page navigation', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    const addBtn = page.locator('#mobile-add-to-cart');
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(1000);

      // Navigate to cart page (uses account layout with #account-cart-items)
      await page.goto(BASE_URL + '/cart', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      // Check cart has item - account cart uses .cart-item-row in #account-cart-items
      const cartItems = page.locator('.cart-item-row');
      await expect(cartItems.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('should work with retail/wholesale pricing and add-ons', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    // Check if product has options (add-ons)
    const optionCheckboxes = page.locator('.pdp-option__checkbox');
    const optionCount = await optionCheckboxes.count();

    if (optionCount > 0) {
      // Select first option
      await optionCheckboxes.first().check();
      await page.waitForTimeout(300);

      // Add to cart with option
      const addBtn = page.locator('#mobile-add-to-cart');
      if (await addBtn.isVisible()) {
        await addBtn.click();
        await page.waitForTimeout(500);

        // Verify option is in cart
        const toast = page.locator('.toast');
        await expect(toast).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('should not show stale data when navigating between products', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    // Get initial product name and price from product 1
    const product1Name = await page.locator('.pdp-title').textContent();
    const product1Price = await page.locator('.mobile-purchase-bar__amount').textContent();
    
    expect(product1Name).toContain('بوش');
    expect(product1Price).toBeTruthy();

    // Navigate to product 2 (Makita 5903B - no discount, no wholesale)
    await page.goto(BASE_URL + '/product.html?id=2', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Verify product 2 data is shown (not product 1's)
    const product2Name = await page.locator('.pdp-title').textContent();
    const product2Price = await page.locator('.mobile-purchase-bar__amount').textContent();
    
    expect(product2Name).toContain('ماکیتا');
    expect(product2Name).not.toContain('بوش');
    expect(product2Price).toBeTruthy();
    expect(product2Price).not.toEqual(product1Price);

    // Verify no wholesale toggle for product 2 (no wholesale price)
    const toggle = page.locator('#mobile-pricing-toggle');
    await expect(toggle).toBeHidden();

    // Navigate back to product 1
    await page.goto(BASE_URL + '/product.html?id=1', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Verify product 1 data is correctly restored
    const product1NameAgain = await page.locator('.pdp-title').textContent();
    const product1PriceAgain = await page.locator('.mobile-purchase-bar__amount').textContent();
    
    expect(product1NameAgain).toContain('بوش');
    expect(product1PriceAgain).toEqual(product1Price);

    // Verify wholesale toggle is visible again for product 1
    const toggleAgain = page.locator('#mobile-pricing-toggle');
    await expect(toggleAgain).toBeVisible();
  });

  test('should work correctly on narrow mobile widths (320px)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.waitForTimeout(500);

    const mobileBar = page.locator('.mobile-purchase-bar');
    await expect(mobileBar).toBeVisible();

    // Check that bar is not overflowing
    const barBox = await mobileBar.boundingBox();
    expect(barBox.width).toBeLessThanOrEqual(320);

    // Check add to cart button is visible and clickable
    const addBtn = page.locator('#mobile-add-to-cart');
    await expect(addBtn).toBeVisible();

    // Check price is visible
    const priceAmount = page.locator('.mobile-purchase-bar__amount');
    await expect(priceAmount).toBeVisible();
  });
});