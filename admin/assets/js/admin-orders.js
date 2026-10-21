/* ================================================================
   Camzy — Admin Orders (SQLite backend via REST API)
     GET   /api/orders      — all orders (with customer + items)
     GET   /api/orders/:id  — single order details
     PATCH /api/orders/:id  — change order status
   No browser storage, no demo data. Renders into the existing UI.
   ================================================================ */
(function () {
  'use strict';

  var TABLE_BODY_SEL = '#adm-orders-table tbody';
  var SEARCH_SEL = '#adm-orders-search';
  var COUNT_SEL = '#adm-orders-count';
  var CHIP_SEL = '.admin-view[data-view="orders"] .adm-chip[data-status]';

  var STATUS_META = {
    pending:    { text: 'در انتظار پرداخت', badge: 'adm-badge--warning' },
    awaiting_payment_approval: { text: 'در انتظار تأیید پرداخت', badge: 'adm-badge--warning' },
    awaiting_order_approval:   { text: 'در انتظار تأیید سفارش',   badge: 'adm-badge--warning' },
    approved:   { text: 'تأیید شد / آماده ارسال', badge: 'adm-badge--success' },
    processing: { text: 'در حال پردازش',    badge: 'adm-badge--primary' },
    shipping:   { text: 'ارسال‌شده',         badge: 'adm-badge--info' },
    shipped:    { text: 'ارسال‌شده',         badge: 'adm-badge--info' },
    delivered:  { text: 'تحویل‌شده',         badge: 'adm-badge--success' },
    cancelled:  { text: 'لغوشده',            badge: 'adm-badge--danger' }
  };
  var APPROVAL_STATUSES = ['awaiting_payment_approval', 'awaiting_order_approval'];

  var PAGE_SIZE = 20;
  var state = { orders: [], status: 'all', query: '', loading: true, error: false, page: 1 };

  /* ── helpers ─────────────────────────────────────────────── */
  var API = (function () {
    try { return new URL('/api/', window.location.href).toString().replace(/\/$/, ''); }
    catch (e) { return '/api'; }
  })();
  function tok() { try { var s = JSON.parse(localStorage.getItem('as_admin_session') || 'null'); return (s && s.token) || ''; } catch (e) { return ''; } }
  function api(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    var t = tok();
    if (t && !opts.headers['Authorization']) opts.headers['Authorization'] = 'Bearer ' + t;
    if (opts.body && !opts.headers['Content-Type']) opts.headers['Content-Type'] = 'application/json';
    return fetch(API + path, opts).then(function (res) {
      if (!res.ok) throw new Error('API ' + res.status);
      return res.json();
    });
  }
  function toast(msg, type) {
    if (window.CamzyAdmin) window.CamzyAdmin.showToast(msg, type);
  }
  function faNum(n) { return Number(n || 0).toLocaleString('fa-IR'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function normStatus(s) {
    s = String(s || 'pending').toLowerCase();
    if (s === 'shipping') return 'shipped';
    return STATUS_META[s] ? s : 'pending';
  }
  function customerName(c) {
    if (!c) return 'مشتری';
    var n = ((c.firstName || '') + ' ' + (c.lastName || '')).trim();
    return n || c.mobile || c.email || 'مشتری';
  }

  function toView(o) {
    o = o || {};
    var st = normStatus(o.status);
    var items = o.items || [];
    var subtotal = items.reduce(function (s, it) {
      return s + Number(it.price || 0) * Number(it.quantity || 0);
    }, 0);
    return {
      id: o.id || '—',
      userId: o.userId || null,
      date: o.date || '—',
      status: st,
      statusText: STATUS_META[st].text,
      customer: customerName(o.customer),
      mobile: (o.customer && o.customer.mobile) || '',
      email: (o.customer && o.customer.email) || '',
      address: o.address || '—',
      paymentMethod: o.paymentMethod || o.payment_method || '—',
      items: items,
      itemsCount: o.itemsCount != null ? o.itemsCount :
        items.reduce(function (s, it) { return s + Number(it.quantity || 0); }, 0),
      subtotal: subtotal,
      shipping: Number(o.shipping || 0),
      discount: Number(o.discount || 0),
      total: Number(o.total != null ? o.total : subtotal + Number(o.shipping || 0) - Number(o.discount || 0))
    };
  }

  /* ── API: real database via REST ──────────────────────────── */
  function loadAllOrders() {
    return api('/orders').then(function (list) {
      return (list || []).map(toView);
    });
  }

  function loadOrderDetails(id) {
    return api('/orders/' + encodeURIComponent(id)).then(toView);
  }

  function saveStatus(order, newStatus) {
    newStatus = normStatus(newStatus);
    return api('/orders/' + encodeURIComponent(order.id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, statusText: STATUS_META[newStatus].text })
    }).then(function (updated) { return toView(updated); });
  }

  function approveOrder(order) {
    return api('/orders/' + encodeURIComponent(order.id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved', statusText: STATUS_META.approved.text })
    }).then(function (updated) { return toView(updated); });
  }

  /* ── rendering (existing UI classes only) ────────────────── */
  function filtered() {
    var q = state.query.trim().toLowerCase();
    return state.orders.filter(function (o) {
      if (state.status !== 'all' && o.status !== state.status) return false;
      if (!q) return true;
      return (o.id + ' ' + o.customer + ' ' + o.mobile).toLowerCase().indexOf(q) !== -1;
    });
  }

  function rowHtml(o) {
    var meta = STATUS_META[o.status];
    var avatar = esc((o.customer || 'م').trim().charAt(0) || 'م');
    return '<tr data-status="' + o.status + '">' +
      '<td><span class="adm-order-id">' + esc(o.id) + '</span></td>' +
      '<td><span class="adm-user"><span class="adm-user__avatar">' + avatar + '</span>' +
      '<span class="adm-user__name">' + esc(o.customer) + '</span></span></td>' +
      '<td>' + esc(o.date) + '</td>' +
      '<td>' + faNum(o.itemsCount) + ' قلم</td>' +
      '<td>' + faNum(o.total) + '</td>' +
      '<td>' + esc(o.paymentMethod) + '</td>' +
      '<td><span class="adm-badge ' + meta.badge + '">' + meta.text + '</span></td>' +
      '<td><div class="adm-table__cell-actions">' +
      '<button type="button" class="adm-btn-icon" data-order-view="' + esc(o.id) + '" title="مشاهده">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
      '</button></div></td></tr>';
  }

  function render() {
    var tbody = document.querySelector(TABLE_BODY_SEL);
    if (!tbody) return;
    var rows = filtered();
    if (state.error) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--text-muted)">خطا در دریافت سفارش‌ها از سرور. <button type="button" class="btn btn-secondary btn-sm" data-orders-retry>تلاش مجدد</button></td></tr>';
      var retry = tbody.querySelector('[data-orders-retry]');
      if (retry) retry.addEventListener('click', refresh);
    } else if (state.loading) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--text-muted)">در حال دریافت سفارش‌ها…</td></tr>';
    } else if (!state.orders.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--text-muted)">هنوز هیچ سفارشی از فروشگاه ثبت نشده است.</td></tr>';
    } else if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--text-muted)">سفارشی با این مشخصات یافت نشد.</td></tr>';
    } else {
      var pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      if (state.page > pages) state.page = pages;
      if (state.page < 1) state.page = 1;
      var start = (state.page - 1) * PAGE_SIZE;
      var pageRows = rows.slice(start, start + PAGE_SIZE);
      tbody.innerHTML = pageRows.map(rowHtml).join('');
    }
    var metaEl = document.querySelector(COUNT_SEL);
    if (metaEl) {
      var _pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      if (state.page > _pages) state.page = _pages;
      if (state.page < 1) state.page = 1;
      var _start = (state.page - 1) * PAGE_SIZE;
      var _pageRows = rows.slice(_start, _start + PAGE_SIZE);
      metaEl.textContent = 'نمایش ' + faNum(_pageRows.length) + ' از ' + faNum(rows.length) + ' سفارش';
    }
    renderChips();
    bindViewButtons();
    renderOrdersPagination();
  }

  function renderOrdersPagination() {
    var el = document.getElementById('adm-orders-pagination');
    if (!el) return;
    var rows = filtered();
    var pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    if (pages <= 1) { el.innerHTML = ''; return; }
    var nums = [];
    [1, 2, state.page - 1, state.page, state.page + 1, pages - 1, pages].forEach(function (p) {
      if (p >= 1 && p <= pages && nums.indexOf(p) === -1) nums.push(p);
    });
    nums.sort(function (a, b) { return a - b; });
    var html = '<button type="button" class="adm-pagination__btn" data-opage="prev"' + (state.page <= 1 ? ' disabled' : '') + ' aria-label="صفحه قبل">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg></button>';
    var prev = 0;
    nums.forEach(function (p) {
      if (p - prev > 1) html += '<button type="button" class="adm-pagination__btn" disabled>…</button>';
      html += '<button type="button" class="adm-pagination__btn' + (p === state.page ? ' is-active' : '') + '" data-opage="' + p + '">' + faNum(p) + '</button>';
      prev = p;
    });
    html += '<button type="button" class="adm-pagination__btn" data-opage="next"' + (state.page >= pages ? ' disabled' : '') + ' aria-label="صفحه بعد">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 6 9 12 15 18"/></svg></button>';
    el.innerHTML = html;
  }

  function renderChips() {
    var counts = { all: state.orders.length, pending: 0, awaiting_payment_approval: 0, awaiting_order_approval: 0, approved: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 };
    state.orders.forEach(function (o) { if (counts[o.status] != null) counts[o.status]++; });
    Array.prototype.forEach.call(document.querySelectorAll(CHIP_SEL), function (chip) {
      var st = chip.getAttribute('data-status');
      var c = chip.querySelector('.adm-chip__count');
      if (c && counts[st] != null) c.textContent = faNum(counts[st]);
      chip.classList.toggle('is-active', st === state.status);
    });
    var badge = document.querySelector('.admin-nav__link[data-view="orders"] .admin-nav__badge');
    if (badge) badge.textContent = faNum(state.orders.length);
  }

  /* ── details modal (reuses .adm-modal styles) ────────────── */
  function modal() { return document.getElementById('adm-order-modal'); }

  function openDetails(orderId) {
    var m = modal();
    if (!m) return;
    // Show fresh details from the database (items, totals, customer).
    m.querySelector('#adm-om-title').textContent = 'سفارش ' + orderId;
    m.querySelector('#adm-om-body').innerHTML =
      '<p style="font-size:13px;color:var(--text-muted);text-align:center;padding:20px">در حال دریافت جزئیات…</p>';
    m.classList.add('is-open');
    m.setAttribute('aria-hidden', 'false');
    loadOrderDetails(orderId).then(function (o) {
      var idx = -1;
      state.orders.forEach(function (x, i) { if (x.id === orderId) idx = i; });
      if (idx !== -1) { state.orders[idx] = o; render(); }
      fillDetails(m, o);
    }).catch(function () {
      m.querySelector('#adm-om-body').innerHTML =
        '<p style="font-size:13px;color:var(--text-muted);text-align:center;padding:20px">خطا در دریافت جزئیات سفارش.</p>';
    });
  }

  function fillDetails(m, o) {
    var meta = STATUS_META[o.status];
    var items = o.items.length ? o.items.map(function (it) {
      var optionsHtml = '';
      if (it.options && it.options.length) {
        optionsHtml = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">' +
          it.options.map(function(opt) {
            return '<span>• ' + esc(opt.title) + ': ' + faNum(opt.price) + ' تومان</span>';
          }).join('<br>') +
        '</div>';
      }
      return '<div style="display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px dashed var(--border-color-light);font-size:13px">' +
        '<span>' + esc(it.name) + ' <span style="color:var(--text-muted)">× ' + faNum(it.quantity) + '</span>' + optionsHtml + '</span>' +
        '<span style="font-weight:600">' + faNum(Number(it.price) * Number(it.quantity)) + '</span></div>';
    }).join('') : '<p style="font-size:13px;color:var(--text-muted)">قلم کالایی ثبت نشده است.</p>';

    m.querySelector('#adm-om-title').textContent = 'سفارش ' + o.id;
    m.querySelector('#adm-om-body').innerHTML =
      '<div style="display:grid;gap:12px;font-size:13px">' +
      '<div><strong>مشتری:</strong> ' + esc(o.customer) +
      (o.mobile ? ' — <span dir="ltr">' + esc(o.mobile) + '</span>' : '') +
      (o.email ? ' — <span dir="ltr">' + esc(o.email) + '</span>' : '') + '</div>' +
      '<div><strong>آدرس:</strong> ' + esc(o.address) + '</div>' +
      '<div><strong>تاریخ:</strong> ' + esc(o.date) + ' &nbsp; <strong>پرداخت:</strong> ' + esc(o.paymentMethod) +
      ' &nbsp; <span class="adm-badge ' + meta.badge + '">' + meta.text + '</span></div>' +
      '<div><strong>اقلام:</strong>' + items + '</div>' +
      '<div style="background:var(--color-gray-100);border-radius:var(--radius-lg);padding:10px 12px;display:grid;gap:6px">' +
      '<div style="display:flex;justify-content:space-between"><span>جمع اقلام</span><span>' + faNum(o.subtotal) + ' تومان</span></div>' +
      '<div style="display:flex;justify-content:space-between"><span>هزینه ارسال</span><span>' + (o.shipping ? faNum(o.shipping) + ' تومان' : 'رایگان') + '</span></div>' +
      '<div style="display:flex;justify-content:space-between"><span>تخفیف' + (o.discountCode ? ' (' + esc(o.discountCode) + ')' : '') + '</span><span>' + faNum(o.discount) + ' تومان</span></div>' +
      '<div style="display:flex;justify-content:space-between;font-weight:700"><span>مبلغ نهایی</span><span>' + faNum(o.total) + ' تومان</span></div>' +
      '</div>' +
      '<label style="display:flex;align-items:center;gap:8px"><strong>تغییر وضعیت:</strong>' +
      '<select class="input" id="adm-om-status" style="flex:1">' +
      Object.keys(STATUS_META).filter(function (k) { return k !== 'shipping'; }).map(function (k) {
        return '<option value="' + k + '"' + (k === o.status ? ' selected' : '') + '>' + STATUS_META[k].text + '</option>';
      }).join('') + '</select></label>' +
      (APPROVAL_STATUSES.indexOf(o.status) !== -1
        ? '<button type="button" class="btn btn-primary" id="adm-om-approve" style="width:100%;margin-top:4px">تأیید و آماده‌سازی ارسال</button>'
        : '') +
      '</div>';

    m.querySelector('#adm-om-status').addEventListener('change', function () {
      var sel = this;
      sel.disabled = true;
      saveStatus(o, sel.value).then(function (updated) {
        var idx = -1;
        state.orders.forEach(function (x, i) { if (x.id === updated.id) idx = i; });
        if (idx !== -1) state.orders[idx] = updated;
        render();
        fillDetails(m, updated);
        toast('وضعیت سفارش به‌روزرسانی شد', 'success');
      }).catch(function () {
        sel.disabled = false;
        sel.value = o.status;
        toast('خطا در به‌روزرسانی وضعیت سفارش', 'danger');
      });
    });

    var approveBtn = m.querySelector('#adm-om-approve');
    if (approveBtn) {
      approveBtn.addEventListener('click', function () {
        approveBtn.disabled = true;
        approveOrder(o).then(function (updated) {
          var idx = -1;
          state.orders.forEach(function (x, i) { if (x.id === updated.id) idx = i; });
          if (idx !== -1) state.orders[idx] = updated;
          render();
          fillDetails(m, updated);
          toast('سفارش تأیید شد و آماده ارسال است', 'success');
        }).catch(function () {
          approveBtn.disabled = false;
          toast('خطا در تأیید سفارش', 'danger');
        });
      });
    }
  }

  function closeDetails() {
    var m = modal();
    if (!m) return;
    m.classList.remove('is-open');
    m.setAttribute('aria-hidden', 'true');
  }

  function bindViewButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-order-view]'), function (btn) {
      // avoid double-binding after re-render (fresh nodes, but guard anyway)
      if (btn.__bound) return;
      btn.__bound = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openDetails(btn.getAttribute('data-order-view'));
      });
    });
  }

  /* ── take over search + filter (detach demo handlers) ────── */
  function takeOverControls() {
    var search = document.querySelector(SEARCH_SEL);
    if (search) {
      var fresh = search.cloneNode(true);
      search.parentNode.replaceChild(fresh, search);
      fresh.addEventListener('input', function () { state.query = fresh.value; state.page = 1; render(); });
    }
    Array.prototype.forEach.call(document.querySelectorAll(CHIP_SEL), function (chip) {
      var fresh = chip.cloneNode(true);
      chip.parentNode.replaceChild(fresh, chip);
      fresh.addEventListener('click', function () { state.status = fresh.getAttribute('data-status'); state.page = 1; render(); });
    });
  }

  function bindModalClose() {
    var m = modal();
    if (!m) return;
    Array.prototype.forEach.call(m.querySelectorAll('[data-om-close]'), function (b) {
      b.addEventListener('click', closeDetails);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetails(); });
  }

  function refresh() {
    state.loading = true;
    state.error = false;
    render();
    return loadAllOrders().then(function (orders) {
      state.orders = orders;
      state.page = 1;
      state.loading = false;
      render();
    }).catch(function () {
      state.loading = false;
      state.error = true;
      render();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    takeOverControls();
    bindModalClose();
    var pag = document.getElementById('adm-orders-pagination');
    if (pag) pag.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-opage]') : null;
      if (!btn || btn.disabled) return;
      var v = btn.getAttribute('data-opage');
      var rows = filtered();
      var pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      if (v === 'prev') { if (state.page > 1) state.page--; else return; }
      else if (v === 'next') { if (state.page < pages) state.page++; else return; }
      else {
        var n = parseInt(v, 10);
        if (!isNaN(n) && n >= 1 && n <= pages) state.page = n;
        else return;
      }
      render();
    });
    refresh();
  });

  window.CamzyOrders = { refresh: refresh, loadAll: loadAllOrders, loadOne: loadOrderDetails };
})();
