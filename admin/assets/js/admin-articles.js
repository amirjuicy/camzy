/* ================================================================
   Camzy — Admin Articles (real API: /admin/articles CRUD)
   + Article Categories (real API: /admin/article-categories CRUD)
   ================================================================ */
(function(){
  'use strict';
  var API='/api';
  function tok(){ try{ var s=JSON.parse(localStorage.getItem('as_admin_session')||'null'); return s&&s.token||''; }catch(e){ return ''; } }
  function api(path,opts){
    var h={ 'Content-Type':'application/json' }; var t=tok(); if(t) h['Authorization']='Bearer '+t;
    var m=Object.assign({headers:h},opts||{}); if(opts&&opts.headers) m.headers=Object.assign({},h,opts.headers);
    return fetch(API+path,m).then(function(res){ return res.json().catch(function(){return null;}).then(function(data){ if(!res.ok) throw new Error((data&&data.error)||('Request failed '+res.status)); return data; }); });
  }
  function $(s,c){ return (c||document).querySelector(s); }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function toast(m,t){ if(window.CamzyAdmin&&window.CamzyAdmin.showToast) window.CamzyAdmin.showToast(m,t); }
  var tbody=$('#adm-articles-tbody');
  if(!tbody) return;
  var modal=$('#adm-article-modal'), delModal=$('#adm-article-delete-modal');
  var articles=[]; var deleteId=null; var busy=false; var statusFilter='all';
  /* Article categories — loaded from SQLite (GET /admin/article-categories). */
  var articleCats=[];
  var FALLBACK_CATS=[{name:'راهنمای خرید دوربین',slug:'buying-guide'},{name:'آموزش نصب دوربین',slug:'installation-tutorial'},{name:'مقایسه دوربین',slug:'camera-comparison'},{name:'نگهداری سیستم امنیتی',slug:'security-maintenance'},{name:'اخبار فناوری امنیتی',slug:'security-news'}];
  function catList(){ return articleCats.length?articleCats:FALLBACK_CATS; }
  function catName(a){ if(a.category) return a.category; var s=a.categorySlug||a.category_slug||''; var f=catList().filter(function(c){return c.slug===s;})[0]; return f?f.name:(s||'—'); }
  function catSlug(a){ return a.categorySlug||a.category_slug||''; }
  function fillArticleCatSelect(selected){
    var sel=$('#adm-am-category'); if(!sel) return;
    var cur=selected||'';
    sel.innerHTML='<option value="">— بدون دسته —</option>'+catList().map(function(c){
      return '<option value="'+esc(c.slug)+'"'+(String(c.slug)===String(cur)?' selected':'')+'>'+esc(c.name)+'</option>';
    }).join('');
    if(cur) sel.value=cur;
  }
  var EDIT_SVG='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>';
  var DEL_SVG='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
  function openM(m){ if(m){ m.classList.add('is-open'); m.setAttribute('aria-hidden','false'); } }
  function closeM(m){ if(m){ m.classList.remove('is-open'); m.setAttribute('aria-hidden','true'); } }
  function badge(st){ return st==='published' ? '<span class="adm-badge adm-badge--success">منتشرشده</span>' : '<span class="adm-badge adm-badge--warning">پیش‌نویس</span>'; }
  function faDate(ts){ try{ if(!ts) return '—'; var s=String(ts).trim().replace(' ','T'); var d=new Date(s); if(isNaN(d.getTime())) return '—'; return d.toLocaleDateString('fa-IR'); }catch(e){ return '—'; } }
  function load(){
    tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-muted)">در حال بارگذاری…</td></tr>';
    var q='?limit=200'+(statusFilter!=='all'?'&status='+encodeURIComponent(statusFilter):'');
    var s=($('#adm-articles-search')||{}).value||'';
    if(s.trim()) q+='&q='+encodeURIComponent(s.trim());
    api('/admin/article-categories').then(function(d){
      var items=(d&&(d.items||d))||[]; articleCats=Array.isArray(items)?items:[];
      fillArticleCatSelect(($('#adm-am-category')||{}).value||''); renderCats();
    }).catch(function(){ articleCats=[]; fillArticleCatSelect(''); renderCats(); });
    api('/admin/articles'+q).then(function(d){ articles=(d&&(d.items||d))||[]; if(!Array.isArray(articles)) articles=[]; render(); })
      .catch(function(){ tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-muted)">خطا در دریافت مقالات</td></tr>'; });
  }
  function render(){
    if(!articles.length){ tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-muted)">مقاله‌ای ثبت نشده است.</td></tr>'; }
    else tbody.innerHTML=articles.map(function(a){
      var _im=a.image||a.featuredImage||''; _im=String(_im).replace(/^(\.\.\/)+/,'').replace(/^\/+/,''); var img=_im ? '<img src="../'+esc(_im)+'" alt="" style="width:44px;height:32px;object-fit:cover;border-radius:var(--radius-md)" onerror="this.style.display=\'none\'">' : '<span style="color:var(--text-muted)">—</span>';
      return '<tr data-id="'+a.id+'"><td>'+img+'</td><td><strong>'+esc(a.title)+'</strong><br><small style="color:var(--text-muted)">/'+esc(a.slug)+'</small></td>'+
        '<td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(a.excerpt||'')+'</td>'+
        '<td>'+esc(catName(a))+'</td>'+
        '<td>'+badge(a.status)+'</td><td>'+esc(faDate(a.createdAt||a.created_at))+'</td>'+
        '<td><div class="adm-table__cell-actions"><button type="button" class="adm-btn-icon" data-aedit="'+a.id+'" title="ویرایش">'+EDIT_SVG+'</button>'+
        '<button type="button" class="adm-btn-icon adm-btn-icon--danger" data-adel="'+a.id+'" title="حذف">'+DEL_SVG+'</button></div></td></tr>';
    }).join('');
    var meta=$('[data-view="articles"] .adm-table-footer__meta'); if(meta) meta.textContent='مجموع '+articles.length+' مقاله';
  }
  /* ── Article categories section ── */
  var catTbody=$('#adm-article-cats-tbody');
  var catModal=$('#adm-article-cat-modal'), catDelModal=$('#adm-article-cat-delete-modal');
  var catDeleteId=null;
  function renderCats(){
    if(!catTbody) return;
    var list=catList();
    if(!list.length){ catTbody.innerHTML='<tr><td colspan="4" style="text-align:center;padding:28px;color:var(--text-muted)">دسته‌ای ثبت نشده است.</td></tr>'; }
    else catTbody.innerHTML=list.map(function(c){
      return '<tr data-id="'+(c.id==null?'':c.id)+'"><td><strong>'+esc(c.name)+'</strong></td>'+
        '<td dir="ltr" style="text-align:left"><small style="color:var(--text-muted)">'+esc(c.slug)+'</small></td>'+
        '<td>'+(c.count==null?'—':esc(c.count))+'</td>'+
        '<td><div class="adm-table__cell-actions"><button type="button" class="adm-btn-icon" data-acedit="'+(c.id==null?esc(c.slug):c.id)+'" title="ویرایش">'+EDIT_SVG+'</button>'+
        '<button type="button" class="adm-btn-icon adm-btn-icon--danger" data-acdel="'+(c.id==null?esc(c.slug):c.id)+'" title="حذف">'+DEL_SVG+'</button></div></td></tr>';
    }).join('');
    var meta=$('#adm-article-cats-meta'); if(meta) meta.textContent='مجموع '+list.length+' دسته';
  }
  function openCatAdd(){
    if(!catModal) return;
    $('#adm-ac-form').reset(); $('#adm-ac-id').value='';
    $('#adm-ac-title-label').textContent='افزودن دسته'; $('#adm-ac-submit').textContent='ذخیره دسته';
    openM(catModal);
  }
  function openCatEdit(id){
    if(!catModal) return;
    var c=catList().filter(function(x){ return String(x.id)===String(id)||String(x.slug)===String(id); })[0]; if(!c) return;
    $('#adm-ac-id').value=(c.id==null?c.slug:c.id); $('#adm-ac-name').value=c.name||''; $('#adm-ac-slug').value=c.slug||'';
    $('#adm-ac-title-label').textContent='ویرایش دسته'; $('#adm-ac-submit').textContent='به‌روزرسانی دسته';
    openM(catModal);
  }
  function openCatDelete(id){
    if(!catDelModal) return;
    catDeleteId=id;
    var c=catList().filter(function(x){ return String(x.id)===String(id)||String(x.slug)===String(id); })[0];
    var n=c?(c.count||0):0;
    $('#adm-acdel-text').textContent=c?('«'+c.name+'» حذف شود؟'+(n>0?(' این دسته '+n+' مقاله دارد؛ ابتدا مقالات را به دسته دیگری منتقل کنید.'):' ')):'آیا از حذف این دسته مطمئن هستید؟';
    var wrap=$('#adm-acdel-reassign-wrap'), sel=$('#adm-acdel-reassign');
    if(wrap&&sel){
      if(n>0){
        wrap.style.display='';
        sel.innerHTML=catList().filter(function(x){ return String(x.id)!==String(id)&&String(x.slug)!==String(id); }).map(function(x){
          return '<option value="'+esc(x.slug)+'">'+esc(x.name)+'</option>';
        }).join('')||'<option value="">— دسته‌ای وجود ندارد —</option>';
      } else { wrap.style.display='none'; sel.innerHTML=''; }
    }
    openM(catDelModal);
  }
  function openAdd(){
    $('#adm-am-form').reset(); $('#adm-am-id').value=''; fillArticleCatSelect('');
    $('#adm-am-title-label').textContent='افزودن مقاله'; $('#adm-am-submit').textContent='ذخیره مقاله';
    openM(modal);
  }
  function openEdit(id){
    var a=articles.filter(function(x){ return String(x.id)===String(id); })[0]; if(!a) return;
    $('#adm-am-id').value=a.id; $('#adm-am-title').value=a.title||''; $('#adm-am-slug').value=a.slug||'';
    $('#adm-am-excerpt').value=a.excerpt||''; $('#adm-am-content').value=a.content||'';
    $('#adm-am-image').value=a.image||a.featuredImage||''; $('#adm-am-status').value=a.status||'draft';
    fillArticleCatSelect(catSlug(a)||'');
    $('#adm-am-title-label').textContent='ویرایش مقاله'; $('#adm-am-submit').textContent='به‌روزرسانی مقاله';
    openM(modal);
  }
  document.addEventListener('click', function(e){
    var t=e.target.closest?e.target.closest('[data-aedit],[data-adel],[data-am-close],[data-adel-close],[data-acedit],[data-acdel],[data-ac-close],[data-acdel-close]'):null;
    if(!t) return;
    if(t.hasAttribute('data-aedit')){ e.preventDefault(); openEdit(t.getAttribute('data-aedit')); }
    else if(t.hasAttribute('data-adel')){ e.preventDefault(); deleteId=t.getAttribute('data-adel');
      var a=articles.filter(function(x){ return String(x.id)===String(deleteId); })[0];
      $('#adm-adel-text').textContent=a? '«'+a.title+'» حذف شود؟':'آیا از حذف این مقاله مطمئن هستید؟';
      openM(delModal); }
    else if(t.hasAttribute('data-am-close')) closeM(modal);
    else if(t.hasAttribute('data-adel-close')){ closeM(delModal); deleteId=null; }
    else if(t.hasAttribute('data-acedit')){ e.preventDefault(); openCatEdit(t.getAttribute('data-acedit')); }
    else if(t.hasAttribute('data-acdel')){ e.preventDefault(); openCatDelete(t.getAttribute('data-acdel')); }
    else if(t.hasAttribute('data-ac-close')) closeM(catModal);
    else if(t.hasAttribute('data-acdel-close')){ closeM(catDelModal); catDeleteId=null; }
  });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape'){ closeM(modal); closeM(delModal); closeM(catModal); closeM(catDelModal); deleteId=null; catDeleteId=null; } });
  var addBtn=$('#adm-add-article-btn'); if(addBtn) addBtn.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); openAdd(); });
  var addCatBtn=$('#adm-add-article-cat-btn'); if(addCatBtn) addCatBtn.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); openCatAdd(); });
  var form=$('#adm-am-form');
  if(form) form.addEventListener('submit', function(e){
    e.preventDefault(); if(busy) return;
    var id=$('#adm-am-id').value;
    var _catEl=$('#adm-am-category'); var _catSlug=_catEl?(_catEl.value||''):''; var _catName='', _catId=null;
    if(_catSlug){ var _f=catList().filter(function(c){return c.slug===_catSlug;})[0]; _catName=_f?_f.name:_catSlug; _catId=_f?(_f.id==null?null:_f.id):null; }
    var payload={ title:$('#adm-am-title').value.trim(), slug:$('#adm-am-slug').value.trim(),
      excerpt:$('#adm-am-excerpt').value.trim(), content:$('#adm-am-content').value,
      image:$('#adm-am-image').value.trim(), status:$('#adm-am-status').value,
      category:_catName, categorySlug:_catSlug, category_slug:_catSlug, categoryId:_catId, category_id:_catId };
    if(!payload.title){ toast('عنوان مقاله الزامی است','danger'); return; }
    busy=true;
    var req=id? api('/admin/articles/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify(payload)})
              : api('/admin/articles',{method:'POST',body:JSON.stringify(payload)});
    req.then(function(saved){
      if(id) articles=articles.map(function(x){ return String(x.id)===String(id)?saved:x; }); else articles.unshift(saved);
      closeM(modal); render(); toast(id?'مقاله به‌روزرسانی شد':'مقاله جدید اضافه شد','success');
    }).catch(function(err){ toast(err.message||'ذخیره مقاله ناموفق بود','danger'); }).then(function(){ busy=false; });
  });
  var catForm=$('#adm-ac-form');
  if(catForm) catForm.addEventListener('submit', function(e){
    e.preventDefault(); if(busy) return;
    var id=$('#adm-ac-id').value;
    var payload={ name:$('#adm-ac-name').value.trim(), slug:$('#adm-ac-slug').value.trim() };
    if(!payload.name){ toast('نام دسته الزامی است','danger'); return; }
    busy=true;
    var req=id? api('/admin/article-categories/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify(payload)})
              : api('/admin/article-categories',{method:'POST',body:JSON.stringify(payload)});
    req.then(function(saved){
      if(id) articleCats=articleCats.map(function(x){ return (String(x.id)===String(id)||String(x.slug)===String(id))?saved:x; });
      else articleCats.push(saved);
      closeM(catModal); renderCats(); fillArticleCatSelect(($('#adm-am-category')||{}).value||''); load();
      toast(id?'دسته به‌روزرسانی شد':'دسته جدید اضافه شد','success');
    }).catch(function(err){ toast(err.message||'ذخیره دسته ناموفق بود','danger'); }).then(function(){ busy=false; });
  });
  var delConfirm=$('#adm-adel-confirm');
  if(delConfirm) delConfirm.addEventListener('click', function(){
    if(deleteId==null||busy) return; busy=true;
    api('/admin/articles/'+encodeURIComponent(deleteId),{method:'DELETE'}).then(function(){
      articles=articles.filter(function(x){ return String(x.id)!==String(deleteId); });
      closeM(delModal); deleteId=null; render(); toast('مقاله حذف شد','danger');
    }).catch(function(err){ toast(err.message||'حذف مقاله ناموفق بود','danger'); }).then(function(){ busy=false; });
  });
  var catDelConfirm=$('#adm-acdel-confirm');
  if(catDelConfirm) catDelConfirm.addEventListener('click', function(){
    if(catDeleteId==null||busy) return;
    var sel=$('#adm-acdel-reassign'); var reassign=sel&&sel.value?sel.value:'';
    var c=catList().filter(function(x){ return String(x.id)===String(catDeleteId)||String(x.slug)===String(catDeleteId); })[0];
    if(c&&(c.count||0)>0&&!reassign){ toast('این دسته مقاله دارد؛ ابتدا مقالات را به دسته دیگری منتقل کنید','danger'); return; }
    busy=true;
    var url='/admin/article-categories/'+encodeURIComponent(catDeleteId)+(reassign?('?reassign_to='+encodeURIComponent(reassign)):'');
    api(url,{method:'DELETE'}).then(function(){
      articleCats=articleCats.filter(function(x){ return String(x.id)!==String(catDeleteId)&&String(x.slug)!==String(catDeleteId); });
      closeM(catDelModal); catDeleteId=null; renderCats(); fillArticleCatSelect(($('#adm-am-category')||{}).value||''); load();
      toast('دسته حذف شد','danger');
    }).catch(function(err){ toast(err.message||'حذف دسته ناموفق بود','danger'); }).then(function(){ busy=false; });
  });
  var chips=document.querySelectorAll('[data-view="articles"] .adm-chip');
  chips.forEach(function(c){ c.addEventListener('click', function(){
    chips.forEach(function(x){ x.classList.remove('is-active'); }); c.classList.add('is-active');
    statusFilter=c.getAttribute('data-status')||'all'; load(); }); });
  var search=$('#adm-articles-search');
  if(search){ var t=null; search.addEventListener('input', function(){ clearTimeout(t); t=setTimeout(load,300); }); }
  load();
  window.CamzyAdminArticles={ reload: load };
})();
