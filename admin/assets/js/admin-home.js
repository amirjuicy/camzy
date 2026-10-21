/* ================================================================
   Camzy — Admin Homepage (مدیریت صفحه اصلی)
   Edits homepage sections stored in the existing site_content
   table via GET/PUT /api/content (same keys the storefront
   common.js applies dynamically): hero slider, promo banners,
   featured categories/products, amazing discounts, section
   titles, order and per-section enable/disable.
   ================================================================ */
(function () {
  'use strict';
  var root = document.querySelector('section[data-view="home"]');
  if (!root) return;

  var SECTIONS = [
    { key: 'hero', name: 'اسلایدر اصلی', hasTitle: false },
    { key: 'categories', name: 'دسته‌های ویژه', hasTitle: true, titleKey: 'section.categories.title' },
    { key: 'bestsellers', name: 'محصولات ویژه', hasTitle: true, titleKey: 'section.bestsellers.title' },
    { key: 'amazing', name: 'تخفیف‌های شگفت‌انگیز', hasTitle: true, titleKey: 'section.offers.title' },
    { key: 'new', name: 'جدیدترین محصولات', hasTitle: true, titleKey: 'section.new.title' },
    { key: 'brands', name: 'برندهای محبوب', hasTitle: true, titleKey: 'section.brands.title' }
  ];

  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toast(m, t) { if (window.CamzyAdmin && window.CamzyAdmin.showToast) window.CamzyAdmin.showToast(m, t); }
  function token() {
    try { var s = JSON.parse(localStorage.getItem('as_admin_session') || 'null'); return (s && s.token) || ''; }
    catch (e) { return ''; }
  }
  function api(path, opts) {
    var h = { 'Content-Type': 'application/json' };
    var t = token();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return fetch('/api' + path, Object.assign({ headers: h }, opts || {})).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || ('Request failed ' + res.status));
        return data;
      });
    });
  }

  var content = {};
  var order = ['hero', 'categories', 'bestsellers', 'amazing', 'new', 'brands'];
  var categories = [];
  var products = [];

  function enabledOf(key) { return String(content['home.sections.' + key + '.enabled'] || '1') === '1'; }
  function titleOf(sec) { return content[sec.titleKey] != null ? content[sec.titleKey] : ''; }

  /* ── Sections (title / order / enable) ─────────────────── */
  function renderSections() {
    var list = $('#home-sections-list');
    if (!list) return;
    list.innerHTML = order.map(function (key, i) {
      var sec = SECTIONS.filter(function (s) { return s.key === key; })[0];
      if (!sec) return '';
      var on = enabledOf(key);
      return '<div class="adm-switch-row" data-home-sec="' + esc(key) + '">'
        + '<div class="adm-switch-row__meta">'
        + '<span class="adm-switch-row__title">' + esc(sec.name) + '</span>'
        + (sec.hasTitle
          ? '<input class="input" data-home-title="' + esc(key) + '" value="' + esc(titleOf(sec)) + '" placeholder="عنوان بخش" style="margin-top:6px;max-width:320px">'
          : '<span class="adm-switch-row__desc">اسلایدهای بنر اصلی</span>')
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:6px">'
        + '<button type="button" class="adm-btn-icon" data-home-move="' + esc(key) + '|-1" title="بالا" ' + (i === 0 ? 'disabled' : '') + '><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg></button>'
        + '<button type="button" class="adm-btn-icon" data-home-move="' + esc(key) + '|1" title="پایین" ' + (i === order.length - 1 ? 'disabled' : '') + '><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>'
        + '<label class="adm-switch"><input type="checkbox" data-home-enabled="' + esc(key) + '"' + (on ? ' checked' : '') + '><span class="adm-switch__track"></span></label>'
        + '</div></div>';
    }).join('');
  }

  function collectSections() {
    var payload = {};
    order.forEach(function (key) {
      var en = $('[data-home-enabled="' + key + '"]');
      payload['home.sections.' + key + '.enabled'] = en && en.checked ? '1' : '0';
      var sec = SECTIONS.filter(function (s) { return s.key === key; })[0];
      if (sec && sec.hasTitle) {
        var ti = $('[data-home-title="' + key + '"]');
        if (ti) payload[sec.titleKey] = ti.value.trim();
      }
    });
    payload['home.sections.order'] = order.join(',');
    return payload;
  }

  /* ── Hero / banners ────────────────────────────────────── */
  function fillHeroBanners() {
    for (var i = 1; i <= 4; i++) {
      ['badge', 'title', 'text', 'image'].forEach(function (f) {
        var el = document.getElementById('home-hero-' + i + '-' + f);
        if (el && content['hero.slide' + i + '.' + f] != null) el.value = content['hero.slide' + i + '.' + f];
      });
      var pv = document.getElementById('home-hero-' + i + '-preview');
      if (pv) pv.src = content['hero.slide' + i + '.image'] || '';
    }
    var tb = document.getElementById('home-topbar-enabled');
    if (tb) tb.checked = String(content['home.topbar.enabled'] || '1') === '1';
    var th = document.getElementById('home-topbar-height');
    if (th) th.value = content['promo.topbar.height'] || '35';
    var ih = document.getElementById('home-topbar-img-height');
    if (ih) ih.value = content['promo.topbar.img_height'] || '20';
    var iw = document.getElementById('home-topbar-img-width');
    if (iw) iw.value = content['promo.topbar.img_width'] || '20';
    loadPromoMessages();
    renderPromoList();
    updateTopbarPreview();
  }
  function collectHero() {
    var out = {};
    for (var i = 1; i <= 4; i++) {
      ['badge', 'title', 'text', 'image'].forEach(function (f) {
        var el = document.getElementById('home-hero-' + i + '-' + f);
        if (el) out['hero.slide' + i + '.' + f] = el.value.trim();
      });
    }
    return out;
  }
  // live preview when image URL edited
  document.addEventListener('input', function(e){
    var id=e.target.id||''; var m=id.match(/^home-hero-(\d)-image$/); if(m){ var pv=document.getElementById('home-hero-'+m[1]+'-preview'); if(pv) pv.src=e.target.value.trim(); }
  });
  /* ── Promo top bar (dynamic messages) ────────────────────
     Messages are stored as promo.topbar.<n> + promo.topbar.<n>.image
     with promo.topbar.count telling the storefront how many to render.
     Legacy data (no count key) falls back to the highest non-empty index. */
  var promoMessages = [];
  var promoPrevCount = 0;

  function promoCountFromContent() {
    var raw = content['promo.topbar.count'];
    var n = (raw != null && String(raw).trim() !== '') ? parseInt(raw, 10) : NaN;
    if (!isFinite(n) || n < 0) {
      n = 0;
      for (var i = 1; i <= 20; i++) {
        var t = content['promo.topbar.' + i], im = content['promo.topbar.' + i + '.image'];
        if ((t != null && String(t) !== '') || (im != null && String(im) !== '')) n = i;
      }
      if (!n) n = 3; // bundled defaults ship 3 messages
    }
    return Math.max(1, Math.min(n, 20));
  }

  function loadPromoMessages() {
    var n = promoCountFromContent();
    promoMessages = [];
    for (var j = 1; j <= n; j++) {
      promoMessages.push({
        text: content['promo.topbar.' + j] != null ? String(content['promo.topbar.' + j]) : '',
        image: content['promo.topbar.' + j + '.image'] != null ? String(content['promo.topbar.' + j + '.image']) : ''
      });
    }
    promoPrevCount = n;
  }

  function renderPromoList() {
    var box = document.getElementById('home-promo-list');
    if (!box) return;
    if (!promoMessages.length) {
      box.innerHTML = '<p style="font-size:13px;color:var(--text-muted);padding:12px;border:1px dashed var(--border);border-radius:var(--radius-lg);margin:0">هیچ پیامی ثبت نشده است. با دکمه «+ افزودن پیام» پیام جدید اضافه کنید.</p>';
    } else {
      box.innerHTML = promoMessages.map(function (m, i) {
        var n = i + 1;
        var hasImg = !!m.image;
        return '<div class="adm-card" data-promo-row="' + n + '" style="padding:10px;margin:0">'
          + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
          + '<span style="font-size:12px;font-weight:var(--font-weight-bold)">پیام ' + n + '</span>'
          + '<span style="flex:1"></span>'
          + '<button type="button" class="adm-btn-icon adm-btn-icon--danger" data-promo-remove="' + n + '" title="حذف این پیام"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>'
          + '</div>'
          + '<input class="input" type="text" id="home-promo-' + n + '" data-promo-text="' + n + '" placeholder="متن پیام تبلیغاتی" value="' + esc(m.text) + '" style="width:100%">'
          + '<div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap">'
          + '<input type="hidden" id="home-promo-' + n + '-image" data-promo-image="' + n + '" value="' + esc(m.image) + '">'
          + '<button type="button" class="btn btn-secondary btn-sm" data-media-target="home-promo-' + n + '-image">انتخاب تصویر</button>'
          + '<img id="home-promo-' + n + '-preview" alt="" style="width:32px;height:32px;object-fit:contain;border:1px solid var(--border);border-radius:4px;' + (hasImg ? '' : 'display:none;') + 'background:#f8f9fa">'
          + '<button type="button" class="adm-btn-icon" data-promo-clear-image="' + n + '" title="حذف تصویر" style="' + (hasImg ? '' : 'display:none;') + '">✕</button>'
          + '</div>'
          + '</div>';
      }).join('');
      // Sync thumbnails (values are escaped in HTML but src needs the raw URL).
      promoMessages.forEach(function (m, i) {
        var pv = document.getElementById('home-promo-' + (i + 1) + '-preview');
        if (pv) { if (m.image) { pv.src = m.image; pv.style.display = ''; } else { pv.removeAttribute('src'); pv.style.display = 'none'; } }
      });
    }
    var hint = document.getElementById('home-promo-count-hint');
    if (hint) hint.textContent = 'تعداد پیام‌ها: ' + promoMessages.length + ' — دقیقاً همین تعداد در نوار بالای سایت نمایش داده می‌شود.';
  }

  function collectBanners() {
    var out = {};
    for (var j = 0; j < promoMessages.length; j++) {
      out['promo.topbar.' + (j + 1)] = promoMessages[j].text;
      out['promo.topbar.' + (j + 1) + '.image'] = promoMessages[j].image;
    }
    // Clear stale keys left over when the list shrank (max 20 slots).
    for (var k = promoMessages.length + 1; k <= Math.max(promoPrevCount, 3); k++) {
      out['promo.topbar.' + k] = '';
      out['promo.topbar.' + k + '.image'] = '';
    }
    out['promo.topbar.count'] = String(promoMessages.length);
    var tb = document.getElementById('home-topbar-enabled');
    out['home.topbar.enabled'] = tb && tb.checked ? '1' : '0';
    var th = document.getElementById('home-topbar-height');
    if (th && th.value) out['promo.topbar.height'] = th.value;
    var ih = document.getElementById('home-topbar-img-height');
    if (ih && ih.value) out['promo.topbar.img_height'] = ih.value;
    var iw = document.getElementById('home-topbar-img-width');
    if (iw && iw.value) out['promo.topbar.img_width'] = iw.value;
    return out;
  }

  function updateTopbarPreview() {
    var preview = document.getElementById('home-topbar-preview');
    if (!preview) return;
    var viewport = preview.querySelector('.promo-topbar__viewport');
    var th = document.getElementById('home-topbar-height');
    var ih = document.getElementById('home-topbar-img-height');
    var iw = document.getElementById('home-topbar-img-width');
    var h = parseInt(th && th.value, 10) || 35;
    var ihVal = parseInt(ih && ih.value, 10) || 20;
    var iwVal = parseInt(iw && iw.value, 10) || 20;
    if (viewport) viewport.style.height = h + 'px';
    if (viewport) {
      // Mirror the storefront structure: one .promo-topbar__msg per saved
      // message, absolutely stacked, only the active one visible.
      viewport.innerHTML = promoMessages.map(function (m, i) {
        var inner = '';
        if (m.image) inner += '<img class="promo-topbar__img" src="' + esc(m.image) + '" alt="">';
        if (m.text) inner += '<span class="promo-topbar__text">' + esc(m.text) + '</span>';
        return '<span class="promo-topbar__msg' + (i === 0 ? ' is-active' : '') + (m.image ? ' has-image' : '') + '">' + (inner || '<span class="promo-topbar__text">پیام نوار تبلیغاتی</span>') + '</span>';
      }).join('');
    }
    var dimsDisplay = document.getElementById('home-topbar-dims-display');
    if (dimsDisplay) {
      dimsDisplay.textContent = 'ابعاد فعلی: ارتفاع نوار ' + h + 'px، تصویر ' + iwVal + '×' + ihVal + 'px، عرض صفحه ' + window.innerWidth + 'px';
    }
  }

  /* ── Featured selections ───────────────────────────────── */
  function slugList(key) {
    return String(content[key] || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function renderCats() {
    var box = $('#home-feat-cats');
    if (!box) return;
    var sel = slugList('home.featured.categories');
    if (!categories.length) { box.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">دسته‌ای یافت نشد.</p>'; return; }
    box.innerHTML = categories.map(function (c) {
      var on = !sel.length || sel.indexOf(c.slug) !== -1;
      return '<label style="display:flex;align-items:center;gap:8px;font-size:13px;padding:6px 0;border-bottom:1px dashed var(--border-color-light)">'
        + '<input type="checkbox" data-home-cat="' + esc(c.slug) + '"' + (on ? ' checked' : '') + '> ' + esc(c.name) + '</label>';
    }).join('');
  }
  function productCheckRow(p, attr, sel) {
    var slug = p.slug || p.slug === 0 ? p.slug : '';
    var key = String(p.slug || p.id || '');
    var on = !sel.length || sel.indexOf(key) !== -1;
    var name = p.name || ('#' + p.id);
    return '<label data-home-prow style="display:flex;align-items:center;gap:8px;font-size:13px;padding:6px 0;border-bottom:1px dashed var(--border-color-light)" data-search="' + esc((name + ' ' + key).toLowerCase()) + '">'
      + '<input type="checkbox" ' + attr + '="' + esc(key) + '"' + (on ? ' checked' : '') + '> ' + esc(name)
      + ' <span class="adm-table__sub" style="direction:ltr">' + esc(key) + '</span></label>';
  }
  function renderProducts() {
    var sel = slugList('home.featured.products');
    var box = $('#home-feat-prods');
    if (box) {
      box.innerHTML = products.length ? products.map(function (p) { return productCheckRow(p, 'data-home-prod', sel); }).join('')
        : '<p style="font-size:13px;color:var(--text-muted)">محصولی یافت نشد.</p>';
    }
    var asel = slugList('home.amazing.products');
    var abox = $('#home-amaz-prods');
    if (abox) {
      abox.innerHTML = products.length ? products.map(function (p) { return productCheckRow(p, 'data-home-amaz', asel); }).join('')
        : '<p style="font-size:13px;color:var(--text-muted)">محصولی یافت نشد.</p>';
    }
  }
  function collectChecked(attr) {
    return $$('[' + attr + ']').filter(function (cb) { return cb.checked; }).map(function (cb) { return cb.getAttribute(attr); });
  }
  function fillAmazing() {
    var ends = document.getElementById('home-amaz-ends');
    if (ends) {
      var v = String(content['home.amazing.ends_at'] || '').trim();
      try {
        if (v) {
          var d = new Date(v);
          if (isFinite(d.getTime())) {
            var p = function (n) { return String(n).padStart(2, '0'); };
            ends.value = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
          }
        }
      } catch (e) {}
    }
  }

  function save(payload, btn) {
    if (btn) btn.disabled = true;
    api('/content', { method: 'PUT', body: JSON.stringify(payload) }).then(function (c) {
      content = c || content;
      renderSections();
      toast('تنظیمات صفحه اصلی ذخیره شد', 'success');
    }).catch(function (err) {
      toast(err.message || 'خطا در ذخیره تنظیمات', 'danger');
    }).finally(function () { if (btn) btn.disabled = false; });
  }

  /* ── Events ────────────────────────────────────────────── */
  root.addEventListener('click', function (e) {
    var mv = e.target.closest ? e.target.closest('[data-home-move]') : null;
    if (mv) {
      var parts = mv.getAttribute('data-home-move').split('|');
      var idx = order.indexOf(parts[0]);
      var j = idx + parseInt(parts[1], 10);
      if (idx > -1 && j >= 0 && j < order.length) {
        // Persist current inputs before re-render.
        var draft = collectSections();
        Object.keys(draft).forEach(function (k) {
          if (k !== 'home.sections.order') content[k] = draft[k];
        });
        order.splice(j, 0, order.splice(idx, 1)[0]);
        renderSections();
      }
      return;
    }
    var sv = e.target.closest ? e.target.closest('[data-home-save]') : null;
    if (sv) {
      var which = sv.getAttribute('data-home-save');
      if (which === 'sections') save(collectSections(), sv);
      else if (which === 'hero') save(collectHero(), sv);
      else if (which === 'banners') save(collectBanners(), sv);
      else if (which === 'cats') save({ 'home.featured.categories': collectChecked('data-home-cat').join(',') }, sv);
      else if (which === 'featured') save({ 'home.featured.products': collectChecked('data-home-prod').join(',') }, sv);
      else if (which === 'amazing') {
        var ends = document.getElementById('home-amaz-ends');
        var out = { 'home.amazing.products': collectChecked('data-home-amaz').join(',') };
        out['home.amazing.ends_at'] = ends && ends.value ? new Date(ends.value).toISOString() : '';
        save(out, sv);
      }
    }
    var clearImg = e.target.closest ? e.target.closest('[data-promo-clear-image]') : null;
    if (clearImg) {
      var cidx = parseInt(clearImg.getAttribute('data-promo-clear-image'), 10) - 1;
      if (promoMessages[cidx]) {
        promoMessages[cidx].image = '';
        var imgInput = document.getElementById('home-promo-' + (cidx + 1) + '-image');
        var imgPreview = document.getElementById('home-promo-' + (cidx + 1) + '-preview');
        if (imgInput) imgInput.value = '';
        if (imgPreview) { imgPreview.removeAttribute('src'); imgPreview.style.display = 'none'; }
        clearImg.style.display = 'none';
        updateTopbarPreview();
      }
      return;
    }
    var rm = e.target.closest ? e.target.closest('[data-promo-remove]') : null;
    if (rm) {
      var ridx = parseInt(rm.getAttribute('data-promo-remove'), 10) - 1;
      promoMessages.splice(ridx, 1);
      renderPromoList();
      updateTopbarPreview();
      toast('پیام حذف شد. برای اعمال روی سایت «ذخیره بنرها» را بزنید.', 'info');
      return;
    }
    if (e.target.closest && e.target.closest('#home-promo-add')) {
      if (promoMessages.length >= 20) { toast('حداکثر ۲۰ پیام مجاز است', 'warning'); return; }
      promoMessages.push({ text: '', image: '' });
      renderPromoList();
      updateTopbarPreview();
      var last = document.getElementById('home-promo-' + promoMessages.length);
      if (last) last.focus();
      return;
    }
  });
  /* Live preview: typing a message or picking an image updates the preview
     immediately (the media picker dispatches bubbling input/change events). */
  root.addEventListener('input', function (e) {
    var t = e.target && e.target.getAttribute ? e.target.getAttribute('data-promo-text') : null;
    if (t) {
      var ti = parseInt(t, 10) - 1;
      if (promoMessages[ti]) { promoMessages[ti].text = e.target.value; updateTopbarPreview(); }
      return;
    }
    var im = e.target && e.target.getAttribute ? e.target.getAttribute('data-promo-image') : null;
    if (im) {
      var ii = parseInt(im, 10) - 1;
      if (promoMessages[ii]) {
        promoMessages[ii].image = e.target.value.trim();
        var pv = document.getElementById('home-promo-' + (ii + 1) + '-preview');
        var clr = document.querySelector('[data-promo-clear-image="' + (ii + 1) + '"]');
        if (promoMessages[ii].image) {
          if (pv) { pv.src = promoMessages[ii].image; pv.style.display = ''; }
          if (clr) clr.style.display = '';
        } else {
          if (pv) { pv.removeAttribute('src'); pv.style.display = 'none'; }
          if (clr) clr.style.display = 'none';
        }
        updateTopbarPreview();
      }
    }
  });
  root.addEventListener('change', function (e) {
    var im = e.target && e.target.getAttribute ? e.target.getAttribute('data-promo-image') : null;
    if (im) {
      // Some integrations emit change without input — keep the preview in sync.
      var evt = new Event('input', { bubbles: true });
      try { e.target.dispatchEvent(evt); } catch (_) {}
    }
  });
  ['home-topbar-height', 'home-topbar-img-height', 'home-topbar-img-width'].forEach(function (id) {
    var inp = document.getElementById(id);
    if (!inp) return;
    inp.addEventListener('input', function () { updateTopbarPreview(); });
  });
  window.addEventListener('resize', function () { updateTopbarPreview(); });
  ['home-feat-search', 'home-amaz-search'].forEach(function (id) {
    var inp = document.getElementById(id);
    if (!inp) return;
    inp.addEventListener('input', function () {
      var q = inp.value.trim().toLowerCase();
      var box = document.getElementById(id === 'home-feat-search' ? 'home-feat-prods' : 'home-amaz-prods');
      if (!box) return;
      $$('[data-home-prow]', box).forEach(function (row) {
        row.style.display = !q || (row.getAttribute('data-search') || '').indexOf(q) !== -1 ? '' : 'none';
      });
    });
  });

  /* ── Init ──────────────────────────────────────────────── */
  Promise.all([
    api('/content').catch(function () { return null; }),
    api('/categories').catch(function () { return []; }),
    api('/products?limit=200').catch(function () { return []; })
  ]).then(function (r) {
    if (r[0]) {
      content = r[0];
      var o = String(content['home.sections.order'] || '').split(',').map(function (x) { return x.trim(); }).filter(function (k) {
        return SECTIONS.some(function (s) { return s.key === k; });
      });
      if (o.length) {
        SECTIONS.forEach(function (s) { if (o.indexOf(s.key) === -1) o.push(s.key); });
        order = o;
      }
    }
    if (Array.isArray(r[1])) categories = r[1].map(function (c) { return { slug: c.slug, name: c.name }; });
    if (Array.isArray(r[2])) products = r[2];
    renderSections();
    fillHeroBanners();
    renderCats();
    renderProducts();
    fillAmazing();
  });
})();
