/* ================================================================
   Camzy — Admin Panel
   View switching, filters, search, settings forms, toasts.
   ================================================================ */
(function () {
  'use strict';

  var VIEW_TITLES = {
    dashboard: 'داشبورد',
    reports: 'گزارش‌ها',
    discounts: 'کدهای تخفیف',
    orders: 'سفارش‌ها',
    transactions: 'تراکنش‌ها و پرداخت‌ها',
    products: 'محصولات',
    categories: 'دسته‌بندی‌ها',
    users: 'کاربران',
    notifications: 'اعلان‌ها',
    tickets: 'تیکت‌ها',
    'contact-messages': 'پیام‌های تماس',
    'chatbot-messages': 'پیام‌های چت‌بات',
    brands: 'برندها',
    articles: 'مقالات',
    reviews: 'نظرات و پرسش‌ها',
    content: 'محتوا',
    'visual-editor': 'ویرایشگر بصری',
    home: 'مدیریت صفحه اصلی',
    gallery: 'گالری',
    admins: 'مدیران و دسترسی‌ها',
    logs: 'لاگ‌ها',
    settings: 'تنظیمات',
    'store-info': 'اطلاعات فروشگاه',
    'purchase-methods': 'روش‌های خرید',
    'payment-online': 'پرداخت آنلاین',
    'payment-cod': 'پرداخت در محل',
    'payment-card': 'کارت به کارت',
    sms: 'پنل پیامک',
    seo: 'تنظیمات SEO',
    'backup-update': 'پشتیبان‌گیری و آپدیت'
  };

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* ── Toast ────────────────────────────────────────────────── */
  var toastRoot = null;

  function ensureToastRoot() {
    if (toastRoot) return toastRoot;
    toastRoot = document.createElement('div');
    toastRoot.className = 'adm-toast-wrap';
    document.body.appendChild(toastRoot);
    return toastRoot;
  }

  function showToast(message, type) {
    var icons = {
      success: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      danger: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      info: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };
    var root = ensureToastRoot();
    var el = document.createElement('div');
    el.className = 'adm-toast adm-toast--' + (type || 'info');
    el.innerHTML =
      '<span class="adm-toast__icon">' + (icons[type || 'info'] || icons.info) + '</span>' +
      '<span class="adm-toast__text">' + message + '</span>';
    root.appendChild(el);
    setTimeout(function () {
      el.classList.add('is-leaving');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }, 2400);
  }

  /* ── Sidebar / view switching ─────────────────────────────── */
  var sidebar = $('.admin-sidebar');
  var overlay = $('.admin-overlay');
  var topbarTitle = $('.admin-topbar__title');
  var navLinks = $$('.admin-nav__link[data-view]');
  var views = {};

  navLinks.forEach(function (link) {
    views[link.getAttribute('data-view')] = $('section[data-view="' + link.getAttribute('data-view') + '"]');
  });
  // Ensure dynamically added settings pages are navigable even without sidebar links.
  $$('section[data-view]').forEach(function (sec) {
    var v = sec.getAttribute('data-view');
    if (v && !views[v]) views[v] = sec;
  });

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('is-open');
    if (overlay) overlay.classList.remove('is-active');
    try { document.body.style.overflow = ''; } catch (_) {}
  }

  function openSidebar() {
    if (sidebar) sidebar.classList.add('is-open');
    if (overlay) overlay.classList.add('is-active');
    try { if (window.innerWidth <= 1024) document.body.style.overflow = 'hidden'; } catch (_) {}
  }
  try {
    window.addEventListener('resize', function () {
      if (window.innerWidth > 1024) closeSidebar();
    });
  } catch (_) {}

  function isValidView(name) {
    return Object.prototype.hasOwnProperty.call(VIEW_TITLES, name);
  }

  /* Payment-method pages are children of the «روش‌های خرید» hub view: they
     have no own sidebar link, so the parent item stays highlighted. */
  var VIEW_PARENT = {
    'payment-online': 'purchase-methods',
    'payment-cod': 'purchase-methods',
    'payment-card': 'purchase-methods'
  };
  /* Same views are part of the "settings" permission scope. */
  var SETTINGS_SUBVIEWS = ['purchase-methods', 'payment-online', 'payment-cod', 'payment-card'];
  /* The view currently on screen (not derivable from the active nav link,
     because child views have no link of their own). */
  var activeViewName = null;

  function normalizeBackupView(name) {
    if (name === 'backup' || name === 'backups' || name === 'backup-update-page') return 'backup-update';
    return name;
  }
  function showView(name) {
    name = normalizeBackupView(name);
    if (!isValidView(name)) name = 'dashboard';
    if (!canAccessView(name)) {
      showToast('دسترسی به این بخش ندارید', 'danger');
      name = 'dashboard';
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#/' + name);
      }
    }
    closeSidebar();
    if (activeViewName === name) return;
    activeViewName = name;
    var navKey = VIEW_PARENT[name] || name;
    navLinks.forEach(function (link) {
      link.classList.toggle('is-active', link.getAttribute('data-view') === navKey);
    });
    Object.keys(views).forEach(function (key) {
      if (views[key]) views[key].classList.toggle('is-active', key === name);
    });
    if (topbarTitle) topbarTitle.textContent = VIEW_TITLES[name];
    /* Sub-navigation of the payment-method pages (links are cloned from the hub). */
    $$('[data-pm-subnav] .adm-pm-subnav__link').forEach(function (link) {
      var target = (link.getAttribute('href') || '').replace(/^#\/?/, '');
      link.classList.toggle('is-active', target === name);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Lazy-load hook for the backup/update page (mirrors the logs pattern).
  var _showViewBase = showView;
  showView = function (name) {
    _showViewBase(name);
    if (name === 'backup-update') {
      setTimeout(function () {
        if (window.CamzyAdminBackup && typeof window.CamzyAdminBackup.load === 'function') {
          window.CamzyAdminBackup.load();
        }
      }, 0);
    }
  };

  /* Route through the public API so per-view lazy-load hooks (bank cards,
     reports, …) keep firing for hash-driven navigation too. */
  function navigate(name) {
    var api = window.CamzyAdmin && window.CamzyAdmin.showView;
    if (api && api !== showView) { api(name); return; }
    showView(name);
  }

  /* ── Hash routing ─────────────────────────────────────────────
     In-page links (e.g. the payment-method hub) are plain anchors
     that only change location.hash. Without this listener the view
     never switched and the page had to be refreshed to see it. */
  window.addEventListener('hashchange', function () {
    var name = (window.location.hash || '').replace(/^#\/?/, '');
    name = normalizeBackupView(name);
    if (!isValidView(name)) return;
    if (name === activeViewName) return;
    navigate(name);
  });

  navLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var name = link.getAttribute('data-view');
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#/' + name);
      }
      navigate(name);
      if (name === 'orders') {
        var firstChip = $('.adm-chip.is-active[data-status]');
        applyOrderFilter(firstChip ? firstChip.getAttribute('data-status') : 'all');
      }
    });
  });

  var overlayEl = document.querySelector('.admin-overlay');
  if (overlayEl) {
    overlayEl.addEventListener('click', closeSidebar);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSidebar();
  });

  var toggler = $('.admin-topbar__toggle');
  if (toggler) toggler.addEventListener('click', openSidebar);

  var sidebarCloser = $('.admin-sidebar__close');
  if (sidebarCloser) sidebarCloser.addEventListener('click', closeSidebar);

  /* ── Initial view from hash ───────────────────────────────── */
  function initialView() {
    var hash = (window.location.hash || '').replace(/^#\/?/, '');
    hash = normalizeBackupView(hash);
    var name = isValidView(hash) ? hash : 'dashboard';
    return canAccessView(name) ? name : 'dashboard';
  }
  showView(initialView());

  /* ── Sidebar permission gating (server is source of truth) ── */
  var myPerms = null;
  function canAccessView(name) {
    if (name === 'dashboard') return true;
    if (!myPerms) return true;
    if (myPerms.sections === 'all') return true;
    if (!Array.isArray(myPerms.sections)) return false;
    if (myPerms.sections.indexOf(name) !== -1) return true;
    // chatbot-messages reuses the settings API, so settings access suffices.
    if (name === 'chatbot-messages' && myPerms.sections.indexOf('settings') !== -1) return true;
    // Payment-method pages live under the settings scope.
    if (SETTINGS_SUBVIEWS.indexOf(name) !== -1 && myPerms.sections.indexOf('settings') !== -1) return true;
    return false;
  }
  function applyPermGating() {
    navLinks.forEach(function (link) {
      var v = link.getAttribute('data-view');
      if (v && v !== 'dashboard' && !canAccessView(v)) link.style.display = 'none';
      else if (v) link.style.display = '';
    });
    var active = $('.admin-nav__link.is-active');
    if (active && !canAccessView(active.getAttribute('data-view'))) showView('dashboard');
  }
  function refreshMyPerms() {
    var t = '';
    try {
      var s = JSON.parse(localStorage.getItem('as_admin_session') || 'null');
      t = (s && s.token) || '';
    } catch (e) {}
    /* Token may be absent for a live cookie-only session (localStorage
       cleared): same-origin fetch sends the HttpOnly cookie and the server
       still authenticates the request, so the call is made either way. */
    fetch('/api/admin/me', t ? { headers: { Authorization: 'Bearer ' + t } } : { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.admin && d.admin.permissions) {
          myPerms = d.admin.permissions;
          try {
            var s2 = JSON.parse(localStorage.getItem('as_admin_session') || 'null');
            if (s2) { s2.admin = d.admin; localStorage.setItem('as_admin_session', JSON.stringify(s2)); }
          } catch (e) {}
          applyPermGating();
        }
      }).catch(function () {});
  }
  refreshMyPerms();
  document.addEventListener('as_admin_auth_change', refreshMyPerms);

  /* ── Greeting / date on dashboard ─────────────────────────── */
  var dateEl = $('#adm-today');
  if (dateEl) {
    try {
      dateEl.textContent = new Intl.DateTimeFormat('fa-IR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(new Date());
    } catch (err) {
      dateEl.textContent = '';
    }
  }

  var hiEl = $('#adm-greeting-hi');
  if (hiEl) {
    var h = new Date().getHours();
    if (h < 12) hiEl.textContent = 'صبح بخیر، مدیر فروشگاه';
    else if (h < 17) hiEl.textContent = 'ظهر بخیر، مدیر فروشگاه';
    else if (h < 21) hiEl.textContent = 'عصر بخیر، مدیر فروشگاه';
    else hiEl.textContent = 'شب بخیر، مدیر فروشگاه';
  }

  /* ── Generic row search ───────────────────────────────────── */
  function bindSearch(inputSel, rowSel, getHaystack) {
    var input = $(inputSel);
    if (!input) return;
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      $$(rowSel).forEach(function (tr) {
        var haystack = (getHaystack(tr) || '').toLowerCase();
        tr.style.display = haystack.indexOf(q) !== -1 ? '' : 'none';
      });
    });
  }

  /* ── Orders ───────────────────────────────────────────────── */
  bindSearch('#adm-orders-search', '#adm-orders-table tbody tr', function (tr) {
    return tr.getAttribute('data-search') || tr.textContent;
  });

  var orderChips = $$('.adm-chip[data-status]');

  function applyOrderFilter(status) {
    var rows = $$('#adm-orders-table tbody tr');
    var shown = 0;
    rows.forEach(function (tr) {
      var match = status === 'all' || tr.getAttribute('data-status') === status;
      tr.style.display = match ? '' : 'none';
      if (match) shown++;
    });
    var meta = $('#adm-orders-count');
    if (meta) meta.textContent = 'نمایش ' + shown.toLocaleString('fa-IR') + ' از کل سفارش‌ها';
  }

  orderChips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      orderChips.forEach(function (c) { c.classList.remove('is-active'); });
      chip.classList.add('is-active');
      applyOrderFilter(chip.getAttribute('data-status'));
    });
  });

  /* ── Products ─────────────────────────────────────────────── */
  bindSearch('#adm-products-search', '#adm-products-table tbody tr', function (tr) {
    return tr.getAttribute('data-search') || tr.textContent;
  });

  var productCatFilter = $('#adm-products-category');
  if (productCatFilter) {
    productCatFilter.addEventListener('change', function () {
      var val = productCatFilter.value;
      $$('#adm-products-table tbody tr').forEach(function (tr) {
        tr.style.display = val === 'all' || tr.getAttribute('data-category') === val ? '' : 'none';
      });
    });
  }

  /* ── Users ────────────────────────────────────────────────── */
  bindSearch('#adm-users-search', '#adm-users-table tbody tr', function (tr) {
    return tr.getAttribute('data-search') || tr.textContent;
  });

  var userRoleFilter = $('#adm-users-role');
  if (userRoleFilter) {
    userRoleFilter.addEventListener('change', function () {
      var val = userRoleFilter.value;
      $$('#adm-users-table tbody tr').forEach(function (tr) {
        tr.style.display = val === 'all' || tr.getAttribute('data-role') === val ? '' : 'none';
      });
    });
  }

  $$('.admin-nav__logout, [data-logout]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (window.confirm('آیا از پنل مدیریت خارج می‌شوید؟')) {
        showToast('در حال خروج از پنل…', 'info');
        var doRedirect = function () { window.location.href = '/login.html'; };
        var p = window.AdminAuth ? window.AdminAuth.logout() : null;
        if (p && p.then) p.then(doRedirect).catch(doRedirect);
        else {
          try { localStorage.removeItem('as_admin_session'); } catch (_) {}
          doRedirect();
        }
      }
    });
  });

  // Row actions are handled by their respective modules (admin-orders/products/users/categories/brands/reviews).
  // No generic DOM-only fallback — every visible row action now persists to the database.

  /* ── Settings forms (real persistence via /api/settings) ─────── */
  function adminToken() {
    try {
      var s = JSON.parse(localStorage.getItem('as_admin_session') || 'null');
      return (s && s.token) || '';
    } catch (e) { return ''; }
  }
  function parseFaNumber(v) {
    var s = String(v == null ? '' : v);
    s = s.replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); })
      .replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); })
      .replace(/[^0-9]/g, '');
    return s;
  }
  function toFaNumber(v) {
    return String(v == null ? '' : v).replace(/[0-9]/g, function (d) {
      return '۰۱۲۳۴۵۶۷۸۹'[+d];
    });
  }
  function groupThousandsFa(v) {
    var digits = parseFaNumber(v) || String(v == null ? '' : v).replace(/[^0-9]/g, '');
    if (!digits) return '';
    return toFaNumber(digits.replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));
  }
  function loadSettings() {
    var forms = $$('form[data-settings-form]');
    if (!forms.length) return;
    fetch('/api/settings', { headers: { Authorization: 'Bearer ' + adminToken() } })
      .catch(function () { return fetch('/api/settings'); })
      .then(function (r) { return r && r.json ? r.json() : {}; })
      .then(function (s) {
        if (!s) return;
        var set = function (id, v) { var el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
        set('s-name', s['store.name']);
        set('s-phone', s['store.phone']);
        set('s-email', s['store.email']);
        set('s-address', s['store.address']);
        set('s-desc', s['store.desc']);
        // Legacy hidden select kept in sync (no UI); visible selector is button/card-based.
        var sel = document.getElementById('s-ship-type');
        if (sel) {
          sel.innerHTML = '';
          var opt = document.createElement('option');
          opt.textContent = s['ship.method'] || '';
          sel.appendChild(opt);
          sel.value = opt.value || opt.text;
        }
        set('s-ship-cost', groupThousandsFa(s['ship.cost']));
        set('s-free-ship', groupThousandsFa(s['ship.free_from']));
        set('s-order-min', groupThousandsFa(s['order.min_amount'] != null ? s['order.min_amount'] : '0'));
        set('s-order-max', groupThousandsFa(s['order.max_amount'] != null ? s['order.max_amount'] : '0'));
        var qMin = document.getElementById('s-qty-min');
        if (qMin && s['order.min_qty'] !== undefined) qMin.value = toFaNumber(String(parseFaNumber(s['order.min_qty']) || '1') || '1');
        var qMax = document.getElementById('s-qty-max');
        if (qMax && s['order.max_qty'] !== undefined) qMax.value = toFaNumber(String(parseFaNumber(s['order.max_qty']) || '0') || '0');
        var purchaseKeys = ['order.allow_guest', 'order.allow_qty_edit', 'order.allow_oos'];
        var purchaseForm = document.getElementById('adm-settings-purchase');
        if (purchaseForm) $$('.adm-switch-row input[type="checkbox"]', purchaseForm).forEach(function (cb, i) {
          if (purchaseKeys[i] !== undefined && s[purchaseKeys[i]] !== undefined) cb.checked = String(s[purchaseKeys[i]]) === '1';
        });
        // Switches by form/row position (no new IDs, no UI redesign).
        var payKeys = ['pay.online', 'pay.cod', 'pay.card'];
        var notifyKeys = ['notify.new_order', 'notify.low_stock', 'notify.weekly'];
        forms[1] && $$('.adm-switch-row input[type="checkbox"]', forms[1]).forEach(function (cb, i) {
          if (payKeys[i] !== undefined && s[payKeys[i]] !== undefined) cb.checked = String(s[payKeys[i]]) === '1';
        });
        forms[2] && $$('.adm-switch-row input[type="checkbox"]', forms[2]).forEach(function (cb, i) {
          if (notifyKeys[i] !== undefined && s[notifyKeys[i]] !== undefined) cb.checked = String(s[notifyKeys[i]]) === '1';
        });
        try { pmApplySettings(s); } catch (_) {}
      }).catch(function () {});
  }
  function collectFormPayload(form, idx) {
    var v = function (id) { var el = document.getElementById(id); return el ? el.value : undefined; };
    var switches = $$('.adm-switch-row input[type="checkbox"]', form).map(function (cb) { return cb.checked ? '1' : '0'; });
    // Centralized identity: store.* is editable ONLY in Admin → اطلاعات فروشگاه
    // (admin-store-info.js). This legacy Settings path must never write them.
    if (idx === 0) return {};
    if (idx === 1) {
      var method = selectedShipMethodName();
      if (!method) { var _sel = document.getElementById('s-ship-type'); method = _sel ? _sel.value : undefined; }
      return { 'ship.method': method, 'ship.cost': parseFaNumber(v('s-ship-cost')), 'ship.free_from': parseFaNumber(v('s-free-ship')), 'pay.online': switches[0], 'pay.cod': switches[1], 'pay.card': switches[2] };
    }
    if (form && form.id === 'adm-settings-purchase') {
      var qMinV = Math.max(1, Math.round(Number(parseFaNumber(v('s-qty-min')) || '1')) || 1);
      var qMaxV = Math.max(0, Math.round(Number(parseFaNumber(v('s-qty-max')) || '0')) || 0);
      return {
        'order.min_amount': String(parseFaNumber(v('s-order-min')) || '0'),
        'order.max_amount': String(parseFaNumber(v('s-order-max')) || '0'),
        'order.min_qty': String(qMinV),
        'order.max_qty': String(qMaxV),
        'order.allow_guest': switches[0], 'order.allow_qty_edit': switches[1], 'order.allow_oos': switches[2]
      };
    }
    if (idx === 3) {
      var qMinV2 = Math.max(1, Math.round(Number(parseFaNumber(v('s-qty-min')) || '1')) || 1);
      var qMaxV2 = Math.max(0, Math.round(Number(parseFaNumber(v('s-qty-max')) || '0')) || 0);
      return {
        'order.min_amount': String(parseFaNumber(v('s-order-min')) || '0'),
        'order.max_amount': String(parseFaNumber(v('s-order-max')) || '0'),
        'order.min_qty': String(qMinV2),
        'order.max_qty': String(qMaxV2),
        'order.allow_guest': switches[0], 'order.allow_qty_edit': switches[1], 'order.allow_oos': switches[2]
      };
    }
    return { 'notify.new_order': switches[0], 'notify.low_stock': switches[1], 'notify.weekly': switches[2] };
  }
  $$('form[data-settings-form]').forEach(function (form, idx) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (idx === 0) {
        showToast('این مقادیر فقط از بخش اطلاعات فروشگاه قابل ویرایش است', 'warning');
        return;
      }
      var payload = collectFormPayload(form, idx);
      Object.keys(payload).forEach(function (k) { if (payload[k] === undefined) delete payload[k]; });
      fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken() },
        body: JSON.stringify(payload),
      }).then(function (res) {
        if (!res.ok) throw new Error('save failed');
        return res.json();
      }).then(function () { showToast('تنظیمات با موفقیت ذخیره شد', 'success'); })
        .catch(function () { showToast('خطا در ذخیره تنظیمات', 'danger'); });
    });
  });
  /* ── Purchase methods: one dedicated editable page (tab) per method ── */
  var PM_METHODS = ['online', 'cod', 'card'];
  function pmField(m, kind) { return document.getElementById('s-pay-' + m + '-' + kind); }
  function pmShowTab(m) {
    $$('#adm-purchase-methods [data-pm-tab]').forEach(function (b) {
      var on = b.getAttribute('data-pm-tab') === m;
      b.classList.toggle('btn-accent', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('#adm-purchase-methods [data-pm-panel]').forEach(function (p) {
      p.hidden = p.getAttribute('data-pm-panel') !== m;
    });
  }
  function pmApplySettings(s) {
    if (!s || !document.getElementById('adm-purchase-methods')) return;
    PM_METHODS.forEach(function (m) {
      var t = pmField(m, 'title'), d = pmField(m, 'desc'), e = pmField(m, 'enabled');
      if (t && s['pay.' + m + '.title'] !== undefined) t.value = s['pay.' + m + '.title'];
      if (d && s['pay.' + m + '.desc'] !== undefined) d.value = s['pay.' + m + '.desc'];
      if (e && s['pay.' + m] !== undefined) e.checked = String(s['pay.' + m]) === '1';
    });
  }
  function pmBindTabs() {
    $$('#adm-purchase-methods [data-pm-tab]').forEach(function (b) {
      b.addEventListener('click', function () { pmShowTab(b.getAttribute('data-pm-tab')); });
    });
    pmShowTab('online');
  }
  function pmBindSaves() {
    $$('#adm-purchase-methods [data-pm-save]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var m = btn.getAttribute('data-pm-save');
        var t = pmField(m, 'title'), d = pmField(m, 'desc'), e = pmField(m, 'enabled');
        if (t && !t.value.trim()) { showToast('عنوان روش الزامی است', 'danger'); t.focus(); return; }
        var payload = {};
        payload['pay.' + m + '.title'] = t ? t.value.trim() : '';
        payload['pay.' + m + '.desc'] = d ? d.value.trim() : '';
        payload['pay.' + m] = e && e.checked ? '1' : '0';
        btn.disabled = true;
        fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken() },
          body: JSON.stringify(payload),
        }).then(function (res) {
          if (!res.ok) throw new Error('save failed');
          return res.json();
        }).then(function (s) {
          pmApplySettings(s);
          loadSettings();
          showToast('تنظیمات با موفقیت ذخیره شد', 'success');
        }).catch(function () { showToast('خطا در ذخیره تنظیمات', 'danger'); })
          .finally(function () { btn.disabled = false; });
      });
    });
  }
  try {
    if (document.getElementById('adm-purchase-methods')) {
      pmBindTabs();
      pmBindSaves();
    }
  } catch (_) {}
  /* ── Shipping methods: button/card selector + CRUD (SQLite-backed) ── */
  var shipMethods = [];
  function adminHeaders() {
    var h = { 'Content-Type': 'application/json' };
    try { h.Authorization = 'Bearer ' + adminToken(); } catch (_) {}
    return h;
  }
  function selectedShipMethodName() {
    var sel = document.querySelector('#ship-method-cards [data-ship-card].is-selected');
    return sel ? sel.getAttribute('data-name') : null;
  }
  function syncHiddenShipSelect() {
    var sel = document.getElementById('s-ship-type');
    var name = selectedShipMethodName();
    if (sel && name) { sel.innerHTML = ''; var o = document.createElement('option'); o.textContent = name; sel.appendChild(o); }
  }
  function fetchShipMethods() {
    return fetch('/api/shipping-methods').then(function (r) { return r.json(); }).then(function (d) {
      shipMethods = Array.isArray(d) ? d : [];
      renderShipCards();
      return shipMethods;
    }).catch(function () { return shipMethods; });
  }
  function renderShipCards() {
    var host = document.getElementById('ship-method-cards');
    var manage = document.getElementById('ship-method-manage');
    if (!host) return;
    host.innerHTML = '';
    shipMethods.forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn' + (m.isDefault ? ' btn-accent is-selected' : '');
      b.setAttribute('data-ship-card', m.id);
      b.setAttribute('data-name', m.name);
      b.style.cssText = 'border:1px solid var(--border-color, #ddd);border-radius:var(--radius-md);padding:8px 12px;cursor:pointer';
      b.textContent = m.name + (m.isDefault ? ' (پیش‌فرض)' : '') + ' — ' + (Number(m.cost) ? toFaNumber(String(m.cost)) + ' تومان' : 'رایگان');
      b.addEventListener('click', function () { setDefaultShipMethod(m.id); });
      host.appendChild(b);
    });
    if (manage) {
      manage.innerHTML = '';
      shipMethods.forEach(function (m) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;border:1px solid var(--border-color-light,#eee);border-radius:var(--radius-lg);padding:6px 8px';
        row.innerHTML = '<strong style="flex:1;min-width:100px">' + m.name + '</strong>' +
          '<span style="font-size:12px;color:var(--text-muted)">' + (m.description || '') + ' — ' + (Number(m.cost) ? groupThousandsFa(String(m.cost)) + ' تومان' : 'رایگان') + '</span>';
        var editBtn = document.createElement('button'); editBtn.type = 'button'; editBtn.className = 'btn'; editBtn.textContent = 'ویرایش';
        editBtn.addEventListener('click', function () {
          var nn = prompt('نام روش ارسال', m.name); if (nn === null) return;
          var dd = prompt('توضیح', m.description || ''); if (dd === null) dd = m.description || '';
          var cc = prompt('هزینه (تومان)', String(m.cost || 0)); if (cc === null) return;
          updateShipMethod(m.id, { name: String(nn).trim(), description: dd, cost: parseFaNumber(cc) });
        });
        var defBtn = document.createElement('button'); defBtn.type = 'button'; defBtn.className = 'btn'; defBtn.textContent = 'پیش‌فرض';
        defBtn.disabled = !!m.isDefault;
        defBtn.addEventListener('click', function () { setDefaultShipMethod(m.id); });
        var delBtn = document.createElement('button'); delBtn.type = 'button'; delBtn.className = 'btn'; delBtn.textContent = 'حذف';
        delBtn.addEventListener('click', function () {
          if (!confirm('حذف روش «' + m.name + '»؟')) return;
          fetch('/api/shipping-methods/' + m.id, { method: 'DELETE', headers: adminHeaders() })
            .then(function (r) { if (!r.ok) throw new Error('delete failed'); return r.json(); })
            .then(function () { fetchShipMethods(); showToast('روش ارسال حذف شد', 'success'); })
            .catch(function () { showToast('خطا در حذف روش ارسال', 'danger'); });
        });
        row.appendChild(editBtn); row.appendChild(defBtn); row.appendChild(delBtn);
        manage.appendChild(row);
      });
    }
    syncHiddenShipSelect();
  }
  function setDefaultShipMethod(id) {
    var m = shipMethods.find(function (x) { return String(x.id) === String(id); });
    if (!m) return;
    fetch('/api/shipping-methods/' + id, { method: 'PUT', headers: adminHeaders(), body: JSON.stringify({ isDefault: true }) })
      .then(function (r) { if (!r.ok) throw new Error('save failed'); return r.json(); })
      .then(function () { return fetchShipMethods(); })
      .then(function () { showToast('روش پیش‌فرض ذخیره شد', 'success'); })
      .catch(function () { showToast('خطا در ذخیره روش پیش‌فرض', 'danger'); });
  }
  function updateShipMethod(id, patch) {
    if (!patch.name) { showToast('نام روش الزامی است', 'danger'); return; }
    fetch('/api/shipping-methods/' + id, { method: 'PUT', headers: adminHeaders(), body: JSON.stringify(patch) })
      .then(function (r) { if (!r.ok) throw new Error('save failed'); return r.json(); })
      .then(function () { return fetchShipMethods(); })
      .then(function () { showToast('روش ارسال ذخیره شد', 'success'); })
      .catch(function () { showToast('خطا در ذخیره روش ارسال', 'danger'); });
  }
  var shipAddBtn = document.getElementById('ship-add-btn');
  if (shipAddBtn) shipAddBtn.addEventListener('click', function () {
    var nEl = document.getElementById('ship-new-name');
    var dEl = document.getElementById('ship-new-desc');
    var cEl = document.getElementById('ship-new-cost');
    var name = nEl ? nEl.value.trim() : '';
    if (!name) { showToast('نام روش الزامی است', 'danger'); return; }
    fetch('/api/shipping-methods', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ name: name, description: dEl ? dEl.value : '', cost: parseFaNumber(cEl ? cEl.value : '0') }) })
      .then(function (r) { if (!r.ok) throw new Error('save failed'); return r.json(); })
      .then(function () { if (nEl) nEl.value = ''; if (dEl) dEl.value = ''; if (cEl) cEl.value = ''; return fetchShipMethods(); })
      .then(function () { showToast('روش ارسال افزوده شد', 'success'); })
      .catch(function () { showToast('خطا در افزودن روش ارسال', 'danger'); });
  });
  fetchShipMethods();
  loadSettings();

  var changePassForm = $('#adm-change-password');
  if (changePassForm) {
    changePassForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var cur = $('#adm-current-pass');
      var pass = $('#adm-new-pass');
      var confirm = $('#adm-confirm-pass');
      if (!cur || !cur.value) { showToast('رمز فعلی را وارد کنید', 'danger'); return; }
      if (!pass || !pass.value) { showToast('رمز جدید را وارد کنید', 'danger'); return; }
      if (pass.value !== confirm.value) { showToast('رمز عبور و تأیید آن یکسان نیستند', 'danger'); return; }
      if (pass.value.length < 8) { showToast('رمز باید حداقل ۸ کاراکتر باشد', 'danger'); return; }
      var h={ 'Content-Type':'application/json' }; try{ var s=JSON.parse(localStorage.getItem('as_admin_session')||'null'); if(s&&s.token) h['Authorization']='Bearer '+s.token; }catch(_){}
      fetch('/api/admin/password',{method:'POST',headers:h,body:JSON.stringify({currentPassword:cur.value,newPassword:pass.value})}).then(function(r){
        return r.json().catch(function(){return {};}).then(function(d){ if(!r.ok) throw new Error((d&&d.error)||'failed'); return d; });
      }).then(function(){ showToast('رمز عبور با موفقیت تغییر کرد','success'); cur.value=''; pass.value=''; confirm.value=''; }).catch(function(err){ showToast(err.message||'خطا در تغییر رمز','danger'); });
    });
  }

  /* ── Topbar search → storefront ───────────────────────────── */
  var topSearch = $('#adm-top-search');
  if (topSearch) {
    topSearch.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var q = topSearch.value.trim();
        window.location.href = '../shop.html' + (q ? '?q=' + encodeURIComponent(q) : '');
      }
    });
  }

  $$('[data-export]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      showToast('خروجی اکسل: این قابلیت در آینده اضافه خواهد شد', 'info');
    });
  });

  // ── Logs ─────────────────────────────────────────────────
  var logsLevel='', logsType='', logsOffset=0, logsLimit=20, logsTotal=0;
  function esc(s){ var d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }
  function loadLogs(){
    var tbody=document.querySelector('#adm-logs-table tbody');
    var meta=document.getElementById('adm-logs-meta');
    if(!tbody) return;
    tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--text-muted)">در حال بارگذاری…</td></tr>';
    var url='/api/admin/logs?limit='+logsLimit+'&offset='+logsOffset+(logsLevel?'&level='+encodeURIComponent(logsLevel):'')+(logsType?'&type='+encodeURIComponent(logsType):'');
    var h={}; try{ var s=JSON.parse(localStorage.getItem('as_admin_session')||'null'); if(s&&s.token) h['Authorization']='Bearer '+s.token; }catch(_){}
    fetch(url,{headers:h}).then(function(r){ return r.json().then(function(j){ return {ok:r.ok,status:r.status,body:j}; }); }).then(function(res){
      if(!res.ok) throw new Error(res.body.error||'failed');
      var items=res.body.items||[]; logsTotal=res.body.total||0;
      if(!items.length){ tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">لاگی یافت نشد.</td></tr>'; }
      else {
        tbody.innerHTML=items.map(function(e){
          var m=e.meta||{}, lvl=String(e.level||'').toUpperCase();
          var badge=lvl==='ERROR'||lvl==='SECURITY'?'adm-badge--danger':lvl==='WARN'?'adm-badge--warning':'adm-badge--info';
          var rid=e.requestId||m.requestId||'—';
          return '<tr><td style="white-space:nowrap;font-size:12px">'+esc(e.timestamp)+'</td><td><span class="adm-badge '+badge+'">'+esc(lvl)+'</span></td><td>'+esc(e.message)+'</td><td style="direction:ltr;text-align:left;font-size:12px">'+esc((m.method||'')+(m.path?' '+m.path:''))+'</td><td>'+esc(m.statusCode!=null?m.statusCode:'—')+'</td><td>'+esc(m.durationMs!=null?m.durationMs+'ms':'—')+'</td><td>'+esc(m.userId||'—')+'</td><td style="font-size:11px;direction:ltr">'+esc(rid)+'</td></tr>';
        }).join('');
      }
      if(meta) meta.textContent='نمایش '+(items.length? (logsOffset+1)+'–'+(logsOffset+items.length):'0')+' از '+logsTotal;
      renderLogsPagination();
    }).catch(function(){ tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:28px;color:#B91C22">خطا در بارگذاری لاگ‌ها</td></tr>'; });
  }
  function renderLogsPagination(){
    var el=document.getElementById('adm-logs-pagination'); if(!el) return; el.innerHTML='';
    var pages=Math.ceil(logsTotal/logsLimit)||1, cur=Math.floor(logsOffset/logsLimit);
    function btn(label, disabled, active, onClick){ var b=document.createElement('button'); b.type='button'; b.className='adm-pagination__btn'+(active?' is-active':''); b.disabled=!!disabled; b.textContent=label; if(onClick) b.addEventListener('click',onClick); return b; }
    el.appendChild(btn('‹', cur===0, false, function(){ logsOffset=Math.max(0,logsOffset-logsLimit); loadLogs(); }));
    for(var i=0;i<pages&&i<7;i++){ (function(i){ el.appendChild(btn(String(i+1),false,i===cur,function(){ logsOffset=i*logsLimit; loadLogs(); })); })(i); }
    el.appendChild(btn('›', cur>=pages-1, false, function(){ logsOffset=Math.min((pages-1)*logsLimit, logsOffset+logsLimit); loadLogs(); }));
  }
  document.addEventListener('click', function(e){
    var chip=e.target.closest('#adm-logs-filters [data-level]');
    if(chip){ document.querySelectorAll('#adm-logs-filters [data-level]').forEach(function(c){c.classList.remove('is-active');}); chip.classList.add('is-active'); logsLevel=chip.getAttribute('data-level')||''; logsOffset=0; loadLogs(); }
    var tchip=e.target.closest('#adm-logs-types [data-type]');
    if(tchip){ document.querySelectorAll('#adm-logs-types [data-type]').forEach(function(c){c.classList.remove('is-active');}); tchip.classList.add('is-active'); logsType=tchip.getAttribute('data-type')||''; logsOffset=0; loadLogs(); }
    if(e.target.closest('#adm-logs-refresh')) loadLogs();
  });
  var logsRawDate=new Date().toISOString().slice(0,10);
  var logsRawType='requests';
  var _origShowView=showView;
  showView=function(name){ _origShowView(name); if(name==='logs'){ loadLogs(); loadLogFiles(); } };
  if((location.hash||'').replace(/^#\/?/,'')==='logs'){ loadLogs(); loadLogFiles(); }

  // ── Raw log file (view/download) ──────────────────────────
  function rawKey(){ return logsRawDate+'|'+logsRawType; }
  function logsAuthHeaders(){ var h={}; try{ var s=JSON.parse(localStorage.getItem('as_admin_session')||'null'); if(s&&s.token) h['Authorization']='Bearer '+s.token; }catch(_){} return h; }
  function loadLogFileInfo(){
    var el=document.getElementById('adm-logs-raw-path'); if(!el) return;
    if(!logsRawDate){ el.textContent='—'; el.classList.remove('is-missing'); return; }
    fetch('/api/admin/logs/file?date='+encodeURIComponent(logsRawDate)+'&type='+encodeURIComponent(logsRawType),{headers:logsAuthHeaders()}).then(function(r){ return r.json().then(function(j){ return {ok:r.ok,body:j}; }); }).then(function(res){
      if(res.ok && res.body && res.body.path){ el.textContent=res.body.path; el.classList.toggle('is-missing',res.body.exists===false); }
      else { el.textContent='server/logs/'+logsRawDate+'-'+logsRawType+'.log'; el.classList.toggle('is-missing',true); }
    }).catch(function(){ el.textContent='server/logs/'+logsRawDate+'-'+logsRawType+'.log'; el.classList.toggle('is-missing',true); });
  }
  function loadLogFiles(){
    var sel=document.getElementById('adm-logs-raw-file'); if(!sel) return;
    sel.innerHTML='';
    fetch('/api/admin/logs/files',{headers:logsAuthHeaders()}).then(function(r){ return r.json().then(function(j){ return {ok:r.ok,body:j}; }); }).then(function(res){
      var files=(res.ok&&res.body&&res.body.files)?res.body.files:[];
      if(!files.length){
        var no=document.createElement('option'); no.value=''; no.textContent='فایلی یافت نشد'; sel.appendChild(no); sel.disabled=true;
        logsRawDate=''; loadLogFileInfo();
        return;
      }
      sel.disabled=false;
      files.forEach(function(f){
        var o=document.createElement('option'); o.value=f.date+'|'+f.type; o.textContent=f.date+' — '+f.fileName; sel.appendChild(o);
      });
      if(!files.some(function(f){ return f.date===logsRawDate && f.type===logsRawType; })){
        logsRawDate=files[0]?files[0].date:'';
        logsRawType=files[0]?files[0].type:'requests';
      }
      if(logsRawDate) sel.value=rawKey();
      loadLogFileInfo();
    }).catch(function(){
      var err=document.createElement('option'); err.value=''; err.textContent='خطا در دریافت فایل‌ها'; sel.appendChild(err); sel.disabled=true;
    });
  }
  function openRawLog(download){
    if(!logsRawDate){ showToast('فایلی از فهرست لاگ انتخاب نشده است','danger'); return; }
    var pre=document.getElementById('adm-logs-raw-content');
    if(download){
      fetch('/api/admin/logs/raw?date='+encodeURIComponent(logsRawDate)+'&type='+encodeURIComponent(logsRawType)+'&download=1',{headers:logsAuthHeaders()}).then(function(r){ if(!r.ok) throw new Error('not ok'); return r.blob(); }).then(function(blob){
        var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=logsRawDate+'-'+logsRawType+'.log'; document.body.appendChild(a); a.click();
        setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },1000);
      }).catch(function(){ showToast('خطا در دانلود فایل لاگ؛ احتمالاً فایلی برای این روز وجود ندارد','danger'); });
      return;
    }
    var modal=document.getElementById('adm-logs-raw-modal'); if(!modal) return;
    var title=document.getElementById('adm-rawlog-title');
    title.textContent='لاگ خام — '+logsRawDate+'-'+logsRawType+'.log';
    pre.textContent='در حال بارگذاری…';
    modal.classList.add('is-open'); modal.setAttribute('aria-hidden','false');
    fetch('/api/admin/logs/raw?date='+encodeURIComponent(logsRawDate)+'&type='+encodeURIComponent(logsRawType),{headers:logsAuthHeaders()}).then(function(r){ return r.text().then(function(t){ return {ok:r.ok,text:t}; }); }).then(function(res){
      if(!res.ok) pre.textContent='فایلی برای این روز وجود ندارد: '+logsRawDate+'-'+logsRawType+'.log';
      else if(!res.text.trim()) pre.textContent='(فایل خالی است)';
      else pre.textContent=res.text;
    }).catch(function(){ pre.textContent='خطا در دریافت فایل لاگ'; });
  }
  function closeRawLogModal(){ var m=document.getElementById('adm-logs-raw-modal'); if(m){ m.classList.remove('is-open'); m.setAttribute('aria-hidden','true'); } }
  var rawFileEl=document.getElementById('adm-logs-raw-file');
  if(rawFileEl){ rawFileEl.addEventListener('change',function(){ var v=rawFileEl.value||''; var parts=v.split('|'); logsRawDate=parts[0]||''; logsRawType=parts[1]||'requests'; loadLogFileInfo(); }); }
  document.addEventListener('click', function(e){
    if(e.target.closest('[data-rawlog-close]')){ closeRawLogModal(); return; }
    if(e.target.closest('#adm-logs-raw-view')){ openRawLog(false); return; }
    if(e.target.closest('#adm-logs-raw-download')){ openRawLog(true); return; }
  });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeRawLogModal(); });

  // ── Auto polling (no reload, preserve filters/modals) ──
  var pollTimer=null;
  function currentView(){ return (location.hash||'').replace(/^#\/?/,'')||'dashboard'; }
  function pollVisible(){
    var v=currentView();
    try{
      if(v==='tickets' && window.CamzyAdminTickets && window.CamzyAdminTickets.reload) {
        // if modal open, refresh detail silently; else refresh list
        var modal=document.getElementById('adm-ticket-modal');
        var isOpen=modal && modal.classList.contains('is-open');
        if(isOpen && window.CamzyAdminTickets.reloadDetail) window.CamzyAdminTickets.reloadDetail(true);
        else window.CamzyAdminTickets.reload();
      } else if(v==='orders' && window.CamzyAdminOrders && window.CamzyAdminOrders.reload) window.CamzyAdminOrders.reload(true);
      else if(v==='users' && window.CamzyAdminUsers && window.CamzyAdminUsers.reload) window.CamzyAdminUsers.reload(true);
      else if(v==='products' && window.CamzyAdminProducts && window.CamzyAdminProducts.reload) window.CamzyAdminProducts.reload(true);
      else if(v==='contact-messages' && window.CamzyAdminContactMessages && window.CamzyAdminContactMessages.reload) window.CamzyAdminContactMessages.reload();
      else if(v==='reviews' && window.CamzyAdminReviews && window.CamzyAdminReviews.reload) window.CamzyAdminReviews.reload(true);
      else if(v==='notifications' && window.CamzyAdminNotifications && window.CamzyAdminNotifications.reload) window.CamzyAdminNotifications.reload(true);
      else if(v==='transactions' && window.CamzyAdminTransactions && window.CamzyAdminTransactions.reload) window.CamzyAdminTransactions.reload(true);
    }catch(_){}
  }
  function startPoll(){ if(pollTimer) return; pollTimer=setInterval(pollVisible, 7000); }
  function stopPoll(){ if(pollTimer){ clearInterval(pollTimer); pollTimer=null; } }
  startPoll();
  document.addEventListener('visibilitychange', function(){ if(document.hidden) stopPoll(); else startPoll(); });

  window.CamzyAdmin = {
    showToast: showToast,
    showView: showView,
    closeSidebar: closeSidebar
  };
})();
