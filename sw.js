/* Camzy — Service Worker (basic offline / app-shell)
 *
 * Installability contract (checked in Chrome DevTools → Application):
 * - This file MUST live next to index.html (the site root OR the
 *   deployed subfolder — all URLs below are relative so both work).
 * - It MUST be registered with scope "./" (resolved against the page,
 *   i.e. the folder this file lives in) so it controls every route
 *   (manifest start_url "./index.html" is inside that scope, same origin).
 * - It MUST expose a `fetch` handler (required for the install prompt).
 * - Relative URLs keep the PWA installable when the site is hosted in
 *   a subfolder; absolute "/..." paths would 404 there and break
 *   installability (browser falls back to a plain shortcut).
 */
'use strict';

// v12: assets/js/checkout.js now shares the Add-Address province/city source
// (window.IranCities). Static assets are cache-first, so the version bump is
// required for browsers holding the old checkout.js to pick up the fix.
// v13: Checkout Province/City selectors now reuse the exact Add Address
// custom-dropdown implementation (checkout.html/js + pages.css).
// v14: API responses (/api/*) are network-only — serving them cache-first
// returned stale data (e.g. an old empty GET /api/cart) and broke checkout.
// v15: account dashboard notifications (App.listNotifications + #ac-notifs
// in account.js) were stuck behind the cache-first app-shell: browsers that
// had visited before kept the old account.js/common.js forever and never
// displayed admin-created notifications. Version bump forces re-fetch.
// v16: storefront notification center (header bell + panel + new-item popup
// in common.js, header.css, components.css). Bump so cached shells pick it up.
// v17: dead Bearer token (expired/wiped) auto-recovers to a clean logged-out
// state with a re-login link instead of a stuck "Not authenticated" error;
// plus a stale-repaint guard in the account dashboard.
// v18: dedicated notifications page (account-notifications.html) + «اعلان‌ها»
// sidebar item + «مشاهده بیشتر/همه» links route to it.
// v23: admin accounts stay signed in on the storefront (isAdminSession) and get
// the admin-only «ورود به پنل مدیریت» account link. Bump so cached shells pick it up.
// v24: admin Hero Slider loader hardened (null-safe init, no-store initial
// fetch with retry + explicit error instead of an endless loading
// placeholder). Bump so persistent clients drop stale caches (including any
// stale admin-hero-slides.js) and pick up the fixed loader.
// v25: centralized store logo (Admin → اطلاعات فروشگاه → store.logo). The
// shared logo renderer assets/js/store-logo.js is part of the shell, and the
// generated favicon/PWA icons plus manifest.webmanifest are now network-first
// so a logo change propagates instead of being pinned by the cache.
// v26: account contact page (/account/contact) — common.js now maps the new
// page to account-contact.html and its canonical URL. Static assets are
// cache-first and public pages load common.js without a ?v= query, so the bump
// is required for clients holding the old app shell to pick the mapping up.
// v27: bottom nav active state on the cart page (/cart) — common.js now
// lights the Cart tab and suppresses the Profile rule there (storeFile() maps
// /cart to account-cart.html, which the "account…" Profile rule claimed), and
// the server gained a /account-cart → /cart 301 alias. Bump so persistent
// clients drop the stale shell and pick the active-state fix up.
// v28: header cart button (data-action="cart", desktop + mobile) now
// navigates to the cart page at /account-cart, which the server now serves
// directly (200 — replaces the brief v27 /account-cart → /cart 301 alias).
// Same reason as v27: common.js is precached cache-first, so bump for
// persistent clients to pick up the new handler.
// v29: header cart icon opens the cart popover (restored dead implementation:
// cartPopoverHTML mounted in both headers, bindCartPopovers wired in bindEvents
// and refreshHeaderAuth; toggleCartDrawer back to a no-op, full-cart link now
// points at /account-cart). Bump so cache-first clients pick the wiring up.
// v30: cart popover live-update — clicking +/-/remove inside the open
// popover now re-renders it immediately via the existing renderCartPopover
// (hooked into the existing delegated list handler in bindCartPopovers).
// Bump so cache-first clients pick the hook up.
// v31: cart button hidden in the mobile header only (CSS rule inside the
// existing <=768px block in header.css); desktop header + popover and the
// mobile bottom-nav cart item are untouched.
// Bump so cache-first clients pick the CSS up.
// v32: profile/account button also hidden in the mobile header only (same
// <=768px block in header.css, targeted by href so desktop and the
// bottom-nav «پروفایل من» item are untouched).
// Bump so cache-first clients pick the CSS up.
// v33: cart button visual effects removed (no transition, hover/press colour
// shift, box-shadow, transform or scale) on desktop AND mobile. Resting
// look, badge, click behaviour and popover unchanged.
// Bump so cache-first clients pick the CSS up.
// v34: cart button now mirrors the notification bell exactly — same
// inherited rest/hover colours and same 0.15s background/border/colour
// transition, with only the yellow glow suppressed (box-shadow: none).
// Desktop; mobile cart stays flat and hidden.
// Bump so cache-first clients pick the CSS up.
// v35: cart rest background pinned to transparent so it matches the bell on
// pages that load header.css but not desktop.css (e.g. /page/:ref), without
// affecting the hover background (kept below the bell's hover specificity).
// Bump so cache-first clients pick the CSS up.
// v38: admin storefront sessions no longer query the customer-only
// /api/notifications endpoint (App.listNotifications/markNotificationRead
// short-circuit in common.js), so /account/notifications shows an empty state
// instead of a false "session expired" error. Bump so cache-first clients
// holding the old common.js under the same ?v= URL drop the stale shell.
// v39: fixed mobile purchase bar on the product detail page (product.js
// buyBarHTML + pages.css + icons.js). Bump so cache-first clients holding
// the old shell drop the stale product.js/pages.css and pick the bar up.
// v40: the buy bar now sits flush with the bottom edge. pages.css uses
// bottom: var(--pdp-bottom-nav-h, 0px) + env(safe-area-inset-bottom) padding,
// product.js always publishes --pdp-bottom-nav-h (0px when the product page
// renders no bottom nav) and common.js drops the nav on product.html so the
// bar can own the bottom edge. Clients pinned to the v39 cache were still
// serving bottom: 57px and floated the bar a full nav-height above the
// screen bottom — the exact "bar sits too high" report. Bump so cache-first
// clients drop pages.css/product.js/common.js together and pick the fix up.
// v41: product detail no longer announces add/remove to cart — the buy box and
// the mobile purchase bar confirm in place (button ↔ quantity stepper), so
// product.js dropped its «به سبد خرید اضافه شد» toast and common.js gates the
// add/remove toasts off on product.html. Bump so cache-first clients holding
// the old common.js/product.js drop the stale shell and pick the change up.
// v42: add-to-cart feedback on the responsive product page — updateCartUI() now
// reacts to as_cart_change (so the compact PDP header badge updates the moment
// the button is tapped) and briefly bounces that header cart icon; header.css
// gained the scoped keyframes. Both files are precached cache-first below, so
// bump to drop the stale shell.
/* v43: contact-page actions actually work for returning visitors. contact.html is
 * rewritten to its own clean route ("/contact#contact-form" instead of a bare
 * "#contact-form", which <base href="/"> resolved to the HOMEPAGE and made the
 * "ارسال پیام" card appear dead), the map card's "مسیریابی" link is wired up
 * (it was a permanent href="#"), and common.js gained a normaliser for bare
 * same-page fragments plus the navigate href. contact.html/contact.css/common.js
 * are cache-first (contact.css is not even precached), so persistent clients
 * pinned the old markup and JS — bump so they pick the fix up.
 */
