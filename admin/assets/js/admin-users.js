/* ================================================================
   Camzy — Admin Users (real backend, full management)
   List/search (name, mobile, email), status filter, pagination,
   view detail (addresses/orders/cart/wishlist/reviews),
   edit profile, block/unblock, delete (safe with FK handling).
   Never exposes password hashes.
   ================================================================ */
(function () {
  'use strict';
  var API_BASE = '/api';
  var PAGE_SIZE = 20;
  var tbody = document.querySelector('#adm-users-table tbody');
  if (!tbody) return;
  var searchInput = document.querySelector('#adm-users-search');
  var roleFilter = document.querySelector('#adm-users-role');
  var statusFilter = document.querySelector('#adm-users-status');
  var pagination = document.querySelector('#adm-users-pagination');
  var cardSub = document.querySelector('section[data-view="users"] .adm-card__sub');
  var footerMeta = document.querySelector('section[data-view="users"] .adm-table-footer__meta');

  var cache = [];
  var total = 0;
  var page = 1;
  var debounce = null;

  function adminToken() {
    try { var s = JSON.parse(localStorage.getItem('as_admin_session') || 'null'); return (s && s.token) || ''; } catch (e) { return ''; }
  }
  function toast(msg, type) { if (window.CamzyAdmin && window.CamzyAdmin.showToast) window.CamzyAdmin.showToast(msg, type); }
  function fa(n) { try { return Number(n || 0).toLocaleString('fa-IR'); } catch (e) { return String(n); } }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function isHttp() { try { return window.location.protocol.indexOf('http') === 0; } catch (e) { return false; }
  }
  function apiFetch(path, opts){
    var h={ 'Content-Type':'application/json' }; var t=adminToken(); if(t) h['Authorization']='Bearer '+t;
    var m=Object.assign({headers:h},opts||{}); if(opts&&opts.headers) m.headers=Object.assign({},h,opts.headers);
    return fetch(API_BASE+path,m).then(function(res){ return res.json().catch(function(){return null;}).then(function(data){ if(!res.ok) throw new Error((data&&data.error)||('Request failed '+res.status)); return data; }); });
  }

  function statusVal() { return statusFilter ? statusFilter.value : 'all'; }

  async function fetchUsers(q) {
    var offset = (page - 1) * PAGE_SIZE;
    var url = '/users?limit=' + PAGE_SIZE + '&offset=' + offset +
      '&status=' + encodeURIComponent(statusVal()) +
      (q ? '&q=' + encodeURIComponent(q) : '');
    var data = await apiFetch(url);
    var items = Array.isArray(data) ? data : (data.items || []);
    return { items: items, total: (data && data.total != null) ? data.total : items.length };
  }

  function statusBadge(u) {
    return u.isBlocked
      ? '<span class="adm-badge adm-badge--danger">مسدود</span>'
      : '<span class="adm-badge adm-badge--success">فعال</span>';
  }

  function rowHtml(u) {
    var full = esc(((u.firstName || '') + ' ' + (u.lastName || '')).trim() || '—');
    var avatar = esc((full || '؟').trim().charAt(0));
    var sub = esc(u.email || u.mobile || '');
    var blockBtn = u.isBlocked
      ? '<button type="button" class="adm-btn-icon" data-ublock="' + esc(u.id) + '" data-blocked="0" title="رفع مسدودیت"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>'
      : '<button type="button" class="adm-btn-icon adm-btn-icon--danger" data-ublock="' + esc(u.id) + '" data-blocked="1" title="مسدود کردن"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></button>';
    return '<tr data-role="user" data-id="' + esc(u.id) + '">' +
      '<td><span class="adm-user"><span class="adm-user__avatar">' + avatar + '</span>' +
      '<span class="adm-user__name">' + full + '</span></span>' +
      (sub ? '<div class="adm-table__sub" style="direction:ltr">' + sub + '</div>' : '') + '</td>' +
      '<td><span dir="ltr">' + esc(u.mobile || '—') + '</span></td>' +
      '<td>' + fa(u.ordersCount) + '</td>' +
      '<td>' + fa(u.totalSpent) + '</td>' +
      '<td>' + esc(u.joinDate || '') + '</td>' +
      '<td>' + statusBadge(u) + '</td>' +
      '<td><div class="adm-table__cell-actions">' +
      '<button type="button" class="adm-btn-icon" data-uview="' + esc(u.id) + '" title="مشاهده"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>' +
      '<button type="button" class="adm-btn-icon" data-uedit="' + esc(u.id) + '" title="ویرایش"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg></button>' +
      blockBtn +
      '<button type="button" class="adm-btn-icon adm-btn-icon--danger" data-udel="' + esc(u.id) + '" title="حذف"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
      '</div></td></tr>';
  }

  function applyRoleFilter() {
    var val = roleFilter ? roleFilter.value : 'all';
    var rows = tbody.querySelectorAll('tr');
    var shown = 0;
    Array.prototype.forEach.call(rows, function (tr) {
      var match = val === 'all' || tr.getAttribute('data-role') === val;
      tr.style.display = match ? '' : 'none';
      if (match) shown++;
    });
    return shown;
  }

  function pageCount() { return Math.max(1, Math.ceil(total / PAGE_SIZE)); }

  function renderPagination() {
    if (!pagination) return;
    var pages = pageCount();
    if (page > pages) page = pages;
    var nums = [];
    var candidates = [1, 2, page - 1, page, page + 1, pages - 1, pages];
    candidates.forEach(function (p) {
      if (p >= 1 && p <= pages && nums.indexOf(p) === -1) nums.push(p);
    });
    nums.sort(function (a, b) { return a - b; });
    var html = '<button type="button" class="adm-pagination__btn" data-upage="prev"' + (page <= 1 ? ' disabled' : '') + ' aria-label="صفحه قبل">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg></button>';
    var prev = 0;
    nums.forEach(function (p) {
      if (p - prev > 1) html += '<button type="button" class="adm-pagination__btn" disabled>…</button>';
      html += '<button type="button" class="adm-pagination__btn' + (p === page ? ' is-active' : '') + '" data-upage="' + p + '">' + fa(p) + '</button>';
      prev = p;
    });
    html += '<button type="button" class="adm-pagination__btn" data-upage="next"' + (page >= pages ? ' disabled' : '') + ' aria-label="صفحه بعد">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 6 9 12 15 18"/></svg></button>';
    pagination.innerHTML = html;
  }

  function renderCounts() {
    if (cardSub) cardSub.textContent = fa(total) + ' کاربر ثبت‌شده در فروشگاه';
    if (footerMeta) {
      var from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
      var to = Math.min(page * PAGE_SIZE, total);
      footerMeta.textContent = 'نمایش ' + fa(from) + ' تا ' + fa(to) + ' از ' + fa(total) + ' کاربر (صفحه ' + fa(page) + ' از ' + fa(pageCount()) + ')';
    }
  }

  function render(list) {
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--color-text-muted-dark)">کاربری یافت نشد.</td></tr>';
    } else {
      tbody.innerHTML = list.map(rowHtml).join('');
    }
    applyRoleFilter();
    renderPagination();
    renderCounts();
  }

  async function reload() {
    if (!isHttp()) { toast('برای مشاهده کاربران واقعی، پنل را از طریق سرور باز کنید', 'danger'); return; }
    var q = searchInput ? searchInput.value.trim() : '';
    try {
      var r = await fetchUsers(q);
      cache = r.items;
      total = r.total;
      if (page > pageCount()) { page = pageCount(); return reload(); }
      render(cache);
    } catch (err) { toast(err.message || 'دریافت کاربران ناموفق بود', 'danger'); }
  }

  function resetPage() { page = 1; }

  if (searchInput) searchInput.addEventListener('input', function () {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(function () { resetPage(); reload(); }, 350);
  });
  if (roleFilter) roleFilter.addEventListener('change', function () { applyRoleFilter(); });
  if (statusFilter) statusFilter.addEventListener('change', function () { resetPage(); reload(); });
  if (pagination) pagination.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-upage]') : null;
    if (!btn || btn.disabled) return;
    var v = btn.getAttribute('data-upage');
    if (v === 'prev') { if (page > 1) page--; else return; }
    else if (v === 'next') { if (page < pageCount()) page++; else return; }
    else page = Math.max(1, Math.min(pageCount(), parseInt(v, 10) || 1));
    reload();
  });

  // ── Add user ──
  var addBtn = document.querySelector('[data-view="users"] [data-add]');
  if(addBtn) addBtn.addEventListener('click', function(e){
    e.preventDefault();
    var m=document.getElementById('adm-user-modal');
    if(m){
      document.getElementById('adm-um-id').value='';
      document.getElementById('adm-um-title').textContent='افزودن کاربر';
      document.getElementById('adm-um-submit').textContent='افزودن کاربر';
      document.getElementById('adm-user-form').reset();
      m.classList.add('is-open'); m.setAttribute('aria-hidden','false');
    }
  });

  // ── Detail modal (profile + addresses + orders + cart + wishlist + reviews) ──
  function openDetail(id){
    var m=document.getElementById('adm-user-detail-modal');
    if(!m) { toast('جزئیات کاربر','info'); return; }
    m.querySelector('#adm-ud-body').innerHTML='<p style="text-align:center;padding:20px;color:var(--text-muted)">در حال بارگذاری…</p>';
    m.classList.add('is-open'); m.setAttribute('aria-hidden','false');
    apiFetch('/users/'+encodeURIComponent(id)+'/detail').then(function(d){
      var u=d.user;
      var addrHtml=d.addresses.length? d.addresses.map(function(a){ return '<div style="padding:8px;border:1px solid var(--color-gray-200);border-radius:var(--radius-lg);margin-bottom:6px;font-size:12px"><strong>'+esc(a.title||'آدرس')+'</strong> '+esc(a.province)+'، '+esc(a.city)+' — '+esc(a.address)+' <span style="color:var(--text-muted)">'+esc(a.postalCode||'')+'</span>'+(a.isDefault?' <span class="adm-badge adm-badge--primary adm-badge--plain">پیش‌فرض</span>':'')+'</div>'; }).join('') : '<p style="color:var(--text-muted);font-size:12px">آدرسی ثبت نشده</p>';
      var orderHtml=d.orders.length? d.orders.map(function(o){
        var oid = esc(o.orderNumber || o.id);
        return '<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px dashed var(--color-gray-200);font-size:12px"><span>'+oid+' — '+esc(o.status)+' — '+esc(o.date||'')+'</span><span>'+fa(o.total)+' تومان</span></div>';
      }).join('') : '<p style="color:var(--text-muted);font-size:12px">سفارشی ثبت نشده</p>';
      var cartHtml=d.cart.length? d.cart.map(function(it){ return '<div style="font-size:12px;padding:4px 0">'+esc(it.name||('#'+it.id))+' × '+fa(it.quantity)+'</div>'; }).join('') : '<p style="color:var(--text-muted);font-size:12px">سبد خالی</p>';
      var wishHtml=d.wishlist.length? '<div style="font-size:12px">'+d.wishlist.join(', ')+'</div>' : '<p style="color:var(--text-muted);font-size:12px">خالی</p>';
      var revHtml=d.reviews.length? d.reviews.map(function(rv){ return '<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--color-gray-100)">★'+rv.rating+' '+esc(rv.title||'')+' — '+esc((rv.text||'').slice(0,80))+'</div>'; }).join('') : '<p style="color:var(--text-muted);font-size:12px">نظری ثبت نشده</p>';
      var statusLine = u.isBlocked ? '<span class="adm-badge adm-badge--danger">مسدود</span>' : '<span class="adm-badge adm-badge--success">فعال</span>';
      m.querySelector('#adm-ud-title').textContent=((u.firstName||'')+' '+(u.lastName||'')).trim()||u.mobile;
      m.querySelector('#adm-ud-body').innerHTML=
        '<div style="display:grid;gap:16px;font-size:13px">'+
        '<div><strong>اطلاعات:</strong> '+esc(u.firstName)+' '+esc(u.lastName)+' — <span dir="ltr">'+esc(u.mobile)+'</span>'+(u.email?' — <span dir="ltr">'+esc(u.email)+'</span>':'')+' — '+fa(u.ordersCount)+' سفارش، '+fa(u.totalSpent)+' تومان — وضعیت: '+statusLine+'</div>'+
        '<div><strong>آدرس‌ها ('+fa(d.addresses.length)+'):</strong>'+addrHtml+'</div>'+
        '<div><strong>سفارش‌ها ('+fa(d.orders.length)+'):</strong>'+orderHtml+'</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div><strong>سبد خرید:</strong>'+cartHtml+'</div><div><strong>علاقه‌مندی:</strong>'+wishHtml+'</div></div>'+
        '<div><strong>نظرات ('+fa(d.reviews.length)+'):</strong>'+revHtml+'</div>'+
        '</div>';
    }).catch(function(err){ m.querySelector('#adm-ud-body').innerHTML='<p style="color:var(--text-muted);text-align:center;padding:20px">'+esc(err.message||'خطا')+'</p>'; });
  }

  // ── Edit modal ──
  function openEdit(id){
    var u=cache.filter(function(x){ return String(x.id)===String(id); })[0];
    if(!u) return;
    var m=document.getElementById('adm-user-modal');
    if(!m) return;
    document.getElementById('adm-um-id').value=u.id;
    document.getElementById('adm-um-first').value=u.firstName||'';
    document.getElementById('adm-um-last').value=u.lastName||'';
    document.getElementById('adm-um-mobile').value=u.mobile||'';
    document.getElementById('adm-um-email').value=u.email||'';
    document.getElementById('adm-um-pass').value='';
    document.getElementById('adm-um-title').textContent='ویرایش کاربر';
    document.getElementById('adm-um-submit').textContent='ذخیره تغییرات';
    m.classList.add('is-open'); m.setAttribute('aria-hidden','false');
  }

  // ── Block / unblock ──
  function toggleBlock(id, blocked){
    var u=cache.filter(function(x){ return String(x.id)===String(id); })[0];
    var name=u? ((u.firstName||'')+' '+(u.lastName||'')).trim(): id;
    var verb = blocked ? 'مسدود' : 'رفع مسدودیت';
    if(!window.confirm('کاربر «'+name+'» '+verb+' شود؟')) return;
    apiFetch('/users/'+encodeURIComponent(id)+'/block',{method:'PATCH',body:JSON.stringify({blocked:blocked})}).then(function(){
      toast(blocked?'کاربر مسدود شد':'مسدودیت کاربر برداشته شد','success'); reload();
    }).catch(function(err){ toast(err.message||'عملیات ناموفق بود','danger'); });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-uview]') : null;
    if (btn) { e.preventDefault(); openDetail(btn.getAttribute('data-uview')); return; }
    var ebtn = e.target.closest ? e.target.closest('[data-uedit]') : null;
    if (ebtn) { e.preventDefault(); openEdit(ebtn.getAttribute('data-uedit')); return; }
    var bbtn = e.target.closest ? e.target.closest('[data-ublock]') : null;
    if (bbtn) { e.preventDefault(); toggleBlock(bbtn.getAttribute('data-ublock'), bbtn.getAttribute('data-blocked')==='1'); return; }
    var dbtn = e.target.closest ? e.target.closest('[data-udel]') : null;
    if (dbtn) {
      e.preventDefault();
      var id=dbtn.getAttribute('data-udel');
      var u=cache.filter(function(x){ return String(x.id)===String(id); })[0];
      var name=u? ((u.firstName||'')+' '+(u.lastName||'')).trim(): id;
      if(!window.confirm('کاربر «'+name+'» حذف شود؟')) return;
      function doDelete(force){
        apiFetch('/users/'+encodeURIComponent(id)+(force?'?force=1':''),{method:'DELETE'}).then(function(){
          toast('کاربر حذف شد','danger'); reload();
        }).catch(function(err){
          if(!force&&/has orders/.test(err.message||'')){
            if(window.confirm('این کاربر سفارش دارد. حذف شود؟ (سفارش‌ها نیز حذف می‌شوند)')){ doDelete(true); return; }
          } else toast(err.message||'حذف ناموفق بود','danger');
        });
      }
      doDelete(false);
      return;
    }
    var cl = e.target.closest? e.target.closest('[data-um-close]'):null;
    if(cl){ var mm=document.getElementById('adm-user-modal'); if(mm){ mm.classList.remove('is-open'); mm.setAttribute('aria-hidden','true'); } }
    var cl2 = e.target.closest? e.target.closest('[data-ud-close]'):null;
    if(cl2){ var mm2=document.getElementById('adm-user-detail-modal'); if(mm2){ mm2.classList.remove('is-open'); mm2.setAttribute('aria-hidden','true'); } }
  });
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape'){
      var m=document.getElementById('adm-user-modal'); if(m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden','true'); }
      var m2=document.getElementById('adm-user-detail-modal'); if(m2) { m2.classList.remove('is-open'); m2.setAttribute('aria-hidden','true'); }
    }
  });
  var uf=document.getElementById('adm-user-form');
  if(uf) uf.addEventListener('submit', function(e){
    e.preventDefault();
    var id=document.getElementById('adm-um-id').value;
    var firstName=document.getElementById('adm-um-first').value.trim();
    var lastName=document.getElementById('adm-um-last').value.trim();
    var mobile=document.getElementById('adm-um-mobile').value.trim();
    var email=document.getElementById('adm-um-email').value.trim();
    var newPassword=document.getElementById('adm-um-pass').value;
    if(!firstName||!lastName||!mobile){ toast('نام، نام خانوادگی و موبایل الزامی است','danger'); return; }
    var payload={ firstName:firstName, lastName:lastName, mobile:mobile, email:email||undefined };
    if(newPassword) payload.newPassword=newPassword;
    var req=id? apiFetch('/users/'+encodeURIComponent(id)+'/admin',{method:'PUT',body:JSON.stringify(payload)}): apiFetch('/users',{method:'POST',body:JSON.stringify(Object.assign({password:newPassword||undefined},payload))});
    req.then(function(){ var m=document.getElementById('adm-user-modal'); if(m){ m.classList.remove('is-open'); m.setAttribute('aria-hidden','true'); } toast(id?'کاربر به‌روزرسانی شد':'کاربر جدید اضافه شد','success'); reload(); }).catch(function(err){ toast(err.message||'ذخیره ناموفق بود','danger'); });
  });

  reload();
  window.CamzyAdminUsers={ reload: reload };
})();
