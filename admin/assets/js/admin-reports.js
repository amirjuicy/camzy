/* Camzy — Admin Reports (real backend data only).
 * GET /api/admin/reports?group=day|week|month — revenue, orders, customers,
 * status breakdown, sales series, top products. No mock fallback.
 */
(function () {
  'use strict';

  var API = (function () {
    try { return new URL('/api/', window.location.href).toString().replace(/\/$/, ''); }
    catch (e) { return '/api'; }
  })();

  function tok() { try { var s = JSON.parse(localStorage.getItem('as_admin_session') || 'null'); return (s && s.token) || ''; } catch (e) { return ''; } }
  function get(path) {
    var h = {};
    var t = tok();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return fetch(API + path, { headers: h }).then(function (res) {
      if (!res.ok) throw new Error('API ' + res.status);
      return res.json();
    });
  }
  function fa(n) { try { return Number(n || 0).toLocaleString('fa-IR'); } catch (e) { return String(n == null ? 0 : n); } }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var STATUS_META = {
    pending: { text: 'در انتظار پرداخت', badge: 'adm-badge--warning' },
    processing: { text: 'در حال پردازش', badge: 'adm-badge--primary' },
    shipped: { text: 'ارسال‌شده', badge: 'adm-badge--info' },
    delivered: { text: 'تحویل‌شده', badge: 'adm-badge--success' },
    cancelled: { text: 'لغوشده', badge: 'adm-badge--danger' }
  };

  var currentGroup = 'day';
  var lastData = null;

  /* ── Minimal real .xlsx builder (stored ZIP + inline strings, no deps) ── */
  function xlsxEsc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function colName(i) {
    var s = '';
    i++;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }
  function sheetXml(rows) {
    var s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
    for (var r = 0; r < rows.length; r++) {
      s += '<row r="' + (r + 1) + '">';
      for (var c = 0; c < rows[r].length; c++) {
        var v = rows[r][c];
        var ref = colName(c) + (r + 1);
        if (typeof v === 'number' && isFinite(v)) s += '<c r="' + ref + '"><v>' + v + '</v></c>';
        else s += '<c r="' + ref + '" t="inlineStr"><is><t>' + xlsxEsc(v) + '</t></is></c>';
      }
      s += '</row>';
    }
    return s + '</sheetData></worksheet>';
  }
  var CRC_T = (function () {
    var t = new Array(256), i, j, c;
    for (i = 0; i < 256; i++) { c = i; for (j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[i] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_T[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function buildZip(files) {
    var enc = new TextEncoder();
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var data = (typeof f.data === 'string') ? enc.encode(f.data) : f.data;
      var name = enc.encode(f.name);
      var crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30 + name.length));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      var head = new Uint8Array(30 + name.length);
      head.set(new Uint8Array(lh.buffer), 0); head.set(name, 30);
      parts.push(head, data);
      central.push({ name: name, crc: crc, size: data.length, offset: offset });
      offset += head.length + data.length;
    });
    var cdSize = 0;
    var cdParts = central.map(function (e) {
      var ch = new DataView(new ArrayBuffer(46 + e.name.length));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0, true); ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0, true);
      ch.setUint32(16, e.crc, true); ch.setUint32(20, e.size, true); ch.setUint32(24, e.size, true);
      ch.setUint16(28, e.name.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true);
      ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, e.offset, true);
      var b = new Uint8Array(46 + e.name.length);
      b.set(new Uint8Array(ch.buffer), 0); b.set(e.name, 46);
      cdSize += b.length;
      return b;
    });
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, central.length, true);
    end.setUint16(10, central.length, true); end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    var total = offset + cdSize + 22;
    var out = new Uint8Array(total);
    var p = 0;
    parts.forEach(function (b) { out.set(b, p); p += b.length; });
    cdParts.forEach(function (b) { out.set(b, p); p += b.length; });
    out.set(new Uint8Array(end.buffer), p);
    return out;
  }
  function doExport(){ var p=qParams(); var h={}; var t=tok(); if(t) h['Authorization']='Bearer '+t; fetch(API+'/admin/reports/export/excel'+p.qs,{headers:h}).then(r=>{if(!r.ok) throw 0; return r.blob();}).then(b=>{var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='report-'+p.kind+'.xlsx';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}).catch(()=>alert('خطا در خروجی اکسل'));}