/* v45: Camzy rebrand — the CCTV catalog (assets/js/data.js), the new brand
 * icons (assets/icons/*.png, assets/icons/icon.svg) and the rebranded static
 * pages are all cache-first, so bump so persistent clients drop the stale
 * tool-era catalog and icons.
 */
var CACHE_NAME = 'camzy-v45';
var OFFLINE_URL = 'offline.html';

var APP_SHELL = [
  './',
  'index.html',
  'offline.html',
  'manifest.webmanifest',
  'assets/css/design-system.css',
  'assets/css/base.css',
  'assets/css/components.css',
  'assets/css/header.css',
  'assets/css/footer.css',
  'assets/css/homepage.css',
  'assets/css/desktop.css',
  'assets/css/pages.css',
  'assets/css/contact.css',
  'assets/css/pwa.css',
  'assets/js/data.js',
  'assets/js/icons.js',
  'assets/js/store-logo.js',
  'assets/js/common.js',
  'assets/js/account.js',
  'assets/css/account.css',
  'assets/js/pwa.js',
  'assets/data/iran-cities.json',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/maskable-192.png',
  'assets/icons/maskable-512.png',
  'assets/icons/icon.svg',
  'assets/images/brand/logo.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () {
      return self.skipWaiting();
    }).catch(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_NAME) return caches.delete(key);
        return Promise.resolve(false);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function isNavigationRequest(request) {
  return request.mode === 'navigate' ||
    (request.method === 'GET' &&
      request.headers.get('accept') &&
      request.headers.get('accept').indexOf('text/html') !== -1);
}

// HTML documents must always be network-first — even when fetched as a
// subresource (fetch/XHR with Accept: */*). Otherwise a page saved through
// the Visual Builder (PUT /api/admin/static-pages/...) stays stale in the
// cache-first static branch and the edit looks lost after reload.
function isHtmlDocument(request, url) {
  if (isNavigationRequest(request)) return true;
  if (request.method !== 'GET') return false;
  var p;
  try { p = url.pathname.toLowerCase(); } catch (e) { return false; }
  return p === '/' || p.charAt(p.length - 1) === '/' || p.slice(-5) === '.html';
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  // API responses must always come from the network. Serving them cache-first
  // returned stale data (e.g. an old empty GET /api/cart), which wiped the
  // buyer's valid local cart during checkout sync.
  if (url.pathname.indexOf('/api/') === 0) return;

  // Store logo artifacts are generated from the store.logo setting. They must
  // never be served stale from the cache, or a logo change in the Admin would
  // not reach the tab icon, the installed PWA, or the offline shell.
  if (url.pathname === '/manifest.webmanifest') return;
  if (url.pathname.indexOf('/assets/images/uploads/store/') === 0) return;

  // Navigations and HTML documents: network-first, then cache, then offline page.
  if (isHtmlDocument(request, url)) {
    event.respondWith(
      fetch(request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        return response;
      }).catch(function () {
        return caches.match(request, { ignoreSearch: true }).then(function (cached) {
          if (cached) return cached;
          return caches.match(OFFLINE_URL);
        });
      })
    );
    return;
  }

  // Static assets: cache-first, update cache in background.
  event.respondWith(
    caches.match(request, { ignoreSearch: false }).then(function (cached) {
      var network = fetch(request).then(function (response) {
        if (response && response.status === 200) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
