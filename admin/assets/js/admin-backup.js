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
    renderSchedule(data.schedule || null);
    renderBackups();
  }

  function scheduleMsg(text, type) {
    var el = document.getElementById('bu-sched-msg');
    if (el) { el.textContent = text || ''; el.style.color = type === 'danger' ? '#B91C22' : (type === 'success' ? '#15803D' : 'var(--text-muted)'); }
  }

  // Schedule card: settings inputs + next run, last success, failure/stale state.
  function renderSchedule(s) {
    var en = document.getElementById('bu-sched-enabled');
    if (en) en.checked = !!(s && s.enabled);
    var tm = document.getElementById('bu-sched-time'); if (tm && s) tm.value = s.time || '00:00';
    var tz = document.getElementById('bu-sched-tz'); if (tz && s) tz.value = s.timezone || '';
    var rc = document.getElementById('bu-retention-count'); if (rc && s) rc.value = s.retentionCount || 20;
    var nr = document.getElementById('bu-sched-next');
    if (nr) nr.value = (s && s.nextRun) ? new Date(s.nextRun).toLocaleString('fa-IR') : '—';
    var ls = document.getElementById('bu-sched-last-success');
    if (ls) {
      ls.value = (s && s.lastSuccess && s.lastSuccess.createdAt)
        ? new Date(s.lastSuccess.createdAt).toLocaleString('fa-IR') + ' (' + (s.lastSuccess.filename || '') + ')'
        : '—';
    }
    var st = document.getElementById('bu-sched-status');
    if (!st) return;
    if (!s) { st.textContent = '—'; st.style.color = 'var(--text-muted)'; return; }
    if (!s.enabled) {
      st.style.color = '#B91C22';
      st.textContent = 'پشتیبان‌گیری خودکار غیرفعال است؛ فقط پشتیبان دستی ساخته می‌شود.';
      return;
    }
    var lines = [];
    lines.push('زمان‌بندی: هر روز ' + s.time + ' به وقت ' + s.timezone +
      (s.timezoneSource === 'system' ? ' (از سیستم)' : ''));
    lines.push('اجرای بعدی: ' + (s.nextRun ? new Date(s.nextRun).toLocaleString('fa-IR') : '—') +
      (s.due ? ' — در انتظار اجرا (' + (s.dueReason || 'due') + ')' : ''));
    lines.push('آخرین پشتیبان موفق: ' + (s.lastSuccess
      ? new Date(s.lastSuccess.createdAt).toLocaleString('fa-IR') + ' — ' + (s.lastSuccess.filename || '')
      : '—') + ' | نگهداری: ' + s.retentionCount + ' نسخه');
    if (s.lastAttempt && s.lastAttempt.status === 'failed') {
      lines.push('آخرین تلاش ناموفق: ' + new Date(s.lastAttempt.createdAt).toLocaleString('fa-IR') +
        ' — ' + (s.lastAttempt.error || 'خطای ناشناخته') +
        (s.attemptsToday ? (' (تلاش‌های این بازه: ' + s.attemptsToday + '/' + s.maxAttemptsPerSlot + ')') : ''));
    }
    if (s.stale) {
      var why = s.staleReason === 'no_successful_backup' ? 'هیچ پشتیبان موفقی ثبت نشده است'
        : s.staleReason === 'last_success_too_old' ? ('آخرین پشتیبان موفق بیش از ' + s.staleAfterHours + ' ساعت پیش است')
        : s.staleReason;
      lines.push('⚠ وضعیت: ' + why);
    }
    if (s.runningOperation) lines.push('یک عملیات پشتیبان/آپدیت در حال اجراست: ' + s.runningOperation);
    st.style.whiteSpace = 'pre-wrap';
    st.textContent = lines.join('\n');
    st.style.color = s.stale ? '#B91C22' : 'var(--text-muted)';
  }

  function saveScheduleSettings() {
    var btn = document.getElementById('bu-sched-save');
    var body = {
      enabled: !!(document.getElementById('bu-sched-enabled') || {}).checked,
      time: String((document.getElementById('bu-sched-time') || {}).value || '').trim(),
      timezone: String((document.getElementById('bu-sched-tz') || {}).value || '').trim(),
      retentionCount: Number((document.getElementById('bu-retention-count') || {}).value || 0)
    };
    if (btn) btn.disabled = true;
    fetch('/api/admin/backup/settings', { method: 'PUT', headers: headers(true), body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'failed');
        scheduleMsg('زمان‌بندی و نگهداری ذخیره شد', 'success');
        renderSchedule(res.body && res.body.schedule);
        loadStatus();
      })
      .catch(function (e) { scheduleMsg('خطا در ذخیره: ' + (e.message || e), 'danger'); })
      .finally(function () { if (btn) btn.disabled = false; });
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
        '<td>' + (b.status || '—') + (b.status === 'failed' && b.error ? ('<div style="font-size:11px;color:#B91C22" dir="ltr">' + String(b.error).replace(/[<>&"]/g, '') + '</div>') : '') + '</td>' +
        '<td>' + (b.status === 'failed' ? '—' : '<button type="button" class="btn btn-sm" data-bu-download="' + (b.filename || '') + '">دانلود</button>') + '</td>' +
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
    fetch('/api/admin/updates/github/config', { method: 'PUT', headers: headers(true), body: JSON.stringify({ owner: owner, repo: repo }) })
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
    var d = document.getElementById('bu-gh-digest');
    if (d) {
      if (asset && asset.digest) d.textContent = 'SHA-256 انتشاریافته (' + (asset.digestSource || 'release') + '): ' + asset.digest;
      else if (asset && asset.sha256Asset) d.textContent = 'فایل جانبی SHA-256 در Release موجود است: ' + asset.sha256Asset + ' (هنگام دانلود اعتبارسنجی می‌شود)';
      else d.textContent = 'هش SHA-256 در Release منتشر نشده است؛ بسته بدون اعتبارسنجی هش دانلود می‌شود و این موضوع در پاسخ گزارش خواهد شد.';
    }
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
        var txt = 'دانلود انجام شد: ' + (b.savedPath || ('data/updates/' + (b.filename || ''))) +
          ' — نسخه ' + (b.version || '—') + ' — فایل ' + (b.filename || '');
        if (b.digestVerified) txt += ' — SHA-256 تأیید شد (' + (b.digestSource || 'release-digest') + ')';
        else if (b.digest) txt += ' — اعتبارسنجی SHA-256 ناموفق بود';
        else txt += ' — در Release هش SHA-256 منتشر نشده بود (بدون اعتبارسنجی هش)';
        ghReleaseMsg(txt, b.digestVerified || !b.digest ? 'success' : 'info');
        msg(txt, b.digestVerified || !b.digest ? 'success' : 'danger');
        if (b.filename) runValidation(b.filename);
      })
      .catch(function (e) { ghReleaseMsg('دانلود ناموفق: ' + (e.message || e), 'danger'); msg('دانلود ناموفق: ' + (e.message || e), 'danger'); })
      .finally(function () { if (btn) btn.disabled = false; });
  }

  /* ── Validation + explicit install confirmation ─────────────── */
  function currentPackage() {
    return selectedPackage || ghDownloadedFile || null;
  }

  function renderValidation(v, file) {
    var el = document.getElementById('bu-validation');
    if (!el) return;
    if (!v) { el.textContent = ''; return; }
    var lines = [];
    lines.push('فایل: ' + (file || '—'));
    lines.push('تعداد فایل‌ها: ' + (v.fileCount || 0) + ' — قابل نصب: ' + (v.installableFiles != null ? v.installableFiles : '—'));
    lines.push('حجم پس از باز شدن: ' + fmtBytes(v.totalUncompressed || 0));
    lines.push('نسخه داخل بسته: ' + (v.manifest && v.manifest.version ? v.manifest.version : '—'));
    lines.push('مسیرهای محافظت‌شده (حفظ می‌شوند): ' + (v.protectedCount || 0));
    var pe = v.protectedEntries || [];
    pe.slice(0, 12).forEach(function (p) { lines.push('  - ' + p); });
    if (pe.length > 12) lines.push('  … و ' + (pe.length - 12) + ' مورد دیگر');
    el.textContent = lines.join('\n');
  }

  function runValidation(file) {
    var el = document.getElementById('bu-validation-msg');
    file = file || currentPackage();
    if (!file) {
      if (el) { el.style.color = 'var(--text-muted)'; el.textContent = 'ابتدا یک بسته را انتخاب یا دانلود کنید'; }
      return Promise.resolve(null);
    }
    if (el) { el.style.color = 'var(--text-muted)'; el.textContent = 'در حال اعتبارسنجی…'; }
    return fetch('/api/admin/updates/validate', { method: 'POST', headers: headers(true), body: JSON.stringify({ file: file }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'failed');
        renderValidation(res.body.validation, res.body.file);
        if (el) { el.style.color = '#15803D'; el.textContent = 'بسته معتبر است' + (res.body.version ? (' — نسخه: ' + res.body.version) : ''); }
        return res.body;
      })
      .catch(function (e) {
        renderValidation(null);
        if (el) { el.style.color = '#B91C22'; el.textContent = 'بسته نامعتبر است: ' + (e.message || e); }
        msg('اعتبارسنجی ناموفق: ' + (e.message || e), 'danger');
        return null;
      });
  }

  function hideConfirmPanel() {
    var panel = document.getElementById('bu-confirm-panel');
    if (panel) panel.style.display = 'none';
  }

  /* The exact version + filename come from server-side validation of the
     staged package — never from a client-side guess. */
  function openInstallConfirm() {
    var pkg = currentPackage();
    if (!pkg) { msg('ابتدا یک بسته آپدیت را انتخاب یا از GitHub دانلود کنید', 'danger'); return; }
    var panel = document.getElementById('bu-confirm-panel');
    var chk = document.getElementById('bu-confirm-check');
    var applyBtn = document.getElementById('bu-confirm-apply');
    var cmsg = document.getElementById('bu-confirm-msg');
    if (cmsg) { cmsg.textContent = 'در حال اعتبارسنجی بسته…'; cmsg.style.color = 'var(--text-muted)'; }
    if (chk) chk.checked = false;
    if (applyBtn) applyBtn.disabled = true;
    if (panel) { panel.dataset.file = ''; panel.dataset.version = ''; panel.style.display = ''; }
    fetch('/api/admin/updates/validate', { method: 'POST', headers: headers(true), body: JSON.stringify({ file: pkg }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'failed');
        renderValidation(res.body.validation, res.body.file);
        var v = document.getElementById('bu-confirm-version');
        var f = document.getElementById('bu-confirm-file');
        var s = document.getElementById('bu-confirm-summary');
        if (v) v.value = res.body.version || '—';
        if (f) f.value = res.body.file || pkg;
        if (s) s.textContent = (res.body.version || '—') + ' با فایل ' + (res.body.file || pkg);
        if (panel) {
          panel.dataset.file = res.body.file || pkg;
          panel.dataset.version = res.body.version || '';
        }
        if (cmsg) {
          if (!res.body.version) {
            cmsg.style.color = '#B91C22';
            cmsg.textContent = 'این بسته فراداده نسخه ندارد؛ نصب با تأیید نسخه دقیق ممکن نیست.';
          } else {
            cmsg.style.color = '#15803D';
            cmsg.textContent = 'بسته معتبر است. برای فعال شدن دکمه نصب، تیک تأیید را بزنید.';
          }
        }
      })
      .catch(function (e) {
        if (cmsg) { cmsg.style.color = '#B91C22'; cmsg.textContent = 'نصب ممکن نیست — بسته نامعتبر است: ' + (e.message || e); }
        msg('اعتبارسنجی ناموفق: ' + (e.message || e), 'danger');
      });
  }

  function applyConfirmedUpdate() {
    var panel = document.getElementById('bu-confirm-panel');
    var chk = document.getElementById('bu-confirm-check');
    var applyBtn = document.getElementById('bu-confirm-apply');
    var cmsg = document.getElementById('bu-confirm-msg');
    if (!panel) return;
    var file = panel.dataset.file;
    var version = panel.dataset.version;
    if (!file || !version) {
      if (cmsg) { cmsg.style.color = '#B91C22'; cmsg.textContent = 'نسخه یا فایل نامعتبر است؛ دوباره بررسی کنید.'; }
      return;
    }
    if (!chk || !chk.checked) {
      if (cmsg) { cmsg.style.color = '#B91C22'; cmsg.textContent = 'برای نصب باید تأیید صریح را علامت بزنید.'; }
      return;
    }
    if (applyBtn) applyBtn.disabled = true;
    if (cmsg) { cmsg.style.color = 'var(--text-muted)'; cmsg.textContent = 'در حال ایجاد و صحت‌سنجی پشتیبان، سپس نصب…'; }
    fetch('/api/admin/backup/update/apply', {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ confirm: true, version: version, filename: file })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'failed');
        var b = res.body || {};
        var txt = 'نصب انجام شد: نسخه ' + (b.version || version) + ' — فایل ' + (b.package || file) +
          ' — فایل‌های تغییریافته: ' + (b.filesApplied != null ? b.filesApplied : '—') +
          ' — پشتیبان: ' + (b.backup && b.backup.filename ? b.backup.filename : '—') + ' (صحت‌سنجی شد)';
        if (cmsg) { cmsg.style.color = '#15803D'; cmsg.textContent = txt; }
        msg('به‌روزرسانی با موفقیت نصب شد', 'success');

        var notice = document.getElementById('bu-restart-notice');
        var rtext = document.getElementById('bu-restart-text');
        if (notice) notice.style.display = '';
        if (rtext) {
          var lines = [];
          lines.push('نسخه نصب‌شده: ' + (b.version || version) + ' — فایل: ' + (b.package || file));
          lines.push('پشتیبان ایجاد و صحت‌سنجی شد: ' + (b.backup && b.backup.filename ? b.backup.filename : '—'));
          if (b.preserved && b.preserved.length) {
            lines.push('مسیرهای حفظ‌شده (داده، آپلودها، اسرار، پشتیبان‌ها، لاگ‌ها): ' +
              b.preserved.slice(0, 8).join('، ') + (b.preserved.length > 8 ? ' …' : ''));
          }
          lines.push('سرور برای اعمال کد جدید ممکن است به راه‌اندازی مجدد نیاز داشته باشد. ' +
            'سرور به‌صورت خودکار ری‌استارت نشد — در صورت نیاز، ری‌استارت را دستی انجام دهید.');
          rtext.style.whiteSpace = 'pre-wrap';
          rtext.textContent = lines.join('\n');
        }
        hideConfirmPanel();
        loadStatus();
        loadPackages();
      })
      .catch(function (e) {
        if (cmsg) { cmsg.style.color = '#B91C22'; cmsg.textContent = 'نصب ناموفق: ' + (e.message || e); }
        msg('خطا در نصب: ' + (e.message || e), 'danger');
      })
      .finally(function () { if (applyBtn) applyBtn.disabled = !(chk && chk.checked); });
  }

  /* ── Upload & restore backup ────────────────────────────────────────
     Separate from the GitHub update workflow: the archive is validated
     server-side on upload, and restoring needs a second, explicit
     confirmation. Nothing is restored before both steps succeed. */
  var stagedRestore = null;      // filename of the validated, staged archive
  var restoreValidated = false;

  function restoreMsg(text, type) {
    var el = document.getElementById('bu-restore-msg');
    if (el) {
      el.textContent = text || '';
      el.style.whiteSpace = 'pre-wrap';
      el.style.color = type === 'danger' ? '#B91C22' : (type === 'success' ? '#15803D' : 'var(--text-muted)');
    }
    try { if (window.CamzyAdmin && window.CamzyAdmin.showToast) window.CamzyAdmin.showToast(text, type || 'info'); } catch (_) {}
  }

  function setRestoreField(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value == null || value === '' ? '—' : value;
  }

  function hideRestoreConfirm() {
    var panel = document.getElementById('bu-restore-confirm');
    if (panel) panel.style.display = 'none';
    var chk = document.getElementById('bu-restore-check');
    if (chk) chk.checked = false;
    var applyBtn = document.getElementById('bu-restore-apply');
    if (applyBtn) applyBtn.disabled = true;
  }

  function resetRestoreInfo() {
    stagedRestore = null;
    restoreValidated = false;
    setRestoreField('bu-restore-name', '');
    setRestoreField('bu-restore-size', '');
    setRestoreField('bu-restore-time', '');
    setRestoreField('bu-restore-result', '');
    var v = document.getElementById('bu-restore-validation');
    if (v) v.textContent = '';
    hideRestoreConfirm();
  }

  function renderRestoreValidation(r, filename, size) {
    setRestoreField('bu-restore-name', filename);
    setRestoreField('bu-restore-size', fmtBytes(size));
    setRestoreField('bu-restore-time', r && r.backupTimestamp ? new Date(r.backupTimestamp).toLocaleString('fa-IR') : '');
    setRestoreField('bu-restore-result', r ? 'معتبر — ساختار، فراداده و صحت پایگاه داده تأیید شد' : 'نامعتبر');
    var pre = document.getElementById('bu-restore-validation');
    if (pre && r) {
      var lines = [];
      lines.push('فایل: ' + filename + ' — حجم: ' + fmtBytes(size));
      lines.push('زمان ساخت پشتیبان: ' + (r.backupTimestamp ? new Date(r.backupTimestamp).toLocaleString('fa-IR') : 'در فراداده ثبت نشده'));
      lines.push('نسخه داخل بسته: ' + (r.version || '—'));
      lines.push('فایل‌های آرشیو: ' + (r.archiveFiles || 0) + ' — داده‌ها: ' + (r.fileCount || 0) + ' — فایل‌های آپلودی: ' + (r.uploadFiles || 0));
      lines.push('صحت پایگاه داده: ' + (r.dbIntegrity === 'ok' ? 'ok' : '—'));
      if (r.sha256) lines.push('SHA-256: ' + r.sha256);
      pre.textContent = lines.join('\n');
    }
  }

  function uploadRestoreBackup() {
    var input = document.getElementById('bu-restore-file');
    var btn = document.getElementById('bu-restore-upload');
    if (!input || !input.files || !input.files.length) { restoreMsg('یک فایل ZIP نسخه پشتیبان انتخاب کنید', 'danger'); return; }
    var file = input.files[0];
    if (!/\.zip$/i.test(file.name)) { restoreMsg('فقط فایل ZIP پذیرفته می‌شود', 'danger'); return; }
    resetRestoreInfo();
    restoreMsg('در حال آپلود و اعتبارسنجی…', 'info');
    if (btn) btn.disabled = true;
    var fd = new FormData();
    fd.append('file', file);
    fetch('/api/admin/backup/restore/upload', {
      method: 'POST',
      headers: { Authorization: (function () { var t = adminToken(); return t ? 'Bearer ' + t : ''; })() },
      body: fd
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'آپلود ناموفق');
        var b = res.body || {};
        var v = b.validation || {};
        stagedRestore = b.filename || null;
        restoreValidated = !!stagedRestore;
        renderRestoreValidation(v, b.filename || file.name, b.size || file.size);
        if (!stagedRestore) throw new Error('نام فایل آپلودشده دریافت نشد');
        // explicit confirmation is required from this point on
        var panel = document.getElementById('bu-restore-confirm');
        var chk = document.getElementById('bu-restore-check');
        var applyBtn = document.getElementById('bu-restore-apply');
        var summary = document.getElementById('bu-restore-summary');
        if (chk) chk.checked = false;
        if (applyBtn) applyBtn.disabled = true;
        if (summary) summary.textContent = b.filename;
        if (panel) panel.style.display = '';
        restoreMsg('آرشیو معتبر است و مرحله‌گذاری شد؛ برای بازیابی، تأیید صریح را علامت بزنید.', 'success');
        if (input) input.value = '';
      })
      .catch(function (e) {
        resetRestoreInfo();
        setRestoreField('bu-restore-result', 'نامعتبر');
        restoreMsg('آرشیو رد شد: ' + (e.message || e), 'danger');
      })
      .finally(function () { if (btn) btn.disabled = false; });
  }

  function applyRestoreBackup() {
    var chk = document.getElementById('bu-restore-check');
    var applyBtn = document.getElementById('bu-restore-apply');
    if (!stagedRestore || !restoreValidated) { restoreMsg('ابتدا یک نسخه پشتیبان آپلود و اعتبارسنجی کنید', 'danger'); return; }
    if (!chk || !chk.checked) { restoreMsg('برای بازیابی باید تأیید صریح را علامت بزنید', 'danger'); return; }
    if (applyBtn) applyBtn.disabled = true;
    restoreMsg('در حال اعتبارسنجی مجدد، ساخت پشتیبان امنیتی و سپس بازیابی…', 'info');
    fetch('/api/admin/backup/restore/apply', {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ confirm: true, file: stagedRestore })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'بازیابی ناموفق');
        var b = res.body || {};
        var sb = b.safetyBackup || {};
        var lines = [];
        lines.push('بازیابی انجام شد: ' + (b.file || stagedRestore) + ' — پایگاه داده و ' + (b.uploadsRestored || 0) + ' فایل آپلودی.');
        lines.push('پشتیبان امنیتی (صحت‌سنجی شد): ' + (sb.filename || '—'));
        if (b.backupTimestamp) lines.push('زمان نسخه بازیابی‌شده: ' + new Date(b.backupTimestamp).toLocaleString('fa-IR'));
        if (b.restartRequired) lines.push('سرور برای دیدن پایگاه داده بازیابی‌شده باید به‌صورت دستی ری‌استارت شود — ری‌استارت خودکار انجام نشد.');
        restoreMsg(lines.join('\n'), 'success');
        restoreValidated = false;
        hideRestoreConfirm();
        loadStatus();
      })
      .catch(function (e) {
        restoreMsg('بازیابی انجام نشد: ' + (e.message || e), 'danger');
      })
      .finally(function () { if (applyBtn) applyBtn.disabled = !(chk && chk.checked && restoreValidated); });
  }

  // bind
  var cBtn = document.getElementById('bu-create');
  if (cBtn) cBtn.addEventListener('click', createBackup);
  var dBtn = document.getElementById('bu-download');
  if (dBtn) dBtn.addEventListener('click', function () { downloadBackup(); });
  var uBtn = document.getElementById('bu-update-btn');
  if (uBtn) uBtn.addEventListener('click', openInstallConfirm);

  var vBtn = document.getElementById('bu-validate');
  if (vBtn) vBtn.addEventListener('click', function () { runValidation(); });

  var sBtn = document.getElementById('bu-sched-save');
  if (sBtn) sBtn.addEventListener('click', saveScheduleSettings);

  var confirmChk = document.getElementById('bu-confirm-check');
  if (confirmChk) confirmChk.addEventListener('change', function () {
    var applyBtn = document.getElementById('bu-confirm-apply');
    if (applyBtn) applyBtn.disabled = !confirmChk.checked;
  });
  var confirmApplyBtn = document.getElementById('bu-confirm-apply');
  if (confirmApplyBtn) confirmApplyBtn.addEventListener('click', applyConfirmedUpdate);
  var confirmCancelBtn = document.getElementById('bu-confirm-cancel');
  if (confirmCancelBtn) confirmCancelBtn.addEventListener('click', hideConfirmPanel);

  var uploadBtn = document.getElementById('bu-upload-btn');
  if (uploadBtn) uploadBtn.addEventListener('click', uploadPackage);

  // Upload & restore backup
  var restoreUploadBtn = document.getElementById('bu-restore-upload');
  if (restoreUploadBtn) restoreUploadBtn.addEventListener('click', uploadRestoreBackup);
  var restoreApplyBtn = document.getElementById('bu-restore-apply');
  if (restoreApplyBtn) restoreApplyBtn.addEventListener('click', applyRestoreBackup);
  var restoreCancelBtn = document.getElementById('bu-restore-cancel');
  if (restoreCancelBtn) restoreCancelBtn.addEventListener('click', hideRestoreConfirm);
  var restoreChk = document.getElementById('bu-restore-check');
  if (restoreChk) restoreChk.addEventListener('change', function () {
    var b = document.getElementById('bu-restore-apply');
    if (b) b.disabled = !(restoreChk.checked && restoreValidated);
  });
  var restoreInput = document.getElementById('bu-restore-file');
  if (restoreInput) restoreInput.addEventListener('change', resetRestoreInfo);

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
