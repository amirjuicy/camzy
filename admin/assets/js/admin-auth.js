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
        if (!res.ok) throw new Error((data && data.error) || ('Request failed: ' + res.status));
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
    if (!session || !session.token) return Promise.resolve(null);
    return apiRequest('GET', '/admin/me').then(function (data) {
      if (data && data.admin) {
        setAdminSession(data.admin, session.token, session.remember);
        return data.admin;
      }
      return null;
    }).catch(function (err) {
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
    if (apiAvailable() && getAdminSession() && getAdminSession().token) {
      return apiRequest('POST', '/admin/logout').catch(function () {}).then(done);
    }
    try { done(); } catch (e) {}
    return Promise.resolve({ success: true });
  }

  function notifyAdminAuthChange() {
    try { window.dispatchEvent(new CustomEvent('as_admin_auth_change')); } catch (e) {}
  }

  /* ── Require admin auth (redirect to login if not authenticated) ── */
  function requireAdminAuth() {
    if (!isAdminLoggedIn()) {
      var loginUrl = '/login.html';
      var current = window.location.pathname + window.location.search + window.location.hash;
      if (current && current !== '/' && !current.includes('login.html')) {
        loginUrl += '?redirect=' + encodeURIComponent(current);
      }
      window.location.href = loginUrl;
      return false;
    }
    /* Async re-validation against the database; redirect if revoked. */
    validateSession().then(function (admin) {
      if (!admin) requireAdminAuth();
    });
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
