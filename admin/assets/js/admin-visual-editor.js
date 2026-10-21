/* Camzy — Admin Visual Editor section (reuses builder.html engine + existing pages list, same save/load APIs) */
(function(){
  'use strict';
  function $(s,r){ return (r||document).querySelector(s); }
  var frame=$('#adm-ve-frame'), openBtn=$('#adm-ve-open'), hint=$('#adm-ve-hint'), card=$('#adm-pages-card');
  if(!frame||!card) return;
  function openBuilder(url,label){
    frame.src=url;
    if(openBtn){ openBtn.style.display=''; openBtn.href=url; }
    if(hint) hint.textContent='در حال ویرایش بصری: '+(label||url)+' — تغییرات با دکمه «ذخیره» داخل ویرایشگر ذخیره می‌شود (همان API ذخیره‌سازی).';
    try{ frame.scrollIntoView({behavior:'smooth',block:'start'}); }catch(_){}
  }
  // 🖥 buttons rendered by existing admin-pages.js: open inline in this section's iframe
  // instead of navigating away. Ctrl/Cmd+click or middle-click still opens standalone builder.
  document.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('#adm-pages-card a[href^="builder.html"]');
    if(!a) return;
    if(e.ctrlKey||e.metaKey||e.shiftKey||(e.button!=null&&e.button!==0)) return;
    e.preventDefault();
    var label=(a.getAttribute('title')||'');
    openBuilder(a.getAttribute('href'),label);
  });
  // Deep-link support: #/visual-editor?page=slug:xxx or page=file:yyy.html
  function applyHash(){
    if((location.hash||'').indexOf('visual-editor')<0) return;
    var m=(location.hash||'').match(/page=([^&]+)/);
    if(!m) return;
    var v='';
    try{ v=decodeURIComponent(m[1]); }catch(_){ v=m[1]; }
    var url=null;
    if(v.indexOf('file:')===0) url='builder.html?file='+encodeURIComponent(v.slice(5));
    else if(v.indexOf('slug:')===0) url='builder.html?slug='+encodeURIComponent(v.slice(5));
    else if(v) url='builder.html?slug='+encodeURIComponent(v);
    if(url) openBuilder(url,v);
  }
  window.addEventListener('hashchange',applyHash);
  applyHash();
})();
