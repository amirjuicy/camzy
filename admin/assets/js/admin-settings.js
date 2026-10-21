/* ================================================================
   Camzy — Admin Settings (real backend persistence)
   Loads/saves every settings field via GET/PUT /api/settings
   (SQLite `settings` table, admin-only writes). Password change
   persists via POST /api/admin/password (bcrypt, current-password
   verified server-side). No mock toasts: every save hits the DB.
   ================================================================ */
(function () {
  'use strict';

  var API_BASE = '/api';

  function $(sel) { return document.querySelector(sel); }
  function toast(msg, type) {
    if (window.CamzyAdmin && window.CamzyAdmin.showToast) window.CamzyAdmin.showToast(msg, type);
  }
  function adminToken() {
    try {
      var s = JSON.parse(localStorage.getItem('as_admin_session') || 'null');
      return (s && s.token) || '';
    } catch (e) { return ''; }
  }
  async function api(path, opts) {
    var headers = { 'Content-Type': 'application/json' };
    var t = adminToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    var res = await fetch(API_BASE + path, Object.assign({ headers: headers }, opts || {}));
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
    return data;
  }

  /* Persian/Arabic digits → Latin, strip separators. */
  function num(v) {
    var s = String(v == null ? '' : v)
      .replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); })
      .replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); })
      .replace(/[٬,\s]/g, '');
    var n = Math.round(Number(s));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  function fmtFa(n) { try { return Number(n || 0).toLocaleString('fa-IR'); } catch (e) { return String(n); } }
  function on(v) { return v === true || v === 1 || v === '1' || v === 'true'; }

  var F = {
    name: $('#s-name'), phone: $('#s-phone'), email: $('#s-email'),
    address: $('#s-address'), desc: $('#s-desc'),
    shipMethod: $('#s-ship-type'), shipCost: $('#s-ship-cost'), freeShip: $('#s-free-ship'),
    payOnline: $('#s-pay-online'), payCod: $('#s-pay-cod'), payCard: $('#s-pay-card'),
    notifyNew: $('#s-notify-new'), notifyLow: $('#s-notify-low'), notifyWeekly: $('#s-notify-weekly'),
    orderMin: $('#s-order-min'), orderMax: $('#s-order-max'),
    qtyMin: $('#s-qty-min'), qtyMax: $('#s-qty-max'),
    allowGuest: $('#s-allow-guest'), allowQedit: $('#s-allow-qedit'), allowOos: $('#s-allow-oos')
  };
  var PM_METHODS = ['online', 'cod', 'card'];
  function pmEl(m, kind) { return $('#s-pay-' + m + '-' + kind); }

  function applySettings(s) {
    if (F.name) F.name.value = s['store.name'] || '';
    if (F.phone) F.phone.value = s['store.phone'] || '';
    if (F.email) F.email.value = s['store.email'] || '';
    if (F.address) F.address.value = s['store.address'] || '';
    if (F.desc) F.desc.value = s['store.desc'] || '';
    if (F.shipMethod) F.shipMethod.value = s['ship.method'] || '';
    if (F.shipCost) F.shipCost.value = fmtFa(num(s['ship.cost']));
    if (F.freeShip) F.freeShip.value = fmtFa(num(s['ship.free_from']));
    if (F.payOnline) F.payOnline.checked = on(s['pay.online']);
    if (F.payCod) F.payCod.checked = on(s['pay.cod']);
    if (F.payCard) F.payCard.checked = on(s['pay.card']);
    if (F.notifyNew) F.notifyNew.checked = on(s['notify.new_order']);
    if (F.notifyLow) F.notifyLow.checked = on(s['notify.low_stock']);
    if (F.notifyWeekly) F.notifyWeekly.checked = on(s['notify.weekly']);
    if (F.orderMin) F.orderMin.value = fmtFa(num(s['order.min_amount']));
    if (F.orderMax) F.orderMax.value = fmtFa(num(s['order.max_amount']));
    if (F.qtyMin) F.qtyMin.value = String(Math.max(1, num(s['order.min_qty']) || 1));
    if (F.qtyMax) F.qtyMax.value = String(num(s['order.max_qty']));
    if (F.allowGuest) F.allowGuest.checked = on(s['order.allow_guest']);
    if (F.allowQedit) F.allowQedit.checked = on(s['order.allow_qty_edit']);
    if (F.allowOos) F.allowOos.checked = on(s['order.allow_oos']);
    PM_METHODS.forEach(function (m) {
      var t = pmEl(m, 'title'), d = pmEl(m, 'desc'), e = pmEl(m, 'enabled');
      if (t && s['pay.' + m + '.title'] !== undefined) t.value = s['pay.' + m + '.title'];
      if (d && s['pay.' + m + '.desc'] !== undefined) d.value = s['pay.' + m + '.desc'];
      if (e && s['pay.' + m] !== undefined) e.checked = on(s['pay.' + m]);
    });
  }

  async function load() {
    try {
      applySettings(await api('/settings'));
    } catch (e) { /* keep hardcoded defaults as offline fallback */ }
  }

  async function save(patch) {
    var saved = await api('/settings', { method: 'PUT', body: JSON.stringify(patch) });
    applySettings(saved);
    toast('تنظیمات با موفقیت ذخیره شد', 'success');
  }

  function busy(btn, fn) {
    return async function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      btn.disabled = true;
      try { await fn(); }
      catch (err) { toast(err.message || 'ذخیره تنظیمات ناموفق بود', 'danger'); }
      finally { btn.disabled = false; }
    };
  }

  /* store.* is centralized in Admin → اطلاعات فروشگاه (#/store-info).
     This legacy view is read-only for identity, so it must never write
     store.* keys. Any legacy submit is redirected to the single editor. */
  var storeForm = $('#adm-settings-store');
  if (storeForm) storeForm.addEventListener('submit', function (e) {
    e.preventDefault();
    toast('اطلاعات فروشگاه فقط از بخش «اطلاعات فروشگاه» قابل ویرایش است', 'warn');
    if (window.CamzyAdmin && window.CamzyAdmin.showView) window.CamzyAdmin.showView('store-info');
  });

  var shipForm = $('#adm-settings-shipping');
  if (shipForm) shipForm.addEventListener('submit', busy(
    shipForm.querySelector('[type="submit"]') || shipForm,
    async function () {
      await save({
        'ship.method': F.shipMethod ? F.shipMethod.value : '',
        'ship.cost': String(num(F.shipCost ? F.shipCost.value : 0)),
        'ship.free_from': String(num(F.freeShip ? F.freeShip.value : 0)),
        'pay.online': F.payOnline && F.payOnline.checked ? '1' : '0',
        'pay.cod': F.payCod && F.payCod.checked ? '1' : '0',
        'pay.card': F.payCard && F.payCard.checked ? '1' : '0'
      });
    }
  ));

  var notifyForm = $('#adm-settings-notify');
  if (notifyForm) notifyForm.addEventListener('submit', busy(
    notifyForm.querySelector('[type="submit"]') || notifyForm,
    async function () {
      await save({
        'notify.new_order': F.notifyNew && F.notifyNew.checked ? '1' : '0',
        'notify.low_stock': F.notifyLow && F.notifyLow.checked ? '1' : '0',
        'notify.weekly': F.notifyWeekly && F.notifyWeekly.checked ? '1' : '0'
      });
    }
  ));

  var purchaseForm = $('#adm-settings-purchase');
  if (purchaseForm) purchaseForm.addEventListener('submit', busy(
    purchaseForm.querySelector('[type="submit"]') || purchaseForm,
    async function () {
      var qMin = Math.max(1, Math.round(num(F.qtyMin ? F.qtyMin.value : 1)) || 1);
      var qMax = Math.max(0, Math.round(num(F.qtyMax ? F.qtyMax.value : 0)) || 0);
      await save({
        'order.min_amount': String(num(F.orderMin ? F.orderMin.value : 0)),
        'order.max_amount': String(num(F.orderMax ? F.orderMax.value : 0)),
        'order.min_qty': String(qMin),
        'order.max_qty': String(qMax),
        'order.allow_guest': F.allowGuest && F.allowGuest.checked ? '1' : '0',
        'order.allow_qty_edit': F.allowQedit && F.allowQedit.checked ? '1' : '0',
        'order.allow_oos': F.allowOos && F.allowOos.checked ? '1' : '0'
      });
    }
  ));

  /* ── Purchase methods: dedicated tab per method ── */
  var pmTabs = document.querySelectorAll('#adm-purchase-methods [data-pm-tab]');
  pmTabs.forEach(function (b) {
    b.addEventListener('click', function () {
      var m = b.getAttribute('data-pm-tab');
      pmTabs.forEach(function (x) {
        var on_ = x.getAttribute('data-pm-tab') === m;
        x.classList.toggle('btn-accent', on_);
        x.setAttribute('aria-selected', on_ ? 'true' : 'false');
      });
      document.querySelectorAll('#adm-purchase-methods [data-pm-panel]').forEach(function (p) {
        p.hidden = p.getAttribute('data-pm-panel') !== m;
      });
    });
  });
  if (pmTabs.length) pmTabs[0].classList.add('btn-accent');
  document.querySelectorAll('[data-pm-save]').forEach(function (btn) {
    btn.addEventListener('click', busy(btn, async function () {
      var m = btn.getAttribute('data-pm-save');
      var t = pmEl(m, 'title'), d = pmEl(m, 'desc'), e = pmEl(m, 'enabled');
      if (t && !t.value.trim()) { toast('عنوان روش الزامی است', 'danger'); t.focus(); return; }
      var patch = {};
      patch['pay.' + m + '.title'] = t ? t.value.trim() : '';
      patch['pay.' + m + '.desc'] = d ? d.value.trim() : '';
      patch['pay.' + m] = e && e.checked ? '1' : '0';
      await save(patch);
    }));
  });

  /* ── Password change (real: POST /api/admin/password) ── */
  var passForm = $('#adm-change-password');
  if (passForm) passForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var cur = $('#adm-current-pass');
    var np = $('#adm-new-pass');
    var cf = $('#adm-confirm-pass');
    var btn = passForm.querySelector('[type="submit"]');
    if (!np.value || np.value !== cf.value) {
      toast('رمز عبور و تأیید آن یکسان نیستند', 'danger'); return;
    }
    if (np.value.length < 8) { toast('رمز عبور باید حداقل ۸ کاراکتر باشد', 'danger'); return; }
    if (btn) btn.disabled = true;
    try {
      await api('/admin/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: cur.value, newPassword: np.value })
      });
      toast('رمز عبور با موفقیت تغییر کرد', 'success');
      cur.value = ''; np.value = ''; cf.value = '';
    } catch (err) {
      toast(err.message || 'تغییر رمز عبور ناموفق بود', 'danger');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  load();
  window.CamzyAdminSettings = { reload: load };
})();
