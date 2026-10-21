/* ================================================================
   Camzy — PWA: service worker registration + install modal
   - Registers sw.js (next to index.html) with scope "./" on all pages
     (real PWA install, NOT a shortcut: requires manifest + controlling
     SW with a fetch handler; the installed app then opens in
     standalone mode). Relative URLs keep this working whether the
     site is hosted at the domain root or inside a subfolder.
   - Every [data-pwa-install] ("نصب اپلیکیشن") button ALWAYS opens a
     proper RTL modal first (mobile bottom-sheet, desktop centered
     dialog) — even when the native install prompt is unavailable.
   - When the browser provides `beforeinstallprompt` the modal shows a
     native "نصب" button; otherwise it shows clear browser-specific
     manual instructions and never pretends the app was installed.
   - Install buttons stay visible until the app runs in standalone
     mode (desktop Chrome/Edge native flow included).
   - Exposes window.CamzyPWA for manual testing.
   ================================================================ */
(function () {
  'use strict';

  var SW_URL = 'sw.js';
  var SW_SCOPE = './';

  var deferredPrompt = null;
  var installable = false;
  var installed = false;
  var swStatus = 'pending';
  var modalOpen = false;
  var lastFocused = null;

  try {
    installed =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (window.navigator && window.navigator.standalone === true);
  } catch (e) { installed = false; }

  /* ── Environment detection (for manual instructions) ─────── */
  function getEnv() {
    var ua = '';
    try { ua = (navigator.userAgent || '').toLowerCase(); } catch (e) {}
    var isIOS = /iphone|ipad|ipod/.test(ua);
    var isAndroid = /android/.test(ua);
    var isSamsung = /samsungbrowser/.test(ua);
    var isFirefox = /firefox|fxios/.test(ua);
    var isEdge = /edg\//.test(ua);
    var isChrome = (/chrome|crios/.test(ua) && !isEdge && !isSamsung) || /chromium/.test(ua);
    var isSafari = /safari/.test(ua) && !isChrome && !isEdge && !isSamsung && !isFirefox;
    var isMobile = isIOS || isAndroid || /mobile/.test(ua);
    return {
      ua: ua, isIOS: isIOS, isAndroid: isAndroid, isSamsung: isSamsung,
      isFirefox: isFirefox, isEdge: isEdge, isChrome: isChrome,
      isSafari: isSafari, isMobile: isMobile
    };
  }

  function installButtons() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-pwa-install]'));
  }

  function showInstallUI() {
    if (installed) return;
    installButtons().forEach(function (btn) { btn.hidden = false; });
    try { document.dispatchEvent(new CustomEvent('as_pwa_installable')); } catch (e) {}
  }

  function hideInstallUI() {
    installButtons().forEach(function (btn) { btn.hidden = true; });
  }

  function toast(msg, type) {
    try {
      if (window.App && typeof window.App.showToast === 'function') {
        window.App.showToast(msg, type || 'info');
        return;
      }
    } catch (e) {}
    try { window.alert(msg); } catch (err) {}
  }

  /* ── Manual instruction steps per browser ────────────────── */
  function manualSteps() {
    var env = getEnv();
    if (env.isIOS) {
      return {
        title: 'نصب در آیفون / آیپد (Safari)',
        note: 'نصب خودکار در iOS پشتیبانی نمی‌شود؛ لطفاً مراحل زیر را در مرورگر Safari انجام دهید:',
        steps: [
          'نوار ابزار پایین Safari دکمه «اشتراک‌گذاری» (مربع با فلش رو به بالا) را بزنید.',
          'گزینه «Add to Home Screen» (افزودن به صفحه اصلی) را انتخاب کنید.',
          'نام «کمزی» را تأیید و «Add» (افزودن) را بزنید.',
          'از این به بعد از آیکون کمزی در صفحه اصلی وارد شوید تا تمام‌صفحه باز شود.'
        ]
      };
    }
    if (env.isSamsung) {
      return {
        title: 'نصب در سامسونگ اینترنت',
        note: 'برای نصب واقعی (اجرای تمام‌صفحه، بدون مرورگر) حتماً گزینه نصب برنامه را بزنید. «افزودن به صفحه اصلی» فقط یک میان‌بر می‌سازد و سایت را داخل مرورگر باز می‌کند:',
        steps: [
          'منوی برنامه (سه خط یا ⋮) را باز کنید.',
          'گزینه «Install app» (نصب برنامه) را انتخاب کنید — نه فقط «Add page to».',
          'در پنجره تأیید، «Install» را بزنید.',
          'از آیکون کمزی وارد شوید تا در حالت تمام‌صفحه (standalone) باز شود.'
        ]
      };
    }
    if (env.isFirefox) {
      return {
        title: 'نصب در فایرفاکس',
        note: 'برای نصب واقعی گزینه «Install» را بزنید. «Add to Home screen» فقط میان‌بر است و سایت را داخل مرورگر باز می‌کند:',
        steps: [
          'منوی ⋮ فایرفاکس را باز کنید.',
          'گزینه «Install» (نصب) را انتخاب کنید.',
          'از آیکون ساخته‌شده وارد شوید تا بدون نوار مرورگر باز شود.'
        ]
      };
    }
    if (env.isAndroid) {
      return {
        title: 'نصب در اندروید (کروم)',
        note: 'برای نصب واقعی (تمام‌صفحه، بدون کروم) حتماً «Install app» را بزنید. «Add to Home screen» فقط یک میان‌بر می‌سازد و سایت را داخل کروم باز می‌کند:',
        steps: [
          'منوی ⋮ بالای کروم را باز کنید.',
          'گزینه «Install app» (نصب برنامه) را بزنید.',
          'در پنجره تأیید، «Install» را انتخاب کنید.',
          'از آیکون کمزی وارد شوید تا در حالت تمام‌صفحه (standalone) باز شود.'
        ]
      };
    }
    /* Desktop fallback (Chrome / Edge / others) */
    return {
      title: 'نصب در کامپیوتر (کروم / اج)',
      note: 'اگر دکمه نصب خودکار ظاهر نشد، این مراحل را انجام دهید:',
      steps: [
        'در نوار آدرس، روی آیکون نصب (مانیتور با فلش) کلیک کنید؛ اگر نبود منوی ⋮ را باز کنید.',
        'گزینه «Install کمزی…» (نصب) یا «Apps ← Install» را انتخاب کنید.',
        'در پنجره تأیید «Install» را بزنید تا آیکون برنامه ساخته شود.'
      ]
    };
  }

  /* ── Modal markup ────────────────────────────────────────── */
  function ensureModal() {
    var existing = document.getElementById('pwa-install-overlay');
    if (existing) return existing;

    var overlay = document.createElement('div');
    overlay.id = 'pwa-install-overlay';
    overlay.className = 'pwa-install-overlay';
    overlay.setAttribute('hidden', '');
    overlay.setAttribute('dir', 'rtl');
    overlay.innerHTML =
      '<div class="pwa-install-modal" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">' +
        '<div class="pwa-install-modal__handle" aria-hidden="true"></div>' +
        '<div class="pwa-install-modal__header">' +
          '<span class="pwa-install-modal__icon" aria-hidden="true">' +
            '<img src="assets/icons/icon-192.png" alt="" width="44" height="44" onerror="this.style.display=\'none\'">' +
          '</span>' +
          '<div class="pwa-install-modal__titles">' +
            '<h2 class="pwa-install-modal__title" id="pwa-install-title">نصب اپلیکیشن کمزی</h2>' +
            '<p class="pwa-install-modal__subtitle">کمزی را مثل یک اپ واقعی نصب کنید؛ سریع‌تر و تمام‌صفحه</p>' +
          '</div>' +
          '<button type="button" class="pwa-install-modal__close" data-pwa-close aria-label="بستن">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="pwa-install-modal__body">' +
          '<ul class="pwa-install-modal__benefits">' +
            '<li><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> دسترسی با یک لمس از صفحه اصلی، بدون تایپ آدرس</li>' +
            '<li><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> اجرای تمام‌صفحه (standalone) مثل اپلیکیشن واقعی</li>' +
            '<li><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> بارگذاری سریع‌تر و صفحه آفلاین در قطعی اینترنت</li>' +
          '</ul>' +
          '<div class="pwa-install-modal__native" data-pwa-native hidden>' +
            '<button type="button" class="btn btn-primary btn-block btn-lg" data-pwa-native-install>' +
              '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
              ' نصب اپلیکیشن' +
            '</button>' +
            '<p class="pwa-install-modal__hint">با زدن دکمه بالا، پنجره نصب مرورگر باز می‌شود. پس از نصب، از آیکون کمزی وارد شوید.</p>' +
            '<p class="pwa-install-modal__status" data-pwa-status role="status" aria-live="polite"></p>' +
          '</div>' +
          '<div class="pwa-install-modal__manual" data-pwa-manual>' +
            '<h3 class="pwa-install-modal__manual-title" data-pwa-manual-title>راهنمای نصب دستی</h3>' +
            '<p class="pwa-install-modal__manual-note" data-pwa-manual-note></p>' +
            '<ol class="pwa-install-modal__steps" data-pwa-manual-steps></ol>' +
          '</div>' +
        '</div>' +
        '<div class="pwa-install-modal__footer">' +
          '<button type="button" class="btn btn-ghost btn-block" data-pwa-close>باشه، بعداً</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
      else if (e.target && e.target.closest && e.target.closest('[data-pwa-close]')) closeModal();
      else if (e.target && e.target.closest && e.target.closest('[data-pwa-native-install]')) {
        e.preventDefault();
        promptInstallFromModal();
      }
    });

    return overlay;
  }

  function renderModalContent() {
    var overlay = ensureModal();
    var hasNative = !!deferredPrompt;
    var info = manualSteps();

    var nativeBox = overlay.querySelector('[data-pwa-native]');
    var manualBox = overlay.querySelector('[data-pwa-manual]');
    var titleEl = overlay.querySelector('[data-pwa-manual-title]');
    var noteEl = overlay.querySelector('[data-pwa-manual-note]');
    var stepsEl = overlay.querySelector('[data-pwa-manual-steps]');
    var statusEl = overlay.querySelector('[data-pwa-status]');
    if (!nativeBox || !manualBox) return;

    if (statusEl) statusEl.textContent = '';
    if (hasNative) {
      nativeBox.hidden = false;
      if (titleEl) titleEl.textContent = 'نصب نشد؟ راه دستی:';
      if (noteEl) noteEl.textContent = info.note;
      if (stepsEl) {
        stepsEl.innerHTML = info.steps.map(function (s) {
          return '<li>' + escapeHtml(s) + '</li>';
        }).join('');
      }
    } else {
      /* No native prompt: never pretend it is installed — show manual only. */
      nativeBox.hidden = true;
      if (titleEl) titleEl.textContent = info.title;
      if (noteEl) noteEl.textContent = info.note;
      if (stepsEl) {
        stepsEl.innerHTML = info.steps.map(function (s) {
          return '<li>' + escapeHtml(s) + '</li>';
        }).join('');
      }
      if (manualBox) manualBox.classList.add('is-primary');
    }
    if (manualBox && hasNative) manualBox.classList.remove('is-primary');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function openModal() {
    if (installed) return;
    var overlay = ensureModal();
    renderModalContent();
    lastFocused = document.activeElement;
    overlay.hidden = false;
    /* Force reflow so the CSS transition runs. */
    void overlay.offsetWidth;
    overlay.classList.add('is-active');
    document.documentElement.classList.add('is-pwa-modal-open');
    try { document.body.style.overflow = 'hidden'; } catch (e) {}
    modalOpen = true;
    try {
      var btn = overlay.querySelector('[data-pwa-native-install]');
      var fallback = overlay.querySelector('[data-pwa-close]');
      var toFocus = (!overlay.querySelector('[data-pwa-native]').hidden && btn) ? btn : fallback;
      if (toFocus && toFocus.focus) toFocus.focus();
    } catch (e) {}
  }

  function closeModal() {
    var overlay = document.getElementById('pwa-install-overlay');
    if (!overlay) { modalOpen = false; return; }
    overlay.classList.remove('is-active');
    document.documentElement.classList.remove('is-pwa-modal-open');
    try { document.body.style.overflow = ''; } catch (e) {}
    modalOpen = false;
    setTimeout(function () {
      try {
        if (!modalOpen) overlay.hidden = true;
      } catch (e) {}
    }, 220);
    try {
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    } catch (e) {}
  }

  function promptInstallFromModal() {
    var overlay = document.getElementById('pwa-install-overlay');
    var statusEl = overlay ? overlay.querySelector('[data-pwa-status]') : null;
    if (!deferredPrompt) {
      renderModalContent();
      return Promise.resolve(null);
    }
    var promptEvent = deferredPrompt;
    try { promptEvent.prompt(); }
    catch (e) {
      renderModalContent();
      return Promise.resolve(null);
    }
    if (statusEl) statusEl.textContent = 'در انتظار تأیید شما در پنجره مرورگر…';
    return promptEvent.userChoice.then(function (choice) {
      /* The prompt object is single-use: clear it right away. */
      deferredPrompt = null;
      installable = false;
      renderModalContent();
      if (choice && choice.outcome === 'accepted') {
        if (statusEl) statusEl.textContent = 'درخواست نصب ثبت شد. پس از نصب، از آیکون کمزی وارد شوید.';
        toast('درخواست نصب ثبت شد.', 'success');
      } else {
        if (statusEl) statusEl.textContent = 'نصب لغو شد؛ هر وقت خواستید می‌توانید دوباره تلاش کنید یا از راهنمای دستی زیر استفاده کنید.';
      }
      return choice;
    }).catch(function () {
      deferredPrompt = null;
      installable = false;
      renderModalContent();
      return null;
    });
  }

  /* Direct native prompt (kept for desktop flows / tests). */
  function promptInstall() {
    if (deferredPrompt) return promptInstallFromModal();
    openModal();
    return Promise.resolve(null);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      swStatus = 'unsupported';
      return;
    }
    var doRegister = function () {
      /* Absolute URL + root scope: the SW at /sw.js controls every route,
         which is required for the browser install prompt (not a shortcut). */
      navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }).then(
        function (reg) {
          swStatus = 'registered';
          try {
            if (console && console.info) {
              console.info('[PWA] service worker registered', {
                scope: (reg && reg.scope) || SW_SCOPE
              });
            }
          } catch (e) {}
        },
        function (err) {
          swStatus = 'failed';
          try {
            if (console && console.warn) {
              console.warn('[PWA] service worker registration failed', err);
            }
          } catch (e) {}
        }
      );
    };
    /* pwa.js loads at end of body; if load already fired, register now. */
    if (document.readyState === 'complete') {
      /* Defer slightly so page paint is never blocked. */
      setTimeout(doRegister, 0);
    } else {
      window.addEventListener('load', doRegister);
    }
  }

  /* Keep internal navigation inside the installed app: same-origin links
     must never escape to the browser via a new tab when standalone. */
  function guardStandaloneLinks() {
    document.addEventListener('click', function (e) {
      var inStandalone = false;
      try {
        inStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
          (window.navigator && window.navigator.standalone === true);
      } catch (err) { inStandalone = false; }
      if (!inStandalone) return;
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      var target = (a.getAttribute('target') || '').toLowerCase();
      if (target !== '_blank') return;
      var href = a.getAttribute('href') || '';
      if (!href || /^(mailto:|tel:|javascript:)/i.test(href) || href.charAt(0) === '#') return;
      var url;
      try { url = new URL(href, window.location.href); } catch (err) { return; }
      if (url.origin !== window.location.origin) return;
      e.preventDefault();
      window.location.href = url.href;
    }, true);
  }

  function bindButtons() {
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-pwa-install]') : null;
      if (!btn) return;
      e.preventDefault();
      openModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalOpen) closeModal();
    });
  }

  /* ── Automatic native prompt on mobile ──────────────────────
     Chrome only honours `beforeinstallprompt.prompt()` during an active
     user gesture; calling it at page load is silently ignored ("Banner
     not shown: beforeinstallprompt event.preventDefault() called..."). So
     we keep preventDefault() (no stray mini-infobar) and fire prompt()
     synchronously on the FIRST real tap/click/Enter. The dedicated
     install buttons and navigable links are skipped — they run their own
     flow. Attempted once per session, mobile viewports only. */
  var PROMPT_KEY = 'as_pwa_prompt_tried';
  var promptShown = false;

  function isMobileViewport() {
    try {
      if (window.matchMedia && window.matchMedia('(max-width: 640px)').matches) return true;
      if (window.innerWidth && window.innerWidth <= 640) return true;
      return false;
    } catch (err) { return false; }
  }

  function hasPromptTried() {
    try { return sessionStorage.getItem(PROMPT_KEY) === '1'; } catch (err) { return true; }
  }

  function markPromptTried() {
    try { sessionStorage.setItem(PROMPT_KEY, '1'); } catch (err) {}
  }

  function bindNativePromptOnGesture() {
    function onFirstGesture(e) {
      if (installed || promptShown || hasPromptTried() || !deferredPrompt) return;
      if (!isMobileViewport()) return;
      var el = e.target;
      if (el && el.closest && el.closest('[data-pwa-install],[data-pwa-native-install],a[href]')) return;
      promptShown = true;
      markPromptTried();
      promptInstallFromModal();
    }
    document.addEventListener('click', onFirstGesture, true);
    document.addEventListener('touchend', onFirstGesture, true);
    document.addEventListener('keydown', onFirstGesture, true);
  }

  /* Exact reason Chrome would withhold installability — only ever logged
     to the console (never turned into a popup) when beforeinstallprompt
     fails to fire. */
  function logInstallability() {
    var reasons = [];
    if (!('serviceWorker' in navigator)) {
      reasons.push('Service Worker not supported');
    } else if (!navigator.serviceWorker.controller) {
      reasons.push('no active (controlling) Service Worker on this page');
    }
    var link = document.querySelector('link[rel="manifest"]');
    if (!link) reasons.push('missing <link rel="manifest">');
    function finish(extra) {
      if (extra) reasons.push(extra);
      try {
        if (reasons.length) console.warn('[PWA] NOT installable — ' + reasons.join('; '));
        else console.info('[PWA] installable: manifest valid, SW active and controlling.');
      } catch (err) {}
    }
    if (!link) { finish(); return; }
    fetch(link.href, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (m) {
      var problems = '';
      if (!m || !m.name || !m.short_name || !m.start_url) problems = 'manifest missing name/short_name/start_url';
      else if (!(m.icons || []).some(function (i) { return /192/.test(i.sizes || ''); })) problems = 'manifest has no 192px icon';
      else if (!/standalone|minimal-ui|fullscreen/.test(m.display || '')) problems = 'manifest display not standalone/minimal-ui/fullscreen';
      finish(problems);
    }).catch(function () { finish('manifest could not be fetched/decoded'); });
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    installable = true;
    promptShown = false;
    showInstallUI();
    /* If the modal is already open (manual mode), upgrade it to native. */
    if (modalOpen) renderModalContent();
    try {
      console.info('[PWA] beforeinstallprompt fired — Chrome considers the app installable. Platforms: ' +
        ((e.platforms || []).join(', ') || 'n/a'));
    } catch (err) {}
  });

  window.addEventListener('appinstalled', function () {
    installed = true;
    installable = false;
    deferredPrompt = null;
    closeModal();
    hideInstallUI();
    toast('اپلیکیشن کمزی با موفقیت نصب شد.', 'success');
    try { document.dispatchEvent(new CustomEvent('as_pwa_installed')); } catch (e) {}
  });

  /* If the app is launched in standalone mode (installed), hide the option
     even when `appinstalled` was missed (e.g. installed from another tab). */
  try {
    if (window.matchMedia) {
      var standaloneMq = window.matchMedia('(display-mode: standalone)');
      var onDisplayModeChange = function (e) {
        if (e && e.matches) {
          installed = true;
          installable = false;
          deferredPrompt = null;
          closeModal();
          hideInstallUI();
        }
      };
      if (standaloneMq.addEventListener) standaloneMq.addEventListener('change', onDisplayModeChange);
      else if (standaloneMq.addListener) standaloneMq.addListener(onDisplayModeChange);
    }
  } catch (e) {}

  /* Re-check standalone status on bfcache restore (pageshow with persisted=true).
     DOMContentLoaded does not fire on bfcache restore, so we must re-evaluate
     the display mode and update the install button visibility. */
  window.addEventListener('pageshow', function (e) {
    if (e && e.persisted) {
      try {
        var nowInstalled =
          (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
          (window.navigator && window.navigator.standalone === true);
        if (nowInstalled !== installed) {
          installed = nowInstalled;
          if (installed) {
            installable = false;
            deferredPrompt = null;
            closeModal();
            hideInstallUI();
          } else {
            syncInitialUI();
          }
        }
      } catch (err) {}
    }
  });

  function syncInitialUI() {
    if (installed) {
      hideInstallUI();
      return;
    }
    /* Show the install entry points on both mobile and desktop so the
       modal (native or manual) is always reachable; the modal itself
       decides between the native prompt and browser-specific steps. */
    showInstallUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncInitialUI);
  } else {
    syncInitialUI();
  }

  registerServiceWorker();
  bindButtons();
  bindNativePromptOnGesture();
  guardStandaloneLinks();

  /* If the browser withheld beforeinstallprompt, log the exact reason. */
  setTimeout(function () {
    if (!deferredPrompt && !installed) logInstallability();
  }, 8000);

  window.CamzyPWA = {
    promptInstall: promptInstall,
    openInstallModal: openModal,
    closeInstallModal: closeModal,
    getManualSteps: manualSteps,
    swUrl: SW_URL,
    swScope: SW_SCOPE,
    getState: function () {
      return { installable: installable, installed: installed, hasPrompt: !!deferredPrompt, promptShown: promptShown, sw: swStatus, modalOpen: modalOpen };
    }
  };
})();
