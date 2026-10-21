/* ================================================================
   Camzy — Admin Contact Messages
   List, filter, view details, mark read/unread, delete.
   Backed by /api/admin/contact-messages.
   ================================================================ */
(function () {
  'use strict';
  var sec = document.querySelector('section[data-view="contact-messages"]');
  if (!sec) return;
  var tbody = sec.querySelector('#adm-cm-table tbody');
  if (!tbody) return;

  var PAGE_SIZE = 20;
  var searchInput = sec.querySelector('#adm-cm-search');
  var statusFilter = sec.querySelector('#adm-cm-status');
  var subjectFilter = sec.querySelector('#adm-cm-subject');
  var pagination = sec.querySelector('#adm-cm-pagination');
  var metaEl = sec.querySelector('.adm-table-footer__meta');
  var cardSub = sec.querySelector('#adm-cm-sub');
  var unreadBadge = sec.querySelector('#adm-cm-unread');

  var state = { items: [], total: 0, page: 1, q: '', status: 'all', subject: '', unreadCount: 0, totalCount: 0 };
  var debounce = null;
  var detailId = null;

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
  function fmtDT(v) {
    if (!v) return '—';
    try {
      var d = new Date(String(v).replace(' ', 'T'));
      if (isFinite(d.getTime())) return d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {}
    return String(v);
  }
  function pageCount() { return Math.max(1, Math.ceil(state.total / PAGE_SIZE)); }

  function loadSubjects() {
    api('/admin/contact-messages/subjects').then(function (list) {
      if (!subjectFilter) return;
      var cur = subjectFilter.value;
      subjectFilter.innerHTML = '<option value="">همه موضوعات</option>' +
        (list || []).map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('');
      subjectFilter.value = cur;
    }).catch(function () {});
  }

  function load() {
    if (!isHttp()) { toast('اتصال به سرور برقرار نیست', 'danger'); return; }
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--text-muted)">در حال بارگذاری...</td></tr>';
    var parts = ['limit=' + PAGE_SIZE, 'offset=' + ((state.page - 1) * PAGE_SIZE)];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.status !== 'all') parts.push('status=' + encodeURIComponent(state.status));
    if (state.subject) parts.push('subject=' + encodeURIComponent(state.subject));
    api('/admin/contact-messages?' + parts.join('&')).then(function (data) {
      state.items = (data && data.items) || [];
      state.total = (data && data.total) || 0;
      state.unreadCount = (data && data.unreadCount) || 0;
      state.totalCount = (data && data.totalCount) || 0;
      if (state.page > pageCount() && state.total > 0) { state.page = pageCount(); load(); return; }
      render();
    }).catch(function (err) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--text-muted)">خطا: ' + esc(err.message || '') + '</tr>';
    });
  }

  function render() {
    if (cardSub) cardSub.textContent = fa(state.totalCount) + ' پیام';
    if (unreadBadge) unreadBadge.textContent = fa(state.unreadCount) + ' نخوانده';
    if (!state.items.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--color-text-muted-dark)">پیامی یافت نشد.</td></tr>';
    } else {
      tbody.innerHTML = state.items.map(function (m) {
        var contact = esc(m.email || '') + (m.phone ? '<div class="adm-table__sub" dir="ltr">' + esc(m.phone) + '</div>' : '');
        if (!m.email && !m.phone) contact = '—';
        var statusBadge = m.isRead
          ? '<span class="adm-badge adm-badge--muted">خوانده</span>'
          : '<span class="adm-badge adm-badge--warning">نخوانده</span>';
        return '<tr data-id="' + m.id + '">'
          + '<td><span class="adm-order-id">#' + m.id + '</span></td>'
          + '<td><strong>' + esc(m.name) + '</strong></td>'
          + '<td>' + contact + '</td>'
          + '<td>' + esc(m.subject || '—') + '</td>'
          + '<td style="max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc((m.message || '').slice(0, 60)) + '</td>'
          + '<td>' + esc(fmtDT(m.createdAt)) + '</td>'
          + '<td>' + statusBadge + '</td>'
          + '<td><div class="adm-table__cell-actions">'
          + '<button type="button" class="adm-btn-icon" data-cm-view="' + m.id + '" title="مشاهده"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>'
          + '<button type="button" class="adm-btn-icon adm-btn-icon--danger" data-cm-del="' + m.id + '" title="حذف"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>'
          + '</div></td></tr>';
      }).join('');
    }
    if (metaEl) {
      var from = state.total === 0 ? 0 : (state.page - 1) * PAGE_SIZE + 1;
      metaEl.textContent = 'نمایش ' + fa(from) + ' تا ' + fa(Math.min(state.page * PAGE_SIZE, state.total)) + ' از ' + fa(state.total) + ' پیام';
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
    var html = '<button type="button" class="adm-pagination__btn" data-cmpage="prev"' + (state.page <= 1 ? ' disabled' : '') + ' aria-label="قبلی">'
      + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg></button>';
    var prev = 0;
    nums.forEach(function (p) {
      if (p - prev > 1) html += '<button type="button" class="adm-pagination__btn" disabled>…</button>';
      html += '<button type="button" class="adm-pagination__btn' + (p === state.page ? ' is-active' : '') + '" data-cmpage="' + p + '">' + fa(p) + '</button>';
      prev = p;
    });
    html += '<button type="button" class="adm-pagination__btn" data-cmpage="next"' + (state.page >= pages ? ' disabled' : '') + ' aria-label="بعدی">'
      + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 6 9 12 15 18"/></svg></button>';
    pagination.innerHTML = html;
  }

  function openModal(m) { if (m) { m.classList.add('is-open'); m.setAttribute('aria-hidden', 'false'); } }
  function closeModal(m) { if (m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); } }

  function openDetail(id) {
    var m = document.getElementById('adm-cm-modal');
    if (!m) return;
    detailId = id;
    m.querySelector('#adm-cm-body').innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-muted)">در حال بارگذاری...</p>';
    openModal(m);
    api('/admin/contact-messages/' + encodeURIComponent(id)).then(function (d) {
      detailId = d.id;
      var rows = [];
      rows.push(['نام', esc(d.name)]);
      rows.push(['ایمیل', d.email ? '<span dir="ltr">' + esc(d.email) + '</span>' : '—']);
      rows.push(['تلفن', d.phone ? '<span dir="ltr">' + esc(d.phone) + '</span>' : '—']);
      rows.push(['موضوع', esc(d.subject || '—')]);
      rows.push(['تاریخ', esc(fmtDT(d.createdAt))]);
      rows.push(['وضعیت', d.isRead ? 'خوانده' : 'نخوانده']);
      m.querySelector('#adm-cm-title').textContent = 'پیام #' + d.id + ' — ' + (d.subject || '');
      m.querySelector('#adm-cm-body').innerHTML =
        '<div style="display:grid;gap:8px">' +
        rows.map(function (r) {
          return '<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 10px;border:1px solid var(--border-color-light);border-radius:var(--radius-md)"><span style="color:var(--text-muted)">' + r[0] + '</span><span style="font-weight:500;word-break:break-all;text-align:left">' + r[1] + '</span></div>';
        }).join('') +
        '<div style="padding:10px;border:1px solid var(--border-color-light);border-radius:var(--radius-md);white-space:pre-wrap;line-height:1.7">' + esc(d.message || '') + '</div>' +
        '</div>';
      var toggleBtn = document.getElementById('adm-cm-toggle');
      if (toggleBtn) toggleBtn.textContent = d.isRead ? 'علامت به عنوان نخوانده' : 'علامت به عنوان خوانده';
    }).catch(function (err) {
      m.querySelector('#adm-cm-body').innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">' + esc(err.message || 'خطا') + '</p>';
    });
  }

  function toggleRead() {
    if (detailId == null) return;
    var item = state.items.filter(function (x) { return String(x.id) === String(detailId); })[0];
    var newRead = item ? !item.isRead : true;
    api('/admin/contact-messages/' + encodeURIComponent(detailId), { method: 'PATCH', body: JSON.stringify({ isRead: newRead }) }).then(function () {
      toast(newRead ? 'علامت به عنوان خوانده شد' : 'علامت به عنوان نخوانده شد', 'success');
      openDetail(detailId);
      load();
    }).catch(function (err) { toast(err.message || 'خطا', 'danger'); });
  }

  function deleteMessage(id) {
    if (!window.confirm('آیا از حذف این پیام اطمینان دارید؟')) return;
    api('/admin/contact-messages/' + encodeURIComponent(id), { method: 'DELETE' }).then(function () {
      state.items = state.items.filter(function (x) { return String(x.id) !== String(id); });
      state.total = Math.max(0, state.total - 1);
      state.totalCount = Math.max(0, state.totalCount - 1);
      if (!state.items.length && state.page > 1) { state.page--; load(); return; }
      render();
      toast('پیام حذف شد', 'danger');
      closeModal(document.getElementById('adm-cm-modal'));
      detailId = null;
    }).catch(function (err) { toast(err.message || 'حذف ناموفق بود', 'danger'); });
  }

  // events
  if (searchInput) searchInput.addEventListener('input', function () {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(function () { state.q = searchInput.value.trim(); state.page = 1; load(); }, 350);
  });
  if (statusFilter) statusFilter.addEventListener('change', function () { state.status = statusFilter.value; state.page = 1; load(); });
  if (subjectFilter) subjectFilter.addEventListener('change', function () { state.subject = subjectFilter.value; state.page = 1; load(); });
  if (pagination) pagination.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-cmpage]') : null;
    if (!btn || btn.disabled) return;
    var v = btn.getAttribute('data-cmpage');
    if (v === 'prev') { if (state.page > 1) state.page--; else return; }
    else if (v === 'next') { if (state.page < pageCount()) state.page++; else return; }
    else state.page = Math.max(1, Math.min(pageCount(), parseInt(v, 10) || 1));
    load();
  });

  document.addEventListener('click', function (e) {
    var v = e.target.closest ? e.target.closest('[data-cm-view]') : null;
    if (v && sec.contains(v)) { e.preventDefault(); openDetail(v.getAttribute('data-cm-view')); return; }
    var del = e.target.closest ? e.target.closest('[data-cm-del]') : null;
    if (del && sec.contains(del)) { e.preventDefault(); deleteMessage(del.getAttribute('data-cm-del')); return; }
    if (e.target.closest && e.target.closest('[data-cm-close]')) { closeModal(document.getElementById('adm-cm-modal')); detailId = null; return; }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeModal(document.getElementById('adm-cm-modal')); detailId = null; }
  });
  var toggleBtn = document.getElementById('adm-cm-toggle');
  if (toggleBtn) toggleBtn.addEventListener('click', toggleRead);
  var delBtn = document.getElementById('adm-cm-del');
  if (delBtn) delBtn.addEventListener('click', function () { if (detailId != null) deleteMessage(detailId); });

  loadSubjects();
  load();
  window.CamzyAdminContactMessages = { reload: load, reloadSubjects: loadSubjects };
})();
