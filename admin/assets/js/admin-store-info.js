/* ================================================================
   Camzy — Admin Store Info (centralized identity/contact)
   The ONLY place store identity/contact values are editable:
      store.name, store.logo, store.phone, store.phone2, store.email,
      store.address, store.map_url, store.latitude, store.longitude,
      store.hours, store.hours_detail, store.website, store.desc,
      store.social_telegram, store.social_instagram, store.social_twitter,
      store.social_youtube (footer social links)
   Persists via PUT /api/settings (SQLite `settings` table).
   Mirrors values read-only into Settings (s-*) and Content
   (c-footer-*) so no other Admin section can override them.

   `store.logo` is the single source of truth for the storefront logo.
   The Admin panel's own sidebar bolt icon is deliberately NOT tied to it.
   Favicon/PWA icons are DERIVED here (canvas -> PNG -> /api/admin/
   store-logo/icons), so there is no second editable icon setting.
   ================================================================ */
(function () {
  'use strict';

  var API_BASE = '/api';
  var ICON_SIZES = [32, 180, 192, 512];
  var FALLBACK_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="34" height="34" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';

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

  /* ── Store logo field ────────────────────────────────────────
     Preview + pick/upload/remove, plus the one-time derivation of the
     PNG icons the browser and the PWA installer need. The derived
     files are outputs of `store.logo`, never a separate setting. */
  function logoInput() { return $('#si-logo'); }
  function logoPreview() { return $('#si-logo-preview'); }
  function logoStatus(msg, isError) {
    var el = $('#si-logo-status');
    if (el) { el.textContent = msg || ''; el.style.color = isError ? 'var(--color-danger,#d33)' : 'var(--text-muted)'; }
  }

  function renderLogoPreview(url) {
    var box = logoPreview();
    if (!box) return;
    if (url) {
      box.innerHTML = '<img src="' + String(url).replace(/"/g, '&quot;') + '" alt="" ' +
        'style="width:100%;height:100%;object-fit:contain;display:block">';
    } else {
      box.innerHTML = FALLBACK_SVG;
    }
  }

  function setLogo(url) {
    var inp = logoInput();
    if (inp) inp.value = url || '';
    renderLogoPreview(url || '');
    var clearBtn = $('#si-logo-clear');
    if (clearBtn) clearBtn.disabled = !url;
    logoStatus(url ? '' : 'در حال حاضر لوگوی پیش‌فرض سایت نمایش داده می‌شود.');
  }

  /* Upload the source logo through the existing Gallery API (same storage the
     rest of the media library uses), then derive the icon sizes. */
  function uploadLogoFile(file) {
    if (!file) return Promise.resolve('');
    var fd = new FormData();
    fd.append('image', file);
    logoStatus('در حال آپلود…');
    return fetch(API_BASE + '/admin/gallery/upload', {
      method: 'POST',
      headers: (function () { var h = {}; var t = adminToken(); if (t) h['Authorization'] = 'Bearer ' + t; return h; })(),
      body: fd
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'آپلود ناموفق بود');
        return res.body.url || res.body.path || '';
      });
  }

  /* Rasterize the chosen logo to square PNGs. Done client-side because the
     server has no image library; the browser is already the source of the
     bytes the admin just picked. */
  function deriveIcons(url) {
    if (!url) return Promise.resolve();
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      var done = false;
      function finish() { if (!done) { done = true; resolve(); } }
      img.onload = function () {
        try {
          // Honour the source aspect ratio inside a square canvas so wide logos
          // are not cropped by the icon mask.
          var S = 512;
          var w = img.naturalWidth || S, h = img.naturalHeight || S;
          var scale = Math.min(S / w, S / h);
          var dw = Math.max(1, Math.round(w * scale)), dh = Math.max(1, Math.round(h * scale));
          var master = document.createElement('canvas');
          master.width = S; master.height = S;
          var mc = master.getContext('2d');
          mc.imageSmoothingQuality = 'high';
          mc.drawImage(img, Math.round((S - dw) / 2), Math.round((S - dh) / 2), dw, dh);
          var chain = Promise.resolve();
          ICON_SIZES.forEach(function (size) {
            chain = chain.then(function () {
              var c = document.createElement('canvas');
              c.width = size; c.height = size;
              var cx = c.getContext('2d');
              cx.imageSmoothingQuality = 'high';
              cx.drawImage(master, 0, 0, size, size);
              return uploadIcon(c.toDataURL('image/png'), size);
            });
          });
          chain.then(function () { logoStatus(''); finish(); }, function () { finish(); });
        } catch (e) { finish(); }
      };
      img.onerror = finish;
      setTimeout(finish, 8000);
      img.src = url;
    });
  }

  function uploadIcon(dataUrl, size) {
    var bin = atob(String(dataUrl).split(',')[1] || '');
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    var fd = new FormData();
    fd.append('size', String(size));
    fd.append('icon', new Blob([arr], { type: 'image/png' }), 'icon-' + size + '.png');
    return fetch(API_BASE + '/admin/store-logo/icons', {
      method: 'POST',
      headers: (function () { var h = {}; var t = adminToken(); if (t) h['Authorization'] = 'Bearer ' + t; return h; })(),
      body: fd
    }).then(function (r) { if (!r.ok) throw new Error('icon ' + size + ' failed'); });
  }

  function clearDerivedIcons() {
    return fetch(API_BASE + '/admin/store-logo/icons', {
      method: 'DELETE',
      headers: (function () { var h = {}; var t = adminToken(); if (t) h['Authorization'] = 'Bearer ' + t; return h; })()
    }).catch(function () {});
  }

  /* Point the field at a new logo and refresh the derived icons + preview. */
  function applyLogoChoice(url) {
    setLogo(url);
    return deriveIcons(url);
  }

  /* �"?�"? Favicon field �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"? */
  function faviconInput() { return $('#si-favicon'); }
  function faviconPreview() { return $('#si-favicon-preview'); }
  function renderFaviconPreview(url) {
    var box = faviconPreview();
    if (!box) return;
    if (url) {
      box.innerHTML = '<img src="' + String(url).replace(/"/g, '&quot;') + '" alt="" style="width:100%;height:100%;object-fit:contain;display:block">';
    } else {
      box.innerHTML = '<img src="../assets/icons/favicon-32.png" alt="" style="width:100%;height:100%;object-fit:contain;display:block">';
    }
  }
  function setFavicon(url) {
    var inp = faviconInput();
    if (inp) inp.value = url || '';
    renderFaviconPreview(url || '');
    var clearBtn = $('#si-favicon-clear');
    if (clearBtn) clearBtn.disabled = !url;
    var status = $('#si-favicon-status');
    if (status) { status.textContent = url ? '' : 'بدون favicon سفارشی — از آیکون پیش‌فرض استفاده می‌شود.'; status.style.color = 'var(--text-muted)'; }
  }
  function uploadFaviconFile(file) {
    if (!file) return Promise.resolve('');
    var fd = new FormData();
    fd.append('image', file);
    var status = $('#si-favicon-status');
    if (status) { status.textContent = 'در حال آپلود...'; status.style.color = 'var(--text-muted)'; }
    return fetch(API_BASE + '/admin/gallery/upload', {
      method: 'POST',
      headers: (function () { var h = {}; var t = adminToken(); if (t) h['Authorization'] = 'Bearer ' + t; return h; })(),
      body: fd
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'آپلود ناموفق بود');
        return res.body.url || res.body.path || '';
      });
  }
  function wireFaviconControls() {
    var pick = $('#si-favicon-pick');
    if (pick) pick.addEventListener('click', function () {
      if (window.CamzyMediaPicker && window.CamzyMediaPicker.open) {
        window.CamzyMediaPicker.open(function (url) { setFavicon(url || ''); });
      } else { toast('انتخاب‌کننده رسانه در دسترس نیست', 'warning'); }
    });
    var file = $('#si-favicon-file');
    if (file) file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      uploadFaviconFile(f)
        .then(function (url) { setFavicon(url || ''); toast('Favicon آپلود شد.', 'success'); })
        .catch(function (e) { var st = $('#si-favicon-status'); if (st) { st.textContent = e.message || 'آپلود ناموفق بود'; st.style.color = 'var(--color-danger,#d33)'; } toast(e.message || 'آپلود ناموفق بود', 'danger'); })
        .then(function () { file.value = ''; });
    });
    var clear = $('#si-favicon-clear');
    if (clear) clear.addEventListener('click', function () {
      setFavicon('');
      var st = $('#si-favicon-status');
      if (st) { st.textContent = 'Favicon حذف شد.'; st.style.color = 'var(--text-muted)'; }
    });
  }

  function wireLogoControls() {
    var pick = $('#si-logo-pick');
    if (pick) pick.addEventListener('click', function () {
      if (window.CamzyMediaPicker && window.CamzyMediaPicker.open) {
        window.CamzyMediaPicker.open(function (url) { applyLogoChoice(url); });
      } else { toast('انتخابگر گالری در دسترس نیست', 'warning'); }
    });
    var file = $('#si-logo-file');
    if (file) file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      uploadLogoFile(f)
        .then(function (url) { return applyLogoChoice(url); })
        .then(function () { toast('لوگو آپلود شد. برا اعمال نهایی «ذخیره» را بزنید.', 'success'); })
        .catch(function (e) { logoStatus(e.message || 'آپلود ناموفق بود', true); toast(e.message || 'آپلود ناموفق بود', 'danger'); })
        .then(function () { file.value = ''; });
    });
    var clear = $('#si-logo-clear');
    if (clear) clear.addEventListener('click', function () {
      setLogo('');
      clearDerivedIcons();
      logoStatus('لوگو حذف شد. برا اعمال نهایی «ذخیره» را بزنید.');
    });
  }

  var F = {
    name: function () { return $('#si-name'); },
    phone: function () { return $('#si-phone'); },
    phone2: function () { return $('#si-phone2'); },
    email: function () { return $('#si-email'); },
    website: function () { return $('#si-website'); },
    address: function () { return $('#si-address'); },
    mapUrl: function () { return $('#si-map-url'); },
    latitude: function () { return $('#si-latitude'); },
    longitude: function () { return $('#si-longitude'); },
    hours: function () { return $('#si-hours'); },
    hoursDetail: function () { return $('#si-hours-detail'); },
    desc: function () { return $('#si-desc'); },
    socialTelegram: function () { return $('#si-social-telegram'); },
    socialInstagram: function () { return $('#si-social-instagram'); },
    socialTwitter: function () { return $('#si-social-twitter'); },
    socialYouTube: function () { return $('#si-social-youtube'); }
  };

  /* Read-only mirrors in other Admin sections (never editable there). */
  function mirrorReadOnly(s) {
    try {
      var set = function (id, v) { var el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
      set('s-name', s['store.name'] || '');
      set('s-phone', s['store.phone'] || '');
      set('s-email', s['store.email'] || '');
      set('s-address', s['store.address'] || '');
      set('s-desc', s['store.desc'] || '');
      set('c-footer-brand-desc', s['store.desc'] || '');
      set('c-footer-address', s['store.address'] || '');
      // The Admin shell brand follows the same single source.
      if (s['store.name']) {
        document.querySelectorAll('.admin-sidebar__name').forEach(function (el) { el.textContent = s['store.name']; });
        try { if (window.CamzyAdmin && window.CamzyAdmin.reloadBrand) window.CamzyAdmin.reloadBrand(); } catch (e) {}
      }
    } catch (e) {}
  }

  function applySettings(s) {
    if (F.name()) F.name().value = s['store.name'] || '';
    setLogo(s['store.logo'] || '');
    setFavicon(s['store.favicon'] || '');
    if (F.phone()) F.phone().value = s['store.phone'] || '';
    if (F.phone2()) F.phone2().value = s['store.phone2'] || '';
    if (F.email()) F.email().value = s['store.email'] || '';
    if (F.website()) F.website().value = s['store.website'] || '';
    if (F.address()) F.address().value = s['store.address'] || '';
    if (F.mapUrl()) F.mapUrl().value = s['store.map_url'] || '';
    if (F.latitude()) F.latitude().value = s['store.latitude'] || '';
    if (F.longitude()) F.longitude().value = s['store.longitude'] || '';
    if (F.hours()) F.hours().value = s['store.hours'] || '';
    if (F.hoursDetail()) F.hoursDetail().value = s['store.hours_detail'] || '';
    if (F.desc()) F.desc().value = s['store.desc'] || '';
    if (F.socialTelegram()) F.socialTelegram().value = s['store.social_telegram'] || '';
    if (F.socialInstagram()) F.socialInstagram().value = s['store.social_instagram'] || '';
    if (F.socialTwitter()) F.socialTwitter().value = s['store.social_twitter'] || '';
    if (F.socialYouTube()) F.socialYouTube().value = s['store.social_youtube'] || '';
    mirrorReadOnly(s);
  }

  async function load() {
    try {
      applySettings(await api('/settings'));
    } catch (e) { /* keep empty; offline fallback */ }
  }

  function busy(btn, fn) {
    return async function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      btn.disabled = true;
      try { await fn(); }
      catch (err) { toast(err.message || 'ذخیره ناموفق بود', 'danger'); }
      finally { btn.disabled = false; }
    };
  }

  var form = $('#adm-store-info-form');
  if (form) form.addEventListener('submit', busy(
    form.querySelector('[type="submit"]') || form,
    async function () {
      var name = F.name() ? F.name().value.trim() : '';
      var phone = F.phone() ? F.phone().value.trim() : '';
      var email = F.email() ? F.email().value.trim() : '';
      var address = F.address() ? F.address().value.trim() : '';
      if (!name) { toast('نام فروشگاه الزامی است', 'danger'); F.name().focus(); return; }
      if (!phone) { toast('تلفن اصلی الزامی است', 'danger'); F.phone().focus(); return; }
      if (!address) { toast('آدرس الزامی است', 'danger'); F.address().focus(); return; }
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        toast('ایمیل معتبر نیست', 'danger'); F.email().focus(); return;
      }
      var latRaw = F.latitude() ? F.latitude().value.trim() : '';
      var lngRaw = F.longitude() ? F.longitude().value.trim() : '';
      var lat = latRaw === '' ? NaN : Number(latRaw);
      var lng = lngRaw === '' ? NaN : Number(lngRaw);
      if (latRaw !== '' && !(typeof lat === 'number' && isFinite(lat) && lat >= -90 && lat <= 90)) {
        toast('عرض جغرافیایی معتبر نیست (۹۰- تا ۹۰)', 'danger'); F.latitude().focus(); return;
      }
      if (lngRaw !== '' && !(typeof lng === 'number' && isFinite(lng) && lng >= -180 && lng <= 180)) {
        toast('طول جغرافیایی معتبر نیست (۱۸۰- تا ۱۸۰)', 'danger'); F.longitude().focus(); return;
      }
      /* Footer social links: optional, but any value must be an http(s) URL. */
      var socialFields = [
        [F.socialTelegram(), 'store.social_telegram', 'تلگرام'],
        [F.socialInstagram(), 'store.social_instagram', 'اینستاگرام'],
        [F.socialTwitter(), 'store.social_twitter', 'X (توییتر)'],
        [F.socialYouTube(), 'store.social_youtube', 'یوتیوب']
      ];
      var socialPayload = {};
      for (var si = 0; si < socialFields.length; si++) {
        var socEl = socialFields[si][0];
        var socVal = socEl ? socEl.value.trim() : '';
        if (socVal && !/^https?:\/\//i.test(socVal)) {
          toast('لینک ' + socialFields[si][2] + ' معتبر نیست (باید با http:// یا https:// شروع شود)', 'danger');
          if (socEl) socEl.focus();
          return;
        }
        socialPayload[socialFields[si][1]] = socVal;
      }
      var saved = await api('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          'store.name': name,
          'store.logo': logoInput() ? logoInput().value.trim() : '',
          'store.favicon': faviconInput() ? faviconInput().value.trim() : '',
          'store.phone': phone,
          'store.phone2': F.phone2() ? F.phone2().value.trim() : '',
          'store.email': email,
          'store.website': F.website() ? F.website().value.trim() : '',
          'store.address': address,
          'store.map_url': F.mapUrl() ? F.mapUrl().value.trim() : '',
          'store.latitude': latRaw,
          'store.longitude': lngRaw,
          'store.hours': F.hours() ? F.hours().value.trim() : '',
          'store.hours_detail': F.hoursDetail() ? F.hoursDetail().value.trim() : '',
          'store.desc': F.desc() ? F.desc().value.trim() : '',
          'store.social_telegram': socialPayload['store.social_telegram'],
          'store.social_instagram': socialPayload['store.social_instagram'],
          'store.social_twitter': socialPayload['store.social_twitter'],
          'store.social_youtube': socialPayload['store.social_youtube']
        })
      });
      applySettings(saved);
      /* Keep legacy loaders in sync (admin.js Settings form). */
      try { if (window.CamzyAdminSettings && window.CamzyAdminSettings.reload) window.CamzyAdminSettings.reload(); } catch (_) {}
      toast('اطلاعات فروشگاه با موفقیت ذخیره شد', 'success');
    }
  ));

  /* Block any legacy write path for store.* outside this section:
     the Settings «اطلاعات فروشگاه» form is read-only (no submit button
     anymore — only a link here), but guard devtools-enabled submits too. */
  document.addEventListener('submit', function (e) {
    var t = e.target;
    if (t && t.hasAttribute && t.hasAttribute('data-settings-form')) {
      var idx = Array.prototype.indexOf.call(document.querySelectorAll('form[data-settings-form]'), t);
      if (idx === 0) {
        e.preventDefault();
        e.stopPropagation();
        toast('این مقادیر فقط از بخش اطلاعات فروشگاه قابل ویرایش است', 'warning');
        try {
          var link = document.querySelector('a[href="#/store-info"]');
          if (link) link.focus();
        } catch (_) {}
      }
    }
  }, true);

  /* Refresh mirrors when the Content/Settings views are shown. */
  try {
    var orig = window.CamzyAdmin && window.CamzyAdmin.showView;
    if (orig && !orig.__storeInfoHooked) {
      var wrapped = function (n) {
        orig(n);
        if (n === 'store-info' || n === 'settings' || n === 'content') load();
      };
      wrapped.__storeInfoHooked = true;
      window.CamzyAdmin.showView = wrapped;
    }
  } catch (_) {}
  window.addEventListener('hashchange', function () {
    try {
      var h = (location.hash || '').replace(/^#\/?/, '');
      if (h === 'store-info' || h === 'settings' || h === 'content') load();
    } catch (_) {}
  });

  load();
  wireLogoControls();
  wireFaviconControls();
  window.CamzyAdminStoreInfo = { reload: load };
})();
