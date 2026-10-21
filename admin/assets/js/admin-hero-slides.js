/* Camzy — Admin Hero Slides Manager (dynamic CRUD + reorder, content/full types, per-element controls) */
(function(){
  'use strict';
  function tok(){ try{ var s=JSON.parse(localStorage.getItem('as_admin_session')||'null'); return s&&s.token||''; }catch(e){return '';} }
  function toast(m,t){ if(window.CamzyAdmin&&window.CamzyAdmin.showToast) window.CamzyAdmin.showToast(m,t); }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function on(v){ return v===true||v===1||v==='1'||v==='on'; }
  function normHex(v){ try{ var t=String(v||'').trim(); if(/^#[0-9a-fA-F]{6}$/.test(t)) return t; if(/^#[0-9a-fA-F]{3}$/.test(t)){ return '#'+t[1]+t[1]+t[2]+t[2]+t[3]+t[3]; } return null; }catch(e){ return null; } }

  var list=document.getElementById('adm-hero-slides-list');
  if(!list) return;
  var addBtn=document.getElementById('adm-hero-add-slide');
  var slides=[];
  /* Accordion state: id of the single expanded slide card (null = all
     collapsed). Keyed by row id so it survives re-renders (type change,
     reorder, save). All cards start collapsed. */
  var expandedId=null;

  function normType(s){ return (s&&s.slide_type==='full')?'full':'content'; }

  function getPreviewSrc(s) {
    var desktop = s.image_desktop || s.image || '';
    return desktop ? (desktop.startsWith('/') || desktop.startsWith('http') ? desktop : '../' + desktop) : '';
  }

  function render(){
    if(!slides.length){
      list.innerHTML='<p style="font-size:13px;color:var(--text-muted)">هیچ اسلایدی وجود ندارد. برای افزودن اسلاید جدید دکمه "+ افزودن اسلاید" را بزنید.</p>';
      return;
    }
    var html='';
    for(var i=0;i<slides.length;i++){
      var s=slides[i];
      var st=normType(s);
      var isFull=st==='full';
      var id=s.id||('new_'+i);
      var isXp=(expandedId===id);
      var advCss='';
      var bodyCss=isXp?'':'display:none;';
      var summaryTitle=String(s.title||s.badge||'').trim()||'(بدون عنوان)';
      var typeLabel=isFull?'تمام‌تصویر':'محتوایی';
      var activeLabel=(s.is_active!==0)?'فعال':'غیرفعال';
      var previewSrc=getPreviewSrc(s);
      var sbg=on(s.show_badge), sti=on(s.show_title), stx=on(s.show_text), si=on(s.show_image), sb1=on(s.show_btn1), sb2=on(s.show_btn2);
      var cp=s.content_position||'right';
      var isz=s.image_size||'medium';
      var bi=s.badge_icon||'';
      var imgDesktop=s.image_desktop||s.image||'';
      var imgMobile=s.image_mobile||'';
      html+='<div class="adm-card" data-slide-row="'+id+'" style="margin-bottom:12px;padding:12px">'
        +'<div data-slide-toggle="'+i+'" title="باز / بسته کردن" style="display:flex;align-items:center;gap:8px;margin-bottom:'+(isXp?'8px':'0')+';cursor:pointer">'
        +'<img src="'+previewSrc+'" alt="" style="width:32px;height:32px;object-fit:contain;border:1px solid var(--border-color-light);border-radius:var(--radius-md);background:#fff;padding:2px">'
        +'<span style="font-weight:600;font-size:13px">اسلاید '+(i+1)+'</span>'
        +'<span style="font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px">'+esc(summaryTitle)+'</span>'
        +'<span style="font-size:11px;color:var(--text-muted)">'+typeLabel+' • '+activeLabel+'</span>'
        +'<span style="flex:1"></span>'
        +'<span class="slide-chev" style="font-size:13px;color:var(--text-muted)">'+(isXp?'▴':'▾')+'</span>'
        +'<button type="button" class="adm-btn-icon" data-slide-up="'+i+'" title="بالا" '+(i===0?'disabled':'')+'><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg></button>'
        +'<button type="button" class="adm-btn-icon" data-slide-down="'+i+'" title="پایین" '+(i===slides.length-1?'disabled':'')+'><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>'
        +'<button type="button" class="adm-btn-icon adm-btn-icon--danger" data-slide-delete="'+i+'" title="حذف"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>'
        +'</div>'
        +'<div class="slide-body" style="'+bodyCss+'">'
        +'<div style="margin-bottom:8px"><label class="adm-field__label">نوع اسلاید</label><select class="input slide-type" style="width:100%"><option value="content"'+(isFull?'':' selected')+'>محتوایی (متن + دکمه)</option><option value="full"'+(isFull?' selected':'')+'>تمام‌تصویر (فقط تصویر لینک‌دار)</option></select></div>'
        +'<div style="display:flex;gap:12px;flex-wrap:wrap">'
        +'<div style="flex:1;min-width:220px">'
        +'<div style="margin-bottom:6px"><label class="adm-field__label">تصویر دسکتاپ</label></div>'
        +'<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">'
        +'<img class="slide-preview-desktop" src="'+previewSrc+'" alt="preview" style="width:48px;height:48px;object-fit:contain;border:1px solid var(--border-color-light);border-radius:var(--radius-md);background:#fff;padding:2px">'
        +'<input class="input slide-image-desktop" type="text" value="'+esc(imgDesktop)+'" dir="ltr" placeholder="assets/images/products/..." style="flex:1">'
        +'<button type="button" class="btn btn-secondary btn-sm" data-media-target="slide-image-desktop-'+i+'">انتخاب تصویر</button>'
        +'</div>'
        +'<input type="hidden" class="slide-image-target" id="slide-image-desktop-'+i+'" value="'+esc(imgDesktop)+'">'
        +'<div class="slide-advanced" style="margin-bottom:6px;'+advCss+'"><label class="adm-field__label">تصویر موبایل</label></div>'
        +'<div class="slide-advanced" data-flex="1" style="display:flex;gap:8px;align-items:center;margin-bottom:6px">'
        +'<img class="slide-preview-mobile" src="'+(imgMobile?(imgMobile.startsWith('/')||imgMobile.startsWith('http')?imgMobile:'../'+imgMobile):'')+'" alt="preview" style="width:48px;height:48px;object-fit:contain;border:1px solid var(--border-color-light);border-radius:var(--radius-md);background:#fff;padding:2px">'
        +'<input class="input slide-image-mobile" type="text" value="'+esc(imgMobile)+'" dir="ltr" placeholder="اختیاری — خالی بماند تا از تصویر دسکتاپ استفاده شود" style="flex:1">'
        +'<button type="button" class="btn btn-secondary btn-sm" data-media-target="slide-image-mobile-'+i+'">انتخاب تصویر</button>'
        +'</div>'
        +'<input type="hidden" class="slide-image-target" id="slide-image-mobile-'+i+'" value="'+esc(imgMobile)+'">'
        +'<div style="margin-bottom:6px"><label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" class="slide-show-image" '+(si?' checked':'')+'> نمایش تصویر</label></div>'
        +'<div class="slide-advanced" style="margin-bottom:6px;'+advCss+'"><label class="adm-field__label">موقعیت تصویر</label><select class="input slide-image-position" style="width:100%"><option value="center"'+(s.image_position==='center'?' selected':'')+'>وسط</option><option value="left"'+(s.image_position==='left'?' selected':'')+'>چپ</option><option value="right"'+(s.image_position==='right'?' selected':'')+'>راست</option></select></div>'
        +'<div class="slide-advanced" style="margin-bottom:6px;'+advCss+'"><label class="adm-field__label">اندازه تصویر</label><select class="input slide-image-size" style="width:100%"><option value="small"'+(isz==='small'?' selected':'')+'>کوچک</option><option value="medium"'+(isz==='medium'?' selected':'')+'>متوسط</option><option value="large"'+(isz==='large'?' selected':'')+'>بزرگ</option></select></div>'
        +'<div class="slide-advanced" style="margin-bottom:6px;'+advCss+'"><label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" class="slide-show-mobile" '+(on(s.show_mobile)?' checked':'')+'> نمایش در موبایل</label></div>'
        +'<div class="slide-advanced" style="margin-bottom:6px;border:1px solid var(--border-color-light);border-radius:var(--radius-md);padding:8px;'+advCss+'"><label class="adm-field__label">رنگ پس‌زمینه اسلاید</label>'
        +'<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="color" class="slide-bg-color" value="'+esc(normHex(s.background_color)||'#1a1a1a')+'" style="width:40px;height:28px;padding:0;border:1px solid var(--border-color-light);border-radius:var(--radius-sm)"><input class="input slide-bg-color-text" type="text" value="'+esc(s.background_color||'')+'" dir="ltr" placeholder="خالی = رنگ پیش‌فرض اسلاید" style="flex:1"></div>'
        +'<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="color" class="slide-bg-color2" value="'+esc(normHex(s.background_gradient_second)||'#2a2a2a')+'" style="width:40px;height:28px;padding:0;border:1px solid var(--border-color-light);border-radius:var(--radius-sm)"><input class="input slide-bg-color2-text" type="text" value="'+esc(s.background_gradient_second||'')+'" dir="ltr" placeholder="رنگ دوم گرادیان (اختیاری)" style="flex:1"></div>'
        +'<div style="display:flex;gap:8px;align-items:center"><label class="adm-field__label" style="margin:0">زاویه گرادیان</label><input class="input slide-bg-angle" type="text" value="'+esc(s.background_gradient_angle||'135deg')+'" dir="ltr" placeholder="135deg" style="width:110px"></div>'
        +'</div>'
        +'<div class="slide-full-only" style="margin-bottom:6px;'+(isFull?'':'display:none')+'"><label class="adm-field__label">لینک مقصد کل تصویر</label><input class="input slide-link-url" type="text" value="'+esc(s.link_url||'')+'" dir="ltr" placeholder="shop.html یا https://..."></div>'
        +'<div class="slide-content-only" style="'+(isFull?'display:none':'')+'">'
        +'<div class="slide-advanced" style="margin-bottom:6px;'+advCss+'"><label class="adm-field__label">موقعیت محتوا</label><select class="input slide-content-position" style="width:100%"><option value="right"'+(cp==='right'?' selected':'')+'>راست</option><option value="center"'+(cp==='center'?' selected':'')+'>وسط</option><option value="left"'+(cp==='left'?' selected':'')+'>چپ</option></select></div>'
        +'<div style="margin-bottom:6px"><label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" class="slide-show-badge" '+(sbg?' checked':'')+'> نمایش نشان (Badge)</label></div>'
        +'<div class="slide-badge-fields" style="'+(sbg?'':'display:none')+'">'
        +'<div style="margin-bottom:6px"><label class="adm-field__label">متن نشان</label><input class="input slide-badge" type="text" value="'+esc(s.badge)+'"></div>'
        +'<div class="slide-advanced" style="margin-bottom:6px;'+advCss+'"><label class="adm-field__label">آیکون نشان</label><select class="input slide-badge-icon" style="width:100%"><option value=""'+(bi===''?' selected':'')+'>پیش‌فرض (بر اساس اسلاید)</option><option value="bolt"'+(bi==='bolt'?' selected':'')+'>رعد و برق</option><option value="star"'+(bi==='star'?' selected':'')+'>ستاره</option><option value="info"'+(bi==='info'?' selected':'')+'>اطلاعات</option><option value="shield"'+(bi==='shield'?' selected':'')+'>سپر</option><option value="none"'+(bi==='none'?' selected':'')+'>بدون آیکون</option></select></div>'
        +'</div>'
        +'<div style="margin-bottom:6px"><label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" class="slide-show-title" '+(sti?' checked':'')+'> نمایش عنوان</label></div>'
        +'<div class="slide-title-fields" style="'+(sti?'':'display:none')+'"><div style="margin-bottom:6px"><label class="adm-field__label">عنوان</label><input class="input slide-title" type="text" value="'+esc(s.title)+'"></div></div>'
        +'<div style="margin-bottom:6px"><label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" class="slide-show-text" '+(stx?' checked':'')+'> نمایش توضیحات</label></div>'
        +'<div class="slide-text-fields" style="'+(stx?'':'display:none')+'"><div style="margin-bottom:6px"><label class="adm-field__label">متن</label><textarea class="input slide-text" rows="2">'+esc(s.text)+'</textarea></div></div>'
        +'</div>'
        +'</div>'
        +'<div style="flex:1;min-width:220px" class="slide-content-only" '+(isFull?'style="display:none"':'')+'>'
        +'<div style="margin-bottom:6px"><label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" class="slide-show-btn1" '+(sb1?' checked':'')+'> نمایش دکمه ۱</label></div>'
        +'<div class="slide-btn1-fields" style="'+(sb1?'':'display:none')+'">'
        +'<div style="margin-bottom:6px"><label class="adm-field__label">دکمه ۱ — متن</label><input class="input slide-btn1-text" type="text" value="'+esc(s.btn1_text)+'"></div>'
        +'<div style="margin-bottom:6px"><label class="adm-field__label">دکمه ۱ — لینک</label><input class="input slide-btn1-url" type="text" value="'+esc(s.btn1_url)+'" dir="ltr" placeholder="#bestsellers"></div>'
        +'</div>'
        +'<div class="slide-advanced" style="margin-bottom:6px;'+advCss+'"><label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" class="slide-show-btn2" '+(sb2?' checked':'')+'> نمایش دکمه ۲</label></div>'
        +'<div class="slide-btn2-fields slide-advanced" style="'+(sb2?'':'display:none')+'">'
        +'<div style="margin-bottom:6px"><label class="adm-field__label">دکمه ۲ — متن</label><input class="input slide-btn2-text" type="text" value="'+esc(s.btn2_text)+'"></div>'
        +'<div style="margin-bottom:6px"><label class="adm-field__label">دکمه ۲ — لینک</label><input class="input slide-btn2-url" type="text" value="'+esc(s.btn2_url)+'" dir="ltr"></div>'
        +'</div>'
        +'<label style="display:flex;align-items:center;gap:6px;font-size:13px;margin-top:8px"><input type="checkbox" class="slide-active" '+(s.is_active!==0?' checked':'')+'> فعال</label>'
        +'</div>'
        +(isFull?'<div style="flex:1;min-width:220px"><label style="display:flex;align-items:center;gap:6px;font-size:13px;margin-top:8px"><input type="checkbox" class="slide-active" '+(s.is_active!==0?' checked':'')+'> فعال</label></div>':'')
        +'</div>'
        +'</div>'
        +'</div>';
    }
    list.innerHTML=html;
  }

  function collect(){
    var rows=list.querySelectorAll('[data-slide-row]');
    var out=[];
    rows.forEach(function(row){
      var imgDesktopEl=row.querySelector('#slide-image-desktop-'+Array.prototype.indexOf.call(rows,row));
      var imgMobileEl=row.querySelector('#slide-image-mobile-'+Array.prototype.indexOf.call(rows,row));
      var imgDesktop=imgDesktopEl?imgDesktopEl.value.trim():'';
      var imgMobile=imgMobileEl?imgMobileEl.value.trim():'';
      var ipEl=row.querySelector('.slide-image-position'); var ip=ipEl?ipEl.value:'center';
      var iszEl=row.querySelector('.slide-image-size'); var isz=iszEl?iszEl.value:'medium';
      var siEl=row.querySelector('.slide-show-image'); var si=siEl&&siEl.checked?1:0;
      var typeEl=row.querySelector('.slide-type'); var st=(typeEl&&typeEl.value==='full')?'full':'content';
      var luEl=row.querySelector('.slide-link-url'); var lu=luEl?luEl.value.trim():'';
      var cpEl=row.querySelector('.slide-content-position'); var cp=cpEl?cpEl.value:'right';
      function v(sel){ var el=row.querySelector(sel); return el?el.value.trim():''; }
      function c(sel){ var el=row.querySelector(sel); return el&&el.checked?1:0; }
      var sbg=c('.slide-show-badge'), sti=c('.slide-show-title'), stx=c('.slide-show-text'), sb1=c('.slide-show-btn1'), sb2=c('.slide-show-btn2');
      var badge=v('.slide-badge'), title=v('.slide-title'), b1t=v('.slide-btn1-text'), b1u=v('.slide-btn1-url'), b2t=v('.slide-btn2-text'), b2u=v('.slide-btn2-url');
      var textEl=row.querySelector('.slide-text'); var text=textEl?textEl.value.trim():'';
      var biEl=row.querySelector('.slide-badge-icon'); var bi=biEl?biEl.value:'';
      var actEl=row.querySelector('.slide-active'); var active=actEl&&actEl.checked?1:0;
      var showMobileEl=row.querySelector('.slide-show-mobile'); var showMobile=showMobileEl&&showMobileEl.checked?1:0;
      var idAttr=row.getAttribute('data-slide-row');
      var idx=Array.prototype.indexOf.call(rows,row);
      var mem=slides[idx]||{};
      if(st==='full'){ badge=mem.badge||badge; title=mem.title||title; text=mem.text||text; b1t=mem.btn1_text||b1t; b1u=mem.btn1_url||b1u; b2t=mem.btn2_text||b2t; b2u=mem.btn2_url||b2u; bi=mem.badge_icon||bi; sbg=mem.show_badge!==undefined?mem.show_badge:sbg; sti=mem.show_title!==undefined?mem.show_title:sti; stx=mem.show_text!==undefined?mem.show_text:stx; sb1=mem.show_btn1!==undefined?mem.show_btn1:sb1; sb2=mem.show_btn2!==undefined?mem.show_btn2:sb2; cp=mem.content_position||cp; }
      else { lu=(mem.link_url||lu||''); }
      var bg1El=row.querySelector('.slide-bg-color-text'); var bg1=bg1El?bg1El.value.trim():'';
      var bg2El=row.querySelector('.slide-bg-color2-text'); var bg2=bg2El?bg2El.value.trim():'';
      var bgAEl=row.querySelector('.slide-bg-angle'); var bgA=bgAEl?bgAEl.value.trim():'135deg';
      var mem2=slides[idx]||{};
      if(!bg1 && mem2.background_color){ var cp1=row.querySelector('.slide-bg-color'); if(cp1 && cp1.value && bg1El && !bg1El.value) bg1=''; }
      var slide={image:imgDesktop,image_desktop:imgDesktop,image_mobile:imgMobile,image_position:ip,image_size:isz,show_image:si,slide_type:st,link_url:lu,content_position:cp,show_badge:sbg,badge_icon:bi,show_title:sti,show_text:stx,show_btn1:sb1,show_btn2:sb2,badge:badge,title:title,text:text,btn1_text:b1t,btn1_url:b1u,btn2_text:b2t,btn2_url:b2u,is_active:active,show_mobile:showMobile,background_color:bg1,background_gradient_second:bg2,background_gradient_angle:bgA||'135deg'};
      if(idAttr && idAttr.indexOf('new_')!==0) slide.id=parseInt(idAttr,10);
      if(mem){ Object.keys(slide).forEach(function(k){ mem[k]=slide[k]; }); if(slide.id) mem.id=slide.id; }
      out.push(slide);
    });
    return out;
  }

  function save(){
    var payload={slides:collect()};
    var h={'Content-Type':'application/json'}; var t=tok(); if(t) h['Authorization']='Bearer '+t;
    fetch('/api/admin/hero-slides',{method:'PUT',headers:h,body:JSON.stringify(payload)}).then(function(r){
      if(!r.ok) throw new Error('save failed');
      return r.json();
    }).then(function(data){
      slides=data||[];
      render();
      toast('اسلایدهای هیرو ذخیره شد','success');
    }).catch(function(){ toast('خطا در ذخیره اسلایدها','danger'); });
  }

  list.addEventListener('change',function(e){
    if(e.target.classList.contains('slide-bg-color')){ var r0=e.target.closest('[data-slide-row]'); if(r0){ var t0=r0.querySelector('.slide-bg-color-text'); if(t0) t0.value=e.target.value; } }
    if(e.target.classList.contains('slide-bg-color2')){ var r0b=e.target.closest('[data-slide-row]'); if(r0b){ var t0b=r0b.querySelector('.slide-bg-color2-text'); if(t0b) t0b.value=e.target.value; } }
    if(e.target.classList.contains('slide-type')){
      collect();
      render();
    }
    if(e.target.classList.contains('slide-image-desktop')){
      var r=e.target.closest('[data-slide-row]');
      if(r){ var h=r.querySelector('#slide-image-desktop-'+Array.prototype.indexOf.call(list.querySelectorAll('[data-slide-row]'), r)); if(h){ h.value=e.target.value; var pv=r.querySelector('.slide-preview-desktop'); var val=e.target.value.trim(); if(pv) pv.src=val?(val.startsWith('/')||val.startsWith('http')?val:'../'+val):''; } }
    }
    if(e.target.classList.contains('slide-image-mobile')){
      var r=e.target.closest('[data-slide-row]');
      if(r){ var h=r.querySelector('#slide-image-mobile-'+Array.prototype.indexOf.call(list.querySelectorAll('[data-slide-row]'), r)); if(h){ h.value=e.target.value; var pv=r.querySelector('.slide-preview-mobile'); var val=e.target.value.trim(); if(pv) pv.src=val?(val.startsWith('/')||val.startsWith('http')?val:'../'+val):''; } }
    }
    if(e.target.classList.contains('slide-show-badge')||e.target.classList.contains('slide-show-title')||e.target.classList.contains('slide-show-text')||e.target.classList.contains('slide-show-btn1')||e.target.classList.contains('slide-show-btn2')){
      var row=e.target.closest('[data-slide-row]');
      if(row){
        var map={'slide-show-badge':'slide-badge-fields','slide-show-title':'slide-title-fields','slide-show-text':'slide-text-fields','slide-show-btn1':'slide-btn1-fields','slide-show-btn2':'slide-btn2-fields'};
        var cls=map[e.target.className];
        if(cls){ var f=row.querySelector('.'+cls); if(f) f.style.display=e.target.checked?'':'none'; }
      }
    }
  });

  list.addEventListener('click',function(e){
    /* Reorder/delete buttons live inside the clickable header: handle first. */
    var up=e.target.closest('[data-slide-up]');
    var down=e.target.closest('[data-slide-down]');
    var del=e.target.closest('[data-slide-delete]');
    if(up){
      collect();
      if(expandedId&&String(expandedId).indexOf('new_')===0) expandedId=null;
      var ui=parseInt(up.getAttribute('data-slide-up'),10);
      if(ui>0){ var tmp=slides[ui-1]; slides[ui-1]=slides[ui]; slides[ui]=tmp; render(); }
      return;
    }
    if(down){
      collect();
      if(expandedId&&String(expandedId).indexOf('new_')===0) expandedId=null;
      var di=parseInt(down.getAttribute('data-slide-down'),10);
      if(di<slides.length-1){ var tmp2=slides[di+1]; slides[di+1]=slides[di]; slides[di]=tmp2; render(); }
      return;
    }
    if(del){
      collect();
      var dxi=parseInt(del.getAttribute('data-slide-delete'),10);
      var delRow=del.closest('[data-slide-row]');
      if(delRow&&delRow.getAttribute('data-slide-row')===expandedId) expandedId=null;
      if(expandedId&&String(expandedId).indexOf('new_')===0) expandedId=null;
      slides.splice(dxi,1);
      render();
      return;
    }
    /* Accordion: clicking a card header expands it and collapses the rest;
       clicking the open card collapses it. No re-render, so typed input
       is never lost. */
    var tgl=e.target.closest('[data-slide-toggle]');
    if(tgl){
      var trow=tgl.closest('[data-slide-row]');
      if(trow){
        var tid=trow.getAttribute('data-slide-row');
        expandedId=(expandedId===tid)?null:tid;
        var rows=list.querySelectorAll('[data-slide-row]');
        rows.forEach(function(r){
          var openRow=(r.getAttribute('data-slide-row')===expandedId);
          var body=r.querySelector('.slide-body');
          if(body) body.style.display=openRow?'':'none';
          var chev=r.querySelector('.slide-chev');
          if(chev) chev.textContent=openRow?'\u25B4':'\u25BE';
        });
      }
      return;
    }
  });

  list.addEventListener('input',function(e){
    if(e.target.classList.contains('slide-image-target')){
      var row=e.target.closest('[data-slide-row]');
      if(row){
        var idx=Array.prototype.indexOf.call(list.querySelectorAll('[data-slide-row]'), row);
        var prevDesktop=row.querySelector('.slide-preview-desktop');
        var prevMobile=row.querySelector('.slide-preview-mobile');
        var val=e.target.value.trim();
        if(e.target.id && e.target.id.indexOf('slide-image-desktop-')===0 && prevDesktop) prevDesktop.src=val?(val.startsWith('/')||val.startsWith('http')?val:'../'+val):'';
        if(e.target.id && e.target.id.indexOf('slide-image-mobile-')===0 && prevMobile) prevMobile.src=val?(val.startsWith('/')||val.startsWith('http')?val:'../'+val):'';
        var txtDesktop=row.querySelector('.slide-image-desktop'); if(txtDesktop && txtDesktop.value!==e.target.value) txtDesktop.value=e.target.value;
        var txtMobile=row.querySelector('.slide-image-mobile'); if(txtMobile && txtMobile.value!==e.target.value) txtMobile.value=e.target.value;
      }
    }
    if(e.target.classList.contains('slide-image-desktop')){
      var row2=e.target.closest('[data-slide-row]');
      if(row2){ var hid=row2.querySelector('#slide-image-desktop-'+Array.prototype.indexOf.call(list.querySelectorAll('[data-slide-row]'), row2)); if(hid) hid.value=e.target.value; var pv2=row2.querySelector('.slide-preview-desktop'); var v2=e.target.value.trim(); if(pv2) pv2.src=v2?(v2.startsWith('/')||v2.startsWith('http')?v2:'../'+v2):''; }
    }
    if(e.target.classList.contains('slide-image-mobile')){
      var row2=e.target.closest('[data-slide-row]');
      if(row2){ var hid=row2.querySelector('#slide-image-mobile-'+Array.prototype.indexOf.call(list.querySelectorAll('[data-slide-row]'), row2)); if(hid) hid.value=e.target.value; var pv2=row2.querySelector('.slide-preview-mobile'); var v2=e.target.value.trim(); if(pv2) pv2.src=v2?(v2.startsWith('/')||v2.startsWith('http')?v2:'../'+v2):''; }
    }
  });

  if(addBtn){
    addBtn.addEventListener('click',function(){
      collect();
      slides.push({image:'',image_desktop:'',image_mobile:'',image_position:'center',image_size:'medium',show_image:1,slide_type:'content',link_url:'',content_position:'right',show_badge:1,badge_icon:'',show_title:1,show_text:1,show_btn1:1,show_btn2:1,badge:'',title:'',text:'',btn1_text:'',btn1_url:'',btn2_text:'',btn2_url:'',is_active:1,show_mobile:1,background_color:'',background_gradient_second:'',background_gradient_angle:'135deg'});
      expandedId='new_'+(slides.length-1);
      render();
    });
  }

  var contentForm=document.getElementById('adm-content-form');
  var saveBtn=contentForm?contentForm.querySelector('button[type="submit"]'):null;
  if(saveBtn){
    saveBtn.addEventListener('click',function(e){
      e.preventDefault();
      save();
    });
  }

  function loadError(){
    list.innerHTML='<p style="font-size:13px;color:var(--color-danger, #d33)">خطا در بارگذاری اسلایدها. لطفاً صفحه را تازه‌سازی کنید.</p>';
  }

  function handlePayload(data){
    var arr=Array.isArray(data)?data:(data&&Array.isArray(data.slides)?data.slides:[]);
    slides=arr;
    render();
  }

  function initialLoad(retryLeft){
    // no-store: the API emits cache validators (304s observed); a bare
    // revalidation response must never be parsed as slide data.
    fetch('/api/admin/hero-slides',{cache:'no-store'}).then(function(r){
      if(!r.ok) throw new Error('bad status '+r.status);
      return r.json();
    }).then(handlePayload).catch(function(){
      if(retryLeft>0){ setTimeout(function(){ initialLoad(retryLeft-1); },800); return; }
      // Distinguish total failure from "no slides" so the section never
      // sits on the loading placeholder forever.
      if(!slides.length && !list.querySelector('[data-slide-row]')) loadError();
      else render();
    });
  }
  initialLoad(1);

  window.CamzyHeroSlides={ reload: function(){ fetch('/api/admin/hero-slides').then(function(r){ return r.json(); }).then(function(data){ slides=Array.isArray(data)?data:[]; render(); }).catch(function(){}); } };
})();
