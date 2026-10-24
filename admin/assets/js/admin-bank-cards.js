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

  /* ── Card template / color helpers ─────────────────────────────────
     The exact same math runs in checkout-step4.html. Both must stay in
     sync so the admin preview always matches the customer-facing card. */
  var BC_TEMPLATES = ['classic', 'solid', 'glass', 'minimal', 'bold'];
  var BC_TEMPLATE_LABELS = { classic: 'کلاسیک', solid: 'یکدست', glass: 'شیشه‌ای', minimal: 'مینیمال', bold: 'جسور' };
  var BC_DEFAULT_COLOR = '#1F2937';

  function bcParse(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function bcAdj(rgb, amt) {
    return rgb.map(function (v) {
      var n = amt < 0 ? v * (1 + amt) : v + (255 - v) * amt;
      return Math.max(0, Math.min(255, Math.round(n)));
    });
  }
  function bcLum(rgb) {
    var f = rgb.map(function (v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  }
  function bcCss(rgb) { return 'rgb(' + rgb.join(',') + ')'; }
  function bcStyle(template, hex) {
    var rgb = bcParse(hex);
    if (!rgb) return '';
    template = BC_TEMPLATES.indexOf(template) === -1 ? 'classic' : template;
    var light = bcLum(rgb) > 0.62;
    // Light base colors are darkened before painting so white text stays legible.
    var disp = light && template !== 'glass' && template !== 'minimal' ? bcAdj(rgb, -0.5) : rgb;
    var a = template === 'minimal' ? rgb : disp;
    var b = bcAdj(disp, -0.18);
    var c = bcAdj(disp, -0.42);
    var ink = template === 'minimal' ? '#111827'
      : template === 'glass' ? (bcLum(bcAdj(rgb, 0.3)) > 0.62 ? '#111827' : '#FFFFFF')
      : (bcLum(disp) > 0.62 ? '#111827' : '#FFFFFF');
    return '--bc-a:' + bcCss(a) + ';--bc-b:' + bcCss(b) + ';--bc-c:' + bcCss(c) +
      ';--bc-soft:rgba(' + rgb.join(',') + ',0.14)' +
      ';--bc-line:rgba(' + rgb.join(',') + ',0.38)' +
      ';--bc-ink:' + ink + ';';
  }

  /* ── Table ─────────────────────────────────────────────────────── */
  function rowHtml(c, i, n) {
    var badge = c.isEnabled
      ? '<span class="adm-badge adm-badge--success">فعال</span>'
      : '<span class="adm-badge">غیرفعال</span>';
    var tpl = BC_TEMPLATES.indexOf(c.template) === -1 ? 'classic' : c.template;
    var color = /^#[0-9a-f]{6}$/i.test(c.color || '') ? String(c.color).toUpperCase() : '';
    var swatch = '<span class="adm-bc-dot' + (color ? '' : ' adm-bc-dot--default') + '"' +
      (color ? ' style="background:' + color + '"' : '') + '></span>';
    return '<tr data-id="' + c.id + '" data-sort="' + (c.sortOrder != null ? c.sortOrder : i) + '">' +
      '<td>' + fa(i + 1) + '</td>' +
      '<td><span style="display:inline-flex;align-items:center;gap:8px">' +
      '<span style="width:32px;height:32px;border:1px solid var(--border-color-light);border-radius:var(--radius-lg);display:inline-flex;align-items:center;justify-content:center;overflow:hidden">' + logoHtml(c.logo, 22) + '</span>' +
      esc(c.bankName) + '</span></td>' +
      '<td><span class="adm-bc-tpl">' + swatch + esc(BC_TEMPLATE_LABELS[tpl] || BC_TEMPLATE_LABELS.classic) + '</span></td>' +
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
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-muted)">در حال دریافت…</td></tr>';
    fetch('/api/admin/bank-cards', { headers: headers() })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'failed');
        state.items = Array.isArray(res.body) ? res.body : [];
        tbody.innerHTML = state.items.length
          ? state.items.map(rowHtml).join('')
          : '<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-muted)">کارتی ثبت نشده است. کارت اول را اضافه کنید.</td></tr>';
      })
      .catch(function () { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px;color:#B91C22">خطا در دریافت کارت‌ها</td></tr>'; });
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
    var tpl = c && BC_TEMPLATES.indexOf(c.template) !== -1 ? c.template : 'classic';
    var color = c && /^#[0-9a-f]{6}$/i.test(c.color || '') ? String(c.color).toUpperCase() : BC_DEFAULT_COLOR;
    if ($('#adm-bc-template')) $('#adm-bc-template').value = tpl;
    if ($('#adm-bc-color')) $('#adm-bc-color').value = color;
    setLogoPreview(c ? c.logo : '');
    syncPreview();
    $('#adm-bc-submit').textContent = c ? 'ذخیره تغییرات' : 'افزودن کارت';
    $('#adm-bc-cancel').style.display = c ? '' : 'none';
  }

  function syncPreview() {
    var card = $('#adm-bc-preview-card');
    if (!card) return;
    var tplEl = $('#adm-bc-template');
    var colorEl = $('#adm-bc-color');
    var tpl = tplEl && BC_TEMPLATES.indexOf(tplEl.value) !== -1 ? tplEl.value : 'classic';
    var color = colorEl ? String(colorEl.value).toUpperCase() : BC_DEFAULT_COLOR;
    card.setAttribute('data-bc-template', tpl);
    card.setAttribute('style', bcStyle(tpl, color));

    var bank = $('#adm-bc-preview-bank');
    if (bank) bank.textContent = ($('#adm-bc-bank').value || '').trim() || 'نام بانک';
    var num = $('#adm-bc-preview-num');
    if (num) {
      var d = digitsOnly($('#adm-bc-number').value);
      num.textContent = d ? d.replace(/(\d{4})(?=\d)/g, '$1 ').trim() : '•••• •••• •••• ••••';
    }
    var holder = $('#adm-bc-preview-holder');
    if (holder) holder.textContent = ($('#adm-bc-holder').value || '').trim() || 'نام صاحب حساب';
    var lg = $('#adm-bc-preview-logo');
    if (lg) lg.innerHTML = logoHtml($('#adm-bc-logo').value, 22);

    var swatches = document.querySelectorAll('#adm-bc-swatches [data-bc-color]');
    for (var i = 0; i < swatches.length; i++) {
      swatches[i].classList.toggle('is-active', String(swatches[i].getAttribute('data-bc-color')).toUpperCase() === color);
    }
  }

  function collectForm() {
    return {
      bankName: $('#adm-bc-bank').value.trim(),
      cardNumber: digitsOnly($('#adm-bc-number').value),
      cardHolder: $('#adm-bc-holder').value.trim(),
      note: $('#adm-bc-note').value.trim(),
      logo: $('#adm-bc-logo').value,
      isEnabled: $('#adm-bc-enabled') ? $('#adm-bc-enabled').checked : true,
      template: $('#adm-bc-template') ? $('#adm-bc-template').value : 'classic',
      color: $('#adm-bc-color') ? $('#adm-bc-color').value : '',
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
    syncPreview();
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

    /* Keep the live preview in sync with every visual control. */
    ['#adm-bc-bank', '#adm-bc-holder', '#adm-bc-number'].forEach(function (sel) {
      var el = $(sel);
      if (el) el.addEventListener('input', syncPreview);
    });
    var tplSel = $('#adm-bc-template');
    if (tplSel) tplSel.addEventListener('change', syncPreview);
    var colorInp = $('#adm-bc-color');
    if (colorInp) colorInp.addEventListener('input', syncPreview);
    var swatches = $('#adm-bc-swatches');
    if (swatches) swatches.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-bc-color]');
      if (!b) return;
      if (colorInp) colorInp.value = b.getAttribute('data-bc-color');
      syncPreview();
    });
    var colorReset = $('#adm-bc-color-reset');
    if (colorReset) colorReset.addEventListener('click', function () {
      if (colorInp) colorInp.value = BC_DEFAULT_COLOR;
      syncPreview();
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
      window.CamzyAdmin.showView = function (n) { orig(n); if (n === 'payment-card') load(); };
    }
    if ((location.hash || '').indexOf('payment-card') !== -1) load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();