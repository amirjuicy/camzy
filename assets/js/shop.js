/* ================================================================
   Camzy — Shop Page Logic
   Handles filtering, sorting, pagination for shop/category/brand
   ================================================================ */
(function() {
  'use strict';
  var $q = function(s, c) { return (c || document).querySelector(s); };
  var $$q = function(s, c) { return [...(c || document).querySelectorAll(s)]; };

  var currentPage = 'shop';
  var currentCategory = null;
  var currentBrand = null;
  var sort = 'relevance';
  var filters = { categories: [], brands: [], minPrice: '', maxPrice: '', inStock: false };
  var page = 1;
  var perPage = 12;
  var filterOpen = false;
  var previousBodyOverflow = '';
  var previousHtmlOverflow = '';

  function init() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('category')) { currentCategory = params.get('category'); currentPage = 'category'; }
    if (params.get('brand')) { currentBrand = params.get('brand'); currentPage = 'brand'; }
    if (params.get('q')) { var q = params.get('q'); $q('#shop-search') && ($q('#shop-search').value = q); }
    // Clean URLs (/category/:slug, /brand/:slug) carry the filter in the pathname.
    try{
      var pathSegs = (window.location.pathname||'').split('/').filter(function(s){ return !!s; });
      if (!params.get('category') && pathSegs.length===2 && pathSegs[0]==='category' && pathSegs[1]) { currentCategory = decodeURIComponent(pathSegs[1]); currentPage = 'category'; }
      if (!params.get('brand') && pathSegs.length===2 && pathSegs[0]==='brand' && pathSegs[1]) { currentBrand = decodeURIComponent(pathSegs[1]); currentPage = 'brand'; }
    }catch(e){}

    setupPage();
    bindEvents();
    render();
    // Re-render once live catalog arrives so admin changes show up.
    try {
      if (!init._catalogHooked) {
        init._catalogHooked = true;
        var refresh = function () { setupPage(); renderFilters(); render(); };
        if (AppData.catalogReady && typeof AppData.catalogReady.then === 'function') {
          AppData.catalogReady.then(refresh);
        }
        document.addEventListener('camzy:catalog-updated', refresh);
      }
    } catch (e) {}
  }

  function setupPage() {
    if (currentPage === 'category' && currentCategory) {
      var cat = AppData.categories.find(function(c) { return c.slug === currentCategory; });
      if (cat) {
        document.title = cat.name + ' | کمزی';
        var t = $q('#page-title'); if (t) t.textContent = cat.name;
        var d = $q('#page-desc'); if (d) d.textContent = cat.description;
        // Check category filter
        filters.categories = [cat.name];
        renderCollectionSchema({
          '@type': 'CollectionPage',
          'name': cat.name,
          'description': cat.description || '',
          'url': (window.App && window.App.absUrl ? window.App.absUrl : function (u) { return u; })('/category/' + encodeURIComponent(cat.slug))
        }, cat.name);
      }
    } else if (currentPage === 'brand' && currentBrand) {
      var br = AppData.brands.find(function(b) { return b.name === currentBrand || b.slug === currentBrand; });
      if (br) {
        document.title = br.displayName + ' | کمزی';
        var t2 = $q('#page-title'); if (t2) t2.textContent = br.displayName;
        var d2 = $q('#page-desc'); if (d2) d2.textContent = br.description;
        filters.brands = [br.displayName];
        renderCollectionSchema({
          '@type': 'CollectionPage',
          'name': br.displayName,
          'description': br.description || '',
          'url': (window.App && window.App.absUrl ? window.App.absUrl : function (u) { return u; })('/brand/' + encodeURIComponent(br.name))
        }, br.displayName);
      }
    } else {
      document.title = 'فروشگاه | کمزی';
    }
    renderFilters();
  }

  /* Breadcrumb + collection structured data for category / brand pages. */
  function renderCollectionSchema(page, label) {
    try {
      if (!window.App || !window.App.upsertJsonLd) return;
      var abs = window.App.absUrl || function (u) { return u; };
      window.App.upsertJsonLd('camzy-collection-schema', page);
      window.App.upsertJsonLd('camzy-breadcrumb-schema', {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': [
          { '@type': 'ListItem', 'position': 1, 'name': 'خانه', 'item': abs('/') },
          { '@type': 'ListItem', 'position': 2, 'name': 'فروشگاه', 'item': abs('/shop') },
          { '@type': 'ListItem', 'position': 3, 'name': label, 'item': abs((page && page.url) || '/shop') }
        ]
      });
    } catch (e) {}
  }

  function getFilteredProducts() {
    var params = new URLSearchParams(window.location.search);
    var q = params.get('q') || '';
    var products = AppData.products.slice();

    if (q) {
      products = products.filter(function(p) {
        return p.name.includes(q) || p.brandName.includes(q) || p.category.includes(q);
      });
    }

    if (filters.categories.length > 0) {
      products = products.filter(function(p) { return filters.categories.includes(p.category); });
    }
    if (filters.brands.length > 0) {
      products = products.filter(function(p) { return filters.brands.includes(p.brandName); });
    }
    if (filters.minPrice) {
      products = products.filter(function(p) { return p.price >= parseInt(filters.minPrice); });
    }
    if (filters.maxPrice) {
      products = products.filter(function(p) { return p.price <= parseInt(filters.maxPrice); });
    }
    if (filters.inStock) {
      products = products.filter(function(p) { return p.inStock; });
    }

    // Sort
    switch (sort) {
      case 'newest': products.sort(function(a,b) { return b.id - a.id; }); break;
      case 'bestseller': products.sort(function(a,b) { return getReviewCount(b.id) - getReviewCount(a.id); }); break;
      case 'cheapest': products.sort(function(a,b) { return a.price - b.price; }); break;
      case 'expensive': products.sort(function(a,b) { return b.price - a.price; }); break;
      default: products.sort(function(a,b) { return (b.isBestSeller ? 1 : 0) - (a.isBestSeller ? 1 : 0); });
    }
    return products;
  }

  function renderFilters() {
    var catContainer = $q('#filter-categories');
    var brandContainer = $q('#filter-brands');
    if (catContainer) {
      catContainer.innerHTML = AppData.categories.map(function(c) {
        var checked = filters.categories.includes(c.name) ? 'checked' : '';
        var catIcon = getCategoryIcon(c.icon) || Icons.package;
        return '<label class="filter-option"><input type="checkbox" value="' + c.name + '" ' + checked + ' onchange="ShopFilter.toggleCategory(this.value, this.checked)"><span class="filter-option__icon">' + catIcon + '</span><span>' + c.name + '</span><span class="filter-option__count">' + c.count + '</span></label>';
      }).join('');
    }
    if (brandContainer) {
      brandContainer.innerHTML = AppData.brands.map(function(b) {
        var checked = filters.brands.includes(b.displayName) ? 'checked' : '';
        return '<label class="filter-option"><input type="checkbox" value="' + b.displayName + '" ' + checked + ' onchange="ShopFilter.toggleBrand(this.value, this.checked)"><span>' + b.displayName + '</span></label>';
      }).join('');
    }
  }

  function render() {
    var products = getFilteredProducts();
    var countEl = $q('#product-count');
    if (countEl) countEl.textContent = Format.toPersianNumber(products.length) + ' محصول';

    var totalPages = Math.ceil(products.length / perPage);
    if (page > totalPages) page = 1;
    var start = (page - 1) * perPage;
    var paginated = products.slice(start, start + perPage);

    var grid = $q('#shop-products-grid');
    if (grid) {
      if (paginated.length === 0) {
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><span class="empty-state__icon">' + Icons.package + '</span><h3 class="empty-state__title">محصولی یافت نشد</h3><p class="empty-state__text">فیلترها را تغییر دهید یا عبارت دیگری جستجو کنید.</p></div>';
      } else {
        grid.innerHTML = paginated.map(function(p) { return renderProductCard(p); }).join('');
      }
    }

    renderPagination(totalPages);
  }

  function renderProductCard(p) {
    return App.renderProductCard(p, { showStock: true });
  }

  function renderPagination(total) {
    var el = $q('#pagination');
    if (!el || total <= 1) { if (el) el.innerHTML = ''; return; }
    var html = '<button class="pagination__btn pagination__btn--prev" ' + (page === 1 ? 'disabled' : '') + ' onclick="ShopFilter.goPage(' + (page - 1) + ')">بعدی</button>';
    for (var i = 1; i <= total; i++) {
      html += '<button class="pagination__btn ' + (i === page ? 'is-active' : '') + '" onclick="ShopFilter.goPage(' + i + ')">' + Format.toPersianNumber(i) + '</button>';
    }
    html += '<button class="pagination__btn pagination__btn--next" ' + (page === total ? 'disabled' : '') + ' onclick="ShopFilter.goPage(' + (page + 1) + ')">قبلی</button>';
    el.innerHTML = html;
  }

  function openFilter() {
    var sidebar = $q('.shop-sidebar');
    var backdrop = $q('#filter-backdrop');
    if (!sidebar) return;
    previousBodyOverflow = document.body.style.overflow;
    previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    sidebar.classList.add('is-active');
    if (backdrop) backdrop.classList.add('is-active');
    filterOpen = true;
  }

  function closeFilter() {
    var sidebar = $q('.shop-sidebar');
    var backdrop = $q('#filter-backdrop');
    if (!sidebar) return;
    sidebar.classList.remove('is-active');
    if (backdrop) backdrop.classList.remove('is-active');
    document.body.style.overflow = previousBodyOverflow;
    document.documentElement.style.overflow = previousHtmlOverflow;
    filterOpen = false;
  }

  function toggleFilter() {
    if (filterOpen) closeFilter(); else openFilter();
  }

  function bindEvents() {
    var sortEl = $q('#shop-sort');
    if (sortEl) sortEl.addEventListener('change', function() { sort = this.value; page = 1; render(); });

    var searchEl = $q('#shop-search');
    if (searchEl) {
      var debounce;
      searchEl.addEventListener('input', function() {
        var val = this.value;
        clearTimeout(debounce);
        debounce = setTimeout(function() {
          // Update URL param
          var params = new URLSearchParams(window.location.search);
          if (val) params.set('q', val); else params.delete('q');
          var newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
          window.history.replaceState({}, '', newUrl);
          page = 1;
          render();
        }, 300);
      });
    }

    // Filter toggle buttons (both desktop and mobile)
    var filterToggle = $q('#filter-toggle');
    var filterToggleMobile = $q('#filter-toggle-mobile');
    if (filterToggle) filterToggle.addEventListener('click', function() { toggleFilter(); });
    if (filterToggleMobile) filterToggleMobile.addEventListener('click', function() { toggleFilter(); });

    // Filter close button
    var filterClose = $q('#filter-close');
    if (filterClose) filterClose.addEventListener('click', function() { closeFilter(); });

    // Filter backdrop click
    var filterBackdrop = $q('#filter-backdrop');
    if (filterBackdrop) filterBackdrop.addEventListener('click', function() { closeFilter(); });

    // Escape key closes filter
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && filterOpen) closeFilter();
    });

    var stockFilter = $q('#filter-stock');
    if (stockFilter) stockFilter.addEventListener('change', function() { filters.inStock = this.checked; page = 1; render(); });

    var priceMin = $q('#price-min');
    var priceMax = $q('#price-max');
    var priceBtn = $q('#price-filter-btn');
    if (priceBtn) {
      priceBtn.addEventListener('click', function() {
        filters.minPrice = priceMin ? priceMin.value : '';
        filters.maxPrice = priceMax ? priceMax.value : '';
        page = 1; render();
      });
    }
  }

  window.ShopFilter = {
    toggleCategory: function(name, checked) {
      if (checked) { filters.categories.push(name); } else { filters.categories = filters.categories.filter(function(c) { return c !== name; }); }
      page = 1; render();
    },
    toggleBrand: function(name, checked) {
      if (checked) { filters.brands.push(name); } else { filters.brands = filters.brands.filter(function(b) { return b !== name; }); }
      page = 1; render();
    },
    goPage: function(p) { page = p; render(); window.scrollTo(0, 0); },
    clearFilters: function() { filters = { categories: [], brands: [], minPrice: '', maxPrice: '', inStock: false }; page = 1; renderFilters(); render(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
