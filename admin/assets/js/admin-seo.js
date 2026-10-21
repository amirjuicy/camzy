/* ================================================================
   Camzy — Admin SEO (تنظیمات SEO)
   Global SEO (site title, meta description/keywords, Open Graph,
   robots, Search Console code) stored in the existing settings
   table via /api/settings (seo.* keys). Per-page / per-product /
   per-article overrides (title, description, noindex) stored in
   seo_meta via /api/admin/seo/items, reusing existing
   product/article/page data for names and search.
   ================================================================ */
(function () {
  'use strict';
  var sec = document.querySelector('section[data-view="seo"]');
  if (!sec) return;

  var GLOBAL_KEYS = ['seo.site_title', 'seo.meta_description', 'seo.meta_keywords', 'seo.robots', 'seo.gsc_code'];
  var OG_KEYS = ['seo.og_title', 'seo.og_description', 'seo.og_image'];
  var FIELD = {
    'seo.site_title': 'seo-g-title', 'seo.meta_description': 'seo-g-desc', 'seo.meta_keywords': 'seo-g-kw',
    'seo.robots': 'seo-g-robots', 'seo.gsc_code': 'seo-g-gsc',
    'seo.og_title': 'seo-og-title', 'seo.og_description': 'seo-og-desc', 'seo.og_image': 'seo-og-image'
  };

  function $(s, c) { return (c || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toast(m, t) { if (window.CamzyAdmin && window.CamzyAdmin.showToast) window.CamzyAdmin.showToast(m, t); }
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

  /* ── Global + OG ──────────────────────────────────────── */
  /* The site name is centralized in Admin → اطلاعات فروشگاه (store.name).
     SEO title/description are edited as templates around {name} so the name
     itself can never be duplicated into a second editable field. */
  var SEO_NAME_TPL = ['seo.site_title', 'seo.meta_description'];
  function toTemplate(v, s) {
    var name = String((s && s['store.name']) || '').trim();
    if (!name) return v;
    return String(v == null ? '' : v).split(name).join('{name}');
  }
  function fillGlobal(s) {
    if (!s) return;
    Object.keys(FIELD).forEach(function (k) {
      var el = document.getElementBy(FIELD[k]);
      if (!el || s[k] == null) return;
      el.value = SEO_NAME_TPL.indexOf(k) !== -1 ? toTemplate(s[k], s) : s[k];
    });
  }
  function loadGlobal() {
    api('/settings').then(fillGlobal).catch(function () {});
  }
  function collectGlobal(keys) {
    var out = {};
    keys.forEach(function (k) {
      var el = document.getElementById(FIELD[k]);
      if (el) out[k] = el.value;
    });
    return out;
  }

  /* ── Per-item tables (page / product / article) ───────── */
  function rowHtml(it) {
    return '<tr data-scope="' + esc(it.scope) + '" data-ref="' + esc(it.ref) + '">'
      + '<td><strong>' + esc(it.name || it.ref) + '</strong><div class="adm-table__sub" style="direction:ltr">' + esc(it.slug || it.ref) + '</div></td>'
      + '<td><input class="input" data-seo-title value="' + esc(it.title || '') + '" placeholder="پیش‌فرض سراسری" style="min-width:180px"></td>'
      + '<td><input class="input" data-seo-desc value="' + esc(it.description || '') + '" placeholder="پیش‌فرض سراسری" style="min-width:220px"></td>'
      + '<td><label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" data-seo-noindex' + (it.noindex ? ' checked' : '') + '> noindex</label></td>'
      + '<td><button type="button" class="btn btn-secondary btn-sm" data-seo-save>ذخیره</button></td></tr>';
  }
  function loadScope(scope, q) {
    var box = $('#adm-seo-' + scope + '-list');
    if (!box) return;
    box.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">در حال بارگذاری…</td></tr>';
    var url = '/admin/seo/items?scope=' + encodeURIComponent(scope) + '&limit=50' + (q ? '&q=' + encodeURIComponent(q) : '');
    api(url).then(function (data) {
      var items = (data && data.items) || [];
      var total = (data && data.total) || 0;
      box.innerHTML = items.length ? items.map(rowHtml).join('')
        : '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">موردی یافت نشد.</td></tr>';
      var meta = $('#adm-seo-' + scope + '-count');
      if (meta) meta.textContent = 'نمایش ' + items.length + ' از ' + total;
    }).catch(function (err) {
      box.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">خطا: ' + esc(err.message || '') + '</td></tr>';
    });
  }

  /* ── Events ───────────────────────────────────────────── */
  sec.addEventListener('click', function (e) {
    var g = e.target.closest ? e.target.closest('[data-seo-save-global]') : null;
    if (g) {
      var keys = g.getAttribute('data-seo-save-global') === 'og' ? OG_KEYS : GLOBAL_KEYS;
      g.disabled = true;
      api('/settings', { method: 'PUT', body: JSON.stringify(collectGlobal(keys)) }).then(function (s) {
        fillGlobal(s);
        toast('تنظیمات SEO ذخیره شد', 'success');
      }).catch(function (err) { toast(err.message || 'خطا در ذخیره', 'danger'); })
        .finally(function () { g.disabled = false; });
      return;
    }
    var sv = e.target.closest ? e.target.closest('[data-seo-save]') : null;
    if (sv) {
      var tr = sv.closest('tr');
      if (!tr) return;
      var payload = {
        scope: tr.getAttribute('data-scope'),
        ref: tr.getAttribute('data-ref'),
        title: tr.querySelector('[data-seo-title]').value.trim(),
        description: tr.querySelector('[data-seo-desc]').value.trim(),
        noindex: tr.querySelector('[data-seo-noindex]').checked
      };
      sv.disabled = true;
      api('/admin/seo/items', { method: 'PUT', body: JSON.stringify(payload) }).then(function () {
        toast('سئوی این صفحه ذخیره شد', 'success');
      }).catch(function (err) { toast(err.message || 'خطا در ذخیره', 'danger'); })
        .finally(function () { sv.disabled = false; });
    }
  });

  var deb = {};
  ['page', 'product', 'article'].forEach(function (scope) {
    var inp = document.getElementById('adm-seo-' + scope + '-search');
    if (!inp) return;
    inp.addEventListener('input', function () {
      if (deb[scope]) clearTimeout(deb[scope]);
      deb[scope] = setTimeout(function () { loadScope(scope, inp.value.trim()); }, 350);
    });
  });

  /* ── Init ─────────────────────────────────────────────── */
  if (!isHttp()) { toast('برای مدیریت SEO، پنل را از طریق سرور باز کنید', 'danger'); return; }
  loadGlobal();
  loadScope('page', '');
  loadScope('product', '');
  loadScope('article', '');
  window.CamzyAdminSeo = { reload: function () { loadGlobal(); loadScope('page', ''); loadScope('product', ''); loadScope('article', ''); } };
})();
