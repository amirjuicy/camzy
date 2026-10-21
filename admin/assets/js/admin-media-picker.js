/* Camzy — Reusable media picker. Reuses existing Gallery API (/api/admin/gallery). */
(function () {
  'use strict';
  function $(s, c) { return (c || document).querySelector(s); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function token() { try { var s = JSON.parse(localStorage.getItem('as_admin_session') || 'null'); return (s && s.token) || ''; } catch (e) { return ''; } }
  function toast(m, t) { if (window.CamzyAdmin && window.CamzyAdmin.showToast) window.CamzyAdmin.showToast(m, t); }

  var overlay = null, grid = null, searchEl = null, fileEl = null, pendingCb = null;
  var cache = [];
  var selectedUrl = null; // Track currently selected image URL

  function ensureUI() {
    if (overlay) return;
    if (!document.getElementById('adm-mp-style')) {
      var st = document.createElement('style');
      st.id = 'adm-mp-style';
      st.textContent =
        '#adm-media-picker #adm-mp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));grid-auto-rows:minmax(120px,1fr);justify-content:center;gap:10px;max-height:50vh;overflow:auto}' +
        '#adm-media-picker .adm-mp-item{box-sizing:border-box;width:100%;max-width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;background:#fff;padding:2px;cursor:pointer;transition:border-color var(--transition-fast),background var(--transition-fast)}' +
        '#adm-media-picker .adm-mp-item.is-selected{border-color:var(--color-primary);background:#f8f9fa}' +
        '#adm-media-picker .adm-mp-thumb{box-sizing:border-box;width:100%;max-width:100%;height:120px;min-height:120px;flex:none !important;flex-shrink:0;margin:0 auto;overflow:hidden;background:#f8f9fa;display:flex;align-items:center;justify-content:center}' +
        '#adm-media-picker .adm-mp-thumb img{width:100% !important;height:100% !important;min-height:0;max-width:100%;max-height:100%;object-fit:contain !important;object-position:center center;display:block;flex-shrink:0;background:#f8f9fa}' +
        '#adm-media-picker .adm-mp-name{display:block;flex:none;flex-shrink:0;box-sizing:border-box;width:100%;max-width:100%;font-size:10px;padding:4px;margin-top:2px;text-align:center;direction:ltr;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#fff}' +
        '#adm-media-picker .adm-mp-name svg{width:14px;height:14px;vertical-align:text-bottom;margin-right:2px}' +
        '#adm-media-picker .adm-mp-close-btn{position:absolute;right:6px;top:6px;width:20px;height:20px;border:none;background:transparent;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}' +
        '#adm-media-picker .adm-mp-close-btn:hover{color:var(--color-primary)}';
      document.head.appendChild(st);
    }
    overlay = document.createElement('div');
    overlay.className = 'adm-modal';
    overlay.id = 'adm-media-picker';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<div class="adm-modal__backdrop" data-mp-close></div>' +
      '<div class="adm-modal__box" role="dialog" aria-modal="true" style="max-width:760px">' +
      '<div class="adm-modal__header"><h3 class="adm-modal__title">انتخاب تصویر از گالری</h3>' +
      '<button type="button" class="adm-btn-icon adm-mp-close-btn" data-mp-close aria-label="بستن">✕</button></div>' +
      '<div class="adm-modal__body" style="display:grid;gap:12px">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<input type="search" class="input" id="adm-mp-search" placeholder="جستجو…" style="flex:1;min-width:180px">' +
      '<label class="btn btn-accent btn-sm" style="cursor:pointer">آپلود تصویر<input type="file" id="adm-mp-file" accept="image/*,image/svg+xml" style="display:none"></label>' +
      '</div>' +
      '<div id="adm-mp-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));grid-auto-rows:minmax(120px,1fr);justify-content:center;gap:10px;max-height:50vh;overflow:auto"></div>' +
      '</div>' +
      '<div class="adm-modal__footer"><button type="button" class="btn btn-secondary btn-sm" data-mp-close>انصراف</button></div>' +
      '</div>';
    document.body.appendChild(overlay);
    grid = $('#adm-mp-grid', overlay);
    searchEl = $('#adm-mp-search', overlay);
    fileEl = $('#adm-mp-file', overlay);
    overlay.addEventListener('click', function (e) {
      var closeBtn = e.target.closest('.adm-mp-close-btn');
      if (closeBtn) { close(); return; }
      var item = e.target.closest('.adm-mp-item');
      if (item) {
        // Select on click — including a re-click of the already-selected item.
        // (The old toggle-off branch called the pending callback with
        // `undefined`, writing the literal string "undefined" into the target
        // field, e.g. a بنرهای تبلیغاتی image URL.)
        var prevSelected = grid.querySelector('.adm-mp-item.is-selected');
        if (prevSelected) prevSelected.classList.remove('is-selected');
        item.classList.add('is-selected');
        selectedUrl = item.getAttribute('data-mp-pick');
        try { localStorage.setItem('adm_media_picker_selected', selectedUrl); } catch (_) {}
        // Close picker and select this image
        close();
        if (pendingCb) { var cb = pendingCb; pendingCb = null; cb(selectedUrl); }
        return;
      }
      if (e.target.closest('[data-mp-close]')) { close(); return; }
      var item = e.target.closest('[data-mp-pick]');
      if (item) {
        var url = item.getAttribute('data-mp-pick');
        close();
        if (pendingCb) { var cb = pendingCb; pendingCb = null; cb(url); }
      }
    });
    searchEl.addEventListener('input', function () { render(searchEl.value); });
    fileEl.addEventListener('change', function () {
      var f = fileEl.files && fileEl.files[0];
      if (!f) return;
      var fd = new FormData(); fd.append('image', f);
      toast('در حال آپلود…', 'info');
      fetch('/api/admin/gallery/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + token() }, body: fd })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error((res.body && res.body.error) || 'upload failed');
          var url = res.body.url || res.body.path;
          toast('تصویر آپلود شد', 'success');
          load(function () {
            // Auto-select the freshly uploaded image into the pending field.
            close();
            if (pendingCb) { var cb = pendingCb; pendingCb = null; cb(url); }
          });
        })
        .catch(function (err) { toast(err.message || 'خطا در آپلود', 'danger'); })
        .finally(function () { fileEl.value = ''; });
    });
  }

  // Load selected URL from localStorage if available
  (function () {
    try { selectedUrl = localStorage.getItem('adm_media_picker_selected'); } catch (_) {}
  })();

  function render(q) {
    q = String(q || '').trim().toLowerCase();
    if (!cache.length) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#B91C22;padding:24px;font-size:13px;line-height:1.9">'
        + 'گالری تصاویر خالی است.<br>اول یک تصویر با دکمه «آپلود تصویر» بالای همین پنجره اضافه کنید، سپس روی آن کلیک کنید.</p>';
      return;
    }
    var list = cache.filter(function (it) {
      return !q || String(it.filename || '').toLowerCase().indexOf(q) !== -1 || String(it.path || '').toLowerCase().indexOf(q) !== -1;
    });
    if (!list.length) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:20px">تصویری با عبارت «' + esc(q) + '» یافت نشد. جستجو را پاک کنید تا همه تصاویر نمایش داده شود.</p>';
      return;
    }
    grid.innerHTML = list.map(function (it) {
      var url = it.url || it.path;
      var isSelected = url === selectedUrl;
      return '<button type="button" class="adm-mp-item' + (isSelected ? ' is-selected' : '') + '" data-mp-pick="' + esc(url) + '" title="' + esc(it.path || url) + '" style="box-sizing:border-box;width:100%;max-width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;background:#fff;padding:2px;cursor:pointer;transition:border-color var(--transition-fast),background var(--transition-fast))">' +
        '<span class="adm-mp-thumb" style="box-sizing:border-box;width:100%;max-width:100%;height:120px;min-height:120px;flex:none !important;flex-shrink:0;margin:0 auto;overflow:hidden;background:#f8f9fa;display:flex;align-items:center;justify-content:center">' +
        '<img src="' + esc(url) + '" alt="' + esc(it.filename || '') + '" loading="lazy" style="width:100%;height:100%;object-fit:contain;object-position:center center;display:block;max-width:100%;max-height:100%;background:#f8f9fa;flex-shrink:0">' +
        '</span>' +
        '<span class="adm-mp-name" style="display:block;flex:none;flex-shrink:0;box-sizing:border-box;width:100%;max-width:100%;font-size:10px;padding:4px;margin-top:2px;text-align:center;direction:ltr;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#fff">' + esc(it.filename || url) + '</span></button>';
    }).join('');
  }

  function load(done) {
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:20px">در حال بارگذاری…</p>';
    fetch('/api/admin/gallery', { headers: { Authorization: 'Bearer ' + token() } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || ('خطای سرور (' + res.status + ')'));
        var items = res.body && (res.body.items || res.body.files);
        cache = Array.isArray(items) ? items : [];
        render(searchEl ? searchEl.value : '');
        if (done) done();
      })
      .catch(function (err) {
        cache = [];
        var msg = (err && err.message) || 'ارتباط با سرور برقرار نشد';
        grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#B91C22;padding:24px;font-size:13px;line-height:1.9">'
          + 'خطا در بارگذاری گالری:<br>' + esc(msg)
          + '<br><span style="color:var(--text-muted)">صفحه را رفرش کنید یا دوباره تلاش کنید.</span></p>';
        toast('خطا در بارگذاری گالری: ' + msg, 'danger');
      });
  }

  function open(cb) {
    ensureUI();
    pendingCb = (typeof cb === 'function') ? cb : null;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    load();
  }
  function close() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function fillTarget(target, url) {
    // Never write a non-value into the field: a missing/undefined selection
    // used to be stored as the literal string "undefined".
    if (typeof url !== 'string' || !url) return;
    var el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return;
    if (el.tagName === 'SELECT') {
      var exists = Array.prototype.some.call(el.options, function (o) { return o.value === url; });
      if (!exists) { var opt = document.createElement('option'); opt.value = url; opt.textContent = url; el.appendChild(opt); }
      el.value = url;
    } else {
      el.value = url;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Delegate: any [data-media-target] button opens the picker and fills the target field.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-media-target]');
    if (!btn) return;
    e.preventDefault();
    var targetId = btn.getAttribute('data-media-target');
    open(function (url) { fillTarget(targetId, url); });
  });

  window.CamzyMediaPicker = { open: open, close: close, fill: fillTarget };
})();