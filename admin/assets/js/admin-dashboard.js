/* ================================================================
   Camzy — Admin Dashboard (real data via /api/admin/summary)
   Replaces hardcoded stats/chart/top-products/recent-orders with
   live database aggregates. No mocks, no fallbacks to fake numbers.
   ================================================================ */
(function(){
  'use strict';
  function $(s,c){ return (c||document).querySelector(s); }
  function fa(n){ try{ return Number(n||0).toLocaleString('fa-IR'); }catch(e){ return String(n); } }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function adminToken(){ try{ var s=JSON.parse(localStorage.getItem('as_admin_session')||'null'); return s&&s.token||''; }catch(e){ return ''; } }
  var STATUS_META={ pending:{text:'در انتظار پرداخت',badge:'adm-badge--warning'}, processing:{text:'در حال پردازش',badge:'adm-badge--primary'}, shipped:{text:'ارسال‌شده',badge:'adm-badge--info'}, delivered:{text:'تحویل‌شده',badge:'adm-badge--success'}, cancelled:{text:'لغوشده',badge:'adm-badge--danger'} };
  function normStatus(s){ s=String(s||'pending').toLowerCase(); if(s==='shipping') return 'shipped'; return STATUS_META[s]?'pending':s; }
  function loadSummary(){
    var h={ 'Content-Type':'application/json' }; var t=adminToken(); if(t) h['Authorization']='Bearer '+t;
    return fetch('/api/admin/summary',{headers:h}).then(function(r){
      if(!r.ok) throw new Error('summary '+r.status);
      return r.json();
    });
  }
  function renderStats(d){
    var cards=document.querySelectorAll('.adm-stats .adm-stat');
    if(cards.length>=4){
      // card 0: today revenue
      var v0=cards[0].querySelector('.adm-stat__value');
      if(v0) v0.innerHTML=fa(d.todayRevenue)+' <small style="font-size:12px;color:var(--text-muted)">تومان</small>';
      var delta0=cards[0].querySelector('.adm-stat__delta');
      if(delta0) delta0.textContent=fa(d.pendingOrders)+' سفارش در انتظار';
      // card 1: today orders
      var v1=cards[1].querySelector('.adm-stat__value');
      if(v1) v1.textContent=fa(d.todayOrders);
      var delta1=cards[1].querySelector('.adm-stat__delta');
      if(delta1) delta1.textContent=fa(d.totalOrders)+' کل سفارش‌ها';
      // card 2: users
      var v2=cards[2].querySelector('.adm-stat__value');
      if(v2) v2.textContent=fa(d.usersCount);
      var delta2=cards[2].querySelector('.adm-stat__delta');
      if(delta2) delta2.textContent=fa(d.productsCount)+' محصول';
      // card 3: out of stock
      var v3=cards[3].querySelector('.adm-stat__value');
      if(v3) v3.textContent=fa(d.outOfStock);
      var delta3=cards[3].querySelector('.adm-stat__delta');
      if(delta3) delta3.textContent=d.lowStock? fa(d.lowStock)+' موجودی کم':'نیاز به تأمین کالا';
    }
  }
  function renderChart(d){
    var chart=document.querySelector('.adm-chart');
    if(!chart || !d.last7Days || !d.last7Days.length) return;
    var maxRev=Math.max.apply(null, d.last7Days.map(function(x){ return x.revenue; }).concat([1]));
    var totalRev=d.last7Days.reduce(function(s,x){return s+x.revenue;},0);
    var dayNames=['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
    // Map last7Days to weekday names by date
    chart.innerHTML=d.last7Days.map(function(day,i){
      var pct=Math.max(6, Math.round((day.revenue/maxRev)*100));
      var label=dayNames[i]||day.date.slice(5);
      // bar height as revenue pct, value as order count (fa)
      return '<div class="adm-chart__col"><span class="adm-chart__value">'+fa(day.orders)+'</span><span class="adm-chart__bar" style="height:'+pct+'%"></span><span class="adm-chart__day">'+esc(label)+'</span></div>';
    }).join('');
    var badge=document.querySelector('.adm-card__header .adm-badge--plain');
    if(badge) badge.textContent='مجموع: '+fa(totalRev)+' تومان';
    var legends=document.querySelectorAll('.adm-chart__legend-item');
    if(legends.length>=2){
      var avgOrders=Math.round(d.last7Days.reduce(function(s,x){return s+x.orders;},0)/7);
      legends[0].innerHTML='میانگین روزانه: <strong>'+fa(avgOrders)+' سفارش</strong>';
      var best=d.last7Days.reduce(function(a,b){return b.revenue>a.revenue?b:a;}, d.last7Days[0]);
      var bestIdx=d.last7Days.indexOf(best);
      legends[1].innerHTML='بهترین روز: <strong>'+esc(dayNames[bestIdx]||best.date)+'</strong>';
    }
  }
  function renderTopProducts(d){
    var list=document.querySelector('.adm-top-list');
    if(!list) return;
    if(!d.topProducts || !d.topProducts.length){
      list.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">هنوز فروشی ثبت نشده است.</div>';
      return;
    }
    list.innerHTML=d.topProducts.map(function(t){
      var img=t.image? '../assets/images/products/'+String(t.image).split('/').pop() : '';
      var thumb=img? '<img src="'+esc(img)+'" alt="'+esc(t.name)+'">': '';
      return '<div class="adm-top-item"><span class="adm-top-item__thumb">'+thumb+'</span><div class="adm-top-item__meta"><span class="adm-top-item__name">'+esc(t.name)+'</span><span class="adm-top-item__cat">'+esc(t.category||'')+'</span></div><span class="adm-top-item__sold">'+fa(t.sold)+' فروش</span></div>';
    }).join('');
  }
  function renderRecentOrders(d){
    // recent orders are not in summary; fetch /api/orders and show latest 5
    var h={ 'Content-Type':'application/json' }; var t=adminToken(); if(t) h['Authorization']='Bearer '+t;
    return fetch('/api/orders',{headers:h}).then(function(r){ return r.json(); }).then(function(list){
      var tbody=document.querySelector('.admin-view[data-view="dashboard"] .adm-table tbody');
      if(!tbody) return;
      var orders=(Array.isArray(list)?list:[]).slice(0,5);
      if(!orders.length){
        tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted)">هنوز سفارشی ثبت نشده است.</td></tr>';
        return;
      }
      tbody.innerHTML=orders.map(function(o){
        var st=String(o.status||'pending').toLowerCase(); if(st==='shipping') st='shipped';
        var meta=STATUS_META[st]||STATUS_META.pending;
        var custName='مشتری';
        if(o.customer){ custName=((o.customer.firstName||'')+' '+(o.customer.lastName||'')).trim()||o.customer.mobile||'مشتری'; }
        var avatar=esc((custName||'م').trim().charAt(0));
        return '<tr data-status="'+esc(st)+'"><td><span class="adm-order-id">'+esc(o.id)+'</span></td><td><span class="adm-user"><span class="adm-user__avatar">'+avatar+'</span><span class="adm-user__name">'+esc(custName)+'</span></span></td><td>'+esc(o.date||'')+'</td><td>'+fa(o.total)+'</td><td><span class="adm-badge '+meta.badge+'">'+meta.text+'</span></td><td><div class="adm-table__cell-actions"><button type="button" class="adm-btn-icon" data-order-view="'+esc(o.id)+'" title="مشاهده"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button></div></td></tr>';
      }).join('');
    }).catch(function(){});
  }
  function clearDashboard(){
    var cards=document.querySelectorAll('.adm-stats .adm-stat');
    cards.forEach(function(card){
      var v=card.querySelector('.adm-stat__value'); if(v) v.textContent='…';
      var d=card.querySelector('.adm-stat__delta'); if(d) d.textContent='';
    });
    var badge=document.querySelector('.adm-card__header .adm-badge--plain'); if(badge) badge.textContent='';
    var chart=document.querySelector('.adm-chart'); if(chart) chart.innerHTML='<p style="font-size:13px;color:var(--text-muted);padding:16px">در حال بارگذاری…</p>';
    var legends=document.querySelectorAll('.adm-chart__legend-item'); legends.forEach(function(l){ l.innerHTML=''; });
    var topList=document.querySelector('.adm-top-list'); if(topList) topList.innerHTML='<p style="font-size:13px;color:var(--text-muted);padding:12px">در حال بارگذاری…</p>';
    var tbody=document.querySelector('.admin-view[data-view="dashboard"] .adm-table tbody');
    if(tbody) tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-muted)">در حال بارگذاری…</td></tr>';
  }
  function refresh(){
    clearDashboard();
    loadSummary().then(function(d){
      try{ renderStats(d); }catch(e){}
      try{ renderChart(d); }catch(e){}
      try{ renderTopProducts(d); }catch(e){}
      try{ renderRecentOrders(d); }catch(e){}
    }).catch(function(){});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();
  // Re-refresh when navigating to dashboard
  document.addEventListener('click', function(e){
    var a=e.target.closest&&e.target.closest('a[data-view="dashboard"]');
    if(a) setTimeout(refresh,100);
  });
  window.addEventListener('hashchange', function(){
    if((location.hash||'').indexOf('dashboard')!==-1) refresh();
  });
  window.CamzyDashboard={ refresh: refresh };
})();
