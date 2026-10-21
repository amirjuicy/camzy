/* ================================================================
   Camzy — Admin Category Management
   List / add / edit / delete categories + subcategories via API.
   Uses existing admin layout (.adm-cat-grid, .adm-modal styles).
   ================================================================ */
(function () {
  'use strict';

  var API_BASE = '/api';
  var useApi = window.location.protocol === 'http:' || window.location.protocol === 'https:';

  function getToken() {
    try {
      var s = JSON.parse(localStorage.getItem('as_admin_session')||'null');
      return s && s.token ? s.token : null;
    } catch(e){ return null; }
  }
  function api(path, opts) {
    var headers = { 'Content-Type': 'application/json' };
    var t = getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    var merged = Object.assign({ headers: headers }, opts || {});
    // merge headers if opts provided its own
    if (opts && opts.headers) merged.headers = Object.assign({}, headers, opts.headers);
    return fetch(API_BASE + path, merged)
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          if (!res.ok) throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
          return data;
        });
      });
  }

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function toast(msg, type) {
    if (window.CamzyAdmin && window.CamzyAdmin.showToast) window.CamzyAdmin.showToast(msg, type);
  }
  function fa(n) { try { return Number(n || 0).toLocaleString('fa-IR'); } catch (e) { return String(n); } }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var grid = $('#adm-cat-grid');
  var modal = $('#adm-category-modal');
  var delModal = $('#adm-category-delete-modal');
  var categories = [];
  var deleteId = null;
  var editSubs = []; // subcategory names being edited
  var busy = false;

  var EDIT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>';
  var DEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
  var FOLDER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';

  /* Category illustration assigned via the media gallery (image URL/path
     stored in c.icon); plain icon names keep the default folder glyph. */
  function catThumb(c) {
    var ic = c && c.icon;
    if (typeof ic === 'string' && /^(https?:|\/)/.test(ic)) {
      return '<img src="' + esc(ic) + '" alt="" loading="lazy" style="width:24px;height:24px;object-fit:contain">';
    }
    return FOLDER_SVG;
  }
  function syncIconPreview() {
    var inp = $('#adm-cm-icon'), prev = $('#adm-cm-icon-preview');
    if (!inp || !prev) return;
    var v = inp.value.trim();
    if (v) { prev.src = v; prev.style.visibility = 'visible'; }
    else { prev.removeAttribute('src'); prev.style.visibility = 'hidden'; }
  }

  function openModal(m) { if (m) { m.classList.add('is-open'); m.setAttribute('aria-hidden', 'false'); } }
  function closeModal(m) { if (m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); } }

  function fallbackCats() {
    try {
      if (window.AppData && Array.isArray(window.AppData.categories)) {
        return window.AppData.categories.map(function (c) {
          return { id: c.id, name: c.name, slug: c.slug, color: c.color || '', description: c.description || '', count: c.count || 0, subcategories: c.subcategories || [] };
        });
      }
    } catch (e) {}
    return [];
  }

  function load() {
    if (!grid) return;
    if (!useApi) { categories = fallbackCats(); render(); return; }
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:28px;color:var(--color-text-muted-dark)">در حال بارگذاری دسته‌بندی‌ها…</div>';
    api('/categories').then(function (rows) {
      categories = Array.isArray(rows) ? rows : [];
      render();
    }).catch(function () {
      useApi = false;
      categories = fallbackCats();
      render();
      toast('اتصال به سرور برقرار نشد؛ حالت فقط‌خواندن', 'danger');
    });
  }

  function subChips(c) {
    var subs = c.subcategories || [];
    if (!subs.length) return '<div class="adm-cat__subs adm-cat__subs--empty">بدون زیر‌دسته</div>';
    var shown = subs.slice(0, 4).map(function (s) {
      return '<span class="adm-subchip">' + esc(s) + '</span>';
    }).join('');
    if (subs.length > 4) shown += '<span class="adm-subchip adm-subchip--more">+' + fa(subs.length - 4) + '</span>';
    return '<div class="adm-cat__subs">' + shown + '</div>';
  }

  function render() {
    if (!grid) return;
    if (!categories.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:28px;color:var(--color-text-muted-dark)">دسته‌ای ثبت نشده است.</div>';
      return;
    }
    var max = Math.max.apply(null, categories.map(function (c) { return Number(c.count) || 0; }).concat([1]));
    grid.innerHTML = categories.map(function (c) {
      var pct = Math.max(4, Math.round(((Number(c.count) || 0) / max) * 100));
      var color = c.color || 'var(--color-primary)';
      return '<div class="adm-cat" data-id="' + c.id + '">' +
        '<span class="adm-cat__icon" style="background:color-mix(in srgb,' + esc(color) + ' 14%,#fff);color:' + esc(color) + '">' + catThumb(c) + '</span>' +
        '<div class="adm-cat__meta">' +
        '<span class="adm-cat__name">' + esc(c.name) + '</span>' +
        '<span class="adm-cat__count">' + fa(c.count || 0) + ' محصول</span>' +
        '<span class="adm-cat__bar"><span style="width:' + pct + '%;background:' + esc(color) + '"></span></span>' +
        subChips(c) +
        '</div>' +
        '<div class="adm-cat__actions">' +
        '<button type="button" class="adm-btn-icon" data-cedit="' + c.id + '" title="ویرایش">' + EDIT_SVG + '</button>' +
        '<button type="button" class="adm-btn-icon adm-btn-icon--danger" data-cdel="' + c.id + '" title="حذف">' + DEL_SVG + '</button>' +
        '</div></div>';
    }).join('');
  }

  /* ── Edit-modal subcategory chips ── */
  function renderEditSubs() {
    var box = $('#adm-cm-subs');
    if (!box) return;
    box.innerHTML = editSubs.length
      ? editSubs.map(function (s, i) {
          return '<span class="adm-subchip adm-subchip--edit">' + esc(s) +
            '<button type="button" data-csub-rm="' + i + '" aria-label="حذف">×</button></span>';
        }).join('')
      : '<span style="font-size:12px;color:var(--text-muted)">زیر‌دسته‌ای ثبت نشده است.</span>';
  }

  function openAdd() {
    $('#adm-category-form').reset();
    $('#adm-cm-id').value = '';
    $('#adm-cm-title').textContent = 'افزودن دسته';
    $('#adm-cm-submit').textContent = 'ذخیره دسته';
    $('#adm-cm-color').value = '#D71920';
    editSubs = [];
    renderEditSubs();
    syncIconPreview();
    openModal(modal);
  }

  function openEdit(id) {
    var c = categories.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!c) return;
    $('#adm-cm-id').value = c.id;
    $('#adm-cm-name').value = c.name || '';
    $('#adm-cm-slug').value = c.slug || '';
    $('#adm-cm-color').value = /^#[0-9a-fA-F]{6}$/.test(c.color || '') ? c.color : '#D71920';
    $('#adm-cm-icon').value = c.icon || '';
    syncIconPreview();
    $('#adm-cm-desc').value = c.description || '';
    editSubs = (c.subcategories || []).slice();
    renderEditSubs();
    $('#adm-cm-title').textContent = 'ویرایش دسته';
    $('#adm-cm-submit').textContent = 'به‌روزرسانی دسته';
    openModal(modal);
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-cedit],[data-cdel],[data-cm-close],[data-cdel-close],[data-csub-rm]') : null;
    if (!t) return;
    if (t.hasAttribute('data-cedit')) { e.preventDefault(); openEdit(t.getAttribute('data-cedit')); }
    else if (t.hasAttribute('data-cdel')) {
      e.preventDefault();
      deleteId = t.getAttribute('data-cdel');
      var c = categories.filter(function (x) { return String(x.id) === String(deleteId); })[0];
      $('#adm-cdel-text').textContent = c
        ? '«' + c.name + '» (' + fa(c.count || 0) + ' محصول) حذف شود؟' + ((c.count || 0) > 0 ? ' محصولات آن بدون دسته می‌شوند.' : '')
        : 'آیا از حذف این دسته مطمئن هستید؟';
      openModal(delModal);
    }
    else if (t.hasAttribute('data-cm-close')) closeModal(modal);
    else if (t.hasAttribute('data-cdel-close')) { closeModal(delModal); deleteId = null; }
    else if (t.hasAttribute('data-csub-rm')) {
      editSubs.splice(Number(t.getAttribute('data-csub-rm')), 1);
      renderEditSubs();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeModal(modal); closeModal(delModal); deleteId = null; }
  });

  var addBtn = $('#adm-add-category-btn');
  if (addBtn) addBtn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openAdd(); });
  var iconInput = $('#adm-cm-icon');
  if (iconInput) iconInput.addEventListener('input', syncIconPreview);

  var subAdd = $('#adm-cm-sub-add');
  if (subAdd) subAdd.addEventListener('click', function () {
    var inp = $('#adm-cm-sub-input');
    var v = inp.value.trim();
    if (!v) { inp.focus(); return; }
    if (editSubs.indexOf(v) !== -1) { toast('این زیر‌دسته قبلاً اضافه شده است', 'danger'); return; }
    editSubs.push(v);
    inp.value = '';
    inp.focus();
    renderEditSubs();
  });

  var form = $('#adm-category-form');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    if (!useApi) { toast('حالت فقط‌خواندن فعال است', 'danger'); return; }
    var id = $('#adm-cm-id').value;
    var name = $('#adm-cm-name').value.trim();
    var slug = $('#adm-cm-slug').value.trim();
    var color = $('#adm-cm-color').value;
    var icon = $('#adm-cm-icon').value.trim();
    var desc = $('#adm-cm-desc').value.trim();
    if (!name) { toast('نام دسته الزامی است', 'danger'); $('#adm-cm-name').focus(); return; }
    var dup = categories.filter(function (x) {
      return (String(x.slug).toLowerCase() === slug.toLowerCase() || x.name === name) && String(x.id) !== String(id);
    })[0];
    if (slug && dup && String(dup.slug).toLowerCase() === slug.toLowerCase()) { toast('این نامک قبلاً ثبت شده است', 'danger'); return; }
    busy = true;
    var payload = { name: name, slug: slug, color: color, icon: icon, description: desc, subcategories: editSubs };
    var req = id
      ? api('/categories/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(payload) })
      : api('/categories', { method: 'POST', body: JSON.stringify(payload) });
    req.then(function (saved) {
      if (id) categories = categories.map(function (x) { return String(x.id) === String(id) ? saved : x; });
      else categories.unshift(saved);
      closeModal(modal);
      render();
      toast(id ? 'دسته به‌روزرسانی شد' : 'دسته جدید اضافه شد', 'success');
    }).catch(function (err) {
      toast(err.message || 'ذخیره دسته ناموفق بود', 'danger');
    }).then(function () { busy = false; });
  });

  var delConfirm = $('#adm-cdel-confirm');
  if (delConfirm) delConfirm.addEventListener('click', function () {
    if (deleteId == null || busy) return;
    if (!useApi) { toast('حالت فقط‌خواندن فعال است', 'danger'); return; }
    busy = true;
    function doDelete(force) {
      api('/categories/' + encodeURIComponent(deleteId) + (force ? '?force=1' : ''), { method: 'DELETE' })
        .then(function () {
          categories = categories.filter(function (x) { return String(x.id) !== String(deleteId); });
          closeModal(delModal);
          deleteId = null;
          render();
          toast('دسته حذف شد', 'danger');
          busy = false;
        })
        .catch(function (err) {
          if (!force && /has products/.test(err.message || '')) {
            if (window.confirm('این دسته محصول دارد. حذف شود؟ (محصولات بدون دسته می‌شوند)')) { doDelete(true); return; }
          } else {
            toast(err.message || 'حذف دسته ناموفق بود', 'danger');
          }
          busy = false;
        });
    }
    doDelete(false);
  });

  load();
  window.CamzyAdminCategories = { reload: load };
})();
