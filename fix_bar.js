const fs = require('fs');
let c = fs.readFileSync('assets/js/product.js', 'utf8');

const cartBlock = `        '<div class="mobile-purchase-bar__cart-wrap" id="mobile-cart-wrap">' +\r\n          '<!-- Rendered by ProductDetail.renderMobileCartControl() -->' +\r\n        '</div>'`;

const priceBlockStart = `        '<div class="mobile-purchase-bar__price-wrap">'`;

const cartIdx = c.indexOf(cartBlock);
const priceIdx = c.indexOf(priceBlockStart);

if (cartIdx === -1 || priceIdx === -1) {
  console.log('Blocks not found. cartIdx:', cartIdx, 'priceIdx:', priceIdx);
  process.exit(1);
}

const afterCart = c.substring(cartIdx + cartBlock.length);
const priceEndMarker = "        '</div>'";
const priceEnd = afterCart.indexOf(priceEndMarker);
if (priceEnd === -1) {
  console.log('Price block end not found');
  process.exit(1);
}

const priceBlock = afterCart.substring(0, priceEnd + priceEndMarker.length);

const before = c.substring(0, cartIdx);
const after = c.substring(cartIdx + cartBlock.length + priceBlock.length);
const result = before + priceBlock + cartBlock + after;

fs.writeFileSync('assets/js/product.js', result);
console.log('Done. Swapped blocks.');
