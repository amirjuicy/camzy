/* ================================================================
   Camzy — Admin Notifications (اعلان‌ها)
   In-app notifications (no SMS/push): create/edit/delete,
   title + message, type, target (all users or one user),
   active/inactive, start/end dates, read/unread stats,
   search + filters + pagination. Backed by SQLite via
   /api/admin/notifications. User pick via /api/users.
   ================================================================ */
(function () {
  'use strict';
  var sec = document.querySelector('section[data-view="notifications"]');
  if (!sec) return;
  var tbody = sec.querySelector('#adm-notifs-table tbody');
  if (!tbody) return;

  var PAGE_SIZE = 20;
  var TYPES = {
    info: { name: 'اطلاع‌رسانی', cls: 'adm-badge--info' },
    success: { name: 'موفقیت', cls: 'adm-badge--success' },
    warning: { name: 'هشدار', cls: 'adm-badge--warning' },
    error: { name: 'خطا', cls: 'adm-badge--danger' },
    promo: { name: 'تبلیغاتی', cls: 'adm-badge--primary' }
  };

  var searchInput = sec.querySelector('#adm-notifs-search');
  var typeFilter = sec.querySelector('#adm-notifs-type');
  var activeFilter = sec.querySelector('#adm-notifs-active');
  var pagination = sec.querySelector('#adm-notifs-pagination');
  var metaEl = sec.querySelector('.adm-table-footer__meta');
  var cardSub = sec.querySelector('.adm-card__sub');

  var state = { items: [], total: 0, page: 1, q: '', type: 'all', active: 'all' };
  var debounce = null;

  function $(s, c) { return (c || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toast(m, t) { if (window.CamzyAdmin && window.CamzyAdmin.showToast) window.CamzyAdmin.showToast(m, t); }
  function fa(n) { try { return Number(n || 0).toLocaleString('fa-IR'); } catch (e) { return String(n); } }
  function tok() { try { var s = JSON.parse(localStorage.getItem('as_admin_session') || 'null'); return (s && s.token) || ''; } catch (e) { return ''; } }
  function api(path, opts) {
    var h = { 'Content-Type': 'application/json' };
    var t = tok();
    if (t) h['Authorization'] = 'Bearer ' + t;
    var m = Object.assign({ headers: h }, opts || {});
    if (opts && opts.headers) m.headers = Object.assign({}, h, opts.headers);
    return fetch('/api' + path, m).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || ('Request failed ' + res.status));
        return data;
      });
    });
  }
  function isHttp() { try { return window.location.protocol.indexOf('http') === 0; } catch (e) { return false; } }
  function fmtDate(v) {
    if (!v) return '—';
    try {
      var d = new Date(v);
      if (isFinite(d.getTime())) return d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {}
    return String(v);
  }
  function toLocalInput(v) {
    if (!v) return '';
    try {
      var d = new Date(v);
      if (!isFinite(d.getTime())) return '';
      var p = function (n) { return String(n).padStart(2, '0'); };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (e) { return ''; }
  }

  function typeBadge(t) {
    var m = TYPES[t] || TYPES.info;
    return '<span class="adm-badge ' + m.cls + '">' + m.name + '</span>';
  }

  function pageCount() { return Math.max(1, Math.ceil(state.total / PAGE_SIZE)); }

  function load() {
    if (!isHttp()) { toast('برای مشاهده اعلان‌ها، پنل را از طریق سرور باز کنید', 'danger'); return; }
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-muted)">در حال بارگذاری…</td></tr>';
    var parts = ['limit=' + PAGE_SIZE, 'offset=' + ((state.page - 1) * PAGE_SIZE)];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.type !== 'all') parts.push('type=' + encodeURIComponent(state.type));
    if (state.active !== 'all') parts.push('active=' + encodeURIComponent(state.active));
    api('/admin/notifications?' + parts.join('&')).then(function (data) {
      state.items = (data && data.items) || [];
      state.total = (data && data.total) || 0;
      if (state.page > pageCount() && state.total > 0) { state.page = pageCount(); load(); return; }
      render();
    }).catch(function (err) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-muted)">خطا: ' + esc(err.message || '') + '</td></tr>';
    });
  }

  function render() {
    if (!state.items.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--color-text-muted-dark)">اعلانی ثبت نشده است.</td></tr>';
    } else {
      tbody.innerHTML = state.items.map(function (n) {
        var target = n.target === 'all' ? '<span class="adm-badge adm-badge--primary adm-badge--plain">همه کاربران</span>'
          : '<span class="adm-badge adm-badge--neutral adm-badge--plain">کاربر خاص</span>';
        var active = n.isActive ? '<span class="adm-badge adm-badge--success">فعال</span>' : '<span class="adm-badge adm-badge--muted">غیرفعال</span>';
        var range = (n.startsAt || n.endsAt)
          ? '<div class="adm-table__sub">' + esc(fmtDate(n.startsAt)) + ' تا ' + esc(fmtDate(n.endsAt)) + '</div>' : '';
        return '<tr data-id="' + n.id + '">'
          + '<td><strong>' + esc(n.title) + '</strong><div class="adm-table__sub" style="white-space:normal">' + esc((n.message || '').slice(0, 80)) + '</div></td>'
          + '<td>' + typeBadge(n.type) + '</td>'
          + '<td>' + target + '</td>'
          + '<td>' + active + range + '</td>'
          + '<td>' + fa(n.readCount) + ' خوانده‌شده</td>'
          + '<td>' + esc(fmtDate(n.createdAt)) + '</td>'
          + '<td><div class="adm-table__cell-actions">'
          + '<button type="button" class="adm-btn-icon" data-nview="' + n.id + '" title="مشاهده"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>'
          + '<button type="button" class="adm-btn-icon" data-nedit="' + n.id + '" title="ویرایش"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg></button>'
          + '<button type="button" class="adm-btn-icon" data-ntoggle="' + n.id + '" data-active="' + (n.isActive ? '0' : '1') + '" title="' + (n.isActive ? 'غیرفعال کردن' : 'فعال کردن') + '"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>'
          + '<button type="button" class="adm-btn-icon adm-btn-icon--danger" data-ndel="' + n.id + '" title="حذف"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>'
          + '</div></td></tr>';
      }).join('');
    }
    if (cardSub) cardSub.textContent = fa(state.total) + ' اعلان ثبت‌شده';
    if (metaEl) {
      var from = state.total === 0 ? 0 : (state.page - 1) * PAGE_SIZE + 1;
      metaEl.textContent = 'نمایش ' + fa(from) + ' تا ' + fa(Math.min(state.page * PAGE_SIZE, state.total)) + ' از ' + fa(state.total) + ' اعلان';
    }
    renderPagination();
  }

  function renderPagination() {
    if (!pagination) return;
    var pages = pageCount();
    if (pages <= 1) { pagination.innerHTML = ''; return; }
    var nums = [];
    [1, 2, state.page - 1, state.page, state.page + 1, pages - 1, pages].forEach(function (p) {
      if (p >= 1 && p <= pages && nums.indexOf(p) === -1) nums.push(p);
    });
    nums.sort(function (a, b) { return a - b; });
    var html = '<button type="button" class="adm-pagination__btn" data-npage="prev"' + (state.page <= 1 ? ' disabled' : '') + ' aria-label="صفحه قبل">'
      + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg></button>';
    var prev = 0;
    nums.forEach(function (p) {
      if (p - prev > 1) html += '<button type="button" class="adm-pagination__btn" disabled>…</button>';
      html += '<button type="button" class="adm-pagination__btn' + (p === state.page ? ' is-active' : '') + '" data-npage="' + p + '">' + fa(p) + '</button>';
      prev = p;
    });
    html += '<button type="button" class="adm-pagination__btn" data-npage="next"' + (state.page >= pages ? ' disabled' : '') + ' aria-label="صفحه بعد">'
      + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 6 9 12 15 18"/></svg></button>';
    pagination.innerHTML = html;
  }

  /* ── Add / edit modal ─────────────────────────────────── */
  var pickedUser = null;
  var pickedProduct = null;
  var userDebounce = null;
  var prodDebounce = null;
  function syncLinkUI(){
    var lt=(document.getElementById('adm-nm-linktype')||{}).value||'';
    var vw=document.getElementById('adm-nm-linkvalue-wrap');
    var pw=document.getElementById('adm-nm-product-wrap');
    if(vw) vw.style.display = (lt==='category'||lt==='custom')?'':'none';
    if(pw) pw.style.display = lt==='product'?'':'none';
  }
  function searchProducts(q){
    var box=document.getElementById('adm-nm-product-results'); if(!box) return;
    if(!q){box.innerHTML='';return;}
    api('/products?limit=8&q='+encodeURIComponent(q)).then(function(data){
      var items=Array.isArray(data)?data:(data.items||[]);
      if(!items.length){box.innerHTML='<p style="font-size:12px;color:var(--text-muted)">محصولی یافت نشد.</p>';return;}
      box.innerHTML=items.map(function(p){return '<button type="button" data-ppick="'+esc(p.id)+'" data-pname="'+esc(p.name)+'" style="display:flex;justify-content:space-between;width:100%;padding:6px 8px;font-size:12px;border:1px solid var(--border-color-light);border-radius:var(--radius-lg);margin-bottom:4px;background:var(--bg-card);cursor:pointer"><span>'+esc(p.name)+'</span><span style="color:var(--text-muted)">#'+esc(p.id)+'</span></button>';}).join('');
    }).catch(function(){});
  }

  function openModal(m) { if (m) { m.classList.add('is-open'); m.setAttribute('aria-hidden', 'false'); } }
  function closeModal(m) { if (m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); } }

  function syncTargetUI() {
    var one = document.getElementById('adm-nm-target-user');
    var wrap = document.getElementById('adm-nm-userwrap');
    if (wrap) wrap.style.display = one && one.checked ? '' : 'none';
  }

  function openAdd() {
    var f = document.getElementById('adm-notif-form');
    if (!f) return;
    f.reset();
    document.getElementById('adm-nm-id').value = '';
    document.getElementById('adm-nm-title').textContent = 'اعلان جدید';
    document.getElementById('adm-nm-submit').textContent = 'ایجاد اعلان';
    document.getElementById('adm-nm-active').checked = true;
    document.getElementById('adm-nm-target-all').checked = true;
    pickedUser = null;
    document.getElementById('adm-nm-userpick').innerHTML = '<span style="font-size:12px;color:var(--text-muted)">کاربری انتخاب نشده</span>';
    document.getElementById('adm-nm-userresults').innerHTML = '';
    document.getElementById('adm-nm-usersearch').value = '';
    document.getElementById('adm-nm-image').value='';
    document.getElementById('adm-nm-linktype').value='';
    document.getElementById('adm-nm-linkvalue').value='';
    pickedProduct=null; document.getElementById('adm-nm-product-pick').innerHTML='<span style="font-size:12px;color:var(--text-muted)">محصولی انتخاب نشده</span>';
    document.getElementById('adm-nm-product-results').innerHTML=''; document.getElementById('adm-nm-product-search').value='';
    syncTargetUI(); syncLinkUI(); if(typeof updatePreview==='function') updatePreview();
    openModal(document.getElementById('adm-notif-modal'));
  }

  function openEdit(id) {
    var n = state.items.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!n) return;
    document.getElementById('adm-nm-id').value = n.id;
    document.getElementById('adm-nm-title2').value = n.title || '';
    document.getElementById('adm-nm-message').value = n.message || '';
    document.getElementById('adm-nm-type').value = n.type || 'info';
    document.getElementById('adm-nm-active').checked = !!n.isActive;
    document.getElementById('adm-nm-starts').value = toLocalInput(n.startsAt);
    document.getElementById('adm-nm-ends').value = toLocalInput(n.endsAt);
    document.getElementById('adm-nm-image').value = n.imageUrl || '';
    document.getElementById('adm-nm-linktype').value = n.linkType || '';
    document.getElementById('adm-nm-linkvalue').value = n.linkValue || '';
    pickedProduct=null;
    if(n.linkType==='product' && n.productId){
      pickedProduct={id:n.productId, name:'#'+n.productId};
      document.getElementById('adm-nm-product-pick').innerHTML='<span class="adm-badge adm-badge--primary">'+esc(n.productId)+'</span>';
      api('/products/'+encodeURIComponent(n.productId)).then(function(p){ pickedProduct={id:p.id,name:p.name}; document.getElementById('adm-nm-product-pick').innerHTML='<span class="adm-badge adm-badge--primary">'+esc(p.name)+'</span>'; }).catch(function(){});
    } else { document.getElementById('adm-nm-product-pick').innerHTML='<span style="font-size:12px;color:var(--text-muted)">محصولی انتخاب نشده</span>'; }
    document.getElementById('adm-nm-product-results').innerHTML=''; document.getElementById('adm-nm-product-search').value='';
    syncLinkUI();
    pickedUser = null;
    if (n.target && n.target !== 'all') {
      document.getElementById('adm-nm-target-user').checked = true;
      api('/users/' + encodeURIComponent(n.target), {}).then(function (u) {
        var nm = ((u.first_name || '') + ' ' + (u.last_name || '')).trim() || u.mobile || u.id;
        pickedUser = { id: u.id, name: nm };
        document.getElementById('adm-nm-userpick').innerHTML = '<span class="adm-badge adm-badge--primary">' + esc(nm) + '</span>';
      }).catch(function () {
        pickedUser = { id: n.target, name: n.target };
        document.getElementById('adm-nm-userpick').innerHTML = '<span class="adm-badge adm-badge--primary">' + esc(n.target) + '</span>';
      });
    } else {
      document.getElementById('adm-nm-target-all').checked = true;
      document.getElementById('adm-nm-userpick').innerHTML = '<span style="font-size:12px;color:var(--text-muted)">کاربری انتخاب نشده</span>';
    }
    document.getElementById('adm-nm-userresults').innerHTML = '';
    document.getElementById('adm-nm-usersearch').value = '';
    document.getElementById('adm-nm-title').textContent = 'ویرایش اعلان';
    document.getElementById('adm-nm-submit').textContent = 'ذخیره تغییرات';
    syncTargetUI();
    openModal(document.getElementById('adm-notif-modal'));
  }

  function searchUsers(q) {
    var box = document.getElementById('adm-nm-userresults');
    if (!box) return;
    if (!q) { box.innerHTML = ''; return; }
    api('/users?limit=8&q=' + encodeURIComponent(q)).then(function (data) {
      var items = Array.isArray(data) ? data : (data.items || []);
      if (!items.length) { box.innerHTML = '<p style="font-size:12px;color:var(--text-muted)">کاربری یافت نشد.</p>'; return; }
      box.innerHTML = items.map(function (u) {
        var nm = ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || u.mobile || u.id;
        return '<button type="button" data-npick="' + esc(u.id) + '" data-nname="' + esc(nm) + '" style="display:flex;justify-content:space-between;width:100%;padding:6px 8px;font-size:12px;border:1px solid var(--border-color-light);border-radius:var(--radius-lg);margin-bottom:4px;background:var(--bg-card);cursor:pointer">'
          + '<span>' + esc(nm) + '</span><span dir="ltr" style="color:var(--text-muted)">' + esc(u.mobile || '') + '</span></button>';
      }).join('');
    }).catch(function () {});
  }

  /* ── View modal (full content + read status) ──────────── */
  function openView(id) {
    var m = document.getElementById('adm-notif-view-modal');
    if (!m) return;
    m.querySelector('#adm-nv-body').innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-muted)">در حال بارگذاری…</p>';
    openModal(m);
    api('/admin/notifications/' + encodeURIComponent(id)).then(function (d) {
      var readers = (d.readers || []).map(function (r) {
        return '<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px dashed var(--border-color-light)"><span>' + esc(r.name || r.userId) + '</span><span style="color:var(--text-muted)">' + esc(fmtDate(r.readAt)) + '</span></div>';
      }).join('') || '<p style="font-size:12px;color:var(--text-muted)">هنوز خوانده نشده است.</p>';
      m.querySelector('#adm-nv-title').textContent = d.title || 'مشاهده اعلان';
      m.querySelector('#adm-nv-body').innerHTML = '<div style="display:grid;gap:12px;font-size:13px">'
        + '<div>' + typeBadge(d.type) + ' ' + (d.isActive ? '<span class="adm-badge adm-badge--success">فعال</span>' : '<span class="adm-badge adm-badge--muted">غیرفعال</span>') + '</div>'
        + '<div><strong>متن کامل:</strong><div style="margin-top:4px;padding:10px;border:1px solid var(--border-color-light);border-radius:var(--radius-lg);white-space:pre-wrap">' + esc(d.message || '') + '</div></div>'
        + '<div><strong>مخاطب:</strong> ' + (d.target === 'all' ? 'همه کاربران' : esc((d.targetUser && d.targetUser.name) || d.target)) + '</div>'
        + '<div><strong>بازه نمایش:</strong> ' + esc(fmtDate(d.startsAt)) + ' تا ' + esc(fmtDate(d.endsAt)) + '</div>'
        + '<div><strong>وضعیت خوانده شدن (' + fa(d.readCount || 0) + '):</strong><div style="margin-top:6px;max-height:220px;overflow-y:auto">' + readers + '</div></div>'
        + '</div>';
    }).catch(function (err) {
      m.querySelector('#adm-nv-body').innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">' + esc(err.message || 'خطا') + '</p>';
    });
  }

  /* ── Events ───────────────────────────────────────────── */
  if (searchInput) searchInput.addEventListener('input', function () {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(function () { state.q = searchInput.value.trim(); state.page = 1; load(); }, 350);
  });
  if (typeFilter) typeFilter.addEventListener('change', function () { state.type = typeFilter.value; state.page = 1; load(); });
  if (activeFilter) activeFilter.addEventListener('change', function () { state.active = activeFilter.value; state.page = 1; load(); });
  if (pagination) pagination.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-npage]') : null;
    if (!btn || btn.disabled) return;
    var v = btn.getAttribute('data-npage');
    if (v === 'prev') { if (state.page > 1) state.page--; else return; }
    else if (v === 'next') { if (state.page < pageCount()) state.page++; else return; }
    else state.page = Math.max(1, Math.min(pageCount(), parseInt(v, 10) || 1));
    load();
  });

  var addBtn = sec.querySelector('[data-nadd]');
  if (addBtn) addBtn.addEventListener('click', function (e) { e.preventDefault(); openAdd(); });

  document.addEventListener('click', function (e) {
    var v = e.target.closest ? e.target.closest('[data-nview]') : null;
    if (v && sec.contains(v)) { e.preventDefault(); openView(v.getAttribute('data-nview')); return; }
    var eb = e.target.closest ? e.target.closest('[data-nedit]') : null;
    if (eb && sec.contains(eb)) { e.preventDefault(); openEdit(eb.getAttribute('data-nedit')); return; }
    var tg = e.target.closest ? e.target.closest('[data-ntoggle]') : null;
    if (tg && sec.contains(tg)) {
      e.preventDefault();
      var nid = tg.getAttribute('data-ntoggle');
      var to = tg.getAttribute('data-active') === '1';
      api('/admin/notifications/' + encodeURIComponent(nid), { method: 'PUT', body: JSON.stringify({ isActive: to }) }).then(function (u) {
        state.items = state.items.map(function (x) { return String(x.id) === String(nid) ? Object.assign({}, x, u) : x; });
        render();
        toast(to ? 'اعلان فعال شد' : 'اعلان غیرفعال شد', 'success');
      }).catch(function (err) { toast(err.message || 'عملیات ناموفق بود', 'danger'); });
      return;
    }
    var del = e.target.closest ? e.target.closest('[data-ndel]') : null;
    if (del && sec.contains(del)) {
      e.preventDefault();
      if (!window.confirm('این اعلان حذف شود؟')) return;
      var did = del.getAttribute('data-ndel');
      api('/admin/notifications/' + encodeURIComponent(did), { method: 'DELETE' }).then(function () {
        state.items = state.items.filter(function (x) { return String(x.id) !== String(did); });
        state.total = Math.max(0, state.total - 1);
        if (!state.items.length && state.page > 1) { state.page--; load(); return; }
        render();
        toast('اعلان حذف شد', 'danger');
      }).catch(function (err) { toast(err.message || 'حذف ناموفق بود', 'danger'); });
      return;
    }
    var pp = e.target.closest ? e.target.closest('[data-ppick]') : null;
    if (pp) {
      pickedProduct={id:pp.getAttribute('data-ppick'), name:pp.getAttribute('data-pname')};
      document.getElementById('adm-nm-product-pick').innerHTML='<span class="adm-badge adm-badge--primary">'+esc(pickedProduct.name)+'</span>';
      document.getElementById('adm-nm-product-results').innerHTML='';
      document.getElementById('adm-nm-product-search').value='';
      return;
    }
    var pk = e.target.closest ? e.target.closest('[data-npick]') : null;
    if (pk) {
      pickedUser = { id: pk.getAttribute('data-npick'), name: pk.getAttribute('data-nname') };
      document.getElementById('adm-nm-userpick').innerHTML = '<span class="adm-badge adm-badge--primary">' + esc(pickedUser.name) + '</span>';
      document.getElementById('adm-nm-userresults').innerHTML = '';
      document.getElementById('adm-nm-usersearch').value = '';
      return;
    }
    if (e.target.closest && e.target.closest('[data-nm-close]')) { closeModal(document.getElementById('adm-notif-modal')); return; }
    if (e.target.closest && e.target.closest('[data-nv-close]')) {
      var vm = document.getElementById('adm-notif-view-modal');
      if (vm) closeModal(vm);
      return;
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeModal(document.getElementById('adm-notif-modal'));
      closeModal(document.getElementById('adm-notif-view-modal'));
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target && (e.target.id === 'adm-nm-target-all' || e.target.id === 'adm-nm-target-user')) syncTargetUI();
  });
  var us = document.getElementById('adm-nm-usersearch');
  if (us) us.addEventListener('input', function () {
    if (userDebounce) clearTimeout(userDebounce);
    userDebounce = setTimeout(function () { searchUsers(us.value.trim()); }, 350);
  });
  function updatePreview(){
    var v=(document.getElementById('adm-nm-image')||{}).value.trim();
    var wrap=document.getElementById('adm-nm-preview');
    var img=document.getElementById('adm-nm-preview-img');
    if(v && img && wrap){ img.src=v; wrap.style.display='flex'; } else if(wrap){ wrap.style.display='none'; }
  }
  var imgInput=document.getElementById('adm-nm-image');
  if(imgInput) imgInput.addEventListener('input', updatePreview);
  var rmBtn=document.getElementById('adm-nm-remove-img');
  if(rmBtn) rmBtn.addEventListener('click', function(){ document.getElementById('adm-nm-image').value=''; updatePreview(); });
  var upBtn=document.getElementById('adm-nm-upload-btn');
  var fileIn=document.getElementById('adm-nm-file');
  if(upBtn && fileIn){
    upBtn.addEventListener('click', function(){
      // show gallery picker + trigger file select on long press alt: just trigger file then show gallery
      fileIn.click();
      // load gallery thumbnails for selection
      var gbox=document.getElementById('adm-nm-gallery');
      if(gbox){
        fetch('/api/admin/gallery', {headers:{Authorization:'Bearer '+tok()}}).then(function(r){return r.json()}).then(function(j){
          var items=(j&&j.items)||[];
          if(!items.length){gbox.style.display='none';return;}
          gbox.style.display='grid'; gbox.style.gridTemplateColumns='repeat(4,1fr)'; gbox.style.gap='6px';
          gbox.innerHTML=items.slice(0,20).map(function(it){return '<img src="'+esc(it.url)+'" data-gpick="'+esc(it.url)+'" style="width:100%;height:60px;object-fit:cover;border-radius:var(--radius-md);cursor:pointer;border:1px solid var(--border-color-light)">'}).join('');
        }).catch(function(){});
        gbox.style.display='block';
      }
    });
    fileIn.addEventListener('change', function(){
      var f=fileIn.files&&fileIn.files[0]; if(!f) return;
      var fd=new FormData(); fd.append('image', f);
      toast('در حال آپلود…','info');
      fetch('/api/admin/gallery/upload', {method:'POST', headers:{Authorization:'Bearer '+tok()}, body:fd}).then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})}).then(function(res){
        if(!res.ok) throw new Error(res.j.error||'upload failed');
        var url=res.j.url||res.j.path||'';
        document.getElementById('adm-nm-image').value=url; updatePreview(); toast('تصویر آپلود شد','success');
        var gbox=document.getElementById('adm-nm-gallery'); if(gbox) gbox.style.display='none';
      }).catch(function(e){toast(e.message||'خطا در آپلود','danger')}).finally(function(){fileIn.value=''});
    });
  }
  document.addEventListener('click', function(e){
    var gp=e.target.closest?e.target.closest('[data-gpick]'):null;
    if(gp){ document.getElementById('adm-nm-image').value=gp.getAttribute('data-gpick'); updatePreview(); var gbox=document.getElementById('adm-nm-gallery'); if(gbox) gbox.style.display='none'; }
  });
  var ps=document.getElementById('adm-nm-product-search');
  if(ps) ps.addEventListener('input', function(){ if(prodDebounce) clearTimeout(prodDebounce); prodDebounce=setTimeout(function(){searchProducts(ps.value.trim());},350); });
  var lt=document.getElementById('adm-nm-linktype');
  if(lt) lt.addEventListener('change', syncLinkUI);

  var form = document.getElementById('adm-notif-form');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = document.getElementById('adm-nm-id').value;
    var title = document.getElementById('adm-nm-title2').value.trim();
    var message = document.getElementById('adm-nm-message').value.trim();
    var type = document.getElementById('adm-nm-type').value;
    var active = document.getElementById('adm-nm-active').checked;
    var oneUser = document.getElementById('adm-nm-target-user').checked;
    if (!title) { toast('عنوان الزامی است', 'danger'); return; }
    if (!message) { toast('متن اعلان الزامی است', 'danger'); return; }
    var target = 'all';
    if (oneUser) {
      if (!pickedUser) { toast('کاربر مخاطب را انتخاب کنید', 'danger'); return; }
      target = pickedUser.id;
    }
    var sv = function (v) { if (!v) return ''; try { var d = new Date(v); if (!isFinite(d.getTime())) return ''; return d.toISOString(); } catch (e) { return ''; } };
    var lt2=(document.getElementById('adm-nm-linktype')||{}).value||'';
    var lv=document.getElementById('adm-nm-linkvalue').value.trim();
    var img=document.getElementById('adm-nm-image').value.trim();
    if(lt2==='product' && !pickedProduct){ toast('محصول را انتخاب کنید','danger'); return; }
    var payload = {
      title: title, message: message, type: type, target: target, isActive: active,
      startsAt: sv(document.getElementById('adm-nm-starts').value),
      endsAt: sv(document.getElementById('adm-nm-ends').value),
      imageUrl: img, linkType: lt2, linkValue: lt2==='product'?'':lv, productId: lt2==='product'?(pickedProduct?pickedProduct.id:''):''
    };
    var btn = document.getElementById('adm-nm-submit');
    btn.disabled = true;
    var req = id
      ? api('/admin/notifications/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(payload) })
      : api('/admin/notifications', { method: 'POST', body: JSON.stringify(payload) });
    req.then(function () {
      closeModal(document.getElementById('adm-notif-modal'));
      if (!id) state.page = 1;
      load();
      toast(id ? 'اعلان به‌روزرسانی شد' : 'اعلان ایجاد شد', 'success');
    }).catch(function (err) { toast(err.message || 'ذخیره ناموفق بود', 'danger'); })
      .finally(function () { btn.disabled = false; });
  });

  load();
  window.CamzyAdminNotifications = { reload: load };
})();
