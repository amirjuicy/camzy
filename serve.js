const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

// __dirname is camzy/camzy/ (the project root)
const ROOT = __dirname;

// ── Clean URLs (canonical, no .html): same mapping as server/app.js ──
const CLEAN_DETAIL = {
  '/product.html': { keys: ['slug', 'id'], base: '/product' },
  '/category.html': { keys: ['slug', 'category'], base: '/category' },
  '/brand.html': { keys: ['slug', 'brand'], base: '/brand' },
  '/brand-detail.html': { keys: ['brand', 'slug'], base: '/brand' },
  '/article-detail.html': { keys: ['id', 'slug'], base: '/article' },
  '/page.html': { keys: ['slug'], base: '/page' },
  '/account-order-detail.html': { keys: ['id'], base: '/account/orders' }
};
const CLEAN_PLAIN = {
  '/index.html': '/', '/shop.html': '/shop', '/brands.html': '/brands',
  '/categories.html': '/categories', '/articles.html': '/articles',
  '/login.html': '/login', '/register.html': '/register',
  '/forgot-password.html': '/forgot-password', '/offline.html': '/offline',
  '/account.html': '/account', '/account-cart.html': '/cart',
  '/account-orders.html': '/account/orders', '/account-profile.html': '/account/profile',
  '/account-addresses.html': '/account/addresses', '/account-wishlist.html': '/account/wishlist',
  '/account-notifications.html': '/account/notifications', '/account-contact.html': '/account/contact',
  '/checkout.html': '/checkout',
  '/checkout-step1.html': '/checkout/step1', '/checkout-step2.html': '/checkout/step2',
  '/checkout-step3.html': '/checkout/step3', '/checkout-step4.html': '/checkout/step4',
  '/about.html': '/about', '/contact.html': '/contact', '/faq.html': '/faq',
  '/returns.html': '/returns', '/shipping.html': '/shipping', '/privacy.html': '/privacy',
  '/terms.html': '/terms', '/authenticity.html': '/authenticity', '/pricing.html': '/pricing'
};
const CLEAN_FILES = {
  '/': 'index.html', '/shop': 'shop.html', '/brands': 'brands.html',
  '/categories': 'categories.html', '/articles': 'articles.html',
  '/login': 'login.html', '/register': 'register.html',
  '/forgot-password': 'forgot-password.html', '/offline': 'offline.html',
  '/cart': 'account-cart.html', '/account': 'account.html',
  '/account/orders': 'account-orders.html', '/account/profile': 'account-profile.html',
  '/account/addresses': 'account-addresses.html', '/account/wishlist': 'account-wishlist.html',
  '/account/notifications': 'account-notifications.html', '/account/contact': 'account-contact.html', '/checkout': 'checkout.html',
  '/checkout/step1': 'checkout-step1.html', '/checkout/step2': 'checkout-step2.html',
  '/checkout/step3': 'checkout-step3.html', '/checkout/step4': 'checkout-step4.html',
  '/about': 'about.html', '/contact': 'contact.html', '/faq': 'faq.html',
  '/returns': 'returns.html', '/shipping': 'shipping.html', '/privacy': 'privacy.html',
  '/terms': 'terms.html', '/authenticity': 'authenticity.html', '/pricing': 'pricing.html'
};
function cleanQuery(req) {
  const q = {};
  try { new URL(req.url, 'http://127.0.0.1').searchParams.forEach((v, k) => { q[k] = v; }); } catch (_) {}
  return q;
}
function cleanRedirect(urlPath, query) {
  const enc = (s) => encodeURIComponent(String(s));
  const rest = (drop) => {
    const out = [];
    Object.keys(query).forEach((k) => {
      if (drop.indexOf(k) !== -1) return;
      out.push(enc(k) + '=' + enc(query[k]));
    });
    return out.length ? '?' + out.join('&') : '';
  };
  const d = CLEAN_DETAIL[urlPath];
  if (d) {
    for (const k of d.keys) {
      if (query[k] !== undefined && String(query[k]) !== '') {
        return d.base + '/' + enc(query[k]) + rest([k]);
      }
    }
    return null;
  }
  if (CLEAN_PLAIN[urlPath] !== undefined) return CLEAN_PLAIN[urlPath] + rest([]);
  return null;
}
function cleanFile(urlPath) {
  if (CLEAN_FILES[urlPath]) return CLEAN_FILES[urlPath];
  let m = urlPath.match(/^\/(product|category|brand|article|page)\/[^\/]+\/?$/);
  if (m) return { product: 'product.html', category: 'category.html', brand: 'brand-detail.html', article: 'article-detail.html', page: 'page.html' }[m[1]];
  if (/^\/account\/orders\/[^\/]+\/?$/.test(urlPath)) return 'account-order-detail.html';
  return null;
}

http.createServer((req, res) => {
  let rawUrl = decodeURIComponent(req.url.split('?')[0]);
  const query = cleanQuery(req);
  const redir = cleanRedirect(rawUrl, query);
  if (redir) {
    res.writeHead(301, { Location: redir });
    res.end();
    return;
  }
  let url = cleanFile(rawUrl) || rawUrl;
  const isClean = url !== rawUrl;
  // PWA start_url ("./index.html") and directory launches must always 200
  // inside the app scope — never redirect outside it (an out-of-scope
  // redirect is what makes an installed app fall back to the Chrome UI).
  if (url === '/') url = '/index.html';
  if (url.endsWith('/')) url += 'index.html';
  const fp = path.normalize(path.join(ROOT, url));
  // Block path traversal: stay inside the web root.
  if (!fp.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(fp, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('Not found: ' + url);
      return;
    }
    const ext = path.extname(fp).toLowerCase();
    const ct = MIME[ext] || 'application/octet-stream';
    fs.readFile(fp, (e, data) => {
      if (e) { res.writeHead(500); res.end('Error'); return; }
      // Clean-route pages use relative asset/link URLs: anchor them at site
      // root so nested clean paths (e.g. /product/123) resolve identically.
      if (isClean && ext === '.html' && data.indexOf('<base') === -1) {
        data = Buffer.from(String(data).replace(/<head([^>]*)>/i, '<head$1><base href="/">'));
      }
      // Charset must only be appended to TEXT types. Appending it to
      // binary types (image/png, fonts, ...) corrupts the Content-Type
      // and makes Chrome reject manifest icons -> WebAPK install fails
      // with "This app cannot be installed".
      var isText = /^(text\/|application\/(javascript|json|manifest\+json)|image\/svg\+xml)/.test(ct);
      const headers = { 'Content-Type': isText ? ct + '; charset=utf-8' : ct };
      // Service worker + manifest must never be served stale, otherwise
      // installed clients keep the old (broken) PWA configuration.
      if (url === '/sw.js' || url === '/manifest.webmanifest') {
        headers['Cache-Control'] = 'no-cache';
      }
      // Allow the SW next to index.html to control the whole app scope.
      if (url === '/sw.js') {
        headers['Service-Worker-Allowed'] = '/';
      }
      res.writeHead(200, headers);
      res.end(data);
    });
  });
}).listen(3001, () => console.log('Server at http://localhost:3001 (root: ' + ROOT + ')'));
