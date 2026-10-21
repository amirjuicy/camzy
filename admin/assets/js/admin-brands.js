/* ================================================================
   Camzy — Admin Brands (real API: GET/POST/PUT/DELETE /brands)
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
  function fa(n){ try{return Number(n||0).toLocaleString('fa-IR');}catch(e){return String(n);} }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function toast(m,t){ if(window.CamzyAdmin&&window.CamzyAdmin.showToast) window.CamzyAdmin.showToast(m,t); }
  var grid=$('#adm-brands-grid');
  if(!grid) return; // section not present yet — created via HTML edit
  var modal=$('#adm-brand-modal');
  var delModal=$('#adm-brand-delete-modal');
  var brands=[];
  var deleteId=null;
  var busy=false;
  var EDIT_SVG='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>';
  var DEL_SVG='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
  function openM(m){ if(m){ m.classList.add('is-open'); m.setAttribute('aria-hidden','false'); } }
  function closeM(m){ if(m){ m.classList.remove('is-open'); m.setAttribute('aria-hidden','true'); } }
  function load(){
    grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:28px;color:var(--color-text-muted-dark)">در حال بارگذاری برندها…</div>';
    api('/brands').then(function(rows){ brands=Array.isArray(rows)?rows:[]; render(); }).catch(function(){ grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:28px;color:var(--text-muted)">خطا در دریافت برندها</div>'; });
  }
  function render(){
    if(!brands.length){ grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:28px;color:var(--color-text-muted-dark)">برندی ثبت نشده است.</div>'; return; }
    var max=Math.max.apply(null, brands.map(function(b){ return Number(b.count)||0; }).concat([1]));
    grid.innerHTML=brands.map(function(b){
      var pct=Math.max(4, Math.round(((Number(b.count)||0)/max)*100));
      var logo=b.logo? '<img src="../'+esc(b.logo)+'" alt="'+esc(b.displayName)+'" style="width:32px;height:32px;object-fit:contain">': '<span style="font-size:18px">🏷️</span>';
      return '<div class="adm-cat" data-id="'+b.id+'"><span class="adm-cat__icon" style="background:var(--color-gray-50)">'+logo+'</span><div class="adm-cat__meta"><span class="adm-cat__name">'+esc(b.displayName||b.name)+'</span><span class="adm-cat__count">'+esc(b.country||'')+' — '+fa(b.count||0)+' محصول</span><span class="adm-cat__bar"><span style="width:'+pct+'%;background:var(--color-primary)"></span></span><div class="adm-cat__subs" style="font-size:11.5px;color:var(--text-muted)">'+esc(b.description||'')+'</div></div><div class="adm-cat__actions"><button type="button" class="adm-btn-icon" data-bedit="'+b.id+'" title="ویرایش">'+EDIT_SVG+'</button><button type="button" class="adm-btn-icon adm-btn-icon--danger" data-bdel="'+b.id+'" title="حذف">'+DEL_SVG+'</button></div></div>';
    }).join('');
    var sub=$('[data-view="brands"] .adm-card__sub'); if(sub) sub.textContent=fa(brands.length)+' برند ثبت‌شده';
  }
  function openAdd(){
    $('#adm-bm-form').reset();
    $('#adm-bm-id').value='';
    $('#adm-bm-title').textContent='افزودن برند';
    $('#adm-bm-submit').textContent='ذخیره برند';
    openM(modal);
  }
  function openEdit(id){
    var b=brands.filter(function(x){ return String(x.id)===String(id); })[0]; if(!b) return;
    $('#adm-bm-id').value=b.id;
    $('#adm-bm-name').value=b.name||'';
    $('#adm-bm-display').value=b.displayName||b.display_name||'';
    $('#adm-bm-country').value=b.country||'';
    $('#adm-bm-logo').value=b.logo||'';
    $('#adm-bm-desc').value=b.description||'';
    $('#adm-bm-title').textContent='ویرایش برند';
    $('#adm-bm-submit').textContent='به‌روزرسانی برند';
    openM(modal);
  }
  document.addEventListener('click', function(e){
    var t=e.target.closest?e.target.closest('[data-bedit],[data-bdel],[data-bm-close],[data-bdel-close]'):null;
    if(!t) return;
    if(t.hasAttribute('data-bedit')){ e.preventDefault(); openEdit(t.getAttribute('data-bedit')); }
    else if(t.hasAttribute('data-bdel')){
      e.preventDefault(); deleteId=t.getAttribute('data-bdel');
      var b=brands.filter(function(x){ return String(x.id)===String(deleteId); })[0];
      $('#adm-bdel-text').textContent=b? '«'+b.displayName+'» ('+fa(b.count||0)+' محصول) حذف شود؟'+((b.count||0)>0?' محصولات آن بدون برند می‌شوند.':''): 'آیا از حذف این برند مطمئن هستید؟';
      openM(delModal);
    } else if(t.hasAttribute('data-bm-close')) closeM(modal);
    else if(t.hasAttribute('data-bdel-close')){ closeM(delModal); deleteId=null; }
  });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape'){ closeM(modal); closeM(delModal); deleteId=null; } });
  var addBtn=$('#adm-add-brand-btn'); if(addBtn) addBtn.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); openAdd(); });
  var form=$('#adm-bm-form');
  if(form) form.addEventListener('submit', function(e){
    e.preventDefault(); if(busy) return;
    var id=$('#adm-bm-id').value;
    var name=$('#adm-bm-name').value.trim().toLowerCase();
    var display=$('#adm-bm-display').value.trim()||name;
    var country=$('#adm-bm-country').value.trim();
    var logo=$('#adm-bm-logo').value.trim();
    var desc=$('#adm-bm-desc').value.trim();
    if(!name){ toast('نام برند الزامی است','danger'); return; }
    busy=true;
    var payload={ name:name, displayName:display, country:country, logo:logo, description:desc };
    var req=id? api('/brands/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify(payload)}): api('/brands',{method:'POST',body:JSON.stringify(payload)});
    req.then(function(saved){
      if(id) brands=brands.map(function(x){ return String(x.id)===String(id)?saved:x; }); else brands.unshift(saved);
      closeM(modal); render(); toast(id?'برند به‌روزرسانی شد':'برند جدید اضافه شد','success');
    }).catch(function(err){ toast(err.message||'ذخیره برند ناموفق بود','danger'); }).then(function(){ busy=false; });
  });
  var delConfirm=$('#adm-bdel-confirm');
  if(delConfirm) delConfirm.addEventListener('click', function(){
    if(deleteId==null||busy) return; busy=true;
    function doDelete(force){
      api('/brands/'+encodeURIComponent(deleteId)+(force?'?force=1':''),{method:'DELETE'}).then(function(){
        brands=brands.filter(function(x){ return String(x.id)!==String(deleteId); });
        closeM(delModal); deleteId=null; render(); toast('برند حذف شد','danger'); busy=false;
      }).catch(function(err){
        if(!force&&/has products/.test(err.message||'')){
          if(window.confirm('این برند محصول دارد. حذف شود؟ (محصولات بدون برند می‌شوند)')){ doDelete(true); return; }
        } else toast(err.message||'حذف برند ناموفق بود','danger');
        busy=false;
      });
    }
    doDelete(false);
  });
  // search/filter
  var search=$('#adm-brands-search');
  if(search) search.addEventListener('input', function(){
    var q=search.value.trim().toLowerCase();
    var cards=grid.querySelectorAll('.adm-cat');
    cards.forEach(function(c){
      var name=(c.querySelector('.adm-cat__name')||{}).textContent||'';
      c.style.display=name.toLowerCase().indexOf(q)!==-1?'':'none';
    });
  });
  load();
  window.CamzyAdminBrands={ reload: load };
})();
