/* ================================================================
   Camzy — Admin Transactions (تراکنش‌ها و پرداخت‌ها)
   Read-only view over existing orders/payment data (no duplicate
   payment records): transaction list, search (transaction ID,
   order ID, user mobile), status + method + date-range filters,
   full detail with order/customer links, refund status,
   filtered total-amount summary, pagination.
   ================================================================ */
(function () {
  'use strict';
  var sec = document.querySelector('section[data-view="transactions"]');
  if (!sec) return;
  var tbody = sec.querySelector('#adm-tx-table tbody');
  if (!tbody) return;

  var PAGE_SIZE = 20;
  var STATUS = {
    pending: { name: 'در انتظار', cls: 'adm-badge--warning' },
    successful: { name: 'موفق', cls: 'adm-badge--success' },
    failed: { name: 'ناموفق', cls: 'adm-badge--danger' },
    refunded: { name: 'مستردشده', cls: 'adm-badge--info' }
  };
  var METHOD = {
    online: 'آنلاین',
    cod: 'پرداخت در محل',
    card: 'کارت به کارت'
  };

  var searchInput = sec.querySelector('#adm-tx-search');
  var statusFilter = sec.querySelector('#adm-tx-status');
  var methodFilter = sec.querySelector('#adm-tx-method');
  var fromInput = sec.querySelector('#adm-tx-from');
  var toInput = sec.querySelector('#adm-tx-to');
  var pagination = sec.querySelector('#adm-tx-pagination');
  var metaEl = sec.querySelector('.adm-table-footer__meta');
  var sumCount = sec.querySelector('#adm-tx-sum-count');
  var sumAmount = sec.querySelector('#adm-tx-sum-amount');

  var state = { items: [], total: 0, summary: null, page: 1, q: '', status: 'all', method: 'all', from: '', to: '' };
  var debounce = null;

  function $(s, c) { return (c || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toast(m, t) { if (window.CamzyAdmin && window.CamzyAdmin.showToast) window.CamzyAdmin.showToast(m, t); }
  function fa(n) { try { return Number(n || 0).toLocaleString('fa-IR'); } catch (e) { return String(n); } }
  function tok() { try { var s = JSON.parse(localStorage.getItem('as_admin_session') || 'null'); return (s && s.token) || ''; } catch (e) { return ''; } }
  function api(path, opts) {
    var h = { 'Content-Type': 'application/json' };
    var t = tok();
    if (t) h['Authorization'] = 'Bearer ' + t;
    var m = Object.assign({ headers: h }, opts || {});
    if (opts && opts.headers) m.headers = Object.assign({}, h, opts.headers);
    return fetch('/api' + path, m).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || ('Request failed ' + res.status));
        return data;
      });
    });
  }
  function isHttp() { try { return window.location.protocol.indexOf('http') === 0; } catch (e) { return false; } }
  function fmtDT(v) {
    if (!v) return '—';
    try {
      var d = new Date(String(v).replace(' ', 'T'));
      if (isFinite(d.getTime())) return d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {}
    return String(v);
  }
  function statusBadge(s) { var m = STATUS[s] || STATUS.pending; return '<span class="adm-badge ' + m.cls + '">' + m.name + '</span>'; }
  function pageCount() { return Math.max(1, Math.ceil(state.total / PAGE_SIZE)); }
  function goView(name) {
    try {
      if (window.CamzyAdmin && window.CamzyAdmin.showView) { window.CamzyAdmin.showView(name); return; }
      var link = document.querySelector('.admin-nav__link[data-view="' + name + '"]');
      if (link) link.click();
    } catch (e) {}
  }

  function load() {
    if (!isHttp()) { toast('برای مشاهده تراکنش‌ها، پنل را از طریق سرور باز کنید', 'danger'); return; }
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-muted)">در حال بارگذاری…</td></tr>';
    var parts = ['limit=' + PAGE_SIZE, 'offset=' + ((state.page - 1) * PAGE_SIZE)];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.status !== 'all') parts.push('status=' + encodeURIComponent(state.status));
    if (state.method !== 'all') parts.push('method=' + encodeURIComponent(state.method));
    if (state.from) parts.push('dateFrom=' + encodeURIComponent(state.from));
    if (state.to) parts.push('dateTo=' + encodeURIComponent(state.to));
    api('/admin/transactions?' + parts.join('&')).then(function (data) {
      state.items = (data && data.items) || [];
      state.total = (data && data.total) || 0;
      state.summary = (data && data.summary) || null;
      if (state.page > pageCount() && state.total > 0) { state.page = pageCount(); load(); return; }
      render();
    }).catch(function (err) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-muted)">خطا: ' + esc(err.message || '') + '</td></tr>';
    });
  }

  function render() {
    if (!state.items.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--color-text-muted-dark)">تراکنشی یافت نشد.</td></tr>';
    } else {
      tbody.innerHTML = state.items.map(function (t) {
        return '<tr data-id="' + esc(t.orderId) + '">'
          + '<td><span class="adm-order-id" dir="ltr">' + esc(t.id) + '</span></td>'
          + '<td><span class="adm-order-id">' + esc(t.orderId) + '</span></td>'
          + '<td>' + esc(t.userName || '—') + '<div class="adm-table__sub" style="direction:ltr">' + esc(t.userMobile || '') + '</div></td>'
          + '<td>' + fa(t.amount) + ' <span class="adm-table__sub">تومان</span><div class="adm-table__sub">' + esc(METHOD[t.method] || t.method) + '</div></td>'
          + '<td>' + statusBadge(t.status) + '</td>'
          + '<td>' + esc(fmtDT(t.paidAt || t.createdAt)) + '</td>'
          + '<td><div class="adm-table__cell-actions">'
          + '<button type="button" class="adm-btn-icon" data-xview="' + esc(t.orderId) + '" title="جزئیات"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>'
          + '</div></td></tr>';
      }).join('');
    }
    if (metaEl) {
      var from = state.total === 0 ? 0 : (state.page - 1) * PAGE_SIZE + 1;
      metaEl.textContent = 'نمایش ' + fa(from) + ' تا ' + fa(Math.min(state.page * PAGE_SIZE, state.total)) + ' از ' + fa(state.total) + ' تراکنش';
    }
    if (sumCount) sumCount.textContent = fa(state.summary ? state.summary.count : 0) + ' تراکنش';
    if (sumAmount) sumAmount.textContent = fa(state.summary ? state.summary.totalAmount : 0) + ' تومان';
    renderPagination();
  }

  function renderPagination() {
    if (!pagination) return;
    var pages = pageCount();
    if (pages <= 1) { pagination.innerHTML = ''; return; }
    var nums = [];
    [1, 2, state.page - 1, state.page, state.page + 1, pages - 1, pages].forEach(function (p) {
      if (p >= 1 && p <= pages && nums.indexOf(p) === -1) nums.push(p);
    });
    nums.sort(function (a, b) { return a - b; });
    var html = '<button type="button" class="adm-pagination__btn" data-xpage="prev"' + (state.page <= 1 ? ' disabled' : '') + ' aria-label="صفحه قبل">'
      + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg></button>';
    var prev = 0;
    nums.forEach(function (p) {
      if (p - prev > 1) html += '<button type="button" class="adm-pagination__btn" disabled>…</button>';
      html += '<button type="button" class="adm-pagination__btn' + (p === state.page ? ' is-active' : '') + '" data-xpage="' + p + '">' + fa(p) + '</button>';
      prev = p;
    });
    html += '<button type="button" class="adm-pagination__btn" data-xpage="next"' + (state.page >= pages ? ' disabled' : '') + ' aria-label="صفحه بعد">'
      + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 6 9 12 15 18"/></svg></button>';
    pagination.innerHTML = html;
  }

  /* ── Detail ───────────────────────────────────────────── */
  function openModal(m) { if (m) { m.classList.add('is-open'); m.setAttribute('aria-hidden', 'false'); } }
  function closeModal(m) { if (m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); } }

  function openDetail(orderId) {
    var m = document.getElementById('adm-tx-modal');
    if (!m) return;
    m.querySelector('#adm-tx-body').innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-muted)">در حال بارگذاری…</p>';
    openModal(m);
    api('/admin/transactions/' + encodeURIComponent(orderId)).then(function (d) {
      var o = d.order || {};
      var items = (o.items || []).map(function (it) {
        return '<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px dashed var(--border-color-light)"><span>' + esc(it.name || it.productId) + ' × ' + fa(it.quantity) + '</span><span>' + fa(it.price) + ' تومان</span></div>';
      }).join('') || '<p style="font-size:12px;color:var(--text-muted)">بدون قلم</p>';
      var events = (d.events || []).map(function (ev) {
        return '<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px dashed var(--border-color-light)"><span>' + esc(ev.event) + (ev.detail ? ' — ' + esc(String(ev.detail).slice(0, 80)) : '') + '</span><span style="color:var(--text-muted)">' + esc(fmtDT(ev.created_at)) + '</span></div>';
      }).join('') || '<p style="font-size:12px;color:var(--text-muted)">رویدادی ثبت نشده</p>';
      m.querySelector('#adm-tx-title').textContent = 'تراکنش ' + (d.id || orderId);
      m.querySelector('#adm-tx-body').innerHTML = '<div style="display:grid;gap:12px;font-size:13px">'
        + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' + statusBadge(d.status)
        + '<span><strong>مبلغ:</strong> ' + fa(d.amount) + ' تومان (' + esc(METHOD[d.method] || d.method) + ')</span></div>'
        + '<div><strong>شناسه پرداخت:</strong> <span dir="ltr">' + esc(d.refId || '—') + '</span>'
        + (d.authority ? ' — <strong>Authority:</strong> <span dir="ltr">' + esc(d.authority) + '</span>' : '') + '</div>'
        + '<div><strong>وضعیت استرداد:</strong> ' + (d.status === 'refunded' ? '<span class="adm-badge adm-badge--info">مستردشده</span>' : '<span class="adm-badge adm-badge--neutral adm-badge--plain">بدون استرداد</span>') + '</div>'
        + '<div><strong>سفارش:</strong> ' + esc(d.orderId) + ' (وضعیت: ' + esc(d.orderStatus || '') + ') '
        + '<button type="button" class="btn btn-secondary btn-sm" data-tx-order="' + esc(d.orderId) + '">مشاهده سفارش</button></div>'
        + '<div><strong>مشتری:</strong> ' + esc(d.userName || '—') + ' <span dir="ltr">' + esc(d.userMobile || '') + '</span> '
        + (d.userId ? '<button type="button" class="btn btn-secondary btn-sm" data-tx-user="' + esc(d.userId) + '">مشاهده مشتری</button>' : '') + '</div>'
        + '<div><strong>اقلام سفارش:</strong><div style="margin-top:4px">' + items + '</div></div>'
        + '<div><strong>رویدادهای پرداخت:</strong><div style="margin-top:4px;max-height:180px;overflow-y:auto">' + events + '</div></div>'
        + '<div class="adm-table__sub">ایجاد: ' + esc(fmtDT(d.createdAt)) + ' — پرداخت: ' + esc(fmtDT(d.paidAt)) + '</div>'
        + '</div>';
    }).catch(function (err) {
      m.querySelector('#adm-tx-body').innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">' + esc(err.message || 'خطا') + '</p>';
    });
  }

  /* ── Events ───────────────────────────────────────────── */
  function resetPage() { state.page = 1; }
  if (searchInput) searchInput.addEventListener('input', function () {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(function () { state.q = searchInput.value.trim(); resetPage(); load(); }, 350);
  });
  if (statusFilter) statusFilter.addEventListener('change', function () { state.status = statusFilter.value; resetPage(); load(); });
  if (methodFilter) methodFilter.addEventListener('change', function () { state.method = methodFilter.value; resetPage(); load(); });
  if (fromInput) fromInput.addEventListener('change', function () { state.from = fromInput.value; resetPage(); load(); });
  if (toInput) toInput.addEventListener('change', function () { state.to = toInput.value; resetPage(); load(); });
  var clearBtn = sec.querySelector('[data-tx-clear]');
  if (clearBtn) clearBtn.addEventListener('click', function () {
    state.q = ''; state.status = 'all'; state.method = 'all'; state.from = ''; state.to = '';
    if (searchInput) searchInput.value = '';
    if (statusFilter) statusFilter.value = 'all';
    if (methodFilter) methodFilter.value = 'all';
    if (fromInput) fromInput.value = '';
    if (toInput) toInput.value = '';
    resetPage(); load();
  });
  if (pagination) pagination.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-xpage]') : null;
    if (!btn || btn.disabled) return;
    var v = btn.getAttribute('data-xpage');
    if (v === 'prev') { if (state.page > 1) state.page--; else return; }
    else if (v === 'next') { if (state.page < pageCount()) state.page++; else return; }
    else state.page = Math.max(1, Math.min(pageCount(), parseInt(v, 10) || 1));
    load();
  });

  document.addEventListener('click', function (e) {
    var v = e.target.closest ? e.target.closest('[data-xview]') : null;
    if (v && sec.contains(v)) { e.preventDefault(); openDetail(v.getAttribute('data-xview')); return; }
    var go = e.target.closest ? e.target.closest('[data-tx-order]') : null;
    if (go) {
      e.preventDefault();
      closeModal(document.getElementById('adm-tx-modal'));
      goView('orders');
      return;
    }
    var gu = e.target.closest ? e.target.closest('[data-tx-user]') : null;
    if (gu) {
      e.preventDefault();
      closeModal(document.getElementById('adm-tx-modal'));
      goView('users');
      return;
    }
    if (e.target.closest && e.target.closest('[data-tx-close]')) { closeModal(document.getElementById('adm-tx-modal')); return; }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal(document.getElementById('adm-tx-modal'));
  });

  load();
  window.CamzyAdminTransactions = { reload: load };
})();
