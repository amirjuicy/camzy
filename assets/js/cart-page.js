/* ================================================================
   Camzy — Cart Page (Digikala-matched layout)
   ================================================================ */
(function() {
  'use strict';
  var $ = function(s,c) { return (c||document).querySelector(s); };

  var RECENT_KEY = 'as_recently_viewed';
  var RECENT_MAX = 8;
  var ShipSettings = { cost: 35000, freeFrom: 500000 };
  function refreshShipSettings(done) {
    fetch('/api/settings').then(function (r) { return r.json(); }).then(function (s) {
      if (s) {
        var c = Math.round(Number(String(s['ship.cost']).replace(/[^0-9.-]/g, '')));
        var f = Math.round(Number(String(s['ship.free_from']).replace(/[^0-9.-]/g, '')));
        if (Number.isFinite(c) && c >= 0) ShipSettings.cost = c;
        if (Number.isFinite(f) && f >= 0) ShipSettings.freeFrom = f;
      }
    }).catch(function () {}).then(function () { if (done) done(); });
  }
  function shipFor(total) { return total >= ShipSettings.freeFrom ? 0 : ShipSettings.cost; }

  function getRecentlyViewedIds() {
    try {
      var list = JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function renderRecentProducts() {
    /* Dynamic: resolve stored product IDs against existing product data.
       Most recently viewed first (storage order), no duplicates, limited. */
    var ids = getRecentlyViewedIds().slice(0, RECENT_MAX);
    var products = ids.map(function(id) {
      return AppData.products.find(function(p) { return p.id === id; });
    }).filter(function(p) { return !!p; });
    if (products.length === 0) {
      return '<section class="cart-recent-section">\
        <div class="cart-recent-card cart-card cart-card--header">\
          <div class="cart-recent-card__header">\
            <h2 class="cart-recent-card__title">بازدیدهای اخیر</h2>\
          </div>\
          <div class="cart-recent-card__body">\
            <p style="color:var(--text-muted);padding:var(--space-4);margin:0">هنوز محصولی را مشاهده نکرده‌اید. محصولات مشاهده‌شده اخیراً در اینجا نمایش داده می‌شوند.</p>\
          </div>\
        </div>\
      </section>';
    }
    return '<section class="cart-recent-section">\
      <div class="cart-recent-card cart-card cart-card--header">\
        <div class="cart-recent-card__header">\
          <h2 class="cart-recent-card__title">بازدیدهای اخیر</h2>\
          <div class="cart-recent-card__controls">\
            <button type="button" class="cart-recent-card__nav" id="cart-recent-prev" aria-label="قبلی">‹</button>\
            <button type="button" class="cart-recent-card__nav" id="cart-recent-next" aria-label="بعدی">›</button>\
          </div>\
        </div>\
        <div class="cart-recent-card__body">\
          <div class="cart-recent-carousel" id="cart-recent-carousel">\
            ' + products.map(function(p) {
              var discount = p.discount || (p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0);
              var discountHtml = discount > 0
                ? '<span class="cart-recent__discount">%' + Format.toPersianNumber(discount) + '</span>'
                : '';
              var oldPriceHtml = p.oldPrice
                ? '<span class="cart-recent__old-price">' + Format.price(p.oldPrice) + '</span>'
                : '';
              var priceRow = discountHtml || oldPriceHtml
                ? '<div class="cart-recent__price-row">' + discountHtml + oldPriceHtml + '</div>'
                : '';
              return '<a href="/product/' + p.slug + '" class="cart-recent__item">\
                <div class="cart-recent__item-img">\
                  <img src="' + p.image + '" alt="' + p.name + '" loading="lazy" onerror="this.onerror=null;this.src=\'\'">\
                </div>\
                <div class="cart-recent__item-body">\
                  <p class="cart-recent__item-title">' + p.name + '</p>\
                  <div class="cart-recent__item-price">\
                    ' + priceRow + '\
                    <div class="cart-recent__price-row">\
                      <span class="cart-recent__new-price">' + Format.price(p.price) + '</span>\
                      <span class="cart-recent__currency">تومان</span>\
                    </div>\
                  </div>\
                </div>\
              </a>';
            }).join('') + '\
          </div>\
        </div>\
      </div>\
    </section>';
  }

  function render() {
    var cart = App.getCart();
    var content = $('#cart-content');
    if (!content) return;

    if (cart.length === 0) {
      content.innerHTML = '\
      <div class="breadcrumb"><div class="container"><div class="breadcrumb-list">\
        <span class="breadcrumb-item"><a href="/">خانه</a></span>\
        <span class="breadcrumb-sep">\u2039</span>\
        <span class="breadcrumb-item breadcrumb-item--active">سبد خرید</span>\
      </div></div></div>\
      <div class="container"><div class="cart-page">\
        <div class="cart-card cart-card--header">\
          <div class="cart-card__header-inner">\
            <div class="cart-card__title-row">\
              <h1 class="cart-card__title">سبد خرید</h1>\
              <span class="cart-badge cart-badge--warning">۰</span>\
            </div>\
          </div>\
        </div>\
        <div class="cart-empty-state">\
          <div class="cart-empty-state__icon">' + Icons.shoppingBag + '</div>\
           <h3 class="cart-empty-state__title">سبد شما خالی است</h3>\
          <p class="cart-empty-state__text">اگر به صفحه\u200Cهای زیر سر بزنید، دست\u200C\u200Cپُر برمی\u200Cگردید.</p>\
          <a href="/shop" class="btn btn-outline-primary cart-empty-state__btn">' + Icons.shoppingBag + ' لیست های شما</a>\
        </div>\
        <div class="cart-charity-banner cart-charity-banner--full">\
          <div class="cart-charity-banner__row">\
            <div class="cart-charity-banner__info">\
              <span class="cart-charity-banner__icon">' + Icons.shield + '</span>\
            </div>\
            <div class="cart-charity-banner__action">\
              <span class="cart-charity-banner__label">افزودن</span>\
              <span class="cart-charity-banner__chevron">' + Icons.chevronLeft + '</span>\
            </div>\
          </div>\
          <span class="cart-charity-banner__desc">در مهارت\u200Cآموزی کودکان کم\u200Cبرخوردار همراه شویم</span>\
        </div>\
        ' + renderRecentProducts() + '\
      </div></div>';
      initCarousel();
      return;
    }

    var total = App.getCartTotal();
    var shipping = shipFor(total);
    var count = App.getCartCount();

    content.innerHTML = '\
    <div class="breadcrumb"><div class="container"><div class="breadcrumb-list">\
      <span class="breadcrumb-item"><a href="/">خانه</a></span>\
      <span class="breadcrumb-sep">\u2039</span>\
      <span class="breadcrumb-item breadcrumb-item--active">سبد خرید</span>\
    </div></div></div>\
    <div class="container"><div class="cart-page"><div class="cart-layout">\
      <section class="cart-layout__main">\
        <div class="cart-card cart-card--header">\
          <div class="cart-card__header-inner">\
            <div class="cart-card__title-row">\
              <h1 class="cart-card__title">سبد خرید</h1>\
              <span class="cart-badge">' + Format.toPersianNumber(count) + '</span>\
            </div>\
          </div>\
        </div>\
        <div class="cart-items" id="cart-items"></div>\
      </section>\
      <aside class="cart-layout__sidebar">\
        <div class="cart-sidebar-sticky">\
          <div class="cart-summary-box">\
            <h3 class="cart-summary-box__title">خلاصه سفارش</h3>\
            <div class="cart-summary-box__row"><span>جمع سبد خرید</span><span>' + Format.priceWithCurrency(total) + '</span></div>\
            <div class="cart-summary-box__row"><span>هزینه ارسال</span><span>' + (shipping === 0 ? '<span class="text-success">رایگان</span>' : Format.priceWithCurrency(shipping)) + '</span></div>\
            <div class="cart-summary-box__row cart-summary-box__row--total"><span>مبلغ قابل پرداخت</span><span>' + Format.priceWithCurrency(total + shipping) + '</span></div>\
            <div class="cart-summary-box__actions">\
              <a href="/checkout/step1" class="btn btn-primary btn-lg btn-block">تکمیل خرید</a>\
              <a href="/shop" class="btn btn-secondary btn-block">ادامه خرید</a>\
            </div>\
          </div>\
          <div class="cart-charity-banner">\
            <div class="cart-charity-banner__row">\
              <div class="cart-charity-banner__info">\
                <span class="cart-charity-banner__icon">' + Icons.shield + '</span>\
              </div>\
              <div class="cart-charity-banner__action">\
                <span class="cart-charity-banner__label">افزودن</span>\
                <span class="cart-charity-banner__chevron">' + Icons.chevronLeft + '</span>\
              </div>\
            </div>\
            <span class="cart-charity-banner__desc">در مهارت\u200Cآموزی کودکان کم\u200Cبرخوردار همراه شویم</span>\
          </div>\
        </div>\
      </aside>\
    </div>\
    ' + renderRecentProducts() + '\
    </div></div>';
    renderItems();
    initCarousel();
  }

  function renderItems() {
    var cart = App.getCart();
    var container = $('#cart-items');
    if (!container) return;
    container.innerHTML = cart.map(function(item) {
      var modeLabel = '';
      var optionsHtml = '';
      if (item.options && item.options.length) {
        optionsHtml = '<div class="cart-item-row__options" style="margin-top:4px;font-size:var(--font-size-xs);color:var(--text-muted)">' +
          item.options.map(function(opt) {
            return '<span>• ' + opt.title + ': ' + Format.price(opt.price) + ' تومان</span>';
          }).join('<br>') +
        '</div>';
      }
      return '<div class="cart-item-row">\
        <div class="cart-item-row__image"><img src="' + item.image + '" alt="' + item.name + '" loading="lazy" class="cart-item__img"></div>\
        <div class="cart-item-row__info">\
          <div class="cart-item-row__details">\
            <span class="cart-item-row__brand">' + item.brandName + '</span>\
            <a href="/product/' + item.slug + '" class="cart-item-row__title">' + item.name + '</a>' + modeLabel + '\
            ' + optionsHtml + '\
          </div>\
          <div class="cart-item-row__bottom">\
            <span class="cart-item-row__price">' + Format.priceWithCurrency(item.price) + '</span>\
            <div class="cart-item-row__actions">\
              <div class="qty-selector">\
                <button class="qty-selector__btn" onclick="CartPage.changeQty(\'' + item.key + '\',-1)" aria-label="کاهش تعداد">' + Icons.minus + '</button>\
                <div class="qty-selector__value">' + Format.toPersianNumber(item.quantity) + '</div>\
                <button class="qty-selector__btn" onclick="CartPage.changeQty(\'' + item.key + '\',1)" aria-label="افزایش تعداد">' + Icons.plus + '</button>\
              </div>\
              <button class="cart-item-row__remove" onclick="CartPage.removeItem(\'' + item.key + '\')" aria-label="حذف محصول">' + Icons.trash + '</button>\
            </div>\
          </div>\
        </div>\
      </div>';
    }).join('');
  }

  function initCarousel() {
    var carousel = document.getElementById('cart-recent-carousel');
    if (!carousel) return;
    var prev = document.getElementById('cart-recent-prev');
    var next = document.getElementById('cart-recent-next');
    if (prev) prev.addEventListener('click', function() { carousel.scrollBy({ left: 320, behavior: 'smooth' }); });
    if (next) next.addEventListener('click', function() { carousel.scrollBy({ left: -320, behavior: 'smooth' }); });
    if (window.App && typeof App.enableDragToScroll === 'function') {
      App.enableDragToScroll(carousel);
    } else if (typeof enableDragToScroll === 'function') {
      enableDragToScroll(carousel);
    }
  }

  function refreshRecentFromServer() {
    /* Database is source of truth — refresh cache, then swap the section. */
    if (!window.App || typeof App.fetchRecent !== 'function') return;
    App.fetchRecent().then(function (items) {
      if (!items) return;
      var html = renderRecentProducts();
      var tmp = document.createElement('div');
      tmp.innerHTML = html;
      var fresh = tmp.firstChild;
      var cur = document.querySelector('.cart-recent-section');
      if (cur && fresh) { cur.replaceWith(fresh); initCarousel(); }
    }).catch(function () {});
  }

  window.CartPage = {
    changeQty: function(id, delta) { App.updateCartQty(id, delta); render(); },
    removeItem: function(id) { App.removeFromCart(id); render(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { render(); refreshShipSettings(render); refreshRecentFromServer(); });
  else { render(); refreshShipSettings(render); refreshRecentFromServer(); }
})();
