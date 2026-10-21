/* ================================================================
   Camzy — Admin Product Management
   Product list (server-side search/filter/pagination), category +
   stock + status filters, add, edit, delete, image, price,
   stock quantity, active/inactive status.
   Persists via backend API (/api/products) backed by SQLite.
   Falls back to read-only storefront AppData when API is
   unreachable (e.g. opened via file://). Does not touch
   storefront files.
   ================================================================ */
(function () {
  'use strict';

  var API_BASE = '/api';
  var PAGE_SIZE = 20;
  var useApi = window.location.protocol === 'http:' || window.location.protocol === 'https:';

  function adminToken() {
    try {
      var s = JSON.parse(localStorage.getItem('as_admin_session') || 'null');
      return (s && s.token) || '';
    } catch (e) { return ''; }
  }

  var EXPORT_COL_DEFS=[
    {k:'id',l:'شناسه'},{k:'name',l:'نام محصول'},{k:'sku',l:'SKU'},{k:'brand',l:'برند'},{k:'category',l:'دسته‌بندی'},{k:'subcategory',l:'زیردسته'},{k:'model',l:'مدل'},{k:'short_description',l:'توضیحات کوتاه'},{k:'description',l:'توضیحات کامل'},{k:'price',l:'قیمت'},{k:'sale_price',l:'قیمت فروش'},{k:'discount',l:'تخفیف'},{k:'stock_count',l:'موجودی'},{k:'in_stock',l:'وضعیت موجودی'},{k:'min_order',l:'حداقل سفارش'},{k:'max_order',l:'حداکثر سفارش'},{k:'warehouse',l:'انبار'},{k:'weight',l:'وزن'},{k:'dimensions',l:'ابعاد'},{k:'manufacturer',l:'تولیدکننده'},{k:'country',l:'کشور سازنده'},{k:'warranty',l:'گارانتی'},{k:'included_items',l:'اقلام همراه'},{k:'authenticity',l:'اصالت'},{k:'features_json',l:'ویژگی‌ها'},{k:'gallery',l:'تصاویر'},{k:'variants_json',l:'واریانت‌ها'},{k:'is_active',l:'وضعیت'},{k:'created_at',l:'تاریخ ایجاد'},{k:'updated_at',l:'تاریخ بروزرسانی'},{k:'seo_title',l:'عنوان SEO'},{k:'seo_description',l:'توضیحات SEO'},{k:'seo_keywords',l:'کلمات کلیدی SEO'},{k:'og_image',l:'تصویر OG'}
  ];
  function bindExcel(){
    var exp=document.getElementById('adm-export-excel');
    var modal=document.getElementById('adm-export-modal');
    var colsBox=document.getElementById('adm-export-cols');
    function openEx(){ if(colsBox) colsBox.innerHTML=EXPORT_COL_DEFS.map(function(c){return '<label style=\"display:flex;gap:6px;align-items:center;min-width:140px\"><input type=\"checkbox\" value=\"'+c.k+'\" checked> '+c.l+'</label>';}).join(''); if(modal){modal.classList.add('is-open');modal.setAttribute('aria-hidden','false');}}
    function closeEx(){ if(modal){modal.classList.remove('is-open');modal.setAttribute('aria-hidden','true');}}
    if(exp) exp.addEventListener('click', openEx);
    document.addEventListener('click',function(e){ if(e.target.closest('[data-export-close]')) closeEx(); });
    var radios=document.querySelectorAll('input[name=\"exp-type\"]');
    radios.forEach(function(r){ r.addEventListener('change',function(){ var v=document.querySelector('input[name=\"exp-type\"]:checked').value; if(colsBox) colsBox.style.display=v==='custom'?'flex':'none'; });});
    var dl=document.getElementById('adm-export-download');
    if(dl) dl.addEventListener('click', function(){
      var type=document.querySelector('input[name=\"exp-type\"]:checked').value;
      var url=API_BASE+'/products/export/excel?type='+type;
      if(type==='custom'){ var sel=Array.from(colsBox.querySelectorAll('input:checked')).map(function(i){return i.value;}); if(!sel.length){alert('حداقل یک ستون انتخاب کنید');return;} url+='&cols='+encodeURIComponent(sel.join(',')); }
      var t=adminToken(); fetch(url,{headers:{'Authorization':'Bearer '+t}}).then(function(r){ if(!r.ok) throw new Error('export failed'); return r.blob(); }).then(function(b){ var u=URL.createObjectURL(b); var a=document.createElement('a'); a.href=u; a.download='products.xlsx'; a.click(); URL.revokeObjectURL(u); closeEx(); }).catch(function(e){ alert('خطا در خروجی: '+e.message); });
    });
    var btn=document.getElementById('adm-import-excel-btn'), inp=document.getElementById('adm-import-excel-file');
    if(btn && inp){ btn.addEventListener('click', function(){ inp.click(); }); inp.addEventListener('change', function(){
      var f=inp.files[0]; if(!f) return; var fd=new FormData(); fd.append('file', f);
      var t=adminToken();
      // preview
      fetch(API_BASE+'/products/import/preview',{method:'POST', headers:{'Authorization':'Bearer '+t}, body:fd}).then(function(r){ return r.json().then(function(j){ return {ok:r.ok, j:j};});}).then(function(r){
        var j=r.j; if(!r.ok){ alert(j.error||'خطا'); return; }
        var msg='پیش‌نمایش ('+j.totalRows+' ردیف):\n'+ (j.preview||[]).map(function(p){ return 'ردیف '+p.row+': '+p.name+' ['+(p.action==='update'?'ویرایش':'ایجاد')+']'; }).join('\n')+'\n\nادامه می‌دهید؟';
        if(!confirm(msg)) return;
        var fd2=new FormData(); fd2.append('file', f);
        fetch(API_BASE+'/products/import/excel',{method:'POST', headers:{'Authorization':'Bearer '+t}, body:fd2}).then(function(rr){return rr.json().then(function(jj){return {ok:rr.ok,j:jj}})}).then(function(rr){
          if(!rr.ok){ alert(rr.j.error||'خطا در ورود'); return; }
          alert('موفق: '+rr.j.message + (rr.j.errors&&rr.j.errors.length?' - خطاها: '+rr.j.errors.length:''));
          location.reload();
        });
      });
      inp.value='';
    }); }
  }
  document.addEventListener('DOMContentLoaded', bindExcel);

  async function api(path, opts) {
    var headers = { 'Content-Type': 'application/json' };
    var t = adminToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    var res = await fetch(API_BASE + path, Object.assign(
      { headers: headers }, opts || {}));
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
    return data;
  }

  var PRODUCT_IMAGES = [
    'hikvision-ds-2cd2t47wd-l3.svg', 'hikvision-ds-2cd2143g2-i.svg',
    'dahua-hdw3441r3.svg', 'uniview-ipc2124sr3-ud.svg', 'tiandy-tc-s32di.svg',
    'hikvision-ds-7608ni-k2-8.svg', 'dahua-nvr4216-4k.svg',
    'tiandy-td-5108k1.svg', 'uniview-nvr308-32x.svg',
    'feritac-wireless-alarm-kit.svg', 'feritac-access-control-500.svg',
    'feritac-speed-gate-2-lane.svg', 'feritac-addressable-fire-alarm.svg',
    'feritac-motorized-lens-4-12mm.svg', 'feritac-fixed-lens-4mm.svg',
    'feritac-dome-camera-housing.svg', 'zyxel-gs1200-8-poe.svg',
    'ubiquiti-usw-flex-8-poe.svg', 'ubiquiti-ubr-ir.svg',
    'tp-link-cat6-305m.svg', 'feritac-camera-mount-bracket.svg',
    'feritac-camera-power-adapter-12v2a.svg', 'sepco-safety-helmet.svg',
    'sepco-insulated-gloves.svg', 'feritac-wall-rack-9u.svg',
    'feritac-floor-cabinet-75cm.svg', 'feritac-cctv-test-probe.svg',
    'feritac-network-cable-tester.svg', 'wd-purple-4tb.svg',
    'seagate-skyhawk-6tb.svg', 'generic-security-monitor-22.svg',
    'feritac-ups-600va.svg', 'tp-link-coaxial-rg59-bnc-100m.svg',
    'tp-link-camera-power-cable-2x1.svg', 'tp-link-bnc-connector-10.svg',
    'feritac-pir-motion-sensor.svg', 'feritac-rfid-card-tag.svg'
  ];

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function toast(msg, type) {
    if (window.CamzyAdmin && window.CamzyAdmin.showToast) window.CamzyAdmin.showToast(msg, type);
  }
  function fa(n) { try { return Number(n || 0).toLocaleString('fa-IR'); } catch (e) { return String(n); } }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function resolveProductImg(v) {
    v = String(v || '');
    if (!v) return '';
    if (/^(https?:|data:|blob:|\/)/i.test(v)) return v;
    if (v.indexOf('assets/') === 0) return '../' + v;
    if (v.indexOf('/') !== -1) return '../' + v.replace(/^\/+/, '');
    return '../assets/images/products/' + v;
  }

  /* ── Catalog (API-backed, AppData fallback) ─────────────── */
  function normalizeBase(p, i) {
    var stock = typeof p.stockCount === 'number' ? p.stockCount
      : (typeof p.stock === 'number' ? p.stock : (p.inStock === false ? 0 : 50));
    var isActive = p.isActive !== undefined ? !!p.isActive : (p.status !== 'inactive');
    var status = !isActive ? 'inactive' : ((p.status === 'outofstock' || p.inStock === false || stock <= 0) ? 'outofstock' : 'active');
    // preserve existing specs/features from API (legacy specs_json -> features)
    var feats = p.features;
    if(!Array.isArray(feats) || !feats.length){
      if(p.specs && typeof p.specs==='object' && !Array.isArray(p.specs)){
        feats=Object.keys(p.specs).map(function(k){return {key:k,value:String(p.specs[k])};});
      } else if(Array.isArray(p.specs)) feats=p.specs;
    }
    return {
      id: p.id != null ? p.id : i + 1,
      name: p.name || '',
      sku: p.sku || '',
      brand: p.brandName || p.brand || '',
      brandKey: p.brand || '',
      category: p.category || '',
      categorySlug: p.categorySlug || p.category_slug || '',
      price: Number(p.price) || 0,
      stock: stock,
      isActive: isActive,
      status: status,
      image: (p.image || '').split('/').pop() || PRODUCT_IMAGES[0],
      desc: p.shortDescription || p.desc || '',
      specs: p.specs || {},
      features: Array.isArray(feats)? feats : [],
      custom: false
    };
  }
  // Read-only fallback catalog (API unreachable): storefront AppData.
  function baseProducts() {
    try {
      if (window.AppData && Array.isArray(window.AppData.products)) {
        return window.AppData.products.map(normalizeBase);
      }
    } catch (e) {}
    return [];
  }
  function currentFilters() {
    return {
      q: searchInput ? searchInput.value.trim() : '',
      category: catFilter ? catFilter.value : 'all',
      stock: stockFilter ? stockFilter.value : 'all',
      status: statusFilter ? statusFilter.value : 'all'
    };
  }
  function buildQuery() {
    var f = currentFilters();
    var parts = ['count=1', 'limit=' + PAGE_SIZE, 'offset=' + ((page - 1) * PAGE_SIZE)];
    if (f.q) parts.push('q=' + encodeURIComponent(f.q));
    if (f.category && f.category !== 'all') parts.push('category=' + encodeURIComponent(f.category));
    if (f.stock && f.stock !== 'all') parts.push('stock=' + encodeURIComponent(f.stock));
    if (f.status && f.status !== 'all') parts.push('status=' + encodeURIComponent(f.status));
    return '/products?' + parts.join('&');
  }
  async function loadProducts() {
    if (!useApi) return { items: baseProducts(), total: products.length || 0 };
    try {
      var data = await api(buildQuery());
      if (Array.isArray(data)) return { items: data.map(normalizeBase), total: data.length };
      return { items: (data.items || []).map(normalizeBase), total: data.total != null ? data.total : 0 };
    } catch (e) {
      useApi = false;
      toast('اتصال به سرور برقرار نشد؛ حالت فقط‌خواندن', 'danger');
      var list = baseProducts();
      return { items: list, total: list.length };
    }
  }
  function toPayload(f) {
    return {
      name: f.name, sku: f.sku, brandKey: f.brandKey, model: f.model,
      brandName: f.brand, categorySlug: f.categorySlug, category: f.category, subcategory: f.subcategory,
      price: f.price, salePrice: f.salePrice, discount: f.discount, discountEndsAt: f.discountEndsAt,
      stock: f.stock, stockStatus: f.stockStatus, minOrder: f.minOrder, maxOrder: f.maxOrder, warehouse: f.warehouse,
      status: f.status, isActive: f.isActive, weight: f.weight, dimensions: f.dimensions,
      image: f.image, gallery: f.gallery, images: f.images, desc: f.desc, description: f.description,
      specs: f.specs, features: f.features, variants: f.variants, shipping: f.shipping,
      manufacturer: f.manufacturer, country: f.country, warranty: f.warranty, includedItems: f.includedItems, authenticity: f.authenticity,
      slug: f.slug, seoTitle: f.seoTitle, seoDescription: f.seoDescription, seoKeywords: f.seoKeywords, ogImage: f.ogImage
    };
  }
  async function apiCreate(f) { return normalizeBase(await api('/products', { method: 'POST', body: JSON.stringify(toPayload(f)) }), 0); }
  async function apiUpdate(id, f) { return normalizeBase(await api('/products/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(toPayload(f)) }), 0); }
  async function apiRemove(id) { await api('/products/' + encodeURIComponent(id), { method: 'DELETE' }); }

  var categoryCache = null;
  var brandCache = null;
  function appDataCategories() {
    try {
      if (window.AppData && Array.isArray(window.AppData.categories)) {
        return window.AppData.categories.map(function (c) {
          return { slug: c.slug, name: c.name };
        });
      }
    } catch (e) {}
    return [];
  }
  function appDataBrands() {
    try {
      if (window.AppData && Array.isArray(window.AppData.brands)) {
        return window.AppData.brands.map(function (b) {
          return { key: b.name, name: b.displayName || b.name };
        });
      }
    } catch (e) {}
    return [];
  }
  function categories() { return categoryCache || appDataCategories(); }
  function brands() { return brandCache || appDataBrands(); }
  async function loadCatalogMeta() {
    if (!useApi) return;
    try {
      var cats = await api('/categories');
      if (Array.isArray(cats)) {
        categoryCache = cats.map(function (c) { return { slug: c.slug, name: c.name }; });
      }
    } catch (e) {}
    try {
      var brs = await api('/brands');
      if (Array.isArray(brs)) {
        brandCache = brs.map(function (b) {
          return { key: b.name, name: b.displayName || b.display_name || b.name };
        });
      }
    } catch (e) {}
  }

  var products = [];
  var total = 0;
  var page = 1;
  var deleteId = null;
  var busy = false;
  var debounce = null;

  /* ── Rendering ────────────────────────────────────────────── */
  var tbody = $('#adm-products-table tbody');
  var searchInput = $('#adm-products-search');
  var catFilter = $('#adm-products-category');
  var stockFilter = $('#adm-products-stock');
  var statusFilter = $('#adm-products-status');
  var pagination = $('#adm-products-pagination');
  var countMeta = $('.admin-view[data-view="products"] .adm-table-footer__meta');
  var cardSub = $('.admin-view[data-view="products"] .adm-card__sub');

  function stockBadge(p) {
    if (p.status === 'outofstock' || p.stock <= 0) {
      return '<span class="adm-stock adm-stock--out"><span class="adm-stock__dot"></span>ناموجود</span><div class="adm-table__sub">' + fa(0) + ' عدد</div>';
    }
    if (p.stock <= 10) {
      return '<span class="adm-stock adm-stock--low"><span class="adm-stock__dot"></span>موجودی کم</span><div class="adm-table__sub">' + fa(p.stock) + ' عدد</div>';
    }
    return '<span class="adm-stock adm-stock--in"><span class="adm-stock__dot"></span>در انبار</span><div class="adm-table__sub">' + fa(p.stock) + ' عدد</div>';
  }
  function statusBadge(p) {
    if (!p.isActive || p.status === 'inactive') return '<span class="adm-badge adm-badge--muted">غیرفعال</span>';
    if (p.status === 'outofstock') return '<span class="adm-badge adm-badge--warning">ناموجود</span>';
    return '<span class="adm-badge adm-badge--success">فعال</span>';
  }

  var EDIT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>';
  var DEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  function pageCount() { return Math.max(1, Math.ceil(total / PAGE_SIZE)); }

  function renderPagination() {
    if (!pagination) return;
    var pages = pageCount();
    if (pages <= 1) { pagination.innerHTML = ''; return; }
    var nums = [];
    [1, 2, page - 1, page, page + 1, pages - 1, pages].forEach(function (p) {
      if (p >= 1 && p <= pages && nums.indexOf(p) === -1) nums.push(p);
    });
    nums.sort(function (a, b) { return a - b; });
    var html = '<button type="button" class="adm-pagination__btn" data-ppage="prev"' + (page <= 1 ? ' disabled' : '') + ' aria-label="صفحه قبل">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg></button>';
    var prev = 0;
    nums.forEach(function (p) {
      if (p - prev > 1) html += '<button type="button" class="adm-pagination__btn" disabled>…</button>';
      html += '<button type="button" class="adm-pagination__btn' + (p === page ? ' is-active' : '') + '" data-ppage="' + p + '">' + fa(p) + '</button>';
      prev = p;
    });
    html += '<button type="button" class="adm-pagination__btn" data-ppage="next"' + (page >= pages ? ' disabled' : '') + ' aria-label="صفحه بعد">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 6 9 12 15 18"/></svg></button>';
    pagination.innerHTML = html;
  }

  function render() {
    if (!tbody) return;
    if (!products.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--color-text-muted-dark)">محصولی یافت نشد.</td></tr>';
    } else {
      tbody.innerHTML = products.map(function (p) {
        return '<tr data-id="' + p.id + '">' +
          '<td><div class="adm-product"><span class="adm-product__thumb"><img src="' + esc(resolveProductImg(p.image)) + '" alt="' + esc(p.name) + '" loading="lazy"></span>' +
          '<span class="adm-product__name">' + esc(p.name) + '</span></div></td>' +
          '<td><span class="adm-table__sub" style="direction:ltr">' + esc(p.sku) + '</span></td>' +
          '<td>' + esc(p.category) + '</td>' +
          '<td>' + fa(p.price) + '</td>' +
          '<td>' + stockBadge(p) + '</td>' +
          '<td>' + statusBadge(p) + '</td>' +
          '<td><div class="adm-table__cell-actions">' +
          '<button type="button" class="adm-btn-icon" data-pedit="' + p.id + '" title="ویرایش">' + EDIT_SVG + '</button>' +
          '<button type="button" class="adm-btn-icon adm-btn-icon--danger" data-pdel="' + p.id + '" title="حذف">' + DEL_SVG + '</button>' +
          '</div></td></tr>';
      }).join('');
    }
    var from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    var to = Math.min(page * PAGE_SIZE, total);
    if (countMeta) countMeta.textContent = 'نمایش ' + fa(from) + ' تا ' + fa(to) + ' از ' + fa(total) + ' محصول';
    if (cardSub) cardSub.textContent = fa(total) + ' محصول ثبت‌شده در فروشگاه';
    renderPagination();
  }

  async function reload() {
    if (!useApi && !window.AppData) { render(); return; }
    try {
      var r = await loadProducts();
      products = r.items;
      total = r.total;
      if (page > pageCount()) page = pageCount();
      render();
    } catch (err) {
      toast(err.message || 'دریافت محصولات ناموفق بود', 'danger');
    }
  }

  /* ── Modal helpers ────────────────────────────────────────── */
  var pmModal = $('#adm-product-modal');
  var delModal = $('#adm-delete-modal');

  function openModal(m) { if (m) { m.classList.add('is-open'); m.setAttribute('aria-hidden', 'false'); } }
  function closeModal(m) { if (m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); } }

  function fillSelects() {
    var catSel = $('#adm-pm-category');
    var brandSel = $('#adm-pm-brand');
    var imgSel = $('#adm-pm-image');
    if (catSel) {
      catSel.innerHTML = categories().map(function (c) {
        return '<option value="' + esc(c.slug) + '">' + esc(c.name) + '</option>';
      }).join('');
    }
    if (brandSel) {
      brandSel.innerHTML = '<option value="">— بدون برند —</option>' + brands().map(function (b) {
        return '<option value="' + esc(b.key) + '">' + esc(b.name) + '</option>';
      }).join('');
    }
    if (imgSel) {
      imgSel.innerHTML = PRODUCT_IMAGES.map(function (f) {
        return '<option value="' + esc(f) + '">' + esc(f) + '</option>';
      }).join('');
    }
  }

  function brandNameFor(key) {
    var b = brands().filter(function (x) { return x.key === key; })[0];
    return b ? b.name : key;
  }
  function catNameFor(slug) {
    var c = categories().filter(function (x) { return x.slug === slug; })[0];
    return c ? c.name : slug;
  }

  function renderFeatures(rows){
    var box=$('#adm-pm-features'); if(!box) return;
    box.innerHTML=(rows||[]).map(function(f,i){
      return '<div class="adm-features-row" style="display:flex;gap:8px;align-items:center"><input class="input" data-feat-key placeholder="نام ویژگی" value="'+esc(f.key||f.name||'')+'" style="flex:1"><input class="input" data-feat-val placeholder="مقدار" value="'+esc(f.value||f.val||'')+'" style="flex:1"><button type="button" class="btn btn-secondary btn-sm" data-feat-del="'+i+'">حذف</button></div>';
    }).join('');
  }
  function collectFeatures(){
    var rows=$$('#adm-pm-features [data-feat-key]');
    var out=[];
    rows.forEach(function(kEl){
      var vEl=kEl.parentNode.querySelector('[data-feat-val]');
      var k=kEl.value.trim(), v=vEl? vEl.value.trim():'';
      if(k||v) out.push({key:k,value:v});
    });
    return out;
  }
  function renderOptions(rows){
    var box=$('#adm-pm-options'); if(!box) return;
    box.innerHTML=(rows||[]).map(function(o,i){
      var discPrice = o.discountPrice != null && o.discountPrice !== '' ? o.discountPrice : '';
      var discPct = o.discountPercent != null && o.discountPercent !== '' ? o.discountPercent : '';
      var active = o.isActive !== undefined ? !!o.isActive : true;
      return '<div class="adm-options-row" data-opt-id="'+(o.id != null ? esc(o.id) : '')+'" style="display:grid;grid-template-columns:1.5fr 2fr 1fr 1fr 1fr auto auto;gap:8px;align-items:center">'
        + '<input class="input" data-opt-title placeholder="عنوان گزینه" value="'+esc(o.title||'')+'">'
        + '<input class="input" data-opt-desc placeholder="توضیح (اختیاری)" value="'+esc(o.description||'')+'">'
        + '<input class="input" data-opt-price type="number" min="0" step="1000" placeholder="قیمت" value="'+esc(o.price != null ? o.price : '')+'" style="direction:ltr">'
        + '<input class="input" data-opt-dpct type="number" min="0" max="100" step="1" placeholder="% تخفیف" value="'+esc(discPct)+'" style="direction:ltr">'
        + '<input class="input" data-opt-dprice type="number" min="0" step="1000" placeholder="قیمت با تخفیف" value="'+esc(discPrice)+'" style="direction:ltr">'
        + '<label style="display:flex;gap:4px;align-items:center;font-size:12px;white-space:nowrap" title="گزینه فعال در صفحه محصول نمایش داده می‌شود"><input type="checkbox" data-opt-active'+(active?' checked':'')+'> فعال</label>'
        + '<button type="button" class="btn btn-secondary btn-sm" data-opt-del="'+i+'">حذف</button>'
        + '</div>';
    }).join('');
  }

  function collectOptions(){
    var rows=$$('#adm-pm-options .adm-options-row');
    var out=[];
    rows.forEach(function(row){
      var idRaw=row.getAttribute('data-opt-id');
      var title=row.querySelector('[data-opt-title]').value.trim();
      var desc=row.querySelector('[data-opt-desc]').value.trim();
      var price=Math.max(0,Math.round(Number(row.querySelector('[data-opt-price]').value)||0));
      var dpct=row.querySelector('[data-opt-dpct]').value.trim();
      var dprice=row.querySelector('[data-opt-dprice]').value.trim();
      var active=row.querySelector('[data-opt-active]').checked;
      if(title||price>0||dpct||dprice){
        out.push({
          id: idRaw ? Number(idRaw) : null,
          title: title,
          description: desc,
          price: price,
          discountPercent: dpct ? Math.max(0,Math.min(100,Math.round(Number(dpct)))) : 0,
          discountPrice: dprice ? Math.max(0,Math.round(Number(dprice))) : null,
          isActive: active
        });
      }
    });
    return out;
  }

  async function syncOptions(productId, options){
    // Id-based sync: PUT existing rows, POST new rows, DELETE removed rows.
    var existing=[];
    try {
      existing = await api('/admin/products/' + encodeURIComponent(productId) + '/options');
    } catch (e) { existing=[]; }
    var existingById={};
    (existing||[]).forEach(function(o){ existingById[o.id]=o; });
    var seen={};
    for (var i=0; i<options.length; i++) {
      var opt=options[i];
      var payload={ title: opt.title, description: opt.description, price: opt.price,
        discountPercent: opt.discountPercent, discountPrice: opt.discountPrice, isActive: opt.isActive };
      if (opt.id && existingById[opt.id]) {
        await api('/admin/products/' + encodeURIComponent(productId) + '/options/' + encodeURIComponent(opt.id), {
          method: 'PUT', body: JSON.stringify(payload)
        });
        seen[opt.id]=true;
      } else {
        await api('/admin/products/' + encodeURIComponent(productId) + '/options', {
          method: 'POST', body: JSON.stringify(payload)
        });
      }
    }
    for (var eid in existingById) {
      if (existingById.hasOwnProperty(eid) && !seen[eid]) {
        await api('/admin/products/' + encodeURIComponent(productId) + '/options/' + encodeURIComponent(eid), {
          method: 'DELETE'
        });
      }
    }
  }

  function openAdd() {
    $('#adm-product-form').reset();
    $('#adm-pm-id').value = '';
    $('#adm-pm-title').textContent = 'افزودن محصول';
    $('#adm-pm-submit').textContent = 'ذخیره محصول';
    $('#adm-pm-image').value = PRODUCT_IMAGES[0];
    renderFeatures([]);
    renderOptions([]);
    updatePreview();
    openModal(pmModal);
  }
  async function openEdit(id) {
    var p = products.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!p) return;
    $('#adm-pm-id').value = p.id;
    $('#adm-pm-name').value = p.name;
    $('#adm-pm-sku').value = p.sku;
    $('#adm-pm-brand').value = p.brandKey || '';
    $('#adm-pm-category').value = p.categorySlug;
    $('#adm-pm-price').value = p.price;
    $('#adm-pm-stock').value = p.stock;
    $('#adm-pm-status').value = p.isActive ? (p.status === 'outofstock' ? 'outofstock' : 'active') : 'inactive';
    $('#adm-pm-desc').value = p.desc || p.shortDescription || '';
    // load features from API (features_json)
    var feats = p.features || [];
    if(!Array.isArray(feats) && p.specs && typeof p.specs==='object'){
      feats=Object.keys(p.specs).map(function(k){ return {key:k,value:String(p.specs[k])}; });
    }
    renderFeatures(feats);
    // load add-on options via the ADMIN endpoint (includes inactive ones, so
    // saving the product never drops disabled options).
    if (useApi) {
      try {
        var optsData = await api('/admin/products/' + encodeURIComponent(p.id) + '/options');
        renderOptions(optsData);
      } catch (e) {
        renderOptions([]);
      }
    } else {
      renderOptions([]);
    }
    if (PRODUCT_IMAGES.indexOf(p.image) === -1) PRODUCT_IMAGES.push(p.image);
    fillImageOptions();
    $('#adm-pm-image').value = p.image;
    updatePreview();
    $('#adm-pm-title').textContent = 'ویرایش محصول';
    $('#adm-pm-submit').textContent = 'به‌روزرسانی محصول';
    openModal(pmModal);
  }
  function fillImageOptions() {
    var imgSel = $('#adm-pm-image');
    imgSel.innerHTML = PRODUCT_IMAGES.map(function (f) {
      return '<option value="' + esc(f) + '">' + esc(f) + '</option>';
    }).join('');
  }
  function updatePreview() {
    var img = $('#adm-pm-preview img');
    var sel = $('#adm-pm-image');
    if (img && sel && sel.value) img.src = resolveProductImg(sel.value);
  }

  /* ── Events ───────────────────────────────────────────────── */
  function resetPageAndReload() { page = 1; reload(); }
  if (searchInput) searchInput.addEventListener('input', function () {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(resetPageAndReload, 350);
  });
  if (catFilter) catFilter.addEventListener('change', resetPageAndReload);
  if (stockFilter) stockFilter.addEventListener('change', resetPageAndReload);
  if (statusFilter) statusFilter.addEventListener('change', resetPageAndReload);
  if (pagination) pagination.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-ppage]') : null;
    if (!btn || btn.disabled) return;
    var v = btn.getAttribute('data-ppage');
    if (v === 'prev') { if (page > 1) page--; else return; }
    else if (v === 'next') { if (page < pageCount()) page++; else return; }
    else page = Math.max(1, Math.min(pageCount(), parseInt(v, 10) || 1));
    reload();
  });

  var addBtn = $('#adm-add-product-btn');
  if (addBtn) addBtn.addEventListener('click', function (e) { e.preventDefault(); openAdd(); });

  document.addEventListener('click', function (e) {
    var editBtn = e.target.closest ? e.target.closest('[data-pedit]') : null;
    if (editBtn) { e.preventDefault(); openEdit(editBtn.getAttribute('data-pedit')); return; }
    var delBtn = e.target.closest ? e.target.closest('[data-pdel]') : null;
    if (delBtn) {
      e.preventDefault();
      deleteId = delBtn.getAttribute('data-pdel');
      var p = products.filter(function (x) { return String(x.id) === String(deleteId); })[0];
      $('#adm-del-text').textContent = p ? '«' + p.name + '» حذف شود؟ این عمل قابل بازگشت نیست.' : 'آیا از حذف این محصول مطمئن هستید؟';
      openModal(delModal);
      return;
    }
    if (e.target.closest && e.target.closest('[data-pm-close]')) closeModal(pmModal);
    if (e.target.closest && e.target.closest('[data-del-close]')) { closeModal(delModal); deleteId = null; }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeModal(pmModal); closeModal(delModal); deleteId = null; }
  });

  var imgSel = $('#adm-pm-image');
  if (imgSel) imgSel.addEventListener('change', updatePreview);
  var featAdd=$('#adm-pm-features-add');
  if(featAdd) featAdd.addEventListener('click', function(){ var cur=collectFeatures(); cur.push({key:'',value:''}); renderFeatures(cur); });
  var featBox=$('#adm-pm-features');
  if(featBox) featBox.addEventListener('click', function(e){ var b=e.target.closest('[data-feat-del]'); if(!b) return; var idx=parseInt(b.getAttribute('data-feat-del'),10); var cur=collectFeatures(); cur.splice(idx,1); renderFeatures(cur); });

  var optAdd=$('#adm-pm-options-add');
  if(optAdd) optAdd.addEventListener('click', function(){ var cur=collectOptions(); cur.push({id:null,title:'',description:'',price:0,discountPercent:0,discountPrice:null,isActive:true}); renderOptions(cur); });
  var optBox=$('#adm-pm-options');
  if(optBox) optBox.addEventListener('click', function(e){ var b=e.target.closest('[data-opt-del]'); if(!b) return; var idx=parseInt(b.getAttribute('data-opt-del'),10); var cur=collectOptions(); cur.splice(idx,1); renderOptions(cur); });

  var delConfirm = $('#adm-del-confirm');
  if (delConfirm) delConfirm.addEventListener('click', async function () {
    if (deleteId == null || busy) return;
    if (!useApi) { toast('حالت فقط‌خواندن فعال است', 'danger'); return; }
    busy = true;
    try {
      await apiRemove(deleteId);
      closeModal(delModal);
      deleteId = null;
      if (products.length <= 1 && page > 1) page--;
      await reload();
      toast('محصول حذف شد', 'danger');
    } catch (err) {
      toast(err.message || 'حذف محصول ناموفق بود', 'danger');
    } finally {
      busy = false;
    }
  });

  var form = $('#adm-product-form');
  if (form) form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (busy) return;
    var id = $('#adm-pm-id').value;
    var name = $('#adm-pm-name').value.trim();
    var sku = $('#adm-pm-sku').value.trim();
    var brandKey = $('#adm-pm-brand').value;
    var catSlug = $('#adm-pm-category').value;
    var price = Math.max(0, Math.round(Number($('#adm-pm-price').value) || 0));
    var stock = Math.max(0, Math.round(Number($('#adm-pm-stock').value) || 0));
    var status = $('#adm-pm-status').value;
    var image = $('#adm-pm-image').value || PRODUCT_IMAGES[0];
    var desc = $('#adm-pm-desc').value.trim();

    if (!name) { toast('نام محصول الزامی است', 'danger'); $('#adm-pm-name').focus(); return; }
    if (!sku) { toast('کد SKU الزامی است', 'danger'); $('#adm-pm-sku').focus(); return; }
    if (!catSlug) { toast('دسته‌بندی را انتخاب کنید', 'danger'); return; }
    if (!useApi) { toast('حالت فقط‌خواندن فعال است', 'danger'); return; }

    var isActive = status !== 'inactive';
    var effStock = stock;
    var effStatus = status;
    if (status === 'outofstock') effStock = 0;
    else if (stock === 0 && isActive) effStatus = 'outofstock';

    var fields = {
      name: name, sku: sku, brandKey: brandKey, brand: brandNameFor(brandKey),
      categorySlug: catSlug, category: catNameFor(catSlug),
      price: price,      stock: effStock, status: effStatus, isActive: isActive, image: image, desc: desc, features: collectFeatures()
    };
    var options = collectOptions();
    busy = true;
    try {
      var productId = id;
      if (id) {
        await apiUpdate(id, fields);
        toast('محصول به‌روزرسانی شد', 'success');
      } else {
        var newProd = await apiCreate(fields);
        productId = newProd && newProd.id;
        page = 1;
        toast('محصول جدید اضافه شد', 'success');
      }
      // Persist add-on options (id-based diff; rows removed in the editor are deleted).
      if (productId && useApi) {
        await syncOptions(productId, options);
      }
      closeModal(pmModal);
      await reload();
    } catch (err) {
      toast(err.message || 'ذخیره محصول ناموفق بود', 'danger');
    } finally {
      busy = false;
    }
  });

  /* ── Init ─────────────────────────────────────────────────── */
  fillSelects();
  loadCatalogMeta().then(function () {
    fillSelects();
    // Populate toolbar category filter from real categories.
    if (catFilter && categoryCache) {
      var cur = catFilter.value || 'all';
      catFilter.innerHTML = '<option value="all">همه دسته‌بندی‌ها</option>' + categoryCache.map(function (c) {
        return '<option value="' + esc(c.slug) + '">' + esc(c.name) + '</option>';
      }).join('');
      catFilter.value = cur;
    }
    render();
  });
  reload();

  window.CamzyAdminProducts = {
    render: render,
    reload: reload,
    count: function () { return total; }
  };
})();
