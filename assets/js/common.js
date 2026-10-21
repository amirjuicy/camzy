/* ================================================================
   Camzy — Common Layout & Shared Components
   Renders header, footer, overlays on all internal pages.
   Manages user auth session, per-user data isolation.

   localStorage keys:
     as_users          — [{id, firstName, lastName, mobile, email, joinDate}]
     as_session        — {userId: "u_xxxxx"} | null
     as_guest_session  — "guest_xxxxx" (for anonymous visitors)
     as_user_{id}_profile   — {firstName, lastName, mobile, email}
     as_user_{id}_orders    — [order objects]
     as_user_{id}_addresses — [address objects]
     as_user_{id}_cart      — [{id, name, price, quantity, brandName}]
     as_user_{id}_wishlist  — [productIds]
     as_guest_cart_{guestId}      — [{id, name, price, quantity, brandName}]
     as_guest_wishlist_{guestId}  — [productIds]
   ================================================================ */

(function () {
  'use strict';

  /* ════════════════════════════════════════════════════════════
     HELPERS
     ============================================================ */

  function generateId() {
    return 'u_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  function generateGuestId() {
    return 'guest_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
  }

  function generateOrderId() {
    return 'ORD-' + Date.now().toString(36).toUpperCase().substr(-8) + Math.random().toString(36).substr(2, 3).toUpperCase();
  }

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (e) { return fallback; }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  /* ════════════════════════════════════════════════════════════
     URL / PATH HELPERS
     ============================================================ */
  /* Clean URLs: map any storefront path (clean or legacy .html) to its
     underlying .html file, and extract the detail ref (/product/:ref …). */
  function storeFile(){
    try{
      var p = (window.location.pathname || '/');
      var CLEAN = {
        '/': 'index.html',
        '/shop': 'shop.html',
        '/brands': 'brands.html',
        '/categories': 'categories.html',
        '/articles': 'articles.html',
        '/login': 'login.html',
        '/register': 'register.html',
        '/forgot-password': 'forgot-password.html',
        '/offline': 'offline.html',
        '/cart': 'account-cart.html',
        '/account': 'account.html',
        '/account/orders': 'account-orders.html',
        '/account/profile': 'account-profile.html',
        '/account/addresses': 'account-addresses.html',
        '/account/wishlist': 'account-wishlist.html',
        '/account/notifications': 'account-notifications.html',
        '/account/contact': 'account-contact.html',
        '/checkout': 'checkout.html',
        '/checkout/step1': 'checkout-step1.html',
        '/checkout/step2': 'checkout-step2.html',
        '/checkout/step3': 'checkout-step3.html',
        '/checkout/step4': 'checkout-step4.html',
        '/about': 'about.html',
        '/contact': 'contact.html',
        '/faq': 'faq.html',
        '/returns': 'returns.html',
        '/shipping': 'shipping.html',
        '/privacy': 'privacy.html',
        '/terms': 'terms.html',
        '/authenticity': 'authenticity.html',
        '/pricing': 'pricing.html'
      };
      if (CLEAN[p]) return CLEAN[p];
      var m = p.match(/^\/(product|category|brand|article|page)\/[^\/]+\/?$/);
      if (m) {
        return { product: 'product.html', category: 'category.html', brand: 'brand-detail.html', article: 'article-detail.html', page: 'page.html' }[m[1]];
      }
      if (/^\/account\/orders\/[^\/]+\/?$/.test(p)) return 'account-order-detail.html';
      var f = p.split('/').pop() || 'index.html';
      return f.split('?')[0].split('#')[0] || 'index.html';
    }catch(e){ return 'index.html'; }
  }
  function storeRef(){
    try{
      var segs = (window.location.pathname || '').split('/').filter(function(s){ return !!s; });
      if (segs.length === 2 && /^(product|category|brand|article|page)$/.test(segs[0])) return decodeURIComponent(segs[1]);
      if (segs.length === 3 && segs[0] === 'account' && segs[1] === 'orders') return decodeURIComponent(segs[2]);
    }catch(e){}
    return '';
  }
  /* Canonical URL: one canonical address per page so legacy .html URLs
     and clean URLs are never indexed as duplicates. Head-only; no UI change. */
  function setCanonical(){
    try{
      if (/^\/admin(\/|$)/.test(window.location.pathname || '')) return;
      var f = storeFile();
      var CANON = {
        'index.html': '/',
        'shop.html': '/shop',
        'brands.html': '/brands',
        'categories.html': '/categories',
        'articles.html': '/articles',
        'login.html': '/login',
        'register.html': '/register',
        'forgot-password.html': '/forgot-password',
        'offline.html': '/offline',
        'account.html': '/account',
        'account-cart.html': '/cart',
        'account-orders.html': '/account/orders',
        'account-profile.html': '/account/profile',
        'account-addresses.html': '/account/addresses',
        'account-wishlist.html': '/account/wishlist',
        'account-notifications.html': '/account/notifications',
        'account-contact.html': '/account/contact',
        'checkout.html': '/checkout',
        'checkout-step1.html': '/checkout/step1',
        'checkout-step2.html': '/checkout/step2',
        'checkout-step3.html': '/checkout/step3',
        'checkout-step4.html': '/checkout/step4',
        'about.html': '/about',
        'contact.html': '/contact',
        'faq.html': '/faq',
        'returns.html': '/returns',
        'shipping.html': '/shipping',
        'privacy.html': '/privacy',
        'terms.html': '/terms',
        'authenticity.html': '/authenticity',
        'pricing.html': '/pricing'
      };
      var canon = CANON[f];
      if (!canon) {
        var r = storeRef();
        if (f === 'product.html' && r) canon = '/product/' + encodeURIComponent(r);
        else if (f === 'category.html' && r) canon = '/category/' + encodeURIComponent(r);
        else if (f === 'brand-detail.html' && r) canon = '/brand/' + encodeURIComponent(r);
        else if (f === 'article-detail.html' && r) canon = '/article/' + encodeURIComponent(r);
        else if (f === 'page.html' && r) canon = '/page/' + encodeURIComponent(r);
        else if (f === 'account-order-detail.html' && r) canon = '/account/orders/' + encodeURIComponent(r);
        else return;
      }
      var link = document.querySelector('link[rel="canonical"]');
      if (!link) { link = document.createElement('link'); link.setAttribute('rel', 'canonical'); document.head.appendChild(link); }
      link.setAttribute('href', window.location.origin + canon);
    }catch(e){}
  }
  /* Structured data (JSON-LD) helper — one <script> per id, replaced in place
     so repeated renders never stack duplicate schema blocks. */
  function upsertJsonLd(id, data){
    try{
      if(!data) return;
      var el = document.getElementById(id);
      if(!el){
        el = document.createElement('script');
        el.type = 'application/ld+json';
        el.id = id;
        document.head.appendChild(el);
      }
      el.textContent = JSON.stringify(data);
    }catch(e){}
  }
  function absUrl(p){
    try{
      if(!p) return '';
      if(/^https?:/i.test(p)) return p;
      return window.location.origin + (String(p).charAt(0) === '/' ? '' : '/') + p;
    }catch(e){ return p || ''; }
  }
  function pageKeyForSeo(){
    try{
      var p = storeFile();
      if(p==='index.html'||p==='' ) return 'home';
      if(/\.html$/.test(p)) return p.slice(0,-5);
    }catch(e){}
    return 'home';
  }

  /* ════════════════════════════════════════════════════════════
     GUEST SESSION
     ============================================================ */
  function getGuestSession() {
    var guest = localStorage.getItem('as_guest_session');
    if (!guest) {
      guest = generateGuestId();
      localStorage.setItem('as_guest_session', guest);
    }
    return guest;
  }

  /* ════════════════════════════════════════════════════════════
     USER AUTH / SESSION
     ============================================================ */
  /* API-backed customer auth. Session cache stays in localStorage
     (as_session = {userId, token, user}) so sync readers keep working;
     the database is the source of truth via /api/auth/*. */
  var API_BASE = (function () {
    try {
      if (window.CamzyApiBase) return window.CamzyApiBase;
      if (window.location.protocol.indexOf('http') === 0) return '';
    } catch (e) {}
    return '';
  })();

  /* A 401 from the API means the saved Bearer token is dead (expired after
     30 days, wiped by a DB restore, or never issued). The local "logged in"
     cache is then a lie — drop it once per page load so the UI honestly
     shows logged-out instead of failing every request with 401. */
  var authExpiredFired = false;
  /* Session readiness gate: the header must NOT show logged-in state (logout
     button) until the backend has confirmed the token. Without this gate, a
     stale as_session in localStorage (after DB restore, token expiry, or
     logout on another device) causes the header to render the logout button
     for logged-out visitors on initial paint, before fetchMe() completes. */
  var sessionReady = false;
  function markSessionReady() {
    if (sessionReady) return;
    sessionReady = true;
    try { refreshHeaderAuth(); } catch (e) {}
  }
  function handleAuthExpired() {
    if (authExpiredFired) return;
    /* An admin session is logged in, just not as a customer: its 401s on
       customer-scoped endpoints are expected and must not sign it out. */
    if (isAdminSession()) return;
    authExpiredFired = true;
    try { setSession(null); } catch (e) {}
    markSessionReady();
    try { refreshState(); } catch (e) {}
    try { document.dispatchEvent(new CustomEvent('as_auth_expired')); } catch (e) {}
    try { notifyAuthChange(); } catch (e) {}
  }

  function apiRequest(method, path, body, auth) {
    var url = API_BASE + '/api' + path;
    var headers = { 'Content-Type': 'application/json' };
    var session = null;
    try { session = readJSON('as_session', null); } catch (e) {}
    if (auth !== false && session && session.token) {
      headers['Authorization'] = 'Bearer ' + session.token;
    }
    return fetch(url, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.error) || ('Request failed: ' + res.status));
          err.status = res.status;
          if (res.status === 401 && auth !== false) handleAuthExpired();
          throw err;
        }
        return data;
      });
    });
  }

  function apiAvailable() {
    try {
      return window.location.protocol.indexOf('http') === 0 && typeof fetch === 'function';
    } catch (e) { return false; }
  }

  function getSession() {
    return readJSON('as_session', null);
  }

  function setSession(userId, token, user) {
    if (userId) {
      var prev = readJSON('as_session', null) || {};
      writeJSON('as_session', {
        userId: userId,
        token: token !== undefined ? token : (prev.token || null),
        user: user !== undefined ? user : (prev.user || null),
      });
    } else {
      localStorage.removeItem('as_session');
    }
  }

  function cacheSessionUser(user, token) {
    if (!user) return;
    setSession(user.id, token !== undefined ? token : (getSession() || {}).token, user);
    /* Keep a lightweight legacy mirror for backward compat. */
    try {
      var users = readJSON('as_users', []);
      var idx = -1;
      for (var i = 0; i < users.length; i++) {
        if (users[i].id === user.id) { idx = i; break; }
      }
      if (idx === -1) users.push(user); else users[idx] = user;
      writeJSON('as_users', users);
    } catch (e) {}
  }

  function getCurrentUser() {
    var session = getSession();
    if (!session || !session.userId) return null;
    if (session.user && session.user.id === session.userId) return session.user;
    var users = readJSON('as_users', []);
    return users.find(function (u) { return u.id === session.userId; }) || null;
  }

  function isLoggedIn() {
    return getCurrentUser() !== null;
  }

  /* Admin accounts sign in through this same login form: /auth/login matches
     admin_users first and returns an admin_sessions token with user id
     "admin:<id>", which login() mirrors into as_admin_session. That token is a
     real, valid login for the admin panel, but it is NOT a customer token, so
     every customer-scoped endpoint answers 401 for it. Recognising the session
     keeps those 401s from being read as a dead token (see handleAuthExpired). */
  function isAdminSession() {
    try {
      var session = getSession();
      if (!session || !session.token || !session.userId) return false;
      if (String(session.userId).indexOf('admin:') !== 0) return false;
      var adminSession = readJSON('as_admin_session', null);
      return !!(adminSession && adminSession.token && adminSession.token === session.token);
    } catch (e) { return false; }
  }

  function fetchMe() {
    if (!apiAvailable()) { markSessionReady(); return Promise.resolve(getCurrentUser()); }
    var session = getSession();
    if (!session || !session.token) { markSessionReady(); return Promise.resolve(getCurrentUser()); }
    /* Admins have no customer row, so /auth/me can only 401 here and there is
       nothing to refresh — the local admin profile is already cached. */
    if (isAdminSession()) { markSessionReady(); return Promise.resolve(getCurrentUser()); }
    return apiRequest('GET', '/auth/me').then(function (data) {
      if (data && data.user) {
        /* The request may resolve after the session changed (e.g. logout
           during a slow handshake). Only re-cache when this is still the
           current session — never resurrect a cleared session. */
        var fresh = getSession();
        if (fresh && fresh.token && fresh.token === session.token) {
          cacheSessionUser(data.user, session.token);
        }
        try { refreshState(); } catch (e) {}
        try { pullCartFromServer(); } catch (e) {}
        try { pullWishlistFromServer(); } catch (e) {}
        try { pullRecentFromServer(); } catch (e) {}
      }
      markSessionReady();
      return data.user;
    }).catch(function (err) {
      /* A 401 already cleared the session via handleAuthExpired. Every other
         failure — 429 throttle, 5xx, network blip — leaves the token merely
         UNVALIDATED, not invalid, so the cached session must survive. Wiping
         it here silently signed users out: /api/auth/me runs on every page
         load and authLimiter caps /api/auth/* at 20 req / 15 min, so the
         20th page load returned 429 and reset the header to logged-out. */
      var status = err && err.status;
      if (status === 401 || status === 403) { try { setSession(null); } catch (e) {} }
      markSessionReady();
      return getCurrentUser();
    });
  }

  var authReady = (function () {
    if (document.readyState === 'loading') {
      return new Promise(function (resolve) {
        document.addEventListener('DOMContentLoaded', function () { fetchMe().then(resolve, resolve); });
      });
    }
    return fetchMe().then(function () {}, function () {});
  })();

  /* ════════════════════════════════════════════════════════════
     PER-USER DATA READ/WRITE
     ============================================================ */
  function userPrefix() {
    var user = getCurrentUser();
    return user ? 'as_user_' + user.id + '_' : null;
  }

  function getUserData(key, fallback) {
    var prefix = userPrefix();
    if (!prefix) return fallback;
    return readJSON(prefix + key, fallback);
  }

  function setUserData(key, value) {
    var prefix = userPrefix();
    if (!prefix) return;
    writeJSON(prefix + key, value);
  }

  /* ════════════════════════════════════════════════════════════
     CART — user-scoped or guest-scoped
     ============================================================ */
  function getCartStorageKey() {
    var user = getCurrentUser();
    if (user) return 'as_user_' + user.id + '_cart';
    return 'as_guest_cart_' + getGuestSession();
  }

  function loadCart() {
    var cart = readJSON(getCartStorageKey(), []);
    /* Migrate old cart items: add key and pricingMode if missing */
    var changed = false;
    cart.forEach(function (item) {
      if (!item.key) {
        item.key = getCartKey(item.id, item.pricingMode || 'retail');
        item.pricingMode = item.pricingMode || 'retail';
        changed = true;
      }
    });
    if (changed) writeJSON(getCartStorageKey(), cart);
    return cart;
  }

  function saveCart(cart) {
    writeJSON(getCartStorageKey(), cart);
    /* Mirror the cart to the database for authenticated users (guest carts stay local). */
    try { pushCartToServer(cart); } catch (e) {}
    try { document.dispatchEvent(new CustomEvent('as_cart_change')); } catch (e) {}
  }

  function toServerCartItems(cart) {
    return (cart || []).map(function (item) {
      return {
        productId: item.id, quantity: item.quantity,
        pricingMode: item.pricingMode || 'retail',
        price: item.price, name: item.name,
        brandName: item.brandName, image: item.image, slug: item.slug,
      };
    });
  }

  function pushCartToServer(cart) {
    if (!apiAvailable() || !isLoggedIn()) return Promise.resolve(null);
    var items = toServerCartItems(cart !== undefined ? cart : state.cart);
    return apiRequest('PUT', '/cart', { items: items }).catch(function () { return null; });
  }

  function pullCartFromServer() {
    if (!apiAvailable() || !isLoggedIn()) return Promise.resolve(null);
    return apiRequest('GET', '/cart').then(function (data) {
      var items = (data && data.items) || [];
      /* Migrate/normalize server items (key + pricingMode). */
      items.forEach(function (item) {
        if (!item.key) item.key = getCartKey(item.id, item.pricingMode || 'retail');
        item.pricingMode = item.pricingMode || 'retail';
      });
      state.cart = items;
      writeJSON(getCartStorageKey(), items);
      try { updateCartUI(); } catch (e) {}
      return items;
    }).catch(function () { return null; });
  }

  function mergeGuestCartIntoUserCart(userId) {
    var guestKey = 'as_guest_cart_' + getGuestSession();
    var guestCart = readJSON(guestKey, []);
    if (guestCart.length === 0) return;

    var userKey = 'as_user_' + userId + '_cart';
    var userCart = readJSON(userKey, []);

    guestCart.forEach(function (gItem) {
      var existing = userCart.find(function (uItem) { return uItem.id === gItem.id; });
      if (existing) {
        existing.quantity += gItem.quantity;
      } else {
        userCart.push(gItem);
      }
    });

    writeJSON(userKey, userCart);
    localStorage.removeItem(guestKey);
  }

  /* ════════════════════════════════════════════════════════════
     WISHLIST — user-scoped or guest-scoped
     ============================================================ */
  function getWishlistStorageKey() {
    var user = getCurrentUser();
    if (user) return 'as_user_' + user.id + '_wishlist';
    return 'as_guest_wishlist_' + getGuestSession();
  }

  function loadWishlist() {
    return readJSON(getWishlistStorageKey(), []);
  }

  function saveWishlist(wishlist) {
    writeJSON(getWishlistStorageKey(), wishlist);
    /* Mirror the wishlist to the database for authenticated users (guest stays local). */
    try { pushWishlistToServer(wishlist); } catch (e) {}
  }

  function normalizeWishlistIds(items) {
    var out = [];
    (items || []).forEach(function (it) {
      var id = parseInt(it && typeof it === 'object' ? (it.productId != null ? it.productId : it.id) : it, 10);
      if (!isNaN(id) && id > 0 && out.indexOf(id) === -1) out.push(id);
    });
    return out;
  }

  function pushWishlistToServer(wishlist) {
    if (!apiAvailable() || !isLoggedIn()) return Promise.resolve(null);
    var items = normalizeWishlistIds(wishlist !== undefined ? wishlist : state.wishlist);
    return apiRequest('PUT', '/wishlist', { items: items }).catch(function () { return null; });
  }

  function pullWishlistFromServer() {
    if (!apiAvailable() || !isLoggedIn()) return Promise.resolve(null);
    return apiRequest('GET', '/wishlist').then(function (data) {
      var items = normalizeWishlistIds((data && data.items) || []);
      state.wishlist = items;
      /* localStorage is only a cache/offline fallback — refresh it from DB. */
      writeJSON(getWishlistStorageKey(), items);
      try { updateWishlistUI(); } catch (e) {}
      try { document.dispatchEvent(new CustomEvent('as_wishlist_change')); } catch (e) {}
      return items;
    }).catch(function () { return null; });
  }

  function mergeGuestWishlistIntoUserCart(userId) {
    var guestKey = 'as_guest_wishlist_' + getGuestSession();
    var guestWish = readJSON(guestKey, []);
    if (guestWish.length === 0) return;

    var userKey = 'as_user_' + userId + '_wishlist';
    var userWish = readJSON(userKey, []);

    guestWish.forEach(function (id) {
      if (userWish.indexOf(id) === -1) userWish.push(id);
    });

    writeJSON(userKey, userWish);
    localStorage.removeItem(guestKey);
  }

  /* ════════════════════════════════════════════════════════════
     RECENTLY VIEWED — global localStorage cache, DB-backed for
     authenticated users (most-recent-first, capped).
     ============================================================ */
  var RECENT_KEY = 'as_recently_viewed';
  var RECENT_MAX = 20;

  function normalizeRecentIds(items) {
    var out = [];
    (items || []).forEach(function (it) {
      var id = parseInt(it && typeof it === 'object' ? (it.productId != null ? it.productId : it.id) : it, 10);
      if (!isNaN(id) && id > 0 && out.indexOf(id) === -1) out.push(id);
    });
    return out.slice(0, RECENT_MAX);
  }

  function getRecentCache() {
    var list = readJSON(RECENT_KEY, []);
    return normalizeRecentIds(list);
  }

  function setRecentCache(items) {
    writeJSON(RECENT_KEY, normalizeRecentIds(items));
  }

  function pullRecentFromServer() {
    if (!apiAvailable() || !isLoggedIn()) return Promise.resolve(null);
    return apiRequest('GET', '/recently-viewed').then(function (data) {
      var items = normalizeRecentIds((data && data.items) || []);
      /* localStorage is only a cache/offline fallback — refresh it from DB. */
      setRecentCache(items);
      try { document.dispatchEvent(new CustomEvent('as_recent_change')); } catch (e) {}
      return items;
    }).catch(function () { return null; });
  }

  function recordRecentView(productId) {
    var id = parseInt(productId, 10);
    if (isNaN(id) || id <= 0) return;
    var list = getRecentCache().filter(function (x) { return x !== id; });
    list.unshift(id);
    setRecentCache(list);
    /* Mirror to the database for authenticated users (guests stay local). */
    if (apiAvailable() && isLoggedIn()) {
      apiRequest('POST', '/recently-viewed/items', { productId: id }).catch(function () {});
    }
  }

  /* ════════════════════════════════════════════════════════════
     AUTH: REGISTER / LOGIN / LOGOUT
     ============================================================ */
  function afterAuthSuccess(user, token) {
    cacheSessionUser(user, token);
    writeJSON('as_user_' + user.id + '_profile', {
      firstName: user.firstName, lastName: user.lastName,
      mobile: user.mobile, email: user.email || '',
    });
    var guestKey = 'as_guest_cart_' + getGuestSession();
    var guestCart = readJSON(guestKey, []);
    var guestWishKey = 'as_guest_wishlist_' + getGuestSession();
    var guestWish = readJSON(guestWishKey, []);
    mergeGuestCartIntoUserCart(user.id);
    mergeGuestWishlistIntoUserCart(user.id);
    refreshState();
    /* Persist merged cart to the database (guest items merged on login). */
    if (apiAvailable()) {
      var merged = readJSON('as_user_' + user.id + '_cart', []);
      var payload = toServerCartItems(guestCart.length ? merged : merged);
      apiRequest('POST', '/cart/merge', { items: guestCart.length ? toServerCartItems(guestCart) : [] })
        .then(function (data) {
          if (data && data.items) {
            state.cart = data.items;
            writeJSON('as_user_' + user.id + '_cart', data.items);
            try { updateCartUI(); } catch (e) {}
          } else if (payload.length) { pushCartToServer(merged); }
        })
        .catch(function () {});
      if (!guestCart.length) pullCartFromServer();
      apiRequest('POST', '/wishlist/merge', { items: normalizeWishlistIds(guestWish) })
        .then(function (data) {
          if (data && data.items) {
            state.wishlist = normalizeWishlistIds(data.items);
            writeJSON('as_user_' + user.id + '_wishlist', state.wishlist);
            try { updateWishlistUI(); } catch (e) {}
          }
        })
        .catch(function () {});
      /* Merge the local recently-viewed cache into the DB (preserves guest history). */
      var guestRecent = getRecentCache();
      if (guestRecent.length) {
        apiRequest('POST', '/recently-viewed/merge', { items: guestRecent })
          .then(function (data) {
            if (data && data.items) setRecentCache(data.items);
          })
          .catch(function () {});
      } else {
        pullRecentFromServer();
      }
    }
    try { refreshHeaderAuth(); } catch (e) {}
    notifyAuthChange();
    return { success: true, user: user };
  }

  function legacyRegister(data) {
    var users = readJSON('as_users', []);
    var exists = users.find(function (u) { return u.mobile === data.mobile; });
    if (exists) {
      setSession(exists.id);
      mergeGuestCartIntoUserCart(exists.id);
      mergeGuestWishlistIntoUserCart(exists.id);
      try { refreshHeaderAuth(); } catch (e) {}
      notifyAuthChange();
      return Promise.resolve({ success: true, user: exists, autoLogin: true });
    }
    var user = {
      id: generateId(),
      firstName: data.firstName, lastName: data.lastName,
      mobile: data.mobile, email: data.email || '',
      joinDate: new Date().toLocaleDateString('fa-IR'),
    };
    users.push(user);
    writeJSON('as_users', users);
    writeJSON('as_user_' + user.id + '_profile', {
      firstName: user.firstName, lastName: user.lastName,
      mobile: user.mobile, email: user.email,
    });
    var p = Promise.resolve(afterAuthSuccess(user, null));
    /* Best-effort: also persist the legacy user in the DB. */
    if (apiAvailable()) {
      apiRequest('POST', '/users', {
        id: user.id, firstName: user.firstName, lastName: user.lastName,
        mobile: user.mobile, email: user.email || undefined,
        password: data.password || undefined,
      }, false).catch(function () {});
    }
    return p;
  }

  function register(data) {
    if (!apiAvailable()) return legacyRegister(data);
    return apiRequest('POST', '/auth/register', {
      firstName: data.firstName, lastName: data.lastName,
      mobile: data.mobile, email: data.email || '', password: data.password || '',
    }, false).then(function (res) {
      return afterAuthSuccess(res.user, res.token);
    }).catch(function (err) {
      var msg = (err && err.message) || 'خطا در ثبت‌نام.';
      if (/already exists/i.test(msg)) msg = 'این شماره موبایل یا ایمیل قبلاً ثبت‌نام شده است.';
      else if (/Password/i.test(msg)) msg = 'رمز عبور باید حداقل ۶ کاراکتر باشد.';
      return { success: false, error: msg };
    });
  }

  function legacyLogin(identifier) {
    var users = readJSON('as_users', []);
    var user = users.find(function (u) { return u.mobile === identifier || u.email === identifier; });
    if (!user) return Promise.resolve({ success: false, error: 'کاربری با این مشخصات یافت نشد.' });
    setSession(user.id);
    mergeGuestCartIntoUserCart(user.id);
    mergeGuestWishlistIntoUserCart(user.id);
    refreshState();
    try { refreshHeaderAuth(); } catch (e) {}
    notifyAuthChange();
    return Promise.resolve({ success: true, user: user });
  }

  function login(identifier, password) {
    if (!apiAvailable()) return legacyLogin(identifier);
    return apiRequest('POST', '/auth/login', { identifier: identifier, password: password || '' }, false)
      .then(function (res) {
        var r = afterAuthSuccess(res.user, res.token);
        r.isAdmin = !!res.isAdmin;
        r.admin = res.admin || null;
        r.adminToken = res.adminToken || res.token || null;
        if (res.isAdmin && res.admin && res.adminToken) {
          try { localStorage.setItem('as_admin_session', JSON.stringify({ token: res.adminToken, admin: res.admin, userId: res.admin.id, loginAt: Date.now() })); } catch(e){}
        } else if (res.isAdmin && res.token) {
          try { localStorage.setItem('as_admin_session', JSON.stringify({ token: res.token, admin: res.admin || res.user, userId: (res.admin&&res.admin.id)||res.user.id, loginAt: Date.now() })); } catch(e){}
        }
        return r;
      })
      .catch(function (err) {
        return { success: false, error: (err && err.message) || 'ورود ناموفق بود.' };
      });
  }

  function logout() {
    var session = getSession();
    /* Storefront login mirrors admin tokens into as_admin_session (see login):
       revoke and drop that half too. POST /auth/logout only deletes
       customer_sessions rows, so without this the admin_sessions row stays
       valid and /admin/ remains accessible after a storefront logout. */
    var adminSession = null;
    try { adminSession = readJSON('as_admin_session', null); } catch (e) {}
    var adminToken = adminSession && adminSession.token;
    var revokeAdmin = function () {
      if (!adminToken || !apiAvailable()) return Promise.resolve();
      try {
        return fetch(API_BASE + '/api/admin/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
        }).catch(function () {});
      } catch (e) { return Promise.resolve(); }
    };
    var done = function () {
      setSession(null);
      try { localStorage.removeItem('as_admin_session'); } catch (e) {}
      state.cart = [];
      state.wishlist = [];
      try { refreshHeaderAuth(); } catch (e) {}
      notifyAuthChange();
      return { success: true };
    };
    if (session && session.token && apiAvailable()) {
      return apiRequest('POST', '/auth/logout').catch(function () {}).then(function () {
        return revokeAdmin();
      }).then(done);
    }
    var fallback = function () { try { done(); } catch (e) {} return { success: true }; };
    try { return revokeAdmin().then(fallback); } catch (e) { return Promise.resolve(fallback()); }
  }

  function updateProfile(data) {
    var user = getCurrentUser();
    if (!user) return Promise.resolve({ success: false, error: 'Not logged in' });
    /* Optimistic local cache update (keeps profile UI sync). */
    var merged = {
      id: user.id, firstName: data.firstName || user.firstName,
      lastName: data.lastName || user.lastName, mobile: data.mobile || user.mobile,
      email: data.email !== undefined ? data.email : (user.email || ''),
      joinDate: user.joinDate,
    };
    cacheSessionUser(merged, (getSession() || {}).token);
    setUserData('profile', {
      firstName: merged.firstName, lastName: merged.lastName,
      mobile: merged.mobile, email: merged.email,
    });
    if (!apiAvailable()) return Promise.resolve({ success: true, user: merged });
    return apiRequest('PATCH', '/users/' + encodeURIComponent(user.id), {
      firstName: merged.firstName, lastName: merged.lastName,
      mobile: merged.mobile, email: merged.email,
      currentPassword: data.currentPassword, newPassword: data.newPassword,
    }).then(function (res) {
      cacheSessionUser(res.user, (getSession() || {}).token);
      setUserData('profile', {
        firstName: res.user.firstName, lastName: res.user.lastName,
        mobile: res.user.mobile, email: res.user.email || '',
      });
      try { refreshHeaderAuth(); } catch (e) {}
      notifyAuthChange();
      return { success: true, user: res.user };
    }).catch(function (err) {
      return { success: false, error: (err && err.message) || 'خطا در ذخیره اطلاعات.' };
    });
  }

  /* ════════════════════════════════════════════════════════════
     IN-MEMORY STATE (loaded from user/guest-scoped storage)
     ============================================================ */
  var state = {
    cart: [],
    wishlist: [],
    searchOpen: false,
    mobileMenuOpen: false,
    cartDrawerOpen: false,
    activePage: ''
  };

  /* ── Initial Site Loader ─────────────────────────────────────
     The loader must never hide a fast page behind an arbitrary delay:
     it is mounted only when the load actually takes long (grace period),
     and it leaves the moment loading finishes — no minimum display time.
     Fast refreshes and navigations therefore paint content immediately
     with no blank-screen flash. */
  var siteLoaderState = {
    loader: null,
    previousBodyOverflow: '',
    inertElements: [],
    hasFinished: false,
    mountTime: 0,
    mountTimer: null,
    minDisplayDuration: 0,
    gracePeriodMs: 600
  };

  function mountSiteLoader() {
    var body = document.body;
    if (!body || document.getElementById('site-loader')) return;

    var loader = document.createElement('div');
    loader.id = 'site-loader';
    loader.className = 'site-loader';
    loader.setAttribute('role', 'status');
    loader.setAttribute('aria-live', 'polite');
    loader.setAttribute('aria-busy', 'true');
    loader.innerHTML = '\
      <div class="site-loader__content">\
        <span class="site-loader__logo" role="img" aria-label="کمزی">' + Icons.flash + '</span>\
        <p class="site-loader__text">در حال بارگذاری...</p>\
        <div class="site-loader__progress" aria-hidden="true"><span></span></div>\
      </div>';

    siteLoaderState.loader = loader;
    siteLoaderState.mountTime = Date.now();
    siteLoaderState.previousBodyOverflow = body.style.overflow;
    document.documentElement.classList.add('is-site-loading');
    body.classList.add('is-site-loading');
    body.insertBefore(loader, body.firstChild);

    Array.prototype.forEach.call(body.children, function (element) {
      if (element === loader || !('inert' in element)) return;
      siteLoaderState.inertElements.push({ element: element, value: element.inert });
      element.inert = true;
    });
  }

  function restoreSiteLoaderInteraction() {
    siteLoaderState.inertElements.forEach(function (entry) {
      entry.element.inert = entry.value;
    });
    siteLoaderState.inertElements = [];
  }

  function completeSiteLoaderRemoval() {
    var loader = siteLoaderState.loader;
    if (!loader) return;
    loader.hidden = true;
    loader.setAttribute('aria-busy', 'false');
    document.documentElement.classList.remove('is-site-loading');
    document.body.classList.remove('is-site-loading');
    restoreSiteLoaderInteraction();
    loader.remove();
    siteLoaderState.loader = null;
  }

  function finishSiteLoader() {
    if (siteLoaderState.mountTimer) {
      try { clearTimeout(siteLoaderState.mountTimer); } catch (e) {}
      siteLoaderState.mountTimer = null;
    }
    var loader = siteLoaderState.loader;
    if (!loader || siteLoaderState.hasFinished) return;

    var elapsed = Date.now() - siteLoaderState.mountTime;
    var remaining = siteLoaderState.minDisplayDuration - elapsed;
    if (remaining > 0) {
      setTimeout(finishSiteLoader, remaining);
      return;
    }

    siteLoaderState.hasFinished = true;
    loader.classList.add('is-leaving');
    loader.setAttribute('aria-busy', 'false');
    document.documentElement.classList.remove('is-site-loading');
    document.body.classList.remove('is-site-loading');
    document.body.style.overflow = siteLoaderState.previousBodyOverflow;
    restoreSiteLoaderInteraction();
    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      requestAnimationFrame(completeSiteLoaderRemoval);
      return;
    }

    loader.addEventListener('transitionend', function (event) {
      if (event.target === loader && event.propertyName === 'opacity') {
        completeSiteLoaderRemoval();
      }
    }, { once: true });

    /* Safety net: if the transition never fires (e.g. class applied before
       styles were applied, or transition suppressed), remove anyway. */
    setTimeout(function () {
      if (siteLoaderState.loader === loader) completeSiteLoaderRemoval();
    }, 800);
  }

  function watchForSiteLoaderCompletion() {
    if (siteLoaderState.mountTimer) {
      try { clearTimeout(siteLoaderState.mountTimer); } catch (e) {}
      siteLoaderState.mountTimer = null;
    }
    if (!siteLoaderState.loader) return;
    if (document.readyState === 'complete') {
      requestAnimationFrame(finishSiteLoader);
    } else {
      window.addEventListener('load', finishSiteLoader, { once: true });
    }
  }

  /* Mount the loader only when the page is genuinely slow: if everything
     (including this script) settles within the grace period, no overlay
     ever appears and no blank-screen flash exists. */
  function scheduleSiteLoader() {
    if (document.readyState === 'complete') return;
    try {
      siteLoaderState.mountTimer = setTimeout(function () {
        siteLoaderState.mountTimer = null;
        if (siteLoaderState.hasFinished) return;
        if (document.readyState === 'complete') return;
        try { mountSiteLoader(); } catch (e) {}
        watchForSiteLoaderCompletion();
      }, siteLoaderState.gracePeriodMs);
    } catch (e) {}
    watchForSiteLoaderCompletion();
  }

  scheduleSiteLoader();

  /* ── Top progress bar (brand-color, RTL right→left) ─────────
     Injected once per page; animates on every in-site navigation.
     Pure CSS animation, zero dependencies. */
  function initTopProgress() {
    if (document.querySelector('.top-progress')) return;
    var bar = document.createElement('div');
    bar.className = 'top-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    var current = null;

    function run() {
      if (current) { clearTimeout(current); current = null; }
      bar.classList.add('is-active');
      bar.style.transition = 'none';
      bar.style.width = '0';
      /* force reflow so the reset applies before animating */
      void bar.offsetWidth;
      bar.style.transition = 'width 900ms cubic-bezier(0.1, 0.7, 0.3, 1), opacity 250ms ease';
      bar.style.width = '82%';
      current = setTimeout(function () {
        bar.style.transition = 'width 200ms ease-out, opacity 300ms ease';
        bar.style.width = '100%';
        current = setTimeout(function () {
          bar.classList.remove('is-active');
          bar.style.width = '0';
          current = null;
        }, 220);
      }, 850);
    }

    /* Capture phase so clicks inside iframes of legacy widgets still count */
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(mailto:|tel:|javascript:)/i.test(href)) return;
      run();
    }, true);

    /* If the browser restores the page from bfcache, reset the bar */
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) { if (current) clearTimeout(current); bar.classList.remove('is-active'); bar.style.width = '0'; current = null; }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTopProgress, { once: true });
  } else {
    initTopProgress();
  }

  /* Load initial state from the correct storage key */
  function refreshState() {
    state.cart = loadCart();
    state.wishlist = loadWishlist();
  }
  refreshState();
  /* Purchase settings cache (admin → Settings → خرید): maxQty / allowQtyEdit
     are used as fast local guards only — the server always re-validates. */
  function pullPurchaseSettings() {
    if (!apiAvailable()) return Promise.resolve(null);
    return fetch(API_BASE + '/api/settings').then(function (r) { return r.json(); })
      .then(function (s) {
        var ps = {
          maxQty: Math.max(0, Math.round(Number(String((s && s['order.max_qty']) || '0').replace(/[^\d.-]/g, '')) || 0)),
          allowQtyEdit: String((s && s['order.allow_qty_edit']) !== undefined ? s['order.allow_qty_edit'] : '1') === '1',
          allowGuest: String((s && s['order.allow_guest']) !== undefined ? s['order.allow_guest'] : '1') === '1'
        };
        try { writeJSON('as_purchase_settings', ps); } catch (e) {}
        return ps;
      }).catch(function () { return null; });
  }
  try { pullPurchaseSettings(); } catch (e) {}
  /* For authenticated users the database is the source of truth. */
  try {
    if (isLoggedIn() && apiAvailable()) { pullCartFromServer(); pullWishlistFromServer(); pullRecentFromServer(); }
    else if (typeof authReady !== 'undefined' && authReady && authReady.then) {
      authReady.then(function () { if (isLoggedIn()) { pullCartFromServer(); pullWishlistFromServer(); pullRecentFromServer(); } });
    }
  } catch (e) {}

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

  /* ── Toast ────────────────────────────────────────────────── */
  function showToast(msg, type) {
    type = type || 'success';
    const c = $('.toast-container');
    if (!c) return;
    const iconMap = { success: Icons.checkCircle, danger: Icons.xCircle, warning: Icons.alertCircle, info: Icons.infoCircle };
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    t.innerHTML = '<span class="toast__icon">' + (iconMap[type] || iconMap.info) + '</span><span class="toast__content">' + msg + '</span><button class="toast__close" aria-label="بستن">' + Icons.close + '</button>';
    c.appendChild(t);
    t.querySelector('.toast__close').onclick = function () { removeToast(t); };
    setTimeout(function () { removeToast(t); }, 4000);
  }

  function removeToast(t) {
    if (!t || t.classList.contains('is-leaving')) return;
    t.classList.add('is-leaving');
    setTimeout(function () { t.remove(); }, 300);
  }

  /* ── Cart Operations ─────────────────────────────────────── */

  /* Cart line identity: product + pricing mode + selected add-on option IDs
     (sorted). Different option selections stay separate lines; lines without
     options keep the legacy `id_mode` key so existing carts keep working. */
  function optionIdsOf(options) {
    var ids = (options || []).map(function (o) { return Number(o && o.id); })
      .filter(function (n) { return Number.isInteger(n) && n > 0; });
    ids.sort(function (a, b) { return a - b; });
    return ids;
  }

  function getCartKey(id, pricingMode, options) {
    var base = id + '_' + (pricingMode || 'retail');
    var ids = optionIdsOf(options);
    if (!ids.length) return base;
    return base + '_opt' + ids.join('_');
  }

  /* Pricing helper (retail only) */
  function getProductPrice(product) {
    if (!product) return 0;
    return Number(product.price) || 0;
  }

  function addToCart(id, pricingMode, options) {
    var p = AppData.products.find(function (x) { return x.id === id; });
    if (!p) return null;
    if (!pricingMode) {
      var pc = document.querySelector('.priceChanger[data-pricing="' + id + '"]');
      pricingMode = (pc && pc.getAttribute('data-selected-mode')) || 'retail';
    }
    var basePrice = getProductPrice(p);
    var opts = options || [];
    var optionsPrice = opts.reduce(function(sum, opt) { return sum + (opt.price || 0); }, 0);
    var price = basePrice + optionsPrice;
    var key = getCartKey(id, pricingMode, opts);
    var ex = state.cart.find(function (x) { return x.key === key; });
    if (ex) {
      ex.quantity += 1;
      ex.options = opts;
      ex.price = price;
    } else {
      state.cart.push({ key: key, id: p.id, name: p.name, price: price, basePrice: basePrice, pricingMode: pricingMode, quantity: 1, brandName: p.brandName, image: p.image, slug: p.slug, options: opts });
    }
    saveCart(state.cart); updateCartUI();
    var modeLabel = '';
    var optLabel = opts.length ? ' + ' + opts.length + ' گزینه' : '';
    showToast(p.name + modeLabel + optLabel + ' به سبد خرید اضافه شد');
    return key;
  }

  function removeFromCart(key) {
    state.cart = state.cart.filter(function (x) { return x.key !== key; });
    saveCart(state.cart); updateCartUI();
    /* Product detail: removing (qty stepper down to 0) is silent there too.
       Cart page / drawer / account cart keep the confirmation toast. */
    if (!isProductPage()) showToast('محصول از سبد خرید حذف شد', 'info');
  }

  function updateCartQty(key, delta) {
    var item = state.cart.find(function (x) { return x.key === key; });
    if (!item) return;
    // Purchase settings (admin): quantity editing may be disabled.
    // Server re-validates regardless; this is only a fast local guard.
    try {
      var ps = readJSON('as_purchase_settings', null);
      if (ps && ps.allowQtyEdit === false) {
        showToast('ویرایش تعداد در سبد خرید توسط فروشگاه غیرفعال شده است.', 'danger');
        updateCartUI();
        return;
      }
      if (ps && delta > 0 && ps.maxQty > 0 && (item.quantity + delta) > ps.maxQty) {
        showToast('حداکثر تعداد هر محصول ' + ps.maxQty + ' عدد است.', 'danger');
        updateCartUI();
        return;
      }
    } catch (e) {}
    item.quantity += delta;
    if (item.quantity <= 0) { removeFromCart(key); return; }
    saveCart(state.cart); updateCartUI();
  }

  function getCartTotal() { return state.cart.reduce(function (s, i) { return s + i.price * i.quantity; }, 0); }
  function getCartCount() { return state.cart.reduce(function (s, i) { return s + i.quantity; }, 0); }

  /* Last cart quantity pushed into the badges — lets updateCartUI() notice
     that the cart grew (first item, extra unit, or another product). */
  var lastRenderedCartCount = null;

  /* Brief scale/bounce on the compact product-page header cart icon so the
     user can see where "افزودن به سبد خرید" landed. Scoped in CSS to
     .mobile-header--pdp, so desktop and every other page stay untouched.
     Cleanup rides on the CSS animationend event (no timers), and the
     handler is bound once per element so rapid taps never stack it. */
  function bumpPdpCartIcon() {
    var icon = document.querySelector('.mobile-header--pdp .mobile-header-pdp__cart');
    /* Hidden (desktop layout renders the compact header but never shows it):
       no animation can run there, so skip — otherwise the class would stick
       with no animationend to clear it. */
    if (!icon || !icon.getClientRects().length) return;
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    } catch (e) {}
    if (!icon.__cartBumpBound) {
      icon.__cartBumpBound = true;
      icon.addEventListener('animationend', function (e) {
        if (e.target !== icon) return;
        icon.classList.remove('is-bumped');
      });
    }
    /* Remove, force a reflow, re-add: back-to-back adds restart the keyframes. */
    icon.classList.remove('is-bumped');
    void icon.offsetWidth;
    icon.classList.add('is-bumped');
  }

  function updateCartUI() {
    var badges = $$('.header-action__badge');
    var count = getCartCount();
    badges.forEach(function (b) {
      if (b.textContent && !isNaN(parseInt(b.textContent))) {
        b.textContent = count;
        b.style.display = count > 0 ? 'flex' : 'none';
      }
    });
    var bb = $('#mobile-bottom-cart-badge');
    if (bb) {
      bb.textContent = count;
      bb.style.display = count > 0 ? 'flex' : 'none';
    }
    /* Badge above already carries the new quantity; only then bounce the icon. */
    if (lastRenderedCartCount !== null && count > lastRenderedCartCount) bumpPdpCartIcon();
    lastRenderedCartCount = count;
    renderCartDrawer();
  }

  function renderCartDrawer() {
    var body = $('.drawer__body');
    var footer = $('.drawer__footer');
    if (!body) return;
    if (state.cart.length === 0) {
      body.innerHTML = '<div class="cart-empty"><span class="cart-empty__icon">' + Icons.shoppingBag + '</span><p class="cart-empty__text">سبد خرید شما خالی است</p><button class="btn btn-primary" onclick="App.toggleCartDrawer()">مشاهده محصولات</button></div>';
      if (footer) footer.style.display = 'none';
      return;
    }
    body.innerHTML = state.cart.map(function (item) {
      var optionsHtml = '';
      if (item.options && item.options.length) {
        optionsHtml = '<div class="cart-item__options" style="margin-top:4px;font-size:var(--font-size-xs);color:var(--text-muted)">' +
          item.options.map(function(opt) {
            return '<span>• ' + opt.title + ': ' + Format.price(opt.price) + ' تومان</span>';
          }).join('<br>') +
        '</div>';
      }
      return '<div class="cart-item"><div class="cart-item__image"><img src=\"' + item.image + '\" alt=\"' + item.name + '\" loading=\"lazy\" class=\"cart-item__img\"></div><div class="cart-item__details"><span class="cart-item__title">' + item.name + '</span><span class="cart-item__price">' + Format.priceWithCurrency(item.price) + '</span>' + optionsHtml + '<div class="cart-item__quantity"><button class="cart-item__qty-btn" onclick="App.updateCartQty(\'' + item.key + '\',-1)">' + Icons.minus + '</button><span class="cart-item__qty-value">' + item.quantity + '</span><button class="cart-item__qty-btn" onclick="App.updateCartQty(\'' + item.key + '\',1)">' + Icons.plus + '</button></div></div><button class="cart-item__remove" onclick="App.removeFromCart(\'' + item.key + '\')">' + Icons.trash + '</button></div>';
    }).join('');
    if (footer) {
      footer.style.display = 'block';
      var total = getCartTotal();
      footer.innerHTML = '<div class="cart-summary"><div class="cart-summary__row"><span>جمع سبد خرید</span><span>' + Format.priceWithCurrency(total) + '</span></div><div class="cart-summary__row cart-summary__row--total"><span>مبلغ قابل پرداخت</span><span>' + Format.priceWithCurrency(total) + '</span></div><a href="/checkout/step1" class="btn btn-primary btn-block btn-lg">تکمیل خرید</a><a href="/cart" class="btn btn-secondary btn-block" onclick="App.toggleCartDrawer()">مشاهده سبد خرید</a></div>';
    }
  }

  /* ── Wishlist Operations ──────────────────────────────────── */
  function toggleWishlist(id) {
    var idx = state.wishlist.indexOf(id);
    if (idx === -1) { state.wishlist.push(id); showToast('به علاقه‌مندی‌ها اضافه شد'); } else { state.wishlist.splice(idx, 1); showToast('از علاقه‌مندی‌ها حذف شد', 'info'); }
    saveWishlist(state.wishlist); updateWishlistUI();
  }

  function updateWishlistUI() {
    $$('.product-card__action-btn[data-wishlist]').forEach(function (btn) {
      var id = parseInt(btn.dataset.wishlist);
      var active = state.wishlist.includes(id);
      /* Avoid rewriting identical markup (a needless re-render flash on
         every catalog refresh); only touch nodes whose state changed. */
      if (btn.classList.contains('is-active') === active && btn._asWishInit) return;
      btn._asWishInit = true;
      btn.classList.toggle('is-active', active);
      btn.innerHTML = active ? Icons.heartFill : Icons.heart;
    });
  }

  /* ── Shared Product Card (single source of truth for all pages) ── */
  function productCardFallbackImg(p) {
    return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><rect width="100" height="100" fill="%23f3f4f6"/><text x="50" y="55" text-anchor="middle" fill="%239ca3af" font-size="12">' + (p.brandName || '') + '</text></svg>');
  }

  function renderProductCardCartControl(id) {
    id = parseInt(id, 10);
    var qty = 0;
    try {
      var pc = document.querySelector('.priceChanger[data-pricing="' + id + '"]');
      var mode = (pc && pc.getAttribute('data-selected-mode')) || 'retail';
      var key = getCartKey(id, mode, []);
      var item = (state.cart || []).find(function (x) { return x.key === key; });
      if (item) qty = item.quantity;
    } catch (e) {}
    if (qty > 0) {
      return '<div class="qty-selector qty-selector--buybox product-card__qty" role="group" aria-label="تعداد محصول در سبد خرید">' +
        '<button type="button" class="qty-selector__btn qty-selector__btn--minus" onclick="App.updateProductCardQty(' + id + ', -1)" aria-label="کاهش تعداد">' + Icons.minus + '</button>' +
        '<span class="qty-selector__value product-card__qty-value">' + Format.toPersianNumber(qty) + '</span>' +
        '<button type="button" class="qty-selector__btn qty-selector__btn--plus" onclick="App.updateProductCardQty(' + id + ', 1)" aria-label="افزایش تعداد">' + Icons.plus + '</button>' +
      '</div>';
    }
    return '<button type="button" class="btn btn-primary btn-block product-card__add-to-cart" onclick="App.addToProductCard(' + id + ')" aria-label="افزودن به سبد خرید">افزودن به سبد خرید</button>';
  }

  function syncProductCards() {
    try {
      var containers = document.querySelectorAll('.product-card__cart[data-product-id]');
      for (var i = 0; i < containers.length; i++) {
        var container = containers[i];
        var id = parseInt(container.getAttribute('data-product-id'), 10);
        if (id) container.innerHTML = renderProductCardCartControl(id);
      }
    } catch (e) {}
  }

  function addToProductCard(id) {
    var mode = 'retail';
    try {
      var pc = document.querySelector('.priceChanger[data-pricing="' + id + '"]');
      mode = (pc && pc.getAttribute('data-selected-mode')) || 'retail';
    } catch (e) {}
    var key = addToCart(id, mode);
    try { syncProductCards(); } catch (e) {}
    return key;
  }

  function updateProductCardQty(id, delta) {
    var mode = 'retail';
    try {
      var pc = document.querySelector('.priceChanger[data-pricing="' + id + '"]');
      mode = (pc && pc.getAttribute('data-selected-mode')) || 'retail';
    } catch (e) {}
    var key = getCartKey(id, mode, []);
    var item = (state.cart || []).find(function (x) { return x.key === key; });
    if (!item) { try { syncProductCards(); } catch (e) {} return; }
    updateCartQty(key, delta);
  }

  function renderProductCard(p, opts) {
    opts = opts || {};
    var r = Format.rating(p.rating);
    var stars = '';
    for (var i = 0; i < r.full; i++) stars += Icons.star;
    for (var i = 0; i < r.empty; i++) stars += Icons.starEmpty;
    var badges = [];
    if (p.discount > 0) badges.push('<span class="badge badge-discount">٪' + Format.toPersianNumber(p.discount) + '</span>');
    if (p.isNew) badges.push('<span class="badge badge-new">جدید</span>');
    if (opts.showStock && !p.inStock) badges.push('<span class="badge badge-outline" style="color:var(--color-danger)">ناموجود</span>');
    var wlActive = state.wishlist.indexOf(p.id) !== -1;
    var brandLabel = p.brandName || '';
    var stockHtml = p.inStock
      ? '<span class="product-card__stock product-card__stock--in">' + Icons.checkCircle.replace('width="20" height="20"', 'width="12" height="12"') + ' موجود در انبار</span>'
      : '<span class="product-card__stock product-card__stock--out">ناموجود</span>';
    var pricingHtml = '';
    var cardTheme = normalizeCardTheme(opts.theme || opts.cardTheme || opts.colorTheme || 'default');
    return '<div class="product-card product-card--theme-' + cardTheme + ' product-card--themed" data-card-theme="' + cardTheme + '" data-theme="' + cardTheme + '" data-color-theme="' + cardTheme + '">' +
      '<div class="product-card__image">' +
        '<img src="' + p.image + '" alt="' + p.name + '" loading="lazy" class="product-card__img" onerror="this.onerror=null;this.src=\'' + productCardFallbackImg(p) + '\'">' +
        (badges.length ? '<div class="product-card__badges">' + badges.join('') + '</div>' : '') +
        '<div class="product-card__actions">' +
          '<button class="product-card__action-btn" data-wishlist="' + p.id + '" onclick="App.toggleWishlist(' + p.id + ')" aria-label="افزودن به علاقه‌مندی‌ها">' + (wlActive ? Icons.heartFill : Icons.heart) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="product-card__body">' +
        (brandLabel ? '<span class="product-card__brand">' + brandLabel + '</span>' : '') +
        '<a href="/product/' + p.slug + '" class="product-card__title" style="color:inherit;text-decoration:none">' + p.name + '</a>' +
        '<div class="product-card__meta-row">' +
          '<div class="product-card__rating"><span class="product-card__stars">' + stars + '</span><span>(' + getReviewCount(p.id) + ')</span></div>' +
          stockHtml +
        '</div>' +
        '<div class="product-card__price" data-price-area="' + p.id + '">' +
          '<span class="product-card__price-current">' + Format.price(p.price) + ' <span class="product-card__price-currency">تومان</span></span>' +
          (p.oldPrice ? '<span class="product-card__price-old">' + Format.price(p.oldPrice) + '</span>' : '') +
        '</div>' +
        pricingHtml +
        '<div class="product-card__cart" data-product-id="' + p.id + '">' + renderProductCardCartControl(p.id) + '</div>' +
      '</div>' +
    '</div>';
  }

  /* ── Search ───────────────────────────────────────────────── */
  function normalizeSearch(s) {
    return (s || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function searchMatch(query, text) {
    var nq = normalizeSearch(query);
    var nt = normalizeSearch(text);
    if (!nq || !nt) return false;
    return nt.indexOf(nq) !== -1 || nq.indexOf(nt) !== -1;
  }

  function handleSearch(q, dropdown) {
    if (!dropdown) dropdown = $('.search-dropdown');
    if (!dropdown) return;
    var headerInput = $('.header-search input');
    if (!q || !q.trim()) {
      dropdown.innerHTML = renderSearchSuggestions();
      dropdown.classList.add('is-active');
      bindDropdownItems(dropdown);
      return;
    }
    var products = AppData.products.filter(function (p) {
      return searchMatch(q, p.name) || searchMatch(q, p.brandName) || searchMatch(q, p.category) || searchMatch(q, p.sku || '');
    }).slice(0, 5);
    var catSet = {};
    AppData.categories.forEach(function (c) {
      if (searchMatch(q, c.name) || searchMatch(q, c.slug)) catSet[c.id] = c;
    });
    AppData.products.forEach(function (p) {
      if (searchMatch(q, p.category) && AppData.categories) {
        AppData.categories.forEach(function (c) {
          if (c.name === p.category) catSet[c.id] = c;
        });
      }
    });
    var categories = Object.values(catSet).slice(0, 4);
    var brandSet = {};
    AppData.brands.forEach(function (b) {
      var key = b.name || b.slug;
      if (searchMatch(q, b.displayName) || searchMatch(q, b.name) || searchMatch(q, b.slug)) brandSet[key] = b;
    });
    AppData.products.forEach(function (p) {
      if (searchMatch(q, p.brandName)) {
        var b = AppData.brands.find(function (x) { return (x.name || x.slug) === p.brand; });
        if (b) brandSet[b.name || b.slug] = b;
      }
    });
    var brands = Object.values(brandSet).slice(0, 3);
    var articles = (AppData.articles || []).filter(function (a) {
      return searchMatch(q, a.title) || searchMatch(q, a.summary || '');
    }).slice(0, 3);
    if (!products.length && !categories.length && !brands.length && !articles.length) {
      dropdown.innerHTML = '<div class="search-dropdown__empty">نتیجه‌ای برای \u00AB' + escHtml(q) + '\u00BB پیدا نشد.</div>';
      dropdown.classList.add('is-active');
      return;
    }
    var html = '';
    if (products.length) {
      html += '<div class="search-dropdown__section"><div class="search-dropdown__label">محصولات</div>';
      products.forEach(function (p) {
        html += '<a href="/product/' + p.slug + '" class="search-dropdown__item"><div class="search-dropdown__item-img"><img src="' + p.image + '" alt="" onerror="this.style.display=\'none\'"></div><div class="search-dropdown__item-info"><div class="search-dropdown__item-title">' + p.name + '</div><div class="search-dropdown__item-meta">' + p.brandName + ' \u2022 ' + p.category + '</div></div><div class="search-dropdown__item-price">' + Format.price(p.price) + '</div></a>';
      });
      html += '</div>';
    }
    if (categories.length) {
      html += '<div class="search-dropdown__section"><div class="search-dropdown__label">دسته\u200Cبندی\u200Cها</div>';
      categories.forEach(function (c) {
        var cnt = AppData.products.filter(function (p) { return p.category === c.name; }).length;
        html += '<a href="/shop?category=' + c.slug + '" class="search-dropdown__item"><div class="search-dropdown__item-icon">' + Icons.package + '</div><div class="search-dropdown__item-info"><div class="search-dropdown__item-title">' + c.name + '</div><div class="search-dropdown__item-meta">' + cnt + ' محصول</div></div></a>';
      });
      html += '</div>';
    }
    if (brands.length) {
      html += '<div class="search-dropdown__section"><div class="search-dropdown__label">برندها</div>';
      brands.forEach(function (b) {
        html += '<a href="/brand/' + (b.name || b.slug) + '" class="search-dropdown__item"><div class="search-dropdown__item-icon">' + Icons.star + '</div><div class="search-dropdown__item-info"><div class="search-dropdown__item-title">' + (b.displayName || b.name) + '</div></div></a>';
      });
      html += '</div>';
    }
    if (articles.length) {
      html += '<div class="search-dropdown__section"><div class="search-dropdown__label">مقالات</div>';
      articles.forEach(function (a) {
        html += '<a href="/article/' + a.id + '" class="search-dropdown__item"><div class="search-dropdown__item-icon">' + Icons.layers + '</div><div class="search-dropdown__item-info"><div class="search-dropdown__item-title">' + a.title + '</div></div></a>';
      });
      html += '</div>';
    }
    html += '<a href="/shop?q=' + encodeURIComponent(q) + '" class="search-dropdown__view-all">مشاهده همه نتایج \u2190</a>';
    dropdown.innerHTML = html;
    dropdown.classList.add('is-active');
    bindDropdownItems(dropdown);
  }

  function renderSearchSuggestions() {
    var html = '';
    (AppData.searchSuggestions || []).forEach(function (s) {
      html += '<a href="/shop?q=' + encodeURIComponent(s) + '" class="search-dropdown__item"><div class="search-dropdown__item-icon">' + Icons.search + '</div><div class="search-dropdown__item-info"><div class="search-dropdown__item-title">' + s + '</div></div></a>';
    });
    return html;
  }

  function closeSearchDropdown() {
    $$('.search-dropdown').forEach(function (d) { d.classList.remove('is-active'); d.innerHTML = ''; });
  }

  function bindDropdownItems(dropdown) {
    dropdown.querySelectorAll('.search-dropdown__item').forEach(function (item) {
      item.addEventListener('mousedown', function (e) { e.preventDefault(); });
    });
  }

  function escHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* ── Mobile Menu ──────────────────────────────────────────── */
  function toggleMobileMenu() {
    state.mobileMenuOpen = !state.mobileMenuOpen;
    var menu = $('.mobile-menu');
    var overlay = $('.drawer-overlay');
    if (menu) {
      menu.style.transform = '';
      menu.classList.toggle('is-active', state.mobileMenuOpen);
    }
    if (overlay) overlay.classList.toggle('is-active', state.mobileMenuOpen);
    document.body.style.overflow = state.mobileMenuOpen ? 'hidden' : '';
    document.documentElement.style.overflow = state.mobileMenuOpen ? 'hidden' : '';
  }

  /* ── Mobile menu backdrop tap + swipe to close ────────── */
  function bindMobileMenuSwipe() {
    var menu = $('.mobile-menu');
    if (!menu || menu.__swipeBound) return;
    menu.__swipeBound = true;
    var startX = 0, startY = 0, lastX = 0;
    var dragging = false, horizontal = null;
    menu.addEventListener('touchstart', function (e) {
      if (!state.mobileMenuOpen || e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      lastX = 0;
      dragging = true;
      horizontal = null;
      menu.style.transition = 'none';
    }, { passive: true });
    menu.addEventListener('touchmove', function (e) {
      if (!dragging || !state.mobileMenuOpen) return;
      var t = e.touches[0];
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      if (horizontal === null) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        horizontal = Math.abs(dx) > Math.abs(dy) * 1.25;
        if (!horizontal) {
          dragging = false;
          menu.style.transition = '';
          return;
        }
      }
      if (!horizontal) return;
      if (dx < 0) dx = 0;
      if (dx > menu.offsetWidth) dx = menu.offsetWidth;
      lastX = dx;
      menu.style.transform = 'translateX(' + dx + 'px)';
      e.preventDefault();
    }, { passive: false });
    menu.addEventListener('touchend', function () {
      if (!dragging) {
        dragging = false;
        menu.style.transition = '';
        return;
      }
      dragging = false;
      menu.style.transition = '';
      var threshold = Math.max(56, Math.round(menu.offsetWidth * 0.22));
      if (horizontal && lastX > threshold) {
        toggleMobileMenu();
      } else {
        menu.style.transform = '';
      }
      horizontal = null;
      lastX = 0;
    });
    menu.addEventListener('touchcancel', function () {
      dragging = false;
      horizontal = null;
      lastX = 0;
      menu.style.transition = '';
      menu.style.transform = '';
    });
  }

  /* ── Cart Drawer (removed; replaced by cart popover) ────────── */
  function toggleCartDrawer() {
    /* No-op: cart drawer replaced by header-anchored popover */
  }

  /* ── Header auth area (Digikala-style, dynamic by login state) ──
     LOGGED OUT (ref image 2): bordered "ورود | ثبت‌نام" button + login icon.
     LOGGED IN  (ref image 1): user icon button + account dropdown menu.
     Uses only existing auth state (getCurrentUser), no fake data. */
  function escAuthHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function headerAuthHTML() {
    /* Gate on sessionReady: never show logged-in state (logout button) until
       the backend has confirmed the token. This prevents stale localStorage
       sessions from leaking the logout button to logged-out visitors. */
    var user = sessionReady ? getCurrentUser() : null;
    var dropdownArrow = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    if (!user) {
      var loginIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>';
      return '<a href="/login" class="header-login-btn" data-tooltip="ورود و ثبت‌نام" aria-label="ورود و ثبت‌نام"><span class="header-login-btn__icon" aria-hidden="true">' + loginIcon + '</span><span class="header-login-btn__text">ورود | ثبت‌نام</span></a>';
    }
    var fullName = escAuthHtml(((user.firstName || '') + ' ' + (user.lastName || '')).trim() || user.mobile || user.email || 'حساب کاربری');
    var pkgIcon = Icons.package || '';
    var pinIcon = Icons.mapPin || '';
    var heartIcon = Icons.heart || '';
    var userIcon = Icons.user || '';
    var logoutIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
    var backIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
    return '<div class="header-account" data-account-menu>'
      + '<a href="/account" class="header-action header-account-action is-logged-in" data-tooltip="حساب کاربری" aria-label="حساب کاربری" aria-haspopup="true" aria-expanded="false"><span class="header-action__icon">' + Icons.user + '</span><span class="header-account-action__arrow" aria-hidden="true">' + dropdownArrow + '</span></a>'
      + '<div class="header-account-dropdown" role="menu" aria-label="منوی حساب کاربری">'
      + '<a href="/account" class="header-account-dropdown__header" role="menuitem"><span class="header-account-dropdown__back" aria-hidden="true">' + backIcon + '</span><span class="header-account-dropdown__name">' + fullName + '</span></a>'
      + '<div class="header-account-dropdown__divider" aria-hidden="true"></div>'
      + '<a href="/account/orders" class="header-account-dropdown__item" role="menuitem"><span class="header-account-dropdown__label">سفارش‌ها</span><span class="header-account-dropdown__icon" aria-hidden="true">' + pkgIcon + '</span></a>'
      + '<a href="/account/addresses" class="header-account-dropdown__item" role="menuitem"><span class="header-account-dropdown__label">آدرس‌ها</span><span class="header-account-dropdown__icon" aria-hidden="true">' + pinIcon + '</span></a>'
      + '<a href="/account/wishlist" class="header-account-dropdown__item" role="menuitem"><span class="header-account-dropdown__label">لیست‌ها</span><span class="header-account-dropdown__icon" aria-hidden="true">' + heartIcon + '</span></a>'
      + '<a href="/account/profile" class="header-account-dropdown__item" role="menuitem"><span class="header-account-dropdown__label">جزئیات حساب</span><span class="header-account-dropdown__icon" aria-hidden="true">' + userIcon + '</span></a>'
      + pwaInstallDropdownItemHTML()
      + '<div class="header-account-dropdown__divider" aria-hidden="true"></div>'
      + '<button type="button" class="header-account-dropdown__item header-account-dropdown__logout" data-action="logout" role="menuitem"><span class="header-account-dropdown__label">خروج از حساب کاربری</span><span class="header-account-dropdown__icon" aria-hidden="true">' + logoutIcon + '</span></button>'
      + '</div></div>';
  }

  function mobileAuthHTML() {
    var user = sessionReady ? getCurrentUser() : null;
    return user
      ? '<a href="/account" class="header-action" aria-label="حساب کاربری">' + Icons.user + '</a>'
      : '<a href="/login" class="header-action" aria-label="ورود و ثبت‌نام">' + Icons.user + '</a>';
  }

  function notifyAuthChange() {
    try { document.dispatchEvent(new CustomEvent('as_auth_change')); } catch (e) {}
  }

  /* -- Address bar (desktop + mobile) -- */
  function getAddressTitle(a){ if(!a||!a.length) return 'لطفاً آدرس خود را ثبت کنید'; var d=a.find(function(x){return x.isDefault})||a[0]; return d.title||'آدرس ثبت‌شده'; }
  function refreshAddressBars(){ var m=document.querySelector('.mobile-address-bar__text'),de=document.querySelector('.desktop-address-bar__text'); var t='لطفاً آدرس خود را ثبت کنید'; try{ if(isLoggedIn()) t=getAddressTitle(getUserData('addresses',[])); }catch(e){} if(m) m.textContent=t; if(de) de.textContent=t; }
  function initAddressBars(){ refreshAddressBars(); document.addEventListener('as_auth_change', refreshAddressBars); window.addEventListener('storage', function(e){ if(e&&e.key&&e.key.indexOf('_addresses')!==-1) refreshAddressBars(); }); document.addEventListener('as_addresses_change', refreshAddressBars); document.addEventListener('visibilitychange', function(){ if(!document.hidden) refreshAddressBars(); }); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', initAddressBars); else initAddressBars();

  /* ── PWA install ("نصب اپلیکیشن") shared markup ─────────────
     Hidden by default; assets/js/pwa.js reveals it on every page
     (unless running in standalone mode) and opens the RTL install
     modal — native `beforeinstallprompt` when available, otherwise
     browser-specific manual steps. Kept in common.js so the option
     appears on ALL pages (account dropdown + mobile menu). */
  var PWA_INSTALL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

  function isStandalone() {
    try {
      return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        (window.navigator && window.navigator.standalone === true);
    } catch (e) { return false; }
  }

  function pwaInstallDropdownItemHTML() {
    if (isStandalone()) return '';
    return '<button type="button" class="header-account-dropdown__item" data-pwa-install hidden role="menuitem"><span class="header-account-dropdown__label">نصب اپلیکیشن</span><span class="header-account-dropdown__icon" aria-hidden="true">' + PWA_INSTALL_SVG + '</span></button>';
  }

  function pwaInstallMenuHTML() {
    if (isStandalone()) return '';
    return '<button type="button" class="mobile-menu__link mobile-menu__link--pwa" data-pwa-install hidden>' + PWA_INSTALL_SVG + ' نصب اپلیکیشن</button>';
  }

  function syncPwaInstallVisibility(scope) {
    try {
      if (isStandalone()) {
        var root = (scope && scope.querySelectorAll) ? scope : document;
        root.querySelectorAll('[data-pwa-install]').forEach(function (b) { b.hidden = true; });
        return;
      }
      if (window.CamzyPWA && typeof window.CamzyPWA.getState === 'function') {
        var st = window.CamzyPWA.getState();
        if (st && st.installable && !st.installed) {
          var root = (scope && scope.querySelectorAll) ? scope : document;
          root.querySelectorAll('[data-pwa-install]').forEach(function (b) { b.hidden = false; });
        } else if (st && st.installed) {
          var root = (scope && scope.querySelectorAll) ? scope : document;
          root.querySelectorAll('[data-pwa-install]').forEach(function (b) { b.hidden = true; });
        }
      }
    } catch (e) {}
  }

  /* Re-render ONLY the auth area so login/logout updates the top bar
     without breaking search input, cart drawer or the rest of header.
     Idempotent: when the auth state is unchanged since the last render,
     the DOM is left untouched so polling (fetchMe/401) can never cause
     a visible re-render flash or steal focus. */
  /* The key must mirror exactly what headerAuthHTML()/mobileAuthHTML() will
     render, which is gated on sessionReady. Otherwise the pre-confirmation
     render stamps 'in:<id>' while still painting the logged-out button, and
     the post-confirmation refresh becomes a no-op — leaving the header stuck
     on "ورود | ثبت‌نام" after a successful login. */
  function currentAuthKey() {
    try { var u = sessionReady ? getCurrentUser() : null; return u ? ('in:' + u.id) : 'out'; } catch (e) { return 'out'; }
  }
  function refreshHeaderAuth() {
    var authKey = currentAuthKey();
    var actions = document.querySelector('.site-header .header-actions');
    if (actions) {
      if (actions.getAttribute('data-auth-key') === authKey) {
        try { updateCartUI(); } catch (e) {}
        try { refreshAddressBars(); } catch (e) {}
      } else {
      var cartCount = 0;
      try { cartCount = getCartCount(); } catch (e) {}
      var cartBadge = actions.querySelector('.header-action__badge');
      var cartCountText = cartBadge ? cartBadge.textContent : String(cartCount);
      actions.innerHTML = headerAuthHTML()
        + '<span class="header-divider" aria-hidden="true"></span>'
        + notifBellHTML()
        + '' + cartPopoverHTML() + '';
      actions.setAttribute('data-auth-key', authKey);
      bindCartPopovers(actions);
      bindAccountDropdown(actions);
      bindNotifBells(actions);
      bindLogoutButtons(actions);
      syncPwaInstallVisibility(actions);
      try { updateCartUI(); } catch (e) {}
      try { refreshAddressBars(); } catch (e) {}
      if (cartBadge && cartCountText && !isNaN(parseInt(cartCountText, 10))) {
        /* updateCartUI already synced from state; nothing extra needed */
      }
      }
    }
    var mobileHeader = document.getElementById('mobile-header');
    if (mobileHeader) {
      var wrap = mobileHeader.querySelector('.container');
      if (wrap) {
        if (mobileHeader.getAttribute('data-auth-key') === authKey) return;
        var links = wrap.querySelectorAll(':scope > a.header-action');
        if (links.length) {
          var tmp = document.createElement('div');
          tmp.innerHTML = mobileAuthHTML();
          var fresh = tmp.firstChild;
          if (fresh) links[0].replaceWith(fresh);
          mobileHeader.setAttribute('data-auth-key', authKey);
        }
      }
    }
  }

  function bindAccountDropdown(scope) {
    var root = (scope && scope.querySelector) ? scope : document;
    var menus = root.querySelectorAll ? root.querySelectorAll('[data-account-menu]') : [];
    menus.forEach(function (menu) {
      if (menu.__accountBound) return;
      menu.__accountBound = true;
      var btn = menu.querySelector('.header-account-action');
      var dd = menu.querySelector('.header-account-dropdown');
      if (!btn || !dd) return;
      var arrow = btn.querySelector('.header-account-action__arrow');
      if (arrow) {
        arrow.addEventListener('click', function (e) {
          /* Chevron is a pure dropdown toggle: open/close only, never navigate. */
          e.preventDefault();
          e.stopPropagation();
          var willOpen = !menu.classList.contains('is-open');
          if (willOpen) closeOtherHeaderDropdowns('account');
          closeAllAccountMenus(menu);
          menu.classList.toggle('is-open', willOpen);
          btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        });
      }
      btn.addEventListener('click', function (e) {
        /* Allow keyboard/touch toggle; plain left-click still navigates on second click.
           First click opens the menu (like Digikala), second follows the link. */
        if (!menu.classList.contains('is-open')) {
          e.preventDefault();
          closeOtherHeaderDropdowns('account');
          closeAllAccountMenus(menu);
          menu.classList.add('is-open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  function closeAllAccountMenus(except) {
    document.querySelectorAll('[data-account-menu].is-open').forEach(function (m) {
      if (m !== except) {
        m.classList.remove('is-open');
        var b = m.querySelector('.header-account-action');
        if (b) b.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ── Header dropdown exclusivity ─────────────────────────────
     The account menu, notifications, cart, category mega menu and
     search suggestions share the same header bar: opening one closes
     every other open panel so they can never overlap. Each panel is
     closed through its own helper, keeping its existing animation,
     aria state and outside-click rules. */
  function closeOtherHeaderDropdowns(keep) {
    if (keep !== 'account') closeAllAccountMenus();
    if (keep !== 'notif') closeAllNotifPanels();
    if (keep !== 'cart') closeAllCartPopovers();
    if (keep !== 'categories') {
      var dd = document.querySelector('.categories-dropdown.is-active');
      if (dd) {
        dd.classList.remove('is-active');
        var cb = document.querySelector('.nav-categories-btn');
        if (cb) cb.setAttribute('aria-expanded', 'false');
      }
    }
    if (keep !== 'search') closeSearchDropdown();
  }

  function bindLogoutButtons(scope) {
    var root = (scope && scope.querySelector) ? scope : document;
    var btns = root.querySelectorAll ? root.querySelectorAll('[data-action="logout"]') : [];
    btns.forEach(function (btn) {
      if (btn.__logoutBound) return;
      btn.__logoutBound = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        Promise.resolve(logout()).then(function () {
          notifyAuthChange();
        try { showToast('با موفقیت خارج شدید.', 'info'); } catch (err) {}
        var path = window.location.pathname || '';
        var onAccount = /account|checkout/.test(path) || path === '/cart';
        setTimeout(function () {
          if (onAccount) window.location.href = '/login';
          else window.location.reload();
        }, 450);
        });
      });
    });
  }

  function isAccountPage() {
    // Clean URLs (/account, /cart, /account/orders/…) map to the same account shells.
    var file = storeFile().toLowerCase();
    return file.indexOf('account') === 0;
  }

  /* ── Render Header ────────────────────────────────────────── */
  function getCachedStoreName() {
    try {
      var cached = localStorage.getItem('as_store_settings');
      if (cached) {
        var s = JSON.parse(cached);
        return s['store.name'] || '';
      }
    } catch (e) {}
    return '';
  }
  /* Baked (pre-rendered) headers — e.g. the homepage — ship promo-topbar
     messages as plain text spans without the optional banner-image slot
     that the template markup and the CMS (Admin → بنرهای تبلیغاتی) rely on.
     Upgrade such messages in place (never inside a Visual-Builder page
     header, which owns its own markup) so a saved promo image can render. */
  function ensurePromoMsgImageSlots(rootEl) {
    try {
      var msgs = rootEl.querySelectorAll('.promo-topbar__msg');
      for (var i = 0; i < msgs.length; i++) {
        var m = msgs[i];
        if (m.closest && m.closest('[data-pb-page-header]')) continue;
        if (m.querySelector('.promo-topbar__img') || m.querySelector('.promo-topbar__text')) continue;
        var txt = document.createElement('span');
        txt.className = 'promo-topbar__text';
        while (m.firstChild) txt.appendChild(m.firstChild);
        var img = document.createElement('img');
        img.className = 'promo-topbar__img';
        img.setAttribute('src', '');
        img.setAttribute('alt', '');
        img.style.display = 'none';
        m.appendChild(img);
        m.appendChild(txt);
      }
    } catch (e) {}
  }
  function renderHeader(el) {
    // Visual Builder round-trip: a non-empty placeholder already holds saved
    // header markup — preserve it instead of overwriting with the template.
    if (el.innerHTML.trim()) { try { if (isAccountPage()) el.classList.add('is-account-header'); } catch (e) {} try { ensurePromoMsgImageSlots(el); } catch (e) {} return; }
    var currentPage = storeFile();
    function isActive(page) { return currentPage === page ? 'is-active' : ''; }

    var authHtml = headerAuthHTML();
    var hideSearch = isAccountPage();
    var _addrText='لطفاً آدرس خود را ثبت کنید'; try{ if(isLoggedIn()) _addrText=getAddressTitle(getUserData('addresses',[])); }catch(e){} var _addrEsc=_addrText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    var searchHtml = hideSearch ? '' : '<div class="header-search"><div class="search-input-wrapper"><span class="search-input__icon" aria-hidden="true">' + Icons.search.replace('width="20" height="20"', 'width="20" height="20"') + '</span><input type="text" class="search-input" placeholder="جستجو" autocomplete="off"><span class="search-input__shortcut" aria-hidden="true">Ctrl+K</span></div><div class="search-dropdown"></div></div>';
    var storeName = getCachedStoreName() || 'کمزی';
    var _authKey = currentAuthKey();

el.innerHTML = '\
    <header class="site-header">\
    <div class="promo-topbar" role="status" aria-live="polite"><div class="promo-topbar__viewport"><span class="promo-topbar__msg is-active"><img class="promo-topbar__img" src="" alt="" style="display:none"><span class="promo-topbar__text">ارسال رایگان برای سفارش‌های بالای ۵۰۰ هزار تومان</span></span><span class="promo-topbar__msg"><img class="promo-topbar__img" src="" alt="" style="display:none"><span class="promo-topbar__text">۷ روز ضمانت بازگشت کالا بدون قید و شرط</span></span><span class="promo-topbar__msg"><img class="promo-topbar__img" src="" alt="" style="display:none"><span class="promo-topbar__text">تضمین اصالت کالا با گارانتی معتبر</span></span></div></div>\
    <div class="header-main"><div class="container">\
    <a href="/" class="header-logo"><span class="header-logo__icon">' + Icons.flash.replace('width="24" height="24"', 'width="24" height="24"') + '</span><span class="header-logo__text"><span class="header-logo__title">' + storeName + '</span><span class="header-logo__subtitle">فروشگاه تخصصی دوربین مداربسته و سیستم‌های امنیتی</span></span></a>\
    ' + searchHtml + '\
    <div class="header-actions" data-auth-key="' + _authKey + '">\
    ' + authHtml + '\
    <span class="header-divider" aria-hidden="true"></span>\
    ' + notifBellHTML() + '\
    ' + cartPopoverHTML() + '\
    </div></div></div>\
    <nav class="site-nav" aria-label="ناوبری اصلی"><div class="container">\
    <div class="nav-categories">\
    <button type="button" class="nav-categories-btn" aria-expanded="false" aria-controls="categories-dropdown">' + Icons.menu.replace('width="18" height="18"', 'width="18" height="18"') + ' دسته‌بندی کالاها</button>\
    <div class="categories-dropdown" id="categories-dropdown"></div>\
    </div>\
    <div class="nav-right">\
    <a href="/" class="nav-link ' + isActive('index.html') + '">' + Icons.home + ' صفحه اصلی</a>\
    <a href="/shop" class="nav-link ' + isActive('shop.html') + '">' + Icons.store + ' فروشگاه</a>\
    <a href="/brands" class="nav-link ' + isActive('brands.html') + '">' + Icons.star + ' برندها</a>\
    <a href="/articles" class="nav-link ' + isActive('articles.html') + '">' + Icons.layers + ' مقالات</a>\
    <a href="/contact" class="nav-link ' + isActive('contact.html') + '">' + Icons.phone + ' تماس با ما</a>\
    <a href="/about" class="nav-link ' + isActive('about.html') + '">' + Icons.infoCircle + ' درباره ما</a>\
    </div>\
    </div></nav></header>';
    if (hideSearch) el.classList.add('is-account-header');
  }

  /* ── Render Mobile Header ─────────────────────────────────── */
  /* Product-detail pages (product.html, incl. clean /product/:ref URLs)
     use a compact header (close / search / cart / more) instead of the
     standard promo bar + hamburger + search input + account + notif bar. */
  function isProductPage() {
    try { return storeFile().toLowerCase() === 'product.html'; } catch (e) { return false; }
  }
  function renderMobileHeaderPdp(el) {
    /* Idempotent: static markup — a second pass must not rebuild it. */
    if (el.classList.contains('mobile-header--pdp') && el.querySelector('.mobile-header-pdp')) return;
    el.classList.add('mobile-header--pdp');
    el.classList.remove('is-account-header');
    el.innerHTML = '\
    <div class="mobile-header-pdp">\
    <div class="mobile-header-pdp__group">\
    <button type="button" class="mobile-header-pdp__btn" data-pdp-action="back" aria-label="بستن و بازگشت به صفحه قبل">' + Icons.close + '</button>\
    </div>\
    <div class="mobile-header-pdp__spacer" aria-hidden="true"></div>\
    <div class="mobile-header-pdp__group">\
    <button type="button" class="mobile-header-pdp__btn" data-pdp-action="search" aria-label="جستجو">' + Icons.search + '</button>\
    <a class="mobile-header-pdp__btn mobile-header-pdp__cart" href="/cart" aria-label="سبد خرید">' + Icons.cart + '<span class="header-action__badge" style="display:none">0</span></a>\
    <button type="button" class="mobile-header-pdp__btn" data-pdp-action="more" aria-label="گزینه‌های بیشتر" aria-haspopup="true" aria-expanded="false">' + Icons.moreVert + '</button>\
    </div>\
    </div>';
  }
  function renderMobileHeader(el) {
    if (isProductPage()) { renderMobileHeaderPdp(el); return; }
    el.classList.remove('mobile-header--pdp');
    var _mAuthKey = currentAuthKey();
    /* Idempotent: re-running with the same auth state must not rebuild
       the DOM (would flash the mobile bar and drop search focus). */
    if (el.getAttribute('data-auth-key') === _mAuthKey && el.querySelector('.mobile-header__search-wrap, .mobile-header-pdp, .container')) return;
    var authHtml = mobileAuthHTML();
    var hideSearch = isAccountPage();
    var mobileSearchHtml = hideSearch ? '' : '<div class="mobile-header__search-wrap"><input type="text" class="mobile-header__search-input" placeholder=" " autocomplete="off" aria-label="جستجو در کمزی"><span class="mobile-header__search-ph" aria-hidden="true"><span class="mobile-header__search-ph--muted">جستجو در</span><span class="mobile-header__search-ph--brand">کمزی</span></span><button class="mobile-header__search-icon" type="button">' + Icons.search + '</button><div class="search-dropdown search-dropdown--mobile"></div></div>';

    el.innerHTML = '\
    <div class="promo-topbar" role="status" aria-live="polite"><div class="promo-topbar__viewport"><span class="promo-topbar__msg is-active"><img class="promo-topbar__img" src="" alt="" style="display:none"><span class="promo-topbar__text">ارسال رایگان برای سفارش‌های بالای ۵۰۰ هزار تومان</span></span><span class="promo-topbar__msg"><img class="promo-topbar__img" src="" alt="" style="display:none"><span class="promo-topbar__text">۷ روز ضمانت بازگشت کالا بدون قید و شرط</span></span><span class="promo-topbar__msg"><img class="promo-topbar__img" src="" alt="" style="display:none"><span class="promo-topbar__text">تضمین اصالت کالا با گارانتی معتبر</span></span></div></div>\
    <div class="container">\
    <button class="mobile-header__menu-btn" aria-label="منو">' + Icons.menu + '</button>\
    ' + mobileSearchHtml + '\
    ' + authHtml + '\
    ' + notifBellHTML() + '\
    ' + cartPopoverHTML() + '\
    </div>';
    if (hideSearch) el.classList.add('is-account-header');
    el.setAttribute('data-auth-key', _mAuthKey);
  }

  /* ── Render Footer ────────────────────────────────────────── */
  function renderFooter(el) {
    // Visual Builder round-trip: preserve saved footer markup (still apply
    // store settings on top, as with the default template).
    if (el.innerHTML.trim()) { try { applyStoreSettingsToFooter(); } catch (e) {} return; }
    el.innerHTML = '\
    <footer class="site-footer"><div class="container">\
    <div class="footer-main">\
    <div class="footer-brand"><div class="footer-brand__logo"><span class="footer-brand__icon">' + Icons.flash.replace('width="24" height="24"', '') + '</span><span class="footer-brand__name" data-setting="store.name">کمزی</span></div><p class="footer-brand__desc" data-setting="store.desc">فروشگاه تخصصی دوربین مداربسته و سیستم‌های امنیتی با بیش از ۱۰ سال تجربه در ارائه بهترین برندهای دوربین مداربسته و سیستم‌های امنیتی به هموطنان عزیز.</p><div class="footer-brand__socials"><a href="#" class="footer-social" data-social="telegram" aria-label="تلگرام">' + Icons.telegram + '</a><a href="#" class="footer-social" data-social="instagram" aria-label="اینستاگرام">' + Icons.instagram + '</a><a href="#" class="footer-social" data-social="twitter" aria-label="توییتر">' + Icons.twitter + '</a><a href="#" class="footer-social" data-social="youtube" aria-label="یوتیوب">' + Icons.youtube + '</a></div></div>\
    <div class="footer-column"><h4 class="footer-column__title">دسترسی سریع</h4><div class="footer-links"><a href="/" class="footer-link">' + Icons.chevronLeft + ' صفحه اصلی</a><a href="/shop" class="footer-link">' + Icons.chevronLeft + ' فروشگاه</a><a href="/brands" class="footer-link">' + Icons.chevronLeft + ' برندها</a><a href="/articles" class="footer-link">' + Icons.chevronLeft + ' مقالات</a></div></div>\
    <div class="footer-column"><h4 class="footer-column__title">خدمات مشتریان</h4><div class="footer-links"><a href="/faq" class="footer-link">' + Icons.chevronLeft + ' سوالات متداول</a><a href="/returns" class="footer-link">' + Icons.chevronLeft + ' شرایط بازگشت</a><a href="/shipping" class="footer-link">' + Icons.chevronLeft + ' راهنمای ارسال</a><a href="/about" class="footer-link">' + Icons.chevronLeft + ' درباره ما</a><a href="/contact" class="footer-link">' + Icons.chevronLeft + ' تماس با ما</a></div></div>\
    <div class="footer-column"><h4 class="footer-column__title">ارتباط با ما</h4><div class="footer-links"><span class="footer-link" data-store-field="address">' + Icons.mapPin + ' تهران، خیابان ولیعصر، پلاک XXX</span><span class="footer-link" data-store-field="phone">' + Icons.phone + ' ۰۲۱-XXXX-XXXX</span><span class="footer-link" data-store-field="email">' + Icons.mail + ' info@camzy.com</span><span class="footer-link" data-store-field="website" style="direction:ltr;text-align:right">' + Icons.globe + ' www.camzy.com</span></div></div>\
    </div>\
    <div class="footer-bottom"><div class="container" style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-4)"><p class="footer-copyright">تمامی حقوق این وب‌سایت متعلق به فروشگاه <span class="footer-store-name" data-setting="store.name">کمزی</span> می‌باشد.</p><div class="footer-payment"><span class="footer-payment__title">نمادهای الکترونیکی:</span><div class="footer-payment__icons"><span class="footer-payment__icon">اینماد</span><span class="footer-payment__icon">سامان</span></div></div></div></div>\
    </div></footer>';
    applyStoreSettingsToFooter();
  }

  /* Pages without a footer (login, register, checkout, offline…) still need the
     centralized identity/contact applied to their data-setting hooks. Safe to
     run repeatedly: every step is idempotent and tagged. */
  function applyStoreSettingsEverywhere() {
    try { applyStoreSettingsToFooter(); } catch (e) {}
  }

  /* ── Centralized store identity/contact → entire site (dynamic, no redesign) ──
     Single source of truth: /api/settings store.* keys, editable ONLY in
     Admin → اطلاعات فروشگاه. Re-applies the saved values to header, footer,
     contact page, checkout, account pages, mobile UI, chat widget and
     document titles on every page load. Processed nodes are tagged with
     data-store-field so repeat applies stay correct after values change. */
  function storeTelHref(phone) {
    var raw = String(phone == null ? '' : phone);
    // Normalize Persian/Arabic-Indic digits so tel: links are valid dial strings.
    var fa = '۰۱۲۳۴۵۶۷۸۹', ar = '٠١٢٣٤٥٦٧٨٩';
    var out = '';
    for (var i = 0; i < raw.length; i++) {
      var ch = raw[i];
      var fp = fa.indexOf(ch), ap = ar.indexOf(ch);
      if (fp > -1) out += String(fp);
      else if (ap > -1) out += String(ap);
      else if (ch === '+' || /[0-9]/.test(ch)) out += ch;
    }
    return 'tel:' + out;
  }
  /* ── Contact page map card → Admin → اطلاعات فروشگاه (store.map_url) ──
     Builds an iframable Google Maps embed from the saved share/search link
     (appending output=embed). Non-Google or empty/invalid values keep the
     clean pin + address fallback instead of a broken iframe. */
  function contactMapEmbedUrl(u) {
    var s = String(u == null ? '' : u).trim();
    if (!s || s.length > 2048) return '';
    if (!/^https?:\/\//i.test(s)) return '';
    if (/^(javascript|data|file|ftp):/i.test(s)) return '';
    try {
      if (/output=embed/i.test(s) || /\/maps\/embed/i.test(s)) return s;
      if (/google\.[^/]+\/maps|maps\.google|goo\.gl\/maps/i.test(s)) {
        return s + (s.indexOf('?') === -1 ? '?output=embed' : '&output=embed');
      }
    } catch (e) {}
    return '';
  }
  function renderContactMapCard(mapUrl, coords) {
    var card = document.getElementById('contact-map');
    var body = document.querySelector('[data-contact-map]') || (card ? card.querySelector('.contact-map-card__body') : null);
    if (!card || !body) return;
    var action = card.querySelector('.contact-map-card__action:not([data-contact-navigate])');
    var raw = String(mapUrl == null ? '' : mapUrl).trim();
    var co = coords || {};
    var embed = contactMapEmbedUrl(raw);
    if (action) {
      if (raw && /^https?:\/\//i.test(raw)) {
        action.setAttribute('href', raw);
        action.style.display = '';
      } else {
        action.setAttribute('href', '#');
        action.style.display = 'none';
      }
    }
    if (!embed) {
      var old = body.querySelector('iframe');
      if (old) old.remove();
      body.classList.remove('contact-map-card__body--has-map');
    }
    /* ── "مسیریابی" (navigate) action ───────────────────────────
       Always actionable: point it at a Google Maps directions URL built from
       the saved coordinates when available, otherwise from the saved address.
       It is a normal same-tab link, so it keeps working with JS disabled and
       without a popup blocker. The legacy "open in map" link above is only
       populated when an explicit store.map_url exists. */
    var nav = card.querySelector('[data-contact-navigate]');
    if (nav) {
      var latRaw = co.lat, lngRaw = co.lng;
      var latN = parseFloat(latRaw), lngN = parseFloat(lngRaw);
      var dest = '';
      if (isFinite(latN) && isFinite(lngN) && (latN || lngN)) {
        dest = latN + ',' + lngN;
      } else if (raw && /^https?:\/\//i.test(raw)) {
        dest = raw;
      } else {
        var addrText = '';
        try {
          var addrEl = card.querySelector('[data-setting="store.address"]');
          addrText = String((addrEl && addrEl.textContent) || '').trim();
        } catch (e4) {}
        dest = addrText;
      }
      if (dest) {
        var dirUrl = /^https?:\/\//i.test(dest)
          ? dest
          : 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest);
        nav.setAttribute('href', dirUrl);
        nav.style.display = '';
      } else {
        nav.setAttribute('href', '#');
        nav.style.display = 'none';
      }
    }
    if (!embed) return;
    var frame = body.querySelector('iframe');
    if (!frame) {
      frame = document.createElement('iframe');
      frame.setAttribute('loading', 'lazy');
      frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      frame.setAttribute('allowfullscreen', '');
      frame.setAttribute('title', 'موقعیت فروشگاه روی نقشه');
      body.appendChild(frame);
    }
    body.classList.add('contact-map-card__body--has-map');
    if (frame.getAttribute('src') !== embed) frame.setAttribute('src', embed);
  }
  function applyStoreSettingsToFooter() {
    if (location.protocol === 'file:' || typeof fetch !== 'function') return;
    fetch('/api/settings', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (s) {
      if (!s) return;
      var name = s['store.name'] || '', phone = s['store.phone'] || '', phone2 = s['store.phone2'] || '',
        email = s['store.email'] || '', addr = s['store.address'] || '', desc = s['store.desc'] || '',
        mapUrl = s['store.map_url'] || '', hours = s['store.hours'] || '',
        hoursDetail = s['store.hours_detail'] || '', website = s['store.website'] || '';
      try { window.__storeName = name; window.__storeSettings = s; } catch (e) {}
      try { localStorage.setItem('as_store_settings', JSON.stringify(s)); } catch (e) {}
       try { applyChatSettings(s); } catch (e) {}
      function setText(sel, val) {
        if (!val) return;
        document.querySelectorAll(sel).forEach(function (el) { el.textContent = val; });
      }
      function tag(el, field) { try { el.setAttribute('data-store-field', field); } catch (e) {} }
      function setLinkText(link, val) {
        var svg = link.querySelector('svg');
        if (svg) link.innerHTML = svg.outerHTML + ' ' + val; else link.textContent = val;
      }
      // 1) Site name → header, footer, checkout brand, auth logo, chat, titles.
      if (name) {
        setText('.header-logo__title', name);
        setText('.footer-brand__name, .footer-store-name', name);
        setText('.co-brand', name);
        setText('.pwa-install-modal__title', 'نصب اپلیکیشن ' + name);
        document.querySelectorAll('.auth-box__logo span').forEach(function (el) {
          if (!el.querySelector('svg') && el.textContent.trim()) el.textContent = name;
        });
        document.querySelectorAll('[data-store="name"]').forEach(function (el) { el.textContent = name; });
        var cpr = document.querySelector('.footer-copyright');
        if (cpr) {
          var storeSpan = cpr.querySelector('.footer-store-name');
          if (storeSpan) storeSpan.textContent = name;
          else cpr.textContent = 'تمامی حقوق این وب‌سایت متعلق به فروشگاه ' + name + ' می‌باشد.';
        }
        try {
          if (document.title && document.title.indexOf('|') !== -1) {
            var parts = document.title.split('|');
            parts[parts.length - 1] = ' ' + name;
            document.title = parts.join('|');
          }
          var appTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
          if (appTitle) appTitle.setAttribute('content', name);
        } catch (e) {}
        try {
          document.querySelectorAll('.chat-panel__title').forEach(function (el) {
            el.textContent = 'دستیار هوشمند ' + name;
          });
          document.querySelectorAll('.chat-msg__text').forEach(function (el) {
            var t = el.textContent || '';
            if (t.indexOf('دستیار هوشمند') !== -1 && t.indexOf('هستم') !== -1) {
              el.textContent = t.replace(/دستیار هوشمند .+ هستم/, 'دستیار هوشمند ' + name + ' هستم');
            }
          });
        } catch (e) {}
        // Keep the title suffix in sync even when page scripts set
        // document.title after settings load (product/shop/account pages).
        try {
          var __titleEl = document.querySelector('title');
          if (__titleEl && window.MutationObserver && !window.__storeTitleObserved) {
            window.__storeTitleObserved = true;
            var __inTitleUpdate = false;
            new MutationObserver(function () {
              // Skip titles set explicitly by the SEO layer (seo.site_title /
              // per-item overrides) — those are intentional, not stale brand text.
              if (window.__skipStoreTitleFix) return;
              if (__inTitleUpdate) return;
              try {
                var __cur = document.title || '';
                if (__cur.indexOf('|') !== -1) {
                  var __pp = __cur.split('|');
                  if (__pp[__pp.length - 1].trim() !== (window.__storeName || '')) {
                    __inTitleUpdate = true;
                    __pp[__pp.length - 1] = ' ' + (window.__storeName || '');
                    document.title = __pp.join('|');
                    __inTitleUpdate = false;
                  }
                }
              } catch (e) { __inTitleUpdate = false; }
            }).observe(__titleEl, { childList: true, characterData: true, subtree: true });
          }
        } catch (e) {}
      }
      // 2) Footer description.
      if (desc) setText('.footer-brand__desc', desc);
      // 3) Footer contact column: previously tagged nodes first (idempotent),
      // then first-run detection by content pattern.
      try {
        document.querySelectorAll('[data-store-field="address"]').forEach(function (el) { if (addr) setLinkText(el, addr); });
        document.querySelectorAll('[data-store-field="phone"]').forEach(function (el) { if (phone) setLinkText(el, phone); });
        document.querySelectorAll('[data-store-field="email"]').forEach(function (el) { if (email) setLinkText(el, email); });
        document.querySelectorAll('[data-store-field="website"]').forEach(function (el) { if (website) setLinkText(el, website); });
        document.querySelectorAll('.footer-link').forEach(function (link) {
          if (link.hasAttribute('data-store-field')) return;
          var txt = link.textContent || '';
          if (addr && (txt.indexOf('تهران') !== -1 || txt.indexOf('ولیعصر') !== -1 || txt.indexOf('پلاک') !== -1)) {
            tag(link, 'address'); setLinkText(link, addr);
          } else if (phone && /[0-9۰-۹]/.test(txt) && txt.indexOf('@') === -1 && txt.indexOf('www') === -1 && txt.indexOf('http') === -1) {
            tag(link, 'phone'); setLinkText(link, phone);
          } else if (email && txt.indexOf('@') !== -1) {
            tag(link, 'email'); setLinkText(link, email);
          } else if (website && (txt.indexOf('www') !== -1 || txt.indexOf('http') !== -1)) {
            tag(link, 'website'); setLinkText(link, website);
          }
        });
      } catch (e) {}
      // 3b) Footer social links → Admin → اطلاعات فروشگاه (store.social_*).
      // Empty/invalid values keep the icon in its disabled state (href="#").
      try {
        var socials = {
          telegram: s['store.social_telegram'] || '',
          instagram: s['store.social_instagram'] || '',
          twitter: s['store.social_twitter'] || '',
          youtube: s['store.social_youtube'] || ''
        };
        var socialByLabel = { 'تلگرام': 'telegram', 'اینستاگرام': 'instagram', 'توییتر': 'twitter', 'یوتیوب': 'youtube' };
        document.querySelectorAll('.footer-social').forEach(function (a) {
          var key = a.getAttribute('data-social') || socialByLabel[(a.getAttribute('aria-label') || '').trim()] || '';
          if (!key || socials[key] === undefined) return;
          var u = String(socials[key]).trim();
          if (u && /^https?:\/\//i.test(u) && u.length <= 2048) {
            a.setAttribute('href', u);
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener');
          } else {
            a.setAttribute('href', '#');
            a.removeAttribute('target');
            a.removeAttribute('rel');
          }
        });
      } catch (e) {}
      // 4) Explicit data-setting hooks (contact page, about, authenticity…).
      try {
        var map = {
          'store.name': name, 'store.phone': phone, 'store.phone2': phone2,
          'store.email': email, 'store.address': addr, 'store.desc': desc,
          'store.map_url': mapUrl, 'store.hours': hours,
          'store.hours_detail': hoursDetail, 'store.website': website
        };
        Object.keys(map).forEach(function (k) {
          document.querySelectorAll('[data-setting="' + k + '"]').forEach(function (el) {
            if (k === 'store.map_url') {
              if (map[k] && el.tagName === 'A') el.setAttribute('href', map[k]);
              return;
            }
            if (!map[k]) {
              if (k === 'store.phone2') {
                var hideCard = el.closest ? (el.closest('.contact-method-card') || el.closest('.contact-info-item')) : null;
                if (hideCard) {
                  hideCard.style.display = 'none';
                  // never leave a broken tel: href behind on a hidden card
                  if (hideCard.tagName === 'A') hideCard.removeAttribute('href');
                }
              }
              return;
            }
            if (k === 'store.phone2') {
              var showCard = el.closest ? (el.closest('.contact-method-card') || el.closest('.contact-info-item')) : null;
              if (showCard) showCard.style.display = '';
            }
            el.textContent = map[k];
          });
        });
        // tel:/mailto:/map links always follow the saved contact.
        if (phone) document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
          if (a.hasAttribute('data-tel-keep')) return;
          a.setAttribute('href', storeTelHref(phone));
          var t = (a.textContent || '').trim();
          if (!a.querySelector('svg') && t.length < 30 && (/[0-9۰-۹]/.test(t) || t.indexOf('تماس') !== -1 || !t)) a.textContent = phone;
        });
        if (email) document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) {
          a.setAttribute('href', 'mailto:' + email);
          if (!a.querySelector('svg') && (a.textContent || '').indexOf('@') !== -1) a.textContent = email;
        });
        // Directions quick-action follows the saved store address.
        if (addr) {
          var dirCard = document.querySelector('.quick-action-card--directions');
          if (dirCard) dirCard.setAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addr));
        }
        if (phone2) document.querySelectorAll('[data-phone2-card]').forEach(function (a) {
          a.setAttribute('href', storeTelHref(phone2));
        });
        try { renderContactMapCard(mapUrl, { lat: s['store.latitude'] || '', lng: s['store.longitude'] || '' }); } catch (e) {}
      } catch (e) {}
      // 5) Chat widget contact answer follows the saved contact.
      try {
        var line = storeContactLine();
        if (line) faqData.contact = line;
        faqData.contactFallback = storeContactFallback();
      } catch (e) {}
    }).catch(function () {});
  }

  /* ── Chat widget visibility ───────────────────────────────
     The support/chat widget is intended for public shopping pages.
     Hide it on focused flows (auth, checkout), offline fallback,
     and internal/dev pages. Design and behavior unchanged. */
  var CHAT_HIDDEN_PAGES = ['login.html', 'register.html', 'forgot-password.html', 'checkout.html', 'checkout-step4.html', 'offline.html', 'product.html'];

  function isChatAllowedPage() {
    var page = storeFile().toLowerCase();
    if (!page) page = '/';
    if (page.charAt(0) === '_') return false; /* internal/dev pages (_audit, _shots) */
    return CHAT_HIDDEN_PAGES.indexOf(page) === -1;
  }

  /* ── Chatbot messages — dynamic from /api/settings chat.* keys ──
     Admin → «پیام‌های چت‌بات» edits these. Empty saved answers fall back to
     the built-in defaults below, so the widget always replies with usable text.
     CHAT_FAQ_DATA is shared with bindEvents() (aliased as `faqData`) so a
     single in-place update here is visible to chatRespond(). */
  var CHAT_FAQ_DEFAULTS = {
    shipping: 'هزینه ارسال برای سفارش‌های بالای ۵۰۰ هزار تومان رایگان است. ارسال به سراسر کشور در کمتر از ۴۸ ساعت کاری انجام می‌شود.',
    return: 'شما ۷ روز ضمانت بازگشت کالا بدون قید و شرط دارید. در صورت عدم رضایت از محصول، می‌توانید آن را بازگردانید.',
    warranty: 'تمامی محصولات با ضمانت اصالت کالا و گارانتی معتبر ارائه می‌شوند. ما نمایندگی رسمی برندهای هایکویژن، داهوا، یونیکنیو، تیاندی، ویوتک و سایر برندهای معتبر نظارتی هستیم.',
    categories: 'ما ۱۲ دسته‌بندی محصول داریم: دوربین مداربسته، دستگاه DVR/NVR، سیستم‌های امنیتی، لنز و تجهیزات تصویربرداری، تجهیزات شبکه نظارتی، لوازم جانبی دوربین، ایمنی و حفاظت، کابینت و رک، تجهیزات نصب و راه‌اندازی، ذخیره‌سازی و مانیتورینگ، سیم و کابل دوربین و تجهیزات جانبی تخصصی.',
    brands: 'برندهای موجود شامل هایکویژن، داهوا، یونیکنیو، تیاندی، ویوتک، فریتک، اکسیس، ویژن هانوا، زایکل، یوبیکویتی، سیگیت، وسترن دیجیتال، تی‌پی‌لینک و سپکو هستند.',
    payment: 'پرداخت به صورت آنلاین از طریق درگاه بانکی انجام می‌شود. همچنین امکان پرداخت در محل برای سفارش‌های تهران وجود دارد.',
    account: 'با ایجاد حساب کاربری می‌توانید سفارش‌های خود را پیگیری کنید، لیست علاقه‌مندی‌ها داشته باشید و اطلاعات خود را مدیریت کنید.',
    contact: ''
  };
  var CHAT_SUGGESTION_DEFAULTS = [
    { q: 'shipping', label: 'شرایط ارسال و هزینه' },
    { q: 'return', label: 'شرایط بازگشت کالا' },
    { q: 'warranty', label: 'گارانتی و اصالت' },
    { q: 'categories', label: 'دسته‌بندی محصولات' },
    { q: 'brands', label: 'برندهای موجود' },
    { q: 'payment', label: 'روش‌های پرداخت' },
    { q: 'account', label: 'حساب کاربری' },
    { q: 'contact', label: 'اطلاعات تماس' }
  ];
  /* Shared FAQ object (distinct from the defaults so edits never clobber them). */
  var chatFaqData = {};
  for (var _ck in CHAT_FAQ_DEFAULTS) {
    if (Object.prototype.hasOwnProperty.call(CHAT_FAQ_DEFAULTS, _ck)) chatFaqData[_ck] = CHAT_FAQ_DEFAULTS[_ck];
  }
  /* Current list of chatbot topics (data-driven). Updated by applyChatSettings. */
  var chatTopics = CHAT_SUGGESTION_DEFAULTS.map(function (t) {
    return { key: t.q, label: t.label, answer: CHAT_FAQ_DEFAULTS[t.q] };
  });

  function normalizeChatKey(k) {
    return String(k || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  }
  function applyChatSettings(s) {
    if (!s || typeof s !== 'object') return;
    var parsed = null;
    if (typeof s['chat.topics'] === 'string' && s['chat.topics'].trim()) {
      try {
        var arr = JSON.parse(s['chat.topics']);
        if (Array.isArray(arr) && arr.length) parsed = arr;
      } catch (e) {}
    }
    if (!parsed) {
      // Fall back to the 8 individual chat.* keys / defaults
      parsed = CHAT_SUGGESTION_DEFAULTS.map(function (t) {
        var label = s['chat.' + t.q + '.label'];
        var answer = s['chat.' + t.q + '.answer'];
        return {
          key: t.q,
          label: (typeof label === 'string' && label.trim()) ? label.trim() : t.label,
          answer: (typeof answer === 'string') ? answer : CHAT_FAQ_DEFAULTS[t.q]
        };
      });
    }
    // Normalize + dedupe
    var seen = new Set();
    var cleaned = [];
    for (var i = 0; i < parsed.length; i++) {
      var t = parsed[i] || {};
      var key = normalizeChatKey(t.key);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      cleaned.push({
        key: key,
        label: String(t.label == null ? '' : t.label).trim() || key,
        answer: String(t.answer == null ? '' : t.answer)
      });
    }
    if (!cleaned.length) {
      cleaned = CHAT_SUGGESTION_DEFAULTS.map(function (t) {
        return { key: t.q, label: t.label, answer: CHAT_FAQ_DEFAULTS[t.q] };
      });
    }
    // Update chatTopics
    chatTopics.length = 0;
    for (var ci = 0; ci < cleaned.length; ci++) chatTopics.push(cleaned[ci]);
    // Rebuild faqData
    for (var k in chatFaqData) delete chatFaqData[k];
    for (var cj = 0; cj < cleaned.length; cj++) chatFaqData[cleaned[cj].key] = cleaned[cj].answer;
    // Rebuild suggestion buttons
    var container = document.querySelector('#chat-suggestions');
    if (container) {
      container.innerHTML = '';
      for (var ck = 0; ck < cleaned.length; ck++) {
        var btn = document.createElement('button');
        btn.className = 'chat-suggestion';
        btn.setAttribute('data-q', cleaned[ck].key);
        btn.textContent = cleaned[ck].label;
        container.appendChild(btn);
      }
    }
  }

  function buildChatHtml() {
    if (!isChatAllowedPage()) return '';
    return '\
    <div class="chat-fab">\
      <button class="chat-fab__btn" aria-label="چت" id="chat-fab-btn" aria-expanded="false" aria-controls="chat-panel"><svg class="chat-fab__icon chat-fab__icon--chat" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><svg class="chat-fab__icon chat-fab__icon--close" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>\
    </div>\
    <!-- Chat Panel -->\
    <div class="chat-panel" id="chat-panel">\
      <div class="chat-panel__header">\
        <div class="chat-panel__identity">\
          <div class="chat-panel__avatar">' + Icons.headphones + '<span class="chat-panel__status-dot" aria-hidden="true"></span></div>\
          <div class="chat-panel__titles">\
            <span class="chat-panel__title">دستیار هوشمند کمزی</span>\
            <span class="chat-panel__subtitle"><span class="chat-panel__online-dot" aria-hidden="true"></span>پاسخگوی آنلاین</span>\
          </div>\
        </div>\
        <button class="chat-panel__close" id="chat-close" aria-label="بستن گفتگو">' + Icons.close + '</button>\
      </div>\
      <div class="chat-panel__body" id="chat-body">\
        <div class="chat-panel__date" aria-hidden="true"><span>گفتگوی امروز</span></div>\
        <div class="chat-msg chat-msg--bot">\
          <div class="chat-msg__avatar">' + Icons.headphones + '</div>\
          <div class="chat-msg__bubble"><div class="chat-msg__text">سلام! 👋 من دستیار هوشمند کمزی هستم. چطور می‌توانم کمک کنم؟</div><span class="chat-msg__time">همین حالا</span></div>\
        </div>\
        <div id="chat-support-bar" style="padding:8px 12px"><button id="chat-support-btn" style="width:100%;padding:10px;border:none;border-radius:var(--radius-md);background:#f59e0b;color:#fff;font-weight:700;cursor:pointer">درخواست چت با پشتیبانی</button><div id="chat-support-status" style="font-size:12px;color:#16a34a;display:none;margin-top:6px;text-align:center">متصل به پشتیبانی — پیام شما برای پشتیبانی ارسال می‌شود</div></div>\
        <div class="chat-suggestions" id="chat-suggestions">\
           <button class="chat-suggestion" data-q="shipping">شرایط ارسال و هزینه</button>\
          <button class="chat-suggestion" data-q="return">شرایط بازگشت کالا</button>\
          <button class="chat-suggestion" data-q="warranty">گارانتی و اصالت</button>\
          <button class="chat-suggestion" data-q="categories">دسته‌بندی محصولات</button>\
          <button class="chat-suggestion" data-q="brands">برندهای موجود</button>\
          <button class="chat-suggestion" data-q="payment">روش‌های پرداخت</button>\
          <button class="chat-suggestion" data-q="account">حساب کاربری</button>\
          <button class="chat-suggestion" data-q="contact">اطلاعات تماس</button>\
        </div>\
      </div>\
      <div class="chat-panel__footer">\
        <input type="file" id="chat-file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx">\
        <button type="button" id="chat-attach" title="پیوست" aria-label="پیوست فایل" style="width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #e5e7eb;background:#fff;border-radius:var(--radius-md);cursor:pointer;color:#6b7280;flex-shrink:0;transition:all .15s"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>\
        <input type="text" class="chat-panel__input" id="chat-input" placeholder="سوال خود را بنویسید...">\
        <button class="chat-panel__send" id="chat-send">' + Icons.arrowRight + '</button>\
      </div>\
    </div>';
  }

  /* ── Render Overlays ──────────────────────────────────────── */
  function renderOverlays(el) {
    /* Idempotent: overlays are static markup — rebuilding them on every
       init would flash the bottom nav / chat widget and duplicate state. */
    if (el.innerHTML.trim()) return;
    var chatHtml = buildChatHtml();
    el.innerHTML = '\
    <div class="drawer-overlay"></div>\
    <div class="mobile-menu">\
    <div class="mobile-menu__header"><span style="font-weight:700;font-size:var(--font-size-lg)">منو</span><button class="drawer__close" aria-label="بستن منو">' + Icons.close + '</button></div>\
    <nav class="mobile-menu__nav">\
    <a href="/" class="mobile-menu__link">' + Icons.home + ' صفحه اصلی</a>\
    <a href="/shop" class="mobile-menu__link">' + Icons.store + ' فروشگاه</a>\
    <div class="mobile-menu__divider"></div>\
    <a href="/brands" class="mobile-menu__link">' + Icons.star + ' برندها</a>\
    <a href="/articles" class="mobile-menu__link">' + Icons.layers + ' مقالات</a>\
    <div class="mobile-menu__divider"></div>\
    <a href="/login" class="mobile-menu__link">' + Icons.user + ' حساب کاربری</a>\
    <a href="/account/wishlist" class="mobile-menu__link">' + Icons.heart + ' علاقه‌مندی‌ها</a>\
    <a href="/cart" class="mobile-menu__link">' + Icons.cart + ' سبد خرید</a>\
    ' + pwaInstallMenuHTML() + '\
    <div class="mobile-menu__divider"></div>\
    <a href="/contact" class="mobile-menu__link">' + Icons.mail + ' تماس با ما</a>\
    <a href="/about" class="mobile-menu__link">' + Icons.infoCircle + ' درباره ما</a>\
    </nav></div>\
    <div class="toast-container"></div>\
    ' + chatHtml + '\
    ' + (storeFile().toLowerCase() === 'product.html' ? '' : '\
    <nav class="mobile-bottom-nav"><div class="mobile-bottom-nav__items">\
    <a href="/" class="mobile-bottom-nav__item mobile-bottom-nav__item--home">' + Icons.home + '<span>خانه</span></a>\
    <a href="/categories" class="mobile-bottom-nav__item">' + Icons.layers + '<span>دسته‌بندی‌ها</span></a>\
    <a href="/cart" class="mobile-bottom-nav__item" id="mobile-bottom-cart">' + Icons.cart + '<span class="mobile-bottom-nav__badge" id="mobile-bottom-cart-badge" style="display:none">0</span><span>سبد خرید</span></a>\
    <a href="/account/wishlist" class="mobile-bottom-nav__item" data-nav="wishlist">' + Icons.heart + '<span>علاقه‌مندی‌ها</span></a>\
    <a href="/account" class="mobile-bottom-nav__item" data-nav="profile">' + Icons.user + '<span>پروفایل من</span></a>\
    </div></nav>') + '';

    var homeLink = el.querySelector('.mobile-menu__link');
    if (homeLink) {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
      homeLink.innerHTML = svg + ' صفحه اصلی';
    }
    /* Set active state on bottom nav */
    var currentPage = storeFile();
    /* Cart lives at /cart (legacy alias /account-cart). storeFile() maps it to
       account-cart.html, which the Profile rule below would otherwise claim —
       leaving the Cart tab dark and Profile lit on the cart page. */
    var onCartPage = /^\/(account-)?cart\/?$/.test(window.location.pathname || '');
    el.querySelectorAll('.mobile-bottom-nav__item').forEach(function (item) {
      var href = item.getAttribute('href') || '';
      var page = href.split('?')[0];
      if (page === currentPage) item.classList.add('is-active');
      /* Cart tab: active on the cart page only — Profile must not light up here. */
      if (page === '/cart') { if (onCartPage) item.classList.add('is-active'); return; }
      /* Keep "پروفایل من" active across all account/auth pages (except wishlist, which has its own tab) */
      if (item.getAttribute('data-nav') === 'profile' && !onCartPage && currentPage !== '/account/wishlist' && /^(account|login|register|forgot-password)/.test(currentPage)) item.classList.add('is-active');
    });
    /* Update bottom nav cart badge */
    var bb = el.querySelector('#mobile-bottom-cart-badge');
    if (bb) {
      var cnt = getCartCount();
      bb.textContent = cnt;
      bb.style.display = cnt > 0 ? 'flex' : 'none';
    }
  }

  /* ── Bind Events ──────────────────────────────────────────── */
  function bindEvents() {
    /* Contact-page quick-action / support cards: bare "#contact-form" fragments
       resolve against <base href="/"> and leave the page (they become
       "/#contact-form" -> homepage) whenever the inline onclick is missing —
       e.g. a stale cached shell, CSP, or JS disabled. Normalise them here so the
       real destination ("/contact#contact-form") survives regardless, then let
       the inline handler do the smooth scroll when present. */
    if (!bindEvents._contactHrefFixed) {
      bindEvents._contactHrefFixed = true;
      try {
        var _contactHere = /\/contact\/?$/.test(location.pathname) ? location.pathname : '/contact';
        Array.prototype.forEach.call(document.querySelectorAll('a[href^="#"]'), function (_a) {
          var _frag = _a.getAttribute('href') || '';
          if (_frag.length > 1) _a.setAttribute('href', _contactHere + _frag);
        });
      } catch (e) {}
    }
    /* Singleton: document-level listeners must not be stacked when init
       runs on top of the synchronous critical render. Element-level binds
       below already guard per-node (__accountBound & co). */
    if (bindEvents._done) return;
    bindEvents._done = true;
    var headerSearchInput = $('.header-search input');
    if (headerSearchInput) {
      headerSearchInput.addEventListener('focus', function () {
        var dropdown = $('.search-dropdown');
        if (dropdown && !dropdown.classList.contains('is-active')) {
          closeOtherHeaderDropdowns('search');
          dropdown.innerHTML = renderSearchSuggestions();
          dropdown.classList.add('is-active');
          bindDropdownItems(dropdown);
        }
      });
      headerSearchInput.addEventListener('input', function (e) { handleSearch(e.target.value); });
      headerSearchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var v = headerSearchInput.value.trim();
          closeSearchDropdown();
          if (v) window.location.href = '/shop?q=' + encodeURIComponent(v);
        } else if (e.key === 'Escape') {
          closeSearchDropdown();
          headerSearchInput.blur();
        }
      });
    }
    var searchSubmit = $('.header-search .search-submit');
    if (searchSubmit) searchSubmit.addEventListener('click', function () {
      var inp = $('.header-search input');
      if (inp && inp.value.trim()) {
        closeSearchDropdown();
        window.location.href = '/shop?q=' + encodeURIComponent(inp.value.trim());
      }
    });
    document.addEventListener('click', function (e) {
      var hs = $('.header-search');
      var mhs = $('.mobile-header__search-wrap');
      var inDesktop = hs && hs.contains(e.target);
      var inMobile = mhs && mhs.contains(e.target);
      if (!inDesktop && !inMobile) closeSearchDropdown();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSearchDropdown();
    });

    var mobileSearchInput = $('.mobile-header__search-input');
    if (mobileSearchInput) {
      mobileSearchInput.addEventListener('focus', function () {
        var dd = mobileSearchInput.closest('.mobile-header__search-wrap').querySelector('.search-dropdown');
        if (dd && !dd.classList.contains('is-active')) {
          dd.innerHTML = renderSearchSuggestions();
          dd.classList.add('is-active');
          bindDropdownItems(dd);
        }
      });
      mobileSearchInput.addEventListener('input', function (e) { var dd = e.target.closest('.mobile-header__search-wrap').querySelector('.search-dropdown'); handleSearch(e.target.value, dd); });
      mobileSearchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var v = mobileSearchInput.value.trim();
          closeSearchDropdown();
          if (v) window.location.href = '/shop?q=' + encodeURIComponent(v);
        } else if (e.key === 'Escape') {
          closeSearchDropdown();
          mobileSearchInput.blur();
        }
      });
    }

    bindCartPopovers(document);

    /* The responsive product page writes the cart itself and only announces
       it with as_cart_change, so re-sync every badge/drawer from that same
       cart state through the existing updateCartUI(). Guarded: re-binding
       can never attach a second listener. */
    if (!document.__cartUiBound) {
      document.__cartUiBound = true;
      document.addEventListener('as_cart_change', function () {
        try { updateCartUI(); } catch (e) {}
      });
    }

    /* Account dropdown (logged-in top bar): hover on desktop, click on touch */
    bindAccountDropdown(document);
    bindLogoutButtons(document);
    /* Outside click closes the account menu */
    document.addEventListener('click', function (e) {
      var open = document.querySelector('[data-account-menu].is-open');
      if (open && !open.contains(e.target)) {
        open.classList.remove('is-open');
        var b = open.querySelector('.header-account-action');
        if (b) b.setAttribute('aria-expanded', 'false');
      }
    });
    /* Live-update the top bar when auth changes (same tab or other tabs) */
    document.addEventListener('as_auth_change', function () { refreshHeaderAuth(); });
    window.addEventListener('storage', function (e) {
      if (e && (e.key === 'as_session' || e.key === null)) refreshHeaderAuth();
    });

    var menuBtn = $('.mobile-header__menu-btn');
    if (menuBtn) menuBtn.addEventListener('click', toggleMobileMenu);

    /* Compact product-page header controls (rendered only on product.html) */
    $$('#mobile-header [data-pdp-action]').forEach(function (btn) {
      if (btn.__pdpBound) return;
      btn.__pdpBound = true;
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-pdp-action');
        if (action === 'back') {
          /* Back when there is useful (same-origin) history, else fall back to listing. */
          try {
            var ref = document.referrer || '';
            var sameOrigin = ref && (ref.indexOf(window.location.origin + '/') === 0);
            if (sameOrigin && window.history && window.history.length > 1) window.history.back();
            else window.location.href = '/shop';
          } catch (e) { window.location.href = '/shop'; }
        } else if (action === 'search') {
          /* The site's search interface lives on the shop page (#shop-search, ?q=). */
          window.location.href = '/shop';
        } else if (action === 'more') {
          toggleMobileMenu();
          try { btn.setAttribute('aria-expanded', state.mobileMenuOpen ? 'true' : 'false'); } catch (e) {}
        }
      });
    });
    /* Keep the "more" button's aria state in sync when the menu is closed elsewhere */
    document.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('#mobile-header [data-pdp-action="more"]')) return;
      var moreBtn = document.querySelector('#mobile-header [data-pdp-action="more"]');
      if (moreBtn && !state.mobileMenuOpen) moreBtn.setAttribute('aria-expanded', 'false');
    });

    /* Nav categories button → toggle category dropdown */
    $$('.nav-categories-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var dropdown = document.querySelector('.categories-dropdown');
        if (dropdown) {
          var isOpen = dropdown.classList.toggle('is-active');
          if (isOpen) closeOtherHeaderDropdowns('categories');
          btn.setAttribute('aria-expanded', String(isOpen));
        }
      });
    });
    /* Close category dropdown on outside click */
    document.addEventListener('click', function (e) {
      var dropdown = document.querySelector('.categories-dropdown');
      var btn = document.querySelector('.nav-categories-btn');
      if (dropdown && dropdown.classList.contains('is-active')) {
        if (!dropdown.contains(e.target) && (!btn || !btn.contains(e.target))) {
          dropdown.classList.remove('is-active');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        }
      }
    });
    /* Close category dropdown on Escape */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var dropdown = document.querySelector('.categories-dropdown');
        var btn = document.querySelector('.nav-categories-btn');
        if (dropdown) dropdown.classList.remove('is-active');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    });

    var mobileMenuClose = $('.mobile-menu .drawer__close');
    if (mobileMenuClose) mobileMenuClose.addEventListener('click', toggleMobileMenu);

    var mobileMenuOverlay = $('.drawer-overlay');
    if (mobileMenuOverlay && !mobileMenuOverlay.__backdropBound) {
      mobileMenuOverlay.__backdropBound = true;
      mobileMenuOverlay.addEventListener('click', function () {
        if (state.mobileMenuOpen) toggleMobileMenu();
      });
    }
    bindMobileMenuSwipe();

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeSearchDropdown(); if (state.mobileMenuOpen) toggleMobileMenu(); closeAllCartPopovers(); var dd = document.querySelector('.categories-dropdown'); if (dd) dd.classList.remove('is-active'); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); var inp = $('.header-search input'); if (inp) inp.focus(); }
    });

    /* ── Mega Menu: hover category → show subcategory panel ──
       Delegated via mouseover (which bubbles, unlike mouseenter) so the
       handler keeps working after renderMegaMenu() rebuilds dd.innerHTML
       when the live catalog arrives. Scoped to #categories-dropdown. */
    document.addEventListener('mouseover', function(e) {
      var item = e.target && e.target.closest ? e.target.closest('.mega-cat') : null;
      if (!item) return;
      var dd = item.closest ? item.closest('#categories-dropdown') : null;
      if (!dd || item.classList.contains('is-active')) return;
      var idx = item.getAttribute('data-cat-index');
      if (idx === null || idx === '') return;
      /* Remove active from all categories */
      dd.querySelectorAll('.mega-cat').forEach(function(c) { c.classList.remove('is-active'); });
      item.classList.add('is-active');
      /* Hide all panels, show the matching one */
      dd.querySelectorAll('.mega-panel').forEach(function(p) { p.hidden = true; });
      var panel = dd.querySelector('.mega-panel[data-cat-index="' + idx + '"]');
      if (panel) panel.hidden = false;
    });

        /* ── Price Changer event delegation ─────────────────── */
    document.addEventListener('click', function (e) {
      var span = e.target.closest('.priceChanger span[data-mode]');
      if (!span) return;
      var container = span.closest('.priceChanger');
      if (!container) return;
      var mode = span.getAttribute('data-mode');
      var pricingId = container.getAttribute('data-pricing');
      if (pricingId === 'detail') {
        /* Product detail page */
        if (window.ProductDetail && window.ProductDetail.selectPricing) {
          window.ProductDetail.selectPricing(mode);
        }
      } else {
        /* Product card */
        var productId = parseInt(pricingId, 10);
        if (productId) selectCardPricing(productId, mode);
      }
    });

