/* ================================================================
   Camzy — Admin Users Management (real API: /api/admin/users)
   List, create, edit, activate/deactivate, reset password,
   roles + custom per-section permissions, delete with
   last-active-admin protection (server-enforced).
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
  var tbody=$('#adm-admins-table tbody');
  if(!tbody) return;
  var addBtn=$('#adm-add-admin-btn');
  var modal=$('#adm-admin-modal');

  var ROLES = {
    superadmin: 'مدیر ارشد',
    admin: 'مدیر',
    manager: 'مدیر داخلی',
    editor: 'ویراستار',
    support: 'پشتیبانی',
    viewer: 'ناظر (فقط‌خواندن)'
  };
  var SECTIONS = [
    ['dashboard','داشبورد'], ['orders','سفارش‌ها'], ['transactions','تراکنش‌ها'], ['reports','گزارش‌ها'],
    ['discounts','تخفیف‌ها'], ['products','محصولات'], ['categories','دسته‌بندی‌ها'], ['users','کاربران'],
    ['notifications','اعلان‌ها'], ['tickets','تیکت‌ها'], ['brands','برندها'], ['articles','مقالات'],
    ['reviews','نظرات'], ['content','محتوا'], ['home','صفحه اصلی'], ['gallery','گالری'],
    ['admins','مدیران'], ['logs','لاگ‌ها'], ['settings','تنظیمات'], ['sms','پیامک'], ['seo','سئو']
  ];

  var cache = [];

  function openM(m){ if(m){ m.classList.add('is-open'); m.setAttribute('aria-hidden','false'); } }
  function closeM(m){ if(m){ m.classList.remove('is-open'); m.setAttribute('aria-hidden','true'); } }

  function permsSummary(a){
    if(!a.permissions) return '<span class="adm-table__sub">پیش‌فرض نقش</span>';
    var p=a.permissions;
    var scope = p.sections==='all' ? 'همه بخش‌ها' : (p.sections||[]).length+' بخش';
    return '<span class="adm-table__sub">سفارشی: '+esc(scope)+(p.readonly?' (فقط‌خواندن)':'')+'</span>';
  }

  function load(){
    tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-muted)">در حال بارگذاری…</td></tr>';
    api('/admin/users').then(function(rows){
      var list=Array.isArray(rows)?rows:[];
      cache=list;
      if(!list.length){ tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--color-text-muted-dark)">مدیری یافت نشد.</td></tr>'; return; }
      tbody.innerHTML=list.map(function(a){
        var active = a.isActive!==false;
        return '<tr data-id="'+a.id+'">'
          +'<td><span class="adm-user"><span class="adm-user__avatar">'+esc((a.fullName||a.name||a.username||'?').charAt(0))+'</span><span class="adm-user__name">'+esc(a.username)+'</span></span><div class="adm-table__sub">'+esc(a.fullName||a.name||'')+'</div></td>'
          +'<td><span class="adm-badge adm-badge--primary adm-badge--plain">'+esc(ROLES[a.role]||a.role||'')+'</span>'+permsSummary(a)+'</td>'
          +'<td>'+(active?'<span class="adm-badge adm-badge--success">فعال</span>':'<span class="adm-badge adm-badge--muted">غیرفعال</span>')+'</td>'
          +'<td style="direction:ltr;text-align:right">'+esc(a.id)+'</td>'
          +'<td>'+esc(a.created_at||'')+'</td>'
          +'<td><div class="adm-table__cell-actions">'
          +'<button type="button" class="adm-btn-icon" data-aedit="'+a.id+'" title="ویرایش"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg></button>'
          +'<button type="button" class="adm-btn-icon" data-atoggle="'+a.id+'" data-active="'+(active?'0':'1')+'" title="'+(active?'غیرفعال کردن':'فعال کردن')+'"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>'
          +'<button type="button" class="adm-btn-icon" data-apass="'+a.id+'" title="تغییر رمز"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></button>'
          +'<button type="button" class="adm-btn-icon adm-btn-icon--danger" data-adel="'+a.id+'" title="حذف"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>'
          +'</div></td></tr>';
      }).join('');
    }).catch(function(err){
      if(/403/.test(err.message||'')) tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-muted)">دسترسی به مدیریت مدیران ندارید.</td></tr>';
      else tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-muted)">خطا: '+esc(err.message||'')+'</td></tr>';
    });
  }

  function renderPermMatrix(selected, readonly){
    var box=$('#adm-am-perms');
    if(!box) return;
    box.innerHTML='<label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:6px"><input type="checkbox" id="adm-am-readonly"'+(readonly?' checked':'')+'> فقط‌خواندن (بدون اجازه ثبت/ویرایش/حذف)</label>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;max-height:220px;overflow-y:auto">'
      +SECTIONS.map(function(s){
        var on=!selected||selected==='all'||selected.indexOf(s[0])!==-1;
        return '<label style="display:flex;align-items:center;gap:6px;font-size:12px;padding:3px 0"><input type="checkbox" data-am-perm="'+s[0]+'"'+(on?' checked':'')+'> '+esc(s[1])+'</label>';
      }).join('')+'</div>';
  }
  function syncPermUI(){
    var custom=$('#adm-am-custom');
    var wrap=$('#adm-am-permswrap');
    if(wrap) wrap.style.display=custom&&custom.checked?'':'none';
  }
  function collectPerms(){
    if(!$('#adm-am-custom').checked) return null;
    var sections=$$('[data-am-perm]').filter(function(cb){return cb.checked;}).map(function(cb){return cb.getAttribute('data-am-perm');});
    var ro=$('#adm-am-readonly');
    return { sections: sections, readonly: !!(ro&&ro.checked) };
  }

  function openAdd(){
    var form=$('#adm-admin-form'); if(form) form.reset();
    $('#adm-am-id').value='';
    $('#adm-am-passrow').style.display='';
    $('#adm-am-password').required=true;
    $('#adm-am-role').value='support';
    $('#adm-am-active').checked=true;
    $('#adm-am-custom').checked=false;
    renderPermMatrix(null,false);
    syncPermUI();
    $('#adm-am-title').textContent='افزودن مدیر';
    $('#adm-am-submit').textContent='افزودن';
    openM(modal);
  }
  function openEdit(id){
    var a=cache.filter(function(x){return String(x.id)===String(id);})[0];
    if(!a) return;
    $('#adm-am-id').value=a.id;
    $('#adm-am-username').value=a.username||'';
    $('#adm-am-username').disabled=true;
    $('#adm-am-name').value=a.fullName||a.name||'';
    $('#adm-am-passrow').style.display='none';
    $('#adm-am-password').required=false;
    $('#adm-am-password').value='';
    $('#adm-am-role').value=a.role||'support';
    $('#adm-am-active').checked=a.isActive!==false;
    var custom=!!(a.permissions&&a.permissions.custom);
    $('#adm-am-custom').checked=custom;
    var sel=a.permissions?(a.permissions.sections||[]):null;
    renderPermMatrix(sel, !!(a.permissions&&a.permissions.readonly));
    syncPermUI();
    $('#adm-am-title').textContent='ویرایش مدیر';
    $('#adm-am-submit').textContent='ذخیره تغییرات';
    openM(modal);
  }

  if(addBtn) addBtn.addEventListener('click', function(e){ e.preventDefault(); $('#adm-am-username').disabled=false; openAdd(); });
  document.addEventListener('click', function(e){
    var t=e.target.closest?e.target.closest('[data-am-close]'):null;
    if(t){ closeM(modal); $('#adm-am-username').disabled=false; return; }
    if(e.target&&e.target.id==='adm-am-custom'){ syncPermUI(); return; }
    var ed=e.target.closest?e.target.closest('[data-aedit]'):null;
    if(ed){ e.preventDefault(); openEdit(ed.getAttribute('data-aedit')); return; }
    var tg=e.target.closest?e.target.closest('[data-atoggle]'):null;
    if(tg){
      e.preventDefault();
      var tid=tg.getAttribute('data-atoggle');
      var to=tg.getAttribute('data-active')==='1';
      if(!window.confirm(to?'این مدیر فعال شود؟':'این مدیر غیرفعال شود؟ (نشست‌های او بسته می‌شود)')) return;
      api('/admin/users/'+encodeURIComponent(tid),{method:'PUT',body:JSON.stringify({isActive:to})}).then(function(){ toast(to?'مدیر فعال شد':'مدیر غیرفعال شد','success'); load(); }).catch(function(err){ toast(err.message||'عملیات ناموفق بود','danger'); });
      return;
    }
    var del=e.target.closest?e.target.closest('[data-adel]'):null;
    if(del){
      e.preventDefault();
      var id=del.getAttribute('data-adel');
      if(!window.confirm('این مدیر حذف شود؟')) return;
      api('/admin/users/'+encodeURIComponent(id),{method:'DELETE'}).then(function(){ toast('مدیر حذف شد','danger'); load(); }).catch(function(err){ toast(err.message||'حذف ناموفق بود','danger'); });
      return;
    }
    var pass=e.target.closest?e.target.closest('[data-apass]'):null;
    if(pass){
      e.preventDefault();
      var pid=pass.getAttribute('data-apass');
      var np=window.prompt('رمز جدید (حداقل ۸ کاراکتر):');
      if(!np) return;
      if(np.length<8){ toast('رمز باید حداقل ۸ کاراکتر باشد','danger'); return; }
      api('/admin/users/'+encodeURIComponent(pid)+'/password',{method:'POST',body:JSON.stringify({newPassword:np})}).then(function(){ toast('رمز عبور به‌روزرسانی شد','success'); }).catch(function(err){ toast(err.message||'خطا','danger'); });
    }
  });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape'){ closeM(modal); $('#adm-am-username').disabled=false; } });
  var form=$('#adm-admin-form');
  if(form) form.addEventListener('submit', function(e){
    e.preventDefault();
    var id=$('#adm-am-id').value;
    var u=$('#adm-am-username').value.trim();
    var p=$('#adm-am-password').value;
    var n=$('#adm-am-name').value.trim();
    var role=$('#adm-am-role').value;
    var active=$('#adm-am-active').checked;
    var perms=collectPerms();
    if(!u){ toast('نام کاربری الزامی است','danger'); return; }
    if(!id&&(!p||p.length<8)){ toast('رمز باید حداقل ۸ کاراکتر باشد','danger'); return; }
    var payload={ name:n||u, role:role, isActive:active, permissions:perms };
    var req;
    if(id){
      req=api('/admin/users/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify(payload)});
    } else {
      payload.username=u; payload.password=p;
      req=api('/admin/users',{method:'POST',body:JSON.stringify(payload)});
    }
    req.then(function(){ closeM(modal); $('#adm-am-username').disabled=false; toast(id?'مدیر به‌روزرسانی شد':'مدیر جدید اضافه شد','success'); load(); }).catch(function(err){ toast(err.message||'خطا','danger'); });
  });
  load();
  window.CamzyAdminAdmins={ reload: load };
})();
