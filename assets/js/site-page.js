/* Public CMS page renderer: /page.html?slug=xxx -> GET /api/pages/:slug (DB content) */
(function(){
  // Clean URL (/page/:slug) carries the slug in the pathname.
  var cleanSlug = (function(){ try{ var s=(location.pathname||'').split('/').filter(function(x){ return !!x; }); if(s.length===2 && s[0]==='page' && s[1]) return decodeURIComponent(s[1]); }catch(e){} return ''; })();
  var slug = (window.AS_PAGE_SLUG || new URLSearchParams(location.search).get('slug') || cleanSlug || '').trim();
  var titleEl = document.getElementById('pg-title'), bodyEl = document.getElementById('pg-body'),
      crumb = document.getElementById('pg-crumb');
  if(!slug){ if(bodyEl) bodyEl.textContent='صفحه‌ای مشخص نشده است.'; return; }
  fetch('/api/pages/'+encodeURIComponent(slug)).then(function(r){ if(!r.ok) throw 0; return r.json(); }).then(function(p){
    document.title = p.title + ' | کمزی';
    if(titleEl) titleEl.textContent = p.title;
    if(crumb) crumb.textContent = p.title;
    // Saved header chrome (Visual Builder) overrides the global template. Applied
    // before the body so the builder binds after both have settled.
    if(p.headerHtml){ var hEl=document.getElementById('site-header'); if(hEl){ hEl.innerHTML=p.headerHtml; hEl.setAttribute('data-pb-page-header','1'); } }
    if(bodyEl) bodyEl.innerHTML = p.body || '';
  }).catch(function(){ if(bodyEl) bodyEl.textContent='صفحه یافت نشد.'; });
})();
