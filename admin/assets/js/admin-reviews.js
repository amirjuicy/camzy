/* ================================================================
   Camzy — Admin Reviews & Questions (نظرات و پرسش‌ها)
   Tabs for product reviews + product questions. Server-side
   search (product/user/text), status filter (pending/approved/
   rejected), full-content view, approve/reject, delete,
   admin reply, pagination. Reuses existing SQLite data via
   GET/PATCH/DELETE /api/admin/reviews and /api/admin/questions.
   ================================================================ */
(function(){
  'use strict';
  function tok(){ try{ var s=JSON.parse(localStorage.getItem('as_admin_session')||'null'); return s&&s.token||''; }catch(e){return '';} }
  function api(path,opts){
    var h={ 'Content-Type':'application/json' }; var t=tok(); if(t) h['Authorization']='Bearer '+t;
    var m=Object.assign({headers:h},opts||{}); if(opts&&opts.headers) m.headers=Object.assign({},h,opts.headers);
    return fetch('/api'+path,m).then(function(res){ return res.json().catch(function(){return null;}).then(function(data){ if(!res.ok) throw new Error((data&&data.error)||('Request failed '+res.status)); return data; }); });
  }
  function $(s,c){ return (c||document).querySelector(s); }
  function $$(s,c){ return Array.prototype.slice.call((c||document).querySelectorAll(s)); }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function toast(m,t){ if(window.CamzyAdmin&&window.CamzyAdmin.showToast) window.CamzyAdmin.showToast(m,t); }
  function fa(n){ try{return Number(n||0).toLocaleString('fa-IR');}catch(e){return String(n);} }
  function isHttp(){ try{ return window.location.protocol.indexOf('http')===0; }catch(e){ return false; } }

  var PAGE_SIZE = 20;
  var tbody=$('#adm-reviews-table tbody');
  if(!tbody) return;
  var search=$('#adm-reviews-search');
  var ratingFilter=$('#adm-reviews-rating');
  var statusFilter=$('#adm-reviews-status');
  var pagination=$('#adm-reviews-pagination');
  var metaEl=document.querySelector('[data-view="reviews"] .adm-table-footer__meta');
  var cardSub=document.querySelector('[data-view="reviews"] .adm-card__sub');

  var state={ tab:'reviews', items:[], total:0, page:1, q:'', rating:'all', status:'all' };

  function endpoint(){ return state.tab==='reviews' ? '/admin/reviews' : '/admin/questions'; }
  function isReviews(){ return state.tab==='reviews'; }

  function statusBadge(s){
    if(s==='approved') return '<span class="adm-badge adm-badge--success">تأییدشده</span>';
    if(s==='rejected') return '<span class="adm-badge adm-badge--danger">ردشده</span>';
    return '<span class="adm-badge adm-badge--warning">در انتظار</span>';
  }

  function load(){
    if(!isHttp()){ toast('برای مشاهده نظرات واقعی، پنل را از طریق سرور باز کنید','danger'); return; }
    tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-muted)">در حال بارگذاری…</td></tr>';
    var parts=['limit='+PAGE_SIZE,'offset='+((state.page-1)*PAGE_SIZE)];
    if(state.q) parts.push('q='+encodeURIComponent(state.q));
    if(state.status!=='all') parts.push('status='+encodeURIComponent(state.status));
    if(isReviews() && state.rating!=='all') parts.push('rating='+encodeURIComponent(state.rating));
    api(endpoint()+'?'+parts.join('&')).then(function(data){
      state.items=(data&&data.items)||[]; state.total=(data&&data.total)||0;
      if(state.page>pageCount() && state.total>0){ state.page=pageCount(); load(); return; }
      render();
    }).catch(function(err){
      tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-muted)">خطا: '+esc(err.message||'')+'</td></tr>';
    });
  }

  function pageCount(){ return Math.max(1, Math.ceil(state.total/PAGE_SIZE)); }

  function reviewRow(rv){
    var stars=''; for(var i=0;i<5;i++) stars+= i<rv.rating?'★':'☆';
    var replyMark = rv.reply ? ' <span class="adm-badge adm-badge--info adm-badge--plain">پاسخ داده‌شده</span>' : '';
    return '<tr data-id="'+rv.id+'">'
      +'<td><span class="adm-order-id">#'+rv.id+'</span><div class="adm-table__sub">'+esc(rv.productName||('محصول '+rv.productId))+'</div></td>'
      +'<td>'+esc(rv.author||'')+'<div class="adm-table__sub">'+esc(rv.userId||'')+'</div></td>'
      +'<td><span style="color:var(--color-warning)">'+stars+'</span> ('+rv.rating+')</td>'
      +'<td style="max-width:260px;white-space:normal;word-break:break-word"><strong>'+esc(rv.title||'')+'</strong><div class="adm-table__sub" style="white-space:normal">'+esc((rv.text||'').slice(0,120))+'</div>'+replyMark+'</td>'
      +'<td>'+esc(rv.date||'')+'</td>'
      +'<td>'+statusBadge(rv.status)+'</td>'
      +'<td><div class="adm-table__cell-actions">'
      +'<button type="button" class="adm-btn-icon" data-rview="'+rv.id+'" title="مشاهده کامل"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>'
      +(rv.status!=='approved' ? '<button type="button" class="adm-btn-icon" data-rok="'+rv.id+'" title="تأیید"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>' : '')
      +(rv.status!=='rejected' ? '<button type="button" class="adm-btn-icon" data-rno="'+rv.id+'" title="رد"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' : '')
      +'<button type="button" class="adm-btn-icon" data-rreply="'+rv.id+'" title="پاسخ"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg></button>'
      +'<button type="button" class="adm-btn-icon adm-btn-icon--danger" data-rdel="'+rv.id+'" title="حذف"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>'
      +'</div></td></tr>';
  }

  function questionRow(qt){
    var replyMark = qt.reply ? ' <span class="adm-badge adm-badge--info adm-badge--plain">پاسخ داده‌شده</span>' : '';
    return '<tr data-id="'+qt.id+'">'
      +'<td><span class="adm-order-id">#'+qt.id+'</span><div class="adm-table__sub">'+esc(qt.productName||('محصول '+qt.productId))+'</div></td>'
      +'<td>'+esc(qt.author||'')+'<div class="adm-table__sub">'+esc(qt.userId||'')+'</div></td>'
      +'<td><span class="adm-table__sub">پرسش</span></td>'
      +'<td style="max-width:260px;white-space:normal;word-break:break-word"><div style="white-space:normal">'+esc((qt.question||'').slice(0,150))+'</div>'+replyMark+'</td>'
      +'<td>'+esc(qt.date||'')+'</td>'
      +'<td>'+statusBadge(qt.status)+'</td>'
      +'<td><div class="adm-table__cell-actions">'
      +'<button type="button" class="adm-btn-icon" data-rview="'+qt.id+'" title="مشاهده کامل"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>'
      +(qt.status!=='approved' ? '<button type="button" class="adm-btn-icon" data-rok="'+qt.id+'" title="تأیید"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>' : '')
      +(qt.status!=='rejected' ? '<button type="button" class="adm-btn-icon" data-rno="'+qt.id+'" title="رد"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' : '')
      +'<button type="button" class="adm-btn-icon" data-rreply="'+qt.id+'" title="پاسخ"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg></button>'
      +'<button type="button" class="adm-btn-icon adm-btn-icon--danger" data-rdel="'+qt.id+'" title="حذف"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>'
      +'</div></td></tr>';
  }

  function render(){
    if(!state.items.length){
      tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--color-text-muted-dark)">'+(isReviews()?'نظری ثبت نشده است.':'پرسشی ثبت نشده است.')+'</td></tr>';
    } else {
      tbody.innerHTML=state.items.map(isReviews()?reviewRow:questionRow).join('');
    }
    var label=isReviews()?'نظر':'پرسش';
    if(metaEl){
      var from=state.total===0?0:(state.page-1)*PAGE_SIZE+1;
      var to=Math.min(state.page*PAGE_SIZE,state.total);
      metaEl.textContent='نمایش '+fa(from)+' تا '+fa(to)+' از '+fa(state.total)+' '+label;
    }
    if(cardSub) cardSub.textContent='مدیریت '+(isReviews()?'نظرات ثبت‌شده':'پرسش‌های محصولات');
    renderPagination();
  }

  function renderPagination(){
    if(!pagination) return;
    var pages=pageCount();
    if(pages<=1){ pagination.innerHTML=''; return; }
    var nums=[];
    [1,2,state.page-1,state.page,state.page+1,pages-1,pages].forEach(function(p){
      if(p>=1&&p<=pages&&nums.indexOf(p)===-1) nums.push(p);
    });
    nums.sort(function(a,b){return a-b;});
    var html='<button type="button" class="adm-pagination__btn" data-rpage="prev"'+(state.page<=1?' disabled':'')+' aria-label="صفحه قبل">'
      +'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg></button>';
    var prev=0;
    nums.forEach(function(p){
      if(p-prev>1) html+='<button type="button" class="adm-pagination__btn" disabled>…</button>';
      html+='<button type="button" class="adm-pagination__btn'+(p===state.page?' is-active':'')+'" data-rpage="'+p+'">'+fa(p)+'</button>';
      prev=p;
    });
    html+='<button type="button" class="adm-pagination__btn" data-rpage="next"'+(state.page>=pages?' disabled':'')+' aria-label="صفحه بعد">'
      +'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 6 9 12 15 18"/></svg></button>';
    pagination.innerHTML=html;
  }

  function findItem(id){
    var f=state.items.filter(function(x){return String(x.id)===String(id);});
    return f[0]||null;
  }

  // ── View full content ──
  function openView(id){
    var it=findItem(id); if(!it) return;
    var m=$('#adm-review-view-modal'); if(!m) return;
    var body='';
    if(isReviews()){
      var stars=''; for(var i=0;i<5;i++) stars+= i<it.rating?'★':'☆';
      body='<div style="display:grid;gap:12px;font-size:13px">'
        +'<div><strong>محصول:</strong> '+esc(it.productName||it.productId)+'</div>'
        +'<div><strong>نویسنده:</strong> '+esc(it.author||'')+' <span class="adm-table__sub">'+esc(it.userId||'')+'</span></div>'
        +'<div><strong>امتیاز:</strong> <span style="color:var(--color-warning)">'+stars+'</span></div>'
        +(it.title?'<div><strong>عنوان:</strong> '+esc(it.title)+'</div>':'')
        +'<div><strong>متن نظر:</strong><div style="margin-top:4px;padding:10px;border:1px solid var(--border-color-light);border-radius:var(--radius-lg);white-space:pre-wrap">'+esc(it.text||'')+'</div></div>'
        +'<div><strong>وضعیت:</strong> '+statusBadge(it.status)+' <span class="adm-table__sub">'+esc(it.date||'')+'</span></div>'
        +(it.reply?'<div><strong>پاسخ مدیر:</strong><div style="margin-top:4px;padding:10px;border:1px solid var(--border-color-light);border-radius:var(--radius-lg);white-space:pre-wrap">'+esc(it.reply)+'</div></div>':'')
        +'</div>';
    } else {
      body='<div style="display:grid;gap:12px;font-size:13px">'
        +'<div><strong>محصول:</strong> '+esc(it.productName||it.productId)+'</div>'
        +'<div><strong>پرسش‌کننده:</strong> '+esc(it.author||'')+' <span class="adm-table__sub">'+esc(it.userId||'')+'</span></div>'
        +'<div><strong>پرسش:</strong><div style="margin-top:4px;padding:10px;border:1px solid var(--border-color-light);border-radius:var(--radius-lg);white-space:pre-wrap">'+esc(it.question||'')+'</div></div>'
        +'<div><strong>وضعیت:</strong> '+statusBadge(it.status)+' <span class="adm-table__sub">'+esc(it.date||'')+'</span></div>'
        +(it.reply?'<div><strong>پاسخ مدیر:</strong><div style="margin-top:4px;padding:10px;border:1px solid var(--border-color-light);border-radius:var(--radius-lg);white-space:pre-wrap">'+esc(it.reply)+'</div></div>':'')
        +'</div>';
    }
    m.querySelector('#adm-rv-body').innerHTML=body;
    m.classList.add('is-open'); m.setAttribute('aria-hidden','false');
  }

  // ── Reply ──
  var replyId=null;
  function openReply(id){
    var it=findItem(id); if(!it) return;
    var m=$('#adm-review-reply-modal'); if(!m) return;
    replyId=id;
    var label=isReviews()?'نظر':'پرسش';
    m.querySelector('#adm-rr-title').textContent='پاسخ به '+label+' #'+id;
    var quote=esc(isReviews()?((it.title?it.title+' — ':'')+(it.text||'')):(it.question||''));
    m.querySelector('#adm-rr-quote').textContent=quote.slice(0,300);
    m.querySelector('#adm-rr-text').value=it.reply||'';
    m.classList.add('is-open'); m.setAttribute('aria-hidden','false');
    setTimeout(function(){ var t=m.querySelector('#adm-rr-text'); if(t) t.focus(); },50);
  }
  function closeReply(){
    var m=$('#adm-review-reply-modal');
    if(m){ m.classList.remove('is-open'); m.setAttribute('aria-hidden','true'); }
    replyId=null;
  }
  function submitReply(){
    if(replyId==null) return;
    var m=$('#adm-review-reply-modal');
    var text=m.querySelector('#adm-rr-text').value.trim();
    var btn=m.querySelector('#adm-rr-submit');
    btn.disabled=true;
    api(endpoint()+'/'+encodeURIComponent(replyId),{method:'PATCH',body:JSON.stringify({reply:text})}).then(function(updated){
      state.items=state.items.map(function(x){ return String(x.id)===String(replyId)?Object.assign({},x,updated):x; });
      render(); closeReply(); toast('پاسخ ثبت شد','success');
    }).catch(function(err){ toast(err.message||'ثبت پاسخ ناموفق بود','danger'); })
      .finally(function(){ btn.disabled=false; });
  }

  // ── Approve / reject / delete ──
  function setStatus(id,status){
    var ok=status==='approved'?'تأیید':'رد';
    if(!window.confirm('این مورد '+ok+' شود؟')) return;
    api(endpoint()+'/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({status:status})}).then(function(updated){
      state.items=state.items.map(function(x){ return String(x.id)===String(id)?Object.assign({},x,updated):x; });
      render(); toast(status==='approved'?'تأیید شد':'رد شد','success');
    }).catch(function(err){ toast(err.message||'عملیات ناموفق بود','danger'); });
  }
  function removeItem(id){
    var label=isReviews()?'این نظر':'این پرسش';
    if(!window.confirm(label+' حذف شود؟')) return;
    var delPath = isReviews() ? '/admin/reviews/' : '/admin/questions/';
    // Both have DELETE /admin/<type>/:id
    api(delPath+encodeURIComponent(id),{method:'DELETE'}).then(function(){
      state.items=state.items.filter(function(x){ return String(x.id)!==String(id); });
      state.total=Math.max(0,state.total-1);
      if(!state.items.length&&state.page>1){ state.page--; load(); return; }
      render(); toast('حذف شد','danger');
    }).catch(function(err){ toast(err.message||'حذف ناموفق بود','danger'); });
  }

  // ── Tabs / filters / pagination events ──
  $$('[data-rq-tab]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var tab=btn.getAttribute('data-rq-tab');
      if(tab===state.tab) return;
      state.tab=tab; state.page=1;
      $$('[data-rq-tab]').forEach(function(b){
        var on=b.getAttribute('data-rq-tab')===tab;
        b.classList.toggle('btn-accent',on);
        b.setAttribute('aria-selected',on?'true':'false');
      });
      if(ratingFilter) ratingFilter.style.display=isReviews()?'':'none';
      load();
    });
  });
  var debounce=null;
  if(search) search.addEventListener('input', function(){
    if(debounce) clearTimeout(debounce);
    debounce=setTimeout(function(){ state.q=search.value.trim(); state.page=1; load(); },350);
  });
  if(ratingFilter) ratingFilter.addEventListener('change', function(){ state.rating=ratingFilter.value; state.page=1; load(); });
  if(statusFilter) statusFilter.addEventListener('change', function(){ state.status=statusFilter.value; state.page=1; load(); });
  if(pagination) pagination.addEventListener('click', function(e){
    var btn=e.target.closest?e.target.closest('[data-rpage]'):null;
    if(!btn||btn.disabled) return;
    var v=btn.getAttribute('data-rpage');
    if(v==='prev'){ if(state.page>1) state.page--; else return; }
    else if(v==='next'){ if(state.page<pageCount()) state.page++; else return; }
    else state.page=Math.max(1,Math.min(pageCount(),parseInt(v,10)||1));
    load();
  });

  document.addEventListener('click', function(e){
    var v=e.target.closest?e.target.closest('[data-rview]'):null;
    if(v){ e.preventDefault(); openView(v.getAttribute('data-rview')); return; }
    var ok=e.target.closest?e.target.closest('[data-rok]'):null;
    if(ok){ e.preventDefault(); setStatus(ok.getAttribute('data-rok'),'approved'); return; }
    var no=e.target.closest?e.target.closest('[data-rno]'):null;
    if(no){ e.preventDefault(); setStatus(no.getAttribute('data-rno'),'rejected'); return; }
    var rp=e.target.closest?e.target.closest('[data-rreply]'):null;
    if(rp){ e.preventDefault(); openReply(rp.getAttribute('data-rreply')); return; }
    var del=e.target.closest?e.target.closest('[data-rdel]'):null;
    if(del){ e.preventDefault(); removeItem(del.getAttribute('data-rdel')); return; }
    if(e.target.closest&&e.target.closest('[data-rv-close]')){
      var m=$('#adm-review-view-modal'); if(m){ m.classList.remove('is-open'); m.setAttribute('aria-hidden','true'); } return;
    }
    if(e.target.closest&&e.target.closest('[data-rr-close]')){ closeReply(); return; }
  });
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape'){
      var m=$('#adm-review-view-modal'); if(m){ m.classList.remove('is-open'); m.setAttribute('aria-hidden','true'); }
      closeReply();
    }
  });
  var rrSubmit=$('#adm-rr-submit');
  if(rrSubmit) rrSubmit.addEventListener('click', submitReply);

  load();
  window.CamzyAdminReviews={ reload: load };
})();
