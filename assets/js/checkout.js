/* ================================================================
   Camzy — Checkout Page
   ================================================================ */
(function() {
  'use strict';
  var $ = function(s,c) { return (c||document).querySelector(s); };
  var $$ = function(s,c) { return [...(c||document).querySelectorAll(s)]; };
  var selectedShippingId = null;
  var selectedShipping = 'normal';
  var ShipMethods = [];
  var StoreSettings = { cost: 35000, freeFrom: 500000, method: '', payOnline: true, payCod: false, payCard: true,
    payTitle: { online: 'پرداخت آنلاین', cod: 'پرداخت در محل', card: 'کارت به کارت' },
    payDesc: { online: 'پرداخت از طریق درگاه بانکی', cod: 'پرداخت نقدی هنگام تحویل', card: 'پرداخت از طریق انتقال بانکی' } };
  function parseNum(v, fb) { var n = Math.round(Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, ''))); return Number.isFinite(n) && n >= 0 ? n : fb; }
  function loadStoreSettings() {
    return Promise.all([
      fetch('/api/settings').then(function (r) { return r.json(); }).catch(function () { return null; }),
      fetch('/api/shipping-methods').then(function (r) { return r.json(); }).catch(function () { return []; })
    ]).then(function (parts) {
      var s = parts[0], methods = parts[1];
      if (s) {
        StoreSettings.cost = parseNum(s['ship.cost'], StoreSettings.cost);
        StoreSettings.freeFrom = parseNum(s['ship.free_from'], StoreSettings.freeFrom);
        StoreSettings.method = String(s['ship.method'] || '');
        StoreSettings.payOnline = String(s['pay.online']) !== '0';
        StoreSettings.payCod = String(s['pay.cod']) === '1';
        StoreSettings.payCard = String(s['pay.card']) !== '0';
        // Per-method titles/descriptions (admin → روش‌های خرید). Fall back to built-ins.
        ['online', 'cod', 'card'].forEach(function (m) {
          if (s['pay.' + m + '.title'] !== undefined && String(s['pay.' + m + '.title']).trim()) {
            StoreSettings.payTitle[m] = String(s['pay.' + m + '.title']).trim();
          }
          if (s['pay.' + m + '.desc'] !== undefined) {
            StoreSettings.payDesc[m] = String(s['pay.' + m + '.desc']);
          }
        });
      }
      if (Array.isArray(methods) && methods.length) {
        ShipMethods = methods.map(function (m) {
          return { id: m.id, name: m.name, description: m.description || '', cost: Math.max(0, Math.round(Number(m.cost) || 0)), isDefault: !!m.isDefault };
        });
        var def = ShipMethods.find(function (m) { return m.isDefault; }) || ShipMethods[0];
        // Back-compat: if no DB default matches legacy ship.method, prefer name match.
        if (StoreSettings.method) {
          var byName = ShipMethods.find(function (m) { return m.name === StoreSettings.method; });
          if (byName) def = byName;
        }
        selectedShippingId = def.id;
        try {
          var draft = JSON.parse(localStorage.getItem('as_checkout_draft')) || {};
          if (draft.shippingId != null) {
            var chosen = ShipMethods.find(function (m) { return String(m.id) === String(draft.shippingId); });
            if (chosen) { selectedShippingId = chosen.id; def = chosen; }
          }
        } catch (e) {}
        selectedShipping = /سریع|پیشتاز|express|باربری/i.test(def.name) ? 'express' : 'normal';
      } else {
        ShipMethods = [
          { id: 'normal', name: 'ارسال عادی', description: 'تحویل ۳ تا ۵ روز کاری', cost: 0, isDefault: true },
          { id: 'express', name: 'ارسال سریع', description: 'تحویل ۱ تا ۲ روز کاری', cost: StoreSettings.cost, isDefault: false }
        ];
        var m = StoreSettings.method || '';
        var wantExpress = /سریع|پیشتاز|express/i.test(m) || (/باربری/.test(m));
        selectedShippingId = wantExpress ? 'express' : 'normal';
        selectedShipping = wantExpress ? 'express' : 'normal';
      }
      return StoreSettings;
    }).catch(function () { return StoreSettings; });
  }
  function currentMethod() {
    var m = ShipMethods.find(function (x) { return String(x.id) === String(selectedShippingId); });
    if (m) return m;
    m = ShipMethods.find(function (x) { return x.isDefault; });
    return m || ShipMethods[0] || { id: 'normal', name: 'ارسال عادی', cost: 0 };
  }
  function cartSubtotal() { try { return App.getCartTotal(); } catch (e) { return 0; } }
  // Discount code state (preview only — the server recomputes and enforces it).
  var appliedDiscount = { code: '', amount: 0 };
  function discountAmount() { return appliedDiscount.code ? Math.min(appliedDiscount.amount, cartSubtotal()) : 0; }
  function showDiscountError(msg) {
    var el = document.getElementById('checkout-discount-error');
    if (!el) return;
    if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
    el.style.display = ''; el.textContent = msg;
  }
  function syncDiscountUI() {
    var form = document.getElementById('checkout-discount-form');
    var applied = document.getElementById('checkout-discount-applied');
    if (!form || !applied) return;
    if (appliedDiscount.code) {
      form.style.display = 'none'; applied.style.display = 'flex';
      document.getElementById('checkout-discount-code-text').textContent = appliedDiscount.code;
      try { document.getElementById('checkout-discount-amount').textContent = Format.priceWithCurrency(discountAmount()); } catch (e) {}
    } else {
      form.style.display = 'flex'; applied.style.display = 'none';
    }
  }
  function applyDiscountCode() {
    var input = document.getElementById('checkout-discount-code');
    var code = input ? input.value.trim() : '';
    if (!code) { showDiscountError('کد تخفیف را وارد کنید.'); return; }
    showDiscountError(null);
    fetch('/api/discounts/validate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, subtotal: cartSubtotal() }),
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'failed'); return j; }); })
      .then(function (d) {
        appliedDiscount = { code: d.code || code.toUpperCase(), amount: Math.max(0, Math.round(Number(d.discount) || 0)) };
        syncDiscountUI(); renderSummary();
      })
      .catch(function () { showDiscountError('کد تخفیف معتبر نیست یا قابل اعمال نیست.'); });
  }
  function removeDiscountCode() {
    appliedDiscount = { code: '', amount: 0 };
    var input = document.getElementById('checkout-discount-code');
    if (input) input.value = '';
    showDiscountError(null); syncDiscountUI(); renderSummary();
  }
  function isFreeShipping(total) { return StoreSettings.freeFrom > 0 ? total >= StoreSettings.freeFrom : (currentMethod().cost === 0); }
  function shipCostFor() {
    var total = cartSubtotal();
    if (isFreeShipping(total)) return 0;
    return Math.max(0, Math.round(Number(currentMethod().cost) || 0));
  }
  function renderShippingOptions() {
    var section = null;
    $$('.checkout-section').forEach(function (s) {
      var t = s.querySelector('.checkout-section__title');
      if (t && /روش ارسال/.test(t.textContent)) section = s;
    });
    if (!section || !ShipMethods.length) return;
    $$('.shipping-option', section).forEach(function (el) { el.remove(); });
    ShipMethods.forEach(function (m) {
      var label = document.createElement('label');
      label.className = 'shipping-option' + (String(m.id) === String(currentMethod().id) ? ' is-active' : '');
      var desc = m.description ? '<div style="font-size:var(--font-size-xs);color:var(--text-muted)">' + m.description + '</div>' : '';
      var costHtml = (isFreeShipping(cartSubtotal()) || !Number(m.cost))
        ? '<span style="color:var(--color-success)">رایگان</span>'
        : Format.priceWithCurrency(m.cost);
      label.innerHTML = '<input type="radio" name="shipping" value="' + m.id + '"' + (String(m.id) === String(currentMethod().id) ? ' checked' : '') + '>' +
        '<div><div style="font-weight:var(--font-weight-semibold)">' + m.name + (m.isDefault ? ' (پیش‌فرض)' : '') + '</div>' + desc + '</div>' +
        '<span style="margin-right:auto;font-weight:var(--font-weight-semibold)">' + costHtml + '</span>';
      var input = label.querySelector('input');
      input.addEventListener('change', function () { selectedShippingId = m.id; applyPaymentToggles(); renderSummary(); });
      section.appendChild(label);
    });
  }
  function ensureCardOption() {
    var container = document.querySelector('.checkout-section:nth-of-type(4)') || null;
    var existing = document.querySelector('.payment-option input[value="card"]');
    if (existing) return existing;
    var codLabel = document.querySelector('.payment-option input[value="cod"]');
    var host = codLabel ? codLabel.closest('.checkout-section') : null;
    if (!host) return null;
    var label = document.createElement('label');
    label.className = 'payment-option';
    label.innerHTML = '<input type="radio" name="payment" value="card"><div><div style="font-weight:var(--font-weight-semibold)">' + StoreSettings.payTitle.card + '</div><div style="font-size:var(--font-size-xs);color:var(--text-muted)">' + StoreSettings.payDesc.card + '</div></div>';
    host.appendChild(label);
    return label.querySelector('input');
  }
  function firstEnabledPayment() {
    if (StoreSettings.payOnline) return 'online';
    if (StoreSettings.payCod) return 'cod';
    if (StoreSettings.payCard) return 'card';
    return 'online';
  }
  function applyPaymentToggles() {
    ensureCardOption();
    var online = document.querySelector('.payment-option input[value="online"]');
    var cod = document.querySelector('.payment-option input[value="cod"]');
    var card = document.querySelector('.payment-option input[value="card"]');
    function setVis(input, enabled) {
      if (!input) return;
      var w = input.closest('.payment-option');
      if (!enabled) { if (w) w.style.display = 'none'; }
      else if (w) w.style.display = '';
    }
    setVis(online, StoreSettings.payOnline);
    setVis(cod, StoreSettings.payCod);
    setVis(card, StoreSettings.payCard);
    // Dynamic per-method titles/descriptions (admin → روش‌های خرید).
    [['online', online], ['cod', cod], ['card', card]].forEach(function (pair) {
      var input = pair[1];
      if (!input) return;
      var w = input.closest('.payment-option');
      if (!w) return;
      var divs = w.querySelectorAll(':scope > div > div');
      if (divs[0] && StoreSettings.payTitle[pair[0]]) divs[0].textContent = StoreSettings.payTitle[pair[0]];
      if (divs[1] !== undefined && divs[1] && StoreSettings.payDesc[pair[0]] !== undefined) divs[1].textContent = StoreSettings.payDesc[pair[0]];
    });
    var checked = document.querySelector('input[name="payment"]:checked');
    var checkedVal = checked ? checked.value : null;
    var checkedEnabled = (checkedVal === 'online' && StoreSettings.payOnline) ||
      (checkedVal === 'cod' && StoreSettings.payCod) ||
      (checkedVal === 'card' && StoreSettings.payCard);
    if (!checkedEnabled) {
      var fb = firstEnabledPayment();
      var target = document.querySelector('.payment-option input[value="' + fb + '"]');
      if (target) target.checked = true;
    }
    // Default shipping method comes from DB (isDefault); keep legacy heuristic as fallback.
    if (!selectedShippingId) {
      var m = StoreSettings.method || '';
      var wantExpress = /سریع|پیشتاز|express/i.test(m) || (/باربری/.test(m));
      var wantNormal = /پیک|عادی|normal/i.test(m);
      if (wantExpress) selectedShipping = 'express';
      else if (wantNormal) selectedShipping = 'normal';
      var fb = ShipMethods.find(function (x) { return String(x.id) === selectedShipping; }) || currentMethod();
      selectedShippingId = fb.id;
    }
    renderShippingOptions();
    $$('.shipping-option input').forEach(function (input) {
      input.checked = (String(input.value) === String(currentMethod().id));
      var lab = input.closest('.shipping-option');
      if (lab) lab.classList.toggle('is-active', input.checked);
    });
    // Shipping labels respect cost + threshold (dynamic methods already rendered above).
  }

  function render() {
    function guards() {
      var cart = App.getCart();
      if (cart.length === 0) { window.location.href = '/cart'; return; }
      // Purchase settings (admin): guest checkout may be allowed without login.
      // Server re-validates on order creation; this only gates the redirect.
      var allowGuest = true;
      try {
        var cached = null;
        try { cached = JSON.parse(localStorage.getItem('as_purchase_settings') || 'null'); } catch (e) {}
        if (cached && cached.allowGuest === false) allowGuest = false;
      } catch (e) {}
      if (typeof App.fetchPurchaseSettings === 'function') {
        App.fetchPurchaseSettings().then(function (ps) {
          if (ps && ps.allowGuest === false && !App.isLoggedIn()) {
            App.showToast('برای تکمیل خرید ابتدا وارد حساب کاربری شوید.', 'info');
            if (App.redirectToLogin) App.redirectToLogin(); else window.location.href = '/login';
            return;
          }
          if ((!ps) && !allowGuest && !App.isLoggedIn()) {
            App.showToast('برای تکمیل خرید ابتدا وارد حساب کاربری شوید.', 'info');
            if (App.redirectToLogin) App.redirectToLogin(); else window.location.href = '/login';
            return;
          }
          renderSummary();
          renderProvinces();
          setTimeout(prefillFromDraft,400);
          setTimeout(prefillFromDraft,1200);
        });
        return;
      }
      if (!App.isLoggedIn() && !allowGuest) {
        App.showToast('برای تکمیل خرید ابتدا وارد حساب کاربری شوید.', 'info');
        if (App.redirectToLogin) App.redirectToLogin(); else window.location.href = '/login';
        return;
      }
      renderSummary();
      renderProvinces();
      setTimeout(prefillFromDraft,400);
      setTimeout(prefillFromDraft,1200);
    }
    /* Sync fix: for logged-in users the database syncs asynchronously
       (common.js pullCartFromServer) and unconditionally overwrites the local
       cart. Two false-empty cases resulted in a wrong redirect to account-cart.html:
       (a) fresh session with empty local cache judged before sync settles;
       (b) stale/empty server cart wiping a valid local cart (account-cart.html renders
       local state, so the buyer sees items there but bounces here).
       Snapshot local items first; after sync, if the server came back empty
       but the snapshot was not, restore via public cart API (also re-mirrors
       to the server). Only when BOTH are empty is account-cart.html correct. */
    try {
      if (App.isLoggedIn() && typeof App.fetchCart === 'function') {
        var snap = App.getCart().slice();
        var done = false;
        function settled() {
          if (done) return; done = true;
          restoreSnap();
          function restoreSnap() {
            /* addToCart needs the async catalog; wait for it before restoring. */
            var needRestore = false;
            try { needRestore = (App.getCart().length === 0 && snap.length > 0); } catch (e) {}
            if (!needRestore) { guards(); return; }
            var hasCatalog = false;
            try { hasCatalog = (typeof AppData !== 'undefined' && AppData.products && AppData.products.length > 0); } catch (e) {}
            if (hasCatalog) { doRestore(); return; }
            var waited = false;
            function ready() { if (waited) return; waited = true; doRestore(); }
            try { document.addEventListener('camzy:catalog-updated', ready, { once: true }); } catch (e) {}
            setTimeout(ready, 4000);
          }
          function doRestore() {
            try {
              if (App.getCart().length === 0 && snap.length > 0) {
                snap.forEach(function (it) {
                  try {
                    App.addToCart(it.id, it.pricingMode);
                    var need = (parseInt(it.quantity, 10) || 1) - 1;
                    if (need > 0) App.updateCartQty(it.key || (it.id + '_' + (it.pricingMode || 'retail')), need);
                  } catch (e) {}
                });
              }
            } catch (e) {}
            guards();
          }
        }
        App.fetchCart().then(settled, settled);
        /* Safety net: never trap the buyer on a blank page. */
        setTimeout(settled, 6000);
        return;
      }
    } catch (e) {}
    guards();
  }

  function prefillFromDraft(){try{var d=JSON.parse(localStorage.getItem('as_checkout_draft'))||{};if(!d||!Object.keys(d).length)return;var ta=document.querySelector('#checkout-form textarea');var pSel=document.querySelector('#province-select');var ins=document.querySelectorAll('#checkout-form input.input');if(ins[0]&&d.firstName)ins[0].value=d.firstName;if(ins[1]&&d.lastName)ins[1].value=d.lastName;if(ins[2]&&d.mobile)ins[2].value=d.mobile;if(ins[3]!==undefined&&d.email!=null)ins[3].value=d.email||'';if(pSel&&d.province){pSel.value=d.province;fillCities(d.province,d.city||'');}if(ta&&d.address)ta.value=d.address;var postal=document.querySelectorAll('#checkout-form input.input')[4];if(postal&&d.postalCode)postal.value=d.postalCode;}catch(e){}}
  function renderSummary() {
    var cart = App.getCart();
    var total = App.getCartTotal();
    var shippingCost = shipCostFor();
    var discount = discountAmount();
    var finalTotal = Math.max(0, total + shippingCost - discount);

    var el = $('#checkout-summary-items');
    if (!el) return;
    el.innerHTML = cart.map(function(item) {
      var optionsHtml = '';
      if (item.options && item.options.length) {
        optionsHtml = '<div style="margin-top:4px;font-size:var(--font-size-xs);color:var(--text-muted)">' +
          item.options.map(function(opt) {
            return '<span>• ' + opt.title + ': ' + Format.price(opt.price) + ' تومان</span>';
          }).join('<br>') +
        '</div>';
      }
      return '<div style="display:flex;gap:var(--space-3);padding:var(--space-2) 0;font-size:var(--font-size-sm)"><div style="width:48px;height:48px;background:var(--color-gray-100);border-radius:var(--radius-md);overflow:hidden;flex-shrink:0"><img src="'+item.image+'" alt="'+item.name+'" style="width:100%;height:100%;object-fit:contain"></div><div style="flex:1"><div style="font-weight:var(--font-weight-medium)">'+item.name+'</div>' + optionsHtml + '<div style="color:var(--text-muted)">'+Format.toPersianNumber(item.quantity)+' عدد</div></div><div style="font-weight:var(--font-weight-semibold)">'+Format.priceWithCurrency(item.price * item.quantity)+'</div></div>';
    }).join('');

    var sumEl = $('#checkout-summary-total');
    if (sumEl) {
      sumEl.innerHTML =
        '<div class="cart-summary-box__row"><span>جمع سبد خرید</span><span>'+Format.priceWithCurrency(total)+'</span></div>' +
        '<div class="cart-summary-box__row"><span>هزینه ارسال</span><span>'+(shippingCost === 0 ? '<span style="color:var(--color-success)">رایگان</span>' : Format.priceWithCurrency(shippingCost))+'</span></div>' +
        (discount > 0 ? '<div class="cart-summary-box__row"><span>تخفیف ('+appliedDiscount.code+')</span><span style="color:var(--color-success)">− '+Format.priceWithCurrency(discount)+'</span></div>' : '') +
        '<div class="cart-summary-box__row cart-summary-box__row--total"><span>مبلغ قابل پرداخت</span><span>'+Format.priceWithCurrency(finalTotal)+'</span></div>';
    }
    syncDiscountUI();
  }

  function renderSavedAddresses(){
    var section=document.querySelector('.checkout-section');
    // insert saved address selector before province selects if addresses exist
    var addresses=App.getUserData('addresses',[]);
    if(!addresses.length) return;
    var addrSection=document.querySelector('#checkout-saved-addresses');
    if(addrSection) addrSection.remove();
    var container=document.createElement('div');
    container.id='checkout-saved-addresses';
    container.style.cssText='margin-bottom:16px;display:flex;flex-direction:column;gap:8px';
    var selectedId=null; try{ selectedId=localStorage.getItem('as_selected_address_'+App.getCurrentUser().id); }catch(e){}
    if(selectedId) selectedId=parseInt(selectedId);
    var def=addresses.find(function(a){return a.id===selectedId;})||addresses.find(function(a){return a.isDefault;})||addresses[0];
    container.innerHTML='<label class="input-label" style="font-weight:700">انتخاب از آدرس‌های ذخیره‌شده</label>'
      +addresses.map(function(a){
        var checked=a.id===def.id?'checked':'';
        return '<label style="display:flex;align-items:center;gap:8px;padding:10px;border:1px solid '+(checked?'var(--color-primary)':'var(--border-color-light)')+';border-radius:var(--radius-lg);background:'+(checked?'var(--color-primary-50)':'#fff')+';cursor:pointer"><input type="radio" name="savedAddr" value="'+a.id+'" '+checked+'><span style="flex:1;font-size:13px">'+a.title+' — '+a.province+'، '+a.city+' — '+a.address.substring(0,40)+'...</span><a href="/account/addresses" style="font-size:12px;color:var(--color-primary)">مدیریت</a></label>';
      }).join('')
      +'<label style="display:flex;align-items:center;gap:8px;padding:10px;border:1px solid var(--border-color-light);border-radius:var(--radius-lg);cursor:pointer"><input type="radio" name="savedAddr" value="new" '+(false?'':'')+'> <span style="font-size:13px">ثبت آدرس جدید</span></label>';
    var target=document.querySelector('.checkout-section:nth-of-type(2)')||document.querySelector('.checkout-section');
    if(target) target.insertBefore(container, target.firstChild.nextSibling||null);
    // fill form with selected
    function fill(a){
      if(!a) return;
      var pSel=$('#province-select'), cSel=$('#city-select');
      if(pSel) pSel.value=a.province;
      fillCities(a.province, a.city);
      if(cSel) cSel.value=a.city;
      var addrTa=document.querySelector('#checkout-form textarea');
      if(addrTa) addrTa.value=a.address;
      var postal=document.querySelector('#checkout-form input[placeholder="XXXXXXXXXX"]');
      if(postal) postal.value=a.postalCode;
    }
    fill(def);
    container.querySelectorAll('input[name="savedAddr"]').forEach(function(r){
      r.addEventListener('change',function(){
        if(this.value==='new'){
          var pSel=$('#province-select'); if(pSel) pSel.value=''; if(pSel) pSel.dispatchEvent(new Event('change'));
          var ta=document.querySelector('#checkout-form textarea'); if(ta) ta.value='';
          var po=document.querySelector('#checkout-form input[placeholder="XXXXXXXXXX"]'); if(po) po.value='';
        } else {
          var a=addresses.find(function(x){return String(x.id)===String(r.value);});
          fill(a);
          try{ localStorage.setItem('as_selected_address_'+App.getCurrentUser().id,String(a.id)); }catch(e){}
        }
        // Refresh card highlight only — do NOT rebuild (rebuild would re-fill
        // the default address and wipe a "new address" choice).
        container.querySelectorAll('input[name="savedAddr"]').forEach(function(x){
          var lab=x.closest('label');
          if(!lab) return;
          var on=x.checked;
          lab.style.border='1px solid '+(on?'var(--color-primary)':'var(--border-color-light)');
          lab.style.background=on?'var(--color-primary-50)':'#fff';
        });
      });
    });
  }
  // Same data source and mapping as Add Address (account.js openAddressModal):
  // window.IranCities -> IranCitiesLoader -> assets/data/iran-cities.json. No separate dataset.
  function getProvinces(){ return window.IranCities || null; }
  function fillCities(provinceName, selectedCity) {
    var cityEl = $('#city-select');
    if (!cityEl) return;
    var provs = getProvinces() || [];
    var province = provs.find(function(p) { return p.name === provinceName; });
    cityEl.innerHTML = '<option value="">انتخاب شهر</option>' + (province ? province.cities.map(function(c) { return '<option value="'+c+'"'+(c===selectedCity?' selected':'')+'>'+c+'</option>'; }).join('') : '');
  }
  /* ── Province/City custom dropdowns ──
     Exact copy of the Add Address implementation (assets/js/account.js),
     adapted only for the Checkout element IDs (province-select/city-select
     + province-select-trigger/city-select-trigger). */
  var cityDropdownInstance = null;
  function closeCityDropdown() {
    if (cityDropdownInstance) { cityDropdownInstance.remove(); cityDropdownInstance = null; }
    var t = document.getElementById('city-select-trigger');
    if (t) t.setAttribute('aria-expanded','false');
  }
  function cityOptionClick() {
    var v = this.getAttribute('data-value');
    var el = document.getElementById('city-select');
    if (el) el.value = v;
    closeCityDropdown();
  }
  function openCityDropdown() {
    closeCityDropdown();
    var trigger = document.getElementById('city-select-trigger');
    var el = document.getElementById('city-select');
    if (!trigger || !el) return;
    var rect = trigger.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    var menu = document.createElement('ul');
    menu.className = 'addr-city-menu';
    var any = false, selected = null, i;
    for (i = 0; i < el.options.length; i++) {
      var o = el.options[i];
      if (!o.value) continue;
      any = true;
      var li = document.createElement('li');
      li.className = 'addr-city-menu__item' + (o.selected ? ' is-selected' : '');
      li.textContent = o.text;
      li.setAttribute('data-value', o.value);
      li.addEventListener('click', cityOptionClick);
      if (o.selected) selected = li;
      menu.appendChild(li);
    }
    if (!any) return;
    document.body.appendChild(menu);
    cityDropdownInstance = menu;
    var gap = 6;
    var minHeight = 100;
    var top = rect.bottom + gap;
    var below = window.innerHeight - top - gap;
    if (below < minHeight) {
      top = Math.min(top, Math.max(8, window.innerHeight - minHeight - gap));
      below = window.innerHeight - top - gap;
    }
    menu.style.position = 'fixed';
    menu.style.left = Math.max(8, rect.left) + 'px';
    menu.style.top = top + 'px';
    menu.style.width = Math.min(rect.width, window.innerWidth - 16) + 'px';
    menu.style.maxHeight = Math.max(0, below) + 'px';
    menu.style.overflowY = 'auto';
    menu.style.overscrollBehavior = 'contain';
    menu.style.touchAction = 'pan-y';
    menu.addEventListener('wheel', function(e){ e.stopPropagation(); }, {passive:false});
    menu.addEventListener('touchmove', function(e){ e.stopPropagation(); }, {passive:false});
    menu.style.zIndex = '560';
    trigger.setAttribute('aria-expanded','true');
    if (selected) menu.scrollTop = Math.max(0, selected.offsetTop - menu.clientHeight / 2);
  }
  var provinceDropdownInstance = null;
  function closeProvinceDropdown() {
    if (provinceDropdownInstance) { provinceDropdownInstance.remove(); provinceDropdownInstance = null; }
    var t = document.getElementById('province-select-trigger');
    if (t) t.setAttribute('aria-expanded','false');
  }
  function provinceOptionClick() {
    var v = this.getAttribute('data-value');
    var el = document.getElementById('province-select');
    if (el) {
      el.value = v;
      el.dispatchEvent(new Event('change', {bubbles:true}));
    }
    closeProvinceDropdown();
  }
  function openProvinceDropdown() {
    closeProvinceDropdown();
    var trigger = document.getElementById('province-select-trigger');
    var el = document.getElementById('province-select');
    if (!trigger || !el) return;
    var rect = trigger.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    var menu = document.createElement('ul');
    menu.className = 'addr-province-menu';
    var any = false, selected = null, i;
    for (i = 0; i < el.options.length; i++) {
      var o = el.options[i];
      if (!o.value) continue;
      any = true;
      var li = document.createElement('li');
      li.className = 'addr-province-menu__item' + (o.selected ? ' is-selected' : '');
      li.textContent = o.text;
      li.setAttribute('data-value', o.value);
      li.addEventListener('click', provinceOptionClick);
      if (o.selected) selected = li;
      menu.appendChild(li);
    }
    if (!any) return;
    document.body.appendChild(menu);
    provinceDropdownInstance = menu;
    var gap = 6;
    var minHeight = 100;
    var top = rect.bottom + gap;
    var below = window.innerHeight - top - gap;
    if (below < minHeight) {
      top = Math.min(top, Math.max(8, window.innerHeight - minHeight - gap));
      below = window.innerHeight - top - gap;
    }
    menu.style.position = 'fixed';
    menu.style.left = Math.max(8, rect.left) + 'px';
    menu.style.top = top + 'px';
    menu.style.width = Math.min(rect.width, window.innerWidth - 16) + 'px';
    menu.style.maxHeight = Math.max(0, below) + 'px';
    menu.style.overflowY = 'auto';
    menu.style.overscrollBehavior = 'contain';
    menu.style.touchAction = 'pan-y';
    menu.addEventListener('wheel', function(e){ e.stopPropagation(); }, {passive:false});
    menu.addEventListener('touchmove', function(e){ e.stopPropagation(); }, {passive:false});
    menu.style.zIndex = '560';
    trigger.setAttribute('aria-expanded','true');
    if (selected) menu.scrollTop = Math.max(0, selected.offsetTop - menu.clientHeight / 2);
  }
  function renderProvinces() {
    var el = $('#province-select');
    if (!el) return;
    function doRender(provinces){
      if (window.IranCities !== provinces) { try { window.IranCities = provinces; } catch (e) {} }
      var prevProv = el.value, prevCity = ($('#city-select') || {}).value || '';
      el.innerHTML = '<option value="">انتخاب استان</option>' + provinces.map(function(p) { return '<option value="'+p.name+'"'+(p.name===prevProv?' selected':'')+'>'+p.name+'</option>'; }).join('');
      fillCities(el.value, prevCity);
      if (!el.dataset.bind) {
        el.dataset.bind = '1';
        el.addEventListener('change', function() { fillCities(el.value, ''); closeCityDropdown(); closeProvinceDropdown(); });
        var cityTrigger = document.getElementById('city-select-trigger');
        if (cityTrigger) cityTrigger.addEventListener('click', function(e){
          e.preventDefault();
          if (cityDropdownInstance) closeCityDropdown(); else openCityDropdown();
        });
        var provinceTrigger = document.getElementById('province-select-trigger');
        if (provinceTrigger) provinceTrigger.addEventListener('click', function(e){
          e.preventDefault();
          closeCityDropdown();
          if (provinceDropdownInstance) closeProvinceDropdown(); else openProvinceDropdown();
        });
        document.addEventListener('click', function(e){
          if (cityDropdownInstance) {
            var trigger = document.getElementById('city-select-trigger');
            if (!(trigger && trigger.contains(e.target)) && !cityDropdownInstance.contains(e.target)) closeCityDropdown();
          }
          if (provinceDropdownInstance) {
            var pTrigger = document.getElementById('province-select-trigger');
            if (!(pTrigger && pTrigger.contains(e.target)) && !provinceDropdownInstance.contains(e.target)) closeProvinceDropdown();
          }
        });
        document.addEventListener('keydown', function(e){ if (e.key === 'Escape') { closeCityDropdown(); closeProvinceDropdown(); } });
        window.addEventListener('resize', function(){ closeCityDropdown(); closeProvinceDropdown(); });
        window.addEventListener('scroll', function(e){ var t=e.target; if(t && t.closest && (t.closest('.addr-city-menu') || t.closest('.addr-province-menu'))) return; closeCityDropdown(); closeProvinceDropdown(); }, true);
      }
      renderSavedAddresses();
    }
    var provs=getProvinces();
    if(provs && provs.length) { doRender(provs); return; }
    if(window.IranCitiesLoader) { window.IranCitiesLoader.load(function(d){ doRender((d && d.length) ? d : (getProvinces() || [])); }); return; }
    fetch('assets/data/iran-cities.json').then(function(r){ return r.json(); }).then(function(data){
      doRender(Array.isArray(data) && data.length ? data : (getProvinces() || []));
    }).catch(function(){ doRender(getProvinces() || []); });
  }

  function init() {
    render();
    loadStoreSettings().then(function () { applyPaymentToggles(); renderSummary(); });
    var applyBtn = document.getElementById('checkout-discount-apply');
    if (applyBtn) applyBtn.addEventListener('click', applyDiscountCode);
    var rmBtn = document.getElementById('checkout-discount-remove');
    if (rmBtn) rmBtn.addEventListener('click', removeDiscountCode);
    // Shipping options (delegated: options are rendered dynamically from DB)
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.name === 'shipping') { selectedShippingId = t.value; selectedShipping = t.value; applyPaymentToggles(); renderSummary(); }
    });
    // Payment options
    $$('.payment-option input').forEach(function(input) {
      input.addEventListener('change', function() { /* just UI */ });
    });

    var form = $('#checkout-form');
    if (form) form.addEventListener('submit', function(e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.textContent = 'در حال پردازش...'; btn.disabled = true; }
      setTimeout(function() {
        /* Build order payload (UI unchanged) then persist via API/database */
        var cart = App.getCart();
        var total = App.getCartTotal();
        var shippingCost = shipCostFor();
        var now = new Date();
        var persianDate = now.toLocaleDateString('fa-IR');
        var checkedRadio = document.querySelector('input[name="savedAddr"]:checked');
        var addressId = (checkedRadio && checkedRadio.value !== 'new') ? checkedRadio.value : null;
        try { if (!addressId) addressId = localStorage.getItem('as_selected_address_'+App.getCurrentUser().id); } catch(e){}
        var order = {
          id: App.generateOrderId(),
          date: persianDate,
          status: 'pending',
          statusText: 'در انتظار پرداخت',
          total: Math.max(0, total + shippingCost - discountAmount()),
          discountCode: appliedDiscount.code || undefined,
          itemsCount: cart.reduce(function(s, i) { return s + i.quantity; }, 0),
          items: cart.map(function(item) {
            var itemData = { productId: item.id, name: item.name, price: item.price, quantity: item.quantity };
            if (item.options && item.options.length) {
              itemData.options = item.options.map(function(opt) {
                return { id: opt.id, title: opt.title, price: opt.price };
              });
            }
            return itemData;
          }),
          shipping: shippingCost,
          discount: 0,
          timeline: [
            { step: 'ثبت سفارش', date: persianDate + ' - ' + now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0'), done: true },
            { step: 'تأیید پرداخت', date: '—', done: false },
            { step: 'در حال پردازش', date: '—', done: false },
            { step: 'تحویل به پست', date: '—', done: false },
            { step: 'تحویل شده', date: '—', done: false }
          ],
          address: (function(){ var t=document.querySelector('#checkout-form textarea'); var pv=$('#province-select'), cv=$('#city-select'); var prov=pv?pv.value:''; var city=cv?cv.value:''; var addr=t?t.value.trim():''; var postalEl=document.querySelector('#checkout-form input[placeholder="XXXXXXXXXX"]'); var postal=postalEl?postalEl.value.trim():''; return (prov?' '+prov:'')+(city?'، '+city:'')+(addr?'، '+addr:'')+(postal?' — کدپستی: '+postal:'')||'آدرس ثبت‌شده در فرم'; })(),
          addressId: addressId ? (isNaN(Number(addressId)) ? addressId : Number(addressId)) : null,
          paymentMethod: (document.querySelector('input[name="payment"]:checked') ? document.querySelector('input[name="payment"]:checked').value : firstEnabledPayment())
        };
        App.createOrder(order).then(function(saved) {
          order = (saved && saved.id) ? saved : order;
          /* Clear cart via user-scoped API */
          App.clearCart();

          App.showToast('سفارش شما با موفقیت ثبت شد! شماره سفارش: ' + order.id, 'success');
          if (btn) { btn.textContent = 'پرداخت و ثبت سفارش'; btn.disabled = false; }
          setTimeout(function() { window.location.href = '/account/orders/' + encodeURIComponent(order.id); }, 1500);
        }).catch(function(err) {
          if (btn) { btn.textContent = 'پرداخت و ثبت سفارش'; btn.disabled = false; }
          App.showToast((err && err.message) || 'خطا در ثبت سفارش.', 'error');
        });
      }, 2000);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
