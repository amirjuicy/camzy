/* ================================================================
   Camzy — Auth Pages (Login, Register, Forgot Password)
   Actual user registration and login via localStorage.
   ================================================================ */
(function() {
  'use strict';
  var $ = function(s,c) { return (c||document).querySelector(s); };

  /* ── Post-login return URL ──────────────────────────────
     When the user was sent to login.html from another storefront page,
     send them back to that EXACT page (path + query + hash) after login.
     Falls back to the default ('/account') when no valid return URL exists. */
  var DEFAULT_POST_LOGIN_URL = '/account';
  /* After a successful registration, send the customer to the storefront
     homepage (automatic login is already handled by App.register). */
  var DEFAULT_POST_REGISTER_URL = '/';
  function isAuthPageUrl(u) {
    var s = String(u || '').toLowerCase();
    return s.indexOf('login.html') !== -1 || s.indexOf('register.html') !== -1 ||
           s.indexOf('forgot-password.html') !== -1 || s.indexOf('/admin') !== -1 ||
           s.indexOf('offline.html') !== -1 ||
           /(^|\/)(login|register|forgot-password|offline)(\/|$|\?|#)/.test(s);
  }
  function sanitizeReturnUrl(u) {
    if (!u) return null;
    var s = String(u).trim();
    if (!s) return null;
    /* Reject absolute URLs to other origins (open-redirect protection). */
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) || s.indexOf('//') === 0) {
      try {
        var parsed = new URL(s, window.location.href);
        if (parsed.origin !== window.location.origin) return null;
        s = parsed.pathname + parsed.search + parsed.hash;
      } catch (e) { return null; }
    }
    if (isAuthPageUrl(s)) return null;
    if (s.charAt(0) !== '/' && !/^[A-Za-z0-9._\-][A-Za-z0-9._\-/]*(\?.*)?(#.*)?$/.test(s)) return null;
    return s;
  }
  function getPostLoginUrl() {
    try {
      var q = window.location.search || '';
      var m = q.match(/[?&](?:next|returnUrl|redirect)=([^&]*)/);
      if (m) {
        var safe = sanitizeReturnUrl(decodeURIComponent(m[1]));
        if (safe) return safe;
      }
    } catch (e) {}
    /* Header/menu login links carry no query param: fall back to the referrer
       when it is a same-origin, non-auth storefront page. */
    try {
      var ref = document.referrer || '';
      if (ref) {
        var r = new URL(ref, window.location.href);
        if (r.origin === window.location.origin) {
          var rel = r.pathname + r.search + r.hash;
          var safeRef = sanitizeReturnUrl(rel);
          if (safeRef) return safeRef;
        }
      }
    } catch (e) {}
    return DEFAULT_POST_LOGIN_URL;
  }
  function goPostLogin() { window.location.href = getPostLoginUrl(); }
  function goPostRegister() { window.location.href = DEFAULT_POST_REGISTER_URL; }

  function init() {
    /* ── Login form ───────────────────────────────────────── */
    var loginForm = $('#login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var identifier = $('#login-identifier');
        var password = $('#login-password');
        if (!identifier || !identifier.value.trim()) {
          App.showToast('لطفاً موبایل یا ایمیل را وارد کنید.', 'danger');
          return;
        }
        Promise.resolve(App.login(identifier.value.trim(), password ? password.value : '')).then(function(result){
          if (result.success) {
            App.showToast('ورود موفقیت‌آمیز بود! خوش آمدید، ' + result.user.firstName, 'success');
            setTimeout(goPostLogin, 800);
          } else {
            App.showToast(result.error, 'danger');
          }
        });
      });
    }

    /* ── Register form ────────────────────────────────────── */
    var registerForm = $('#register-form');
    if (registerForm) {
      registerForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var firstName = $('#reg-firstname');
        var lastName = $('#reg-lastname');
        var mobile = $('#reg-mobile');
        var email = $('#reg-email');
        var pw = $('#reg-password');
        var pwConfirm = $('#reg-password-confirm');
        var terms = $('#reg-terms');

        if (!firstName || !firstName.value.trim()) { App.showToast('نام را وارد کنید.', 'danger'); return; }
        if (!lastName || !lastName.value.trim()) { App.showToast('نام خانوادگی را وارد کنید.', 'danger'); return; }
        if (!mobile || !mobile.value.trim()) { App.showToast('شماره موبایل را وارد کنید.', 'danger'); return; }
        if (!pw || !pw.value) { App.showToast('رمز عبور را وارد کنید.', 'danger'); return; }
        if (pw.value.length < 6) { App.showToast('رمز عبور باید حداقل ۶ کاراکتر باشد.', 'danger'); return; }
        if (pwConfirm && pw.value !== pwConfirm.value) {
          App.showToast('رمز عبور و تکرار آن مطابقت ندارند.', 'danger');
          return;
        }
        if (terms && !terms.checked) {
          App.showToast('پذیرش شرایط و قوانین الزامی است.', 'danger');
          return;
        }

        Promise.resolve(App.register({
          firstName: firstName.value.trim(),
          lastName: lastName.value.trim(),
          mobile: mobile.value.trim(),
          email: email ? email.value.trim() : '',
          password: pw.value
        })).then(function(result){
          if (result.success) {
            App.showToast('ثبت‌نام موفقیت‌آمیز بود! خوش آمدید، ' + result.user.firstName, 'success');
            setTimeout(goPostRegister, 800);
          } else {
            App.showToast(result.error, 'danger');
          }
        });
      });
    }

    /* ── Forgot password form ─────────────────────────────── */
    var forgotForm = $('#forgot-form');
    if (forgotForm) {
      forgotForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var step1 = $('#forgot-step-1');
        var step2 = $('#forgot-step-2');
        if (step1 && step1.style.display !== 'none') {
          /* Verify the mobile/email exists */
          var identifier = $('#forgot-identifier');
          if (identifier && identifier.value.trim()) {
            var users = JSON.parse(localStorage.getItem('as_users') || '[]');
            var found = users.find(function(u) { return u.mobile === identifier.value.trim() || u.email === identifier.value.trim(); });
            if (!found) {
              App.showToast('کاربری با این مشخصات یافت نشد.', 'danger');
              return;
            }
          }
          step1.style.display = 'none';
          step2.style.display = 'block';
          App.showToast('کد تأیید ارسال شد! (شبیه‌سازی)', 'info');
        } else {
          App.showToast('رمز عبور با موفقیت تغییر کرد! (شبیه‌سازی)', 'success');
          setTimeout(function() { window.location.href = '/login'; }, 1000);
        }
      });
    }

    /* ── OTP toggle ───────────────────────────────────────── */
    var otpToggle = $('#otp-toggle');
    if (otpToggle) {
      otpToggle.addEventListener('click', function() {
        var passForm = $('#login-password-form');
        var otpForm = $('#login-otp-form');
        if (passForm && otpForm) {
          var isPass = passForm.style.display !== 'none';
          passForm.style.display = isPass ? 'none' : 'block';
           otpForm.style.display = isPass ? 'block' : 'none';
           this.textContent = isPass ? 'ورود با رمز عبور' : 'ورود با کد یکبار مصرف';
           var li=document.getElementById('login-identifier'), lp=document.getElementById('login-password'), oi=document.getElementById('otp-identifier');
           if(li) li.required=!isPass; if(lp) lp.required=!isPass; if(oi) oi.required=isPass;
        }
      });
    }

    var otpLoginBtn = $('#otp-login-btn');
    if (otpLoginBtn) {
      otpLoginBtn.addEventListener('click', function() {
        var identifier = $('#otp-identifier');
        if (!identifier || !identifier.value.trim()) {
          App.showToast('لطفاً موبایل یا ایمیل را وارد کنید.', 'danger');
          return;
        }
        /* Simulate OTP login: auto-register if not exists, then login */
        var users = JSON.parse(localStorage.getItem('as_users') || '[]');
        var found = users.find(function(u) { return u.mobile === identifier.value.trim() || u.email === identifier.value.trim(); });
        if (found) {
          Promise.resolve(App.login(identifier.value.trim(), '')).then(function(result){
            if (result.success) {
              App.showToast('ورود موفقیت‌آمیز بود!', 'success');
              setTimeout(goPostLogin, 800);
            } else {
              App.showToast(result.error || 'ورود ناموفق بود. لطفاً دوباره تلاش کنید.', 'danger');
            }
          });
        } else {
          App.showToast('کاربری با این مشخصات یافت نشد. ابتدا ثبت‌نام کنید.', 'danger');
        }
      });
    }

    /* ── Redirect if already logged in ────────────────────── */
    if (App.isLoggedIn()) {
      /* If on login/register page and already logged in, redirect to account */
      var path = window.location.pathname;
      if (path.includes('login') || path.includes('register')) {
        window.location.href = getPostLoginUrl();
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
