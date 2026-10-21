/* Camzy — Admin Pages (DB-backed site pages, real API) */
(function(){
  'use strict';
  function $(s,r){ return (r||document).querySelector(s); }
  function tok(){ try{ var s=JSON.parse(localStorage.getItem('as_admin_session')||'null'); return s&&s.token||''; }catch(e){return '';} }
  function H(t){ var h={'Content-Type':'application/json'}; if(t) h['Authorization']='Bearer '+t; return h; }
  function toast(m,t){ if(window.CamzyAdmin&&window.CamzyAdmin.showToast) window.CamzyAdmin.showToast(m,t); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  var listEl=$('#adm-pages-list'), searchEl=$('#adm-pages-search'), formWrap=$('#adm-page-editor'),
      fSlug=$('#pg-slug'), fTitle=$('#pg-title'), fExcerpt=$('#pg-excerpt'), fStatus=$('#pg-status'), fBody=$('#pg-body'),
      editing=null, editingFile=null, cache=[], staticFiles=[];
  var FA_LABELS={'account.html':'حساب کاربری','account-addresses.html':'آدرس‌های من','account-cart.html':'سبد خرید','account-notifications.html':'اعلان‌ها','account-order-detail.html':'جزئیات سفارش','account-orders.html':'سفارش‌های من','account-profile.html':'پروفایل من','account-wishlist.html':'علاقه‌مندی‌ها','about.html':'درباره ما','article-detail.html':'جزئیات مقاله','articles.html':'مقالات','authenticity.html':'اصالت کالا','brand-detail.html':'صفحه برند','brands.html':'برندها','categories.html':'دسته‌بندی‌ها','category.html':'صفحه دسته‌بندی','checkout.html':'تسویه حساب','checkout-step1.html':'تسویه حساب — مرحله ۱','checkout-step2.html':'تسویه حساب — مرحله ۲','checkout-step3.html':'تسویه حساب — مرحله ۳','checkout-step4.html':'تسویه حساب — مرحله ۴','contact.html':'تماس با ما','faq.html':'سوالات متداول','forgot-password.html':'بازیابی رمز عبور','index.html':'صفحه اصلی','login.html':'ورود','offline.html':'صفحه آفلاین','page.html':'صفحه عمومی','pricing.html':'قیمت‌گذاری','privacy.html':'حریم خصوصی','product.html':'صفحه محصول','register.html':'ثبت‌نام','returns.html':'بازگشت کالا','shipping.html':'حمل و نقل','shop.html':'فروشگاه','terms.html':'قوانین و مقررات'};
  function faLabel(f){ var k=String(f||'').toLowerCase(); if(FA_LABELS[k]) return FA_LABELS[k]; return k.replace(/\.html$/i,'').replace(/[-_]+/g,' '); }
  if(!listEl) return;
  function load(){
    listEl.innerHTML='<tr><td colspan="4" style="text-align:center;padding:28px;color:var(--text-muted)">در حال بارگذاری…</td></tr>';
    fetch('/api/admin/pages',{headers:H(tok())}).then(function(r){ if(!r.ok) throw 0; return r.json(); }).then(function(d){
      cache=(d.items||[]); staticFiles=(d.staticFiles||[]).filter(function(x){return /\.html$/i.test(x);});
      render();
    }).catch(function(){ listEl.innerHTML='<tr><td colspan="4" style="text-align:center;padding:20px">خطا در بارگذاری</td></tr>'; });
  }
  function render(){ var files=staticFiles;
    var q=(searchEl&&searchEl.value||'').trim();
    var rows=cache.filter(function(p){ return !q || p.slug.indexOf(q)>-1 || (p.title||'').indexOf(q)>-1; });
    var fileSet={}; (files||[]).forEach(function(f){ fileSet[String(f).toLowerCase()]=f; });
    var html=rows.map(function(p){
      // The storefront serves the static file (e.g. /about.html), not the DB row.
      // When a matching static file exists, the Visual Builder must open the file,
      // otherwise the save lands in the DB and the public page looks unchanged.
      var staticMatch=fileSet[String(p.slug||'').toLowerCase()+'.html'];
      var visualUrl=staticMatch?('builder.html?file='+encodeURIComponent(staticMatch)):('builder.html?slug='+encodeURIComponent(p.slug));
      return '<tr><td><span class="adm-order-id" dir="ltr">'+esc(p.slug)+'</span><div style="font-size:12px;color:var(--text-muted)">'+esc(p.title)+'</div></td>'
        +'<td><a href="/page.html?slug='+encodeURIComponent(p.slug)+'" target="_blank" dir="ltr">/page.html?slug='+esc(p.slug)+'</a>'
        +(/\.html$/.test(p.file||'')?' <a href="/'+esc(p.file)+'" target="_blank" style="font-size:12px">(' +esc(p.file)+')</a>':'')+'</td>'
        +'<td>'+(p.status==='draft'?'<span class="adm-badge adm-badge--warning">پیش‌نویس</span>':'<span class="adm-badge adm-badge--success">منتشرشده</span>')+(p.is_system?' <span class="adm-badge adm-badge--info">سیستمی</span>':'')+'</td>'
        +'<td><div class="adm-table__cell-actions"><a class="adm-btn-icon" href="'+visualUrl+'" title="ویرایش بصری" style="text-decoration:none">🎨</a><button type="button" class="adm-btn-icon" data-pg-open="'+esc(p.slug)+'" title="ویرایش">✎</button>'
        +(p.is_system?'':'<button type="button" class="adm-btn-icon adm-btn-icon--danger" data-pg-del="'+esc(p.slug)+'" title="حذف">🗑</button>')+'</div></td></tr>';
    }).join('');
    if(files&&files.length){ files=files.filter(function(f){ return !q || f.indexOf(q)>-1 || faLabel(f).indexOf(q)>-1; }); } if(files&&files.length){
      html+='<tr><td colspan="4" style="background:rgba(0,0,0,.03);font-size:12px;color:var(--text-muted)">فایل‌های HTML موجود سایت — بازدیدکنندگان همین فایل‌ها را می‌بینند؛ ویرایش بصری ردیف‌های بالا (نامک متناظر) نیز همین فایل را باز می‌کند</td></tr>';
      html+=files.map(function(f){ var slug=f.replace(/\.html$/i,'');
        return '<tr><td><span style="font-weight:600">'+esc(faLabel(f))+'</span><div style="font-size:12px;color:var(--text-muted);font-family:monospace">'+esc(f)+'</div></td><td><a href="/'+esc(f)+'" target="_blank">'+esc('/'+f)+'</a></td><td><span class="adm-badge">فایل استاتیک</span></td><td><div class="adm-table__cell-actions"><a class="adm-btn-icon" href="/'+esc(f)+'" target="_blank" title="پیش‌نمایش" style="text-decoration:none">👁</a><button type="button" class="adm-btn-icon" data-pg-openfile="'+esc(f)+'" title="ویرایش">✎</button><a class="adm-btn-icon" href="builder.html?file='+encodeURIComponent(f)+'" title="ویرایش بصری" style="text-decoration:none">🎨</a></div></td></tr>';
      }).join('');
    }
    listEl.innerHTML=html||'<tr><td colspan="4" style="text-align:center;padding:20px">صفحه‌ای یافت نشد</td></tr>';
  }
  function openEditor(p, file){
    editing=p?p.slug:null; editingFile=file||null;
    formWrap.style.display='';
    fSlug.value=file||(p?p.slug:''); fSlug.disabled=!!(p||file);
    fTitle.value=p?p.title:''; fExcerpt.value=p?p.excerpt||'':''; fStatus.value=p?p.status||'published':'published';
    fBody.value=p?p.body||'':'';
    formWrap.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function closeEditor(){ editing=null; editingFile=null; formWrap.style.display='none'; }
  document.addEventListener('click',function(e){
    var o=e.target.closest('[data-pg-open]'); if(o){ var sl=o.getAttribute('data-pg-open'); fetch('/api/admin/pages/'+encodeURIComponent(sl),{headers:H(tok())}).then(function(r){ if(!r.ok) throw 0; return r.json(); }).then(function(pg){ var ix=cache.findIndex(function(x){return x.slug===sl;}); if(ix>-1) cache[ix]=pg; openEditor(pg); }).catch(function(){ var c=cache.find(function(x){return x.slug===sl;}); if(c) openEditor(c); }); return; }
    var of=e.target.closest('[data-pg-openfile]'); if(of){ var s2=of.getAttribute('data-pg-openfile'); fetch('/api/admin/static-pages/'+encodeURIComponent(s2),{headers:H(tok())}).then(function(r){ if(!r.ok) throw 0; return r.json(); }).then(function(sf){ openEditor({slug:s2,title:sf.title,body:sf.body,excerpt:'',status:'published'}, s2); }).catch(function(){ fetch('/'+s2).then(function(r){ return r.text(); }).then(function(ht){ var t=(ht.match(/<title[^>]*>([^<]*)<\/title>/i)||[])[1]||s2; var b=(ht.match(/<main[^>]*>([\s\S]*)<\/main>/i)||[])[1]||(ht.match(/<body[^>]*>([\s\S]*)<\/body>/i)||[])[1]||''; openEditor({slug:s2,title:t.trim(),body:b.trim(),excerpt:'',status:'published'}, s2); }).catch(function(){ openEditor({slug:s2,title:s2,body:'',excerpt:'',status:'published'}, s2); }); }); return; }
    var d=e.target.closest('[data-pg-del]'); if(d){ if(!confirm('حذف شود؟')) return;
      fetch('/api/admin/pages/'+encodeURIComponent(d.getAttribute('data-pg-del')),{method:'DELETE',headers:H(tok())}).then(function(r){ if(!r.ok) throw 0; toast('حذف شد','success'); load(); }).catch(function(){ toast('خطا در حذف','danger'); }); return; }
    if(e.target.closest('#adm-page-new')){ openEditor(null); return; }
    if(e.target.closest('#adm-page-cancel')){ closeEditor(); return; }
    if(e.target.closest('#adm-page-preview')){ window.open(editingFile?'/'+editingFile:'/page.html?slug='+encodeURIComponent(fSlug.value||''),'_blank'); return; }
  });
  var form=$('#adm-page-form');
  if(form) form.addEventListener('submit',function(e){
    e.preventDefault();
    var payload={ title:fTitle.value.trim(), body:fBody.value, excerpt:fExcerpt.value, status:fStatus.value };
    var t=tok(), url, method;
    if(editingFile){ url='/api/admin/static-pages/'+encodeURIComponent(editingFile); method='PUT'; payload={ title:fTitle.value.trim(), body:fBody.value }; }
    else if(editing){ url='/api/admin/pages/'+encodeURIComponent(editing); method='PUT'; }
    else{ var s=String(fSlug.value||'').trim().toLowerCase(); if(!/^[a-z0-9-]{1,80}$/.test(s)){ toast('نامک معتبر نیست','danger'); return; } payload.slug=s; url='/api/admin/pages'; method='POST'; }
    fetch(url,{method:method,headers:H(t),body:JSON.stringify(payload)}).then(function(r){ if(!r.ok) return r.json().then(function(j){ throw new Error(j.error||'save failed'); }); return r.json(); }).then(function(){ toast('صفحه ذخیره شد','success'); closeEditor(); load(); }).catch(function(err){ toast(err.message||'خطا در ذخیره','danger'); });
  });
  if(searchEl) searchEl.addEventListener('input',function(){ render(); });
  // keep file list without refetch on search
  
  load();
  window.CamzyAdminPages={ reload: load };
})();
