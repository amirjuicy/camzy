/* Camzy — Admin SMS panel (پنل پیامک). Loads/saves sms.* keys via /api/settings. */
(function () {
  'use strict';
  function $(s, c) { return (c || document).querySelector(s); }
  function token() {
    try { var s = JSON.parse(localStorage.getItem('as_admin_session') || 'null'); return (s && s.token) || ''; }
    catch (e) { return ''; }
  }
  function toast(msg, type) {
    var w = document.querySelector('.adm-toast-wrap');
    if (!w) { w = document.createElement('div'); w.className = 'adm-toast-wrap'; document.body.appendChild(w); }
    var el = document.createElement('div');
    el.className = 'adm-toast adm-toast--' + (type || 'info');
    el.innerHTML = '<span class="adm-toast__text"></span>';
    el.querySelector('.adm-toast__text').textContent = msg;
    w.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2600);
  }
  var IDS = ['sms-enabled', 'sms-provider', 'sms-api-key', 'sms-token', 'sms-sender'];
  var MAP = {
    'sms-enabled': 'sms.enabled', 'sms-provider': 'sms.provider', 'sms-api-key': 'sms.api_key',
    'sms-token': 'sms.token', 'sms-sender': 'sms.sender'
  };
  function load() {
    if (!document.getElementById('adm-sms-form')) return;
    fetch('/api/settings', { headers: { Authorization: 'Bearer ' + token() } })
      .then(function (r) { return r.json(); })
      .then(function (s) {
        IDS.forEach(function (id) {
          var el = document.getElementById(id);
          if (!el || !s) return;
          var v = s[MAP[id]];
          if (v === undefined) return;
          if (el.type === 'checkbox') el.checked = String(v) === '1';
          else el.value = v;
        });
      }).catch(function () {});
  }
  function bind() {
    var form = document.getElementById('adm-sms-form');
    if (!form || form.dataset.smsBound) return;
    form.dataset.smsBound = '1';
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var payload = {};
      IDS.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        payload[MAP[id]] = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
      });
      fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify(payload)
      }).then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function () { toast('تنظیمات پیامک ذخیره شد', 'success'); })
        .catch(function () { toast('خطا در ذخیره تنظیمات پیامک', 'danger'); });
    });
    var btn = document.getElementById('adm-sms-test');
    if (btn) btn.addEventListener('click', function () {
      var toEl = document.getElementById('sms-test-to');
      var to = toEl ? toEl.value.trim() : '';
      if (!to) { toast('شماره موبایل مقصد را وارد کنید', 'danger'); if (toEl) toEl.focus(); return; }
      btn.disabled = true;
      fetch('/api/sms-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ to: to, text: 'تست سامانه پیامکی کمزی' })
      }).then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function () { toast('پیامک آزمایشی ارسال شد', 'success'); })
        .catch(function () { toast('خطا در ارسال پیامک آزمایشی', 'danger'); })
        .finally(function () { btn.disabled = false; });
    });
  }
  document.addEventListener('DOMContentLoaded', function () { load(); bind(); });
  load(); bind();
})();
