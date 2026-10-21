/* Camzy — Admin Gallery: folder browser, upload, multi-select, bulk delete/move. */
(function () {
  'use strict';
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function token() { try { var s = JSON.parse(localStorage.getItem('as_admin_session') || 'null'); return (s && s.token) || ''; } catch (e) { return ''; } }
  function toast(m, t) { if (window.CamzyAdmin) window.CamzyAdmin.showToast(m, t); }
  function fmtSize(n) { n = Number(n) || 0; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'; return (n / 1048576).toFixed(2) + ' MB'; }
  function joinPath(a, b) { if (!a || a === '/') return '/' + b; return a.replace(/\/+$/, '') + '/' + b; }

  var currentPath = '';
  var selectedPaths = new Set();
  var allFoldersCache = [];

  var grid = $('#adm-gallery-grid');
  var breadcrumb = $('#adm-gallery-breadcrumb');
  var countEl = $('#adm-gallery-count');
  var searchEl = $('#adm-gallery-search');
  var bulkBar = $('#adm-gallery-bulk-bar');
  var selectedCountEl = $('#adm-gallery-selected-count');
  var moveDestEl = $('#adm-gallery-move-dest');
  var bulkDeleteBtn = $('#adm-gallery-bulk-delete');
  var bulkMoveBtn = $('#adm-gallery-bulk-move');
  var clearSelBtn = $('#adm-gallery-clear-selection');

  function updateSelectionUI() {
    var count = selectedPaths.size;
    if (count > 0) {
      bulkBar.style.display = 'flex';
      selectedCountEl.textContent = count + ' مورد انتخاب‌شده';
      bulkDeleteBtn.disabled = false;
      bulkMoveBtn.disabled = false;
      moveDestEl.disabled = false;
    } else {
      bulkBar.style.display = 'none';
      bulkDeleteBtn.disabled = true;
      bulkMoveBtn.disabled = true;
      moveDestEl.disabled = true;
    }
    // Update checkbox states in grid
    $$('.adm-gallery-item', grid).forEach(function (el) {
      var path = el.getAttribute('data-path');
      var chk = el.querySelector('.adm-gallery-chk');
      if (chk) chk.checked = selectedPaths.has(path);
      el.classList.toggle('is-selected', selectedPaths.has(path));
    });
    // Update select-all checkbox
    var selectAll = $('#adm-gallery-select-all');
    if (selectAll) selectAll.checked = count > 0 && $$('.adm-gallery-item', grid).every(function (el) { return selectedPaths.has(el.getAttribute('data-path')); });
  }

  function renderBreadcrumb() {
    if (!breadcrumb) return;
    var parts = currentPath ? currentPath.replace(/^\/+/, '').split('/') : [];
    var html = '<button type="button" class="adm-breadcrumb__item" data-path="" style="background:none;border:none;color:var(--color-primary);cursor:pointer;padding:2px 6px;border-radius:4px">ریشه</button>';
    var accum = '';
    parts.forEach(function (part, i) {
      accum += (accum ? '/' : '') + part;
      html += '<span style="color:var(--text-muted)">/</span>';
      html += '<button type="button" class="adm-breadcrumb__item" data-path="' + esc(accum) + '" style="background:none;border:none;color:var(--text);cursor:pointer;padding:2px 6px;border-radius:4px">' + esc(part) + '</button>';
    });
    breadcrumb.innerHTML = html;
  }

  function populateMoveDest() {
    if (!moveDestEl) return;
    var currentVal = moveDestEl.value;
    var opts = ['<option value="">— انتخاب پوشه مقصد —</option>'];
    function addFolder(path, label, depth) {
      var prefix = Array(depth + 1).join('— ');
      opts.push('<option value="' + esc(path) + '">' + esc(prefix + label) + '</option>');
    }
    // Root
    addFolder('', 'ریشه', 0);
    // All folders from cache
    allFoldersCache.forEach(function (f) {
      addFolder(f.path, f.name, f.path.split('/').length);
    });
    moveDestEl.innerHTML = opts.join('');
    if (currentVal) moveDestEl.value = currentVal;
  }

  function loadFoldersCache() {
    // Fetch all folders recursively for move destination dropdown
    fetch('/api/admin/gallery/folders', { headers: { Authorization: 'Bearer ' + token() } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) return;
        allFoldersCache = (res.body.folders || []).map(function (f) { return { path: f.path.replace(/^\//, ''), name: f.name }; });
        populateMoveDest();
      })
      .catch(function () {});
  }

  function renderGrid(data) {
    if (!grid) return;
    var folders = data.folders || [];
    var files = data.files || [];
    var filter = (searchEl && searchEl.value || '').trim().toLowerCase();
    var showFolders = folders.filter(function (f) { return !filter || f.name.toLowerCase().indexOf(filter) !== -1; });
    var showFiles = files.filter(function (f) { return !filter || f.name.toLowerCase().indexOf(filter) !== -1; });

    if (!showFolders.length && !showFiles.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:40px">موردی یافت نشد.</div>';
      countEl.textContent = 'پوشه‌ها: ۰ | فایل‌ها: ۰';
      return;
    }

    countEl.textContent = 'پوشه‌ها: ' + folders.length.toLocaleString('fa-IR') + ' | فایل‌ها: ' + files.length.toLocaleString('fa-IR');

    var html = '';
    // Select-all checkbox row
    html += '<label class="adm-gallery-item adm-gallery-item--folder adm-gallery-select-all-row" style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg-secondary);border-radius:var(--radius-md);border:1px solid var(--border-color-light);cursor:pointer">';
    html += '<input type="checkbox" id="adm-gallery-select-all" class="adm-gallery-chk" style="width:18px;height:18px;accent-color:var(--color-primary)">';
    html += '<span style="font-weight:500;color:var(--color-primary)">انتخاب همه (' + (folders.length + files.length) + ')</span>';
    html += '</label>';

    // Folders
    showFolders.forEach(function (f) {
      var isSel = selectedPaths.has(f.path);
      html += '<div class="adm-gallery-item adm-gallery-item--folder' + (isSel ? ' is-selected' : '') + '" data-path="' + esc(f.path) + '" data-name="' + esc(f.name) + '" data-is-dir="true" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px;border:2px solid ' + (isSel ? 'var(--color-primary)' : 'var(--border-color-light)') + ';border-radius:var(--radius-lg);background:' + (isSel ? 'var(--color-primary-light)' : 'var(--bg)') + ';cursor:pointer;transition:border-color var(--transition-fast),background var(--transition-fast)">';
      html += '<label style="display:flex;align-items:center;gap:6px;width:100%;justify-content:flex-start;padding:0 4px">';
      html += '<input type="checkbox" class="adm-gallery-chk" style="width:18px;height:18px;accent-color:var(--color-primary);flex-shrink:0" ' + (isSel ? 'checked' : '') + '>';
      html += '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-warning)"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
      html += '<span style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(f.name) + '</span>';
      html += '</label>';
      html += '<span style="font-size:11px;color:var(--text-muted);direction:ltr">' + esc(f.path) + '</span>';
      html += '</div>';
    });

    // Files
    showFiles.forEach(function (f) {
      var isSel = selectedPaths.has(f.path);
      var isImage = /\.(png|jpg|jpeg|gif|webp|svg|avif|bmp|ico)$/i.test(f.name);
      html += '<div class="adm-gallery-item adm-gallery-item--file' + (isSel ? ' is-selected' : '') + '" data-path="' + esc(f.path) + '" data-name="' + esc(f.name) + '" data-is-dir="false" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px;border:2px solid ' + (isSel ? 'var(--color-primary)' : 'var(--border-color-light)') + ';border-radius:var(--radius-lg);background:' + (isSel ? 'var(--color-primary-light)' : 'var(--bg)') + ';cursor:pointer;transition:border-color var(--transition-fast),background var(--transition-fast)">';
      html += '<label style="display:flex;align-items:flex-start;gap:6px;width:100%;padding:0 4px">';
      html += '<input type="checkbox" class="adm-gallery-chk" style="width:18px;height:18px;accent-color:var(--color-primary);flex-shrink:0;margin-top:2px" ' + (isSel ? 'checked' : '') + '>';
      html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;min-width:0">';
      if (isImage) {
        html += '<img src="' + esc(f.url) + '" alt="' + esc(f.name) + '" loading="lazy" style="width:100%;max-width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:var(--radius-md);background:var(--bg-secondary)">';
      } else {
        html += '<div style="width:100%;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;border-radius:var(--radius-md);background:var(--bg-secondary);color:var(--text-muted)"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>';
      }
      html += '<span style="font-size:12px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;width:100%">' + esc(f.name) + '</span>';
      html += '<span style="font-size:11px;color:var(--text-muted);direction:ltr">' + esc(fmtSize(f.size)) + '</span>';
      html += '</div>';
      html += '</label>';
      html += '<span style="font-size:11px;color:var(--text-muted);direction:ltr;word-break:break-all">' + esc(f.path) + '</span>';
      html += '</div>';
    });

    grid.innerHTML = html;

    // Attach click handlers for folder navigation and selection
    $$('.adm-gallery-item', grid).forEach(function (el) {
      var path = el.getAttribute('data-path');
      var isDir = el.getAttribute('data-is-dir') === 'true';

      // Checkbox click - toggle selection only
      var chk = el.querySelector('.adm-gallery-chk');
      if (chk) {
        chk.addEventListener('click', function (e) {
          e.stopPropagation();
          if (chk.checked) selectedPaths.add(path); else selectedPaths.delete(path);
          updateSelectionUI();
        });
      }

      // Item click - navigate folder or toggle selection (if not checkbox)
      el.addEventListener('click', function (e) {
        if (e.target === chk || e.target.closest('.adm-gallery-chk')) return;
        if (isDir) {
          navigateTo(path);
        } else {
          // Toggle selection on file click
          if (selectedPaths.has(path)) selectedPaths.delete(path); else selectedPaths.add(path);
          updateSelectionUI();
        }
      });

      // Double-click on file to open
      if (!isDir) {
        var fileUrl = el.querySelector('img') ? el.querySelector('img').src : null;
        el.addEventListener('dblclick', function (e) {
          e.stopPropagation();
          if (fileUrl) window.open(fileUrl, '_blank');
        });
      }
    });

    // Select-all handler
    var selectAll = $('#adm-gallery-select-all');
    if (selectAll) {
      selectAll.addEventListener('change', function () {
        var items = $$('.adm-gallery-item[data-path]', grid);
        if (selectAll.checked) {
          items.forEach(function (el) { selectedPaths.add(el.getAttribute('data-path')); });
        } else {
          items.forEach(function (el) { selectedPaths.delete(el.getAttribute('data-path')); });
        }
        updateSelectionUI();
      });
    }
  }

  function navigateTo(path) {
    currentPath = path || '';
    selectedPaths.clear();
    loadCurrent();
  }

  function loadCurrent() {
    if (!grid) return;
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:40px">در حال بارگذاری…</div>';
    var q = currentPath ? '?path=' + encodeURIComponent(currentPath.replace(/^\/+/, '')) : '';
    fetch('/api/admin/gallery' + q, { headers: { Authorization: 'Bearer ' + token() } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'failed');
        renderBreadcrumb();
        renderGrid(res.body);
        updateSelectionUI();
      })
      .catch(function (err) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#B91C22;padding:40px">خطا در بارگذاری: ' + esc(err.message) + '</div>';
      });
  }

  function createFolder() {
    var name = prompt('نام پوشه جدید:');
    if (!name || !name.trim()) return;
    name = name.trim();
    if (/[\\/]/.test(name)) { toast('نام پوشه نمی‌تواند شامل / یا \\ باشد', 'danger'); return; }
    var body = { name: name };
    var q = currentPath ? '?path=' + encodeURIComponent(currentPath.replace(/^\/+/, '')) : '';
    fetch('/api/admin/gallery/folder' + q, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'Failed');
        toast('پوشه ایجاد شد', 'success');
        loadCurrent();
        loadFoldersCache();
      })
      .catch(function (err) { toast(err.message || 'خطا در ایجاد پوشه', 'danger'); });
  }

  function bulkDelete() {
    if (!selectedPaths.size) return;
    if (!window.confirm('آیا از حذف ' + selectedPaths.size + ' مورد انتخاب‌شده اطمینان دارید؟')) return;
    var paths = Array.from(selectedPaths);
    fetch('/api/admin/gallery/bulk-delete', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: paths })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'Failed');
        var d = res.body.deleted || [];
        var f = res.body.failed || [];
        if (d.length) toast(d.length + ' مورد حذف شد', 'success');
        if (f.length) toast(f.length + ' مورد با خطا مواجه شد', 'warning');
        selectedPaths.clear();
        loadCurrent();
        loadFoldersCache();
      })
      .catch(function (err) { toast(err.message || 'خطا در حذف گروهی', 'danger'); });
  }

  function bulkMove() {
    if (!selectedPaths.size) return;
    var dest = moveDestEl.value;
    if (!dest && dest !== '') { toast('پوشه مقصد را انتخاب کنید', 'warning'); return; }
    var paths = Array.from(selectedPaths);
    // Prevent moving into self or child
    var invalid = paths.some(function (p) { return p === dest || p.startsWith(dest + '/'); });
    if (invalid) { toast('نمی‌توان پوشه را به داخل خود یا زیرپوشه‌هایش منتقل کرد', 'danger'); return; }
    fetch('/api/admin/gallery/move', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: paths, dest: dest })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'Failed');
        var m = res.body.moved || [];
        var f = res.body.failed || [];
        if (m.length) toast(m.length + ' مورد منتقل شد', 'success');
        if (f.length) toast(f.length + ' مورد با خطا مواجه شد', 'warning');
        selectedPaths.clear();
        loadCurrent();
        loadFoldersCache();
      })
      .catch(function (err) { toast(err.message || 'خطا در انتقال گروهی', 'danger'); });
  }

  function handleUpload(file) {
    var fd = new FormData();
    fd.append('image', file);
    var q = currentPath ? '?folder=' + encodeURIComponent(currentPath.replace(/^\/+/, '')) : '';
    toast('در حال آپلود…', 'info');
    fetch('/api/admin/gallery/upload' + q, { method: 'POST', headers: { Authorization: 'Bearer ' + token() }, body: fd })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'upload failed');
        toast('تصویر آپلود شد: ' + res.body.path, 'success');
        loadCurrent();
      })
      .catch(function (err) { toast(err.message || 'خطا در آپلود', 'danger'); });
  }

  // Event listeners
  document.addEventListener('click', function (e) {
    // Breadcrumb navigation
    var bc = e.target.closest('.adm-breadcrumb__item[data-path]');
    if (bc) {
      var path = bc.getAttribute('data-path');
      navigateTo(path);
      return;
    }
    // New folder
    if (e.target.closest('#adm-gallery-new-folder')) { createFolder(); return; }
    // Refresh
    if (e.target.closest('#adm-gallery-refresh')) { loadCurrent(); loadFoldersCache(); return; }
    // Bulk delete
    if (e.target.closest('#adm-gallery-bulk-delete')) { bulkDelete(); return; }
    // Bulk move
    if (e.target.closest('#adm-gallery-bulk-move')) { bulkMove(); return; }
    // Clear selection
    if (e.target.closest('#adm-gallery-clear-selection')) { selectedPaths.clear(); updateSelectionUI(); return; }
  });

  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'adm-gallery-file') {
      var f = e.target.files && e.target.files[0];
      if (f) handleUpload(f);
      e.target.value = '';
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'adm-gallery-search') {
      // Re-render with filter
      var data = { folders: [], files: [] };
      // We need to re-fetch or use cached data - for simplicity, re-fetch
      loadCurrent();
    }
    if (e.target && e.target.id === 'adm-gallery-move-dest') {
      // Keep selected value
    }
  });

  // Load when gallery view opens
  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    if (window.CamzyAdmin || tries > 100) { clearInterval(iv); loadCurrent(); loadFoldersCache(); }
  }, 100);
  if ((location.hash || '').replace(/^#\/?/, '') === 'gallery') { loadCurrent(); loadFoldersCache(); }

  // Listen for view changes
  window.addEventListener('hashchange', function () {
    if ((location.hash || '').replace(/^#\/?/, '') === 'gallery') {
      currentPath = '';
      selectedPaths.clear();
      loadCurrent();
      loadFoldersCache();
    }
  });
})();