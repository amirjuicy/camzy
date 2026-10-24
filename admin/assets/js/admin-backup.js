/* Backup & update management (admin-only) */
(function () {
  'use strict';

  function adminToken() {
    try {
      var s = JSON.parse(localStorage.getItem('as_admin_session') || 'null');
      return (s && s.token) || '';
    } catch (e) { return ''; }
  }
  function headers(json) {
    var h = {};
    try { var t = adminToken(); if (t) h.Authorization = 'Bearer ' + t; } catch (_) {}
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }
  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }
  function msg(text, type) {
    var el = document.getElementById('bu-message');
    if (el) { el.textContent = text || ''; el.style.color = type === 'danger' ? '#B91C22' : (type === 'success' ? '#15803D' : 'var(--text-muted)'); }
    try { if (window.CamzyAdmin && window.CamzyAdmin.showToast) window.CamzyAdmin.showToast(text, type || 'info'); } catch (_) {}
  }

  var latestBackup = null;
  var backups = [];
  var packages = [];
  var selectedPackage = null;
  var ghRelease = null;
  var ghDownloadedFile = null;

  function renderStatus(data) {
    if (!data) return;
    var v = document.getElementById('bu-version');
    if (v) v.value = (data.version || (data.update && data.update.currentVersion) || '—');
    latestBackup = data.latestBackup || null;
    backups = Array.isArray(data.backups) ? data.backups : [];
    var ld = document.getElementById('bu-latest-date');
    if (ld) ld.value = latestBackup && latestBackup.createdAt ? new Date(latestBackup.createdAt).toLocaleString('fa-IR') : '—';
    var st = document.getElementById('bu-status');
    if (st) st.value = latestBackup ? (latestBackup.status || '—') : '—';
    var up = document.getElementById('bu-update');
    if (up) {
      var u = data.update || {};
      up.value = u.available ? ('بله — ' + (u.latestVersion || u.package || '')) : 'خیر';
    }
    renderBackups();
  }

  function renderBackups() {
    var tbody = document.querySelector('#bu-backups-table tbody');
    if (!tbody) return;
    if (!backups.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">پشتیبانی یافت نشد.</td></tr>';
      return;
    }
    tbody.innerHTML = backups.map(function (b) {
      return '<tr>' +
        '<td style="direction:ltr;text-align:left;font-size:12px">' + (b.filename || '') + '</td>' +
        '<td style="font-size:12px">' + (b.createdAt ? new Date(b.createdAt).toLocaleString('fa-IR') : '—') + '</td>' +
        '<td>' + fmtBytes(b.size) + '</td>' +
        '<td>' + (b.status || '—') + '</td>' +
        '<td><button type="button" class="btn btn-sm" data-bu-download="' + (b.filename || '') + '">دانلود</button></td>' +
        '</tr>';
    }).join('');
  }

  function setSelectedPackage(filename) {
    selectedPackage = filename || null;
    var info = document.getElementById('bu-selected-info');
    var pkg = packages.find(function (p) { return p.filename === selectedPackage; });
    if (info) {
      if (!pkg) info.textContent = 'بسته انتخاب‌شده: —';
      else info.textContent = 'بسته انتخاب‌شده: ' + pkg.filename + ' — نسخه: ' + (pkg.version || '—') + (pkg.notes ? (' — ' + pkg.notes) : '');
    }
  }

  function renderPackages() {
    var tbody = document.querySelector('#bu-packages-table tbody');
    if (!tbody) return;
    if (!packages.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted)">بسته‌ای یافت نشد.</td></tr>';
      return;
    }
    tbody.innerHTML = packages.map(function (p) {
      var checked = selectedPackage === p.filename ? ' checked' : '';
      return '<tr>' +
        '<td><input type="radio" name="bu-package" value="' + p.filename + '"' + checked + '></td>' +
        '<td style="direction:ltr;text-align:left;font-size:12px">' + p.filename + '</td>' +
        '<td>' + (p.version || '—') + '</td>' +
        '<td style="font-size:12px">' + (p.notes || '—') + '</td>' +
        '<td>' + fmtBytes(p.size) + '</td>' +
        '<td style="font-size:12px">' + (p.createdAt ? new Date(p.createdAt).toLocaleString('fa-IR') : '—') + '</td>' +
        '<td><button type="button" class="btn btn-sm btn-danger" data-bu-delete="' + p.filename + '">حذف</button></td>' +
        '</tr>';
    }).join('');

    if (!selectedPackage && packages.length) setSelectedPackage(packages[0].filename);
    else setSelectedPackage(selectedPackage);
  }

  function loadPackages() {
    fetch('/api/admin/updates', { headers: headers() })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'failed');
        packages = Array.isArray(res.body.packages) ? res.body.packages : [];
        renderPackages();
      })
      .catch(function (e) { msg('خطا در بارگذاری بسته‌ها: ' + (e.message || e), 'danger'); });
  }

  function uploadPackage() {
    var input = document.getElementById('bu-upload-file');
    var btn = document.getElementById('bu-upload-btn');
    if (!input || !input.files || !input.files.length) { msg('یک فایل ZIP انتخاب کنید', 'danger'); return; }
    var file = input.files[0];
    var fd = new FormData();
    fd.append('file', file);
    var uploadMsg = document.getElementById('bu-upload-msg');
    if (uploadMsg) uploadMsg.textContent = 'در حال آپلود…';
    if (btn) btn.disabled = true;
    fetch('/api/admin/updates/upload', { method: 'POST', headers: { Authorization: (function(){ var t=adminToken(); return t ? 'Bearer '+t : ''; })() }, body: fd })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'failed');
        if (uploadMsg) uploadMsg.textContent = 'آپلود با موفقیت انجام شد';
        if (input) input.value = '';
        if (res.body.filename) setSelectedPackage(res.body.filename);
        loadPackages();
        loadStatus();
      })
      .catch(function (e) { if (uploadMsg) uploadMsg.textContent = 'خطا در آپلود: ' + (e.message || e); })
      .finally(function () { if (btn) btn.disabled = false; });
  }

  function deletePackage(filename) {
    if (!filename) return;
    if (!confirm('بسته «' + filename + '» حذف شود؟')) return;
    fetch('/api/admin/updates/' + encodeURIComponent(filename), { method: 'DELETE', headers: headers() })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'failed');
        if (selectedPackage === filename) selectedPackage = null;
        loadPackages();
        msg('بسته حذف شد', 'success');
      })
      .catch(function (e) { msg('خطا در حذف بسته: ' + (e.message || e), 'danger'); });
  }

  function loadStatus() {
    loadGitHubConfig();
    fetch('/api/admin/backup/status', { headers: headers() })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'failed');
        renderStatus(res.body);
        loadPackages();
      })
      .catch(function (e) { msg('خطا در بارگذاری وضعیت: ' + (e.message || e), 'danger'); });
  }

  function createBackup() {
    var btn = document.getElementById('bu-create');
    if (btn) btn.disabled = true;
    msg('در حال ایجاد نسخه پشتیبان…', 'info');
    fetch('/api/admin/backup/create', { method: 'POST', headers: headers(true), body: '{}' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'failed');
        msg('نسخه پشتیبان با موفقیت ایجاد شد', 'success');
        loadStatus();
      })
      .catch(function (e) { msg('خطا در ایجاد پشتیبان: ' + (e.message || e), 'danger'); })
      .finally(function () { if (btn) btn.disabled = false; });
  }

  function downloadBackup(filename) {
    filename = filename || (latestBackup && latestBackup.filename);
    if (!filename) { msg('پشتیبانی برای دانلود وجود ندارد', 'danger'); return; }
    var url = '/api/admin/backup/download?file=' + encodeURIComponent(filename);
    fetch(url, { headers: headers() })
      .then(function (r) {
        if (!r.ok) throw new Error('download failed');
        return r.blob();
      })
      .then(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        msg('دانلود آغاز شد', 'success');
      })
      .catch(function () { msg('خطا در دانلود پشتیبان', 'danger'); });
  }

  function ghMsg(text, type) {
    var el = document.getElementById('bu-gh-config-msg');
    if (el) { el.textContent = text || ''; el.style.color = type === 'danger' ? '#B91C22' : (type === 'success' ? '#15803D' : 'var(--text-muted)'); }
  }
  function ghReleaseMsg(text, type) {
    var el = document.getElementById('bu-gh-release-msg');
    if (el) { el.textContent = text || ''; el.style.color = type === 'danger' ? '#B91C22' : (type === 'success' ? '#15803D' : 'var(--text-muted)'); }
  }

  function loadGitHubConfig() {
    fetch('/api/admin/updates/github/config', { headers: headers() })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'failed');
        var b = res.body || {};
        var o = document.getElementById('bu-gh-owner');
        var r = document.getElementById('bu-gh-repo');
        if (o && b.owner) o.value = b.owner;
        if (r && b.repo) r.value = b.repo;
        var ts = document.getElementById('bu-gh-token-status');
        if (ts) ts.textContent = b.tokenConfigured ? 'پیکربندی شده (سرور)' : 'پیکربندی نشده (مخزن عمومی)';
      })
      .catch(function (e) { ghMsg('خطا در بارگذاری پیکربندی: ' + (e.message || e), 'danger'); });
  }

  function saveGitHubConfig() {
    var owner = (document.getElementById('bu-gh-owner') || {}).value || '';
    var repo = (document.getElementById('bu-gh-repo') || {}).value || '';
    owner = String(owner).trim();
    repo = String(repo).trim();
    if (!owner || !repo) { ghMsg('Owner و Repository الزامی هستند', 'danger'); return; }
    fetch('/api/settings', { method: 'PUT', headers: headers(true), body: JSON.stringify({ 'update.github.owner': owner, 'update.github.repo': repo }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'failed');
        ghMsg('پیکربندی ذخیره شد', 'success');
        loadGitHubConfig();
      })
      .catch(function (e) { ghMsg('خطا در ذخیره: ' + (e.message || e), 'danger'); });
  }

  function renderGitHubRelease() {
    var card = document.getElementById('bu-gh-release-card');
    if (!card) return;
    if (!ghRelease) { card.style.display = 'none'; return; }
    card.style.display = '';
    var rel = ghRelease.release || {};
    var v = document.getElementById('bu-gh-version'); if (v) v.value = rel.version || '—';
    var p = document.getElementById('bu-gh-published'); if (p) p.value = rel.publishedAt ? new Date(rel.publishedAt).toLocaleString('fa-IR') : '—';
    var asset = ghRelease.asset;
    var a = document.getElementById('bu-gh-asset'); if (a) a.value = asset ? asset.name : '—';
    var s = document.getElementById('bu-gh-size'); if (s) s.value = asset ? fmtBytes(asset.size) : '—';
    var n = document.getElementById('bu-gh-notes'); if (n) n.value = rel.body || '';
    var d = document.getElementById('bu-gh-digest'); if (d) d.textContent = asset && asset.digest ? ('SHA-256: ' + asset.digest) : 'هش SHA-256 در Release موجود نیست (اعتبارسنجی انجام نمی‌شود)';
  }

  function checkGitHubRelease() {
    var btn = document.getElementById('bu-gh-check');
    if (btn) btn.disabled = true;
    ghMsg('در حال بررسی Release گیت‌هاب…', 'info');
    ghReleaseMsg('', 'info');
    fetch('/api/admin/updates/github/check', { method: 'POST', headers: headers(true), body: JSON.stringify({}) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'failed');
        ghRelease = res.body || null;
        renderGitHubRelease();
        if (ghRelease && ghRelease.asset) {
          ghMsg('آخرین Release یافت شد', 'success');
        } else if (ghRelease) {
          ghMsg('Release یافت شد ولی فایل ZIP موجود نیست', 'danger');
        }
      })
      .catch(function (e) { ghMsg('خطا در بررسی GitHub: ' + (e.message || e), 'danger'); ghRelease = null; renderGitHubRelease(); })
      .finally(function () { if (btn) btn.disabled = false; });
  }

  function downloadGitHubRelease() {
    if (!ghRelease || !ghRelease.asset) { ghReleaseMsg('ابتدا Release را بررسی کنید', 'danger'); return; }
    var btn = document.getElementById('bu-gh-download');
    if (btn) btn.disabled = true;
    ghReleaseMsg('در حال دانلود و اعتبارسنجی…', 'info');
    fetch('/api/admin/updates/github/download', { method: 'POST', headers: headers(true), body: JSON.stringify({ asset: ghRelease.asset.name }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'failed');
        var b = res.body || {};
        ghDownloadedFile = b.filename || null;
        if (b.filename) setSelectedPackage(b.filename);
        loadPackages();
        loadStatus();
        var txt = 'دانلود انجام شد: ' + (b.filename || '') + ' (نسخه ' + (b.version || '—') + ')';
        if (b.digestVerified) txt += ' — SHA-256 تأیید شد';
        ghReleaseMsg(txt, 'success');
        msg(txt, 'success');
      })
      .catch(function (e) { ghReleaseMsg('خطا در دانلود: ' + (e.message || e), 'danger'); })
      .finally(function () { if (btn) btn.disabled = false; });
  }

  function checkAndInstallUpdate() {
    var btn = document.getElementById('bu-update-btn');
    if (!selectedPackage) { msg('ابتدا یک بسته آپدیت را انتخاب کنید', 'danger'); return; }
    if (btn) btn.disabled = true;
    msg('در حال بررسی به‌روزرسانی…', 'info');
    fetch('/api/admin/backup/update/check', { method: 'POST', headers: headers(true), body: JSON.stringify({ package: selectedPackage }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'failed');
        var u = res.body || {};
        if (!u.available) { msg('به‌روزرسانی جدیدی یافت نشد', 'info'); return; }
        var pkgName = u.package || selectedPackage;
         var version = (ghRelease && ghRelease.release && ghRelease.release.version) ? ghRelease.release.version : (u.latestVersion || '—');
        if (!confirm('نصب بسته «' + pkgName + '» با نسخه دقیق «' + version + '» انجام شود؟\nقبل از نصب یک پشتیبان کامل ایجاد و اعتبارسنجی می‌شود.')) return;
        msg('در حال نصب به‌روزرسانی…', 'info');
        return fetch('/api/admin/backup/update/apply', {
          method: 'POST',
          headers: headers(true),
          body: JSON.stringify({ confirm: true, package: pkgName })
        }).then(function (r2) { return r2.json().then(function (j2) { return { ok: r2.ok, body: j2 }; }); })
          .then(function (res2) {
            if (!res2.ok) throw new Error((res2.body && res2.body.error) || 'failed');
            var txt = 'به‌روزرسانی با موفقیت نصب شد. ممکن است نیاز به راه‌اندازی مجدد سرور باشد؛ سرور به‌طور خودکار راه‌اندازی نشد.';
             msg(txt, 'success');
            loadStatus();
            loadPackages();
          });
      })
      .catch(function (e) { msg('خطا در به‌روزرسانی: ' + (e.message || e), 'danger'); })
      .finally(function () { if (btn) btn.disabled = false; });
  }

  // bind
  var cBtn = document.getElementById('bu-create');
  if (cBtn) cBtn.addEventListener('click', createBackup);
  var dBtn = document.getElementById('bu-download');
  if (dBtn) dBtn.addEventListener('click', function () { downloadBackup(); });
  var uBtn = document.getElementById('bu-update-btn');
  if (uBtn) uBtn.addEventListener('click', checkAndInstallUpdate);

  var uploadBtn = document.getElementById('bu-upload-btn');
  if (uploadBtn) uploadBtn.addEventListener('click', uploadPackage);

  var ghSaveBtn = document.getElementById('bu-gh-save');
  if (ghSaveBtn) ghSaveBtn.addEventListener('click', saveGitHubConfig);
  var ghCheckBtn = document.getElementById('bu-gh-check');
  if (ghCheckBtn) ghCheckBtn.addEventListener('click', checkGitHubRelease);
  var ghDownloadBtn = document.getElementById('bu-gh-download');
  if (ghDownloadBtn) ghDownloadBtn.addEventListener('click', downloadGitHubRelease);

  document.addEventListener('change', function (e) {
    var r = e.target && e.target.name === 'bu-package' ? e.target : null;
    if (r && r.value) setSelectedPackage(r.value);
  });

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.getAttribute && e.target.getAttribute('data-bu-download');
    if (t) downloadBackup(t);
    var d = e.target && e.target.getAttribute && e.target.getAttribute('data-bu-delete');
    if (d) deletePackage(d);
  });

  // Expose loader for admin.js showView hook (reliable first navigation).
  window.CamzyAdminBackup = { load: loadStatus };

  // initial if already on view
  if ((location.hash || '').replace(/^#\/?/, '') === 'backup-update') { loadStatus(); loadGitHubConfig(); }
})();