function exportXlsx() {
    if (!lastData) {
      get('/admin/reports'+qParams().qs+'&top=10').then(function (d) { lastData = d; exportXlsx(); }).catch(function () {});
      return;
    }
    var d = lastData;
    var summary = [['Metric', 'Value'],
      ['Group', d.group || currentGroup],
      ['Total revenue', Number(d.totalRevenue) || 0],
      ['Total orders', Number(d.totalOrders) || 0],
      ['Customers', Number(d.customersCount) || 0]];
    var series = [['Date', 'Orders', 'Revenue']].concat((d.series || []).map(function (b) {
      return [String(b.date || ''), Number(b.orders) || 0, Number(b.revenue) || 0];
    }));
    var status = [['Status', 'Count']].concat(Object.keys(d.byStatus || {}).map(function (k) {
      var meta = STATUS_META[String(k).toLowerCase()];
      return [(meta ? meta.text + ' (' + k + ')' : String(k)), Number(d.byStatus[k]) || 0];
    }));
    var top = [['Product', 'Category', 'Sold', 'Revenue']].concat((d.topProducts || []).map(function (t) {
      return [String(t.name || ''), String(t.category || ''), Number(t.sold) || 0, Number(t.revenue) || 0];
    }));
    var sheets = [
      { name: 'Summary', rows: summary },
      { name: 'Sales series', rows: series },
      { name: 'Order status', rows: status },
      { name: 'Top products', rows: top }
    ];
    var files = [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets.map(function (_, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        sheets.map(function (s, i) { return '<sheet name="' + xlsxEsc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (_, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') + '</Relationships>' }
    ];
    sheets.forEach(function (s, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(s.rows) }); });
    var bytes = buildZip(files);
    var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'reports-' + (d.group || currentGroup) + '.xlsx';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function setStatLabels(a,b,c){ var yl=document.querySelector('.adm-stat--yellow .adm-stat__label'); if(yl) yl.textContent=a; var bl=document.querySelector('.adm-stat--blue .adm-stat__label'); if(bl) bl.textContent=b; var gl=document.querySelector('.adm-stat--green .adm-stat__label'); if(gl) gl.textContent=c; }
  function render(d) {
    lastData = d;
    if(d.kind==='products'){
      renderTable(d);
      setStatLabels('تعداد محصولات','موجودی کل','محصولات کم‌موجود');
      var rev=document.getElementById('adm-rep-revenue'); if(rev) rev.innerHTML=fa(d.stats.totalProducts||0)+' محصول';
      var ord=document.getElementById('adm-rep-orders'); if(ord) ord.textContent=fa(d.stats.totalStock||0);
      var cust=document.getElementById('adm-rep-customers'); if(cust) cust.textContent=fa(d.stats.lowStock||0)+' کم‌موجود';
      var chart=document.getElementById('adm-rep-chart'); if(chart) chart.innerHTML='<p style="font-size:13px;color:var(--text-muted);padding:16px">گزارش محصولات: نمودار فروش برای این گزارش کاربرد ندارد.</p>';
      var legend=document.getElementById('adm-rep-legend'); if(legend) legend.innerHTML='';
      var stBox=document.getElementById('adm-rep-status'); if(stBox) stBox.innerHTML='<p style="font-size:13px;color:var(--text-muted);padding:12px">وضعیت سفارش برای گزارش محصولات نمایش داده نمی‌شود.</p>';
      var tbody=document.querySelector('#adm-rep-top tbody'); if(tbody) tbody.innerHTML='<tr><td colspan=4 style="text-align:center;padding:12px;color:var(--text-muted)">جدول بالا گزارش کامل محصولات است.</td></tr>';
      return;
    }
    if(d.kind==='inventory'){
      renderTable(d);
      setStatLabels('تعداد محصولات','موجودی کل','کم‌موجود');
      var rev=document.getElementById('adm-rep-revenue'); if(rev) rev.innerHTML=fa(d.stats.totalProducts||0)+' محصول';
      var ord=document.getElementById('adm-rep-orders'); if(ord) ord.textContent=fa(d.stats.totalStock||0);
      var cust=document.getElementById('adm-rep-customers'); if(cust) cust.textContent=fa(d.stats.lowStock||0)+' کم‌موجود';
      var chart=document.getElementById('adm-rep-chart'); if(chart) chart.innerHTML='<p style="font-size:13px;color:var(--text-muted);padding:16px">گزارش موجودی: موجودی کل '+fa(d.stats.totalStock)+' — کم‌موجود '+fa(d.stats.lowStock)+'</p>';
      var legend=document.getElementById('adm-rep-legend'); if(legend) legend.innerHTML='';
      var stBox=document.getElementById('adm-rep-status'); if(stBox) stBox.innerHTML='<p style="font-size:13px;color:var(--text-muted);padding:12px">گزارش موجودی بر اساس موجودی فعلی است.</p>';
      var tbody=document.querySelector('#adm-rep-top tbody'); if(tbody) tbody.innerHTML='<tr><td colspan=4 style="text-align:center;padding:12px;color:var(--text-muted)">وضعیت موجودی در جدول بالا نمایش داده شده است.</td></tr>';
      return;
    }
    if(d.kind==='orders' || d.kind==='sales'){
      renderTable(d);
      if(d.kind==='orders') setStatLabels('تعداد سفارش‌ها','مبلغ سفارش‌ها','وضعیت سفارش‌ها');
      else setStatLabels('مبلغ فروش','تعداد فروش','میانگین سفارش');
      var isSales=d.kind==='sales';
      var rev=document.getElementById('adm-rep-revenue'); if(rev) rev.innerHTML=fa(d.stats.totalSales||0)+' <small>تومان</small>';
      var ord=document.getElementById('adm-rep-orders'); if(ord) ord.textContent=fa(d.stats.totalOrders||0);
      var cust=document.getElementById('adm-rep-customers'); if(cust) { var by=d.stats.byStatus||{}; var done=(by.delivered||0)+(by.shipped||0); cust.textContent=isSales? fa(d.stats.totalOrders? Math.round((d.stats.totalSales||0)/(d.stats.totalOrders||1)):0)+' میانگین' : fa(Object.keys(by).length? done+' تحویل‌شده' : '۰'); }
      // render chart/status/top for orders/sales below, do not fall through to legacy
      var chart=document.getElementById('adm-rep-chart'); var legend=document.getElementById('adm-rep-legend'); var series=d.series||[];
      if(chart){
        if(!series.length){ var em=isSales?'در این بازه فروشی ثبت نشده است.':'در این بازه سفارشی ثبت نشده است.'; chart.innerHTML='<p style="font-size:13px;color:var(--text-muted);padding:16px">'+em+'</p>'; }
        else { var max=Math.max.apply(null, series.map(function(b){return Number(b.revenue)||0;}).concat([1])); chart.innerHTML=series.map(function(b){ var h=Math.max(4,Math.round(((Number(b.revenue)||0)/max)*100)); return '<div class="adm-chart__col"><span class="adm-chart__value">'+fa(b.orders)+'</span><span class="adm-chart__bar" style="height:'+h+'%" title="'+esc(b.date)+': '+fa(b.revenue)+' تومان"></span><span class="adm-chart__day">'+esc(String(b.date).slice(5))+'</span></div>'; }).join(''); }
      }
      if(legend){ var revSum=series.reduce(function(a,b){return a+(Number(b.revenue)||0);},0); var ordSum=series.reduce(function(a,b){return a+(Number(b.orders)||0);},0); legend.innerHTML='<span class="adm-chart__legend-item">مجموع فروش دوره: <strong>'+fa(revSum)+' تومان</strong></span><span class="adm-chart__legend-item">مجموع سفارش دوره: <strong>'+fa(ordSum)+'</strong></span>'; }
      var stBox=document.getElementById('adm-rep-status'); if(stBox){ var keys=Object.keys(d.stats.byStatus||d.byStatus||{}); if(!keys.length){ stBox.innerHTML='<p style="font-size:13px;color:var(--text-muted);padding:12px">'+(isSales?'فروشی برای نمایش وضعیت وجود ندارد.':'سفارشی ثبت نشده است.')+'</p>'; } else { stBox.innerHTML=keys.map(function(k){ var meta=STATUS_META[String(k).toLowerCase()]||{text:k,badge:'adm-badge--info'}; return '<div class="adm-top-item"><div class="adm-top-item__meta"><span class="adm-top-item__name">'+esc(meta.text)+'</span></div><span class="adm-badge '+meta.badge+'">'+fa((d.stats.byStatus||d.byStatus)[k])+'</span></div>'; }).join(''); } }
      var tbody2=document.querySelector('#adm-rep-top tbody'); if(tbody2){ var list=d.topProducts||[]; if(!list.length){ tbody2.innerHTML='<tr><td colspan="4" style="text-align:center;padding:28px;color:var(--text-muted)">'+(isSales?'محصول پرفروشی در این بازه وجود ندارد.':'سفارشی برای نمایش محصولات وجود ندارد.')+'</td></tr>'; } else { tbody2.innerHTML=list.map(function(t){return '<tr><td>'+esc(t.name)+'</td><td>'+esc(t.category||'—')+'</td><td>'+fa(t.sold)+'</td><td>'+fa(t.revenue)+'</td></tr>';}).join(''); } }
      return;
    } else if(d.rows){ renderTable(d); return; }
    // legacy fallback (no kind)
    var rev = document.getElementById('adm-rep-revenue');
    if (rev) rev.innerHTML = fa(d.totalRevenue) + ' <small style="font-size:12px;color:var(--text-muted)">تومان</small>';
    var ord = document.getElementById('adm-rep-orders');
    if (ord) ord.textContent = fa(d.totalOrders);
    var cust = document.getElementById('adm-rep-customers');
    if (cust) cust.textContent = fa(d.customersCount);

    var chart = document.getElementById('adm-rep-chart');
    var legend = document.getElementById('adm-rep-legend');
    var series = d.series || [];
    if (chart) {
      if (!series.length) {
        var emptyMsg=d.kind==='sales'? 'در این بازه فروشی ثبت نشده است.' : d.kind==='orders'? 'در این بازه سفارشی ثبت نشده است.' : 'داده‌ای برای نمایش وجود ندارد.';
        chart.innerHTML = '<p style="font-size:13px;color:var(--text-muted);padding:16px">'+emptyMsg+'</p>';
      } else {
        var max = Math.max.apply(null, series.map(function (b) { return Number(b.revenue) || 0; }).concat([1]));
        chart.innerHTML = series.map(function (b) {
          var h = Math.max(4, Math.round(((Number(b.revenue) || 0) / max) * 100));
          return '<div class="adm-chart__col"><span class="adm-chart__value">' + fa(b.orders) +
            '</span><span class="adm-chart__bar" style="height:' + h + '%" title="' + esc(b.date) + ': ' + fa(b.revenue) + ' تومان"></span>' +
            '<span class="adm-chart__day">' + esc(String(b.date).slice(5)) + '</span></div>';
        }).join('');
      }
    }
    if (legend) {
      var revSum = series.reduce(function (a, b) { return a + (Number(b.revenue) || 0); }, 0);
      var ordSum = series.reduce(function (a, b) { return a + (Number(b.orders) || 0); }, 0);
      legend.innerHTML = '<span class="adm-chart__legend-item">مجموع فروش دوره: <strong>' + fa(revSum) + ' تومان</strong></span>' +
        '<span class="adm-chart__legend-item">مجموع سفارش دوره: <strong>' + fa(ordSum) + '</strong></span>';
    }

    var stBox = document.getElementById('adm-rep-status');
    if (stBox) {
      var keys = Object.keys(d.byStatus || d.stats && d.stats.byStatus || {});
      if (!keys.length) {
        var emptySt=d.kind==='sales'? 'فروشی برای نمایش وضعیت وجود ندارد.' : 'سفارشی ثبت نشده است.';
        stBox.innerHTML = '<p style="font-size:13px;color:var(--text-muted);padding:12px">'+emptySt+'</p>';
      } else {
        stBox.innerHTML = keys.map(function (k) {
          var meta = STATUS_META[String(k).toLowerCase()] || { text: k, badge: 'adm-badge--info' };
          return '<div class="adm-top-item"><div class="adm-top-item__meta"><span class="adm-top-item__name">' +
            esc(meta.text) + '</span></div><span class="adm-badge ' + meta.badge + '">' + fa(d.byStatus[k]) + '</span></div>';
        }).join('');
      }
    }

    var tbody = document.querySelector('#adm-rep-top tbody');
    if (tbody) {
      var list = d.topProducts || (d.stats && d.stats.topProducts) || [];
      if (!list.length) {
        var emptyTop=d.kind==='sales'? 'محصول پرفروشی در این بازه وجود ندارد.' : d.kind==='orders'? 'سفارشی برای نمایش محصولات وجود ندارد.' : 'داده‌ای برای نمایش وجود ندارد.';
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:28px;color:var(--text-muted)">'+emptyTop+'</td></tr>';
      } else {
        tbody.innerHTML = list.map(function (t) {
          return '<tr><td>' + esc(t.name) + '</td><td>' + esc(t.category || '—') + '</td><td>' +
            fa(t.sold) + '</td><td>' + fa(t.revenue) + '</td></tr>';
        }).join('');
      }
    }
  }

  function qParams(){var k=document.getElementById('adm-rep-kind');var r=document.getElementById('adm-rep-range');var f=document.getElementById('adm-rep-from');var t=document.getElementById('adm-rep-to');var kind=k?k.value:'orders';var range=r?r.value:'7days';var from=f&&f.value?f.value:'';var to=t&&t.value?t.value:'';var qs='?kind='+encodeURIComponent(kind)+'&range='+encodeURIComponent(range);if(from)qs+='&from='+encodeURIComponent(from);if(to)qs+='&to='+encodeURIComponent(to);return {qs,kind,range,from,to};}
function renderTable(d){
 var tb=document.querySelector('#adm-rep-table'); if(!tb) return;
 var thead=tb.querySelector('thead'),tbody=tb.querySelector('tbody');
 if(d.kind==='products'){
   thead.innerHTML='<tr><th>شناسه</th><th>نام محصول</th><th>SKU</th><th>دسته‌بندی</th><th>قیمت</th><th>موجودی</th><th>وضعیت موجودی</th><th>وضعیت</th></tr>';
   tbody.innerHTML=(d.rows||[]).map(r=>'<tr><td>'+esc(r.id)+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.sku)+'</td><td>'+esc(r.category)+'</td><td>'+fa(r.price)+'</td><td>'+fa(r.stockCount)+'</td><td>'+esc(r.stockStatus)+'</td><td>'+(r.isActive?'فعال':'غیرفعال')+'</td></tr>').join('')||'<tr><td colspan=8 style="text-align:center;padding:20px">محصولی یافت نشد</td></tr>';
 } else if(d.kind==='inventory'){
   thead.innerHTML='<tr><th>شناسه</th><th>نام محصول</th><th>SKU</th><th>موجودی</th><th>وضعیت موجودی</th><th>کم‌موجود</th></tr>';
   tbody.innerHTML=(d.rows||[]).map(r=>'<tr><td>'+esc(r.id)+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.sku)+'</td><td>'+fa(r.stockCount)+'</td><td>'+esc(r.stockStatus)+'</td><td>'+(r.stockCount<=5?'بله':'خیر')+'</td></tr>').join('')||'<tr><td colspan=6 style="text-align:center;padding:20px">موجودی‌ای یافت نشد</td></tr>';
 } else if(d.kind==='sales'){
   thead.innerHTML='<tr><th>تاریخ</th><th>تعداد فروش</th><th>مبلغ فروش</th><th>تخفیف</th><th>ارسال</th><th>خالص</th></tr>';
   var rows=d.rows||[]; // sales aggregated per day if rows are orders, keep order view too
   tbody.innerHTML=rows.map(r=>'<tr><td>'+esc(r.date||'')+'</td><td>'+fa(r.itemsCount||r.count||0)+'</td><td>'+fa(r.total||0)+'</td><td>'+fa(r.discount||0)+'</td><td>'+fa(r.shipping||0)+'</td><td>'+fa((r.total||0)-(r.discount||0))+'</td></tr>').join('')||'<tr><td colspan=6 style="text-align:center;padding:20px">فروشی در این بازه ثبت نشده است</td></tr>';
 } else if(d.rows){
   thead.innerHTML='<tr><th>شناسه سفارش</th><th>تاریخ</th><th>ساعت</th><th>مشتری</th><th>موبایل</th><th>وضعیت</th><th>تعداد اقلام</th><th>مبلغ نهایی</th><th>محصولات</th></tr>';
   tbody.innerHTML=(d.rows||[]).map(r=>'<tr><td>'+esc(r.id)+'</td><td>'+esc(r.date)+'</td><td>'+esc(r.time)+'</td><td>'+esc(r.customer)+'</td><td>'+esc(r.mobile)+'</td><td>'+esc(r.statusFa)+'</td><td>'+fa(r.itemsCount)+'</td><td>'+fa(r.total)+'</td><td>'+esc(r.products)+'</td></tr>').join('')||'<tr><td colspan=9 style="text-align:center;padding:20px">داده‌ای یافت نشد</td></tr>';
 }
}
  var _reqId=0;
  function load() {
      var cur=++_reqId;
      var qp=qParams();
      var isLegacy=!document.getElementById('adm-rep-kind');
      var url=isLegacy? '/admin/reports?group='+encodeURIComponent(currentGroup)+'&top=10' : '/admin/reports'+qp.qs+'&top=10';
      var chart = document.getElementById('adm-rep-chart');
      if (chart) chart.innerHTML = '<p style="font-size:13px;color:var(--text-muted);padding:16px">در حال بارگذاری…</p>';
      var tb=document.querySelector('#adm-rep-table tbody'); if(tb) tb.innerHTML='<tr><td colspan=9 style="text-align:center;padding:20px">در حال بارگذاری…</td></tr>';
      get(url)
        .then(function(d){ if(cur!==_reqId) return; render(d); })
        .catch(function () { if(cur!==_reqId) return;
         if (chart) chart.innerHTML = '<p style="text-align:center;padding:28px;color:#B91C22">خطا در بارگذاری گزارش‌ها</p>';
         if(tb) tb.innerHTML='<tr><td colspan=9 style="text-align:center;padding:20px;color:#B91C22">خطا در بارگذاری</td></tr>';
       });
   }

  document.addEventListener('click', function (e) {
    if(e.target.closest('#adm-rep-show')){ load(); return; }
    if(e.target.closest('#adm-rep-range')){} 
    var exp = e.target.closest('#adm-rep-export');
    if (exp) { e.preventDefault(); e.stopPropagation(); var k=document.getElementById('adm-rep-kind'); if(k) doExport(); else exportXlsx(); return; }
    var chip = e.target.closest('#adm-rep-groups [data-group]');
    if (!chip) return;
    document.querySelectorAll('#adm-rep-groups [data-group]').forEach(function (c) { c.classList.remove('is-active'); });
    chip.classList.add('is-active');
    currentGroup = chip.getAttribute('data-group') || 'day';
    load();
  });

  // Load lazily when the reports view is shown (admin.js showView), plus on direct hash access.
  var origShow = null;
  function hook() {
    if (window.CamzyAdmin && window.CamzyAdmin.showView && !window.CamzyAdmin.showView.__repHooked) {
      origShow = window.CamzyAdmin.showView;
      var wrapped = function (name) {
        origShow(name);
        if (name === 'reports') load();
      };
      wrapped.__repHooked = true;
      window.CamzyAdmin.showView = wrapped;
      return true;
    }
    return false;
  }
  document.addEventListener('change', function(e){ if(e.target.id==='adm-rep-range'){ var v=e.target.value; var f=document.getElementById('adm-rep-from'),t=document.getElementById('adm-rep-to'); if(f) f.style.display=v==='custom'?'':'none'; if(t) t.style.display=v==='custom'?'':'none'; }});
  document.addEventListener('DOMContentLoaded', function () {
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (hook() || tries > 50) clearInterval(timer);
    }, 100);
    if ((window.location.hash || '').replace(/^#\/?/, '') === 'reports') load();
  });
})();
