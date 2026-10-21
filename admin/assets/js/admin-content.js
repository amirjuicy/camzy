/* ================================================================
   Camzy — Admin Site Content / CMS (real API: /api/content)
   Manages homepage hero, sections, promo, services, footer text.
   ================================================================ */
(function(){
  'use strict';
  function tok(){ try{ var s=JSON.parse(localStorage.getItem('as_admin_session')||'null'); return s&&s.token||''; }catch(e){return '';} }
  function toast(m,t){ if(window.CamzyAdmin&&window.CamzyAdmin.showToast) window.CamzyAdmin.showToast(m,t); }
  var form=document.getElementById('adm-content-form');
  if(!form) return;
  var busy=false;
  function load(){
    fetch('/api/content').then(function(r){ return r.json(); }).then(function(data){
      for(var k in data){ var el=document.getElementById('c-'+k.replace(/\./g,'-')); if(el) el.value=data[k]; }
    }).catch(function(){});
  }
  form.addEventListener('submit', function(e){
    e.preventDefault(); if(busy) return; busy=true;
    var payload={};
    form.querySelectorAll('[data-content-key]').forEach(function(el){
      var k=el.getAttribute('data-content-key');
      payload[k]=el.value;
    });
    var h={ 'Content-Type':'application/json' }; var t=tok(); if(t) h['Authorization']='Bearer '+t;
    fetch('/api/content',{method:'PUT',headers:h,body:JSON.stringify(payload)}).then(function(r){
      if(!r.ok) throw new Error('save failed');
      return r.json();
    }).then(function(){ toast('محتوای سایت ذخیره شد','success'); }).catch(function(){ toast('خطا در ذخیره محتوا','danger'); }).then(function(){ busy=false; });
  });
  load();
  window.CamzyAdminContent={ reload: load };
})();