/* ── Chat FAB ─────────────────────────────────────────── */
    var chatFabBtn = document.getElementById('chat-fab-btn');
    var chatPanel = document.getElementById('chat-panel');
    var chatClose = document.getElementById('chat-close');

    /* Launcher icon ⇄ close (×) icon.
       The state is synced inside openChatPanel()/closeChatPanel() — the only
       two code paths that change the panel — so every entry point (FAB click,
       panel ×, Escape) stays in sync without attaching any extra listeners. */
    function syncChatFabIcon(open) {
      if (!chatFabBtn) return;
      chatFabBtn.classList.toggle('is-open', !!open);
      chatFabBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      chatFabBtn.setAttribute('aria-label', open ? 'بستن گفتگو' : 'چت');
    }

    function openChatPanel() {
      if (!chatPanel) return;
      chatPanel.classList.add('is-active');
      chatPanel.style.cssText = '';
      syncChatFabIcon(true);
    }
    function closeChatPanel() {
      if (!chatPanel) return;
      chatPanel.classList.remove('is-active');
      chatPanel.style.cssText = '';
      syncChatFabIcon(false);
    }

    /* Initial state (panel starts hidden) — also correct after re-init. */
    syncChatFabIcon(chatPanel && chatPanel.classList.contains('is-active'));

    if (chatFabBtn && chatPanel) {
      chatFabBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (chatPanel.classList.contains('is-active')) {
          closeChatPanel();
        } else {
          openChatPanel();
        }
      });
    }

    if (chatClose) {
      chatClose.addEventListener('click', function () {
        closeChatPanel();
      });
    }

    /* Close on Escape */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && chatPanel && chatPanel.classList.contains('is-active')) {
        closeChatPanel();
      }
    });

    /* FAQ Data — shared with applyChatSettings() (module scope) so admin edits
       flow into the live chatbot without a page reload of the source code. */
    var faqData = chatFaqData;

    /* Chat contact answers are always composed from the central store.* settings
       (Admin → اطلاعات فروشگاه) so no contact value is duplicated here. */
    function storeContactLine() {
      var s = window.__storeSettings || {};
      var parts = [];
      if (s['store.address']) parts.push('آدرس: ' + s['store.address']);
      if (s['store.phone']) parts.push('تلفن: ' + s['store.phone'] + (s['store.phone2'] ? ' / ' + s['store.phone2'] : ''));
      if (s['store.email']) parts.push('ایمیل: ' + s['store.email']);
      if (s['store.hours']) parts.push('ساعت کاری: ' + s['store.hours'] + (s['store.hours_detail'] ? ' ' + s['store.hours_detail'] : ''));
      return parts.join(' | ');
    }
    function storeContactFallback() {
      var s = window.__storeSettings || {};
      var lines = [];
      if (s['store.phone']) lines.push('📞 ' + s['store.phone']);
      if (s['store.email']) lines.push('📧 ' + s['store.email']);
      return lines.join('\n');
    }

    /* ── Chat turn lifecycle ──────────────────────────────────
       Every chat turn (suggestion click, typed message, or support-ticket
       request) goes through startChatTurn()/finishChatTurn(). While a turn is
       active, duplicate submissions are ignored and the suggestion buttons are
       disabled — but never hidden permanently. finishChatTurn() always runs
       (success, failure, timeout) and re-enables the buttons together with
       their delegated click handler. */
    var CHAT_TURN_TIMEOUT_MS = 20000;
    var chatTurnActive = false;
    var chatTurnTimer = null;

    function setChatSuggestionsEnabled(enabled) {
      var s = document.getElementById('chat-suggestions');
      if (!s) return;
      if (enabled) {
        s.classList.remove('is-busy');
        s.removeAttribute('aria-disabled');
        s.style.display = '';
        Array.prototype.forEach.call(s.querySelectorAll('.chat-suggestion'), function (b) { b.disabled = false; });
      } else {
        s.classList.add('is-busy');
        s.setAttribute('aria-disabled', 'true');
        Array.prototype.forEach.call(s.querySelectorAll('.chat-suggestion'), function (b) { b.disabled = true; });
      }
    }

    function startChatTurn() {
      if (chatTurnActive) return false;
      chatTurnActive = true;
      setChatSuggestionsEnabled(false);
      if (chatTurnTimer) clearTimeout(chatTurnTimer);
      chatTurnTimer = setTimeout(function () {
        chatTurnTimer = null;
        finishChatTurn('متأسفانه پاسخی دریافت نشد. لطفاً دوباره تلاش کنید.');
      }, CHAT_TURN_TIMEOUT_MS);
      return true;
    }

    function finishChatTurn(errorText) {
      if (chatTurnTimer) { clearTimeout(chatTurnTimer); chatTurnTimer = null; }
      if (!chatTurnActive) return;
      chatTurnActive = false;
      setChatSuggestionsEnabled(true);
      if (errorText) {
        var body = document.getElementById('chat-body');
        if (body) {
          var d = document.createElement('div');
          d.className = 'chat-msg chat-msg--bot';
          d.innerHTML = '<div class="chat-msg__avatar">' + Icons.headphones + '</div><div class="chat-msg__text">' + errorText + '</div>';
          body.appendChild(d);
          body.scrollTop = body.scrollHeight;
        }
      }
    }

    function chatRespond(userText, faqKey) {
      var body = document.getElementById('chat-body');
      if (!body) return;
      /* Ignore duplicate submissions while a turn is already active. */
      if (!startChatTurn()) return;

      try {
        /* Add user message */
        var userDiv = document.createElement('div');
        userDiv.className = 'chat-msg chat-msg--user';
        userDiv.innerHTML = '<div class="chat-msg__text">' + userText + '</div>';
        body.appendChild(userDiv);

        /* Suggestions map 1:1 onto a stored FAQ answer; anything else is
           matched by keyword. An empty stored answer (e.g. contact before the
           store settings load) falls through to keyword matching. */
        var response = '';
        if (faqKey && typeof faqData[faqKey] === 'string' && faqData[faqKey]) {
          response = faqData[faqKey];
        } else {
          var lower = userText.toLowerCase();
          // Data-driven: prefer a topic whose key or label appears in the text.
          var _matched = false;
          for (var _ti = 0; _ti < chatTopics.length; _ti++) {
            var _tp = chatTopics[_ti];
            if (!_tp) continue;
            if (lower.indexOf(_tp.key) !== -1 || (_tp.label && lower.indexOf(String(_tp.label).toLowerCase()) !== -1)) {
              response = (faqData[_tp.key] && String(faqData[_tp.key]).trim()) ? faqData[_tp.key] : _tp.answer;
              _matched = true; break;
            }
          }
          if (!_matched) {
            if (lower.match(/ارسال|هزینه|پست|تحویل|رایگان/)) response = faqData.shipping;
            else if (lower.match(/بازگشت|مرجوع|برگشت/)) response = faqData.return;
            else if (lower.match(/گارانتی|اصالت|ضمانت|تضمین/)) response = faqData.warranty;
            else if (lower.match(/دسته|دسته‌بندی|دستهبندی|محصول|نوع/)) response = faqData.categories;
            else if (lower.match(/برند|هایکویژن|داهوا|یونیکنیو|تیاندی|ویوتک|فریتک|هایکویژن/)) response = faqData.brands;
            else if (lower.match(/پرداخت|هزینه|قیمت|کارت|بانک/)) response = faqData.payment;
            else if (lower.match(/حساب|کاربری|عضویت|ورود|ثبت‌نام/)) response = faqData.account;
            else if (lower.match(/تماس|آدرس|تلفن|ایمیل|ساعات|ارتباط/)) response = (faqData.contact && String(faqData.contact).trim()) ? faqData.contact : storeContactLine();
            else response = 'متأسفانه پاسخ مناسبی برای سوال شما پیدا نکردم. لطفاً از گزینه‌های پیشنهادی استفاده کنید یا با پشتیبانی تماس بگیرید.' + (storeContactFallback() ? '\n\n' + storeContactFallback() : '');
          }
          if (!response) response = 'متأسفانه پاسخ مناسبی برای سوال شما پیدا نکردم. لطفاً از گزینه‌های پیشنهادی استفاده کنید یا با پشتیبانی تماس بگیرید.' + (storeContactFallback() ? '\n\n' + storeContactFallback() : '');
        }
        /* Add bot response */
        var botDiv = document.createElement('div');
        botDiv.className = 'chat-msg chat-msg--bot';
        botDiv.innerHTML = '<div class="chat-msg__avatar">' + Icons.headphones + '</div><div class="chat-msg__text">' + response.replace(/\n/g, '<br>') + '</div>';
        body.appendChild(botDiv);
        body.scrollTop = body.scrollHeight;
      } finally {
        /* Always re-enable the suggestion buttons and their delegated handler. */
        finishChatTurn();
      }
    }

    /* Support chat (reuse tickets) — delegated, survives re-render */
    (function(){
      var LS_TICKET='as_support_ticket', LS_GUEST='as_guest_id';
      function getGuestId(){ var v=localStorage.getItem(LS_GUEST); if(!v){ v='guest_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); localStorage.setItem(LS_GUEST,v);} return v; }
      function authHeaders(){ var h={'Content-Type':'application/json'}; try{ var s=JSON.parse(localStorage.getItem('as_session')||'null'); if(s&&s.token) h['Authorization']='Bearer '+s.token; }catch(_){} h['X-Guest-Id']=getGuestId(); return h; }
      function showWaiting(){ var body=document.getElementById('chat-body'); if(!body) return; if(body.querySelector('[data-waiting]')) return; var d=document.createElement('div'); d.setAttribute('data-waiting','1'); d.className='chat-msg chat-msg--bot'; d.innerHTML='<div class="chat-msg__avatar">'+Icons.headphones+'</div><div class="chat-msg__bubble"><div class="chat-msg__text">لطفاً منتظر ارتباط با پشتیبانی باشید...</div></div>'; body.appendChild(d); body.scrollTop=body.scrollHeight; }
      function syncSupportUI(){ var tid=localStorage.getItem(LS_TICKET); var b=document.getElementById('chat-support-btn'), s=document.getElementById('chat-support-status'); if(!b||!s) return; if(tid){ s.style.display='block'; b.style.display='none'; b.disabled=true; showWaiting(); } else { s.style.display='none'; b.style.display=''; b.disabled=false; b.textContent='درخواست چت با پشتیبانی'; } }
      function fileHtml(m){ if(!m.fileUrl) return ''; var isImg=m.fileType&&m.fileType.indexOf('image')===0; if(isImg) return '<div><a href="'+m.fileUrl+'" target="_blank"><img src="'+m.fileUrl+'" style="max-width:160px;border-radius:var(--radius-lg);display:block;margin-top:6px"></a><a href="'+m.fileUrl+'" target="_blank" download>'+String(m.fileName||'فایل').replace(/</g,'&lt;')+'</a></div>'; return '<div style="margin-top:6px"><a href="'+m.fileUrl+'" target="_blank" download style="color:#D71920">📎 '+String(m.fileName||'فایل').replace(/</g,'&lt;')+'</a></div>'; }
      function renderMessages(msgs){ var body=document.getElementById('chat-body'); if(!body||!msgs) return; msgs.forEach(function(m){ if(document.querySelector('[data-msg-id="'+m.id+'"]')) return; var div=document.createElement('div'); var isAdmin=m.sender==='admin'; div.setAttribute('data-msg-id', m.id); div.className='chat-msg '+(isAdmin?'chat-msg--bot':'chat-msg--user'); var txt=m.message?String(m.message).replace(/</g,'&lt;'):''; var fh=fileHtml(m); if(isAdmin) div.innerHTML='<div class="chat-msg__avatar">'+Icons.headphones+'</div><div class="chat-msg__bubble"><div class="chat-msg__text">'+txt+fh+'</div></div>'; else div.innerHTML='<div class="chat-msg__text">'+txt+fh+'</div>'; body.appendChild(div); }); body.scrollTop=body.scrollHeight; }
      function poll(){ var tid=localStorage.getItem(LS_TICKET); if(!tid) return; fetch('/api/support/chat/'+tid+'/messages?guestId='+encodeURIComponent(getGuestId()),{headers:authHeaders()}).then(function(r){ if(!r.ok){ if(r.status===404){ localStorage.removeItem(LS_TICKET); if(_pollTimer){ clearInterval(_pollTimer); _pollTimer=null; } syncSupportUI(); } return null; } return r.json(); }).then(function(d){ if(d&&d.messages) renderMessages(d.messages); }).catch(function(){}); }
      syncSupportUI();       var _pollTimer=null; poll(); _pollTimer=setInterval(poll,3000);
      // Delegated click — works even after widget re-render/open
      document.addEventListener('click', function(e){
        var btn=e.target.closest && e.target.closest('#chat-support-btn');
        if(!btn) return;
        e.preventDefault(); e.stopPropagation();
        var tid=localStorage.getItem(LS_TICKET);
        if(tid){ poll(); syncSupportUI(); return; }
        showWaiting(); btn.disabled=true; btn.style.display='none';
        var statusEl=document.getElementById('chat-support-status'); if(statusEl) statusEl.style.display='block';
        fetch('/api/support/chat/request',{method:'POST',headers:authHeaders(),body:JSON.stringify({guestId:getGuestId()})}).then(function(r){ return r.json().then(function(d){ return {ok:r.ok, d:d}; }); }).then(function(res){
          if(res.d&&res.d.ticketId){ if(res.d.guestId) localStorage.setItem(LS_GUEST,res.d.guestId); localStorage.setItem(LS_TICKET,String(res.d.ticketId)); syncSupportUI(); poll(); }
          else { localStorage.removeItem(LS_TICKET); var b2=document.getElementById('chat-support-btn'); if(b2){ b2.style.display=''; b2.disabled=false; } syncSupportUI(); if(res.d&&res.d.error) alert(res.d.error); }
        }).catch(function(){ localStorage.removeItem(LS_TICKET); var b3=document.getElementById('chat-support-btn'); if(b3){ b3.style.display=''; b3.disabled=false; } syncSupportUI(); });
      });
      // Wrap chatRespond after it is defined — defer to ensure hoisted function exists
      setTimeout(function(){
        if(typeof chatRespond!=='function') return;
        var _orig=chatRespond;
        chatRespond=function(userText, faqKey){
          var tid=localStorage.getItem(LS_TICKET);
          if(tid){
            if(!startChatTurn()) return; /* duplicate submission guard */
            var body=document.getElementById('chat-body');
            if(body){ var d=document.createElement('div'); d.className='chat-msg chat-msg--user'; d.innerHTML='<div class="chat-msg__text">'+String(userText).replace(/</g,'&lt;')+'</div>'; body.appendChild(d); body.scrollTop=body.scrollHeight; }
            var controller=(typeof AbortController!=='undefined')?new AbortController():null;
            var opts={method:'POST',headers:authHeaders(),body:JSON.stringify({message:userText,guestId:getGuestId()})};
            if(controller) opts.signal=controller.signal;
            var abortTimer=controller?setTimeout(function(){ controller.abort(); },CHAT_TURN_TIMEOUT_MS):null;
            fetch('/api/support/chat/'+tid+'/message',opts).then(function(r){ if(r.status===404){ localStorage.removeItem(LS_TICKET); if(_pollTimer){ clearInterval(_pollTimer); _pollTimer=null; } syncSupportUI(); return; } setTimeout(poll,600); }).catch(function(){}).then(function(){ if(abortTimer) clearTimeout(abortTimer); finishChatTurn(); });
            return;
          }
          _orig(userText, faqKey);
        };
      },0);
      document.addEventListener('click', function(e){ if(e.target.closest&&e.target.closest('#chat-attach')){ var tid=localStorage.getItem(LS_TICKET); if(!tid){ alert('ابتدا درخواست چت با پشتیبانی را بزنید'); return; } document.getElementById('chat-file').click(); }});
      setTimeout(function(){ var b=document.getElementById('chat-attach'); if(!b) return; b.addEventListener('mouseenter', function(){ b.style.background='#f9fafb'; b.style.borderColor='#d1d5db'; b.style.color='#374151'; }); b.addEventListener('mouseleave', function(){ b.style.background='#fff'; b.style.borderColor='#e5e7eb'; b.style.color='#6b7280'; }); },500);
      var cf=document.getElementById('chat-file'); if(cf) cf.addEventListener('change', function(){ var f=this.files[0]; if(!f) return; var tid=localStorage.getItem(LS_TICKET); var fd=new FormData(); fd.append('file',f); var inp=document.getElementById('chat-input'); if(inp&&inp.value) fd.append('message', inp.value); fetch('/api/support/chat/'+tid+'/attachment?guestId='+encodeURIComponent(getGuestId()),{method:'POST', headers:{'X-Guest-Id':getGuestId()}, body:fd}).then(function(r){return r.json()}).then(function(){ poll(); if(inp) inp.value=''; }).catch(function(){}); this.value=''; });
    })();
    /* Suggestion buttons — delegated on the container so the handler survives
       any re-render, and routed through chatRespond() so suggestions share the
       same turn lifecycle (duplicate guard + always-restore) as typed messages. */
    var chatSuggestions = document.getElementById('chat-suggestions');
    if (chatSuggestions) {
      chatSuggestions.addEventListener('click', function (e) {
        var btn = e.target.closest('.chat-suggestion');
        if (!btn) return;
        if (chatTurnActive || btn.disabled) return; /* duplicate submission guard */
        var q = btn.getAttribute('data-q');
        if (!q) return;
        chatRespond(btn.textContent, q);
      });
    }

    /* Text input */
    var chatInput = document.getElementById('chat-input');
    var chatSend = document.getElementById('chat-send');
    if (chatInput && chatSend) {
      chatSend.addEventListener('click', function () {
        var val = chatInput.value.trim();
        if (!val) return;
        chatRespond(val);
        chatInput.value = '';
      });
      chatInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var val = chatInput.value.trim();
          if (!val) return;
          chatRespond(val);
          chatInput.value = '';
        }
      });
    }

    /* ── PWA install option: re-sync if installability arrives later ── */
    document.addEventListener('as_pwa_installable', function () { syncPwaInstallVisibility(document); });
  }

  /* ── Promo Top Bar rotation (Digikala-style, auto-only) ───
     One message visible at a time, next every 30s, fade/slide via
     CSS (.promo-topbar__msg.is-active). No manual controls. */
  function initPromoTopbar() {
    /* Singleton: init runs on top of the synchronous critical render, so a
       second call must not stack another 30s rotation timer. */
    if (initPromoTopbar._done) return;
    initPromoTopbar._done = true;
    var viewports = document.querySelectorAll('.promo-topbar__viewport');
    if (!viewports.length) return;
    var ROTATE_MS = 30000;
    var index = 0;
    setInterval(function () {
      index += 1;
      viewports.forEach(function (viewport) {
        var msgs = viewport.querySelectorAll('.promo-topbar__msg');
        if (!msgs.length) return;
        var next = index % msgs.length;
        msgs.forEach(function (msg, i) {
          msg.classList.toggle('is-active', i === next);
        });
      });
    }, ROTATE_MS);
  }

  /* ── Mega menu (rendered from live AppData.categories) ─────── */
  function renderMegaMenu() {
    var dd = document.getElementById('categories-dropdown');
    if (!dd || typeof AppData === 'undefined' || !AppData.categories) return;
    /* Idempotent: rebuilding identical markup would flash/reset the open
       panel and hover state on every catalog refresh. */
    try {
      var sig = AppData.categories.map(function (c) { return c.slug + ':' + ((c.subcategories || []).length); }).join('|');
      if (dd._asMegaSig === sig && dd.innerHTML.trim()) return;
      dd._asMegaSig = sig;
    } catch (e) {}
    /* Build Digikala-style two-panel mega menu: left = category list, right = subcategories */
    var leftPanel = AppData.categories.map(function(cat, idx) {
      var catIcon = getCategoryIcon(cat.icon) || Icons.package;
      var isActive = idx === 0 ? ' is-active' : '';
      return '<a href="/shop?category=' + cat.slug + '" class="mega-cat' + isActive + '" data-cat-index="' + idx + '" data-cat-slug="' + cat.slug + '">' + catIcon + '<span class="mega-cat__name">' + cat.name + '</span>' + Icons.chevronRight + '</a>';
    }).join('');
    /* Build subcategory panels (one per category) */
    var rightPanels = AppData.categories.map(function(cat, idx) {
      var catIcon = getCategoryIcon(cat.icon) || Icons.package;
      var subs = cat.subcategories || [];
      var subLinks = subs.map(function(sub) {
        return '<a href="/shop?category=' + cat.slug + '" class="mega-sub__item"><span class="mega-sub__icon">' + catIcon + '</span><span>' + sub + '</span></a>';
      }).join('');
      var hidden = idx === 0 ? '' : ' hidden';
      return '<div class="mega-panel" data-cat-index="' + idx + '"' + hidden + '><a href="/shop?category=' + cat.slug + '" class="mega-panel__all">' + catIcon + ' همه محصولات ' + cat.name + '</a><div class="mega-panel__cols"><div class="mega-panel__col">' + subLinks + '</div></div></div>';
    }).join('');
    dd.innerHTML = '<div class="mega-left"><div class="mega-left__list">' + leftPanel + '</div></div><div class="mega-right">' + rightPanels + '</div>';
  }

  /* ── Init ─────────────────────────────────────────────────── */
  function init() {
    /* Ensure guest session exists for anonymous users */
    getGuestSession();

    /* Refresh state from correct storage key (user or guest) */
    refreshState();

    /* Centralized identity/contact must reach every page, including ones with
       no footer (login, register, forgot-password, checkout, offline…). */
    applyStoreSettingsEverywhere();

    var headerEl = $('#site-header');
    var footerEl = $('#site-footer');
    var overlaysEl = $('#site-overlays');
    var mobileHeaderEl = $('#mobile-header');

    if (headerEl) renderHeader(headerEl);
    if (mobileHeaderEl) renderMobileHeader(mobileHeaderEl);
    /* Pages may ship pre-rendered (Visual Builder) header markup — including a
       baked-in logged-in account menu. renderHeader preserves it, so always
       re-sync just the auth area from live state on init; later async auth
       changes (fetchMe/401/logout) already re-sync via their own paths. */
    try { refreshHeaderAuth(); } catch (e) {}
    var _currentPage = storeFile().toLowerCase();
    if (!_currentPage) _currentPage = '/';
    if (footerEl) {
      if (_currentPage === 'index.html') {
        renderFooter(footerEl);
      } else {
        footerEl.remove();
      }
    }
    if (overlaysEl) renderOverlays(overlaysEl);

    renderMegaMenu();
    // Rebuild once live catalog arrives so admin category changes show up.
    try {
      if (!init._catalogHooked && typeof AppData !== 'undefined' && AppData.catalogReady) {
        init._catalogHooked = true;
        if (AppData.catalogReady.then) AppData.catalogReady.then(renderMegaMenu);
        document.addEventListener('camzy:catalog-updated', renderMegaMenu);
      }
    } catch (e) {}
    // Homepage sections (مدیریت صفحه اصلی): titles, enable/disable, order,
    // featured categories/products and amazing-discounts countdown.
    // Reads home.* keys from /api/content; no-ops when absent or disabled.
    /* Promo top bar CMS sync (بنرهای تبلیغاتی). Runs over EVERY .promo-topbar
       instance: the desktop header and the mobile header each ship their own
       copy, and on small viewports only the mobile one is visible. Applying to
       a single querySelector() match (or to one flat message list) left the
       mobile bar with hardcoded text and no banner image or dimensions.
       Visual-Builder page headers own their markup and are skipped. */
    function applyPromoTopbarCms(c){
      if(!c) return;
      /* Count = promo.topbar.count (dynamic list). Legacy data with no count
         key falls back to the highest non-empty promo.topbar.<n> slot. */
      function promoCount(){
        var raw=c['promo.topbar.count'];
        var n=(raw!=null&&String(raw).trim()!=='')?parseInt(raw,10):NaN;
        if(!isFinite(n)||n<0){
          n=0;
          for(var i=1;i<=20;i++){
            var t=c['promo.topbar.'+i], im=c['promo.topbar.'+i+'.image'];
            if((t!=null&&String(t)!=='')||(im!=null&&String(im)!=='')) n=i;
          }
          if(!n) n=3;
        }
        return Math.max(1,Math.min(n,20));
      }
      var count=promoCount();
      var bars=document.querySelectorAll('.promo-topbar');
      Array.prototype.forEach.call(bars,function(bar){
        try{
          if(bar.closest&&bar.closest('[data-pb-page-header]')) return;
          var tbEnabled = c['home.topbar.enabled']==null || String(c['home.topbar.enabled'])==='1';
          if(c['home.topbar.enabled']!=null) bar.style.display = tbEnabled ? '' : 'none';
          /* The height variable is set on <body> (not the bar) so the desktop
             body reservation and the mobile sticky offsets inherit the same
             value as the bar's own viewport height. */
          var tbH=parseInt(c['promo.topbar.height'],10);
          if(!tbEnabled) document.body.style.removeProperty('--promo-topbar-height');
          else if(tbH>=20&&tbH<=100) document.body.style.setProperty('--promo-topbar-height', tbH+'px');
          var tbIH=parseInt(c['promo.topbar.img_height'],10), tbIW=parseInt(c['promo.topbar.img_width'],10);
          var viewport=bar.querySelector('.promo-topbar__viewport');
          if(!viewport) return;
          var promos=viewport.querySelectorAll('.promo-topbar__msg');
          /* Grow/shrink the message list to the exact saved count so the
             storefront always renders the same number of messages. */
          while(promos.length>count){ viewport.removeChild(promos[promos.length-1]); promos=viewport.querySelectorAll('.promo-topbar__msg'); }
          while(promos.length<count){
            var span=document.createElement('span');
            span.className='promo-topbar__msg';
            var im2=document.createElement('img'); im2.className='promo-topbar__img'; im2.setAttribute('src',''); im2.setAttribute('alt',''); im2.style.display='none';
            var tx=document.createElement('span'); tx.className='promo-topbar__text';
            span.appendChild(im2); span.appendChild(tx);
            viewport.appendChild(span);
            promos=viewport.querySelectorAll('.promo-topbar__msg');
          }
          /* Exactly one active message (the first) after any resize. */
          for(var p=0;p<promos.length;p++){
            promos[p].classList.toggle('is-active', p===0);
            var imgEl=promos[p].querySelector('.promo-topbar__img');
            var textEl=promos[p].querySelector('.promo-topbar__text');
            if(imgEl){
              var imgUrl=c['promo.topbar.'+(p+1)+'.image']||'';
              if(imgUrl){ imgEl.src=imgUrl; imgEl.style.display=''; imgEl.style.height=''; imgEl.style.width=''; promos[p].classList.add('has-image'); }
              else{ imgEl.removeAttribute('src'); imgEl.style.display='none'; promos[p].classList.remove('has-image'); }
            }
            if(textEl) textEl.textContent=(c['promo.topbar.'+(p+1)]!=null)?c['promo.topbar.'+(p+1)]:'';
          }
        }catch(e){}
      });
    }
    function applyHomeSections(c){
      var SECTIONS=[
        {key:'hero', el:'hero-slideshow', titleKey:null},
        {key:'categories', el:'categories', titleKey:'section.categories.title'},
        {key:'bestsellers', el:'bestsellers', titleKey:'section.bestsellers.title'},
        {key:'amazing', el:'special-offers', titleKey:'section.offers.title'},
        {key:'new', el:'new-products', titleKey:'section.new.title'},
        {key:'brands', el:'brands', titleKey:'section.brands.title'}
      ];
      function secEnabled(s){ return String(c['home.sections.'+s.key+'.enabled']||'1')==='1'; }
      // Titles
      SECTIONS.forEach(function(s){
        if(!s.titleKey || c[s.titleKey]==null || String(c[s.titleKey]).trim()==='') return;
        var el=document.getElementById(s.el); if(!el) return;
        var t = s.key==='amazing' ? el.querySelector('.special-offers__title-text') : el.querySelector('.section-title');
        if(t) t.textContent=c[s.titleKey];
      });
      // Enable / disable
      SECTIONS.forEach(function(s){
        var el=document.getElementById(s.el); if(!el) return;
        el.style.display = secEnabled(s) ? '' : 'none';
      });
      // Promo topbar: visibility, messages, image + dimensions (all bars)
      applyPromoTopbarCms(c);
      // Order (managed sections keep their anchor; unmanaged stay put)
      try{
        var order=String(c['home.sections.order']||'').split(',').map(function(x){return x.trim();}).filter(Boolean);
        if(order.length>1){
          var byKey={}; SECTIONS.forEach(function(s){ byKey[s.key]=s; });
          var first=null, parent=null;
          order.forEach(function(k){ var s=byKey[k]; if(!s) return; var el=document.getElementById(s.el); if(!el) return; if(!first){ first=el; parent=el.parentNode; } });
          if(first&&parent){
            var anchor=first;
            order.forEach(function(k){
              var s=byKey[k]; if(!s) return;
              var el=document.getElementById(s.el); if(!el||el.parentNode!==parent) return;
              parent.insertBefore(el, anchor);
              anchor=el.nextSibling;
            });
          }
        }
      }catch(e){}
      // Featured categories (comma slugs; empty = all)
      try{
        var catList=String(c['home.featured.categories']||'').split(',').map(function(x){return x.trim();}).filter(Boolean);
        if(catList.length){
          var grid=document.getElementById('categories-grid');
          if(grid) Array.prototype.forEach.call(grid.querySelectorAll('a[href*="category="]'), function(a){
            var m=/category=([^&#]*)/.exec(a.getAttribute('href')||'');
            if(m) a.style.display = catList.indexOf(decodeURIComponent(m[1]))!==-1 ? '' : 'none';
          });
        }
      }catch(e){}
      // Featured products: bestsellers + amazing grids (comma slugs; empty = all)
      function filterProductGrid(gridId, list){
        if(!list.length) return;
        var grid=document.getElementById(gridId); if(!grid) return;
        Array.prototype.forEach.call(grid.querySelectorAll('a[href*="slug="]'), function(a){
          var m=/slug=([^&#]*)/.exec(a.getAttribute('href')||'');
          if(m) a.style.display = list.indexOf(decodeURIComponent(m[1]))!==-1 ? '' : 'none';
        });
      }
      try{
        var featList=String(c['home.featured.products']||'').split(',').map(function(x){return x.trim();}).filter(Boolean);
        filterProductGrid('bestsellers-grid', featList);
        var amazList=String(c['home.amazing.products']||'').split(',').map(function(x){return x.trim();}).filter(Boolean);
        filterProductGrid('special-offers-grid', amazList);
      }catch(e){}
      // Amazing countdown target (ISO datetime; ignored when empty/past)
      try{
        var endsAt=String(c['home.amazing.ends_at']||'').trim();
        var h=document.getElementById('countdown-hours'), mi=document.getElementById('countdown-minutes'), se=document.getElementById('countdown-seconds');
        if(endsAt && h && mi && se){
          var target=new Date(endsAt).getTime();
          if(isFinite(target)){
            var faNum=function(n){ try{ return Number(n).toLocaleString('fa-IR',{minimumIntegerDigits:2,useGrouping:false}); }catch(e){ return String(n); } };
            var tick=function(){
              var diff=target-Date.now();
              if(diff<=0){ h.textContent=faNum(0); mi.textContent=faNum(0); se.textContent=faNum(0); return; }
              var hh=Math.floor(diff/3600000), mm=Math.floor(diff%3600000/60000), ss=Math.floor(diff%60000/1000);
              h.textContent=faNum(hh); mi.textContent=faNum(mm); se.textContent=faNum(ss);
              setTimeout(tick,1000);
            };
            tick();
          }
        }
      }catch(e){}
    }
    // Apply CMS content (promo/footer) from /api/content so admin edits appear on storefront.
    // NOTE: hero slides are owned by /api/hero-slides (rendered by site-content.js).
    // The legacy hero.slideN.* overwrite was removed: it clobbered fresh API
    // slides with stale content keys and assumed a fixed 4-slide layout.
    try {
      if(location.protocol!=='file:' && typeof fetch==='function'){
        fetch('/api/content').then(function(r){ return r.ok?r.json():null; }).then(function(c){
          if(!c) return;
          // Promo topbar (all bars: desktop + mobile header copies)
          try{ applyPromoTopbarCms(c); }catch(e){}
          if(c['footer.brand.desc']!=null){ var fd=document.querySelector('.footer-brand__desc'); if(fd) fd.textContent=c['footer.brand.desc']; }
          if(c['footer.address']!=null){
            var links=document.querySelectorAll('.footer-link');
            for(var k=0;k<links.length;k++){
              if(links[k].textContent.indexOf('ولیعصر')!==-1 || links[k].textContent.indexOf('تهران')!==-1){
                var ic=links[k].querySelector('svg'); if(ic) links[k].innerHTML=ic.outerHTML+' '+c['footer.address']; break;
              }
            }
          }
          try{ applyHomeSections(c); }catch(e){}
        }).catch(function(){});
      }
    } catch(e){}

    // SEO (تنظیمات SEO): global tags from /api/settings (seo.*) plus
    // per-page / per-product / per-article overrides. Head-only changes;
    // skips empty values so hardcoded fallbacks stay intact.
    function setMetaName(name, content){
      if(content==null || String(content)==='') return;
      var m=document.querySelector('meta[name="'+name+'"]');
      if(!m){ m=document.createElement('meta'); m.setAttribute('name',name); document.head.appendChild(m); }
      m.setAttribute('content', String(content));
    }
    function setMetaProp(prop, content){
      if(content==null || String(content)==='') return;
      var m=document.querySelector('meta[property="'+prop+'"]');
      if(!m){ m=document.createElement('meta'); m.setAttribute('property',prop); document.head.appendChild(m); }
      m.setAttribute('content', String(content));
    }
    /* Set document.title from an explicit (SEO) source without the store-name
       MutationObserver rewriting the trailing brand segment. */
    function setDocTitle(v){
      try {
        window.__skipStoreTitleFix = 1;
        document.title = v;
        setTimeout(function(){ window.__skipStoreTitleFix = 0; }, 0);
      } catch (e) { document.title = v; }
    }
    function applySeoGlobal(s){
      if(!s) return;
      if(s['seo.site_title']) setDocTitle(s['seo.site_title']);
      setMetaName('description', s['seo.meta_description']||'');
      setMetaName('keywords', s['seo.meta_keywords']||'');
      var robots=String(s['seo.robots']||'').trim();
      if(/^(index|noindex),(follow|nofollow)$/.test(robots)) setMetaName('robots', robots);
      setMetaProp('og:title', s['seo.og_title']||s['seo.site_title']||'');
      setMetaProp('og:description', s['seo.og_description']||s['seo.meta_description']||'');
      setMetaProp('og:image', s['seo.og_image']||'');
      var gsc=String(s['seo.gsc_code']||'').trim();
      if(gsc) setMetaName('google-site-verification', gsc);
    }
    function applySeoItem(seo){
      if(!seo) return;
      if(seo.title) setDocTitle(seo.title);
      if(seo.description) setMetaName('description', seo.description);
      setMetaProp('og:title', seo.title||'');
      setMetaProp('og:description', seo.description||'');
      if(seo.noindex) setMetaName('robots', 'noindex,nofollow');
    }
    /* Clean URLs: map any storefront path (clean or legacy .html) to its
       underlying .html file, and extract the detail ref (/product/:ref …). */
    // storeFile, storeRef, setCanonical, pageKeyForSeo are now at module level
    try {
      if(location.protocol!=='file:' && typeof fetch==='function'){
        fetch('/api/settings').then(function(r){ return r.ok?r.json():null; }).then(function(s){
          if(s) applySeoGlobal(s);
          var key=pageKeyForSeo();
          var qs=function(){ try{ return new URLSearchParams(location.search); }catch(e){ return null; } }();
          function done(){}
          // Detail pages: item SEO overrides global. Clean paths (/product/:ref …)
          // carry the ref in the pathname instead of the query string.
          var ref=storeRef();
          var productSlug=qs && (qs.get('slug') || (key==='product' ? ref : ''));
          var articleAid=qs && (qs.get('id') || qs.get('slug') || (key==='article-detail' ? ref : ''));
          var pageSlug=qs && (qs.get('slug') || (key==='page' ? ref : ''));
          setCanonical();
          if(key==='product' && productSlug){
            fetch('/api/products/'+encodeURIComponent(productSlug)).then(function(r){ return r.ok?r.json():null; }).then(function(p){
              if(p&&p.seo&&(p.seo.title||p.seo.description||p.seo.noindex)) applySeoItem(p.seo);
              else fetch('/api/seo/page?key=product').then(function(r){ return r.ok?r.json():null; }).then(function(d){ if(d) applySeoItem(d); }).catch(done);
            }).catch(done);
          } else if(key==='article-detail' && articleAid){
            var aid=articleAid;
            fetch('/api/articles/'+encodeURIComponent(aid)).then(function(r){ return r.ok?r.json():null; }).then(function(a){
              var item=Array.isArray(a)?a[0]:a;
              if(item&&item.seo&&(item.seo.title||item.seo.description||item.seo.noindex)) applySeoItem(item.seo);
              else fetch('/api/seo/page?key=article').then(function(r){ return r.ok?r.json():null; }).then(function(d){ if(d) applySeoItem(d); }).catch(done);
            }).catch(done);
          } else if(key==='page' && pageSlug){
            fetch('/api/pages/'+encodeURIComponent(pageSlug)).then(function(r){ return r.ok?r.json():null; }).then(function(pg){
              if(pg&&pg.seo&&(pg.seo.title||pg.seo.description||pg.seo.noindex)) applySeoItem(pg.seo);
              else fetch('/api/seo/page?key='+encodeURIComponent(pageSlug)).then(function(r){ return r.ok?r.json():null; }).then(function(d){ if(d) applySeoItem(d); }).catch(done);
            }).catch(done);
          } else {
            fetch('/api/seo/page?key='+encodeURIComponent(key)).then(function(r){ return r.ok?r.json():null; }).then(function(d){ if(d) applySeoItem(d); }).catch(done);
          }
        }).catch(function(){});
      }
    } catch(e){}

    /* Scroll shadow for sticky header (desktop + mobile) */
    function onScroll() {
      var scrolled = window.scrollY > 10;
      var dh = document.querySelector('.site-header');
      var mh = document.querySelector('.mobile-header');
      if (dh) dh.classList.toggle('is-scrolled', scrolled);
      if (mh) mh.classList.toggle('is-scrolled', scrolled);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    bindEvents();
    updateCartUI();
    initPromoTopbar();
  }

  /* ── Public API ───────────────────────────────────────────── */

    /* ── Price Changer (product cards) ────────────────────────── */
  function selectCardPricing(productId, mode) {
    var product = AppData.products.find(function (p) { return p.id === productId; });
    if (!product) return;
    /* Update spans in the priceChanger */
    var changer = document.querySelector('.priceChanger[data-pricing="' + productId + '"]');
    if (changer) {
      changer.querySelectorAll('span').forEach(function (s) {
        s.classList.toggle('active', s.getAttribute('data-mode') === mode);
      });
      changer.setAttribute('data-selected-mode', mode);
    }
    /* Update price display */
    var priceArea = document.querySelector('[data-price-area="' + productId + '"]');
    if (priceArea) {
      var newPrice = getProductPrice(product);
      var priceSpan = priceArea.querySelector('.product-card__price-current');
      if (priceSpan) {
        priceSpan.innerHTML = Format.price(newPrice) + ' <span class="product-card__price-currency">تومان</span>';
      }
    }
    try { syncProductCards(); } catch (e) {}
  }

/* ── Shared mouse drag-to-scroll (desktop only) ──────────
     Click-and-drag horizontal scrolling for ALL horizontal product
     carousels/sliders. Mouse only: guarded by (pointer: fine) at bind
     time and by pointerType at event time, so touch/swipe on mobile is
     untouched. RTL-safe (site is dir=rtl). A drag suppresses the
     follow-up click so product links don't fire after dragging.
     Prevents text/image selection while dragging via .is-dragging. */
  var DRAG_SELECTOR = '.special-offers__carousel, .rec-carousel, .cart-recent-carousel, .pdp-thumbnails, .product-tabs__nav';

  function enableDragToScroll(el) {
    if (!el || el.dataset.dragScroll === 'on') return;
    if (window.matchMedia && window.matchMedia('(pointer: fine)').matches === false) return;
    el.dataset.dragScroll = 'on';
    el.classList.add('is-draggable');

    var isDown = false;
    var startX = 0;
    var startScroll = 0;
    var dragged = false;
    var momentum = null;

    /* ── Momentum tracking ─────────────────────────────────────── */
    var velSamples = [];
    var DAMPING = 0.85;

    function recordSample(e) {
      var now = Date.now();
      velSamples.push({ x: e.clientX, t: now });
      /* keep only last 120 ms of samples */
      while (velSamples.length > 1 && now - velSamples[0].t > 120) velSamples.shift();
    }

    function averageVelocity() {
      if (velSamples.length < 2) return 0;
      var first = velSamples[0];
      var last = velSamples[velSamples.length - 1];
      var dt = last.t - first.t;
      if (dt === 0) return 0;
      return (last.x - first.x) / dt;
    }

    function applyMomentum() {
      var vel = averageVelocity();
      if (Math.abs(vel) < 0.3) {
        momentum = null;
        return;
      }
      var lastTime = Date.now();
      function step() {
        var now = Date.now();
        var dt = now - lastTime;
        lastTime = now;
        vel *= Math.pow(DAMPING, dt / 16);
        el.scrollLeft -= vel * (dt / 16);
        if (Math.abs(vel) < 0.15) {
          momentum = null;
          return;
        }
        momentum = requestAnimationFrame(step);
      }
      momentum = requestAnimationFrame(step);
    }

    el.addEventListener('pointerdown', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (e.button !== undefined && e.button !== 0) return;
      if (el.scrollWidth <= el.clientWidth + 1) return;
      if (momentum) { cancelAnimationFrame(momentum); momentum = null; }
      isDown = true;
      dragged = false;
      startX = e.clientX;
      startScroll = el.scrollLeft;
      velSamples = [{ x: e.clientX, t: Date.now() }];
      el.classList.add('is-dragging');
      if (el.setPointerCapture && e.pointerId !== undefined) {
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      }
    });

    el.addEventListener('pointermove', function (e) {
      if (!isDown) return;
      if (e.pointerType && e.pointerType !== 'mouse') return;
      var dx = e.clientX - startX;
      if (!dragged && Math.abs(dx) < 5) return;
      dragged = true;
      if (e.cancelable) e.preventDefault();
      el.scrollLeft = startScroll - dx * DAMPING;
      recordSample(e);
    });

    function endDrag(e) {
      if (!isDown) return;
      isDown = false;
      el.classList.remove('is-dragging');
      if (dragged && e && e.type === 'pointerup') {
        applyMomentum();
        var suppress = function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        };
        el.addEventListener('click', suppress, true);
        setTimeout(function () { el.removeEventListener('click', suppress, true); }, 100);
      }
      dragged = false;
      velSamples = [];
    }

    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('dragstart', function (e) { e.preventDefault(); });
  }

  function initDragCarousels(root) {
    var scope = root || document;
    var list = [];
    try { list = scope.querySelectorAll ? scope.querySelectorAll(DRAG_SELECTOR) : []; }
    catch (e) { list = []; }
    for (var i = 0; i < list.length; i++) enableDragToScroll(list[i]);
  }

  function watchDragCarousels() {
    initDragCarousels(document);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { initDragCarousels(document); });
    }
    /* Carousels rendered dynamically (homepage, cart recent, product
       thumbnails) appear after common.js init — observe and bind. */
    if (window.MutationObserver) {
      var observer = new MutationObserver(function (mutations) {
        for (var m = 0; m < mutations.length; m++) {
          var added = mutations[m].addedNodes;
          for (var a = 0; a < added.length; a++) {
            var node = added[a];
            if (!node || node.nodeType !== 1) continue;
            if (node.matches && node.matches(DRAG_SELECTOR)) enableDragToScroll(node);
            initDragCarousels(node);
          }
        }
      });
      var startObserving = function () {
        try { observer.observe(document.body || document.documentElement, { childList: true, subtree: true }); }
        catch (e) {}
      };
      if (document.body) startObserving();
      else document.addEventListener('DOMContentLoaded', startObserving);
    } else {
      document.addEventListener('DOMContentLoaded', function () { initDragCarousels(document); });
    }
  }

  watchDragCarousels();

  /* Backward-compat global (cart-page.js and other pages call it directly) */
  try { window.enableDragToScroll = enableDragToScroll; } catch (e) {}

  /* ════════════════════════════════════════════════════════════
     ADDRESSES — API/database backed, localStorage as offline cache
     ============================================================ */
  function addressesApiAvailable() { return apiAvailable(); }

  function normAddress(a) {
    if (!a) return a;
    var out = Object.assign({}, a);
    if (out.name === undefined && out.fullName) out.name = out.fullName;
    if (out.fullName === undefined && out.name) out.fullName = out.name;
    out.id = (typeof out.id === 'string' && /^\d+$/.test(out.id)) ? parseInt(out.id, 10) : out.id;
    return out;
  }

  function getCachedAddresses() { return getUserData('addresses', []); }

  function setCachedAddresses(arr) {
    setUserData('addresses', arr || []);
    try { window.dispatchEvent(new CustomEvent('as_addresses_change')); } catch (e) {}
  }

  function listAddresses() {
    var user = getCurrentUser();
    if (!user) return Promise.resolve(getCachedAddresses());
    if (!addressesApiAvailable()) return Promise.resolve(getCachedAddresses());
    return apiRequest('GET', '/users/' + encodeURIComponent(user.id) + '/addresses')
      .then(function (data) {
        var list = (Array.isArray(data) ? data : []).map(normAddress);
        setUserData('addresses', list);
        try { window.dispatchEvent(new CustomEvent('as_addresses_change')); } catch (e) {}
        return list;
      })
      .catch(function () { return getCachedAddresses(); });
  }

  function createAddress(data) {
    var user = getCurrentUser();
    if (!user) return Promise.reject(new Error('Not authenticated'));
    if (!addressesApiAvailable()) {
      var list = getCachedAddresses();
      var na = Object.assign({ id: Date.now(), name: data.fullName }, data);
      if (!list.length) na.isDefault = true;
      if (na.isDefault) list.forEach(function (x) { x.isDefault = false; });
      list.push(na);
      if (!list.some(function (x) { return x.isDefault; })) list[0].isDefault = true;
      setCachedAddresses(list);
      return Promise.resolve(normAddress(na));
    }
    return apiRequest('POST', '/users/' + encodeURIComponent(user.id) + '/addresses', data)
      .then(function (created) {
        created = normAddress(created);
        var cached = getCachedAddresses();
        cached.push(created);
        if (created.isDefault) cached.forEach(function (x) { x.isDefault = String(x.id) === String(created.id); });
        if (!cached.some(function (x) { return x.isDefault; }) && cached.length) cached[0].isDefault = true;
        setCachedAddresses(cached);
        return created;
      });
  }

  function updateAddress(id, data) {
    if (!addressesApiAvailable()) {
      var list = getCachedAddresses();
      var idx = -1;
      for (var i = 0; i < list.length; i++) { if (String(list[i].id) === String(id)) { idx = i; break; } }
      if (idx === -1) return Promise.reject(new Error('Address not found'));
      list[idx] = Object.assign({}, list[idx], data, { name: data.fullName || list[idx].name });
      if (data.isDefault) list.forEach(function (x) { x.isDefault = String(x.id) === String(id); });
      setCachedAddresses(list);
      return Promise.resolve(normAddress(list[idx]));
    }
    return apiRequest('PUT', '/addresses/' + encodeURIComponent(id), data)
      .then(function (updated) {
        updated = normAddress(updated);
        var cached = getCachedAddresses();
        var found = false;
        cached = cached.map(function (x) {
          if (String(x.id) === String(updated.id)) { found = true; return updated; }
          if (updated.isDefault) return Object.assign({}, x, { isDefault: false });
          return x;
        });
        if (!found) cached.push(updated);
        setCachedAddresses(cached);
        return updated;
      });
  }

  function deleteAddress(id) {
    if (!addressesApiAvailable()) {
      var list = getCachedAddresses().filter(function (a) { return String(a.id) !== String(id); });
      setCachedAddresses(list);
      return Promise.resolve({ ok: true });
    }
    return apiRequest('DELETE', '/addresses/' + encodeURIComponent(id))
      .then(function (res) {
        setCachedAddresses(getCachedAddresses().filter(function (a) { return String(a.id) !== String(id); }));
        return res;
      });
  }

  function setDefaultAddress(id) {
    if (!addressesApiAvailable()) {
      var list = getCachedAddresses();
      list.forEach(function (x) { x.isDefault = String(x.id) === String(id); });
      setCachedAddresses(list);
      return Promise.resolve(normAddress(list.filter(function (x) { return String(x.id) === String(id); })[0] || null));
    }
    return apiRequest('POST', '/addresses/' + encodeURIComponent(id) + '/default', {})
      .then(function (updated) {
        updated = normAddress(updated);
        setCachedAddresses(getCachedAddresses().map(function (x) {
          return Object.assign({}, x, { isDefault: String(x.id) === String(updated.id) });
        }));
        return updated;
      });
  }

  /* ════════════════════════════════════════════════════════════
     ORDERS — API/database backed, localStorage as offline cache
     ============================================================ */
  function ordersApiAvailable() { return apiAvailable(); }

  function getCachedOrders() { return getUserData('orders', []); }

  function setCachedOrders(arr) { setUserData('orders', arr || []); }

  function listOrders() {
    var user = getCurrentUser();
    if (!user) return Promise.resolve(getCachedOrders());
    if (!ordersApiAvailable()) return Promise.resolve(getCachedOrders());
    return apiRequest('GET', '/users/' + encodeURIComponent(user.id) + '/orders')
      .then(function (data) {
        var list = Array.isArray(data) ? data : [];
        setUserData('orders', list);
        return list;
      })
      .catch(function () { return getCachedOrders(); });
  }

  function getOrder(id) {
    if (!ordersApiAvailable()) {
      var found = null;
      getCachedOrders().forEach(function (o) { if (String(o.id) === String(id)) found = o; });
      return Promise.resolve(found);
    }
    return apiRequest('GET', '/orders/' + encodeURIComponent(id))
      .then(function (order) {
        if (order && order.id) {
          var cached = getCachedOrders();
          var seen = false;
          cached = cached.map(function (o) { if (String(o.id) === String(order.id)) { seen = true; return order; } return o; });
          if (!seen) cached.unshift(order);
          setUserData('orders', cached);
        }
        return order;
      })
      .catch(function () {
        var f = null;
        getCachedOrders().forEach(function (o) { if (String(o.id) === String(id)) f = o; });
        return f;
      });
  }

  function createOrder(payload) {
    var user = getCurrentUser();
    var body = Object.assign({}, payload || {});
    if (user) body.userId = user.id;
    if (!ordersApiAvailable()) {
      if (!body.id) body.id = generateOrderId();
      var cached = getCachedOrders();
      cached.unshift(body);
      setCachedOrders(cached);
      return Promise.resolve(body);
    }
    return apiRequest('POST', '/orders', body).then(function (created) {
      var order = (created && created.id) ? created : body;
      var c = getCachedOrders();
      var exists = false;
      c.forEach(function (o) { if (String(o.id) === String(order.id)) exists = true; });
      if (!exists) c.unshift(order);
      setCachedOrders(c);
      return order;
    });
  }

  /* ── User notifications (DB-backed via /api/notifications; read state persists in SQLite) ── */
  function listNotifications() {
    if (!isLoggedIn() || !apiAvailable()) return Promise.resolve({ unreadCount: 0, items: [] });
    /* Admin sessions are logged in but carry an admin_sessions token, which the
       customer-scoped /api/notifications endpoint (customer_sessions only)
       always rejects with 401. Skip the request so admin storefront sessions
       see an empty state instead of a false "session expired" error — the
       session itself stays valid and no auth check is weakened. */
    if (isAdminSession()) return Promise.resolve({ unreadCount: 0, items: [] });
    return apiRequest('GET', '/notifications')
      .then(function (data) {
        return { unreadCount: Number(data.unreadCount) || 0, items: Array.isArray(data.items) ? data.items : [] };
      })
      .catch(function (err) {
        /* Never fail silently into an "empty" UI: log the real cause
           (usually an expired Bearer token) so the live browser console
           shows why notifications are missing. */
        try { if (window.console && console.warn) console.warn('[App] listNotifications failed:', (err && err.message) || err); } catch (e) {}
        return { unreadCount: 0, items: [], error: (err && err.message) || 'Request failed' };
      });
  }

  function markNotificationRead(id) {
    if (!isLoggedIn() || !apiAvailable()) return Promise.resolve({ ok: false });
    /* Same admin-session guard as listNotifications: no customer row exists for
       admins, so the read endpoint would only answer 401. */
    if (isAdminSession()) return Promise.resolve({ ok: false });
    return apiRequest('POST', '/notifications/' + encodeURIComponent(id) + '/read', {}).catch(function () { return { ok: false }; });
  }

  /* ── Storefront notification center (bell + panel + new-item popup) ──
     Single system: reads from GET /api/notifications and persists reads via
     POST /api/notifications/:id/read only. No duplicate store, no redesign —
     reuses .header-action, .header-account-dropdown and .toast styling. */
  var NOTIF_POLL_MS = 30000;
  var NOTIF_SEEN_KEY = 'as_notif_seen_ids';
  var NOTIF_DISMISS_KEY = 'as_notif_dismissed_ids';
  var notifCache = { items: [], unreadCount: 0 };
  var notifFirstSync = false;
  var notifPollTimer = null;
  var NOTIF_BELL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';

  function notifExcludedPage() {
    try {
      var p = (window.location.pathname || '').toLowerCase();
      if (p.indexOf('/admin') !== -1) return true;
      var f = (function(){ try { return storeFile(); } catch(e){ return p.split('/').pop().split('?')[0].split('#')[0]; } })();
      if (f === '/login' || f === '/register' || f === '/forgot-password') return true;
      if (document.body && document.body.classList.contains('admin')) return true;
    } catch (e) {}
    return false;
  }
  function notifEnabled() { return !notifExcludedPage() && isLoggedIn() && apiAvailable(); }

  function notifIdSet(key) {
    try {
      var arr = JSON.parse(sessionStorage.getItem(key) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function notifIdHas(key, id) { return notifIdSet(key).indexOf(String(id)) !== -1; }
  function notifIdAdd(key, id) {
    try {
      var arr = notifIdSet(key);
      if (arr.indexOf(String(id)) === -1) {
        arr.push(String(id));
        sessionStorage.setItem(key, JSON.stringify(arr.slice(-200)));
      }
    } catch (e) {}
  }

  function notifBellHTML() {
    if (!notifEnabled()) return '';
    return '<div class="header-notif" data-notif-bell>'
      + '<button type="button" class="header-action header-notif__btn" data-tooltip="اعلان‌ها" aria-label="اعلان‌ها" aria-haspopup="true" aria-expanded="false">'
      + NOTIF_BELL_SVG
      + '<span class="header-notif__badge" style="display:none">۰</span></button>'
      + '<div class="header-account-dropdown header-notif__panel" role="menu" aria-label="اعلان‌ها">'
      + '<div class="header-account-dropdown__header"><span>اعلان‌ها</span><a href="/account/notifications" style="font-size:var(--font-size-xs);font-weight:var(--font-weight-medium)">مشاهده همه</a></div>'
      + '<div class="header-account-dropdown__divider" aria-hidden="true"></div>'
      + '<div class="header-notif__list"><p class="header-notif__empty">در حال بارگذاری…</p></div>'
      + '</div></div>';
  }

  function escNotifHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function refreshNotifBadges() {
    var n = Number(notifCache.unreadCount) || 0;
    $$('.header-notif__badge').forEach(function (b) {
      b.textContent = toPersianDigits(n);
      b.style.display = n > 0 ? 'flex' : 'none';
    });
    $$('[data-notif-bell]').forEach(function (w) {
      var btn = w.querySelector('.header-notif__btn');
      if (btn) btn.setAttribute('aria-label', n > 0 ? ('اعلان‌ها (' + n + ' خوانده‌نشده)') : 'اعلان‌ها');
    });
  }
  function toPersianDigits(n) {
    try { if (window.Format && Format.toPersianNumber) return Format.toPersianNumber(n); } catch (e) {}
    return String(n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
  }

  function renderNotifPanels() {
    var items = notifCache.items || [];
    $$('.header-notif__list').forEach(function (list) {
      if (notifCache.error && /401|not authenticated|نشست/i.test(String(notifCache.error))) {
        list.innerHTML = '<p class="header-notif__empty">نشست شما منقضی شده — <a href="/login" style="font-weight:700">ورود مجدد</a></p>';
        return;
      }
      if (!items.length) {
        list.innerHTML = '<p class="header-notif__empty">اعلان جدیدی ندارید.</p>';
        return;
      }
      list.innerHTML = items.slice(0, 20).map(function (it) {
        return '<button type="button" class="header-notif__item' + (it.isRead ? '' : ' is-unread') + '" data-notif-id="' + escNotifHtml(it.id) + '">'
          + '<span class="header-notif__dot" aria-hidden="true"></span>'
          + '<span class="header-notif__body"><span class="header-notif__title">' + escNotifHtml(it.title) + '</span>'
          + '<span class="header-notif__msg">' + escNotifHtml(it.message) + '</span></span>'
          + '</button>';
      }).join('');
    });
  }

  function closeAllNotifPanels(except) {
    $$('[data-notif-bell].is-open').forEach(function (w) {
      if (w === except) return;
      w.classList.remove('is-open');
      var btn = w.querySelector('.header-notif__btn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
    var pop = document.querySelector('.notif-popup-panel-open');
    if (pop) pop.classList.remove('notif-popup-panel-open');
  }

  function toggleNotifPanel(wrap) {
    var willOpen = !wrap.classList.contains('is-open');
    closeAllNotifPanels(wrap);
    if (typeof closeAllAccountMenus === 'function') closeAllAccountMenus();
    if (willOpen) closeOtherHeaderDropdowns('notif');
    wrap.classList.toggle('is-open', willOpen);
    var btn = wrap.querySelector('.header-notif__btn');
    if (btn) btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    if (willOpen) {
      renderNotifPanels();
      pollNotifications(false);
    }
  }

  function bindNotifBells(scope) {
    var root = (scope && scope.querySelectorAll) ? scope : document;
    root.querySelectorAll('[data-notif-bell]').forEach(function (wrap) {
      if (wrap.__notifBound) return;
      wrap.__notifBound = true;
      var btn = wrap.querySelector('.header-notif__btn');
      if (btn) btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleNotifPanel(wrap);
      });
      var list = wrap.querySelector('.header-notif__list');
      if (list) list.addEventListener('click', function (e) {
        var item = e.target && e.target.closest ? e.target.closest('[data-notif-id]') : null;
        if (!item) return;
        var id = item.getAttribute('data-notif-id');
        /* Persist read state via the existing API; badge updates immediately. */
        notifCache.items = (notifCache.items || []).map(function (it) {
          if (String(it.id) === String(id) && !it.isRead) {
            it.isRead = true;
            notifCache.unreadCount = Math.max(0, (Number(notifCache.unreadCount) || 0) - 1);
          }
          return it;
        });
        refreshNotifBadges();
        renderNotifPanels();
        markNotificationRead(id).then(function () { pollNotifications(false); }).catch(function () {});
      });
    });
  }
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('[data-notif-bell]')) return;
    closeAllNotifPanels();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    closeAllNotifPanels();
    /* Escape dismisses the modal too — without marking anything as read. */
    var overlay = document.querySelector('.notif-modal-backdrop');
    if (overlay) {
      try { notifIdAdd(NOTIF_DISMISS_KEY, overlay.getAttribute('data-notif-popup-id')); } catch (err) {}
      overlay.remove();
    }
  });

  /* ── New-notification popup: centered modal (dismiss ≠ read) ── */
  function notifDestUrl(item){
    if(!item) return '';
    if(item.linkType==='product' && item.productId) return '/product/'+encodeURIComponent(item.productId);
    if(item.linkType==='category' && item.linkValue) return '/shop?category='+encodeURIComponent(item.linkValue);
    if(item.linkType==='custom' && item.linkValue) return item.linkValue;
    return '';
  }
  function showNotifPopup(item) {
    if (!item || notifIdHas(NOTIF_DISMISS_KEY, item.id)) return;
    if (document.querySelector('.notif-modal[data-notif-popup-id="' + item.id + '"]')) return;
    var icon = (typeof Icons !== 'undefined' && Icons.infoCircle) ? Icons.infoCircle : NOTIF_BELL_SVG;
    var closeIcon = (typeof Icons !== 'undefined' && Icons.close) ? Icons.close : '×';
    var overlay = document.createElement('div');
    overlay.className = 'notif-modal-backdrop';
    overlay.setAttribute('data-notif-popup-id', item.id);
    var imgHtml = item.imageUrl ? '<img class="notif-modal__img" src="'+escNotifHtml(item.imageUrl)+'" alt="" style="width:100%;height:140px;object-fit:cover;border-radius:var(--radius-xl);margin-bottom:12px" loading="lazy">' : '';
     overlay.innerHTML = '<div class="notif-modal" role="dialog" aria-modal="true" aria-labelledby="notif-modal-title-' + escNotifHtml(item.id) + '">'
      + '<button type="button" class="notif-modal__close" aria-label="بستن">' + closeIcon + '</button>'
      + imgHtml
      + '<span class="notif-modal__icon-wrap" aria-hidden="true"><span class="notif-modal__icon">' + icon + '</span><span class="notif-modal__dot"></span></span>'
      + '<h3 class="notif-modal__title" id="notif-modal-title-' + escNotifHtml(item.id) + '">' + escNotifHtml(item.title) + '</h3>'
      + '<p class="notif-modal__msg">' + escNotifHtml(item.message) + '</p>'
      + '<button type="button" class="notif-modal__cta">مشاهده اعلان‌ها</button>'
      + '</div>';
    function dismiss() {
      /* Closing ONLY dismisses the modal — the record stays unread in the list. */
      notifIdAdd(NOTIF_DISMISS_KEY, item.id);
      overlay.remove();
    }
    overlay.querySelector('.notif-modal__close').addEventListener('click', function (e) {
      e.stopPropagation();
      dismiss();
    });
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) dismiss();
    });
    overlay.querySelector('.notif-modal__cta').addEventListener('click', function () {
      var url = notifDestUrl(item);
      dismiss();
      if(url){ window.location.href=url; return; }
      var bell = document.querySelector('[data-notif-bell]');
      if (bell) {
        if (!bell.classList.contains('is-open')) toggleNotifPanel(bell);
        try { bell.scrollIntoView({ block: 'nearest' }); } catch (e) {}
      } else {
        window.location.href = '/account/notifications';
      }
    });
    if(item.imageUrl || notifDestUrl(item)){
      overlay.querySelector('.notif-modal').addEventListener('click', function(e){
        if(e.target.closest('.notif-modal__close')||e.target.closest('.notif-modal__cta')) return;
        var url=notifDestUrl(item);
        if(url){ dismiss(); window.location.href=url; }
      });
      if(notifDestUrl(item)) overlay.querySelector('.notif-modal').style.cursor='pointer';
    }
    document.body.appendChild(overlay);
    try { overlay.querySelector('.notif-modal__close').focus({ preventScroll: true }); } catch (e) {}
  }

  /* ════════════════════════════════════════════════════════════
     Cart Popover (replaces side drawer) — mirrors notification popover
     ════════════════════════════════════════════════════════════ */

  function cartPopoverHTML() {
    return '<div class="header-cart" data-cart-popover>'
      + '<button type="button" class="header-action header-action--cart" data-action="cart" data-tooltip="سبد خرید" aria-label="سبد خرید" aria-haspopup="true" aria-expanded="false">'
      + Icons.cart.replace('width="22" height="22"', 'width="22" height="22"')
      + '<span class="header-action__badge" style="display:none">0</span></button>'
      + '<div class="header-account-dropdown header-cart__panel" role="menu" aria-label="سبد خرید">'
      + '<div class="header-account-dropdown__header"><span>سبد خرید</span><a href="/account-cart" style="font-size:var(--font-size-xs);font-weight:var(--font-weight-medium)">مشاهده سبد خرید</a></div>'
      + '<div class="header-account-dropdown__divider" aria-hidden="true"></div>'
      + '<div class="header-cart__list"><p class="header-cart__empty">در حال بارگذاری…</p></div>'
      + '<div class="header-account-dropdown__divider" aria-hidden="true"></div>'
      + '<div class="header-cart__footer">'
      + '<div class="header-cart__total"><span>مبلغ قابل پرداخت</span><span class="header-cart__total-value">۰ تومان</span></div>'
      + '<button type="button" class="btn btn-primary btn-block btn-sm header-cart__checkout-btn">ثبت سفارش</button>'
      + '<a href="/shop" class="btn btn-secondary btn-block btn-sm header-cart__continue-btn" style="display:none">ادامه خرید</a>'
      + '</div>'
      + '</div></div>';
  }

  function closeAllCartPopovers(except) {
    $$('[data-cart-popover].is-open').forEach(function (w) {
      if (w === except) return;
      w.classList.remove('is-open');
      var btn = w.querySelector('[data-action="cart"]');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  function toggleCartPopover(wrap) {
    var willOpen = !wrap.classList.contains('is-open');
    closeAllCartPopovers(wrap);
    if (typeof closeAllAccountMenus === 'function') closeAllAccountMenus();
    if (typeof closeAllNotifPanels === 'function') closeAllNotifPanels();
    if (willOpen) closeOtherHeaderDropdowns('cart');
    wrap.classList.toggle('is-open', willOpen);
    var btn = wrap.querySelector('[data-action="cart"]');
    if (btn) btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    if (willOpen) {
      renderCartPopover(wrap);
    }
  }

  function renderCartPopover(wrap) {
    var list = wrap.querySelector('.header-cart__list');
    var totalEl = wrap.querySelector('.header-cart__total-value');
    var checkoutBtn = wrap.querySelector('.header-cart__checkout-btn');
    var continueBtn = wrap.querySelector('.header-cart__continue-btn');
    if (!list) return;
    if (state.cart.length === 0) {
      list.innerHTML = '<p class="header-cart__empty">سبد خرید شما خالی است</p>';
      if (totalEl) totalEl.textContent = '۰ تومان';
      if (checkoutBtn) checkoutBtn.style.display = 'none';
      if (continueBtn) continueBtn.style.display = 'block';
      return;
    }
    list.innerHTML = state.cart.map(function (item) {
      return '<div class="header-cart__item">'
        + '<div class="header-cart__item-image"><img src="' + item.image + '" alt="' + item.name + '" loading="lazy" class="header-cart__item-img"></div>'
        + '<div class="header-cart__item-details">'
        + '<span class="header-cart__item-title">' + item.name + '</span>'
        + '<span class="header-cart__item-price">' + Format.priceWithCurrency(item.price) + '</span>'
        + '<div class="header-cart__item-quantity">'
        + '<button class="header-cart__qty-btn" onclick="App.updateCartQty(\'' + item.key + '\',-1)">' + Icons.minus + '</button>'
        + '<span class="header-cart__qty-value">' + item.quantity + '</span>'
        + '<button class="header-cart__qty-btn" onclick="App.updateCartQty(\'' + item.key + '\',1)">' + Icons.plus + '</button>'
        + '</div>'
        + '</div>'
        + '<button class="header-cart__item-remove" onclick="App.removeFromCart(\'' + item.key + '\')">' + Icons.trash + '</button>'
        + '</div>';
    }).join('');
    var total = getCartTotal();
    if (totalEl) totalEl.textContent = Format.priceWithCurrency(total);
    if (checkoutBtn) checkoutBtn.style.display = 'block';
    if (continueBtn) continueBtn.style.display = 'none';
  }

  function bindCartPopovers(scope) {
    var root = (scope && scope.querySelectorAll) ? scope : document;
    root.querySelectorAll('[data-cart-popover]').forEach(function (wrap) {
      if (wrap.__cartBound) return;
      wrap.__cartBound = true;
      var btn = wrap.querySelector('[data-action="cart"]');
      if (btn) btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleCartPopover(wrap);
      });
      var list = wrap.querySelector('.header-cart__list');
      if (list) list.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.header-cart__qty-btn, .header-cart__item-remove') : null;
        if (!btn) return;
        e.stopPropagation();
        renderCartPopover(wrap);
      });
      var checkoutBtn = wrap.querySelector('.header-cart__checkout-btn');
      if (checkoutBtn) checkoutBtn.addEventListener('click', function (e) {
        if (state.cart.length === 0) {
          e.preventDefault();
          e.stopPropagation();
          try { App.showToast('سبد خرید شما خالی است', 'warning'); } catch (_) {}
          return;
        }
        window.location.href = '/checkout/step1';
      });
    });
  }

  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('[data-cart-popover]')) return;
    closeAllCartPopovers();
  });

  function pollNotifications(isInitial) {
    if (!notifEnabled()) return Promise.resolve(notifCache);
    return listNotifications().then(function (res) {
      notifCache = { items: (res && res.items) || [], unreadCount: Number((res && res.unreadCount) || 0), error: (res && res.error) || null };
      refreshNotifBadges();
      renderNotifPanels();
      /* Popup only for notifications that arrived while the user is active —
         never for the backlog already present on first load. */
      if (!notifFirstSync) {
        (notifCache.items || []).forEach(function (it) { notifIdAdd(NOTIF_SEEN_KEY, it.id); });
        notifFirstSync = true;
      } else {
        (notifCache.items || []).forEach(function (it) {
          if (!it.isRead && !notifIdHas(NOTIF_SEEN_KEY, it.id) && !notifIdHas(NOTIF_DISMISS_KEY, it.id)) {
            notifIdAdd(NOTIF_SEEN_KEY, it.id);
            showNotifPopup(it);
          }
        });
      }
      return notifCache;
    }).catch(function () { return notifCache; });
  }

  function startNotifCenter() {
    if (notifExcludedPage()) return;
    bindNotifBells(document);
    document.addEventListener('as_auth_change', function () {
      /* Re-render bells on login/logout (header auth area is rebuilt). */
      setTimeout(function () {
        bindNotifBells(document);
        if (isLoggedIn()) pollNotifications(true);
        else { notifCache = { items: [], unreadCount: 0 }; refreshNotifBadges(); }
      }, 0);
    });
    try {
      if (typeof authReady !== 'undefined' && authReady && authReady.then) {
        authReady.then(function () {
          if (notifEnabled()) pollNotifications(true);
          bindNotifBells(document);
        }, function () {});
      } else if (notifEnabled()) {
        pollNotifications(true);
      }
    } catch (e) {}
    if (notifPollTimer) clearInterval(notifPollTimer);
    notifPollTimer = setInterval(function () {
      if (!document.hidden && notifEnabled()) pollNotifications(false);
    }, NOTIF_POLL_MS);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && notifEnabled()) pollNotifications(false);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startNotifCenter);
  else startNotifCenter();

  /* Redirect to login, preserving the current page (path + query + hash)
     so auth.js can return the user to the EXACT page after login. */
  function redirectToLogin() {
    try {
      var here = window.location.pathname + window.location.search + window.location.hash;
      window.location.href = '/login?next=' + encodeURIComponent(here);
    } catch (e) {
      window.location.href = '/login';
    }
  }

  /* Plain <a href="login.html">/register.html links (header, menus, prompts):
     carry the current page as ?next= so auth.js returns the user there after
     login. Needed because Referrer-Policy (helmet default) strips document.referrer. */
  /* Clean-URL aware page-name normalization: /login and login.html both mean login.html. */
  function normAuthPage(pn){
    try{
      var CLEAN_AUTH = { '/login': 'login.html', '/register': 'register.html', '/forgot-password': 'forgot-password.html', '/offline': 'offline.html' };
      if (CLEAN_AUTH[pn]) return CLEAN_AUTH[pn];
      return (pn || '').split('/').pop() || '';
    }catch(e){ return ''; }
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#' || /^(mailto:|tel:|javascript:)/i.test(href)) return;
    var abs;
    try { abs = new URL(href, window.location.href); } catch (err) { return; }
    if (abs.origin !== window.location.origin) return;
    var target = normAuthPage(abs.pathname);
    if (target !== 'login.html' && target !== 'register.html') return;
    if (abs.search.indexOf('next=') !== -1 || abs.search.indexOf('redirect=') !== -1 || abs.search.indexOf('returnUrl=') !== -1) return;
    var current = normAuthPage(window.location.pathname);
    if (current === target || current === 'login.html' || current === 'register.html' || current === 'forgot-password.html' || current === 'offline.html') return;
    var here = window.location.pathname + window.location.search + window.location.hash;
    abs.searchParams.set('next', here);
    a.setAttribute('href', abs.pathname + abs.search + abs.hash);
  }, true);

  window.App = {
    /* Structured data / URL helpers (SEO) */
    upsertJsonLd: upsertJsonLd,
    absUrl: absUrl,
    /* Auth (API-backed; async - callers must await/.then) */
    register: register,
    login: login,
    logout: logout,
    updateProfile: updateProfile,
    fetchMe: fetchMe,
    authReady: function () { return authReady; },
    apiRequest: apiRequest,
    isLoggedIn: isLoggedIn,
    isAdminSession: isAdminSession,
    getCurrentUser: getCurrentUser,
    getSession: getSession,
    redirectToLogin: redirectToLogin,
    getUserData: getUserData,
    setUserData: setUserData,
    generateOrderId: generateOrderId,
    refreshState: refreshState,
    /* Shared drag-to-scroll for all horizontal carousels */
    enableDragToScroll: enableDragToScroll,
    initDragCarousels: initDragCarousels,
    /* Pricing */
    addToProductCard: addToProductCard,
    updateProductCardQty: updateProductCardQty,
    syncProductCards: syncProductCards,
    renderProductCardCartControl: renderProductCardCartControl,
    getProductPrice: getProductPrice,
    selectCardPricing: selectCardPricing,
    /* Shared product card */
    renderProductCard: renderProductCard,
    normalizeCardTheme: normalizeCardTheme,
    productCardThemeClasses: productCardThemeClasses,
    applyProductCardTheme: applyProductCardTheme,
    applyProductCardThemes: applyProductCardThemes,
    PRODUCT_CARD_THEMES: PRODUCT_CARD_THEMES,
    /* Cart */
    addToCart: addToCart,
    removeFromCart: removeFromCart,
    updateCartQty: updateCartQty,
    getCart: function () { return state.cart; },
    getCartTotal: getCartTotal,
    getCartCount: getCartCount,
    clearCart: function () { state.cart = []; saveCart([]); updateCartUI(); },
    fetchCart: pullCartFromServer,
    /* Wishlist */
    toggleWishlist: toggleWishlist,
    getWishlist: function () { return state.wishlist; },
    fetchWishlist: pullWishlistFromServer,
    /* Recently viewed (DB-backed, localStorage cache) */
    recordRecentView: recordRecentView,
    fetchRecent: pullRecentFromServer,
    getRecent: getRecentCache,
    /* Addresses (API/database) */
    listAddresses: listAddresses,
    createAddress: createAddress,
    updateAddress: updateAddress,
    deleteAddress: deleteAddress,
    setDefaultAddress: setDefaultAddress,
    getCachedAddresses: getCachedAddresses,
    /* Orders (API/database) */
    listOrders: listOrders,
    getOrder: getOrder,
    createOrder: createOrder,
    getCachedOrders: getCachedOrders,
    /* User notifications (DB-backed) */
    listNotifications: listNotifications,
    markNotificationRead: markNotificationRead,
    pollNotifications: pollNotifications,
    /* UI */
    closeSearchDropdown: closeSearchDropdown,
    toggleMobileMenu: toggleMobileMenu,
    toggleCartDrawer: toggleCartDrawer,
    showToast: showToast,
    fetchPurchaseSettings: pullPurchaseSettings,
    refreshHeaderAuth: function () { try { refreshHeaderAuth(); } catch (e) {} },
    /* Refresh wishlist heart states on every visible product card */
    refreshWishlistUI: updateWishlistUI
  };

  /* ── Mobile protection: disable zoom / selection / copy on small screens ── */
  (function initMobileProtection(){
    var MQ = '(max-width: 768px)';
    function isMobile(){ try{ return window.matchMedia && window.matchMedia(MQ).matches; }catch(e){ return window.innerWidth <= 768; } }
    function applyViewport(){
      var vp = document.querySelector('meta[name="viewport"]');
      if(!vp) return;
      if(isMobile()){
        vp.setAttribute('content','width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
      } else {
        vp.setAttribute('content','width=device-width, initial-scale=1.0');
      }
    }
    function allowEditable(t){
      if(!t || !t.closest) return false;
      return !!t.closest('input, textarea, [contenteditable="true"], [contenteditable=""]');
    }
    function onCopyCut(e){
      if(!isMobile() || allowEditable(e.target)) return;
      e.preventDefault();
    }
    function onSelectStart(e){
      if(!isMobile() || allowEditable(e.target)) return;
      e.preventDefault();
    }
    function onContextMenu(e){
      if(!isMobile() || allowEditable(e.target)) return;
      e.preventDefault();
    }
    // pinch-zoom block
    document.addEventListener('touchmove', function(e){
      if(!isMobile()) return;
      if(e.touches && e.touches.length > 1) e.preventDefault();
    }, {passive:false});
    var lastTouchEnd = 0;
    document.addEventListener('touchend', function(e){
      if(!isMobile()) return;
      var now = Date.now();
      if(now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    }, {passive:false});
    document.addEventListener('gesturestart', function(e){ if(isMobile()) e.preventDefault(); });
    document.addEventListener('gesturechange', function(e){ if(isMobile()) e.preventDefault(); });
    document.addEventListener('gestureend', function(e){ if(isMobile()) e.preventDefault(); });
    document.addEventListener('copy', onCopyCut);
    document.addEventListener('cut', onCopyCut);
    document.addEventListener('selectstart', onSelectStart);
    document.addEventListener('contextmenu', onContextMenu);
    // key zoom shortcuts
    document.addEventListener('keydown', function(e){
      if(!isMobile()) return;
      if((e.ctrlKey||e.metaKey) && (e.key==='+'||e.key==='-'||e.key==='='||e.key==='0')) e.preventDefault();
    });
    document.addEventListener('wheel', function(e){
      if(isMobile() && e.ctrlKey) e.preventDefault();
    }, {passive:false});
    document.addEventListener('dblclick', function(e){ if(isMobile() && !allowEditable(e.target)) e.preventDefault(); });
    applyViewport();
    if(window.matchMedia){
      try{ window.matchMedia(MQ).addEventListener('change', applyViewport); }catch(err){
        try{ window.matchMedia(MQ).addListener(applyViewport); }catch(e2){}
      }
    }
    window.addEventListener('resize', applyViewport);
  })();

  /* ── Critical shell (synchronous, pre-paint) ──────────────────
     Empty #site-header / #mobile-header shells (every page except the
     homepage ships them empty) plus the baked homepage header must reach
     their correct final state BEFORE the first paint — otherwise every
     refresh and every cross-page navigation flashes a blank header, a
     body padding jump (115px → 150px) and, on the homepage, a stale
     logged-in menu that is corrected a moment later. Scripts load at the
     end of <body>, so the shell DOM already exists here while the parser
     is still running: render synchronously instead of waiting for
     DOMContentLoaded. All renders below are idempotent, so the deferred
     init() simply no-ops over them. No page hiding, no delays. */
  function syncScrollClass() {
    try {
      var scrolled = window.scrollY > 10;
      var dh = document.querySelector('.site-header');
      var mh = document.querySelector('.mobile-header');
      if (dh) dh.classList.toggle('is-scrolled', scrolled);
      if (mh) mh.classList.toggle('is-scrolled', scrolled);
    } catch (e) {}
  }
  function renderCriticalShell() {
    if (renderCriticalShell._done) return;
    renderCriticalShell._done = true;
    try { getGuestSession(); } catch (e) {}
    try { refreshState(); } catch (e) {}
    try { var h = $('#site-header'); if (h) renderHeader(h); } catch (e) {}
    try { var m = $('#mobile-header'); if (m) renderMobileHeader(m); } catch (e) {}
    /* Correct a stale baked auth area (e.g. a baked-in logged-in menu
       served to a logged-out visitor) before first paint. */
    try { refreshHeaderAuth(); } catch (e) {}
    try { var o = $('#site-overlays'); if (o) renderOverlays(o); } catch (e) {}
    try { renderMegaMenu(); } catch (e) {}
    try {
      if (typeof AppData !== 'undefined' && AppData.catalogReady && AppData.catalogReady.then) {
        AppData.catalogReady.then(function () { try { renderMegaMenu(); } catch (e) {} });
      }
    } catch (e) {}
    try { syncScrollClass(); } catch (e) {}
    try { bindEvents(); } catch (e) {}
    try { updateCartUI(); } catch (e) {}
    try { initPromoTopbar(); } catch (e) {}
  }
  try { renderCriticalShell(); } catch (e) {}

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
  watchForSiteLoaderCompletion();

/* ── Generic native <select> -> province-style custom dropdown ──
     Enhances any <select> on the page so its open list matches the
     addr-province-menu design (white card, radius-md, shadow-xl, fixed,
     overscroll contain, z-index 560). Preserves the underlying select
     value/events. Works for initially rendered and dynamically added selects. */
  var __selectDropInstance = null;
  var __selectDropTrigger = null;

  function closeSelectDropdown() {
    if (__selectDropInstance) { try { __selectDropInstance.remove(); } catch (e) {} __selectDropInstance = null; }
    if (__selectDropTrigger) { try { __selectDropTrigger.setAttribute('aria-expanded', 'false'); } catch (e) {} __selectDropTrigger = null; }
  }

  function positionSelectDropdown(menu, trigger) {
    var rect = trigger.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    var gap = 6, minHeight = 100;
    var top = rect.bottom + gap;
    var below = window.innerHeight - top - gap;
    if (below < minHeight) {
      top = Math.min(top, Math.max(8, window.innerHeight - minHeight - gap));
      below = window.innerHeight - top - gap;
    }
    /* Match the province-menu reference cap (pages.css/account.css:
       max-height:min(446.5px,50vh)) so tall viewports don't stretch the menu. */
    var refCap = Math.min(446.5, window.innerHeight * 0.5);
    menu.style.position = 'fixed';
    menu.style.left = Math.max(8, rect.left) + 'px';
    menu.style.top = top + 'px';
    menu.style.width = Math.min(rect.width, window.innerWidth - 16) + 'px';
    menu.style.maxHeight = Math.max(0, Math.min(below, refCap)) + 'px';
    menu.style.overflowY = 'auto';
    menu.style.overscrollBehavior = 'contain';
    menu.style.touchAction = 'pan-y';
    menu.style.zIndex = '560';
  }

  function openSelectDropdown(sel, trigger) {
    if (sel.disabled) return;
    closeSelectDropdown();
    var rect = trigger.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    var menu = document.createElement('ul');
    menu.className = 'addr-province-menu';
    menu.setAttribute('role', 'listbox');
    var any = false, selected = null, i;
    for (i = 0; i < sel.options.length; i++) {
      var o = sel.options[i];
      if (o.disabled) continue;
      any = true;
      var li = document.createElement('li');
      li.className = 'addr-province-menu__item' + (o.selected ? ' is-selected' : '');
      li.textContent = o.text;
      li.setAttribute('data-value', o.value);
      li.setAttribute('tabindex', '-1');
      li.setAttribute('role', 'option');
      if (o.selected) li.setAttribute('aria-selected', 'true');
      li.addEventListener('click', (function (value) {
        return function () {
          sel.value = value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          closeSelectDropdown();
        };
      })(o.value));
      if (o.selected) selected = li;
      menu.appendChild(li);
    }
    if (!any) return;
    document.body.appendChild(menu);
    __selectDropInstance = menu;
    __selectDropTrigger = trigger;
    positionSelectDropdown(menu, trigger);
    trigger.setAttribute('aria-expanded', 'true');
    menu.addEventListener('wheel', function (e) { e.stopPropagation(); }, { passive: false });
    menu.addEventListener('touchmove', function (e) { e.stopPropagation(); }, { passive: false });
    menu.addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(menu.querySelectorAll('.addr-province-menu__item'));
      if (!items.length) return;
      var idx = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (idx < 0) idx = selected ? items.indexOf(selected) : -1;
        idx = Math.min(items.length - 1, idx + 1);
        items[idx].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx < 0) idx = selected ? items.indexOf(selected) : items.length;
        idx = Math.max(0, idx - 1);
        items[idx].focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (document.activeElement && items.indexOf(document.activeElement) >= 0) document.activeElement.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSelectDropdown();
        if (trigger) trigger.focus();
      } else if (e.key === 'Tab') {
        closeSelectDropdown();
      }
    });
    // initial focus
    try {
      if (selected) selected.focus();
      else if (menu.firstChild) menu.firstChild.focus();
    } catch (e) {}
    if (selected) menu.scrollTop = Math.max(0, selected.offsetTop - menu.clientHeight / 2);
  }

  function enhanceSelect(sel) {
    if (!sel || sel.nodeType !== 1 || sel.nodeName !== 'SELECT') return;
    if (sel.dataset && sel.dataset.enhancedSelect === '1') return;
    if (sel.closest && (sel.closest('.addr-province-dd') || sel.closest('.addr-city-dd'))) return;
    /* Never wrap hidden/disabled-helper selects (e.g. display:none helpers):
       the overlay trigger would otherwise add a visible focusable button. */
    if (sel.disabled) return;
    try {
      var cs = window.getComputedStyle ? window.getComputedStyle(sel) : null;
      if ((cs && cs.display === 'none') || sel.hidden || sel.type === 'hidden') return;
    } catch (e) {}
    if (sel.dataset) sel.dataset.enhancedSelect = '1';
    var wrapper = document.createElement('span');
    wrapper.className = 'addr-province-dd';
    /* .input selects are full-width block controls (contact/account forms);
       .shop-sort and other inline selects keep their shrink-to-fit width so
       toolbar layout is preserved. Lets the shared .addr-province-dd block
       rule apply for the full-width case instead of overriding it. */
    if (sel.classList.contains('input')) {
      wrapper.style.display = 'block';
      wrapper.style.width = '100%';
    } else {
      wrapper.style.display = 'inline-block';
    }
    if (sel.parentNode) sel.parentNode.insertBefore(wrapper, sel);
    wrapper.appendChild(sel);
    if (!sel.classList.contains('input') && !sel.classList.contains('shop-sort')) {
      sel.classList.add('input');
    }
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'addr-province-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', sel.getAttribute('aria-label') || 'انتخاب گزینه');
    wrapper.appendChild(trigger);
    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      if (__selectDropInstance && __selectDropTrigger === trigger) closeSelectDropdown();
      else openSelectDropdown(sel, trigger);
    });
    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if ((e.key === 'Enter' || e.key === ' ') && __selectDropInstance && __selectDropTrigger === trigger) closeSelectDropdown();
        else openSelectDropdown(sel, trigger);
      } else if (e.key === 'Escape') {
        closeSelectDropdown();
      }
    });
  }

  function enhanceAllSelects(root) {
    if (!root || !root.querySelectorAll) return;
    var nodes = root.querySelectorAll('select');
    for (var i = 0; i < nodes.length; i++) enhanceSelect(nodes[i]);
  }

  // Product card color theme helpers
  var PRODUCT_CARD_THEMES = ['default', 'neutral', 'slate', 'stone', 'mist', 'ink'];
  var PRODUCT_CARD_THEME_ALIASES = {
    'default': 'default',
    'neutral-default': 'default',
    'classic': 'default',
    '1': 'default',
    'neutral': 'neutral',
    'soft': 'neutral',
    'minimal': 'neutral',
    '2': 'neutral',
    'slate': 'slate',
    'cool': 'slate',
    '3': 'slate',
    'stone': 'stone',
    'warm': 'stone',
    '4': 'stone',
    'mist': 'mist',
    'blue': 'mist',
    '5': 'mist',
    'ink': 'ink',
    'carbon': 'ink',
    'dark': 'ink',
    '6': 'ink'
  };
  function normalizeCardTheme(theme) {
    theme = (theme == null ? '' : theme).toString().toLowerCase().trim();
    if (PRODUCT_CARD_THEME_ALIASES[theme]) theme = PRODUCT_CARD_THEME_ALIASES[theme];
    if (PRODUCT_CARD_THEMES.indexOf(theme) === -1) theme = 'default';
    return theme;
  }
  function productCardThemeClasses(theme) {
    return 'product-card product-card--theme-' + normalizeCardTheme(theme) + ' product-card--themed';
  }
  function applyProductCardTheme(root, theme) {
    theme = normalizeCardTheme(theme);
    if (!root || !root.querySelectorAll) return;
    var scope = (root === document) ? document : root;
    var cards = scope.querySelectorAll ? scope.querySelectorAll('.product-card') : [];
    if (root.classList && root.classList.contains('product-card')) cards = [root].concat(Array.prototype.slice.call(cards));
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (!c || !c.setAttribute) continue;
      try {
        c.className = (c.className || '').replace(/product-card--theme-[a-z0-9-]+/g, '').replace(/product-card--themed/g, '').replace(/\s+/g, ' ').trim();
      } catch (e) {}
      c.classList.add('product-card', 'product-card--theme-' + theme, 'product-card--themed');
      c.setAttribute('data-card-theme', theme);
      c.setAttribute('data-theme', theme);
      c.setAttribute('data-color-theme', theme);
    }
  }
  // Product card color theme application (static + dynamic cards)
  function applyProductCardThemes(root, theme) {
    if (!root || !root.querySelectorAll) return;
    var scope = (root === document) ? document : root;
    var cards = scope.querySelectorAll ? scope.querySelectorAll('.product-card') : [];
    // include root itself
    if (root.classList && root.classList.contains('product-card')) cards = [root].concat(Array.prototype.slice.call(cards));
    if (theme) {
      applyProductCardTheme(root, theme);
      return;
    }
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (!c || !c.setAttribute) continue;
      if (!c.getAttribute('data-card-theme')) {
        c.classList.add('product-card--theme-default', 'product-card--themed');
        c.setAttribute('data-card-theme', 'default');
        c.setAttribute('data-theme', 'default');
        c.setAttribute('data-color-theme', 'default');
      }
    }
  }

  // Initial pass
  function runEnhance() { enhanceAllSelects(document); applyProductCardThemes(document); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', runEnhance);
  else runEnhance();

  // Future selects (modals, dynamically rendered pages)
  try {
    var mo = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.addedNodes) {
          for (var i = 0; i < m.addedNodes.length; i++) {
            var n = m.addedNodes[i];
            if (n && n.nodeType === 1) {
              if (n.nodeName === 'SELECT') enhanceSelect(n);
              else enhanceAllSelects(n);
              applyProductCardThemes(n);
            }
          }
        }
      });
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  // Global close handlers
  document.addEventListener('click', function (e) {
    if (__selectDropInstance) {
      var t = __selectDropTrigger;
      if (!(t && t.contains(e.target)) && !__selectDropInstance.contains(e.target)) closeSelectDropdown();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSelectDropdown();
  });
  window.addEventListener('resize', closeSelectDropdown);
  window.addEventListener('scroll', function (e) {
    var t = e && e.target;
    if (t && t.closest && t.closest('.addr-province-menu')) return;
    closeSelectDropdown();
  }, true);

  /* Ensure store logo/favicon applies on every page that uses common.js */
  if (!window.StoreLogo) {
    var __sl = document.createElement('script');
    __sl.src = 'assets/js/store-logo.js?v=1';
    __sl.onload = function () { try { if (window.StoreLogo && !window.StoreLogo._applied) window.StoreLogo.load(); } catch (e) {} };
    document.head.appendChild(__sl);
  }

})();
