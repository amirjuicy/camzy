/* ================================================================
   Camzy — Product Detail Page (Digikala-style)
   Uses product.image and product.images from data.js
   ================================================================ */
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return [...(c || document).querySelectorAll(s)]; };
  var product = null;
  var activeGalleryIndex = 0;
  var buyBarSpaceBound = false;

  /* ── Review persistence (API-backed, localStorage as cache/offline fallback) ─── */
  var SEED_REVIEW_COUNT = 8; /* number of hardcoded reviews in data.js */

  function getReviewStorageKey() {
    var user = App.isLoggedIn() ? App.getCurrentUser() : null;
    if (user) return 'as_user_' + user.id + '_reviews';
    return 'as_guest_reviews_' + localStorage.getItem('as_guest_session');
  }

  function getReviewCacheKey(pid) {
    return 'as_reviews_cache_p' + pid;
  }

  function apiAvailable() {
    try {
      return window.location.protocol.indexOf('http') === 0 && typeof fetch === 'function';
    } catch (e) { return false; }
  }

  function authHeaders() {
    var headers = { 'Content-Type': 'application/json' };
    try {
      var session = JSON.parse(localStorage.getItem('as_session'));
      if (session && session.token) headers['Authorization'] = 'Bearer ' + session.token;
    } catch (e) {}
    return headers;
  }

  function reviewApi(method, path, body) {
    return fetch('/api' + path, {
      method: method,
      headers: authHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.error) || ('Request failed: ' + res.status));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function mergeReviewIntoAppData(r) {
    var exists = AppData.reviews.some(function (x) { return x.id === r.id; });
    if (!exists) AppData.reviews.push(r);
  }

  function cacheProductReviews(pid) {
    try {
      var list = AppData.reviews.filter(function (r) { return r.productId === pid && !isSeedId(r.id); });
      localStorage.setItem(getReviewCacheKey(pid), JSON.stringify(list));
    } catch (e) {}
  }

  function isSeedId(id) {
    return AppData.reviews.slice(0, SEED_REVIEW_COUNT).some(function (r) { return r.id === id; });
  }

  function loadCachedReviews(pid) {
    try {
      var cached = JSON.parse(localStorage.getItem(getReviewCacheKey(pid)));
      if (Array.isArray(cached)) cached.forEach(mergeReviewIntoAppData);
      /* Legacy per-user key fallback. */
      var legacy = JSON.parse(localStorage.getItem(getReviewStorageKey()));
      if (Array.isArray(legacy)) {
        legacy.filter(function (r) { return r.productId === pid; }).forEach(mergeReviewIntoAppData);
      }
    } catch (e) {}
  }

  function loadPersistedReviews() {
    if (!product) return;
    loadCachedReviews(product.id);
    if (!apiAvailable()) return;
    reviewApi('GET', '/products/' + encodeURIComponent(product.id) + '/reviews')
      .then(function (rows) {
        (rows || []).forEach(mergeReviewIntoAppData);
        cacheProductReviews(product.id);
        refreshReviewUI();
      })
      .catch(function () { /* offline: keep cache */ });
  }

  function refreshReviewUI() {
    var panel = $('#tab-reviews');
    if (panel) { panel.innerHTML = renderReviews(); bindReviewForm(); }
    var count = AppData.reviews.filter(function (rv) { return rv.productId === product.id; }).length;
    var countEl = $('.pdp-rating__count');
    if (countEl) countEl.textContent = '(' + Format.toPersianNumber(count) + ' خریدار)';
    var tabBtn = $('.product-tabs__tab[data-tab="reviews"]');
    if (tabBtn) tabBtn.textContent = 'دیدگاه‌ها' + (count > 0 ? ' (' + Format.toPersianNumber(count) + ')' : '');
  }

  function isOwnReview(rv) {
    var user = App.isLoggedIn() ? App.getCurrentUser() : null;
    if (!user) return false;
    if (rv.userId) return rv.userId === user.id;
    var name = user.firstName || user.name || '';
    return !!name && rv.author === name;
  }

  function saveUserReview(review) {
    /* Optimistic local merge + cache; server is source of truth when online. */
    mergeReviewIntoAppData(review);
    cacheProductReviews(review.productId);
    try {
      var key = getReviewStorageKey();
      var stored = JSON.parse(localStorage.getItem(key)) || [];
      stored.push(review);
      localStorage.setItem(key, JSON.stringify(stored));
    } catch (e) {}
    if (!apiAvailable() || !App.isLoggedIn()) return Promise.resolve(review);
    return reviewApi('POST', '/reviews', {
      productId: review.productId, rating: review.rating, title: review.title, text: review.text,
    }).then(function (created) {
      var idx = AppData.reviews.indexOf(review);
      if (idx !== -1) AppData.reviews[idx] = created;
      cacheProductReviews(review.productId);
      try {
        var k = getReviewStorageKey();
        var s = JSON.parse(localStorage.getItem(k)) || [];
        s[s.length - 1] = created;
        localStorage.setItem(k, JSON.stringify(s));
      } catch (e) {}
      return created;
    }).catch(function () { return review; });
  }

  /* ── Image fallback ───────────────────────────────────────── */
  function fallbackSrc(brandName) {
    return 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" fill="none">' +
      '<rect width="400" height="400" fill="#f3f4f6"/>' +
      '<text x="200" y="210" text-anchor="middle" fill="#9ca3af" font-size="24" font-family="sans-serif">' +
      (brandName || 'کمزی') + '</text></svg>'
    );
  }

  function imgTag(src, alt, extra) {
    return '<img src="' + src + '" alt="' + (alt || '') + '" loading="lazy" class="product-gallery__img"' + (extra || '') + ' onerror="this.onerror=null;this.src=\'' + fallbackSrc(product ? product.brandName : '') + '\'">';
  }

  function thumbImg(src, alt) {
    return '<img src="' + src + '" alt="' + (alt || '') + '" loading="lazy" class="product-gallery__thumb-img" onerror="this.onerror=null;this.src=\'' + fallbackSrc(product ? product.brandName : '') + '\'">';
  }

  /* ── Recently viewed (localStorage, persistent) ─────────── */
  var RECENT_KEY = 'as_recently_viewed';
  var RECENT_MAX = 8;

  function saveRecentlyViewed(productId) {
    if (!productId) return;
    /* Database-backed when authenticated (App mirrors to server + keeps
       localStorage as cache); otherwise local-only fallback, same order/cap. */
    try {
      if (window.App && typeof window.App.recordRecentView === 'function') {
        window.App.recordRecentView(productId);
        return;
      }
    } catch (e) {}
    try {
      var list = JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
      if (!Array.isArray(list)) list = [];
      /* Avoid duplicates: remove existing occurrence */
      list = list.filter(function (id) { return id !== productId; });
      /* Most recently viewed first */
      list.unshift(productId);
      /* Limit to a reasonable number */
      list = list.slice(0, RECENT_MAX);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch (e) {}
  }

  /* ── Init (waits for live catalog so admin edits are visible) ── */
  function resolveProduct() {
    var params = new URLSearchParams(window.location.search);
    // Clean URL (/product/:ref) carries slug-or-id in the pathname.
    var pathRef = (function(){ try{ var s=(window.location.pathname||'').split('/').filter(function(x){ return !!x; }); if(s.length===2 && s[0]==='product' && s[1]) return decodeURIComponent(s[1]); }catch(e){} return ''; })();
    var slug = params.get('slug') || pathRef;
    var id = params.get('id') || (/^\d+$/.test(pathRef) ? pathRef : null);
    var found = null;
    if (slug) found = AppData.products.find(function (p) { return p.slug === slug; });
    if (!found && id) {
      found = AppData.products.find(function (p) { return p.id === parseInt(id); }) ||
        AppData.products.find(function (p) { return String(p.id) === String(id); });
    }
    // Numeric id may also arrive via slug param (e.g. ?slug=3).
    if (!found && slug && !isNaN(parseInt(slug))) {
      found = AppData.products.find(function (p) { return p.id === parseInt(slug); });
    }
    if (!found && AppData.products.length) found = AppData.products[0];
    return found;
  }

  function init() {
    product = resolveProduct();
    if (!product) {
      // Catalog still loading (or product deleted): retry when API data lands.
      try {
        if (AppData.catalogReady && typeof AppData.catalogReady.then === 'function') {
          AppData.catalogReady.then(function () {
            if (!product) { product = resolveProduct(); if (product) bootProduct(); }
          });
        }
        if (!init._catalogHooked) {
          init._catalogHooked = true;
          document.addEventListener('camzy:catalog-updated', function () {
            if (!product) { product = resolveProduct(); if (product) bootProduct(); }
          });
        }
      } catch (e) {}
      var el = $('#product-detail-content');
      if (el) el.innerHTML = '<div class="container" style="padding:48px 0;text-align:center;color:var(--text-muted)">در حال بارگذاری محصول…</div>';
      return;
    }
    bootProduct();
  }

  function bootProduct() {
    document.title = product.name + ' | کمزی';
    activeGalleryIndex = 0;
    saveRecentlyViewed(product.id);
    loadPersistedReviews();
    loadProductOptions();
    render();
    bindTabs();
    bindGallery();
    renderProductSchema();
  }

  /* Structured data (JSON-LD) for the product page. The technical
     specifications (resolution, lens, night vision, IP rating, connectivity,
     storage, warranty) are exposed as additionalProperty so search engines
     can surface them. */
  function renderProductSchema() {
    try {
      if (!window.App || !window.App.upsertJsonLd) return;
      var abs = window.App.absUrl || function (p) { return p; };
      var specs = product.specs && typeof product.specs === 'object' ? product.specs : {};
      var props = Object.keys(specs).map(function (k) {
        return { '@type': 'PropertyValue', name: String(k), value: String(specs[k]) };
      });
      var images = (product.images && product.images.length ? product.images : [product.image])
        .filter(Boolean).map(abs);
      var data = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        'name': product.name,
        'description': product.description || product.shortDescription || product.name,
        'sku': product.sku || '',
        'image': images,
        'url': abs('/product/' + encodeURIComponent(product.slug || product.id)),
        'brand': { '@type': 'Brand', 'name': product.brandName || product.brand || '' },
        'category': product.category || '',
        'offers': {
          '@type': 'Offer',
          'url': abs('/product/' + encodeURIComponent(product.slug || product.id)),
          /* Prices are shown in Toman; schema.org wants an ISO currency, so the
             Rial amount (1 Toman = 10 Rial) is published as IRR. */
          'priceCurrency': 'IRR',
          'price': String(Math.round((product.price || 0) * 10)),
          'availability': product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          'itemCondition': 'https://schema.org/NewCondition',
          'seller': { '@type': 'Organization', 'name': 'کمزی' }
        }
      };
      if (product.rating && product.reviewCount) {
        data.aggregateRating = {
          '@type': 'AggregateRating',
          'ratingValue': String(product.rating),
          'reviewCount': String(product.reviewCount)
        };
      }
      if (props.length) data.additionalProperty = props;
      window.App.upsertJsonLd('camzy-product-schema', data);
    } catch (e) {}
  }

  function loadProductOptions() {
    if (!apiAvailable()) return;
    var url = '/api/products/' + encodeURIComponent(product.id) + '/options';
    fetch(url, { headers: authHeaders() })
      .then(function (res) { return res.json().catch(function () { return []; }); })
      .then(function (options) {
        product.options = options || [];
        renderOptions();
      })
      .catch(function () { product.options = []; renderOptions(); });
  }

  function renderOptions() {
    var container = $('#pdp-options');
    if (!container) return;
    var opts = product.options || [];
    if (!opts.length) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML =
      '<div class="pdp-options__section">' +
        '<h3 class="pdp-options__title">گزینه‌های اضافه</h3>' +
        '<div class="pdp-options__list">' +
          opts.map(function (opt) {
            var finalPrice = opt.discountPrice != null ? opt.discountPrice : opt.price;
            var hasDiscount = opt.discountPercent > 0 || (opt.discountPrice != null && opt.discountPrice < opt.price);
            return '<label class="pdp-option" data-opt-id="' + opt.id + '">' +
              '<input type="checkbox" class="pdp-option__checkbox" value="' + opt.id + '">' +
              '<span class="pdp-option__check"></span>' +
              '<div class="pdp-option__details">' +
                '<p class="pdp-option__name">' + opt.title + '</p>' +
                (opt.description ? '<p class="pdp-option__desc">' + opt.description + '</p>' : '') +
                '<div class="pdp-option__price">' +
                  (hasDiscount && opt.price > 0 ?
                    '<span class="pdp-option__discount-badge">٪' + (opt.discountPercent || Math.round((1 - finalPrice / opt.price) * 100)) + '</span>' +
                    '<span class="pdp-option__old-price">' + Format.price(opt.price) + '</span>' : '') +
                  '<span class="pdp-option__final-price">' + Format.price(finalPrice) + ' تومان</span>' +
                '</div>' +
              '</div>' +
            '</label>';
          }).join('') +
        '</div>' +
      '</div>';
  }

  /* ── Fixed mobile purchase bar (Digikala-style) ──────────────
     Mobile only: pages.css hides .pdp-buy-bar above 768px, where the
     sticky .dk-buybox-wrap (desktop.css) owns the buy action, so the
     desktop layout is untouched. Everything here reuses what the page
     already has — App.getProductPrice() for retail pricing, the same
     p.oldPrice / p.discount discount rule as .dk-buybox__price-top, the
     shared .priceChanger markup + click delegation (common.js) for the
     pricing toggle, and ProductDetail.addToCartWithOptions() / .updateCartQty()
     for the cart. */
  function buyBarPriceHTML(p) {
    
    return '<div class="pdp-buy-bar__price" id="pdp-buy-bar-price">' +
      '<div class="pdp-buy-bar__price-top">' +
        (p.oldPrice ?
          '<span class="pdp-buy-bar__old-price">' + Format.priceWithCurrency(p.oldPrice) + '</span>' +
          '<span class="pdp-buy-bar__discount-badge">٪' + p.discount + '</span>'
        : '') +
      '</div>' +
      '<div class="pdp-buy-bar__final-price">' +
        '<span class="pdp-buy-bar__amount">' + Format.price(App.getProductPrice(p)) + '</span>' +
        '<span class="pdp-buy-bar__currency">' + Icons.toman + '</span>' +
        /* data-pricing="detail" routes clicks to ProductDetail.selectPricing
           through the existing .priceChanger delegation in common.js. */
        '' +
      '</div>' +
    '</div>';
  }

  function buyBarSavings(p) {
    if (!p.oldPrice || p.oldPrice <= App.getProductPrice(p)) return 0;
    return p.oldPrice - App.getProductPrice(p);
  }

  function buyBarHTML(p) {
    /* RTL flex row: the price block comes first so it lands on the right
       and the 48px add-to-cart control lands on the left. The optional
       notice strip mirrors Digikala's «ارزان‌تر بخرید» banner. */
    var savings = buyBarSavings(p);
    return '<div class="pdp-buy-bar" id="pdp-buy-bar" role="region" aria-label="افزودن محصول به سبد خرید">' +
      (savings > 0 ?
        '<div class="pdp-buy-bar__notice"><span class="pdp-buy-bar__notice-icon">' + Icons.infoCircle + '</span>' +
        '<span>این کالا را «' + Format.price(savings) + ' تومان» ارزان‌تر بخرید</span></div>'
      : '') +
      '<div class="pdp-buy-bar__row">' +
      buyBarPriceHTML(p) +
      '<div class="pdp-buy-bar__cart" id="pdp-buy-bar-cart">' +
        /* Out of stock keeps a static disabled control, like the buy box. */
        (p.inStock ? '' : '<button class="dk-buybox__add-btn dk-buybox__add-btn--disabled" disabled>ناموجود</button>') +
      '</div>' +
      '</div>' +
    '</div>';
  }

  /* ── Render ───────────────────────────────────────────────── */
  function render() {
    var p = product;
    var r = Format.rating(p.rating);
    var stars = '';
    for (var i = 0; i < r.full; i++) stars += Icons.star;
    for (var i = 0; i < r.empty; i++) stars += Icons.starEmpty;

    var el = $('#product-detail-content');
    if (!el) return;
    var actualReviewCount = AppData.reviews.filter(function (rv) { return rv.productId === p.id; }).length;

    var images = p.images && p.images.length ? p.images : [p.image];
    var mainImg = images[activeGalleryIndex] || images[0] || p.image;

    /* Specs keys */
    var specKeys = Object.keys(p.specs);

    el.innerHTML =
    /* ── Breadcrumb ── */
    '<div class="breadcrumb"><div class="container"><div class="breadcrumb-list">' +
      '<span class="breadcrumb-item"><a href="/">خانه</a></span>' +
      '<span class="breadcrumb-sep">/</span>' +
      '<span class="breadcrumb-item"><a href="/shop?category=' + p.categorySlug + '">' + p.category + '</a></span>' +
      '<span class="breadcrumb-sep">/</span>' +
      '<span class="breadcrumb-item breadcrumb-item--active">' + p.name + '</span>' +
    '</div></div></div>' +

    /* ── Two-column layout ── */
    '<div class="container"><div class="pdp-layout">' +

    /* ═══ RIGHT COLUMN: Gallery ═══ */
    '<div class="pdp-layout__gallery">' +

      /* Promo badge */
      '<div class="pdp-promo-badge">' +
        '<span class="pdp-promo-badge__text">پیشنهاد شگفت‌انگیز</span>' +
        '<div class="pdp-promo-badge__timer">' +
          '<span id="pdp-countdown">۵۸ : ۳۲ : ۰۹</span>' +
        '</div>' +
      '</div>' +

      /* Action icons + main image wrapper */
      '<div class="pdp-gallery-wrapper">' +

        /* Action icons (vertical sidebar) */
        '<div class="pdp-action-icons">' +
          '<button class="pdp-action-icon pdp-action-icon--wishlist" onclick="ProductDetail.toggleWishlist()" data-wishlist="' + p.id + '" aria-label="علاقه‌مندی">' +
            (App.getWishlist().indexOf(p.id) !== -1 ? Icons.heartFill : Icons.heart) +
            '<span class="pdp-action-icon__tooltip">اضافه به علاقه‌مندی</span>' +
          '</button>' +
          '<button class="pdp-action-icon" onclick="ProductDetail.share()" aria-label="اشتراک‌گذاری">' +
            Icons.share +
            '<span class="pdp-action-icon__tooltip">اشتراک‌گذاری</span>' +
          '</button>' +
          '<button class="pdp-action-icon pdp-action-icon--compare" onclick="ProductDetail.toggleCompare()" aria-label="مقایسه">' +
            Icons.scale +
            '<span class="pdp-action-icon__tooltip">مقایسه کالا</span>' +
          '</button>' +
          '<button class="pdp-action-icon" onclick="ProductDetail.toggleWishlist()" aria-label="افزودن به لیست">' +
            Icons.list +
            '<span class="pdp-action-icon__tooltip">افزودن به لیست</span>' +
          '</button>' +
        '</div>' +

        /* Main image (Digikala-style count badge + progress; tappable → viewer) */
        '<div class="pdp-main-image" id="gallery-main" role="button" tabindex="0" data-gallery-open aria-label="نمایش بزرگ‌تر تصویر محصول">' +
          imgTag(mainImg, p.name) +
          '<div class="pdp-gallery-count" id="pdp-gallery-count" aria-hidden="true">' +
            '<span class="pdp-gallery-count__num">' + Format.toPersianNumber(activeGalleryIndex + 1) + ' / ' + Format.toPersianNumber(images.length) + '</span>' +
            '<span class="pdp-gallery-count__bar"><span class="pdp-gallery-count__fill" id="pdp-gallery-fill"></span></span>' +
          '</div>' +
        '</div>' +

      '</div>' +

      /* Thumbnails */
      '<div class="pdp-thumbnails" id="gallery-thumbs">' +
        images.map(function (img, idx) {
          return '<div class="pdp-thumb' + (idx === activeGalleryIndex ? ' is-active' : '') + '" data-index="' + idx + '">' +
            thumbImg(img, p.name + ' ' + (idx + 1)) +
          '</div>';
        }).join('') +
      '</div>' +

      /* Product ID */
      '<div class="pdp-product-id">DKP-' + (10000000 + p.id) + '</div>' +

    '</div>' +

    /* ═══ LEFT COLUMN: Info + Buy Box ═══ */
    '<div class="pdp-layout__info">' +

      /* ── Product Title ── */
      '<div class="pdp-title-section">' +
        '<nav class="pdp-breadcrumb">' +
          '<a href="/brand/' + p.brand + '" class="pdp-breadcrumb__brand">' + p.brandName + '</a>' +
          '<span class="pdp-breadcrumb__sep">/</span>' +
          '<a href="/shop?category=' + p.categorySlug + '" class="pdp-breadcrumb__cat">' + p.category + '</a>' +
        '</nav>' +
        '<h1 class="pdp-title">' + p.name + '</h1>' +
        '<div class="pdp-english-name">' + p.shortDescription.substring(0, 60) + '...</div>' +
      '</div>' +

      /* ── Rating + Reviews ── */
      '<div class="pdp-rating-row">' +
        '<div class="pdp-rating">' +
          '<span class="pdp-rating__stars">' + stars + '</span>' +
          '<span class="pdp-rating__value">' + p.rating + '</span>' +
          '<span class="pdp-rating__count">(' + Format.toPersianNumber(actualReviewCount) + ' خریدار)</span>' +
        '</div>' +
        '<div class="pdp-rating__badges">' +
          '<a class="pdp-badge-link" href="#tab-reviews" data-tab="reviews">' +
            '<span class="pdp-badge-link__icon">' + Icons.star + '</span>' +
            Format.toPersianNumber(actualReviewCount) + ' دیدگاه' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>' +
          '</a>' +
          '<a class="pdp-badge-link" href="#tab-qa" data-tab="qa">' +
            Format.toPersianNumber(0) + ' پرسش' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>' +
          '</a>' +
        '</div>' +
      '</div>' +

      /* ── Specs Grid ── */
      (specKeys.length > 0 ?
      '<div class="pdp-specs">' +
        '<h3 class="pdp-specs__title">ویژگی‌ها</h3>' +
        '<div class="pdp-specs__grid">' +
          specKeys.slice(0, 6).map(function (k) {
            return '<div class="pdp-spec-item">' +
              '<div class="pdp-spec-item__label">' + k + '</div>' +
              '<div class="pdp-spec-item__value">' + p.specs[k] + '</div>' +
            '</div>';
          }).join('') +
        '</div>' +
        (specKeys.length > 6 ?
        '<button class="pdp-specs__more" onclick="document.querySelector(\'[data-tab=specs]\').click()">مشاهده همه ویژگی‌ها ' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>' +
        '</button>' : '') +
      '</div>' : '') +

      /* ── Delivery Info ── */
      '<div class="pdp-delivery-info">' +
        '<div class="pdp-delivery-info__row">' +
          '<div class="pdp-delivery-info__badge">' +
            '<span class="pdp-delivery-info__badge-icon">' + Icons.truck + '</span>' +
            '<span>سریع امروز</span>' +
          '</div>' +
          '<div class="pdp-delivery-info__text">' +
            '<span>تحویل توسط فروشگاه</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* ── Product Options (Add-ons) ── */
      '<div class="pdp-options" id="pdp-options"></div>' +

      /* ── Return Policy Notice ── */
      '<div class="pdp-return-notice">' +
        '<div class="pdp-return-notice__icon">' + Icons.infoCircle + '</div>' +
        '<p class="pdp-return-notice__text">امکان برگشت کالا در گروه تجهیزات نظارتی با دلیل "انصراف از خرید" تنها در صورتی مورد قبول است که پلمب کالا باز نشده باشد.</p>' +
      '</div>' +

      /* ── Buy Box (Digikala-style) ── */
      '<div class="dk-buybox-wrap">' +
      '<div class="dk-buybox" data-testid="buy-box">' +

        /* Seller Header (Digikala: title + other-sellers link) */
        '<div class="dk-buybox__seller-header">' +
          '<h3 class="dk-buybox__seller-title">فروشنده</h3>' +
          '<span class="dk-buybox__other-sellers">فروش در کمزی ' + Icons.chevronLeft + '</span>' +
        '</div>' +

        /* Seller Store (official chip + satisfaction badge) */
        '<div class="dk-buybox__store">' +
          '<div class="dk-buybox__store-inner">' +
            '<div class="dk-buybox__store-badge">' + Icons.store + '</div>' +
            '<div class="dk-buybox__store-info">' +
              '<div class="dk-buybox__store-name">کمزی' +
                '<span class="dk-buybox__chip dk-buybox__chip--official">رسمی</span>' +
                '<span class="dk-buybox__chip dk-buybox__chip--selected">منتخب</span>' +
              '</div>' +
              '<div class="dk-buybox__store-stats">' +
                '<span class="dk-buybox__satisfaction">رضایت از کالا <span class="dk-buybox__satisfaction-value">۱۰۰٪</span></span>' +
                '<span class="dk-buybox__store-divider"></span>' +
                '<span class="dk-buybox__store-stat">عملکرد <span style="color:var(--color-success)">عالی</span></span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* Price + Cart */
        '<div class="dk-buybox__price-cart">' +
          '<div class="dk-buybox__price">' +
            '<div class="dk-buybox__price-top">' +
              (p.oldPrice ?
                '<span class="dk-buybox__old-price">' + Format.priceWithCurrency(p.oldPrice) + '</span>' +
                '<span class="dk-buybox__discount-badge">٪' + p.discount + '</span>'
              : '') +
            '</div>' +
            '<div class="dk-buybox__final-price" id="product-detail-price">' +
              '<span class="dk-buybox__amount">' + Format.price(p.price) + '</span>' +
              '<svg style="width:14px;height:14px;fill:currentColor"><use xlink:href="#toman"></use></svg>' +
            '</div>' +
          '</div>' +
          (p.inStock ?
          '<div class="dk-buybox__cart" id="product-cart-control">' +
            '<!-- Rendered by ProductDetail.renderCartControl() -->' +
          '</div>' :
          '<div class="dk-buybox__cart">' +
            '<button class="dk-buybox__add-btn dk-buybox__add-btn--disabled" disabled>ناموجود</button>' +
          '</div>') +
        '</div>' +

        /* Guarantee */
        '<div class="dk-buybox__guarantee">' +
          '<div class="dk-buybox__guarantee-icon">' + Icons.shieldCheck + '</div>' +
          '<span class="dk-buybox__guarantee-text">گارانتی اصالت کالا</span>' +
        '</div>' +

        /* Cheaper-price banner (mirrors reference lowerPriceBg) */
        (p.oldPrice && p.oldPrice > p.price ?
          '<div class="dk-buybox__lower-price">' +
            '<span class="dk-buybox__lower-price-icon">' + Icons.infoCircle + '</span>' +
            '<span>این کالا را «' + Format.price(p.oldPrice - p.price) + ' تومان» ارزان‌تر بخرید</span>' +
          '</div>'
        : '') +

        /* Delivery Methods (two rows like the reference) */
        '<div class="dk-buybox__delivery">' +
          '<div class="dk-buybox__delivery-header">' +
            '<div class="dk-buybox__delivery-icon">' + Icons.truck + '</div>' +
            '<span class="dk-buybox__delivery-title">روش‌ها و هزینه‌های تحویل</span>' +
            '<div class="dk-buybox__delivery-chevron">' + Icons.chevronLeft + '</div>' +
          '</div>' +
          '<ul class="dk-buybox__delivery-list">' +
            '<li class="dk-buybox__delivery-row"><span class="dk-buybox__delivery-dot"></span><span class="dk-buybox__delivery-name">تحویل عادی کمزی</span><span class="dk-buybox__delivery-sep">•</span><span class="dk-buybox__delivery-note">وابسته به سبد</span></li>' +
            '<li class="dk-buybox__delivery-row"><span class="dk-buybox__delivery-dot dk-buybox__delivery-dot--fast"></span><span class="dk-buybox__delivery-name">تحویل سریع امروز</span><span class="dk-buybox__delivery-sep">•</span><span class="dk-buybox__delivery-note">وابسته به سبد</span></li>' +
          '</ul>' +
          '<div class="dk-buybox__delivery-info">' +
            '<p>هزینه ارسال بر اساس آدرس و مبلغ سفارش در مرحله تسویه‌حساب محاسبه می‌شود.</p>' +
          '</div>' +
        '</div>' +

        /* Plus-members row */
        '<div class="dk-buybox__plus">' +
          '<div class="dk-buybox__plus-icon">' + Icons.star + '</div>' +
          '<div class="dk-buybox__plus-info"><span class="dk-buybox__plus-title">ویژه خریدهای عمده</span>' +
          '<p class="dk-buybox__plus-desc">ارسال سریع و رایگان برای سفارش‌های بالای ۵۰۰ هزار تومان</p></div>' +
        '</div>' +

        /* Better Price */
        '<div class="dk-buybox__better-price">' +
          '<span class="dk-buybox__better-price-text">قیمت بهتری سراغ دارید؟</span>' +
          '<div class="dk-buybox__better-price-icon">' + Icons.infoCircle + '</div>' +
        '</div>' +

        /* Pricing Process Link */
        '<a class="dk-buybox__pricing-link" href="/pricing">' +
          '<div class="dk-buybox__pricing-info">' +
            '<div class="dk-buybox__pricing-icon">' + Icons.infoCircle + '</div>' +
            '<span class="dk-buybox__pricing-text">فرآیند قیمت‌گذاری و نظارت بر قیمت</span>' +
          '</div>' +
          '<div class="dk-buybox__pricing-chevron">' + Icons.chevronLeft + '</div>' +
        '</a>' +

      '</div>' +

      /* Payment/delivery services (static info, no backend) */
      '<div class="dk-services">' +
        '<h3 class="dk-services__title">خدمات پرداخت و ارسال</h3>' +
        '<div class="dk-services__row">' +
          '<div class="dk-service-card"><div class="dk-service-card__icon">' + Icons.cart + '</div>' +
            '<div class="dk-service-card__body"><div class="dk-service-card__title">خرید عمده با فاکتور رسمی</div>' +
            '<div class="dk-service-card__desc">برای اصناف و پیمانکاران، با تسویه اعتباری</div></div></div>' +
          '<div class="dk-service-card"><div class="dk-service-card__icon">' + Icons.truck + '</div>' +
            '<div class="dk-service-card__body"><div class="dk-service-card__title">ارسال رایگان سفارش‌های بزرگ</div>' +
            '<div class="dk-service-card__desc">۴ ارسال رایگان • پشتیبانی اختصاصی</div></div></div>' +
        '</div>' +
      '</div>' +

      /* Rules (static info, mirrors reference conditions block) */
      '<div class="dk-rules">' +
        '<h3 class="dk-rules__title">شرایط و قوانین</h3>' +
        '<div class="dk-rules__item"><span class="dk-rules__icon">' + Icons.infoCircle + '</span>' +
          '<div><div class="dk-rules__name">شرایط بازگشت کالا</div>' +
          '<p class="dk-rules__desc">امکان برگشت کالا در گروه تجهیزات نظارتی با دلیل «انصراف از خرید» تنها در صورتی مورد قبول است که پلمب کالا باز نشده باشد.</p></div></div>' +
        '<div class="dk-rules__item"><span class="dk-rules__icon">' + Icons.shieldCheck + '</span>' +
          '<div><div class="dk-rules__name">گزارش مشخصات کالا یا موارد قانونی</div></div></div>' +
        '<div class="dk-rules__item"><span class="dk-rules__icon">' + Icons.store + '</span>' +
          '<div><div class="dk-rules__name">روش قیمت‌گذاری و نظارت بر قیمت</div></div></div>' +
      '</div>' +

      '<div class="pdp-product-code">شناسه این کالا <span class="pdp-product-code__pill">DKP-' + (10000000 + p.id) + '</span></div>' +

      '</div>' +

      /* ── Features ── */
      '<div class="pdp-features">' +
        '<div class="pdp-feature">' +
          '<div class="pdp-feature__icon">' + Icons.truck + '</div>' +
          '<span>ارسال رایگان برای سفارش‌های بالای ۵۰۰ هزار تومان</span>' +
        '</div>' +
        '<div class="pdp-feature">' +
          '<div class="pdp-feature__icon">' + Icons.shieldCheck + '</div>' +
          '<span>ضمانت اصالت کالا</span>' +
        '</div>' +
        '<div class="pdp-feature">' +
          '<div class="pdp-feature__icon">' + Icons.refreshCw + '</div>' +
          '<span>۷ روز ضمانت بازگشت</span>' +
        '</div>' +
      '</div>' +

    '</div>' +

    '</div></div>' +

    /* ── Tabs ── */
    '<div class="container"><div class="product-tabs">' +
      '<div class="product-tabs__nav">' +
        '<button class="product-tabs__tab is-active" data-tab="desc">معرفی</button>' +
        '<button class="product-tabs__tab" data-tab="expert">بررسی تخصصی</button>' +
        '<button class="product-tabs__tab" data-tab="specs">مشخصات</button>' +
        '<button class="product-tabs__tab" data-tab="reviews">دیدگاه‌ها' + (actualReviewCount > 0 ? ' (' + Format.toPersianNumber(actualReviewCount) + ')' : '') + '</button>' +
        '<button class="product-tabs__tab" data-tab="qa">پرسش‌ها</button>' +
      '</div>' +
      '<div class="product-tabs__panel is-active" id="tab-desc"><div class="static-page__content"><p>' + p.description + '</p></div></div>' +
      '<div class="product-tabs__panel" id="tab-expert">' + renderExpert() + '</div>' +
      '<div class="product-tabs__panel" id="tab-specs"><table class="specs-table">' + specKeys.map(function (k) { return '<tr><td>' + k + '</td><td>' + p.specs[k] + '</td>'; }).join('') + '</table></div>' +
      '<div class="product-tabs__panel" id="tab-reviews">' + renderReviews() + '</div>' +
      '<div class="product-tabs__panel" id="tab-qa">' + renderQA() + '</div>' +
    '</div></div>' +

    /* ── Related Products ── */
    '<div class="related-products"><div class="container"><div class="section-header"><h2 class="section-title">محصولات مرتبط</h2></div><div class="product-listing-grid" id="related-grid"></div></div></div>' +

    /* ── Fixed mobile purchase bar ──
       Part of this template (not a shared shell) so it is rebuilt, never
       duplicated, every time render() replaces #product-detail-content —
       including the live-catalog re-render. */
    buyBarHTML(p);

    renderRelated();
    bindReviewForm();
    startPdpCountdown();
    /* Mouse drag-to-scroll for horizontal strips (shared helper in common.js).
       Touch behavior untouched; arrow buttons unchanged. */
    try {
      var dragTargets = [$('#gallery-thumbs'), $('.product-tabs__nav')];
      for (var di = 0; di < dragTargets.length; di++) {
        if (dragTargets[di] && window.App && typeof App.enableDragToScroll === 'function') {
          App.enableDragToScroll(dragTargets[di]);
        } else if (dragTargets[di] && typeof enableDragToScroll === 'function') {
          enableDragToScroll(dragTargets[di]);
        }
      }
      if (window.App && typeof App.initDragCarousels === 'function') App.initDragCarousels(document);
    } catch (e) {}

    var qty = 1;
    var selectedPricingMode = 'retail';
    var cartControlBound = false;

    function getCartKey(id, pricingMode) {
      return id + '_' + (pricingMode || 'retail');
    }

    function findCartItem(productId, pricingMode) {
      var key = getCartKey(productId, pricingMode);
      return App.getCart().find(function (x) { return x.key === key; });
    }

    function getSelectedOptions() {
      var opts = [];
      var checkboxes = document.querySelectorAll('.pdp-option__checkbox:checked');
      checkboxes.forEach(function(cb) {
        var optId = parseInt(cb.value, 10);
        var opt = (product.options || []).find(function(o) { return o.id === optId; });
        if (opt) {
          var finalPrice = opt.discountPrice != null ? opt.discountPrice : opt.price;
          opts.push({
            id: opt.id,
            title: opt.title,
            price: finalPrice,
          });
        }
      });
      return opts;
    }

    /* Markup for one cart control. `isBar` only swaps the element id so the
       same control can live in the buy box and the fixed bar at once
       without duplicate-id collisions. */
    function cartControlHTML(item, isBar) {
      if (item && item.quantity > 0) {
        var countId = isBar ? 'pdp-buy-bar-qty' : 'product-qty';
        /* Digikala-style in-cart control requested by the user. Direct child
           of the cart container (same box as the add button) so both states
           share the container dimensions via CSS. */
        return '<div class="qty-selector qty-selector--buybox" role="group" aria-label="تعداد محصول در سبد خرید">' +
            '<button type="button" class="qty-selector__btn qty-selector__btn--minus" onclick="ProductDetail.updateCartQty(-1)" aria-label="کاهش تعداد">' + Icons.minus + '</button>' +
            '<span class="qty-selector__value" id="' + countId + '">' + Format.toPersianNumber(item.quantity) + '</span>' +
            '<button type="button" class="qty-selector__btn qty-selector__btn--plus" onclick="ProductDetail.updateCartQty(1)" aria-label="افزایش تعداد">' + Icons.plus + '</button>' +
          '</div>';
      }
      /* Add to cart button */
      return '<button class="dk-buybox__add-btn"' + (isBar ? ' id="pdp-buy-bar-add"' : ' id="product-add-to-cart"') + ' onclick="ProductDetail.addToCartWithOptions()">' +
        '<span>افزودن به سبد خرید</span>' +
      '</button>';

      /* Transformed quantity-controls template (same wrapper, inline styles preserve width/height) */
      window.ProductDetail.qtyCtrlHtml = '<div class="flex items-center justify-between user-select-none px-2 rounded-medium shadow-fab-button styles-module-scss-module__bgrzzq__ItemQuantity__box grow" style="width:100%;min-width:0;max-width:240px;">' +
        '<div class="flex cursor-pointer opacity-50 pointer-events-none p-0 lg:p-0" data-testid="quantity-increase" data-cro-id="pdp-main-add-quantitiy"><dds-icon name="content-add" color="brand/primary-base" aria-hidden="true" style="font-size: 18px;"></dds-icon><span class="ml-2 text-xs font-medium dark:text-neutral-200">افزایش</span></div>' +
        '<span class="flex flex-col items-center justify-between text-primary-500">' +
          '<span class="relative flex items-center justify-center text-h5 styles-module-scss-module__bgrzzq__ItemQuantity__boxCount" style="width:100%;min-width:0;max-width:240px;">۱</span>' +
          '<small class="text-caption text-neutral-300">حداکثر</small>' +
        '</span>' +
        '<div class="flex cursor-pointer" data-testid="quantity-decrease" data-cro-id="pdp-main-delete-quantitiy" onclick="ProductDetail.updateCartQty(-1)"><dds-icon name="action-delete" color="brand/primary-base" aria-hidden="true" style="font-size: 18px;"></dds-icon><span class="ml-2 text-xs font-medium dark:text-neutral-200">کاهش</span></div>' +
      '</div>';

      /* Transform the add-to-cart button into quantity controls in-place */
      window.ProductDetail.transformButtonToQtyControls = function () {
        var btnEl = document.getElementById('product-add-to-cart');
        var barBtnEl = document.getElementById('pdp-buy-bar-add');
        var targetEl = btnEl || barBtnEl;
        if (targetEl) {
          // Remember original HTML so we can restore later
          if (!targetEl.dataset.originalHtml) {
            targetEl.dataset.originalHtml = targetEl.innerHTML;
          }
          // Replace with quantity controls (same wrapper structure, same button element preserved)
          targetEl.innerHTML = ProductDetail.qtyCtrlHtml;
          // Keep the button's original dimensions via the dk-buybox__add-btn CSS (240px max-width, 54px height)
          targetEl.style.maxWidth = '240px';
          // The inline onclick on the minus button works because ProductDetail is in scope
        }
      };

      /* Restore the original add-to-cart button content in the same element */
      window.ProductDetail.restoreButton = function () {
        var btnEl = document.getElementById('product-add-to-cart');
        var barBtnEl = document.getElementById('pdp-buy-bar-add');
        var targetEl = btnEl || barBtnEl;
        if (targetEl && targetEl.dataset.originalHtml) {
          targetEl.innerHTML = targetEl.dataset.originalHtml;
          targetEl.dataset.originalHtml = null;
          // Ensure max-width is reset (the dk-buybox__add-btn CSS will apply)
          targetEl.style.maxWidth = '';
        }
      };

      /* Original addToCartWithOptions: add item, show toast, then transform button in-place */
      window.ProductDetail.addToCartWithOptions = function () {
        var mode = 'retail';
        var options = getSelectedOptions();
        var key = getCartKey(p.id, mode);
        var existingItem = App.getCart().find(function (x) { return x.key === key; });

        // Calculate total price with options
        var basePrice = App.getProductPrice(p);
        var optionsPrice = options.reduce(function(sum, opt) { return sum + opt.price; }, 0);
        var totalPrice = basePrice + optionsPrice;

        if (existingItem) {
          existingItem.quantity += 1;
          existingItem.options = options;
          existingItem.price = totalPrice;
        } else {
          App.getCart().push({
            key: key,
            id: p.id,
            name: p.name,
            price: totalPrice,
            basePrice: basePrice,
            pricingMode: mode,
            quantity: 1,
            brandName: p.brandName,
            image: p.image,
            slug: p.slug,
            options: options,
          });
        }
        // Save cart (triggers as_cart_change event)
        var cartKey = 'as_user_' + (App.getCurrentUser() ? App.getCurrentUser().id : 'guest_' + localStorage.getItem('as_guest_session')) + '_cart';
        localStorage.setItem(cartKey, JSON.stringify(App.getCart()));
        document.dispatchEvent(new CustomEvent('as_cart_change'));

        /* No add-to-cart toast here: the product-detail UI (desktop buy box +
           mobile purchase bar) reports the add by swapping the button for the
           quantity stepper instead. */

        // --- Transform the add-to-cart button into quantity controls in-place ---
        ProductDetail.transformButtonToQtyControls();
      };
    }

    /* The buy box and the fixed mobile bar address the same cart line, so
       they always show the same state. Out of stock: the bar keeps its
       static disabled button. */
    function renderCartControl() {
      var item = findCartItem(p.id, selectedPricingMode);
      var targets = [{ el: $('#product-cart-control'), isBar: false }];
      if (p.inStock) targets.push({ el: $('#pdp-buy-bar-cart'), isBar: true });
      for (var i = 0; i < targets.length; i++) {
        if (targets[i].el) {
          // If the add-to-cart button has been transformed into quantity controls,
          // preserve it and only update the quantity display/cart info.
          // Otherwise, use the normal cart control HTML.
          var isBar = targets[i].isBar;
          var btnElId = isBar ? 'pdp-buy-bar-add' : 'product-add-to-cart';
          var btnEl = document.getElementById(btnElId);
          var transformed = btnEl && btnEl.dataset.originalHtml;
          if (transformed) {
            // Button has been transformed in-place.
            // If the item quantity is 0 (or item removed from cart), restore the original button.
            if (!item || item.quantity <= 0) {
              // Restore original button content in the same element
              btnEl.innerHTML = btnEl.dataset.originalHtml;
              btnEl.dataset.originalHtml = null;
              // The dk-buybox__add-btn CSS will restore the original appearance
              btnEl.style.maxWidth = '';
            } else {
              // Item still in cart; update the quantity value in the transformed controls
              var qtySpan = targets[i].el.querySelector('#product-qty');
              if (qtySpan && !isBar) {
                qtySpan.textContent = Format.toPersianNumber(item.quantity);
              }
            }
          } else {
            targets[i].el.innerHTML = cartControlHTML(item, targets[i].isBar);
          }
        }
      }
    }

    function bindCartControlEvents() {
      if (cartControlBound) return;
      cartControlBound = true;
      document.addEventListener('as_cart_change', function () {
        renderCartControl();
      });
      /* Also refresh when pricing mode changes (different cart key) */
      var pricingChanger = document.getElementById('product-detail-pricing');
      if (pricingChanger) {
        pricingChanger.addEventListener('click', function (e) {
          var span = e.target.closest('span[data-mode]');
          if (span) {
            setTimeout(renderCartControl, 0);
          }
        });
      }
    }

    window.ProductDetail = {
      changeQty: function (d) {
        qty = Math.max(1, qty + d);
        var el = $('#product-qty');
        if (el) el.textContent = Format.toPersianNumber(qty);
      },
      getQty: function () { return qty; },
      getPricingMode: function () { return selectedPricingMode; },
      selectPricing: function (mode) {
        selectedPricingMode = mode;
        var changer = document.getElementById('product-detail-pricing');
        if (changer) {
          changer.querySelectorAll('span').forEach(function (s) {
            s.classList.toggle('active', s.getAttribute('data-mode') === mode);
          });
        }
        var newPrice = App.getProductPrice(p);
        var priceEl = document.getElementById('product-detail-price');
        if (priceEl) {
          priceEl.innerHTML = '<span class="pdp-buybox__amount">' + Format.price(newPrice) + '</span><span class="pdp-buybox__currency">تومان</span>';
        }
        /* Mirror the new price into the fixed mobile bar (and keep its
           pricing-toggle active state in sync with the shared one). */
        var barPriceEl = document.getElementById('pdp-buy-bar-price');
        if (barPriceEl) barPriceEl.outerHTML = buyBarPriceHTML(p);
        setTimeout(renderCartControl, 0);
      },

      updateCartQty: function (delta) {
        var mode = selectedPricingMode;
        var key = getCartKey(p.id, mode);
        App.updateCartQty(key, delta);
      },

      addToCartWithOptions: function () {
        var mode = selectedPricingMode;
        var options = getSelectedOptions();
        var key = getCartKey(p.id, mode);
        var existingItem = App.getCart().find(function (x) { return x.key === key; });
        
        // Calculate total price with options
        var basePrice = App.getProductPrice(p);
        var optionsPrice = options.reduce(function(sum, opt) { return sum + opt.price; }, 0);
        var totalPrice = basePrice + optionsPrice;
        
        if (existingItem) {
          existingItem.quantity += 1;
          existingItem.options = options;
          existingItem.price = totalPrice;
        } else {
          App.getCart().push({
            key: key,
            id: p.id,
            name: p.name,
            price: totalPrice,
            basePrice: basePrice,
            pricingMode: mode,
            quantity: 1,
            brandName: p.brandName,
            image: p.image,
            slug: p.slug,
            options: options,
          });
        }
        // Save cart (triggers as_cart_change event)
        var cartKey = 'as_user_' + (App.getCurrentUser() ? App.getCurrentUser().id : 'guest_' + localStorage.getItem('as_guest_session')) + '_cart';
        localStorage.setItem(cartKey, JSON.stringify(App.getCart()));
        document.dispatchEvent(new CustomEvent('as_cart_change'));

        /* No add-to-cart toast: the responsive product-detail UI confirms the
           add in place (the button turns into the quantity stepper). The cart
           itself is untouched — quantity/badges/drawer all update as before. */
      },

      /* ── Wishlist toggle ──────────────────────────────── */
      toggleWishlist: function () {
        App.toggleWishlist(p.id);
        var icon = $('.pdp-action-icon--wishlist');
        if (icon) {
          var inList = App.getWishlist().indexOf(p.id) !== -1;
          /* Replace first child SVG with filled/outline heart */
          var svgContainer = icon.querySelector('svg') || icon.querySelector('div');
          if (svgContainer) {
            icon.innerHTML = (inList ? Icons.heartFill : Icons.heart) +
              '<span class="pdp-action-icon__tooltip">' + (inList ? 'حذف از علاقه‌مندی' : 'اضافه به علاقه‌مندی') + '</span>';
          }
          icon.classList.toggle('is-active', inList);
        }
      },

      /* ── Share product ────────────────────────────────── */
      share: function () {
        var url = window.location.href;
        var title = p.name;
        var text = 'مشاهده ' + p.name + ' در کمزی';
        if (navigator.share) {
          navigator.share({ title: title, text: text, url: url }).catch(function () {});
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(function () {
            App.showToast('لینک محصول کپی شد!', 'success');
          }).catch(function () {
            ProductDetail._fallbackCopy(url);
          });
        } else {
          ProductDetail._fallbackCopy(url);
        }
      },
      _fallbackCopy: function (text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          App.showToast('لینک محصول کپی شد!', 'success');
        } catch (e) {
          App.showToast('امکان کپی لینک وجود ندارد.', 'danger');
        }
        document.body.removeChild(ta);
      },

      /* ── Compare toggle ────────────────────────────────── */
      toggleCompare: function () {
        var key = 'as_compare_list';
        var list = [];
        try { list = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { list = []; }
        var idx = list.indexOf(p.id);
        if (idx === -1) {
          if (list.length >= 4) {
            App.showToast('حداکثر ۴ محصول قابل مقایسه هستند.', 'info');
            return;
          }
          list.push(p.id);
          App.showToast(p.name + ' به لیست مقایسه اضافه شد.', 'success');
        } else {
          list.splice(idx, 1);
          App.showToast(p.name + ' از لیست مقایسه حذف شد.', 'info');
        }
        localStorage.setItem(key, JSON.stringify(list));
        /* Update compare icon state */
        var icon = $('.pdp-action-icon--compare');
        if (icon) {
          var inList = list.indexOf(p.id) !== -1;
          icon.classList.toggle('is-active', inList);
          var tooltip = icon.querySelector('.pdp-action-icon__tooltip');
          if (tooltip) tooltip.textContent = inList ? 'حذف از مقایسه' : 'مقایسه کالا';
        }
      }
    };

    /* Set initial compare icon state */
    (function () {
      var key = 'as_compare_list';
      var list = [];
      try { list = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { list = []; }
      var icon = $('.pdp-action-icon--compare');
      if (icon && list.indexOf(p.id) !== -1) {
        icon.classList.add('is-active');
        var tooltip = icon.querySelector('.pdp-action-icon__tooltip');
        if (tooltip) tooltip.textContent = 'حذف از مقایسه';
      }
    })();

    /* Reserve the fixed bar's band in the document flow so page content is
       never hidden behind it, and publish the two measured heights the bar
       layout depends on. They are measured rather than hard-coded because
       the bar changes height (pricing toggle, quantity stepper vs. disabled
       state) and the mobile bottom nav carries its own safe-area padding.
       See .has-pdp-buy-bar / .pdp-buy-bar in pages.css. */
    function reserveBuyBarSpace() {
      var bar = $('#pdp-buy-bar');
      if (!bar || !document.body) return;
      document.body.classList.add('has-pdp-buy-bar');
      var barH = Math.round(bar.getBoundingClientRect().height);
      if (barH > 0) document.documentElement.style.setProperty('--pdp-buy-bar-h', barH + 'px');
      /* The nav band is always published — including 0. The product page
         does not render the mobile bottom nav (this bar takes its place),
         so leaving a stale CSS fallback in charge would float the bar a
         full nav-height above the bottom edge. It is measured rather than
         hard-coded so the bar still lands directly above the nav wherever
         that nav is present (its height already includes the safe-area
         inset). The resize handler re-measures on desktop↔mobile flips. */
      var nav = $('.mobile-bottom-nav');
      var navH = nav ? Math.round(nav.getBoundingClientRect().height) : 0;
      document.documentElement.style.setProperty('--pdp-bottom-nav-h', navH + 'px');
      /* render() can run again on live-catalog refresh — bind resize once. */
      if (buyBarSpaceBound) return;
      buyBarSpaceBound = true;
      window.addEventListener('resize', reserveBuyBarSpace);
    }

    /* Initialize cart control (buy box + fixed mobile bar) */
    renderCartControl();
    bindCartControlEvents();
    reserveBuyBarSpace();
  }

  function startPdpCountdown() {
    var now = new Date();
    var end = new Date(now);
    end.setHours(23, 59, 59, 999);
    function update() {
      var diff = end - new Date();
      if (diff <= 0) return;
      var h = Math.floor(diff / 3600000);
      var m = Math.floor((diff % 3600000) / 60000);
      var s = Math.floor((diff % 60000) / 1000);
      var el = document.getElementById('pdp-countdown');
      if (el) el.textContent = Format.toPersianNumber(h) + ' : ' + Format.toPersianNumber(m) + ' : ' + Format.toPersianNumber(s);
    }
    update();
    setInterval(update, 1000);
  }

  function renderExpert() {
    return '<div class="static-page__content"><p>' + product.description + '</p></div>';
  }

  function renderReviews() {
    var reviews = AppData.reviews.filter(function (r) { return r.productId === product.id; });
    var reviewsHtml = '';
    if (reviews.length === 0) {
      reviewsHtml = '<p style="color:var(--text-muted);padding:var(--space-4) 0;margin:0">هنوز نظری ثبت نشده است. اولین نفری باشید که نظر می‌دهید!</p>';
    } else {
      reviewsHtml = reviews.map(function (rv) {
        var s = '';
        for (var i = 0; i < rv.rating; i++) s += Icons.star;
        var own = isOwnReview(rv);
        var actions = own
          ? '<div class="review-item__actions" style="display:flex;gap:8px;margin-top:8px">'
            + '<button type="button" class="btn btn-secondary review-edit" data-id="' + rv.id + '" style="padding:4px 12px;font-size:12px">ویرایش</button>'
            + '<button type="button" class="btn btn-secondary review-delete" data-id="' + rv.id + '" style="padding:4px 12px;font-size:12px">حذف</button>'
            + '</div>'
          : '';
        return '<div class="review-item" data-review-id="' + rv.id + '"><div class="review-item__header"><span class="review-item__author">' + rv.author + '</span><span class="review-item__date">' + rv.date + '</span></div><div class="review-item__stars">' + s + '</div><div class="review-item__title">' + (rv.title || '') + '</div><div class="review-item__text">' + rv.text + '</div>' + actions + '</div>';
      }).join('');
    }
    var formHtml = renderReviewForm();
    return reviewsHtml + formHtml;
  }

  function renderReviewForm() {
    var isLoggedIn = App.isLoggedIn();
    var starsHtml = '';
    for (var i = 1; i <= 5; i++) {
      starsHtml += '<button type="button" class="review-form__star" data-rating="' + i + '" title="' + i + ' از ۵">' + Icons.starEmpty + '</button>';
    }
    if (isLoggedIn) {
      var user = App.getCurrentUser();
      var userName = user.firstName || user.name || 'کاربر';
      return '<div class="review-form" id="review-form"><div class="review-form__heading">نظر خود را بنویسید</div>' +
        '<div class="review-form__rating"><span class="review-form__rating-label">امتیاز:</span><div class="review-form__stars" id="review-stars">' + starsHtml + '</div></div>' +
        '<textarea class="review-form__textarea" id="review-text" placeholder="نظر خود درباره این محصول را بنویسید..."></textarea>' +
        '<div class="review-form__actions"><span class="review-form__login-hint">ارسال نظر توسط ' + userName + '</span><button class="btn btn-primary" id="review-submit" type="button" style="display:inline-flex;align-items:center;gap:6px">ارسال نظر</button></div>' +
        '<div id="review-form-message"></div></div>';
    }
    return '<div class="review-form" id="review-form"><div class="review-form__heading">نظر خود را بنویسید</div>' +
      '<div class="review-form__rating"><span class="review-form__rating-label">امتیاز:</span><div class="review-form__stars" id="review-stars">' + starsHtml + '</div></div>' +
      '<textarea class="review-form__textarea" id="review-text" placeholder="نظر خود درباره این محصول را بنویسید..."></textarea>' +
      '<div class="review-form__actions"><span class="review-form__login-hint">برای ارسال نظر ابتدا <a href="/login">وارد حساب کاربری</a> شوید.</span><button class="btn btn-primary" id="review-submit" type="button" disabled style="display:inline-flex;align-items:center;gap:6px">ارسال نظر</button></div></div>';
  }

  function renderQA() {
    return '<div class="qa-item"><div class="qa-item__question">آیا این محصول گارانتی دارد؟</div><div class="qa-item__answer">بله، تمامی محصولات با گارانتی اصالت کالا عرضه می‌شوند. برای اطلاعات بیشتر با پشتیبانی تماس بگیرید.</div></div>' +
    '<div class="qa-item"><div class="qa-item__question">زمان ارسال این محصول چقدر است؟</div><div class="qa-item__answer">ارسال عادی ۳ تا ۵ روز کاری و ارسال سریع ۱ تا ۲ روز کاری است.</div></div>';
  }

  function renderRelated() {
    var grid = $('#related-grid');
    if (!grid) return;
    var related = AppData.products.filter(function (p) { return p.category === product.category && p.id !== product.id; }).slice(0, 4);
    if (related.length < 4) {
      var extra = AppData.products.filter(function (p) { return p.id !== product.id && p.brand === product.brand; }).slice(0, 4 - related.length);
      related = related.concat(extra);
    }
    grid.innerHTML = related.map(function (p) {
      return App.renderProductCard(p);
    }).join('');
  }

  function bindReviewForm() {
    var starsContainer = $('#review-stars');
    var submitBtn = $('#review-submit');
    var textArea = $('#review-text');
    var messageEl = $('#review-form-message');
    if (!starsContainer || !submitBtn) return;
    if (submitBtn.dataset.bound === '1') return;
    submitBtn.dataset.bound = '1';
    var selectedRating = 0;
    var editingId = null;

    window.ProductReviewEdit = function (id, rating, text) {
      editingId = id;
      selectedRating = rating;
      if (textArea) textArea.value = text;
      paintStars(selectedRating);
      submitBtn.textContent = 'ذخیره تغییرات';
      var cancelBtn = $('#review-cancel');
      if (!cancelBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.id = 'review-cancel';
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.style.cssText = 'display:inline-flex;align-items:center;gap:6px';
        cancelBtn.textContent = 'انصراف';
        cancelBtn.addEventListener('click', resetForm);
        submitBtn.parentNode.insertBefore(cancelBtn, submitBtn);
      }
      document.getElementById('review-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    function paintStars(n) {
      $$('.review-form__star', starsContainer).forEach(function (s, idx) {
        if (idx < n) { s.classList.add('is-active'); s.innerHTML = Icons.star; }
        else { s.classList.remove('is-active'); s.innerHTML = Icons.starEmpty; }
      });
    }

    function resetForm() {
      editingId = null; selectedRating = 0;
      if (textArea) textArea.value = '';
      paintStars(0);
      submitBtn.textContent = 'ارسال نظر';
      var c = $('#review-cancel');
      if (c) c.remove();
    }

    starsContainer.addEventListener('click', function (e) {
      var star = e.target.closest('.review-form__star');
      if (!star) return;
      selectedRating = parseInt(star.dataset.rating);
      paintStars(selectedRating);
    });

    submitBtn.addEventListener('click', function () {
      if (!App.isLoggedIn()) {
        if (App.redirectToLogin) App.redirectToLogin(); else window.location.href = '/login';
        return;
      }
      if (selectedRating === 0) {
        messageEl.innerHTML = '<div class="review-form__message review-form__message--error">لطفاً امتیاز خود را انتخاب کنید.</div>';
        return;
      }
      var text = (textArea.value || '').trim();
      if (!text) {
        messageEl.innerHTML = '<div class="review-form__message review-form__message--error">لطفاً متن نظر خود را بنویسید.</div>';
        return;
      }
      submitBtn.disabled = true;
      /* Edit own review (server authoritative when online). */
      if (editingId != null) {
        var prev = AppData.reviews.find(function (r) { return String(r.id) === String(editingId); });
        var done = function () { resetForm(); refreshReviewUI(); };
        if (apiAvailable() && typeof editingId === 'number' && editingId > 1000000) {
          reviewApi('PUT', '/reviews/' + encodeURIComponent(editingId), { rating: selectedRating, text: text })
            .then(function (updated) {
              if (prev) AppData.reviews[AppData.reviews.indexOf(prev)] = updated;
              cacheProductReviews(product.id); done();
            })
            .catch(function (err) { messageEl.innerHTML = '<div class="review-form__message review-form__message--error">' + (err.message || 'خطا') + '</div>'; })
            .then(function () { submitBtn.disabled = false; });
        } else {
          if (prev) { prev.rating = selectedRating; prev.text = text; }
          cacheProductReviews(product.id); done(); submitBtn.disabled = false;
        }
        return;
      }
      var user = App.getCurrentUser();
      var today = new Date();
      var dateStr = today.getFullYear() + '/' + String(today.getMonth() + 1).padStart(2, '0') + '/' + String(today.getDate()).padStart(2, '0');
      var newReview = {
        id: Date.now(),
        productId: product.id,
        userId: user.id,
        author: user.firstName || user.name || 'کاربر',
        rating: selectedRating,
        title: '',
        text: text,
        date: dateStr
      };
      Promise.resolve(saveUserReview(newReview)).then(function () {
        resetForm();
        refreshReviewUI();
        var m = $('#review-form-message');
        if (m) m.innerHTML = '<div class="review-form__message review-form__message--success">نظر شما با موفقیت ثبت شد. با تشکر از شما!</div>';
      }).then(function () { submitBtn.disabled = false; });
    });

    /* Edit/delete delegation (bound once per panel render via document-level guard). */
    if (!window.__asReviewActionsBound) {
      window.__asReviewActionsBound = true;
      document.addEventListener('click', function (e) {
        var del = e.target.closest('.review-delete');
        var edit = e.target.closest('.review-edit');
        if (del) {
          var id = del.dataset.id;
          if (!confirm('این نظر حذف شود؟')) return;
          var local = AppData.reviews.find(function (r) { return String(r.id) === String(id); });
          if (apiAvailable() && App.isLoggedIn() && local && typeof local.id === 'number' && local.id > 1000000 - 1 && local.userId) {
            /* Server id assumed numeric autoincrement; legacy local ids are timestamps — try server, fallback local. */
          }
          var removeLocal = function () {
            AppData.reviews = AppData.reviews.filter(function (r) { return String(r.id) !== String(id); });
            try {
              var k = getReviewStorageKey();
              var s = JSON.parse(localStorage.getItem(k)) || [];
              localStorage.setItem(k, JSON.stringify(s.filter(function (r) { return String(r.id) !== String(id); })));
              localStorage.setItem(getReviewCacheKey(product.id), JSON.stringify(
                (JSON.parse(localStorage.getItem(getReviewCacheKey(product.id))) || []).filter(function (r) { return String(r.id) !== String(id); })));
            } catch (err) {}
            refreshReviewUI();
          };
          if (apiAvailable() && App.isLoggedIn() && local && local.userId) {
            reviewApi('DELETE', '/reviews/' + encodeURIComponent(id)).then(removeLocal).catch(function () { removeLocal(); });
          } else { removeLocal(); }
          return;
        }
        if (edit) {
          var rid = edit.dataset.id;
          var rv = AppData.reviews.find(function (r) { return String(r.id) === String(rid); });
          if (rv && window.ProductReviewEdit) window.ProductReviewEdit(rv.id, rv.rating, rv.text);
        }
      });
    }
  }

  function bindTabs() {
    document.addEventListener('click', function (e) {
      /* Handle badge-link clicks first (prevent href navigation) */
      var badgeLink = e.target.closest('.pdp-badge-link');
      if (badgeLink) {
        e.preventDefault();
        var targetTab = badgeLink.dataset.tab;
        if (targetTab) {
          $$('.product-tabs__tab').forEach(function (t) {
            t.classList.toggle('is-active', t.dataset.tab === targetTab);
          });
          $$('.product-tabs__panel').forEach(function (p) { p.classList.remove('is-active'); });
          var panel = $('#tab-' + targetTab);
          if (panel) panel.classList.add('is-active');
          /* Scroll to tabs section */
          var tabsEl = document.querySelector('.product-tabs');
          if (tabsEl) tabsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }

      var tab = e.target.closest('.product-tabs__tab');
      if (!tab) return;
      $$('.product-tabs__tab').forEach(function (t) { t.classList.remove('is-active'); });
      tab.classList.add('is-active');
      $$('.product-tabs__panel').forEach(function (p) { p.classList.remove('is-active'); });
      var panel2 = $('#tab-' + tab.dataset.tab);
      if (panel2) panel2.classList.add('is-active');
    });
  }

  function paintGalleryCount() {
    var images = product.images && product.images.length ? product.images : [product.image];
    var numEl = document.querySelector('#pdp-gallery-count .pdp-gallery-count__num');
    if (numEl) numEl.textContent = Format.toPersianNumber(activeGalleryIndex + 1) + ' / ' + Format.toPersianNumber(images.length);
    var fill = $('#pdp-gallery-fill');
    if (fill && images.length > 1) fill.style.width = Math.round(((activeGalleryIndex + 1) / images.length) * 100) + '%';
  }

  /* Single place that swaps the main image + thumb state + count badge. */
  function setGalleryIndex(idx) {
    var images = product.images && product.images.length ? product.images : [product.image];
    if (isNaN(idx) || idx < 0 || idx >= images.length) return;
    activeGalleryIndex = idx;
    var mainEl = $('#gallery-main');
    if (mainEl) {
      mainEl.innerHTML = imgTag(images[idx] || images[0] || product.image, product.name) +
        '<div class="pdp-gallery-count" id="pdp-gallery-count" aria-hidden="true">' +
          '<span class="pdp-gallery-count__num"></span>' +
          '<span class="pdp-gallery-count__bar"><span class="pdp-gallery-count__fill" id="pdp-gallery-fill"></span></span>' +
        '</div>';
    }
    $$('.pdp-thumb').forEach(function (t) {
      t.classList.toggle('is-active', parseInt(t.dataset.index) === idx);
    });
    paintGalleryCount();
  }

  /* ── Minimal image viewer (lightbox) ──────────────────────────
     No viewer existed: tapping the main image did nothing. The overlay
     renders into #site-overlays (fallback: body) at z-modal (500), above
     the sticky mobile header (200), tabs nav (50) and buy bar (201).
     Body scroll is locked while open and restored on close. */
  var galleryViewerIndex = 0;
  var galleryViewerScroll = '';

  function galleryImageList() {
    return product.images && product.images.length ? product.images : [product.image];
  }

  function openGalleryViewer() {
    if (!product || $('#pdp-viewer')) return;
    galleryViewerIndex = activeGalleryIndex;
    var images = galleryImageList();
    var host = $('#site-overlays') || document.body;
    var wrap = document.createElement('div');
    wrap.id = 'pdp-viewer';
    wrap.className = 'pdp-viewer';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'نمایش بزرگ تصویر محصول');
    wrap.innerHTML =
      '<div class="pdp-viewer__backdrop" data-viewer-close></div>' +
      '<button type="button" class="pdp-viewer__close" aria-label="بستن نمایش تصویر">' + Icons.close + '</button>' +
      '<figure class="pdp-viewer__figure">' +
        '<img class="pdp-viewer__img" src="' + (images[galleryViewerIndex] || '') + '" alt="' + product.name + '">' +
        '<figcaption class="pdp-viewer__count"></figcaption>' +
      '</figure>' +
      (images.length > 1 ?
        '<button type="button" class="pdp-viewer__nav pdp-viewer__nav--prev" data-dir="-1" aria-label="تصویر قبلی">' + Icons.chevronRight + '</button>' +
        '<button type="button" class="pdp-viewer__nav pdp-viewer__nav--next" data-dir="1" aria-label="تصویر بعدی">' + Icons.chevronLeft + '</button>'
      : '');
    host.appendChild(wrap);
    galleryViewerScroll = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
    try { document.documentElement.style.overflow = 'hidden'; } catch (e) {}
    paintGalleryViewer();
    var closeBtn = wrap.querySelector('.pdp-viewer__close');
    if (closeBtn) { try { closeBtn.focus({ preventScroll: true }); } catch (e) {} }
  }

  function paintGalleryViewer() {
    var wrap = $('#pdp-viewer');
    if (!wrap) return;
    var images = galleryImageList();
    var img = wrap.querySelector('.pdp-viewer__img');
    if (img) {
      img.src = images[galleryViewerIndex] || '';
      img.alt = product ? product.name : '';
    }
    var num = wrap.querySelector('.pdp-viewer__count');
    if (num) num.textContent = Format.toPersianNumber(galleryViewerIndex + 1) + ' / ' + Format.toPersianNumber(images.length);
  }

  function stepGalleryViewer(dir) {
    var images = galleryImageList();
    if (images.length < 2) return;
    galleryViewerIndex = (galleryViewerIndex + dir + images.length) % images.length;
    paintGalleryViewer();
  }

  function closeGalleryViewer() {
    var wrap = $('#pdp-viewer');
    if (!wrap) return;
    /* Keep the page gallery in sync with where the viewer left off. */
    setGalleryIndex(galleryViewerIndex);
    wrap.remove();
    document.body.style.overflow = galleryViewerScroll;
    try { document.documentElement.style.overflow = ''; } catch (e) {}
  }

  function bindGallery() {
    paintGalleryCount();
    document.addEventListener('click', function (e) {
      /* Viewer controls first (viewer lives outside #product-detail-content). */
      var viewer = e.target.closest('#pdp-viewer');
      if (viewer) {
        if (e.target.closest('[data-viewer-close]') || e.target.closest('.pdp-viewer__close')) {
          closeGalleryViewer();
          return;
        }
        var nav = e.target.closest('.pdp-viewer__nav');
        if (nav) {
          stepGalleryViewer(parseInt(nav.dataset.dir) === -1 ? -1 : 1);
          return;
        }
        return;
      }
      var thumb = e.target.closest('.pdp-thumb');
      if (thumb) {
        setGalleryIndex(parseInt(thumb.dataset.index));
        return;
      }
      /* Tapping the main image opens the viewer (badge has
         pointer-events:none in CSS so taps land here). */
      if (e.target.closest('[data-gallery-open]')) {
        openGalleryViewer();
        return;
      }
      /* Digikala-style option pills: keep the checkbox logic, mirror selection. */
      var optLabel = e.target.closest('.pdp-option');
      if (optLabel) {
        setTimeout(function () {
          var box = optLabel.querySelector('.pdp-option__checkbox');
          optLabel.classList.toggle('is-selected', !!(box && box.checked));
        }, 0);
      }
    });
    /* Keyboard: Enter/Space on the main image; Escape/arrows in the viewer. */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('#pdp-viewer')) {
        e.preventDefault();
        closeGalleryViewer();
        return;
      }
      if (!$('#pdp-viewer')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepGalleryViewer(1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stepGalleryViewer(-1); }
    });
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.closest &&
          e.target.closest('[data-gallery-open]') && !$('#pdp-viewer')) {
        e.preventDefault();
        openGalleryViewer();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

