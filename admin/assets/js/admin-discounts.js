/* Camzy — Admin Discount Codes (کدهای تخفیف). CRUD via /api/admin/discounts. */
(function () {
  'use strict';
  function $(s, c) { return (c || document).querySelector(s); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function toast(m, t) { if (window.CamzyAdmin && window.CamzyAdmin.showToast) window.CamzyAdmin.showToast(m, t); else alert(m); }
  function token() { try { var s = JSON.parse(localStorage.getItem('as_admin_session') || 'null'); return (s && s.token) || ''; } catch (e) { return ''; } }
  function headers() { return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }; }
  function fa(n) { try { return Number(n || 0).toLocaleString('fa-IR'); } catch (e) { return String(n); } }

  function rowHtml(d) {
    var val = d.type === 'percent' ? fa(d.value) + '٪' : fa(d.value) + ' تومان';
    var use = d.usageLimit == null ? fa(d.usedCount) + ' / ∞' : fa(d.usedCount) + ' / ' + fa(d.usageLimit);
    var badge = d.isEnabled ? '<span class="adm-badge adm-badge--success">فعال</span>' : '<span class="adm-badge">غیرفعال</span>';
    return '<tr data-id="' + d.id + '">' +
      '<td><span class="adm-order-id" dir="ltr">' + esc(d.code) + '</span></td>' +
      '<td>' + (d.type === 'percent' ? 'درصدی' : 'مبلغ ثابت') + '</td>' +
      '<td>' + val + '</td>' +
      '<td>' + fa(d.minOrder) + '</td>' +
      '<td>' + use + '</td>' +
      '<td>' + esc(d.expiresAt || '—') + '</td>' +
      '<td>' + badge + '</td>' +
      '<td><div class="adm-table__cell-actions">' +
      '<button type="button" class="adm-btn-icon" data-dact="toggle" title="فعال/غیرفعال">⏻</button>' +
      '<button type="button" class="adm-btn-icon" data-dact="edit" title="ویرایش">✎</button>' +
      '<button type="button" class="adm-btn-icon adm-btn-icon--danger" data-dact="delete" title="حذف">🗑</button>' +
      '</div></td></tr>';
  }

  function load() {
    var tbody = $('#adm-discounts-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--text-muted)">در حال دریافت…</td></tr>';
    fetch('/api/admin/discounts', { headers: headers() }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); }).then(function (res) {
      if (!res.ok) throw new Error((res.body && res.body.error) || 'failed');
      var items = Array.isArray(res.body) ? res.body : [];
      tbody.innerHTML = items.length ? items.map(rowHtml).join('') : '<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--text-muted)">کد تخفیفی ثبت نشده است.</td></tr>';
      var meta = $('#adm-discounts-count');
      if (meta) meta.textContent = 'نمایش ' + fa(items.length) + ' کد تخفیف';
    }).catch(function () { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:28px;color:#B91C22">خطا در دریافت کدهای تخفیف</td></tr>'; });
  }

  function collectForm() {
    return {
      code: ($('#adm-disc-code') || {}).value || '',
      type: ($('#adm-disc-type') || {}).value || 'fixed',
      value: Number((($('#adm-disc-value') || {}).value || '0').replace(/[^0-9]/g, '')) || 0,
      minOrder: Number((($('#adm-disc-min') || {}).value || '0').replace(/[^0-9]/g, '')) || 0,
      usageLimit: ($('#adm-disc-limit') || {}).value.trim() === '' ? null : Number($('#adm-disc-limit').value) || null,
      expiresAt: ($('#adm-disc-exp') || {}).value || null,
      isEnabled: $('#adm-disc-enabled') ? $('#adm-disc-enabled').checked : true,
    };
  }
  function fillForm(d) {
    $('#adm-disc-id').value = d ? d.id : '';
    $('#adm-disc-code').value = d ? d.code : '';
    $('#adm-disc-type').value = d ? d.type : 'fixed';
    $('#adm-disc-value').value = d ? d.value : '';
    $('#adm-disc-min').value = d ? (d.minOrder || '') : '';
    $('#adm-disc-limit').value = d ? (d.usageLimit == null ? '' : d.usageLimit) : '';
    $('#adm-disc-exp').value = d ? (d.expiresAt || '') : '';
    if ($('#adm-disc-enabled')) $('#adm-disc-enabled').checked = d ? !!d.isEnabled : true;
    $('#adm-disc-submit').textContent = d ? 'ذخیره تغییرات' : 'ایجاد کد تخفیف';
    $('#adm-disc-cancel').style.display = d ? '' : 'none';
  }

  function save(id, payload, method) {
    fetch('/api/admin/discounts' + (id ? '/' + id : ''), { method: method, headers: headers(), body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'failed'); return j; }); })
      .then(function () { toast(id ? 'کد تخفیف به‌روزرسانی شد' : 'کد تخفیف ایجاد شد', 'success'); fillForm(null); load(); })
      .catch(function (e) { toast(e.message || 'خطا در ذخیره', 'danger'); });
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-dact]');
    if (!b) return;
    var tr = b.closest('tr[data-id]');
    if (!tr) return;
    var id = tr.getAttribute('data-id');
    var act = b.getAttribute('data-dact');
    if (act === 'delete') {
      if (!confirm('حذف این کد تخفیف؟')) return;
      fetch('/api/admin/discounts/' + id, { method: 'DELETE', headers: headers() })
        .then(function (r) { if (!r.ok) throw new Error('delete failed'); return r.json(); })
        .then(function () { toast('کد تخفیف حذف شد', 'success'); load(); })
        .catch(function () { toast('خطا در حذف', 'danger'); });
    } else if (act === 'toggle') {
      var enabled = tr.innerHTML.indexOf('غیرفعال') !== -1;
      fetch('/api/admin/discounts/' + id, { method: 'PUT', headers: headers(), body: JSON.stringify({ isEnabled: enabled }) })
        .then(function (r) { if (!r.ok) throw new Error('failed'); return r.json(); })
        .then(function () { load(); })
        .catch(function () { toast('خطا در تغییر وضعیت', 'danger'); });
    } else if (act === 'edit') {
      fetch('/api/admin/discounts', { headers: headers() }).then(function (r) { return r.json(); }).then(function (items) {
        var d = (items || []).find(function (x) { return String(x.id) === String(id); });
        if (d) { fillForm(d); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      });
    }
  });

  function init() {
    var form = $('#adm-disc-form');
    if (!form) return;
    fillForm(null);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var id = $('#adm-disc-id').value || null;
      save(id, collectForm(), id ? 'PUT' : 'POST');
    });
    $('#adm-disc-cancel').addEventListener('click', function () { fillForm(null); });
    var search = $('#adm-discounts-search');
    if (search) search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      document.querySelectorAll('#adm-discounts-table tbody tr').forEach(function (tr) {
        tr.style.display = tr.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
      });
    });
    // Load when discounts view becomes visible
    var orig = window.CamzyAdmin && window.CamzyAdmin.showView;
    if (orig && !window.CamzyAdmin._discHooked) {
      window.CamzyAdmin._discHooked = true;
      window.CamzyAdmin.showView = function (n) { orig(n); if (n === 'discounts') load(); };
    }
    if ((location.hash || '').indexOf('discounts') !== -1) load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
