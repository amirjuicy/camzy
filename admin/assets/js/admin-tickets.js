/* ================================================================
   Camzy — Admin Tickets (پشتیبانی و تیکت‌ها)
   Customer ticket list, search (user/mobile/subject/ID),
   status filter (open/pending/answered/closed), full
   conversation detail, admin reply, close/reopen, priority,
   create ticket for a customer, pagination. Backed by SQLite
   tickets + ticket_messages via /api/admin/tickets.
   ================================================================ */
(function () {
  'use strict';
  var sec = document.querySelector('section[data-view="tickets"]');
  if (!sec) return;
  var tbody = sec.querySelector('#adm-tickets-table tbody');
  if (!tbody) return;

  var PAGE_SIZE = 20;
  var STATUS = {
    open: { name: 'باز', cls: 'adm-badge--success' },
    pending: { name: 'در انتظار', cls: 'adm-badge--warning' },
    answered: { name: 'پاسخ داده‌شده', cls: 'adm-badge--info' },
    closed: { name: 'بسته', cls: 'adm-badge--muted' }
  };
  var PRIORITY = {
    low: { name: 'کم', cls: 'adm-badge--neutral adm-badge--plain' },
    normal: { name: 'معمولی', cls: 'adm-badge--primary adm-badge--plain' },
    high: { name: 'زیاد', cls: 'adm-badge--warning' },
    urgent: { name: 'فوری', cls: 'adm-badge--danger' }
  };

  var searchInput = sec.querySelector('#adm-tickets-search');
  var statusFilter = sec.querySelector('#adm-tickets-status');
  var priorityFilter = sec.querySelector('#adm-tickets-priority');
  var pagination = sec.querySelector('#adm-tickets-pagination');
  var metaEl = sec.querySelector('.adm-table-footer__meta');
  var cardSub = sec.querySelector('.adm-card__sub');

  var state = { items: [], total: 0, page: 1, q: '', status: 'all', priority: 'all' };
  var debounce = null;
  var userDebounce = null;
  var pickedUser = null;
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
  function statusBadge(s) { var m = STATUS[s] || STATUS.open; return '<span class="adm-badge ' + m.cls + '">' + m.name + '</span>'; }
  function priorityBadge(p) { var m = PRIORITY[p] || PRIORITY.normal; return '<span class="adm-badge ' + m.cls + '">' + m.name + '</span>'; }
  function pageCount() { return Math.max(1, Math.ceil(state.total / PAGE_SIZE)); }

  function load() {
    if (!isHttp()) { toast('برای مشاهده تیکت‌ها، پنل را از طریق سرور باز کنید', 'danger'); return; }
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-muted)">در حال بارگذاری…</td></tr>';
    var parts = ['limit=' + PAGE_SIZE, 'offset=' + ((state.page - 1) * PAGE_SIZE)];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.status !== 'all') parts.push('status=' + encodeURIComponent(state.status));
    if (state.priority !== 'all') parts.push('priority=' + encodeURIComponent(state.priority));
    api('/admin/tickets?' + parts.join('&')).then(function (data) {
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
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--color-text-muted-dark)">تیکتی یافت نشد.</td></tr>';
    } else {
      tbody.innerHTML = state.items.map(function (t) {
        var user = esc(t.userName || t.userId) + '<div class="adm-table__sub" style="direction:ltr">' + esc(t.userMobile || '') + '</div>';
        return '<tr data-id="' + t.id + '">'
          + '<td><span class="adm-order-id">#' + t.id + '</span></td>'
          + '<td><strong>' + esc(t.subject) + '</strong><div class="adm-table__sub" style="white-space:normal">' + esc((t.lastMessage || '').slice(0, 60)) + '</div></td>'
          + '<td>' + user + '</td>'
          + '<td>' + priorityBadge(t.priority) + '</td>'
          + '<td>' + statusBadge(t.status) + '<div class="adm-table__sub">' + fa(t.messageCount) + ' پیام</div></td>'
          + '<td>' + esc(fmtDT(t.updatedAt)) + '</td>'
          + '<td><div class="adm-table__cell-actions">'
          + '<button type="button" class="adm-btn-icon" data-tview="' + t.id + '" title="مشاهده گفتگو"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>'
          + (t.status === 'closed'
            ? '<button type="button" class="adm-btn-icon" data-treopen="' + t.id + '" title="بازگشایی"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>'
            : '<button type="button" class="adm-btn-icon" data-tclose="' + t.id + '" title="بستن"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></button>')
          + '<button type="button" class="adm-btn-icon adm-btn-icon--danger" data-tdel="' + t.id + '" title="حذف"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>'
          + '</div></td></tr>';
      }).join('');
    }
    if (cardSub) cardSub.textContent = fa(state.total) + ' تیکت پشتیبانی';
    if (metaEl) {
      var from = state.total === 0 ? 0 : (state.page - 1) * PAGE_SIZE + 1;
      metaEl.textContent = 'نمایش ' + fa(from) + ' تا ' + fa(Math.min(state.page * PAGE_SIZE, state.total)) + ' از ' + fa(state.total) + ' تیکت';
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
    var html = '<button type="button" class="adm-pagination__btn" data-tpage="prev"' + (state.page <= 1 ? ' disabled' : '') + ' aria-label="صفحه قبل">'
      + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg></button>';
    var prev = 0;
    nums.forEach(function (p) {
      if (p - prev > 1) html += '<button type="button" class="adm-pagination__btn" disabled>…</button>';
      html += '<button type="button" class="adm-pagination__btn' + (p === state.page ? ' is-active' : '') + '" data-tpage="' + p + '">' + fa(p) + '</button>';
      prev = p;
    });
    html += '<button type="button" class="adm-pagination__btn" data-tpage="next"' + (state.page >= pages ? ' disabled' : '') + ' aria-label="صفحه بعد">'
      + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 6 9 12 15 18"/></svg></button>';
    pagination.innerHTML = html;
  }

  /* ── Detail + reply ───────────────────────────────────── */
  function openModal(m) { if (m) { m.classList.add('is-open'); m.setAttribute('aria-hidden', 'false'); } }
  function closeModal(m) { if (m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); } }

  function bubble(m) {
    var mine = m.sender === 'admin';
    var att=''; if(m.fileUrl){ var isImg=m.fileType&&m.fileType.indexOf('image')===0; if(isImg) att='<div><a href="'+esc(m.fileUrl)+'" target="_blank"><img src="'+esc(m.fileUrl)+'" style="max-width:180px;border-radius:var(--radius-lg);margin-top:6px"></a><br><a href="'+esc(m.fileUrl)+'" target="_blank" download>'+esc(m.fileName||'دانلود')+'</a></div>'; else att='<div style="margin-top:6px"><a href="'+esc(m.fileUrl)+'" target="_blank" download>📎 '+esc(m.fileName||'دانلود')+'</a></div>'; }
    return '<div style="display:flex;justify-content:' + (mine ? 'flex-start' : 'flex-end') + ';margin-bottom:8px">'
      + '<div style="max-width:80%;padding:8px 12px;border-radius:var(--radius-xl);font-size:13px;white-space:pre-wrap;'
      + (mine ? 'background:var(--color-primary-light,#FBD9D6);' : 'background:var(--bg-muted,#f1f5f9);') + '">'
      + '<div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">' + esc(m.authorName || (mine ? 'پشتیبانی' : 'مشتری')) + ' — ' + esc(fmtDT(m.createdAt)) + '</div>'
      + esc(m.message) + att + '</div></div>';
  }

  function openDetail(id) {
    var m = document.getElementById('adm-ticket-modal');
    if (!m) return;
    detailId = id;
    m.querySelector('#adm-tk-body').innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-muted)">در حال بارگذاری…</p>';
    m.querySelector('#adm-tk-reply').value = '';
    openModal(m);
    api('/admin/tickets/' + encodeURIComponent(id)).then(function (d) {
      detailId = d.id;
      var closed = d.status === 'closed';
      m.querySelector('#adm-tk-title').textContent = 'تیکت #' + d.id + ' — ' + (d.subject || '');
      m.querySelector('#adm-tk-meta').innerHTML = statusBadge(d.status) + ' ' + priorityBadge(d.priority)
        + ' <span class="adm-table__sub">' + esc(d.userName || d.userId) + ' — <span dir="ltr">' + esc(d.userMobile || '') + '</span>' + (d.userEmail ? ' — <span dir="ltr">' + esc(d.userEmail) + '</span>' : '') + '</span>';
      m.querySelector('#adm-tk-body').innerHTML = (d.messages || []).map(bubble).join('') || '<p style="color:var(--text-muted)">پیامی ثبت نشده</p>';
      var body = m.querySelector('#adm-tk-body');
      body.scrollTop = body.scrollHeight;
      var replyWrap = m.querySelector('#adm-tk-replywrap');
      if (replyWrap) replyWrap.style.display = closed ? 'none' : '';
      var pr = m.querySelector('#adm-tk-priority');
      if (pr) pr.value = d.priority || 'normal';
      var tg = m.querySelector('#adm-tk-toggle');
      if (tg) tg.textContent = closed ? 'بازگشایی تیکت' : 'بستن تیکت';
    }).catch(function (err) {
      m.querySelector('#adm-tk-body').innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">' + esc(err.message || 'خطا') + '</p>';
    });
  }

  function sendReply() {
    if (detailId == null) return;
    var ta = document.getElementById('adm-tk-reply');
    var text = ta.value.trim();
    if (!text) { toast('متن پاسخ را بنویسید', 'danger'); return; }
    var btn = document.getElementById('adm-tk-send');
    btn.disabled = true;
    api('/admin/tickets/' + encodeURIComponent(detailId) + '/reply', { method: 'POST', body: JSON.stringify({ message: text }) }).then(function () {
      ta.value = '';
      toast('پاسخ ارسال شد', 'success');
      openDetail(detailId);
      load();
    }).catch(function (err) { toast(err.message || 'ارسال ناموفق بود', 'danger'); })
      .finally(function () { btn.disabled = false; });
  }

  function setStatus(id, status, confirmMsg) {
    if (!window.confirm(confirmMsg)) return;
    api('/admin/tickets/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ status: status }) }).then(function () {
      toast(status === 'closed' ? 'تیکت بسته شد' : 'تیکت بازگشایی شد', 'success');
      if (detailId != null && String(detailId) === String(id)) openDetail(id);
      load();
    }).catch(function (err) { toast(err.message || 'عملیات ناموفق بود', 'danger'); });
  }

  /* ── Ticket creator profile ──────────────────────────── */
  function openUserProfile(userId) {
    var m = document.getElementById('adm-tkprofile-modal');
    if (!m || !userId) return;
    m.querySelector('#adm-tkprofile-body').innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-muted)">در حال بارگذاری…</p>';
    openModal(m);
    api('/users/' + encodeURIComponent(userId)).then(function (u) {
      var name = ((u.first_name || '') + ' ' + (u.last_name || '')).trim() || u.mobile || u.id;
      var rows = [];
      rows.push({ label: 'نام', value: esc(name) || '—' });
      rows.push({ label: 'شماره تماس', value: u.mobile ? '<span dir="ltr">' + esc(u.mobile) + '</span>' : '—' });
      rows.push({ label: 'ایمیل', value: u.email ? '<span dir="ltr">' + esc(u.email) + '</span>' : '—' });
      rows.push({ label: 'عضویت', value: esc(u.join_date || '—') });
      m.querySelector('#adm-tkprofile-title').textContent = 'پروفایل کاربر';
      m.querySelector('#adm-tkprofile-body').innerHTML =
        '<div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border-color-light);border-radius:var(--radius-lg);background:var(--bg-card)">'
        + '<div style="width:44px;height:44px;border-radius:50%;background:var(--color-primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600;flex-shrink:0">' + esc((name || '?').trim().charAt(0)) + '</div>'
        + '<div><div style="font-weight:600">' + esc(name) + '</div><div style="font-size:11px;color:var(--text-muted)">شناسه: <span dir="ltr">' + esc(u.id) + '</span></div></div>'
        + '</div>'
        + '<div style="display:grid;gap:8px">'
        + rows.map(function (r) {
          return '<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 10px;border:1px solid var(--border-color-light);border-radius:var(--radius-md)"><span style="color:var(--text-muted)">' + r.label + '</span><span style="font-weight:500;word-break:break-all">' + r.value + '</span></div>';
        }).join('')
        + '</div>';
    }).catch(function (err) {
      m.querySelector('#adm-tkprofile-body').innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">' + esc(err.message || 'عدم دسترسی به پروفایل کاربر') + '</p>';
    });
  }

  /* ── Create for customer ──────────────────────────────── */
  function openCreate() {
    var m = document.getElementById('adm-ticket-create-modal');
    if (!m) return;
    document.getElementById('adm-tc-form').reset();
    pickedUser = null;
    document.getElementById('adm-tc-userpick').innerHTML = '<span style="font-size:12px;color:var(--text-muted)">کاربری انتخاب نشده</span>';
    document.getElementById('adm-tc-userresults').innerHTML = '';
    openModal(m);
  }
  function normalizeMobile(s){
    var map={'۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9','٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
    var t=String(s||'').replace(/[۰-۹٠-٩]/g,function(c){return map[c]||c;});
    t=t.replace(/[^0-9+]/g,'');
    // strip country prefix to 0xxxx
    if(t.indexOf('0098')===0) t='0'+t.slice(4);
    else if(t.indexOf('+98')===0) t='0'+t.slice(3);
    else if(t.indexOf('98')===0 && t.length>=11) t='0'+t.slice(2);
    return t;
  }
  function searchUsers(q) {
    var box = document.getElementById('adm-tc-userresults');
    if (!box) return;
    if (!q) { box.innerHTML = ''; return; }
    var nq=normalizeMobile(q);
    var query=nq && /^\d{10,12}$/.test(nq) ? nq : q;
    api('/users?limit=8&q=' + encodeURIComponent(query)).then(function (data) {
      var items = Array.isArray(data) ? data : (data.items || []);
      if (!items.length) { box.innerHTML = '<p style="font-size:12px;color:var(--text-muted)">کاربری یافت نشد.</p>'; pickedUser=null; document.getElementById('adm-tc-userpick').innerHTML='<span style="font-size:12px;color:var(--text-muted)">کاربری انتخاب نشده</span>'; return; }
      box.innerHTML = items.map(function (u) {
        var nm = ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || u.mobile || u.id;
        return '<button type="button" data-tpick="' + esc(u.id) + '" data-tname="' + esc(nm) + '" data-tmobile="'+esc(u.mobile||'')+'" style="display:flex;justify-content:space-between;width:100%;padding:6px 8px;font-size:12px;border:1px solid var(--border-color-light);border-radius:var(--radius-lg);margin-bottom:4px;background:var(--bg-card);cursor:pointer">'
          + '<span>' + esc(nm) + '</span><span dir="ltr" style="color:var(--text-muted)">' + esc(u.mobile || '') + '</span></button>';
      }).join('');
      // Auto-select if exactly one result and mobile matches normalized query (fixes typing full mobile without clicking)
      if(items.length===1){
        var single=items[0];
        if(normalizeMobile(single.mobile)===normalizeMobile(query) || normalizeMobile(q)===normalizeMobile(single.mobile)){
          pickedUser={id:single.id,name:((single.firstName||'')+' '+(single.lastName||'')).trim()||single.mobile||single.id};
          document.getElementById('adm-tc-userpick').innerHTML='<span class="adm-badge adm-badge--primary">'+esc(pickedUser.name)+'</span>';
        }
      } else {
        // if typed mobile exactly matches one of the results, auto-select it and store real user ID
        var exact=null;
        for(var i=0;i<items.length;i++){ if(normalizeMobile(items[i].mobile)===normalizeMobile(query)) { exact=items[i]; break; } }
        if(exact){
          pickedUser={id:exact.id,name:((exact.firstName||'')+' '+(exact.lastName||'')).trim()||exact.mobile||exact.id};
          document.getElementById('adm-tc-userpick').innerHTML='<span class="adm-badge adm-badge--primary">'+esc(pickedUser.name)+'</span>';
        }
      }
    }).catch(function () {});
  }

  /* ── Events ───────────────────────────────────────────── */
  if (searchInput) searchInput.addEventListener('input', function () {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(function () { state.q = searchInput.value.trim(); state.page = 1; load(); }, 350);
  });
  if (statusFilter) statusFilter.addEventListener('change', function () { state.status = statusFilter.value; state.page = 1; load(); });
  if (priorityFilter) priorityFilter.addEventListener('change', function () { state.priority = priorityFilter.value; state.page = 1; load(); });
  if (pagination) pagination.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-tpage]') : null;
    if (!btn || btn.disabled) return;
    var v = btn.getAttribute('data-tpage');
    if (v === 'prev') { if (state.page > 1) state.page--; else return; }
    else if (v === 'next') { if (state.page < pageCount()) state.page++; else return; }
    else state.page = Math.max(1, Math.min(pageCount(), parseInt(v, 10) || 1));
    load();
  });

  var addBtn = sec.querySelector('[data-tadd]');
  if (addBtn) addBtn.addEventListener('click', function (e) { e.preventDefault(); openCreate(); });

  document.addEventListener('click', function (e) {
    var v = e.target.closest ? e.target.closest('[data-tview]') : null;
    if (v && sec.contains(v)) { e.preventDefault(); openDetail(v.getAttribute('data-tview')); return; }
    var cl = e.target.closest ? e.target.closest('[data-tclose]') : null;
    if (cl && sec.contains(cl)) { e.preventDefault(); setStatus(cl.getAttribute('data-tclose'), 'closed', 'این تیکت بسته شود؟'); return; }
    var ro = e.target.closest ? e.target.closest('[data-treopen]') : null;
    if (ro && sec.contains(ro)) { e.preventDefault(); setStatus(ro.getAttribute('data-treopen'), 'open', 'این تیکت بازگشایی شود؟'); return; }
    var del = e.target.closest ? e.target.closest('[data-tdel]') : null;
    if (del && sec.contains(del)) {
      e.preventDefault();
      if (!window.confirm('این تیکت و همه پیام‌های آن حذف شود؟')) return;
      var did = del.getAttribute('data-tdel');
      api('/admin/tickets/' + encodeURIComponent(did), { method: 'DELETE' }).then(function () {
        state.items = state.items.filter(function (x) { return String(x.id) !== String(did); });
        state.total = Math.max(0, state.total - 1);
        if (!state.items.length && state.page > 1) { state.page--; load(); return; }
        render();
        toast('تیکت حذف شد', 'danger');
      }).catch(function (err) { toast(err.message || 'حذف ناموفق بود', 'danger'); });
      return;
    }
    var pk = e.target.closest ? e.target.closest('[data-tpick]') : null;
    if (pk) {
      pickedUser = { id: pk.getAttribute('data-tpick'), name: pk.getAttribute('data-tname') };
      document.getElementById('adm-tc-userpick').innerHTML = '<span class="adm-badge adm-badge--primary">' + esc(pickedUser.name) + '</span>';
      document.getElementById('adm-tc-userresults').innerHTML = '';
      document.getElementById('adm-tc-usersearch').value = '';
      return;
    }
    if (e.target.closest && e.target.closest('[data-tk-close]')) { closeModal(document.getElementById('adm-ticket-modal')); detailId = null; return; }
    if (e.target.closest && e.target.closest('[data-tkprofile-close]')) { closeModal(document.getElementById('adm-tkprofile-modal')); return; }
    if (e.target.closest && e.target.closest('[data-tc-close]')) { closeModal(document.getElementById('adm-ticket-create-modal')); return; }
    var profBtn = e.target.closest ? e.target.closest('#adm-tk-profile') : null;
    var ticketModal = document.getElementById('adm-ticket-modal');
    if (profBtn && ticketModal && ticketModal.contains(profBtn) && detailId != null) {
      api('/admin/tickets/' + encodeURIComponent(detailId)).then(function (d) { openUserProfile(d.userId); }).catch(function (err) { toast(err.message || 'خطا', 'danger'); });
      return;
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeModal(document.getElementById('adm-ticket-modal')); detailId = null;
      closeModal(document.getElementById('adm-ticket-create-modal'));
      closeModal(document.getElementById('adm-tkprofile-modal'));
    }
  });

  var attachBtn=document.getElementById('adm-tk-attach'), attachFile=document.getElementById('adm-tk-file');
  if(attachBtn&&attachFile){ attachBtn.addEventListener('click', function(){ attachFile.click(); }); attachFile.addEventListener('change', function(){ if(!this.files[0]||detailId==null) return; var fd=new FormData(); fd.append('file', this.files[0]); var ta=document.getElementById('adm-tk-reply'); if(ta&&ta.value.trim()) fd.append('message', ta.value.trim()); fetch('/api/support/chat/'+encodeURIComponent(detailId)+'/attachment',{method:'POST', headers:{'Authorization':'Bearer '+tok()}, body:fd}).then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d}})}).then(function(res){ if(res.ok){ if(ta) ta.value=''; openDetail(detailId); load(); toast('پیوست ارسال شد','success'); } else toast(res.d&&res.d.error||'ارسال ناموفق','danger'); }).catch(function(){ toast('ارسال ناموفق','danger'); }).finally(function(){ attachFile.value=''; }); }); }
  // hover polish
  [document.getElementById('chat-attach'), attachBtn].forEach(function(b){ if(!b) return; b.addEventListener('mouseenter', function(){ b.style.background='#f9fafb'; b.style.borderColor='#d1d5db'; b.style.color='#374151'; }); b.addEventListener('mouseleave', function(){ b.style.background='#fff'; b.style.borderColor='#e5e7eb'; b.style.color='#6b7280'; }); });
  var sendBtn = document.getElementById('adm-tk-send');
  if (sendBtn) sendBtn.addEventListener('click', sendReply);
  var toggleBtn = document.getElementById('adm-tk-toggle');
  if (toggleBtn) toggleBtn.addEventListener('click', function () {
    if (detailId == null) return;
    var isClosed = toggleBtn.textContent.indexOf('بازگشایی') !== -1;
    setStatus(detailId, isClosed ? 'open' : 'closed', isClosed ? 'این تیکت بازگشایی شود؟' : 'این تیکت بسته شود؟');
  });
  var prSel = document.getElementById('adm-tk-priority');
  if (prSel) prSel.addEventListener('change', function () {
    if (detailId == null) return;
    api('/admin/tickets/' + encodeURIComponent(detailId), { method: 'PATCH', body: JSON.stringify({ priority: prSel.value }) }).then(function () {
      toast('اولویت به‌روزرسانی شد', 'success');
      load();
    }).catch(function (err) { toast(err.message || 'عملیات ناموفق بود', 'danger'); });
  });

  var us = document.getElementById('adm-tc-usersearch');
  if (us) us.addEventListener('input', function () {
    if (userDebounce) clearTimeout(userDebounce);
    userDebounce = setTimeout(function () { searchUsers(us.value.trim()); }, 350);
  });
  var cf = document.getElementById('adm-tc-form');
  if (cf) cf.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!pickedUser) { toast('مشتری را انتخاب کنید', 'danger'); return; }
    var subject = document.getElementById('adm-tc-subject').value.trim();
    var message = document.getElementById('adm-tc-message').value.trim();
    var priority = document.getElementById('adm-tc-priority').value;
    if (!subject) { toast('موضوع الزامی است', 'danger'); return; }
    if (!message) { toast('متن پیام الزامی است', 'danger'); return; }
    var btn = document.getElementById('adm-tc-submit');
    btn.disabled = true;
    api('/admin/tickets', { method: 'POST', body: JSON.stringify({ userId: pickedUser.id, subject: subject, message: message, priority: priority }) }).then(function () {
      closeModal(document.getElementById('adm-ticket-create-modal'));
      state.page = 1;
      load();
      toast('تیکت ایجاد شد', 'success');
    }).catch(function (err) { toast(err.message || 'ایجاد ناموفق بود', 'danger'); })
      .finally(function () { btn.disabled = false; });
  });

  function reloadDetail(silent){
    if(detailId==null) return;
    var m=document.getElementById('adm-ticket-modal');
    if(!m||!m.classList.contains('is-open')) return;
    var body=m.querySelector('#adm-tk-body');
    var prevCount=body?body.querySelectorAll('[data-msg]').length:0;
    api('/admin/tickets/' + encodeURIComponent(detailId)).then(function (d) {
      var html=(d.messages||[]).map(bubble).join('') || '<p style="color:var(--text-muted)">پیامی ثبت نشده</p>';
      // wrap bubbles with data-msg for diff? bubble already has structure; just replace if changed
      if(silent && body && body.innerHTML===html) return;
      m.querySelector('#adm-tk-body').innerHTML=html;
      if(body) body.scrollTop=body.scrollHeight;
    }).catch(function(){});
    // also refresh list silently
    api('/admin/tickets?limit='+PAGE_SIZE+'&offset='+((state.page-1)*PAGE_SIZE)+(state.q?'&q='+encodeURIComponent(state.q):'')+(state.status!=='all'?'&status='+state.status:'')+(state.priority!=='all'?'&priority='+state.priority:'')).then(function(data){
      var np=JSON.stringify(data.items); var op=JSON.stringify(state.items);
      if(np!==op){ state.items=data.items||[]; state.total=data.total||0; render(); }
    }).catch(function(){});
  }
  load();
  window.CamzyAdminTickets = { reload: load, reloadDetail: reloadDetail };
})();
