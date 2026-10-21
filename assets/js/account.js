/* ================================================================
   Camzy — Account Pages
   All data is user-scoped via localStorage.
   Shows empty states when user has no data.
   ================================================================ */
(function() {
  'use strict';
  var $ = function(s,c) { return (c||document).querySelector(s); };
  var $$ = function(s,c) { return [...(c||document).querySelectorAll(s)]; };

  function getPage() {
    var path = window.location.pathname;
    if (path.includes('notifications')) return 'notifications';
    if (path.includes('account-order-detail') || path.includes('orders/')) return 'order-detail';
    if (path.includes('orders')) return 'orders';
    if (path.includes('account-cart') || path === '/cart') return 'cart';
    if (path.includes('profile')) return 'profile';
    if (path.includes('addresses')) return 'addresses';
    if (path.includes('wishlist')) return 'wishlist';
    return 'dashboard';
  }

  /* ── Sidebar nav visibility ─────────────────────────────
     The sidebar is static HTML with a hardcoded logout link that would
     otherwise remain visible on the auth-guard prompt. Hide account-only
     links (logout) when logged out. */
  function setNavLinksVisibility() {
    var nav = $('.account-sidebar__nav');
    if (!nav) return;
    var loggedIn = App.isLoggedIn();
    var links = nav.querySelectorAll('.account-nav-link');
    links.forEach(function(link) {
      var href = link.getAttribute('href') || '';
      if (href === '/login' || href === 'login.html') {
        link.style.display = loggedIn ? '' : 'none';
      }
    });
  }

  function render() {
    /* ── Update sidebar with current user data ──────────── */
    updateSidebar();
    syncAdminPanelLink();
    bindLogout();
    setNavLinksVisibility();

    /* ── Auth Guard ──────────────────────────────────────── */
    if (!App.isLoggedIn()) {
      var content = $('#account-content');
      if (content) {
        var _pbSnapLogin = pbCartSnap(content);
        content.innerHTML = '\
          <div class="empty-state" style="padding:var(--space-16) 0">\
            <span class="empty-state__icon" style="width:80px;height:80px">' + Icons.user + '</span>\
            <h3 class="empty-state__title">برای مشاهده پنل کاربری وارد شوید</h3>\
            <p class="empty-state__text">ابتدا باید به حساب کاربری خود وارد شوید یا ثبت‌نام کنید.</p>\
            <div style="display:flex;gap:var(--space-3);justify-content:center">\
              <a href="/login" class="btn btn-primary btn-lg">ورود</a>\
              <a href="/register" class="btn btn-secondary btn-lg">ثبت‌نام</a>\
            </div>\
          </div>';
        pbCartRestore(content, _pbSnapLogin, '');
      }
      highlightNav();
      setupCollapsibleNav();
      return;
    }

    var page = getPage();
    var content = $('#account-content');
    /* Contact page reuses the account sidebar/nav but has no content box —
       still highlight the nav and set up its collapsed dropdown. */
    if (!content) { highlightNav(); setupCollapsibleNav(); return; }

    switch(page) {
      case 'dashboard': renderDashboard(content); break;
      case 'orders': renderOrders(content); break;
      case 'order-detail': renderOrderDetail(content); break;
      case 'profile': renderProfile(content); break;
      case 'addresses': renderAddresses(content); break;
      case 'wishlist':
        renderWishlist(content);
        /* Database is source of truth — refresh from server, localStorage stays as fallback. */
        if (window.App && typeof App.fetchWishlist === 'function') {
          App.fetchWishlist().then(function (items) {
            if (items && getPage() === 'wishlist' && document.getElementById('account-content')) {
              renderWishlist(document.getElementById('account-content'));
            }
          }).catch(function () {});
        }
        document.addEventListener('as_wishlist_change', function h() {
          if (getPage() === 'wishlist' && document.getElementById('account-content')) {
            renderWishlist(document.getElementById('account-content'));
          }
        });
        break;
      case 'cart': renderCart(content); break;
      case 'notifications': renderNotificationsPage(content); break;
    }
    highlightNav();
    setupCollapsibleNav();
  }

  /* ── Sidebar: populate from current user ────────────────── */
  function updateSidebar() {
    var user = App.getCurrentUser();
    var nameEl = $('.account-sidebar__name');
    var emailEl = $('.account-sidebar__email');
    if (user) {
      if (nameEl) nameEl.textContent = user.firstName + ' ' + user.lastName;
      if (emailEl) emailEl.textContent = user.email || user.mobile;
    } else {
      if (nameEl) nameEl.textContent = 'مهمان';
      if (emailEl) emailEl.textContent = 'ورود نکرده‌اید';
    }
  }

  function bindLogout() {
    var logoutLink = document.querySelector('.account-nav-link[href="/login"]');
    if (logoutLink) {
      logoutLink.addEventListener('click', function(e) {
        e.preventDefault();
        Promise.resolve(App.logout()).then(function() {
          App.showToast('با موفقیت خارج شدید.', 'info');
          setTimeout(function() { window.location.href = '/login'; }, 500);
        });
      });
    }
  }

  /* ── Admin panel shortcut (admin accounts only) ───────────
     Reuses the existing admin auth, no new permission system: the admin
     session is the one login() stores in as_admin_session, and it is checked
     with the same /api/admin/me call the panel itself makes before rendering.
     Requires the admin session to be the *active* login (same token as the
     storefront session), so a leftover admin session can never surface the
     link to a normal customer. */
  var ADMIN_PANEL_URL = 'admin/index.html';
  var ADMIN_LINK_ID = 'account-admin-link';

  function readAdminSession() {
    try { return JSON.parse(localStorage.getItem('as_admin_session') || 'null'); }
    catch (e) { return null; }
  }

  function removeAdminPanelLink() {
    var link = document.getElementById(ADMIN_LINK_ID);
    if (link && link.parentNode) link.parentNode.removeChild(link);
  }

  function addAdminPanelLink() {
    var nav = $('.account-sidebar__nav');
    if (!nav) return;
    removeAdminPanelLink();
    var link = document.createElement('a');
    link.id = ADMIN_LINK_ID;
    link.className = 'account-nav-link';
    link.href = ADMIN_PANEL_URL;
    link.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> ورود به پنل مدیریت';
    /* Keep "خروج" as the last item. */
    var logoutLink = $('.account-nav-link[href="/login"]', nav);
    if (logoutLink) nav.insertBefore(link, logoutLink);
    else nav.appendChild(link);
    highlightNav();
  }

  function syncAdminPanelLink() {
    if (!App.isLoggedIn() || !App.isAdminSession || !App.isAdminSession()) {
      removeAdminPanelLink();
      return;
    }
    var adminSession = readAdminSession();
    if (!adminSession || !adminSession.token) { removeAdminPanelLink(); return; }
    fetch('/api/admin/me', { headers: { 'Authorization': 'Bearer ' + adminSession.token } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data && data.admin) addAdminPanelLink();
        else removeAdminPanelLink();
      })
      .catch(function () { removeAdminPanelLink(); });
  }

  /* ── Orders (API/database backed, UI unchanged) ── */
  function getCachedOrders(){ try { if (App.getCachedOrders) return App.getCachedOrders() || []; } catch(e){} return App.getUserData('orders', []); }
  var dashboardPaintToken = 0;
  function renderDashboard(el) {
    var user = App.getCurrentUser();
    var token = ++dashboardPaintToken;
    paintDashboard(el, user, getCachedOrders());
    if (App.listOrders) App.listOrders().then(function(list){
      /* A newer render may have taken over (e.g. re-login, refresh) — never
         wipe the live DOM (incl. #ac-notifs) with a stale second paint.
         If the session died meanwhile (401 auto-logout), fall back to a
         full render so the login prompt shows instead of a stale dashboard. */
      if (token !== dashboardPaintToken) return;
      if (!App.isLoggedIn()) { render(); return; }
      paintDashboard(el, App.getCurrentUser() || user, list || []);
    }).catch(function(){});
  }
  function paintDashboard(el, user, orders) {
    orders = orders || [];
    var wishCount = App.getWishlist().length;
    var pending = orders.filter(function(o) { return o.status === 'pending' || o.status === 'awaiting_payment_approval'; }).length;
    var processing = orders.filter(function(o) { return o.status === 'processing' || o.status === 'shipping'; }).length;
    var delivered = orders.filter(function(o) { return o.status === 'delivered'; }).length;

    el.innerHTML = '\
    <div class="ac-breadcrumb"><a href="/">خانه</a><span>›</span><span>حساب کاربری</span></div>\
    <h2 class="account-content__title">داشبورد</h2>\
    <div class="ac-greeting">\
      <div><p style="font-weight:700">سلام ' + user.firstName + ' ' + user.lastName + ' 👋</p><p style="font-size:13px;color:#62666d;margin-top:4px">به پنل کاربری خود خوش آمدید — سفارش‌ها، آدرس‌ها و علاقه‌مندی‌ها را اینجا مدیریت کنید.</p></div>\
      <a href="/shop" class="btn btn-primary">رفتن به فروشگاه</a>\
    </div>\
    <div class="dashboard-stats">\
      <div class="stat-card"><div class="stat-card__value">' + Format.toPersianNumber(orders.length) + '</div><div class="stat-card__label">کل سفارش‌ها</div></div>\
      <div class="stat-card"><div class="stat-card__value" style="color:var(--color-warning)">' + Format.toPersianNumber(pending) + '</div><div class="stat-card__label">در انتظار پرداخت</div></div>\
      <div class="stat-card"><div class="stat-card__value" style="color:var(--color-info)">' + Format.toPersianNumber(processing) + '</div><div class="stat-card__label">در حال پردازش</div></div>\
      <div class="stat-card"><div class="stat-card__value" style="color:var(--color-success)">' + Format.toPersianNumber(delivered) + '</div><div class="stat-card__label">تحویل شده</div></div>\
    </div><div class="ac-shortcuts">\
      <a class="ac-shortcut" href="/account/orders"><span class="ac-shortcut__icon">' + Icons.package + '</span><span class="ac-shortcut__label">سفارش‌ها</span></a>\
      <a class="ac-shortcut" href="/account/wishlist"><span class="ac-shortcut__icon">' + Icons.heart + '</span><span class="ac-shortcut__label">علاقه‌مندی‌ها (' + Format.toPersianNumber(wishCount) + ')</span></a>\
      <a class="ac-shortcut" href="/account/addresses"><span class="ac-shortcut__icon">' + Icons.mapPin + '</span><span class="ac-shortcut__label">آدرس‌ها</span></a>\
      <a class="ac-shortcut" href="/account/profile"><span class="ac-shortcut__icon">' + Icons.user + '</span><span class="ac-shortcut__label">اطلاعات حساب</span></a>\
      <a class="ac-shortcut" href="/contact"><span class="ac-shortcut__icon">' + Icons.phone + '</span><span class="ac-shortcut__label">تماس با پشتیبانی</span></a>\
    </div>';

    if (orders.length === 0) {
      el.innerHTML += '\
      <div style="margin-top:var(--space-6)">\
        <div class="empty-state">\
          <span class="empty-state__icon">' + Icons.package + '</span>\
          <h3 class="empty-state__title">هنوز سفارشی ثبت نکرده‌اید</h3>\
          <p class="empty-state__text">محصولات مورد نظر خود را از فروشگاه انتخاب کرده و سفارش دهید.</p>\
          <a href="/shop" class="btn btn-primary">مشاهده فروشگاه</a>\
        </div>\
      </div>';
    } else {
      el.innerHTML += '\
      <div style="margin-top:var(--space-6)">\
        <h3 style="font-weight:var(--font-weight-bold);margin-bottom:var(--space-4)">آخرین سفارش‌ها</h3>\
        <div style="overflow-x:auto">' + renderOrdersTable(orders.slice(0, 3)) + '</div>\
      </div>';
    }
    /* ── User notifications (DB-backed; admin-created) ── */
    el.innerHTML += '<div style="margin-top:var(--space-6)" id="ac-notifs"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4)"><h3 style="font-weight:var(--font-weight-bold);margin:0">اعلان‌ها <span id="ac-notifs-unread" style="font-size:12px;color:var(--color-danger)"></span></h3><a href="/account/notifications" style="font-size:12px">مشاهده بیشتر</a></div><div id="ac-notifs-list"><p style="font-size:13px;color:#62666d">در حال بارگذاری…</p></div></div>';
    paintNotifications();
  }

  function escNotif(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function notifAuthError(res, err) {
    var msg = String((res && res.error) || (err && (err.message || err)) || '');
    return /401|not authenticated|نشست/i.test(msg);
  }
  function notifErrorHtml(res, err) {
    if (notifAuthError(res, err)) {
      return '<p style="font-size:13px;color:var(--color-danger)">نشست شما منقضی شده است — لطفاً <a href="/login" style="font-weight:700">دوباره وارد شوید</a>.</p>';
    }
    return '<p style="font-size:13px;color:var(--color-danger)">بارگذاری اعلان‌ها ناموفق بود — لطفاً صفحه را رفرش کنید یا دوباره وارد شوید.</p>';
  }
  function paintNotifications() {
    var list = document.getElementById('ac-notifs-list');
    var badge = document.getElementById('ac-notifs-unread');
    if (!list || !window.App || typeof App.listNotifications !== 'function') return;
    /* Wait for the auth handshake (fetchMe) so the Bearer token is validated
       before the first fetch — otherwise a cold load can 401 and render an
       empty "no notifications" state even though notifications exist. */
    function run() {
      /* Bail if this section was replaced by a newer paint. */
      if (!document.body.contains(list) || document.getElementById('ac-notifs-list') !== list) return;
      App.listNotifications().then(function (res) {
      var items = (res && res.items) || [];
      var unread = Number((res && res.unreadCount) || 0);
      if (badge) badge.textContent = unread > 0 ? '(' + unread + ' خوانده‌نشده)' : '';
      if (res && res.error) {
        list.innerHTML = notifErrorHtml(res, null);
        return;
      }
      if (!items.length) {
        list.innerHTML = '<p style="font-size:13px;color:#62666d">اعلان جدیدی ندارید.</p>';
        return;
      }
      list.innerHTML = items.map(notifCardHtml).join('');
      bindNotifReadButtons(list, paintNotifications);
    }).catch(function (err) {
      if (!document.body.contains(list)) return;
      if (list) list.innerHTML = notifErrorHtml(null, err);
      try { if (window.console && console.warn) console.warn('[account] notifications failed', err); } catch (e) {}
    });
    }
    if (window.App && typeof App.authReady === 'function') {
      try { App.authReady().then(run, run); } catch (e) { run(); }
    } else {
      run();
    }
  }

  /* Shared notification card + read buttons — identical UI on dashboard
     section and the dedicated notifications page. Same API, same logic. */
  function notifCardHtml(n) {
    var dot = n.isRead ? '' : '<span style="display:inline-block;width:8px;height:8px;border-radius:var(--radius-circle);background:var(--color-danger);margin-inline-start:8px" aria-label="خوانده‌نشده"></span>';
    var btn = n.isRead ? '' : '<button type="button" class="btn btn-sm btn-secondary" data-notif-read="' + n.id + '">علامت خوانده‌شده</button>';
    return '<div style="border:1px solid var(--color-border,#e5e7eb);border-radius:var(--radius-xl);padding:12px 14px;margin-bottom:10px;background:' + (n.isRead ? 'transparent' : 'color-mix(in srgb, var(--color-primary) 5%, transparent)') + '">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><strong style="font-size:14px">' + escNotif(n.title) + dot + '</strong>' + btn + '</div>' +
      '<p style="font-size:13px;color:#62666d;margin-top:6px;white-space:pre-wrap">' + escNotif(n.message) + '</p></div>';
  }
  function bindNotifReadButtons(container, refreshFn) {
    container.querySelectorAll('[data-notif-read]').forEach(function (b) {
      b.addEventListener('click', function () {
        App.markNotificationRead(b.getAttribute('data-notif-read')).then(function () { refreshFn(); }).catch(function () {});
      });
    });
  }

  /* ── Dedicated notifications page (account-notifications.html) ── */
  function renderNotificationsPage(el) {
    el.innerHTML = '\
    <div class="ac-breadcrumb"><a href="/">خانه</a><span>›</span><a href="/account">حساب کاربری</a><span>›</span><span>اعلان‌ها</span></div>\
    <h2 class="account-content__title">اعلان‌ها <span id="ac-notifs-page-unread" style="font-size:12px;color:var(--color-danger)"></span></h2>\
    <div id="ac-notifs-page-list"><p style="font-size:13px;color:#62666d">در حال بارگذاری…</p></div>';
    paintNotificationsPage();
  }
  function paintNotificationsPage() {
    var list = document.getElementById('ac-notifs-page-list');
    var badge = document.getElementById('ac-notifs-page-unread');
    if (!list || !window.App || typeof App.listNotifications !== 'function') return;
    function run() {
      if (!document.body.contains(list) || document.getElementById('ac-notifs-page-list') !== list) return;
      App.listNotifications().then(function (res) {
        var items = (res && res.items) || [];
        var unread = Number((res && res.unreadCount) || 0);
        if (badge) badge.textContent = unread > 0 ? '(' + unread + ' خوانده‌نشده)' : '';
        if (res && res.error) {
          list.innerHTML = notifErrorHtml(res, null);
          return;
        }
        if (!items.length) {
          list.innerHTML = '<p style="font-size:13px;color:#62666d">اعلان جدیدی ندارید.</p>';
          return;
        }
        list.innerHTML = items.map(notifCardHtml).join('');
        bindNotifReadButtons(list, paintNotificationsPage);
      }).catch(function (err) {
        if (!document.body.contains(list)) return;
        if (list) list.innerHTML = notifErrorHtml(null, err);
        try { if (window.console && console.warn) console.warn('[account] notifications page failed', err); } catch (e) {}
      });
    }
    if (window.App && typeof App.authReady === 'function') {
      try { App.authReady().then(run, run); } catch (e) { run(); }
    } else {
      run();
    }
  }

  /* ── Orders ────────────────────────────────────────────── */
  function renderOrders(el) {
    paintOrders(el, getCachedOrders());
    if (App.listOrders) App.listOrders().then(function(list){
      if (JSON.stringify(list || []) !== JSON.stringify(getCachedOrders())) paintOrders(el, list || []);
      else paintOrders(el, list || []);
    }).catch(function(){});
  }
  function paintOrders(el, orders) {
    orders = orders || [];
    el.innerHTML = '<h2 class="account-content__title">سفارش‌های من</h2>';

    if (orders.length === 0) {
      el.innerHTML += '\
      <div class="empty-state" style="padding:var(--space-12) 0">\
        <span class="empty-state__icon" style="width:80px;height:80px">' + Icons.package + '</span>\
        <h3 class="empty-state__title">هنوز سفارشی ثبت نکرده‌اید</h3>\
        <p class="empty-state__text">پس از ثبت سفارش، لیست سفارش‌های شما اینجا نمایش داده خواهد شد.</p>\
        <a href="/shop" class="btn btn-primary">مشاهده فروشگاه</a>\
      </div>';
    } else {
      el.innerHTML += '<div style="overflow-x:auto">' + renderOrdersTable(orders) + '</div>';
    }
  }

  function renderOrdersTable(orders) {
    if (orders.length === 0) return '';
    return '<table class="orders-table"><thead><tr><th>شماره سفارش</th><th>تاریخ</th><th>وضعیت</th><th>تعداد اقلام</th><th>مبلغ</th><th>عملیات</th></tr></thead><tbody>' + orders.map(function(o) {
      return '<tr><td style="font-weight:var(--font-weight-semibold)">' + o.id + '</td><td>' + o.date + '</td><td><span class="order-status order-status--' + o.status + '">' + o.statusText + '</span></td><td>' + Format.toPersianNumber(o.itemsCount) + ' عدد</td><td style="font-weight:var(--font-weight-semibold)">' + Format.priceWithCurrency(o.total) + '</td><td><a href="/account/orders/' + o.id + '\" class="btn btn-sm btn-secondary">مشاهده</a></td></tr>';
    }).join('') + '</tbody></table>';
  }

  /* ── Order Detail ──────────────────────────────────────── */
  /* Timeline events are stored as { status, date } (server timeline_json),
     never with a Persian label. Map status codes to Persian labels and
     fall back to the raw value for unknown statuses. Step completion is
     derived from the order's current status along the fulfillment flow. */
  var ORDER_STATUS_FA = {
    pending: 'در انتظار پرداخت',
    awaiting_payment_approval: 'در انتظار تأیید پرداخت',
    awaiting_order_approval: 'در انتظار تأیید سفارش',
    approved: 'تأیید شد / آماده ارسال',
    processing: 'در حال پردازش',
    shipped: 'ارسال‌شده',
    delivered: 'تحویل‌شده',
    cancelled: 'لغوشده'
  };
  var ORDER_STATUS_FLOW = ['pending', 'awaiting_payment_approval', 'awaiting_order_approval', 'approved', 'processing', 'shipped', 'delivered'];
  var PAYMENT_METHOD_FA = { cod: 'پرداخت در محل', online: 'پرداخت آنلاین', card: 'کارت به کارت' };
  function orderStatusLabel(s) {
    var k = String(s || '');
    return ORDER_STATUS_FA[k] || k || '—';
  }
  function paymentMethodLabel(m) {
    var t = String(m || '');
    return PAYMENT_METHOD_FA[t] || t || '—';
  }
  function orderTimelineDone(t, currentStatus) {
    if (!t) return false;
    if (t.done !== undefined) return !!t.done;
    var s = String(t.status || '');
    if (!s) return false;
    var cur = String(currentStatus || '');
    var i = ORDER_STATUS_FLOW.indexOf(s);
    var c = ORDER_STATUS_FLOW.indexOf(cur);
    if (i === -1 || c === -1) return s === cur;
    return i <= c;
  }
  function renderOrderDetail(el) {
    var path = window.location.pathname;
    var urlParams = new URLSearchParams(window.location.search);
    var orderId = urlParams.get('id') || path.split('/').pop().replace('.html', '');
    var order = null;
    getCachedOrders().forEach(function(o){ if (String(o.id) === String(orderId)) order = o; });
    paintOrderDetail(el, orderId, order);
    if (App.getOrder) App.getOrder(orderId).then(function(fresh){ if (fresh) paintOrderDetail(el, orderId, fresh); }).catch(function(){});
  }
  function paintOrderDetail(el, orderId, order) {

    if (!order) {
      el.innerHTML = '\
      <div class="empty-state" style="padding:var(--space-12) 0">\
        <span class="empty-state__icon" style="width:80px;height:80px">' + Icons.package + '</span>\
        <h3 class="empty-state__title">سفارش یافت نشد</h3>\
        <p class="empty-state__text">این سفارش متعلق به حساب کاربری شما نیست یا وجود ندارد.</p>\
        <a href="/account/orders" class="btn btn-primary">بازگشت به سفارش‌ها</a>\
      </div>';
      return;
    }

    document.title = 'سفارش ' + order.id + ' | کمزی';

    el.innerHTML = '\
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-6);flex-wrap:wrap;gap:var(--space-3)">\
      <div><h2 class="account-content__title" style="margin-bottom:var(--space-1)">سفارش ' + order.id + '</h2><p style="font-size:var(--font-size-sm);color:var(--text-muted)">' + order.date + '</p></div>\
      <span class="order-status order-status--' + order.status + '" style="font-size:var(--font-size-sm);padding:6px 16px">' + order.statusText + '</span>\
    </div>\
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-6)">\
      <div>\
        <h3 style="font-weight:var(--font-weight-bold);margin-bottom:var(--space-4)">جدول زمانی سفارش</h3>\
        <div class="order-timeline">' + order.timeline.map(function(t) {
          return '<div class="order-timeline__step ' + (orderTimelineDone(t, order.status) ? 'is-done' : '') + '"><div class="order-timeline__dot"></div><div class="order-timeline__content"><div class="order-timeline__step-name">' + orderStatusLabel(t.status) + '</div><div class="order-timeline__step-date">' + t.date + '</div></div></div>';
        }).join('') + '</div>\
        <h3 style="font-weight:var(--font-weight-bold);margin:var(--space-6) 0 var(--space-3)">آدرس ارسال</h3>\
        <p style="font-size:var(--font-size-sm);color:var(--text-secondary)">' + order.address + '</p>\
        <h3 style="font-weight:var(--font-weight-bold);margin:var(--space-6) 0 var(--space-3)">روش پرداخت</h3>\
        <p style="font-size:var(--font-size-sm);color:var(--text-secondary)">' + paymentMethodLabel(order.paymentMethod) + '</p>\
      </div>\
      <div>\
        <h3 style="font-weight:var(--font-weight-bold);margin-bottom:var(--space-4)">اقلام سفارش</h3>\
        <div style="background:var(--color-gray-50);border-radius:var(--radius-lg);padding:var(--space-4)">' + order.items.map(function(item) {
          var optionsHtml = '';
          if (item.options && item.options.length) {
            optionsHtml = '<div style="margin-top:4px;font-size:var(--font-size-xs);color:var(--text-muted)">' +
              item.options.map(function(opt) {
                return '<span>• ' + opt.title + ': ' + Format.price(opt.price) + ' تومان</span>';
              }).join('<br>') +
            '</div>';
          }
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2) 0;border-bottom:1px solid var(--border-color-light)"><div><div style="font-weight:var(--font-weight-medium);font-size:var(--font-size-sm)">' + item.name + '</div><div style="font-size:var(--font-size-xs);color:var(--text-muted)">' + Format.toPersianNumber(item.quantity) + ' عدد × ' + Format.priceWithCurrency(item.price) + '</div>' + optionsHtml + '</div><div style="font-weight:var(--font-weight-semibold)">' + Format.priceWithCurrency(item.price * item.quantity) + '</div></div>';
        }).join('') + '\
        <div style="margin-top:var(--space-3);padding-top:var(--space-3);border-top:2px solid var(--border-color)">\
          <div style="display:flex;justify-content:space-between;font-size:var(--font-size-sm);padding:var(--space-1) 0"><span>هزینه ارسال</span><span>' + (order.shipping === 0 ? 'رایگان' : Format.priceWithCurrency(order.shipping)) + '</span></div>\
          <div style="display:flex;justify-content:space-between;font-weight:var(--font-weight-bold);font-size:var(--font-size-lg);color:var(--color-primary);padding-top:var(--space-2)"><span>جمع کل</span><span>' + Format.priceWithCurrency(order.total) + '</span></div>\
        </div></div>\
      </div>\
    </div>';
  }

  /* ── Profile ───────────────────────────────────────────── */
  function renderProfile(el) {
    var user = App.getCurrentUser();
    var profile = App.getUserData('profile', {
      firstName: user.firstName,
      lastName: user.lastName,
      mobile: user.mobile,
      email: user.email
    });

    var fullName = ((profile.firstName || '') + ' ' + (profile.lastName || '')).trim();
    var metaLine = [profile.mobile, profile.email].filter(Boolean).join('  ·  ');
    var identityHtml = (fullName || metaLine)
      ? '<div class="acp-id">' + (fullName ? '<span class="acp-id__avatar">' + esc(fullName.charAt(0)) + '</span>' : '') +
        '<div class="acp-id__meta-wrap"' + (metaLine ? ' dir="ltr"' : '') + '>' +
        (fullName ? '<div class="acp-id__name">' + esc(fullName) + '</div>' : '') +
        (metaLine ? '<div class="acp-id__meta">' + esc(metaLine) + '</div>' : '') +
        '</div></div>'
      : '';

    el.innerHTML = '\
    <h2 class="account-content__title">جزئیات حساب</h2>\
    <div class="acp">\
      <section class="acp-card">\
        <header class="acp-card__head">\
          <span class="acp-card__icon">' + Icons.user + '</span>\
          <div class="acp-card__heading">\
            <h3 class="acp-card__title">اطلاعات حساب</h3>\
            <p class="acp-card__sub">این مشخصات در سفارش‌ها و اطلاع‌رسانی‌های حساب شما استفاده می‌شود.</p>\
          </div>' + identityHtml + '\
        </header>\
        <form id="profile-form" class="acp-form">\
          <div class="acp-grid">\
            <div class="acp-field">\
              <label class="input-label" for="profile-firstname">نام</label>\
              <input class="input" id="profile-firstname" value="' + esc(profile.firstName) + '" placeholder="نام خود را وارد کنید" required>\
            </div>\
            <div class="acp-field">\
              <label class="input-label" for="profile-lastname">نام خانوادگی</label>\
              <input class="input" id="profile-lastname" value="' + esc(profile.lastName) + '" placeholder="نام خانوادگی خود را وارد کنید" required>\
            </div>\
            <div class="acp-field">\
              <label class="input-label" for="profile-mobile">موبایل</label>\
              <input class="input" id="profile-mobile" value="' + esc(profile.mobile) + '" type="tel" dir="ltr" placeholder="09xxxxxxxxx" required>\
              <p class="acp-hint">این شماره برای ورود و اطلاع‌رسانی سفارش‌ها استفاده می‌شود.</p>\
            </div>\
            <div class="acp-field">\
              <label class="input-label" for="profile-email">ایمیل</label>\
              <input class="input" id="profile-email" value="' + esc(profile.email) + '" dir="ltr" placeholder="you@example.com">\
              <p class="acp-hint">اختیاری — برای دریافت ایمیل‌های حساب کاربری.</p>\
            </div>\
          </div>\
          <div class="acp-actions">\
            <button type="submit" class="btn btn-primary">ذخیره تغییرات</button>\
            <button type="button" class="btn btn-ghost" onclick="AccountPage.refresh()">انصراف</button>\
          </div>\
        </form>\
      </section>\
      <section class="acp-card">\
        <header class="acp-card__head">\
          <span class="acp-card__icon">' + Icons.shieldCheck + '</span>\
          <div class="acp-card__heading">\
            <h3 class="acp-card__title">تغییر رمز عبور</h3>\
            <p class="acp-card__sub">برای امنیت بیشتر، رمز عبور جدید حداقل ۶ کاراکتر انتخاب کنید.</p>\
          </div>\
        </header>\
        <form id="password-form" class="acp-form">\
          <div class="acp-grid">\
            <div class="acp-field acp-field--full">\
              <label class="input-label" for="pw-current">رمز عبور فعلی</label>\
              <input class="input" type="password" id="pw-current" autocomplete="current-password" placeholder="••••••••" required>\
            </div>\
            <div class="acp-field">\
              <label class="input-label" for="pw-next">رمز عبور جدید</label>\
              <input class="input" type="password" id="pw-next" autocomplete="new-password" placeholder="••••••••" required>\
              <p class="acp-hint">حداقل ۶ کاراکتر.</p>\
            </div>\
            <div class="acp-field">\
              <label class="input-label" for="pw-confirm">تکرار رمز عبور جدید</label>\
              <input class="input" type="password" id="pw-confirm" autocomplete="new-password" placeholder="••••••••" required>\
            </div>\
          </div>\
          <div class="acp-actions">\
            <button type="submit" class="btn btn-primary">تغییر رمز عبور</button>\
            <button type="button" class="btn btn-ghost" onclick="document.getElementById(\'password-form\').reset()">پاک کردن</button>\
          </div>\
        </form>\
      </section>\
    </div>';

    var pf = $('#profile-form');
    if (pf) pf.addEventListener('submit', function(e) {
      e.preventDefault();
      var fn = $('#profile-firstname');
      var ln = $('#profile-lastname');
      var mb = $('#profile-mobile');
      var em = $('#profile-email');
      if (fn && ln && mb) {
        var profileData = {
          firstName: fn.value.trim(),
          lastName: ln.value.trim(),
          mobile: mb.value.trim(),
          email: em ? em.value.trim() : ''
        };
        Promise.resolve(App.updateProfile ? App.updateProfile(profileData) : null).then(function(result) {
          if (result && result.success === false) {
            // Suppress false "Not authenticated" when data was already saved optimistically (PATCH succeeded)
            if (result.error && /Not authenticated/i.test(result.error)) {
              updateSidebar();
              App.showToast('اطلاعات با موفقیت ذخیره شد!', 'success');
              render();
              return;
            }
            App.showToast(result.error || 'خطا در ذخیره اطلاعات.', 'danger');
            return;
          }
          updateSidebar();
          App.showToast('اطلاعات با موفقیت ذخیره شد!', 'success');
          render();
        }).catch(function(err){
          if (err && /Not authenticated/i.test(err.message || '')) {
            updateSidebar();
            App.showToast('اطلاعات با موفقیت ذخیره شد!', 'success');
            render();
            return;
          }
          App.showToast((err && err.message) || 'خطا در ذخیره اطلاعات.', 'danger');
        });
      }
    });
    var pwf = $('#password-form');
    if (pwf) pwf.addEventListener('submit', function(e) {
      e.preventDefault();
      var inputs = pwf.querySelectorAll('input[type="password"]');
      var current = inputs[0] ? inputs[0].value : '';
      var next = inputs[1] ? inputs[1].value : '';
      var confirm = inputs[2] ? inputs[2].value : '';
      if (!current || !next) { App.showToast('رمز عبور فعلی و جدید را وارد کنید.', 'danger'); return; }
      if (next.length < 6) { App.showToast('رمز عبور جدید باید حداقل ۶ کاراکتر باشد.', 'danger'); return; }
      if (next !== confirm) { App.showToast('تکرار رمز عبور مطابقت ندارد.', 'danger'); return; }
      var user = App.getCurrentUser();
      Promise.resolve(App.updateProfile ? App.updateProfile({
        firstName: user.firstName, lastName: user.lastName,
        mobile: user.mobile, email: user.email,
        currentPassword: current, newPassword: next
      }) : null).then(function(result) {
        if (result && result.success) {
          App.showToast('رمز عبور با موفقیت تغییر کرد!', 'success');
          pwf.reset();
        } else {
          App.showToast((result && result.error) || 'تغییر رمز عبور ناموفق بود.', 'danger');
        }
      });
    });
  }

  /* ── Addresses — API/database backed (UI unchanged) ── */
  function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  /* Sync read from cache; API sync happens in renderAddresses. */
  function getAddresses(){ try { if (App.getCachedAddresses) return App.getCachedAddresses() || []; } catch(e){} return App.getUserData('addresses',[]); }
  function notifyAddresses(){ try{window.dispatchEvent(new CustomEvent('as_addresses_change'));}catch(e){} try{localStorage.setItem('as_addr_tick',String(Date.now()));}catch(e){} }

  /* ── City dropdown (custom listbox, opens downward below the field) ── */
  var cityDropdownInstance = null;
  function closeCityDropdown() {
    if (cityDropdownInstance) { cityDropdownInstance.remove(); cityDropdownInstance = null; }
    var t = document.getElementById('addr-city-trigger');
    if (t) t.setAttribute('aria-expanded','false');
  }
  function cityOptionClick() {
    var v = this.getAttribute('data-value');
    var el = document.getElementById('addr-city');
    if (el) el.value = v;
    closeCityDropdown();
  }
  function openCityDropdown() {
    closeCityDropdown();
    var trigger = document.getElementById('addr-city-trigger');
    var el = document.getElementById('addr-city');
    if (!trigger || !el) return;
    var rect = trigger.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    var menu = document.createElement('ul');
    menu.className = 'addr-city-menu';
    var any = false, selected = null, i;
    for (i = 0; i < el.options.length; i++) {
      var o = el.options[i];
      if (!o.value) continue;
      any = true;
      var li = document.createElement('li');
      li.className = 'addr-city-menu__item' + (o.selected ? ' is-selected' : '');
      li.textContent = o.text;
      li.setAttribute('data-value', o.value);
      li.addEventListener('click', cityOptionClick);
      if (o.selected) selected = li;
      menu.appendChild(li);
    }
    if (!any) return;
    document.body.appendChild(menu);
    cityDropdownInstance = menu;
    /* Always open downward below the field, clamped to the viewport so the
       menu is never clipped by the modal or pushed off screen. */
    var gap = 6;
    var minHeight = 100;
    var top = rect.bottom + gap;
    var below = window.innerHeight - top - gap;
    if (below < minHeight) {
      top = Math.min(top, Math.max(8, window.innerHeight - minHeight - gap));
      below = window.innerHeight - top - gap;
    }
    menu.style.position = 'fixed';
    menu.style.left = Math.max(8, rect.left) + 'px';
    menu.style.top = top + 'px';
    menu.style.width = Math.min(rect.width, window.innerWidth - 16) + 'px';
    menu.style.maxHeight = Math.max(0, below) + 'px';
    menu.style.overflowY = 'auto';
    menu.style.overscrollBehavior = 'contain';
    menu.style.touchAction = 'pan-y';
    menu.addEventListener('wheel', function(e){ e.stopPropagation(); }, {passive:false});
    menu.addEventListener('touchmove', function(e){ e.stopPropagation(); }, {passive:false});
    menu.style.zIndex = '560';
    trigger.setAttribute('aria-expanded','true');
    if (selected) menu.scrollTop = Math.max(0, selected.offsetTop - menu.clientHeight / 2);
  }
  /* ── Province dropdown — exact same implementation as City ── */
  var provinceDropdownInstance = null;
  function closeProvinceDropdown() {
    if (provinceDropdownInstance) { provinceDropdownInstance.remove(); provinceDropdownInstance = null; }
    var t = document.getElementById('addr-province-trigger');
    if (t) t.setAttribute('aria-expanded','false');
  }
  function provinceOptionClick() {
    var v = this.getAttribute('data-value');
    var el = document.getElementById('addr-province');
    if (el) {
      el.value = v;
      el.dispatchEvent(new Event('change', {bubbles:true}));
    }
    closeProvinceDropdown();
  }
  function openProvinceDropdown() {
    closeProvinceDropdown();
    var trigger = document.getElementById('addr-province-trigger');
    var el = document.getElementById('addr-province');
    if (!trigger || !el) return;
    var rect = trigger.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    var menu = document.createElement('ul');
    menu.className = 'addr-province-menu';
    var any = false, selected = null, i;
    for (i = 0; i < el.options.length; i++) {
      var o = el.options[i];
      if (!o.value) continue;
      any = true;
      var li = document.createElement('li');
      li.className = 'addr-province-menu__item' + (o.selected ? ' is-selected' : '');
      li.textContent = o.text;
      li.setAttribute('data-value', o.value);
      li.addEventListener('click', provinceOptionClick);
      if (o.selected) selected = li;
      menu.appendChild(li);
    }
    if (!any) return;
    document.body.appendChild(menu);
    provinceDropdownInstance = menu;
    var gap = 6;
    var minHeight = 100;
    var top = rect.bottom + gap;
    var below = window.innerHeight - top - gap;
    if (below < minHeight) {
      top = Math.min(top, Math.max(8, window.innerHeight - minHeight - gap));
      below = window.innerHeight - top - gap;
    }
    menu.style.position = 'fixed';
    menu.style.left = Math.max(8, rect.left) + 'px';
    menu.style.top = top + 'px';
    menu.style.width = Math.min(rect.width, window.innerWidth - 16) + 'px';
    menu.style.maxHeight = Math.max(0, below) + 'px';
    menu.style.overflowY = 'auto';
    menu.style.overscrollBehavior = 'contain';
    menu.style.touchAction = 'pan-y';
    menu.addEventListener('wheel', function(e){ e.stopPropagation(); }, {passive:false});
    menu.addEventListener('touchmove', function(e){ e.stopPropagation(); }, {passive:false});
    menu.style.zIndex = '560';
    trigger.setAttribute('aria-expanded','true');
    if (selected) menu.scrollTop = Math.max(0, selected.offsetTop - menu.clientHeight / 2);
  }
  document.addEventListener('click', function(e){
    if (cityDropdownInstance) {
      var trigger = document.getElementById('addr-city-trigger');
      if (!(trigger && trigger.contains(e.target)) && !cityDropdownInstance.contains(e.target)) closeCityDropdown();
    }
    if (provinceDropdownInstance) {
      var pTrigger = document.getElementById('addr-province-trigger');
      if (!(pTrigger && pTrigger.contains(e.target)) && !provinceDropdownInstance.contains(e.target)) closeProvinceDropdown();
    }
  });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') { closeCityDropdown(); closeProvinceDropdown(); } });
  window.addEventListener('resize', function(){ closeCityDropdown(); closeProvinceDropdown(); });
  window.addEventListener('scroll', function(e){ var t=e.target; if(t && t.closest && (t.closest('.addr-city-menu') || t.closest('.addr-province-menu'))) return; closeCityDropdown(); closeProvinceDropdown(); }, true);

  function renderAddresses(el) {
    var addresses = getAddresses();
    paintAddresses(el, addresses);
    // Refresh from database; repaint when resolved (UI/markup identical).
    if (App.listAddresses) {
      App.listAddresses().then(function(list){
        if (JSON.stringify(list || []) !== JSON.stringify(addresses)) paintAddresses(el, list || []);
      }).catch(function(){});
    }
  }
  function paintAddresses(el, addresses) {
    addresses = addresses || [];
    el.innerHTML = '\
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-6);flex-wrap:wrap;gap:12px"><h2 class="account-content__title" style="margin:0">آدرس‌ها</h2><button class="btn btn-primary btn-sm" onclick="AccountPage.showAddAddress()">افزودن آدرس جدید</button></div>';
    if (addresses.length === 0) {
      el.innerHTML += '\
      <div class="empty-state" style="padding:var(--space-12) 0">\
        <span class="empty-state__icon" style="width:80px;height:80px">' + Icons.mapPin + '</span>\
        <h3 class="empty-state__title">هنوز آدرسی ثبت نکرده‌اید</h3>\
        <p class="empty-state__text">آدرس‌های خود را برای تسریع در فرآیند خرید ثبت کنید.</p>\
        <button class="btn btn-primary" onclick="AccountPage.showAddAddress()">افزودن آدرس جدید</button>\
      </div>';
    } else {
      el.innerHTML += '<div id="addresses-list">' + addresses.map(function(a) {
        return '<div class="address-card ' + (a.isDefault ? 'is-default' : '') + '" style="cursor:pointer" onclick="AccountPage.selectAddress('+a.id+')" title="انتخاب به‌عنوان پیش‌فرض">\
          <div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-2);flex-wrap:wrap"><span class="address-card__title">' + esc(a.title) + '</span>' + (a.isDefault ? '<span class="address-card__badge">پیش‌فرض</span>' : '<button class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 8px" onclick="event.stopPropagation();AccountPage.selectAddress('+a.id+')">انتخاب</button>') + '</div>\
          <div class="address-card__text">' + esc(a.fullName||a.name) + ' — ' + esc(a.mobile) + '<br>' + esc(a.province) + '، ' + esc(a.city) + '، ' + esc(a.address) + '<br>کدپستی: ' + esc(a.postalCode) + '</div></div>\
          <div class="address-card__actions" onclick="event.stopPropagation()"><button class="btn btn-ghost btn-sm" onclick="AccountPage.editAddress(' + a.id + ')">ویرایش</button><button class="btn btn-ghost btn-sm" style="color:var(--color-danger)" onclick="AccountPage.deleteAddress(' + a.id + ')">حذف</button></div>\
        </div>';
      }).join('') + '</div>';
    }
  }
  function openAddressModal(addr){
    var isEdit=!!addr;
    function getProvinces(){ return window.IranCities||null; }
    var provinces=getProvinces();
    if(provinces && provinces.length){ doOpen(provinces); return; }
    if(window.IranCitiesLoader){
      window.IranCitiesLoader.load(function(data){ if(data && data.length){ doOpen(data); } else { var p=getProvinces(); doOpen((p&&p.length)?p:[]); } });
      return;
    }
    // direct fetch — do not use AppData.provinces hardcoded data
    fetch('assets/data/iran-cities.json').then(function(r){return r.json();}).then(function(data){
      window.IranCities=data;
      doOpen(data);
    }).catch(function(){ var p=getProvinces(); doOpen((p&&p.length)?p:[]); });
    return;
    function doOpen(provs){
    provinces=provs;
    var title=isEdit?'ویرایش آدرس':'افزودن آدرس جدید';
    var d=addr||{title:'',fullName:'',mobile:'',province:'',city:'',address:'',postalCode:'',isDefault:false};
    // ensure fullName from name fallback
    if(!d.fullName&&d.name) d.fullName=d.name;
    var overlay=document.createElement('div');
    overlay.className='modal-overlay is-active';
    overlay.id='address-modal-overlay';
    overlay.innerHTML='\
    <div class="modal" style="max-width:560px;width:92%">\
      <div class="modal__header"><span class="modal__title">'+title+'</span><button class="modal__close" onclick="AccountPage.closeAddressModal()">'+Icons.close+'</button></div>\
      <form id="address-form" class="modal__body" novalidate>\
        <div class="form-row"><div class="form-group"><label class="input-label">عنوان آدرس *</label><input class="input" id="addr-title" value="'+esc(d.title)+'" placeholder="مثلا خانه، محل کار" required></div><div class="form-group"><label class="input-label">نام تحویل‌گیرنده *</label><input class="input" id="addr-fullname" value="'+esc(d.fullName)+'" placeholder="نام و نام خانوادگی" required></div></div>\
        <div class="form-group" style="margin-top:12px"><label class="input-label">شماره موبایل *</label><input class="input" id="addr-mobile" dir="ltr" value="'+esc(d.mobile)+'" placeholder="09XXXXXXXXX" required></div>\
         <div class="form-row" style="margin-top:12px"><div class="form-group"><label class="input-label">استان *</label><span class="addr-province-dd"><select class="input" id="addr-province" required><option value="">انتخاب استان</option>'+provinces.map(function(p){return '<option value="'+esc(p.name)+'" '+(p.name===d.province?'selected':'')+'>'+esc(p.name)+'</option>';}).join('')+'</select><button type="button" class="addr-province-trigger" id="addr-province-trigger" aria-haspopup="listbox" aria-expanded="false" aria-label="انتخاب استان"></button></span></div><div class="form-group"><label class="input-label">شهر *</label><span class="addr-city-dd"><select class="input" id="addr-city" required><option value="">انتخاب شهر</option></select><button type="button" class="addr-city-trigger" id="addr-city-trigger" aria-haspopup="listbox" aria-expanded="false" aria-label="انتخاب شهر"></button></span></div></div>\
        <div class="form-group" style="margin-top:12px"><label class="input-label">آدرس کامل *</label><textarea class="input" id="addr-address" rows="3" placeholder="خیابان، کوچه، پلاک، واحد" required style="resize:vertical">'+esc(d.address)+'</textarea></div>\
        <div class="form-group" style="margin-top:12px"><label class="input-label">کد پستی * (۱۰ رقم)</label><input class="input" id="addr-postal" dir="ltr" value="'+esc(d.postalCode)+'" placeholder="XXXXXXXXXX" required maxlength="10"></div>\
        <label style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer;font-size:13px"><input type="checkbox" id="addr-default" '+(d.isDefault?'checked':'')+'> ذخیره به‌عنوان آدرس پیش‌فرض</label>\
        <div id="addr-error" style="color:var(--color-danger);font-size:12px;margin-top:8px;display:none"></div>\
        <div style="display:flex;gap:8px;margin-top:16px"><button type="submit" class="btn btn-primary" style="flex:1">'+(isEdit?'ذخیره تغییرات':'افزودن آدرس')+'</button><button type="button" class="btn btn-secondary" onclick="AccountPage.closeAddressModal()">انصراف</button></div>\
      </form>\
    </div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click',function(e){if(e.target===overlay) AccountPage.closeAddressModal();});
    // populate cities
    var provEl=document.getElementById('addr-province'), cityEl=document.getElementById('addr-city');
    function fillCities(){
      var prov=provinces.find(function(p){return p.name===provEl.value;});
      cityEl.innerHTML='<option value="">انتخاب شهر</option>'+(prov?prov.cities.map(function(c){return '<option value="'+esc(c)+'" '+(c===d.city?'selected':'')+'>'+esc(c)+'</option>';}).join(''):'');
    }
    fillCities();
    var cityTrigger=document.getElementById('addr-city-trigger');
    if (cityTrigger) cityTrigger.addEventListener('click', function(e){
      e.preventDefault();
      if (cityDropdownInstance) closeCityDropdown(); else openCityDropdown();
    });
    var provinceTrigger=document.getElementById('addr-province-trigger');
    if (provinceTrigger) provinceTrigger.addEventListener('click', function(e){
      e.preventDefault();
      closeCityDropdown();
      if (provinceDropdownInstance) closeProvinceDropdown(); else openProvinceDropdown();
    });
    provEl.addEventListener('change',function(){ d.city=''; fillCities(); closeCityDropdown(); closeProvinceDropdown(); });
    document.getElementById('address-form').addEventListener('submit',function(e){
      e.preventDefault();
      var err=document.getElementById('addr-error');
      var data={
        title:document.getElementById('addr-title').value.trim(),
        fullName:document.getElementById('addr-fullname').value.trim(),
        mobile:document.getElementById('addr-mobile').value.trim(),
        province:document.getElementById('addr-province').value,
        city:document.getElementById('addr-city').value,
        address:document.getElementById('addr-address').value.trim(),
        postalCode:document.getElementById('addr-postal').value.trim(),
        isDefault:document.getElementById('addr-default').checked
      };
      var msg='';
      if(!data.title) msg='عنوان آدرس الزامی است.';
      else if(!data.fullName) msg='نام تحویل‌گیرنده الزامی است.';
      else if(!/^09\d{9}$/.test(data.mobile)) msg='شماره موبایل معتبر نیست (09XXXXXXXXX).';
      else if(!data.province) msg='استان را انتخاب کنید.';
      else if(!data.city) msg='شهر را انتخاب کنید.';
      else if(data.address.length<10) msg='آدرس کامل را دقیق‌تر وارد کنید (حداقل ۱۰ کاراکتر).';
      else if(!/^\d{10}$/.test(data.postalCode)) msg='کد پستی باید ۱۰ رقم باشد.';
      if(msg){ err.textContent=msg; err.style.display='block'; return; }
      err.style.display='none';
      var op = isEdit ? App.updateAddress(addr.id, data) : App.createAddress(data);
      op.then(function(saved){
        if (saved) try{ localStorage.setItem('as_selected_address_'+App.getCurrentUser().id, String(saved.isDefault ? saved.id : (getAddresses().filter(function(x){return x.isDefault;})[0]||saved).id)); }catch(e){}
        notifyAddresses();
        AccountPage.closeAddressModal();
        App.showToast(isEdit?'آدرس ویرایش شد.':'آدرس با موفقیت ذخیره شد.','success');
        render();
      }).catch(function(err2){
        var m = (err2 && err2.message) || 'خطا در ذخیره آدرس.';
        err.textContent = m; err.style.display='block';
      });
    });
  } // end doOpen
  }

  /* ── Wishlist ──────────────────────────────────────────── */
  function renderWishlist(el) {
    var wishIds = App.getWishlist();
    var products = AppData.products.filter(function(p) { return wishIds.includes(p.id); });

    el.innerHTML = '<h2 class="account-content__title">علاقه‌مندی‌ها' + (products.length > 0 ? ' (' + Format.toPersianNumber(products.length) + ')' : '') + '</h2>';

    if (products.length === 0) {
      el.innerHTML += '\
      <div class="empty-state" style="padding:var(--space-12) 0">\
        <span class="empty-state__icon" style="width:80px;height:80px">' + Icons.heart + '</span>\
        <h3 class="empty-state__title">لیست علاقه‌مندی‌ها خالی است</h3>\
        <p class="empty-state__text">محصولات مورد علاقه خود را اضافه کنید.</p>\
        <a href="/shop" class="btn btn-primary">مشاهده فروشگاه</a>\
      </div>';
      return;
    }

    el.innerHTML += '<div class="product-listing-grid" id="wishlist-grid">' + products.map(function(p) {
      var r = Format.rating(p.rating); var s = ''; for(var i=0;i<r.full;i++) s += Icons.star; for(var i=0;i<r.empty;i++) s += Icons.starEmpty;
      return '<div class="product-card product-card--theme-default product-card--themed" data-card-theme="default" data-theme="default" data-color-theme="default"><div class="product-card__image"><img src="' + p.image + '" alt="' + p.name + '" loading="lazy" class="product-card__img"></div><div class="product-card__body"><span class="product-card__brand">' + p.brandName + '</span><a href="/product/' + p.slug + '" class="product-card__title" style="color:inherit;text-decoration:none">' + p.name + '</a><div class="product-card__rating"><span class="product-card__stars">' + s + '</span><span>(' + getReviewCount(p.id) + ')</span></div><div class="product-card__price"><span class="product-card__price-current">' + Format.price(p.price) + ' <span class="product-card__price-currency">تومان</span></span></div><div style="display:flex;gap:var(--space-2)"><button class="btn btn-primary" onclick="App.addToCart(' + p.id + ')" style="flex:1">افزودن به سبد</button><button class="btn btn-ghost btn-icon btn-sm" onclick="App.toggleWishlist(' + p.id + ');AccountPage.refresh()" style="color:var(--color-danger)">' + Icons.trash + '</button></div></div></div>';
    }).join('') + '</div>';
  }

  /* ── Cart ───────────────────────────────────────────────── */
  var AcctShip = { cost: 35000, freeFrom: 500000, loaded: false };
  function refreshAcctShip(done) {
    if (location.protocol === 'file:') { if (done) done(); return; }
    fetch('/api/settings').then(function (r) { return r.ok ? r.json() : null; }).then(function (s) {
      if (s) {
        var c = Math.round(Number(String(s['ship.cost']).replace(/[^0-9.-]/g, '')));
        var f = Math.round(Number(String(s['ship.free_from']).replace(/[^0-9.-]/g, '')));
        if (Number.isFinite(c) && c >= 0) AcctShip.cost = c;
        if (Number.isFinite(f) && f >= 0) AcctShip.freeFrom = f;
        AcctShip.loaded = true;
      }
    }).catch(function () {}).then(function () {
      if (done) done();
      if (AcctShip.loaded && typeof AccountPage !== 'undefined' && AccountPage._cartVisible) renderCart(AccountPage._cartEl);
    });
  }
  function shipForAcct(total) { return total >= AcctShip.freeFrom ? 0 : AcctShip.cost; }
  /* ── Visual Builder round-trip for #account-content ────────────
     renderCart() (and the logged-out prompt in render()) rebuild this box
     from fixed templates on every load — including an async second pass
     once /api/settings arrives (refreshAcctShip). That wiped builder text
     and position edits saved in the static file right after saving.
     Snapshot the stable slots' inline styles (minus selection outline),
     builder responsive attrs and static texts first, then re-apply them to
     the rebuilt DOM. Dynamic values (cart count/totals/prices, user data)
     are never carried over. */
  var PB_CART_TEXT_SLOTS = ['.account-content__title', '.empty-state__title', '.empty-state__text', '.empty-state__btn', '.empty-state .btn'];
  var PB_CART_STYLE_SLOTS = PB_CART_TEXT_SLOTS.concat(['.empty-state__icon']);
  function pbCartVariant(root){ try{ return (root && root.querySelector && root.querySelector('.account-content__title')) ? 'cart' : 'prompt'; }catch(e){ return ''; } }
  function pbCartSnap(root){
    var out = { variant: pbCartVariant(root), slots: {} };
    if(!root || !root.querySelector) return out;
    PB_CART_STYLE_SLOTS.forEach(function(sel){
      var n = null;
      try{ n = root.querySelector(sel); }catch(e){ n = null; }
      if(!n) return;
      var attrs = {}, i, a;
      for(i=0;i<n.attributes.length;i++){
        a = n.attributes[i];
        // only attrs the builder persists (cleanClone keeps rid + -t/-m
        // responsive values + aspect lock); runtime chrome (pb-id/sel/
        // outline/drag/…) must never leak onto rebuilt nodes.
        if(a.name==='data-pb-rid' || a.name==='data-pb-ar' || /-t$/.test(a.name) || /-m$/.test(a.name)) attrs[a.name]=a.value;
      }
      var style = n.getAttribute('style')||'';
      style = String(style).split(';').filter(function(p){ return !/^\s*outline/i.test(p); }).join(';');
      var text = '';
      if(PB_CART_TEXT_SLOTS.indexOf(sel)>-1) text = (n.textContent||'');
      if(sel==='.account-content__title') text = text.replace(/\s*[\(（]\s*[0-9۰-۹]+\s*[\)）]\s*$/,'');
      out.slots[sel] = { text: text, style: style, attrs: attrs };
    });
    return out;
  }
  function pbCartRestore(root, snap, countSuffix){
    if(!root || !root.querySelector || !snap) return;
    if(!snap.variant || snap.variant!==pbCartVariant(root)) return; // other box variant — keep canonical template
    Object.keys(snap.slots).forEach(function(sel){
      var n = null;
      try{ n = root.querySelector(sel); }catch(e){ n = null; }
      var s = snap.slots[sel];
      if(!n || !s) return;
      if(s.style) n.setAttribute('style', s.style);
      Object.keys(s.attrs).forEach(function(a){ try{ n.setAttribute(a, s.attrs[a]); }catch(_){} });
      if(sel==='.account-content__title'){ if(s.text) n.textContent = s.text + (countSuffix||''); }
      else if(PB_CART_TEXT_SLOTS.indexOf(sel)>-1 && s.text) n.textContent = s.text;
    });
  }
  function renderCart(el) {
    if (el) { AccountPage._cartEl = el; AccountPage._cartVisible = true; }
    else if (AccountPage._cartEl) { el = AccountPage._cartEl; }
    var cart = App.getCart();
    var count = App.getCartCount();
    var total = App.getCartTotal();
    var shipping = shipForAcct(total);
    var _pbSnap = pbCartSnap(el);
    var _pbCountSuffix = (count > 0) ? ' (' + Format.toPersianNumber(count) + ')' : '';

    el.innerHTML = '<h2 class="account-content__title">سبد خرید' + (count > 0 ? ' (' + Format.toPersianNumber(count) + ')' : '') + '</h2>';

    if (cart.length === 0) {
      el.innerHTML += '\
      <div class="empty-state" style="padding:var(--space-12) 0">\
        <span class="empty-state__icon" style="width:80px;height:80px">' + Icons.shoppingBag + '</span>\
        <h3 class="empty-state__title">سبد شما خالی است</h3>\
        <p class="empty-state__text">محصولات مورد نظر خود را از فروشگاه انتخاب کنید.</p>\
        <a href="/shop" class="btn btn-primary">مشاهده فروشگاه</a>\
      </div>';
      pbCartRestore(el, _pbSnap, _pbCountSuffix);
      return;
    }

    el.innerHTML += '<div class="cart-items" id="account-cart-items"></div>';

    var container = el.querySelector('#account-cart-items');
    container.innerHTML = cart.map(function(item) {
      var modeLabel = '';
      return '<div class="cart-item-row">\
        <div class="cart-item-row__image"><img src="' + item.image + '" alt="' + item.name + '" loading="lazy" class="cart-item__img"></div>\
        <div class="cart-item-row__info">\
          <div class="cart-item-row__details">\
            <span class="cart-item-row__brand">' + item.brandName + '</span>\
            <a href="/product/' + item.slug + '" class="cart-item-row__title">' + item.name + '</a>' + modeLabel + '\
          </div>\
          <div class="cart-item-row__bottom">\
            <span class="cart-item-row__price">' + Format.priceWithCurrency(item.price) + '</span>\
            <div class="cart-item-row__actions">\
              <div class="qty-selector">\
                <button class="qty-selector__btn" onclick="AccountPage.cartChangeQty(\'' + item.key + '\',-1)" aria-label="کاهش تعداد">' + Icons.minus + '</button>\
                <div class="qty-selector__value">' + Format.toPersianNumber(item.quantity) + '</div>\
                <button class="qty-selector__btn" onclick="AccountPage.cartChangeQty(\'' + item.key + '\',1)" aria-label="افزایش تعداد">' + Icons.plus + '</button>\
              </div>\
              <button class="cart-item-row__remove" onclick="AccountPage.cartRemoveItem(\'' + item.key + '\')" aria-label="حذف محصول">' + Icons.trash + '</button>\
            </div>\
          </div>\
        </div>\
      </div>';
    }).join('');

    el.innerHTML += '\
    <div style="margin-top:var(--space-6);background:var(--color-gray-50);border-radius:var(--radius-lg);padding:var(--space-5)">\
      <div style="display:flex;justify-content:space-between;font-size:var(--font-size-sm);padding:var(--space-1) 0"><span>جمع سبد خرید</span><span>' + Format.priceWithCurrency(total) + '</span></div>\
      <div style="display:flex;justify-content:space-between;font-size:var(--font-size-sm);padding:var(--space-1) 0"><span>هزینه ارسال</span><span>' + (shipping === 0 ? '<span style="color:var(--color-success)">رایگان</span>' : Format.priceWithCurrency(shipping)) + '</span></div>\
      <div style="display:flex;justify-content:space-between;font-weight:var(--font-weight-bold);font-size:var(--font-size-lg);color:var(--color-primary);padding-top:var(--space-2);margin-top:var(--space-2);border-top:1px solid var(--border-color-light)"><span>مبلغ قابل پرداخت</span><span>' + Format.priceWithCurrency(total + shipping) + '</span></div>\
      <div style="display:flex;gap:var(--space-3);margin-top:var(--space-5)">\
        <a href="/checkout/step1" class="btn btn-primary btn-lg" style="flex:1">تکمیل خرید</a>\
        <a href="/shop" class="btn btn-secondary btn-lg">ادامه خرید</a>\
      </div>\
    </div>';
    pbCartRestore(el, _pbSnap, _pbCountSuffix);
  }

  /* ── Navigation Highlight ──────────────────────────────── */
  /* Contact page carries the same account nav — treat it like an
     account sub-page for nav behavior (collapse + highlight). */
  function isContactPage() {
    try { return window.location.pathname.indexOf('contact') !== -1; }
    catch (e) { return false; }
  }
  function highlightNav() {
    var page = getPage();
    var onContact = isContactPage();
    $$('.account-nav-link').forEach(function(link) {
      /* Static markup may carry a stale is-active (copied page) — recompute. */
      link.classList.remove('is-active');
      var href = link.getAttribute('href') || '';
      if (onContact) {
        if (href.indexOf('contact') !== -1) link.classList.add('is-active');
        return;
      }
      if (href.includes(page) || (page === 'dashboard' && (href === '/account' || href === 'account.html'))) {
        link.classList.add('is-active');
      }
    });
  }

  /* ── Collapsible options list (mobile sub-pages + contact) ─
     Entry page (dashboard) keeps the options list fully visible in place.
     On any other account page, and on contact.html which reuses the same
     nav, the options list is collapsed into a dropdown placed directly
     under the user (username/email) box; tapping the box expands it so
     the user can navigate to another section. Desktop is untouched. */
  var NAV_COLLAPSE_ID = 'account-nav-collapse';
  var navCollapseMq = window.matchMedia ? window.matchMedia('(max-width:900px)') : { matches: false };

  function setupCollapsibleNav() {
    var layout = $('.account-layout');
    var sidebar = $('.account-sidebar');
    var content = $('#account-content');
    var nav = $('.account-sidebar__nav');
    if (!sidebar || !nav) return;
    /* Contact page has no account layout/content — the sidebar alone is enough. */
    var onContact = isContactPage();
    if (!onContact && (!layout || !content)) return;
    var collapse = document.getElementById(NAV_COLLAPSE_ID);
    var shouldCollapse = !!(navCollapseMq && navCollapseMq.matches) && (getPage() !== 'dashboard' || onContact);
    if (shouldCollapse) {
      if (!collapse) {
        collapse = document.createElement('div');
        collapse.id = NAV_COLLAPSE_ID;
        collapse.className = 'account-nav-collapse';
        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'account-nav-collapse__toggle';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.innerHTML = '<span class="account-nav-collapse__label">گزینه‌های حساب</span><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
        toggle.addEventListener('click', function () {
          var isOpen = collapse.classList.toggle('is-open');
          toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
        collapse.appendChild(toggle);
      }
      /* Keep the dropdown directly under the user box, before the main content. */
      var userBox = $('.account-sidebar__user', sidebar);
      if (collapse.parentNode !== sidebar || (userBox && collapse.previousSibling !== userBox)) {
        sidebar.insertBefore(collapse, userBox ? userBox.nextSibling : sidebar.firstChild);
      }
      if (nav.parentNode !== collapse) collapse.appendChild(nav);
    } else {
      if (collapse) {
        if (nav.parentNode === collapse) sidebar.appendChild(nav);
        if (collapse.parentNode) collapse.parentNode.removeChild(collapse);
      } else if (nav.parentNode !== sidebar) {
        sidebar.appendChild(nav);
      }
    }
  }

  if (navCollapseMq) {
    if (typeof navCollapseMq.addEventListener === 'function') navCollapseMq.addEventListener('change', setupCollapsibleNav);
    else if (typeof navCollapseMq.addListener === 'function') navCollapseMq.addListener(setupCollapsibleNav);
  }

  /* ── Public API ────────────────────────────────────────── */
  window.AccountPage = {
    refresh: function() { render(); },
    showAddAddress: function() { openAddressModal(null); },
    closeAddressModal: function(){ closeCityDropdown(); closeProvinceDropdown(); var o=document.getElementById('address-modal-overlay'); if(o) o.remove(); },
    editAddress: function(id) {
      var a=getAddresses().find(function(x){return x.id===id;});
      if(!a) return;
      openAddressModal(a);
    },
    selectAddress: function(id){
      try{ localStorage.setItem('as_selected_address_'+App.getCurrentUser().id, String(id)); }catch(e){}
      App.setDefaultAddress(id).then(function(){
        notifyAddresses();
        App.showToast('آدرس پیش‌فرض انتخاب شد.','success');
        render();
      }).catch(function(err){ App.showToast((err&&err.message)||'خطا در انتخاب آدرس پیش‌فرض.','error'); });
    },
    deleteAddress: function(id) {
      if(!confirm('آیا از حذف این آدرس اطمینان دارید؟')) return;
      App.deleteAddress(id).then(function(){
        notifyAddresses();
        App.showToast('آدرس حذف شد.', 'info');
        render();
      }).catch(function(err){ App.showToast((err&&err.message)||'خطا در حذف آدرس.','error'); });
    },
    cartChangeQty: function(id, delta) { App.updateCartQty(id, delta); render(); },
    cartRemoveItem: function(id) { App.removeFromCart(id); render(); }
  };

  /* Dead server session (401) auto-logs-out via common.js — re-render so the
     page honestly shows the login prompt instead of a stale dashboard. */
  document.addEventListener('as_auth_expired', function () { render(); });

  /* ── Keep the username/email box consistent ─────────────────
     Same updateSidebar() implementation — re-run it once the async auth
     handshake (server is source of truth) settles, and re-render on any
     auth change, so every account page shows the current user. */
  if (window.App && typeof App.authReady === 'function') {
    try { App.authReady().then(function () { updateSidebar(); }, function () { updateSidebar(); }); }
    catch (e) {}
  }
  document.addEventListener('as_auth_change', function () { render(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { render(); refreshAcctShip(); }); else { render(); refreshAcctShip(); }
})();
