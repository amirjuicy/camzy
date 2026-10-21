/* ================================================================
   Camzy — Homepage Controller
   Homepage-specific rendering only. All state, cart, wishlist,
   auth, toast, search, mobile menu, cart drawer, and header/footer
   rendering are handled by common.js (window.App).

   This file must be loaded AFTER common.js.
   ================================================================ */

(function () {
  'use strict';

  /* ── Render Functions ─────────────────────────────────────── */
  function renderCategories() {
    var grid = document.getElementById('categories-grid');
    if (!grid) return;
    grid.innerHTML = AppData.categories.map(function(cat) {
      var realCount = AppData.products.filter(function(p) { return p.categorySlug === cat.slug; }).length;
      var bgColor = cat.color || 'var(--color-primary)';
      var bgLight = bgColor + '18';
      return '<a href="/shop?category=' + cat.slug + '" class="category-card" style="color:inherit;text-decoration:none"><div class="category-card__icon" style="background-color:' + bgLight + ';color:' + bgColor + '">' + getCategoryIcon(cat.icon) + '</div><span class="category-card__name">' + cat.name + '</span><span class="category-card__count">' + realCount + ' محصول</span></a>';
    }).join('');
  }

  function renderProductCard(product) {
    return App.renderProductCard(product);
  }

  function renderBestSellers() {
    var grid = document.getElementById('bestsellers-grid');
    if (!grid) return;
    var products = AppData.products.filter(function(p) { return p.isBestSeller; }).slice(0, 5);
    grid.innerHTML = products.map(renderProductCard).join('');
  }

  function renderNewProducts() {
    var grid = document.getElementById('new-products-grid');
    if (!grid) return;
    var products = AppData.products.filter(function(p) { return p.isNew; }).slice(0, 5);
    var remaining = AppData.products.filter(function(p) { return !p.isNew; }).slice(0, 5 - products.length);
    grid.innerHTML = products.concat(remaining).slice(0, 5).map(renderProductCard).join('');
  }

  function renderSpecialOffers() {
    var carousel = document.getElementById('special-offers-grid');
    if (!carousel) return;
    var products = AppData.products.filter(function(p) { return p.discount > 0; });
    if (!products.length) products = AppData.products.slice(0, 8);
    carousel.innerHTML = products.map(function(p) {
      var oldPrice = Format.price(p.oldPrice || p.price);
      var newPrice = Format.price(p.price);
      var discount = p.discount || Math.round((1 - p.price / (p.oldPrice || p.price)) * 100);
      var oldPriceHtml = p.oldPrice ? '<span class="so-card__old-price">' + Format.price(p.oldPrice) + '</span>' : '';
      return '<a href="/product/' + p.slug + '" class="so-card"><div class="so-card__img"><img src="' + p.image + '" alt="' + p.name + '" loading="lazy" onerror="this.onerror=null;this.src=\'' + (p.images && p.images[0] ? p.images[0] : '') + '\'"></div><div class="so-card__body"><p class="so-card__title">' + p.name + '</p><div class="so-card__price"><span class="so-card__discount">%' + discount + '</span>' + oldPriceHtml + '</div><div class="so-card__final"><span class="so-card__new-price">' + newPrice + '</span><span class="so-card__currency">تومان</span></div></div></a>';
    }).join('');

    layoutSpecialOffers();

    enableDragToScroll(carousel);
  }

  function layoutSpecialOffers() {
    var carousel = document.getElementById('special-offers-grid');
    var right = carousel ? carousel.parentElement : null;
    if (!carousel || !right) return;
    var vw = window.innerWidth;
    /* Mobile (<=768px): let the responsive CSS handle card sizing.
       Clear any inline fixed widths so 320–430px layouts stay fluid
       with horizontal scroll and never overflow. Desktop untouched. */
    if (vw <= 768) {
      var mobileCards = carousel.querySelectorAll('.so-card');
      for (var m = 0; m < mobileCards.length; m++) {
        mobileCards[m].style.width = '';
        mobileCards[m].style.minWidth = '';
        mobileCards[m].style.maxWidth = '';
        mobileCards[m].style.flex = '';
      }
      return;
    }
    var available = right.clientWidth - 8; /* 4px padding each side */
    var gap = 4;
    var cardW;
    if (vw <= 430) {
      cardW = Math.min(150, Math.floor((available - gap * 2) / 3));
    } else if (vw <= 768) {
      cardW = Math.min(160, Math.floor((available - gap * 3) / 4));
    } else {
      cardW = Math.min(180, Math.floor((available - gap * 4) / 5));
    }
    cardW = Math.max(cardW, 120);
    var cards = carousel.querySelectorAll('.so-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].style.width = cardW + 'px';
      cards[i].style.minWidth = cardW + 'px';
      cards[i].style.maxWidth = cardW + 'px';
      cards[i].style.flex = 'none';
    }
  }

  function renderRecommendations() {
    var carousel = document.getElementById('rec-carousel');
    if (!carousel) return;
    var products = AppData.products.filter(function(p) { return p.discount > 0; });
    if (products.length < 4) {
      products = AppData.products.filter(function(p) { return p.isBestSeller; }).concat(products);
    }
    products = products.slice(0, 12);
    carousel.innerHTML = products.map(function(p) {
      var discount = p.discount || (p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0);
      var discountHtml = discount > 0
        ? '<span class="rec-card__item-discount">%' + discount + '</span>'
        : '';
      var oldPriceHtml = p.oldPrice
        ? '<span class="rec-card__item-old-price">' + Format.price(p.oldPrice) + '</span>'
        : '';
      var priceRow = discountHtml || oldPriceHtml
        ? '<div class="rec-card__item-price-row">' + discountHtml + oldPriceHtml + '</div>'
        : '';
      return '<a href="/product/' + p.slug + '" class="rec-card__item">' +
        '<div class="rec-card__item-img">' +
          '<img src="' + p.image + '" alt="' + p.name + '" loading="lazy" onerror="this.onerror=null;this.src=\'\'">' +
        '</div>' +
        '<div class="rec-card__item-body">' +
          '<p class="rec-card__item-title">' + p.name + '</p>' +
          '<div class="rec-card__item-price">' +
            priceRow +
            '<div class="rec-card__item-price-row">' +
              '<span class="rec-card__item-new-price">' + Format.price(p.price) + '</span>' +
              '<span class="rec-card__item-currency">تومان</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</a>';
    }).join('');

    /* Carousel scroll arrows */
    var prev = document.getElementById('rec-prev');
    var next = document.getElementById('rec-next');
    if (prev) prev.addEventListener('click', function() { carousel.scrollBy({ left: 200, behavior: 'smooth' }); });
    if (next) next.addEventListener('click', function() { carousel.scrollBy({ left: -200, behavior: 'smooth' }); });

    enableDragToScroll(carousel);
  }

  function renderBrands() {
    var grid = document.getElementById('brands-grid');
    if (!grid) return;
    grid.innerHTML = AppData.brands.slice(0, 6).map(function(brand) {
      var realCount = AppData.products.filter(function(p) { return p.brand === brand.name; }).length;
      var logoHtml = brand.logo ? '<img class="brand-card__logo" src="' + brand.logo + '" alt="' + brand.displayName + '" loading="eager">' : '';
      return '<a href="/brand/' + brand.name + '" class="brand-card" style="color:inherit;text-decoration:none">' + logoHtml + '<span class="brand-card__name">' + brand.displayName + '</span><span class="brand-card__count">' + realCount + ' محصول</span></a>';
    }).join('');
  }

  function faDate(ts){ try{ if(!ts) return ''; var d=new Date(String(ts).trim().replace(' ','T')); if(isNaN(d.getTime())) return ''; return d.toLocaleDateString('fa-IR'); }catch(e){ return ''; } }
  function articleDate(a){ return faDate(a.createdAt||a.created_at)||a.date||''; }
  function renderArticles() {
    var grid = document.getElementById('articles-grid');
    if (!grid) return;
    grid.innerHTML = AppData.articles.slice(0, 3).map(function(article) {
      return '<a href="/article/' + article.id + '" class="article-card" style="color:inherit;text-decoration:none">' +
        '<div class="article-card__image">' +
          (article.image ? '<img src="' + article.image + '" alt="' + article.title + '" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">' : '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-muted)"><span style="width:48px;height:48px">' + Icons.image + '</span></div>') +
          '<span class="article-card__category">' + article.category + '</span>' +
        '</div>' +
        '<div class="article-card__body">' +
          '<h3 class="article-card__title">' + article.title + '</h3>' +
          '<p class="article-card__excerpt">' + article.excerpt + '</p>' +
          '<div class="article-card__meta">' +
            '<span class="article-card__meta-item">' + Icons.calendar + ' ' + articleDate(article) + '</span>' +
            '<span class="article-card__meta-item">' + Icons.clock + ' ' + article.readTime + '</span>' +
          '</div>' +
        '</div>' +
      '</a>';
    }).join('');
  }

  /* ── Countdown Timer ──────────────────────────────────────── */
  function startCountdown() {
    var now = new Date();
    var end = new Date(now);
    end.setHours(23, 59, 59, 999);

    function update() {
      var diff = end - new Date();
      if (diff <= 0) return;
      var hours = Math.floor(diff / 3600000);
      var minutes = Math.floor((diff % 3600000) / 60000);
      var seconds = Math.floor((diff % 60000) / 1000);
      var hEl = document.getElementById('countdown-hours');
      var mEl = document.getElementById('countdown-minutes');
      var sEl = document.getElementById('countdown-seconds');
      if (hEl) hEl.textContent = String(hours).padStart(2, '0');
      if (mEl) mEl.textContent = String(minutes).padStart(2, '0');
      if (sEl) sEl.textContent = String(seconds).padStart(2, '0');
    }

    update();
    setInterval(update, 1000);
  }

  /* ── Hero Slideshow ──────────────────────────────────────────── */
  function initHeroSlideshow() {
    var section = document.getElementById('hero-slideshow');
    if (!section) return;
    /* Singleton state: re-init reuses one controller so duplicate timers /
       listeners can never race each other. */
    var st = section._hero || (section._hero = { bound: false, gen: 0, timer: null, current: 0, paused: false });
    st.gen += 1;
    var myGen = st.gen;
    if (st.timer) { try { clearInterval(st.timer); } catch (e) {} st.timer = null; }
    /* Never start autoplay on the loading placeholder — wait for the real
       slide DOM delivered via hero:updated. */
    var box = section.querySelector('.hero__slides');
    if (!box || box.querySelector('.hero__loading') || box.getAttribute('data-hero-loading') === '1') return;

    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var interval = 5000;
    function liveSlides() { return section.querySelectorAll('.hero__slide'); }
    function liveDots() { return section.querySelectorAll('.hero__dot'); }
    function alive() { return section._hero && section._hero.gen === myGen; }

    /* Enforce exactly one active slide/dot — markup may carry stale state
       (e.g. persisted mid-transition), which would otherwise stack slides. */
    (function normalize() {
      var slides = liveSlides(), dots = liveDots(), i, found = -1;
      if (slides.length < 2) return;
      for (i = 0; i < slides.length; i++) {
        if (slides[i].classList.contains('is-active')) { if (found < 0) found = i; }
      }
      /* Preserve index across re-renders when valid, else start at 0. */
      var want = (st.current >= 0 && st.current < slides.length) ? st.current : 0;
      st.current = found >= 0 ? found : want;
      for (i = 0; i < slides.length; i++) slides[i].classList.toggle('is-active', i === st.current);
      dots.forEach(function (d, i) {
        var on = i === st.current;
        d.classList.toggle('is-active', on);
        d.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    })();

    function goTo(index) {
      if (!alive()) return;
      var slides = liveSlides(), dots = liveDots();
      var total = slides.length;
      if (!total) return;
      var nextIdx = ((typeof index === 'number' ? index : st.current) + total) % total;
      if (nextIdx === st.current) {
        /* Still enforce singularity (a stray class could have been added). */
        for (var k = 0; k < slides.length; k++) slides[k].classList.toggle('is-active', k === st.current);
        return;
      }
      st.current = nextIdx;
      /* Atomic switch: clear ALL first, then activate exactly one. */
      var i;
      for (i = 0; i < slides.length; i++) slides[i].classList.remove('is-active');
      for (i = 0; i < dots.length; i++) { dots[i].classList.remove('is-active'); dots[i].setAttribute('aria-selected', 'false'); }
      slides[st.current].classList.add('is-active');
      if (dots[st.current]) { dots[st.current].classList.add('is-active'); dots[st.current].setAttribute('aria-selected', 'true'); }
      resetTimer();
    }

    function next() { goTo(st.current + 1); }
    function prev() { goTo(st.current - 1); }

    function startTimer() {
      stopTimer();
      if (!alive()) return;
      if (reducedMotion || st.paused) return;
      if (liveSlides().length < 2) return;
      st.timer = setInterval(function () { if (alive()) next(); }, interval);
    }

    function stopTimer() {
      if (st.timer) { try { clearInterval(st.timer); } catch (e) {} st.timer = null; }
    }

    function resetTimer() {
      stopTimer();
      startTimer();
    }

    /* Expose current controller methods on the persistent state so the
       one-time listeners below always call the latest generation's logic. */
    st.goTo = goTo; st.next = next; st.prev = prev;
    st.startTimer = startTimer; st.stopTimer = stopTimer; st.resetTimer = resetTimer;

    /* Bind static listeners exactly once — re-init must not duplicate them. */
    if (!st.bound) {
      st.bound = true;
      /* Navigation buttons (delegated so re-rendered buttons keep working) */
      section.addEventListener('click', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('.hero__nav--prev,.hero__nav--next,.hero__dot') : null;
        if (!t || !section.contains(t)) return;
        if (t.classList.contains('hero__nav--prev')) { e.stopPropagation(); if (st.prev) st.prev(); }
        else if (t.classList.contains('hero__nav--next')) { e.stopPropagation(); if (st.next) st.next(); }
        else if (t.classList.contains('hero__dot')) {
          var idx = parseInt(t.getAttribute('data-dot'), 10);
          if (!isNaN(idx) && st.goTo) st.goTo(idx);
        }
      });

    /* Pause on hover / focus */
    section.addEventListener('mouseenter', function() { st.paused = true; if (st.stopTimer) st.stopTimer(); });
    section.addEventListener('mouseleave', function() { st.paused = false; if (st.startTimer) st.startTimer(); });
    section.addEventListener('focusin', function() { st.paused = true; if (st.stopTimer) st.stopTimer(); });
    section.addEventListener('focusout', function(e) {
      if (!section.contains(e.relatedTarget)) { st.paused = false; if (st.startTimer) st.startTimer(); }
    });

    /* Shared helpers for swipe/drag click suppression */
    var touchStartX = 0, touchStartY = 0;
    var touchMoved = false, touchHorizontal = false;

    function suppressClicks(ms) {
      var suppress = function (ev) { ev.preventDefault(); ev.stopPropagation(); };
      section.addEventListener('click', suppress, true);
      setTimeout(function () { section.removeEventListener('click', suppress, true); }, ms || 400);
    }

    /* Touch swipe support (horizontal only) */
    section.addEventListener('touchstart', function (e) {
      if (!e.touches || !e.touches.length) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchMoved = false;
      touchHorizontal = false;
    }, { passive: true });

    section.addEventListener('touchmove', function (e) {
      if (!e.touches || !e.touches.length) return;
      var dx = e.touches[0].clientX - touchStartX;
      var dy = e.touches[0].clientY - touchStartY;
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      touchMoved = true;
      if (Math.abs(dx) > Math.abs(dy) + 6) {
        touchHorizontal = true;
        if (e.cancelable) e.preventDefault();
      } else {
        touchHorizontal = false;
      }
    }, { passive: false });

    section.addEventListener('touchend', function (e) {
      var t = (e.changedTouches && e.changedTouches.length) ? e.changedTouches[0] : null;
      var endX = t ? t.clientX : touchStartX;
      var endY = t ? t.clientY : touchStartY;
      var dx = touchStartX - endX;
      var dy = touchStartY - endY;
      var wasSwipe = touchMoved && touchHorizontal && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy);
      if (wasSwipe) {
        if (dx > 0) { if (st.next) st.next(); } else { if (st.prev) st.prev(); }
        suppressClicks(400);
      }
      touchMoved = false;
      touchHorizontal = false;
    }, { passive: true });

    section.addEventListener('touchcancel', function () {
      touchMoved = false;
      touchHorizontal = false;
    }, { passive: true });

    /* Mouse click-and-drag (desktop) */
    var mouseDown = false, mouseStartX = 0, mouseStartY = 0, mouseDragged = false;
    function isInteractiveTarget(target) {
      return !!(target && target.closest && target.closest('a,button,input,textarea,select,[role="button"]'));
    }
    section.addEventListener('pointerdown', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (e.button !== 0) return;
      if (isInteractiveTarget(e.target)) return;
      mouseDown = true;
      mouseDragged = false;
      mouseStartX = e.clientX;
      mouseStartY = e.clientY;
      if (section.setPointerCapture && e.pointerId !== undefined) {
        try { section.setPointerCapture(e.pointerId); } catch (err) {}
      }
    }, { passive: true });

    section.addEventListener('pointermove', function (e) {
      if (!mouseDown) return;
      if (e.pointerType && e.pointerType !== 'mouse') return;
      var dx = e.clientX - mouseStartX;
      var dy = e.clientY - mouseStartY;
      if (!mouseDragged && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (!mouseDragged) {
        if (Math.abs(dy) > Math.abs(dx)) { mouseDown = false; return; }
      }
      mouseDragged = true;
      if (e.cancelable) e.preventDefault();
    });

    section.addEventListener('pointerup', function (e) {
      if (!mouseDown && !mouseDragged) return;
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (mouseDown) {
        mouseDown = false;
        if (section.releasePointerCapture && e.pointerId !== undefined) {
          try { section.releasePointerCapture(e.pointerId); } catch (err) {}
        }
      }
      if (!mouseDragged) return;
      var dx = e.clientX - mouseStartX;
      if (Math.abs(dx) > 50) {
        if (dx < 0) { if (st.next) st.next(); } else { if (st.prev) st.prev(); }
      }
      suppressClicks(300);
      mouseDragged = false;
    });

    section.addEventListener('pointercancel', function () {
      mouseDown = false;
      mouseDragged = false;
    });

    section.addEventListener('dragstart', function (e) { e.preventDefault(); });

    /* Keyboard support */
    section.setAttribute('tabindex', '0');
    section.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowLeft') { if (st.next) st.next(); e.preventDefault(); }
      if (e.key === 'ArrowRight') { if (st.prev) st.prev(); e.preventDefault(); }
    });
    } /* end bind-once */

    /* Start (single timer; stale generations are dead) */
    startTimer();
    section._heroCleanup = function(){ stopTimer(); };
  }

  /* ── Mouse drag-to-scroll (desktop only) ────────────────────
     Click-and-drag horizontal scrolling for the homepage product
     carousels. Mouse only: guarded by (pointer: fine) at bind time
     and by pointerType at event time, so touch/mobile scrolling is
     untouched. RTL-aware (site is dir=rtl). A drag suppresses the
     follow-up click so product links don't fire after dragging. */
  function enableDragToScroll(el) {
    /* Prefer the shared helper in common.js (single source of truth for
       all pages). Fall back to the local implementation below. */
    if (window.App && typeof App.enableDragToScroll === 'function') {
      return App.enableDragToScroll(el);
    }
    if (!el || el.dataset.dragScroll === 'on') return;
    if (window.matchMedia && window.matchMedia('(pointer: fine)').matches === false) return;
    el.dataset.dragScroll = 'on';
    el.classList.add('is-draggable');

    var isDown = false;
    var startX = 0;
    var startScroll = 0;
    var dragged = false;
    var momentum = null;

    function isRTL() {
      return window.getComputedStyle(el).direction === 'rtl';
    }

    /* ── Momentum tracking ─────────────────────────────────────── */
    var velSamples = [];
    var sampleTimer = null;
    var DAMPING = 0.85;
    var VELOCITY_INTERVAL = 30;

    function recordSample(e) {
      var now = Date.now();
      velSamples.push({ x: e.clientX, t: now });
      /* keep only last 120 ms of samples */
      while (velSamples.length > 1 && now - velSamples[0].t > 120) velSamples.shift();
    }

    function averageVelocity() {
      if (velSamples.length < 2) return 0;
      var first = velSamples[0];
      var last = velSamples[velSamples.length - 1];
      var dt = last.t - first.t;
      if (dt === 0) return 0;
      return (last.x - first.x) / dt;
    }

    function applyMomentum() {
      var vel = averageVelocity();
      if (Math.abs(vel) < 0.3) {
        momentum = null;
        return;
      }
      var lastTime = Date.now();
      function step() {
        var now = Date.now();
        var dt = now - lastTime;
        lastTime = now;
        vel *= Math.pow(DAMPING, dt / 16);
        el.scrollLeft -= vel * (dt / 16);
        if (Math.abs(vel) < 0.15) {
          momentum = null;
          return;
        }
        momentum = requestAnimationFrame(step);
      }
      momentum = requestAnimationFrame(step);
    }

    el.addEventListener('pointerdown', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (e.button !== undefined && e.button !== 0) return;
      if (el.scrollWidth <= el.clientWidth + 1) return;
      if (momentum) { cancelAnimationFrame(momentum); momentum = null; }
      isDown = true;
      dragged = false;
      startX = e.clientX;
      startScroll = el.scrollLeft;
      velSamples = [{ x: e.clientX, t: Date.now() }];
      el.classList.add('is-dragging');
      if (el.setPointerCapture && e.pointerId !== undefined) {
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      }
    });

    el.addEventListener('pointermove', function (e) {
      if (!isDown) return;
      if (e.pointerType && e.pointerType !== 'mouse') return;
      var dx = e.clientX - startX;
      if (!dragged && Math.abs(dx) < 5) return;
      dragged = true;
      if (e.cancelable) e.preventDefault();
      el.scrollLeft = startScroll - dx * DAMPING;
      recordSample(e);
    });

    function endDrag(e) {
      if (!isDown) return;
      isDown = false;
      el.classList.remove('is-dragging');
      if (dragged && e && e.type === 'pointerup') {
        applyMomentum();
        var suppress = function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        };
        el.addEventListener('click', suppress, true);
        setTimeout(function () { el.removeEventListener('click', suppress, true); }, 100);
      }
      dragged = false;
      velSamples = [];
    }

    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('dragstart', function (e) { e.preventDefault(); });
  }

  /* ── Mobile shortcuts: smooth-scroll to homepage sections ── */
  function bindMobileShortcuts() {
    var items = document.querySelectorAll('.mobile-shortcuts__item');
    if (!items.length) return;
    items.forEach(function (item) {
      item.addEventListener('click', function (e) {
        var id = item.getAttribute('href');
        if (!id || id.charAt(0) !== '#') return;
        var target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        items.forEach(function (i) { i.classList.remove('is-active'); });
        item.classList.add('is-active');
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /* ── Init ─────────────────────────────────────────────────── */
  /* Grids ship pre-rendered (baked) in the homepage HTML. Re-rendering
     them synchronously with fallback data and AGAIN when the live API
     resolves flashes the product cards twice per load. Fill only empty
     grids on the first pass; refresh everything once live data arrives. */
  function renderGrids(onlyEmpty) {
    function fill(id, fn) {
      var g = document.getElementById(id);
      if (!g) return;
      if (onlyEmpty && g.children.length) return;
      fn();
    }
    fill('categories-grid', renderCategories);
    fill('bestsellers-grid', renderBestSellers);
    fill('new-products-grid', renderNewProducts);
    fill('special-offers-grid', renderSpecialOffers);
    fill('rec-carousel', renderRecommendations);
    fill('brands-grid', renderBrands);
    fill('articles-grid', renderArticles);
  }
  function initStaticBits() {
    startCountdown();
    initHeroSlideshow();
    bindMobileShortcuts();
    if (!window.__heroUpdatedBound) { window.__heroUpdatedBound = true; document.addEventListener('hero:updated', function(){ initHeroSlideshow(); }); }
    var resizeTimer;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(layoutSpecialOffers, 100);
    });
  }

  /* ── Boot (catalog comes from /api; static AppData is fallback) ── */
  /* No window.App definition — all shared APIs come from common.js */
  function boot() {
    renderGrids(true);
    initStaticBits();
    try {
      if (AppData.catalogReady && typeof AppData.catalogReady.then === 'function') {
        /* catalogReady resolves true only when the live API actually
           replaced the fallback data — re-render grids just in that case
           so a failed/slow API never flashes identical markup. */
        AppData.catalogReady.then(function (live) {
          if (live) renderGrids(false);
          if (window.App && typeof App.updateWishlistUI === 'function') App.updateWishlistUI();
        });
      }
      document.addEventListener('camzy:catalog-updated', function () { renderGrids(false); });
    } catch (e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
