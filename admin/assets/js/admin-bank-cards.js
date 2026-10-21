/* Camzy — Admin Bank Cards (کارت‌های کارت به کارت).
   Lives inside the Admin payment settings → "کارت به کارت" tab.
   CRUD + reorder via /api/admin/bank-cards. Logos go through the existing
   Gallery API (/api/admin/gallery/upload) and the CamzyMediaPicker. */
(function () {
  'use strict';

  function $(s, c) { return (c || document).querySelector(s); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function toast(m, t) { if (window.CamzyAdmin && window.CamzyAdmin.showToast) window.CamzyAdmin.showToast(m, t); else alert(m); }
  function token() { try { var s = JSON.parse(localStorage.getItem('as_admin_session') || 'null'); return (s && s.token) || ''; } catch (e) { return ''; } }
  function headers() { return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }; }
  function fa(n) { try { return Number(n || 0).toLocaleString('fa-IR'); } catch (e) { return String(n); } }

  var FALLBACK_LOGO =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="26" height="26" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>';

  var state = { items: [] };

  /* Group digits 4-4-4-4 while typing, accepting either Persian or Latin digits. */
  function faDigits(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = '۰۱۲۳۴۵۶۷۸۹'.indexOf(s.charAt(i));
      out += c === -1 ? s.charAt(i) : String(c);
    }
    return out;
  }
  function digitsOnly(v) { return faDigits(String(v == null ? '' : v)).replace(/\D/g, ''); }
  function groupCard(v) {
    var d = digitsOnly(v);
    if (d.length > 16) d = d.slice(0, 16);
    return d.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  }
  function logoHtml(url, size) {
    if (!url) return FALLBACK_LOGO;
    return '<img src="' + String(url).replace(/"/g, '&quot;') + '" alt="" style="width:' + (size || 26) + 'px;height:' + (size || 26) + 'px;object-fit:contain">';
  }

  /* ── Table ─────────────────────────────────────────────────────── */
  function rowHtml(c, i, n) {
    var badge = c.isEnabled
      ? '<span class="adm-badge adm-badge--success">فعال</span>'
      : '<span class="adm-badge">غیرفعال</span>';
    return '<tr data-id="' + c.id + '" data-sort="' + (c.sortOrder != null ? c.sortOrder : i) + '">' +
      '<td>' + fa(i + 1) + '</td>' +
      '<td><span style="display:inline-flex;align-items:center;gap:8px">' +
      '<span style="width:32px;height:32px;border:1px solid var(--border-color-light);border-radius:var(--radius-lg);display:inline-flex;align-items:center;justify-content:center;overflow:hidden">' + logoHtml(c.logo, 22) + '</span>' +
      esc(c.bankName) + '</span></td>' +
      '<td><span class="adm-order-id" dir="ltr">' + esc(c.cardNumberFormatted || c.cardNumber) + '</span></td>' +
      '<td>' + (c.cardHolder ? esc(c.cardHolder) : '<span style="color:var(--text-muted)">—</span>') + '</td>' +
      '<td>' + badge + '</td>' +
      '<td><div class="adm-table__cell-actions">' +
      '<button type="button" class="adm-btn-icon" data-bcact="up" title="بالا"' + (i === 0 ? ' disabled style="opacity:.35"' : '') + '>▲</button>' +
      '<button type="button" class="adm-btn-icon" data-bcact="down" title="پایین"' + (i === n - 1 ? ' disabled style="opacity:.35"' : '') + '>▼</button>' +
      '<button type="button" class="adm-btn-icon" data-bcact="toggle" title="فعال/غیرفعال">⏻</button>' +
      '<button type="button" class="adm-btn-icon" data-bcact="edit" title="ویرایش">✎</button>' +
      '<button type="button" class="adm-btn-icon adm-btn-icon--danger" data-bcact="delete" title="حذف">🗑</button>' +
      '</div></td></tr>';
  }

  function load() {
    var tbody = $('#adm-bc-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-muted)">در حال دریافت…</td></tr>';
    fetch('/api/admin/bank-cards', { headers: headers() })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'failed');
        state.items = Array.isArray(res.body) ? res.body : [];
        tbody.innerHTML = state.items.length
          ? state.items.map(rowHtml).join('')
          : '<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-muted)">کارتی ثبت نشده است. کارت اول را اضافه کنید.</td></tr>';
      })
      .catch(function () { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:28px;color:#B91C22">خطا در دریافت کارت‌ها</td></tr>'; });
  }

  /* ── Form ──────────────────────────────────────────────────────── */
  function setLogoPreview(url) {
    var box = $('#adm-bc-logo-preview');
    if (box) box.innerHTML = logoHtml(url, 34);
  }

  function fillForm(c) {
    $('#adm-bc-id').value = c ? c.id : '';
    $('#adm-bc-bank').value = c ? c.bankName : '';
    $('#adm-bc-number').value = c ? (c.cardNumberFormatted || c.cardNumber || '') : '';
    $('#adm-bc-holder').value = c ? c.cardHolder : '';
    $('#adm-bc-note').value = c ? c.note : '';
    $('#adm-bc-logo').value = c ? c.logo : '';
    if ($('#adm-bc-enabled')) $('#adm-bc-enabled').checked = c ? !!c.isEnabled : true;
    setLogoPreview(c ? c.logo : '');
    $('#adm-bc-submit').textContent = c ? 'ذخیره تغییرات' : 'افزودن کارت';
    $('#adm-bc-cancel').style.display = c ? '' : 'none';
  }

  function collectForm() {
    return {
      bankName: $('#adm-bc-bank').value.trim(),
      cardNumber: digitsOnly($('#adm-bc-number').value),
      cardHolder: $('#adm-bc-holder').value.trim(),
      note: $('#adm-bc-note').value.trim(),
      logo: $('#adm-bc-logo').value,
      isEnabled: $('#adm-bc-enabled') ? $('#adm-bc-enabled').checked : true,
    };
  }

  function save(id, payload, method) {
    fetch('/api/admin/bank-cards' + (id ? '/' + id : ''), {
      method: method, headers: headers(), body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'failed'); return j; }); })
      .then(function () {
        toast(id ? 'کارت به‌روزرسانی شد' : 'کارت بانکی اضافه شد', 'success');
        fillForm(null);
        load();
      })
      .catch(function (e) { toast(e.message || 'خطا در ذخیره', 'danger'); });
  }

  /* ── Reorder ───────────────────────────────────────────────────── */
  function persistOrder(ids) {
    return fetch('/api/admin/bank-cards/order', {
      method: 'PUT', headers: headers(), body: JSON.stringify({ ids: ids })
    })
      .then(function (r) { if (!r.ok) throw new Error('failed'); return r.json(); })
      .then(function (list) {
        if (Array.isArray(list) && list.length) state.items = list;
        load();
      })
      .catch(function () { toast('خطا در تغییر ترتیب کارت‌ها', 'danger'); load(); });
  }

  function move(id, dir) {
    var ids = state.items.map(function (c) { return c.id; });
    var i = ids.indexOf(Number(id));
    if (i === -1) return;
    var j = i + dir;
    if (j < 0 || j >= ids.length) return;
    var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
    persistOrder(ids);
  }

  /* ── Logo upload (reuses the shared gallery upload) ─────────────── */
  function uploadLogoFile(file) {
    if (!file) return Promise.resolve('');
    var fd = new FormData();
    fd.append('image', file);
    return fetch('/api/admin/gallery/upload', {
      method: 'POST',
      headers: (function () { var h = {}; var t = token(); if (t) h['Authorization'] = 'Bearer ' + t; return h; })(),
      body: fd
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'آپلود ناموفق بود');
        return res.body.url || res.body.path || '';
      });
  }

  function applyLogo(url) {
    $('#adm-bc-logo').value = url || '';
    setLogoPreview(url || '');
  }

  /* ── Row actions (delegated) ───────────────────────────────────── */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-bcact]');
    if (!b) return;
    var tr = b.closest('tr[data-id]');
    if (!tr) return;
    var id = tr.getAttribute('data-id');
    var act = b.getAttribute('data-bcact');
    if (act === 'edit') {
      var card = state.items.find(function (x) { return String(x.id) === String(id); });
      if (card) {
        fillForm(card);
        var host = $('#adm-bc-form');
        if (host && host.scrollIntoView) host.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else if (act === 'delete') {
      if (!confirm('این کارت بانکی حذف شود؟ سفارش‌های قبلی اطلاعات کارت را نگه می‌دارند.')) return;
      fetch('/api/admin/bank-cards/' + id, { method: 'DELETE', headers: headers() })
        .then(function (r) { if (!r.ok) throw new Error('delete failed'); return r.json(); })
        .then(function () { toast('کارت بانکی حذف شد', 'success'); load(); })
        .catch(function () { toast('خطا در حذف', 'danger'); });
    } else if (act === 'toggle') {
      // Read the state from the status badge only: the row's HTML also contains
      // this button's title ("فعال/غیرفعال"), so scanning the whole row would
      // always report "disabled" and cards could never be switched off.
      var badge = tr.querySelector('.adm-badge');
      var enabled = !!(badge && badge.textContent.indexOf('غیرفعال') !== -1);
      fetch('/api/admin/bank-cards/' + id, { method: 'PUT', headers: headers(), body: JSON.stringify({ isEnabled: enabled }) })
        .then(function (r) { if (!r.ok) throw new Error('failed'); return r.json(); })
        .then(function () { toast(enabled ? 'کارت فعال شد' : 'کارت غیرفعال شد', 'success'); load(); })
        .catch(function () { toast('خطا در تغییر وضعیت', 'danger'); });
    } else if (act === 'up') {
      move(id, -1);
    } else if (act === 'down') {
      move(id, 1);
    }
  });

  /* ── Init ──────────────────────────────────────────────────────── */
  function init() {
    var form = $('#adm-bc-form');
    if (!form) return;

    fillForm(null);

    // Live 4-4-4-4 grouping of the card number field.
    var num = $('#adm-bc-number');
    num.addEventListener('input', function () {
      var caretAtEnd = num.selectionStart === num.value.length;
      num.value = groupCard(num.value);
      if (caretAtEnd) try { num.setSelectionRange(num.value.length, num.value.length); } catch (e) {}
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var payload = collectForm();
      if (!payload.bankName) { toast('نام بانک را وارد کنید.', 'warning'); return; }
      if (payload.cardNumber.length !== 16) { toast('شماره کارت باید ۱۶ رقم باشد.', 'warning'); return; }
      var id = $('#adm-bc-id').value || null;
      save(id, payload, id ? 'PUT' : 'POST');
    });

    $('#adm-bc-cancel').addEventListener('click', function () { fillForm(null); });

    var pick = $('#adm-bc-logo-pick');
    if (pick) pick.addEventListener('click', function () {
      if (window.CamzyMediaPicker && window.CamzyMediaPicker.open) {
        window.CamzyMediaPicker.open(function (url) { applyLogo(url); });
      } else { toast('انتخابگر گالری در دسترس نیست', 'warning'); }
    });

    var fileBtn = $('#adm-bc-logo-file-btn');
    var file = $('#adm-bc-logo-file');
    if (fileBtn && file) {
      fileBtn.addEventListener('click', function () { file.click(); });
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        if (!f) return;
        uploadLogoFile(f)
          .then(function (url) { applyLogo(url); toast('لوگو آپلود شد. برای اعمال نهایی کارت را ذخیره کنید.', 'success'); })
          .catch(function (err) { toast(err.message || 'آپلود ناموفق بود', 'danger'); })
          .then(function () { file.value = ''; });
      });
    }

    var clear = $('#adm-bc-logo-clear');
    if (clear) clear.addEventListener('click', function () { applyLogo(''); });

    // Lazy-load when the settings view (and therefore this panel) becomes visible.
    var orig = window.CamzyAdmin && window.CamzyAdmin.showView;
    if (orig && !window.CamzyAdmin._bcHooked) {
      window.CamzyAdmin._bcHooked = true;
      window.CamzyAdmin.showView = function (n) { orig(n); if (n === 'payment-card' || n === 'settings') load(); };
    }
    if ((location.hash || '').indexOf('payment-card') !== -1 || (location.hash || '').indexOf('settings') !== -1) load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();