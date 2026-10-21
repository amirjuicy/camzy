/* Site Content — applies CMS values from /api/content + /api/settings to DOM.
   Hero slides are rendered dynamically from /api/hero-slides.
   Fails silently (keeps hardcoded fallback) when API is unreachable. */
(function(){
  'use strict';
  if(location.protocol==='file:') return;
  var __heroBox=document.querySelector('.hero__slides');
  /* Never wipe baked hero slides for a loading placeholder: pages ship
     with real pre-rendered slides, and replacing them with "loading…"
     guarantees a visible flash on every homepage refresh. Only mark the
     loading state when the container is actually empty; keep baked slides
     (and dots) until the live API response arrives. */
  var __heroHadBaked=!!(__heroBox && __heroBox.querySelector('.hero__slide'));
  if(__heroBox && !__heroHadBaked){ __heroBox.setAttribute('data-hero-loading','1'); __heroBox.innerHTML='<div class="hero__loading" style="padding:48px;text-align:center">'+'در حال بارگذاری…'+'</div>'; }
  var __heroRenderGen=0;
  var __heroDots=document.querySelector('.hero__dots');
  var __dotsHadBaked=!!(__heroDots && __heroDots.querySelector('.hero__dot'));
  if(__heroDots && !__dotsHadBaked){ __heroDots.innerHTML=''; }
  function isMobileViewport(){ return window.innerWidth <= 767; }
  function renderHeroSlides(slides){
    var myGen=++__heroRenderGen;
    var container=document.querySelector('.hero__slides');
    if(!container) return;
    /* A failed/empty API response must keep the baked fallback instead of
       blanking the hero into an incorrect empty state. */
    if(!slides || !slides.length){
      var __c=document.querySelector('.hero__slides');
      if(__c && !__c.querySelector('.hero__slide')){ __c.innerHTML=''; __c.removeAttribute('data-hero-loading'); }
      else if(__c){ __c.removeAttribute('data-hero-loading'); }
      var __d=document.querySelector('.hero__dots');
      if(__d && !__d.querySelector('.hero__dot')){ __d.innerHTML=''; }
      return;
    }
    /* Preserve the currently visible index across re-renders (e.g. resize)
       so a mid-cycle re-render never flashes slide 1 over another slide. */
    var keepIdx=0;
    try{
      var __cur=container.querySelector('.hero__slide.is-active');
      if(__cur){ var __k=parseInt(__cur.getAttribute('data-slide'),10); if(!isNaN(__k)&&__k>=0) keepIdx=__k; }
    }catch(e){}
    var isMobile=isMobileViewport();
    var gradients=[
      'linear-gradient(135deg,#171717 0%,#1F1F1F 50%,#2A2A2A 100%)',
      'linear-gradient(135deg,#D71920 0%,#E34A50 50%,#D71920 100%)',
      'linear-gradient(135deg,#1F1F1F 0%,#2A2A2A 50%,#171717 100%)',
      'linear-gradient(135deg,#D71920 0%,#A61218 50%,#D71920 100%)'
    ];
    var badgeIcons=[
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 0 1 9 9c0 .5-.5 1-1 1H4c-.5 0-1-.5-1-1a9 9 0 0 1 9-9z"/><circle cx="12" cy="13" r="3"/><path d="M12 16v3"/><path d="M9 21h6"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
    ];
    var badgeIconByKey={
      bolt:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 0 1 9 9c0 .5-.5 1-1 1H4c-.5 0-1-.5-1-1a9 9 0 0 1 9-9z"/><circle cx="12" cy="13" r="3"/><path d="M12 16v3"/><path d="M9 21h6"/></svg>',
      star:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
      info:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      shield:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
    };
    function heroBg(s, fallback){
      try{
        var c1=String(s.background_color||'').trim();
        if(!c1) return fallback;
        var c2=String(s.background_gradient_second||'').trim();
        if(!c2) return c1;
        var ang=String(s.background_gradient_angle||'135deg').trim()||'135deg';
        return 'linear-gradient('+ang+','+c1+' 0%,'+c1+' 50%,'+c2+' 100%)';
      }catch(e){ return fallback; }
    }
    var imageSizes={small:180,medium:280,large:420};
    var arrowIcon='<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
    var html='';
    var visible=[];
    for(var i=0;i<slides.length;i++){
      var s=slides[i];
      if(isMobile && (s.show_mobile===false||s.show_mobile===0)) continue;
      var st0=(s.slide_type==='full')?'full':'content';
      if(st0==='full'){ if(!String(s.image_desktop||s.image||'').trim()&&!String(s.link_url||'').trim()) continue; visible.push(s); continue; }
      if(!String(s.image_desktop||s.image||'').trim()&&!String(s.badge||'').trim()&&!String(s.title||'').trim()&&!String(s.text||'').trim()&&!String(s.btn1_text||'').trim()&&!String(s.btn1_url||'').trim()&&!String(s.btn2_text||'').trim()&&!String(s.btn2_url||'').trim()) continue;
      visible.push(s);
    }
    slides=visible;
    if(!slides.length) return;
    if(myGen!==__heroRenderGen) return; /* a newer render superseded this one */
    if(keepIdx>=slides.length) keepIdx=0;
    for(var i=0;i<slides.length;i++){
      var s=slides[i];
      var bg=heroBg(s, gradients[i%gradients.length]);
      var pos=s.image_position||'center';
      var leftPos=pos==='left'?'25%':pos==='right'?'75%':'50%';
      var imgDesktop=s.image_desktop||s.image||'';
      var imgMobile=s.image_mobile||'';
      var imgSrcDesktop=(imgDesktop.startsWith('/')||imgDesktop.startsWith('http'))?imgDesktop:imgDesktop;
      var imgSrcMobile=(imgMobile.startsWith('/')||imgMobile.startsWith('http'))?imgMobile:imgMobile;
      var st=(s.slide_type==='full')?'full':'content';
      var linkUrl=String(s.link_url||'').trim();
      var showImage=s.show_image!==false&&s.show_image!==0;
      var showBadge=s.show_badge!==false&&s.show_badge!==0;
      var showTitle=s.show_title!==false&&s.show_title!==0;
      var showText=s.show_text!==false&&s.show_text!==0;
      var showBtn1=s.show_btn1!==false&&s.show_btn1!==0;
      var showBtn2=s.show_btn2!==false&&s.show_btn2!==0;
      var cp=s.content_position||'right';
      var isz=s.image_size||'medium';
      var bi=s.badge_icon||'';
      var iconHtml='';
      if(bi==='none'){ iconHtml=''; }
      else if(badgeIconByKey[bi]){ iconHtml=badgeIconByKey[bi]; }
      else{ iconHtml=badgeIcons[i%badgeIcons.length]; }
      var imgSize=imageSizes[isz]||280;
      function escA(v){ return String(v==null?'':v).replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/"/g,'"'); }
      function buildPictureSrcSet(desktopSrc, mobileSrc, alt, eager){
        var desktopEsc=escA(desktopSrc);
        var mobileEsc=escA(mobileSrc);
        var altEsc=escA(alt);
        var loading=eager?'eager':'lazy';
        if(mobileEsc){
          return '<picture>'
            +'<source media="(max-width: 767px)" srcset="'+mobileEsc+'">'
            +'<img src="'+desktopEsc+'" alt="'+altEsc+'" loading="'+loading+'">'
            +'</picture>';
        }
        return '<img src="'+desktopEsc+'" alt="'+altEsc+'" loading="'+loading+'">';
      }
      if(st==='full'){
        var alt=escA(s.title||'بنر');
        var href=escA(linkUrl||'#');
        var pictureHtml=buildPictureSrcSet(imgSrcDesktop, imgSrcMobile, s.title||'بنر', i===keepIdx);
        html+='<div class="hero__slide hero__slide--full'+(i===keepIdx?' is-active':'')+'" data-slide="'+i+'">'
        +'<div class="hero__slide-bg" style="background:'+bg+'"></div>'
        +'<a class="hero__full-link" href="'+href+'" aria-label="'+alt+'">'
        +pictureHtml
        +'</a></div>';
        continue;
      }
      html+='<div class="hero__slide hero__slide--pos-'+cp+'"'+(i===keepIdx?' is-active':'')+' data-slide="'+i+'">'
        +'<div class="hero__slide-bg" style="background:'+bg+'"></div>';
      if(showImage&&imgDesktop){
        var pictureHtml=buildPictureSrcSet(imgSrcDesktop, imgSrcMobile, s.title||'', i===keepIdx);
        html+='<div class="hero__slide-image" style="left:'+leftPos+';right:auto;transform:translate(-50%,-50%);width:'+imgSize+'px;height:'+imgSize+'px">'
        +pictureHtml+'</div>';
      }
      html+='<div class="container"><div class="hero__slide-content">';
      if(showBadge&&String(s.badge||'').trim()) html+='<span class="hero__badge">'+iconHtml+' '+s.badge+'</span>';
      if(showTitle&&String(s.title||'').trim()) html+='<h1 class="hero__title">'+s.title+'</h1>';
      if(showText&&String(s.text||'').trim()) html+='<p class="hero__text">'+s.text+'</p>';
      if((showBtn1&&(s.btn1_text||s.btn1_url))||(showBtn2&&(s.btn2_text||s.btn2_url))){
        html+='<div class="hero__actions">';
        if(showBtn1&&(s.btn1_text||s.btn1_url)){
          html+='<a href="'+escA(s.btn1_url||'#')+'" class="btn btn-primary btn-lg">'+s.btn1_text+' '+arrowIcon+'</a>';
        }
        if(showBtn2&&(s.btn2_text||s.btn2_url)){
          html+='<a href="'+escA(s.btn2_url||'#')+'" class="btn btn-secondary btn-lg" style="background:rgba(255,255,255,0.15);border-color:rgba(255,255,255,0.3);color:white">'+s.btn2_text+'</a>';
        }
        html+='</div>';
      }
      html+='</div></div></div>';
    }
    container.innerHTML=html;
    // Rebuild dots
    var dotsContainer=document.querySelector('.hero__dots');
    if(dotsContainer){
      var dotsHtml='';
      for(var d=0;d<slides.length;d++){
        dotsHtml+='<button class="hero__dot'+(d===keepIdx?' is-active':'')+'" role="tab" aria-selected="'+(d===keepIdx?'true':'false')+'" aria-label="اسلاید '+(d+1)+'" type="button" data-dot="'+d+'"></button>';
      }
      dotsContainer.innerHTML=dotsHtml;
    container.removeAttribute('data-hero-loading');
    try{ document.dispatchEvent(new CustomEvent('hero:updated')); }catch(e){ try{ document.dispatchEvent(document.createEvent('Event')); }catch(_){} }
    }
    // Re-render on viewport change (debounced)
    if(!window.__heroResizeHandler){
      var debounceTimer;
      window.__heroResizeHandler=function(){
        clearTimeout(debounceTimer);
        debounceTimer=setTimeout(function(){
          var wasMobile=container.dataset.mobile==='true';
          var nowMobile=isMobileViewport();
          if(wasMobile!==nowMobile){
            container.dataset.mobile=nowMobile?'true':'false';
            // Re-fetch and re-render
            fetch('/api/hero-slides?v='+Date.now(), {cache:'no-store'}).then(function(r){ return r.ok? r.json(): null; }).catch(function(){ return null; }).then(function(slides){
              if(slides) renderHeroSlides(slides);
            });
          }
        }, 200);
      };
      window.addEventListener('resize', window.__heroResizeHandler);
    }
    container.dataset.mobile=isMobile?'true':'false';
  }
  function applyContent(c){
    if(!c) return;
    /* Promo top bar — DYNAMIC message count (promo.topbar.count). Legacy data
       with no count key falls back to the highest non-empty slot (3 by default).
       Skips Visual-Builder-saved page headers ([data-pb-page-header]), whose
       spans are owned by the per-page saved markup.
       Applied PER BAR: the desktop and mobile headers each ship their own
       .promo-topbar with its own viewport. Aggregating both bars' messages into
       one flat list and resizing against a single bar's viewport made
       removeChild() target nodes owned by the OTHER bar (NotFoundError, which
       aborted the whole applyContent run) and shifted the second bar onto the
       wrong slot indexes. */
    var rawCount=c['promo.topbar.count'];
    var count=(rawCount!=null&&String(rawCount).trim()!=='')?parseInt(rawCount,10):NaN;
    if(!isFinite(count)||count<0){
      count=0;
      for(var i=1;i<=20;i++){
        var t=c['promo.topbar.'+i], im=c['promo.topbar.'+i+'.image'];
        if((t!=null&&String(t)!=='')||(im!=null&&String(im)!=='')) count=i;
      }
      if(!count) count=3;
    }
    count=Math.max(1,Math.min(count,20));
    try{ Array.prototype.forEach.call(document.querySelectorAll('.promo-topbar'),function(bar){
      if(bar.closest&&bar.closest('[data-pb-page-header]')) return;
      var vp=bar.querySelector('.promo-topbar__viewport'); if(!vp) return;
      var promos=vp.querySelectorAll('.promo-topbar__msg');
      while(promos.length>count){
        var last=promos[promos.length-1];
        if(last&&last.parentNode===vp) vp.removeChild(last); else break;
        promos=vp.querySelectorAll('.promo-topbar__msg');
      }
      while(promos.length<count){
        var span=document.createElement('span'); span.className='promo-topbar__msg';
        var imEl=document.createElement('img'); imEl.className='promo-topbar__img'; imEl.setAttribute('src',''); imEl.setAttribute('alt',''); imEl.style.display='none';
        var txEl=document.createElement('span'); txEl.className='promo-topbar__text';
        span.appendChild(imEl); span.appendChild(txEl);
        vp.appendChild(span); promos=vp.querySelectorAll('.promo-topbar__msg');
      }
      for(var j=0;j<promos.length;j++){
        var msg=promos[j]; if(!msg) continue;
        msg.classList.toggle('is-active', j===0);
        // Messages may contain an optional banner image + text span (common.js
        // header markup). Update those in place — never replace with plain
        // textContent, which would drop the image element.
        var imgEl=msg.querySelector?msg.querySelector('.promo-topbar__img'):null;
        var textEl=msg.querySelector?msg.querySelector('.promo-topbar__text'):null;
        var imgUrl=c['promo.topbar.'+(j+1)+'.image']||'';
        if(imgEl){ if(imgUrl){ imgEl.src=imgUrl; imgEl.style.display=''; msg.classList.add('has-image'); } else { imgEl.removeAttribute('src'); imgEl.style.display='none'; msg.classList.remove('has-image'); } }
        if(textEl){ if(c['promo.topbar.'+(j+1)]!=null) textEl.textContent=c['promo.topbar.'+(j+1)]; }
        else if(!imgEl && c['promo.topbar.'+(j+1)]!=null) msg.textContent=c['promo.topbar.'+(j+1)];
      }
    }); }catch(e){}
    // Footer brand desc
    if(c['footer.brand.desc']!=null){
      var fd=document.querySelector('.footer-brand__desc');
      if(fd) fd.textContent=c['footer.brand.desc'];
    }
    if(c['footer.address']!=null){
      var addrLinks=document.querySelectorAll('.footer-link');
      for(var k=0;k<addrLinks.length;k++){
        if(addrLinks[k].textContent.indexOf('ولیعصر')!==-1 || addrLinks[k].textContent.indexOf('تهران')!==-1){
          var icon=addrLinks[k].querySelector('svg');
          if(icon) addrLinks[k].innerHTML=icon.outerHTML+' '+c['footer.address'];
          break;
        }
      }
    }
  }
  /* Normalize Persian/Arabic-Indic digits so tel: links are valid dial strings. */
  function __telHref(phone){
    var raw = String(phone == null ? '' : phone);
    var fa = '۰۱۲۳۴۵۶۷۸۹', ar = '٠١٢٣٤٥٦٧٨٩', out = '';
    for (var i = 0; i < raw.length; i++) {
      var ch = raw[i], fp = fa.indexOf(ch), ap = ar.indexOf(ch);
      if (fp > -1) out += String(fp);
      else if (ap > -1) out += String(ap);
      else if (ch === '+' || /[0-9]/.test(ch)) out += ch;
    }
    return 'tel:' + out;
  }
  /* Contact map card → centralized store settings. The canonical location is
     latitude + longitude (store.latitude / store.longitude), NOT a Google
     Maps or Neshan URL. The preview is a real interactive map
     (OpenStreetMap tiles via Leaflet) with streets and a marker inside the
     existing card — no Google/Neshan iframe or embed anywhere. The whole
     map is clickable and opens navigation via the coordinate logic below.
     store.map_url stays only as an optional external "باز کردن در نقشه"
     link (opened on click, never loaded in-page). Coordinates come ONLY from
     store.latitude/store.longitude; a Tehran default is used when they are
     missing or invalid so the Leaflet preview always renders. */
  function __parseCoord(v){
    var s = String(v == null ? '' : v).trim();
    if(!s) return NaN;
    var fa = '۰۱۲۳۴۵۶۷۸۹', ar = '٠١٢٣٤٥٦٧٨٩', out = '';
    for(var i = 0; i < s.length; i++){
      var ch = s[i], fp = fa.indexOf(ch), ap = ar.indexOf(ch);
      if(fp > -1) out += String(fp);
      else if(ap > -1) out += String(ap);
      else out += ch;
    }
    var n = parseFloat(out);
    return (typeof n === 'number' && isFinite(n)) ? n : NaN;
  }
  function __validLatLng(lat, lng){
    return typeof lat === 'number' && typeof lng === 'number' &&
      isFinite(lat) && isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }
  var __CONTACT_DEFAULT_LAT = 35.6892, __CONTACT_DEFAULT_LNG = 51.3890;
  function __resolveCoords(latRaw, lngRaw){
    var lat = __parseCoord(latRaw), lng = __parseCoord(lngRaw);
    if(__validLatLng(lat, lng)) return { lat: lat, lng: lng, source: 'settings' };
    return { lat: __CONTACT_DEFAULT_LAT, lng: __CONTACT_DEFAULT_LNG, source: 'default-tehran' };
  }
  function __navigateUrl(lat, lng){
    // Canonical Android intent: lets Android offer installed navigation apps.
    var pair = lat + ',' + lng;
    return 'geo:' + pair + '?q=' + pair;
  }
  function __contactUa(){
    try{ return String((typeof navigator !== 'undefined' && navigator.userAgent) || ''); }catch(e){ return ''; }
  }
  function __isAndroid(ua){
    return /Android/i.test(ua == null ? __contactUa() : String(ua));
  }
  function __isIOS(ua){
    var u = ua == null ? __contactUa() : String(ua);
    if(/iPad|iPhone|iPod/i.test(u)) return true;
    try{
      if(typeof navigator !== 'undefined' &&
        navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
    }catch(e){}
    return false;
  }
  /* Canonical per-service navigation URLs, all built from the same
     store.latitude/store.longitude pair. Nothing here is fetched or
     embedded — every URL opens only after an explicit user gesture:
       Android → geo: intent (system chooser, single link),
       iOS     → in-page chooser (Apple Maps, Google Maps, Waze, Neshan, Balad),
       Web     → in-page chooser (Google Maps, Waze, Neshan, Balad). */
  function __navOptions(lat, lng){
    var pair = lat + ',' + lng;
    return [
      { id: 'google', label: 'Google Maps', href: 'https://www.google.com/maps/search/?api=1&query=' + pair },
      { id: 'waze', label: 'Waze', href: 'https://waze.com/ul?ll=' + pair + '&navigate=yes' },
      { id: 'neshan', label: 'نشان', href: 'https://neshan.org/maps/share/' + pair },
      { id: 'balad', label: 'بلد', href: 'https://balad.ir/#16/' + pair },
      { id: 'apple', label: 'Apple Maps', href: 'https://maps.apple.com/?ll=' + pair }
    ];
  }
  function __navMenuIds(isIOS){
    return isIOS ? ['apple', 'google', 'waze', 'neshan', 'balad'] : ['google', 'waze', 'neshan', 'balad'];
  }
  function __closeNavMenu(){
    try{
      var open = document.querySelector('.contact-nav-menu:not([hidden])');
      if(open) open.setAttribute('hidden', '');
    }catch(e){}
  }
  function __ensureNavMenuGlobal(){
    // Shared guard name on purpose: common.js and site-content.js must not
    // double-bind document handlers on pages that load both files.
    try{
      if(window.__contactNavMenuGlobalBound) return;
      window.__contactNavMenuGlobalBound = true;
      document.addEventListener('click', function(ev){
        try{
          var open = document.querySelector('.contact-nav-menu:not([hidden])');
          if(!open) return;
          var t = ev.target;
          if(open.contains(t)) return;
          var trig = open.__contactNavTrigger;
          if(trig && (trig === t || (trig.contains && trig.contains(t)))) return;
          open.setAttribute('hidden', '');
        }catch(e){}
      });
      document.addEventListener('keydown', function(ev){
        try{ if(ev && (ev.key === 'Escape' || ev.keyCode === 27)) __closeNavMenu(); }catch(e){}
      });
    }catch(e){}
  }
  function __toggleNavMenu(card, nav, lat, lng, isIOS){
    try{
      __ensureNavMenuGlobal();
      var menu = card.querySelector('.contact-nav-menu');
      if(!menu){
        menu = document.createElement('div');
        menu.className = 'contact-nav-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('hidden', '');
        var title = document.createElement('div');
        title.className = 'contact-nav-menu__title';
        title.textContent = 'مسیریابی با';
        menu.appendChild(title);
        card.appendChild(menu);
      }
      var olds = menu.querySelectorAll('.contact-nav-menu__item');
      for(var i = 0; i < olds.length; i++){
        try{ olds[i].parentNode.removeChild(olds[i]); }catch(e){}
      }
      var opts = __navOptions(lat, lng), ids = __navMenuIds(isIOS);
      for(var j = 0; j < ids.length; j++){
        for(var k = 0; k < opts.length; k++){
          if(opts[k].id !== ids[j]) continue;
          var a = document.createElement('a');
          a.className = 'contact-nav-menu__item';
          a.setAttribute('role', 'menuitem');
          a.setAttribute('href', opts[k].href);
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener');
          a.setAttribute('data-contact-nav-option', opts[k].id);
          a.textContent = opts[k].label;
          menu.appendChild(a);
        }
      }
      try{
        window.__contactNav = {
          lat: lat, lng: lng,
          platform: isIOS ? 'ios' : (__isAndroid() ? 'android' : 'web'),
          options: opts
        };
      }catch(e){}
      menu.__contactNavTrigger = nav;
      try{
        var head = card.querySelector('.contact-map-card__header');
        menu.style.top = ((head ? head.offsetHeight : 48) + 6) + 'px';
      }catch(e){}
      if(menu.hasAttribute('hidden')) menu.removeAttribute('hidden');
      else menu.setAttribute('hidden', '');
    }catch(e){}
  }
  function __leafletReady(){
    try{ return typeof window !== 'undefined' && !!window.L && !!window.L.map; }catch(e){ return false; }
  }
  /* OSM tile policy denies Referer-less requests ("No referer sent. Access
     denied." x-blocked flag → hard block shows over the map). This page is
     served with `Referrer-Policy: no-referrer`, so tile <img> would send no
     Referer and get flagged. Restore the browser-default policy per tile
     (element-level overrides the document policy). Map-only: Leaflet + OSM
     tiles unchanged, no Google resource added anywhere in the embedded map. */
  function __fixTileReferrer(){
    try{
      if(!window.L || !window.L.TileLayer || !window.L.TileLayer.prototype) return;
      if(window.L.TileLayer.prototype.__contactRefFixed) return;
      var __orig = window.L.TileLayer.prototype.createTile;
      if(typeof __orig !== 'function') return;
      window.L.TileLayer.prototype.createTile = function(coords, done){
        var tile = __orig.call(this, coords, done);
        try{ tile.referrerPolicy = 'strict-origin-when-cross-origin'; }catch(e){}
        try{ tile.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin'); }catch(e){}
        return tile;
      };
      window.L.TileLayer.prototype.__contactRefFixed = true;
    }catch(e){}
  }
  function __initLeafletMap(body, mapEl, lat, lng, navHref){
    // Embedded map is Leaflet + OpenStreetMap ONLY: no Google Maps script,
    // iframe, embed, or tile request happens here. Navigation opens solely
    // after a user gesture: geo: intent on Android, chooser menu otherwise.
    try{
      try{ mapEl.removeAttribute('hidden'); }catch(e){}
      try{ __fixTileReferrer(); }catch(e){}
      var prev = null;
      try{ prev = body.__contactLeaflet || null; }catch(e){}
      var key = lat + ',' + lng;
      if(prev && prev.map){
        if(prev.key === key){
          try{ prev.map.invalidateSize(); }catch(e){}
          return prev.map;
        }
        try{ prev.map.remove(); }catch(e){}
        try{ body.__contactLeaflet = null; }catch(e){}
      }
      var m = window.L.map(mapEl, { scrollWheelZoom: false }).setView([lat, lng], 15);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
      }).addTo(m);
      var __mk = window.L.marker([lat, lng]).addTo(m);
      try{ body.__contactNavCoords = { lat: lat, lng: lng }; }catch(e){}
      // Tapping the pin acts like tapping the map (Leaflet markers do not
      // bubble clicks to the map by default, so bind both explicitly).
      var __navFromMap = function(ev){
        // Stop the trusted DOM event here: otherwise it keeps bubbling to
        // the document-level menu closer below and instantly re-closes the
        // menu this tap just opened.
        try{
          var oe = ev && ev.originalEvent ? ev.originalEvent : ev;
          if(oe && oe.stopPropagation) oe.stopPropagation();
        }catch(e){}
        try{
          if(__isAndroid()){ try{ window.location.href = navHref; }catch(e){} return; }
          var c = document.getElementById('contact-map');
          var n = c ? c.querySelector('[data-contact-navigate]') : null;
          if(c && n){
            __toggleNavMenu(c, n, lat, lng, __isIOS());
            try{ c.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }catch(e){}
          }
        }catch(e){}
      };
      try{ __mk.on('click', __navFromMap); }catch(e){}
      m.on('click', __navFromMap);
      try{ body.__contactLeaflet = { map: m, key: key }; }catch(e){}
      setTimeout(function(){ try{ m.invalidateSize(); }catch(e){} }, 60);
      setTimeout(function(){ try{ m.invalidateSize(); }catch(e){} }, 400);
      try{ m.whenReady(function(){ try{ m.invalidateSize(); }catch(e){} }); }catch(e){}
      return m;
    }catch(e){ return null; }
  }
  function __renderContactMap(latRaw, lngRaw, mapUrl, storeAddress){
    var card = document.getElementById('contact-map');
    var body = document.querySelector('[data-contact-map]') || (card ? card.querySelector('.contact-map-card__body') : null);
    if(!card || !body) return;
    try{ var legacyFrame = body.querySelector('iframe'); if(legacyFrame) legacyFrame.remove(); }catch(e){}
    try{ var legacyCoords = body.querySelector('[data-contact-coords]'); if(legacyCoords) legacyCoords.remove(); }catch(e){}
    var lat = __parseCoord(latRaw), lng = __parseCoord(lngRaw);
    var hasCoords = __validLatLng(lat, lng);
    var __resolved = __resolveCoords(latRaw, lngRaw);
    lat = __resolved.lat; lng = __resolved.lng; hasCoords = true;
    try{
      window.__contactMapCoords = { lat: lat, lng: lng, source: __resolved.source };
      if(window.__storeSettings && typeof window.__storeSettings === 'object'){
        if(!__validLatLng(__parseCoord(window.__storeSettings['store.latitude']),
            __parseCoord(window.__storeSettings['store.longitude']))){
          window.__storeSettings['store.latitude'] = String(lat);
          window.__storeSettings['store.longitude'] = String(lng);
        }
      }
    }catch(e){}
    var mapLink = card.querySelector('[data-setting="store.map_url"]');
    if(!mapLink) mapLink = card.querySelector('.contact-map-card__action:not([data-contact-navigate])');
    var raw = String(mapUrl == null ? '' : mapUrl).trim();
    if(mapLink){
      if(raw && /^https?:\/\//i.test(raw)){ mapLink.setAttribute('href', raw); mapLink.style.display = ''; }
      else{ mapLink.setAttribute('href', '#'); mapLink.style.display = 'none'; }
    }
    var nav = card.querySelector('[data-contact-navigate]');
    var isAndroidNav = __isAndroid();
    var isIOSNav = !isAndroidNav && __isIOS();
    var navHref = __navigateUrl(lat, lng);
    try{ body.__contactNavCoords = { lat: lat, lng: lng }; }catch(e){}
    if(nav){
      if(isAndroidNav) nav.setAttribute('href', navHref);
      else nav.setAttribute('href', '#');
      nav.style.display = '';
      // Shared guard name on purpose (see menu global guard): pages loading
      // both common.js and site-content.js must bind this only once.
      if(!nav.__contactNavClickBound){
        nav.__contactNavClickBound = true;
        nav.addEventListener('click', function(ev){
          try{
            if(__isAndroid()) return; // real geo: href handles it
            var c = document.getElementById('contact-map');
            if(!c) return;
            var cc = null;
            try{
              var b = c.querySelector('[data-contact-map]');
              cc = (b && b.__contactNavCoords) || window.__contactMapCoords || null;
            }catch(e2){ cc = null; }
            if(!cc) return;
            try{ ev.preventDefault(); }catch(e2){}
            __toggleNavMenu(c, nav, cc.lat, cc.lng, __isIOS());
          }catch(e2){}
        });
      }
    }
    var mapEl = body.querySelector('[data-contact-leaflet]');
    var fallbackEl = body.querySelector('[data-contact-addr-fallback]');
    var caption = body.querySelector('[data-contact-map-caption]');
    var showFallback = function(){
      try{ body.classList.remove('contact-map-card__body--has-map'); }catch(e){}
      try{
        if(body.__contactLeaflet && body.__contactLeaflet.map){
          body.__contactLeaflet.map.remove();
          body.__contactLeaflet = null;
        }
      }catch(e){}
      if(mapEl) mapEl.setAttribute('hidden', '');
      if(fallbackEl) fallbackEl.removeAttribute('hidden');
      if(caption) caption.setAttribute('hidden', '');
    };
    if(!mapEl || !__leafletReady()){
      showFallback();
      return;
    }
    var map = __initLeafletMap(body, mapEl, lat, lng, navHref);
    if(!map){
      showFallback();
      return;
    }
    mapEl.removeAttribute('hidden');
    if(fallbackEl) fallbackEl.setAttribute('hidden', '');
    try{ body.classList.add('contact-map-card__body--has-map'); }catch(e){}
    if(caption){
      var addrText = String(storeAddress == null ? '' : storeAddress).trim();
      if(!addrText){
        try{
          var addrEl = caption.querySelector('[data-setting="store.address"]');
          addrText = addrEl ? String(addrEl.textContent || '').trim() : String(caption.textContent || '').trim();
        }catch(e){ addrText = ''; }
      }
      if(addrText) caption.removeAttribute('hidden');
      else caption.setAttribute('hidden', '');
    }
  }
  // Write a data-setting value without destroying a [data-store-logo] slot that
  // lives inside the same element (checkout/auth lockups). Plain textContent
  // assignment would wipe the logo markup on every apply.
  function __setSettingText(el, val){
    if(!val) return;
    var slot = el.querySelector ? el.querySelector('[data-store-logo]') : null;
    if(!slot){ el.textContent = val; return; }
    var nodes = el.querySelectorAll('*');
    for(var i=0;i<nodes.length;i++){
      var n = nodes[i];
      if(n === slot || n.contains(slot)) continue;
      if(n.children.length === 0) n.textContent = val;
    }
  }
  function applySettings(s){
    if(!s) return;
    try {
      // Centralized identity mirror (same source as common.js: Admin → اطلاعات فروشگاه).
      try { window.__storeName = s['store.name'] || window.__storeName; window.__storeSettings = s; } catch (e) {}
      // Store logo — same shared renderer every other shell uses, so checkout
      // steps render the identical logo instead of a private copy of the logic.
      try { if (window.StoreLogo) window.StoreLogo.apply(s); } catch (e) {}
      var __name = s['store.name'] || '', __phone = s['store.phone'] || '', __phone2 = s['store.phone2'] || '',
        __email = s['store.email'] || '', __addr = s['store.address'] || '', __desc = s['store.desc'] || '',
        __mapUrl = s['store.map_url'] || '', __hours = s['store.hours'] || '',
        __hoursDetail = s['store.hours_detail'] || '', __website = s['store.website'] || '',
        __lat = s['store.latitude'] || '', __lng = s['store.longitude'] || '';
      function __setText(sel, val) {
        if (!val) return;
        document.querySelectorAll(sel).forEach(function (el) { el.textContent = val; });
      }
      if (__name) {
        __setText('.header-logo__title', __name);
        __setText('.footer-brand__name, .footer-store-name', __name);
        // .co-brand is a logo + name lockup: update the name part only, so the
        // [data-store-logo] slot survives.
        document.querySelectorAll('.co-brand').forEach(function (el) { __setSettingText(el, __name); });
        document.querySelectorAll('[data-store="name"]').forEach(function (el) { el.textContent = __name; });
        var cpr = document.querySelector('.footer-copyright');
        if (cpr) {
          var __span = cpr.querySelector('.footer-store-name');
          if (__span) __span.textContent = __name;
          else cpr.textContent = 'تمامی حقوق این وب‌سایت متعلق به فروشگاه ' + __name + ' می‌باشد.';
        }
        try {
          if (document.title && document.title.indexOf('|') !== -1) {
            var __parts = document.title.split('|');
            __parts[__parts.length - 1] = ' ' + __name;
            document.title = __parts.join('|');
          }
          var __mt = document.querySelector('meta[name="apple-mobile-web-app-title"]');
          if (__mt) __mt.setAttribute('content', __name);
        } catch (e) {}
      }
      if (__desc) { var fd = document.querySelector('.footer-brand__desc'); if (fd) fd.textContent = __desc; }
      if (__addr || __phone || __email || __website) {
        document.querySelectorAll('[data-store-field="address"]').forEach(function (el) { if (__addr) { var __svg = el.querySelector('svg'); if (__svg) el.innerHTML = __svg.outerHTML + ' ' + __addr; else el.textContent = __addr; } });
        document.querySelectorAll('[data-store-field="phone"]').forEach(function (el) { if (__phone) { var __svg2 = el.querySelector('svg'); if (__svg2) el.innerHTML = __svg2.outerHTML + ' ' + __phone; else el.textContent = __phone; } });
        document.querySelectorAll('[data-store-field="email"]').forEach(function (el) { if (__email) { var __svg3 = el.querySelector('svg'); if (__svg3) el.innerHTML = __svg3.outerHTML + ' ' + __email; else el.textContent = __email; } });
        document.querySelectorAll('[data-store-field="website"]').forEach(function (el) { if (__website) { var __svg4 = el.querySelector('svg'); if (__svg4) el.innerHTML = __svg4.outerHTML + ' ' + __website; else el.textContent = __website; } });
        document.querySelectorAll('.footer-link').forEach(function (link) {
          if (link.hasAttribute('data-store-field')) return;
          var svg = link.querySelector('svg'); var txt = link.textContent || '';
          if (__addr && (txt.indexOf('تهران') !== -1 || txt.indexOf('ولیعصر') !== -1 || txt.indexOf('پلاک') !== -1)) {
            try { link.setAttribute('data-store-field', 'address'); } catch (e) {}
            if (svg) link.innerHTML = svg.outerHTML + ' ' + __addr; else link.textContent = __addr;
          } else if (__phone && /[0-9۰-۹]/.test(txt) && txt.indexOf('@') === -1 && txt.indexOf('www') === -1 && txt.indexOf('http') === -1) {
            try { link.setAttribute('data-store-field', 'phone'); } catch (e) {}
            if (svg) link.innerHTML = svg.outerHTML + ' ' + __phone; else link.textContent = __phone;
          } else if (__email && txt.indexOf('@') !== -1) {
            try { link.setAttribute('data-store-field', 'email'); } catch (e) {}
            if (svg) link.innerHTML = svg.outerHTML + ' ' + __email; else link.textContent = __email;
          } else if (__website && (txt.indexOf('www') !== -1 || txt.indexOf('http') !== -1)) {
            try { link.setAttribute('data-store-field', 'website'); } catch (e) {}
            if (svg) link.innerHTML = svg.outerHTML + ' ' + __website; else link.textContent = __website;
          }
        });
      }
      // Explicit data-setting hooks (contact page, about, authenticity…).
      try {
        var __map = {
          'store.name': __name, 'store.phone': __phone, 'store.phone2': __phone2,
          'store.email': __email, 'store.address': __addr, 'store.desc': __desc,
          'store.map_url': __mapUrl, 'store.hours': __hours,
          'store.hours_detail': __hoursDetail, 'store.website': __website,
          'store.latitude': __lat, 'store.longitude': __lng
        };
        Object.keys(__map).forEach(function (k) {
          document.querySelectorAll('[data-setting="' + k + '"]').forEach(function (el) {
            if (k === 'store.map_url') { if (__map[k] && el.tagName === 'A') el.setAttribute('href', __map[k]); return; }
            if (!__map[k]) {
              if (k === 'store.phone2') { var __hc = el.closest ? (el.closest('.contact-method-card') || el.closest('.contact-info-item')) : null; if (__hc) { __hc.style.display = 'none'; if (__hc.tagName === 'A') __hc.removeAttribute('href'); } }
              return;
            }
            if (k === 'store.phone2') { var __sc = el.closest ? (el.closest('.contact-method-card') || el.closest('.contact-info-item')) : null; if (__sc) __sc.style.display = ''; }
            __setSettingText(el, __map[k]);
          });
        });
        if (__phone) document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
          if (a.hasAttribute('data-tel-keep')) return;
          a.setAttribute('href', __telHref(__phone));
        });
        if (__phone2) document.querySelectorAll('[data-phone2-card]').forEach(function (a) {
          a.setAttribute('href', __telHref(__phone2));
        });
        if (__email) document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) { a.setAttribute('href', 'mailto:' + __email); });
        // Directions quick-action follows the saved store address.
        if (__addr) {
          var __dirCard = document.querySelector('.quick-action-card--directions');
          if (__dirCard) __dirCard.setAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(__addr));
        }
        try { __renderContactMap(__lat, __lng, __mapUrl, __addr); } catch (e) {}
      } catch (e) {}
      // Shipping info line on cart/checkout pages reflects threshold + cost.
      var cost = Math.round(Number(String(s['ship.cost']).replace(/[^0-9.-]/g, '')));
      var freeFrom = Math.round(Number(String(s['ship.free_from']).replace(/[^0-9.-]/g, '')));
      if (Number.isFinite(cost) && Number.isFinite(freeFrom)) {
        document.querySelectorAll('[data-setting="ship.hint"]').forEach(function (el) {
          try {
            el.textContent = freeFrom > 0
              ? ('ارسال رایگان برای سفارش‌های بالای ' + freeFrom.toLocaleString('en-US') + ' تومان')
              : ('هزینه ارسال: ' + cost.toLocaleString('en-US') + ' تومان');
          } catch (e) {}
        });
      }
    } catch (e) {}
  }
  Promise.all([
    fetch('/api/hero-slides?v='+Date.now(), {cache:'no-store'}).then(function(r){ return r.ok? r.json(): null; }).catch(function(){ return null; }),
    fetch('/api/content?v='+Date.now(), {cache:'no-store'}).then(function(r){ return r.ok? r.json(): null; }).catch(function(){ return null; }),
    fetch('/api/settings?v='+Date.now(), {cache:'no-store'}).then(function(r){ return r.ok? r.json(): null; }).catch(function(){ return null; })
  ]).then(function(results){
    var slides=results[0], c=results[1], s=results[2];
    renderHeroSlides(slides);
    if(c) applyContent(c);
    if(s) applySettings(s);
  });
})();