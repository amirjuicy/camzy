/* ================================================================
   Camzy — Admin Authentication
   Backend-backed: session source is the database via /api/admin/*.
   localStorage only caches the token + admin profile (as_admin_session).
   Legacy as_admin_users is NOT used as an authentication source.
   ================================================================ */
(function () {
  'use strict';

  /* ── Storage keys (token cache only — DB is the source of truth) ─ */
  var ADMIN_SESSION_KEY = 'as_admin_session';

  var API_BASE = (function () {
    try {
      if (window.CamzyApiBase) return window.CamzyApiBase;
      if (window.location.protocol.indexOf('http') === 0) return '';
    } catch (e) {}
    return '';
  })();

  function apiAvailable() {
    try {
      return window.location.protocol.indexOf('http') === 0 && typeof fetch === 'function';
    } catch (e) { return false; }
  }

  function apiRequest(method, path, body, token) {
    var url = API_BASE + '/api' + path;
    var headers = { 'Content-Type': 'application/json' };
    var t = token !== undefined ? token : (getAdminSession() || {}).token;
    if (t) headers['Authorization'] = 'Bearer ' + t;
    return fetch(url, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.error) || ('Request failed: ' + res.status));
          /* 429/5xx are transient server states, not auth verdicts. */
          if (res.status === 429 || res.status >= 500) err.transient = true;
          throw err;
        }
        return data;
      });
    });
  }

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (e) { return fallback; }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  /* ── Admin Auth API ─────────────────────────────────────────── */
  function getAdminSession() {
    return readJSON(ADMIN_SESSION_KEY, null);
  }

  function setAdminSession(admin, token, remember) {
    if (admin && token) {
      writeJSON(ADMIN_SESSION_KEY, {
        token: token,
        admin: admin,
        userId: admin.id,
        remember: !!remember,
        loginAt: Date.now(),
      });
    } else {
      localStorage.removeItem(ADMIN_SESSION_KEY);
    }
  }

  function getCurrentAdmin() {
    var session = getAdminSession();
    if (!session || !session.token) return null;
    if (session.admin) return session.admin;
    return null;
  }

  function isAdminLoggedIn() {
    return getCurrentAdmin() !== null;
  }

  /* Validate cached token against the database. Clears it if invalid. */
  function validateSession() {
    if (!apiAvailable()) return Promise.resolve(getCurrentAdmin());
    var session = getAdminSession();
    var token = session && session.token;
    /* Some server states are not auth verdicts: 429 (rate limiting) or 5xx.
       Treating them as "logged out" would eject a valid admin during a burst,
       so they are retried once after a short pause. 401/403 remain decisive. */
    function meResult(res) {
      if (res && res.ok) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return (data && data.admin) ? data.admin : null;
        });
      }
      if (res && (res.status === 429 || res.status >= 500)) {
        var e = new Error('Request failed: ' + res.status);
        e.transient = true;
        throw e;
      }
      return Promise.resolve(null);
    }
    function retryTransient() {
      return new Promise(function (r) { setTimeout(r, 1200); });
    }
    if (!token) {
      /* Cookie-only live session (for example localStorage was cleared): the
         server can still authenticate this request via the HttpOnly cookie,
         so ask the server instead of assuming logged-out. */
      return fetch(API_BASE + '/api/admin/me', { credentials: 'same-origin' })
        .then(meResult, function () { return null; })
        .catch(function (err) {
          if (err && err.transient) {
            /* Transient burst: retry once, then fail closed on any outcome. */
            return retryTransient().then(function () {
              return fetch(API_BASE + '/api/admin/me', { credentials: 'same-origin' })
                .then(meResult)
                .catch(function () { return null; });
            });
          }
          return null;
        });
    }
    return apiRequest('GET', '/admin/me', undefined, token).then(function (data) {
      if (data && data.admin) {
        setAdminSession(data.admin, session.token, session.remember);
        return data.admin;
      }
      return null;
    }).catch(function (err) {
      if (err && err.transient) {
        /* 429/5xx burst: retry once instead of deciding from a stale cache. */
        return retryTransient().then(function () {
          return apiRequest('GET', '/admin/me', undefined, token).then(function (data) {
            if (data && data.admin) {
              setAdminSession(data.admin, session.token, session.remember);
              return data.admin;
            }
            return null;
          }, function () { return getCurrentAdmin(); });
        });
      }
      if (err && /401|Not authenticated/i.test(err.message || '')) {
        setAdminSession(null);
        notifyAdminAuthChange();
        return null;
      }
      /* Network error: keep cached session so dashboard still works offline. */
      return getCurrentAdmin();
    });
  }

  function adminLogin(username, password, remember) {
    if (!apiAvailable()) {
      return Promise.resolve({ success: false, error: 'سرور در دسترس نیست.' });
    }
    return apiRequest('POST', '/admin/login', {
      username: username, password: password,
    }).then(function (data) {
      setAdminSession(data.admin, data.token, remember);
      notifyAdminAuthChange();
      return { success: true, admin: data.admin };
    }).catch(function (err) {
      return { success: false, error: (err && err.message) || 'نام کاربری یا رمز عبور اشتباه است.' };
    });
  }

  function adminLogout() {
    var adminSession = getAdminSession();
    var adminToken = adminSession && adminSession.token;
    var done = function () {
      setAdminSession(null);
      /* A storefront login for this same admin mirrors the token into
         as_session — drop it so the storefront does not stay logged in as
         "admin:<id>" after a panel logout. Storefront sessions with a
         different token (unrelated customers) are left untouched. */
      try {
        var storefront = JSON.parse(localStorage.getItem('as_session') || 'null');
        if (storefront && storefront.token && adminToken && storefront.token === adminToken) {
          localStorage.removeItem('as_session');
        }
      } catch (e) {}
      notifyAdminAuthChange();
      return { success: true };
    };
    /* Always notify the server: a live HttpOnly cookie session has no
       localStorage token, yet the cookie itself authenticates the logout
       request and lets the server revoke the session + clear the cookie. */
    if (apiAvailable()) {
      return apiRequest('POST', '/admin/logout').catch(function () {}).then(done);
    }
    try { done(); } catch (e) {}
    return Promise.resolve({ success: true });
  }

  function notifyAdminAuthChange() {
    try { window.dispatchEvent(new CustomEvent('as_admin_auth_change')); } catch (e) {}
  }

  /* ── Boot gate (neutral loading screen) ──────────────────────
     The server only serves this page to a valid admin session, but the page's
     own scripts still confirm the session against the DB before revealing the
     panel, so the admin UI can never appear before authorization is verified. */
  function bootGate() {
    var el = document.getElementById('admin-boot');
    if (!el) return;
    el.classList.add('is-done');
    setTimeout(function () {
      if (el.parentNode && el.classList.contains('is-done')) el.parentNode.removeChild(el);
    }, 300);
  }

  /* ── Require admin auth (server-confirmed) ─────────────────── */
  function requireAdminAuth() {
    var proceedToLogin = function () {
      var loginUrl = '/login.html';
      var current = window.location.pathname + window.location.search + window.location.hash;
      if (current && current !== '/' && current.indexOf('login.html') === -1) {
        loginUrl += '?redirect=' + encodeURIComponent(current);
      }
      window.location.replace(loginUrl);
      /* the neutral boot loader stays on screen until the redirect lands */
    };
    var decided = false;
    var cached = getCurrentAdmin();
    /* Decision is the server's, using the DB-backed session (cookie or Bearer
       token). The localStorage flag is only a cache and is never treated as
       proof of authentication. */
    var glued = validateSession().then(function (admin) {
      if (decided) {
        /* The watchdog already resolved the boot; re-checking can still
           eject a session the server has revoked in the meantime. */
        if (!admin) { try { setAdminSession(null); } catch (e) {} proceedToLogin(); }
        return;
      }
      decided = true;
      if (admin) {
        notifyAdminAuthChange();
        bootGate();
      } else {
        proceedToLogin();
      }
    }, function () {
      /* The re-validation itself failed unexpectedly: fail closed. */
      if (!decided) { decided = true; proceedToLogin(); }
    });
    /* Watchdog: the server only ever serves this page to a session it has
       just re-validated with the cookie, so if the boot check is merely slow
       (rate limit burst, slow network) the loader must not hang forever.
       With a cached profile it is safe to reveal after a grace period; the
       background re-check above continues and still revoke/redirects on an
       invalidated session. Without any cached profile the neutral loader
       stays until the server answers. */
    setTimeout(function () {
      if (decided) return;
      decided = true;
      if (cached) { notifyAdminAuthChange(); bootGate(); }
    }, cached ? 6000 : 12000);
    return true;
  }

  /* ── Export to window.AdminAuth ─────────────────────────────── */
  window.AdminAuth = {
    login: adminLogin,
    logout: adminLogout,
    isLoggedIn: isAdminLoggedIn,
    getCurrentAdmin: getCurrentAdmin,
    requireAuth: requireAdminAuth,
    validateSession: validateSession,
    readJSON: readJSON,
    writeJSON: writeJSON,
    ADMIN_SESSION_KEY: ADMIN_SESSION_KEY
  };

  /* ── Login page init ────────────────────────────────────────── */
  function initLoginPage() {
    var form = document.getElementById('admin-login-form');
    if (!form) return;

    /* If already authenticated (validated), go to dashboard. */
    validateSession().then(function (admin) {
      if (admin) {
        var params = new URLSearchParams(window.location.search);
        window.location.href = params.get('redirect') || 'index.html';
      }
    });

    var usernameInput = document.getElementById('admin-username');
    var passwordInput = document.getElementById('admin-password');
    var toggleBtn = document.getElementById('admin-password-toggle');
    var rememberInput = document.getElementById('admin-remember');
    var submitBtn = form.querySelector('.admin-auth__submit');

    /* Password visibility toggle */
    if (toggleBtn && passwordInput) {
      toggleBtn.addEventListener('click', function () {
        var isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        toggleBtn.setAttribute('aria-label', isPassword ? 'مخفی کردن رمز عبور' : 'نمایش رمز عبور');
      });
    }

    /* Handle form submit */
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var username = usernameInput ? usernameInput.value.trim() : '';
      var password = passwordInput ? passwordInput.value : '';
      var remember = rememberInput ? rememberInput.checked : false;

      if (!username) {
        showToast('لطفاً نام کاربری را وارد کنید.', 'danger');
        usernameInput?.focus();
        return;
      }
      if (!password) {
        showToast('لطفاً رمز عبور را وارد کنید.', 'danger');
        passwordInput?.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'در حال بررسی...';

      Promise.resolve(window.AdminAuth.login(username, password, remember)).then(function (result) {
        if (result.success) {
          showToast('ورود موفقیت‌آمیز بود! خوش آمدید، ' + (result.admin.fullName || result.admin.name || ''), 'success');
          var redirectUrl = getRedirectUrl() || 'index.html';
          setTimeout(function () { window.location.href = redirectUrl; }, 800);
        } else {
          showToast(result.error, 'danger');
          submitBtn.disabled = false;
          submitBtn.textContent = 'ورود به پنل مدیریت';
          passwordInput?.focus();
        }
      });
    });

    /* Helper: get redirect URL from query string */
    function getRedirectUrl() {
      var params = new URLSearchParams(window.location.search);
      return params.get('redirect');
    }
  }

  /* ── Toast helper (reuse from admin.js or define local) ─────── */
  function showToast(message, type) {
    if (window.CamzyAdmin && window.CamzyAdmin.showToast) {
      window.CamzyAdmin.showToast(message, type);
      return;
    }
    if (window.AdminToast && window.AdminToast.show) {
      window.AdminToast.show(message, type);
      return;
    }
    /* Fallback: simple alert */
    alert(message);
  }

  /* ── Guard admin pages (not login) ──────────────────────────── */
  function guardAdminPage() {
    try {
      var path = window.location.pathname || '';
      var isLogin = path.indexOf('login.html') !== -1;
      if (isLogin) return;
      // Only guard /admin/ pages
      var isAdminPage = path.indexOf('/admin') !== -1 || document.querySelector('.admin-body') || document.getElementById('admin-sidebar');
      if (!isAdminPage) return;
      requireAdminAuth();
    } catch (_) {}
  }

  /* ── Auto-init when DOM ready ───────────────────────────────── */
  function init() {
    initLoginPage();
    guardAdminPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
