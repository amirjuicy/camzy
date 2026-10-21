const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://127.0.0.1:3000/product.html?id=1', { waitUntil: 'networkidle' });

  // ensure button present
  await page.waitForSelector('#product-add-to-cart', { timeout: 10000 });

  const stylesOf = (sel) => page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      selector,
      rect: { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height },
      computed: {
        display: cs.display,
        position: cs.position,
        direction: cs.direction,
        width: cs.width,
        minWidth: cs.minWidth,
        maxWidth: cs.maxWidth,
        margin: cs.margin,
        padding: cs.padding,
        justifyContent: cs.justifyContent,
        alignItems: cs.alignItems,
        boxSizing: cs.boxSizing,
        flex: cs.flex,
        flexGrow: cs.flexGrow,
        flexShrink: cs.flexShrink,
        flexBasis: cs.flexBasis,
      }
    };
  }, sel);

  const ancestorsOf = (sel) => page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const out = [];
    let cur = el.parentElement;
    for (let i = 0; i < 6 && cur; i++) {
      const cs = getComputedStyle(cur);
      const r = cur.getBoundingClientRect();
      out.push({
        tag: cur.tagName,
        id: cur.id,
        className: cur.className,
        rect: { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height },
        computed: {
          display: cs.display,
          position: cs.position,
          direction: cs.direction,
          width: cs.width,
          minWidth: cs.minWidth,
          maxWidth: cs.maxWidth,
          margin: cs.margin,
          padding: cs.padding,
          justifyContent: cs.justifyContent,
          alignItems: cs.alignItems,
          boxSizing: cs.boxSizing,
          flex: cs.flex,
        }
      });
      cur = cur.parentElement;
    }
    return out;
  }, sel);

  console.log('=== BEFORE CLICK ===');
  console.log(JSON.stringify(await stylesOf('#product-cart-control'), null, 2));
  console.log(JSON.stringify(await stylesOf('#product-add-to-cart'), null, 2));
  console.log('ANCESTORS of #product-cart-control:', JSON.stringify(await ancestorsOf('#product-cart-control'), null, 2));

  // click
  await page.click('#product-add-to-cart');
  await page.waitForTimeout(200);

  console.log('=== AFTER CLICK ===');
  console.log(JSON.stringify(await stylesOf('#product-cart-control'), null, 2));
  const qty = await stylesOf('.qty-selector--buybox');
  console.log(JSON.stringify(qty, null, 2));
  // the immediate button? none. inspect qty ancestors
  console.log('ANCESTORS of .qty-selector--buybox:', JSON.stringify(await ancestorsOf('.qty-selector--buybox'), null, 2));

  await browser.close();
})();
