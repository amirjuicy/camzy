/* Camzy — Express API + static storefront server.
 * Foundation only: catalog read endpoints + user/address/order persistence.
 * UI files are untouched; the static middleware serves them as before.
 */
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const { getDb } = require('./db');
const { migrate } = require('./migrate');

migrate();
const db = getDb();
try { db.exec('PRAGMA busy_timeout = 5000'); } catch (_) {}
try { db.exec('PRAGMA journal_mode = WAL'); } catch (_) {}

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { requestIdMiddleware, requestLogger, logError, logWarn } = require('./logger');
const { syncIcons } = require('./store-icons');

const app = express();
app.use(requestIdMiddleware);
app.use(requestLogger);
// Patch res.json to log 5xx API errors with diagnostic context
app.use((req,res,next)=>{
  const origJson=res.json.bind(res);
  res.json=(body)=>{
    if(req.originalUrl.startsWith('/api') && res.statusCode>=500){
      try{
        let userId=null;
        try{ const a=getAuthUser(req); if(a) userId=a.row.id; }catch(_){}
        try{ const ad=getAdminAuth(req); if(ad) userId='admin:'+ad.row.id; }catch(_){}
        const duration = req._startAt ? Date.now()-req._startAt : undefined;
        const errName = body?.errorName || body?.name || 'Error';
        const errMsg = (body?.error||JSON.stringify(body)).toString().slice(0,2000);
        logError('api 5xx', { requestId:req.requestId, method:req.method, path:req.originalUrl, status:res.statusCode, statusCode:res.statusCode, ...(userId?{userId}:{}), errorName: errName, error: errMsg, message: errMsg, stack: body?.stack ? String(body.stack).slice(0,4000) : undefined, durationMs: duration, duration });
      }catch(_){}
    }
    return origJson(body);
  };
  next();
});
// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // static UI has inline scripts
  crossOriginEmbedderPolicy: false,
}));
app.use((req,res,next)=>{ res.setHeader('X-Content-Type-Options','nosniff'); next(); });

// CORS: same-origin only (no wildcard). Allow only same origin; API is same-origin.
app.use((req,res,next)=>{
  const origin = req.headers.origin;
  // Reflect only if needed for same-site; otherwise deny cross-origin without header
  if(origin){ res.setHeader('Vary','Origin'); }
  next();
});

app.use(express.json({ limit: '2mb' }));

// Rate limiters
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20, standardHeaders:true, legacyHeaders:false, message:{error:'Too many requests, try later'} });
const generalLimiter = rateLimit({ windowMs: 60*1000, max: 120, standardHeaders:true, legacyHeaders:false, message:{error:'Too many requests'} });
const orderLimiter = rateLimit({ windowMs: 15*60*1000, max: 10, standardHeaders:true, legacyHeaders:false, message:{error:'Too many requests, please try again later'} });
const reviewLimiter = rateLimit({ windowMs: 15*60*1000, max: 20, standardHeaders:true, legacyHeaders:false, message:{error:'Too many requests, please try again later'} });
app.use('/api/auth/', authLimiter);
app.use('/api/admin/login', authLimiter);
app.use('/api', generalLimiter);

function mapProduct(r) {
  if (!r) return r;
  let gallery=[]; try{ gallery=JSON.parse(r.gallery_json||'[]'); }catch(e){ gallery=[]; }
  let variants=[]; try{ variants=JSON.parse(r.variants_json||'[]'); }catch(e){ variants=[]; }
  let features=[]; try{ features=JSON.parse(r.features_json||'[]'); if(!Array.isArray(features)) features=JSON.parse(r.specs_json||'[]')||[]; }catch(e){ features=[]; }
  let shipping={}; try{ shipping=JSON.parse(r.shipping_json||'{}'); }catch(e){ shipping={}; }
  return {
    id: r.id, name: r.name, slug: r.slug, brand: r.brand, brandName: r.brand_name,
    category: r.category, categorySlug: r.category_slug, categoryId: r.category_id,
    subcategory: r.subcategory||'', model: r.model||'', status: r.is_active? (r.in_stock?'active':'outofstock'):'inactive',
    image: r.image, images: JSON.parse(r.images_json || '[]'), gallery: gallery,
    price: r.price, salePrice: r.sale_price, oldPrice: r.old_price,
    discount: r.discount, discountEndsAt: r.discount_ends_at||null,
    rating: r.rating, reviewCount: r.review_count,
    isNew: !!r.is_new, isBestSeller: !!r.is_best_seller, inStock: !!r.in_stock,
    isActive: r.is_active == null ? true : !!r.is_active, stockStatus: r.stock_status||'',
    stockCount: r.stock_count != null ? r.stock_count : (r.in_stock ? 50 : 0),
    minOrder: r.min_order||1, maxOrder: r.max_order||0, warehouse: r.warehouse||'', weight: r.weight||0, dimensions: r.dimensions||'',
    sku: r.sku, shortDescription: r.short_description, description: r.description,
    specs: JSON.parse(r.specs_json || '{}'), features: features, variants: variants, shipping: shipping,
    manufacturer: r.manufacturer||'', country: r.country||'', warranty: r.warranty||'', includedItems: r.included_items||'', authenticity: r.authenticity||'',
    seoTitle: r.seo_title||'', seoDescription: r.seo_description||'', seoKeywords: r.seo_keywords||'', ogImage: r.og_image||'',
    seo: seoFor('product', r.id),
  };
}

function mapCategory(r, subs) {
  return {
    id: r.id, name: r.name, slug: r.slug, icon: r.icon, color: r.color,
    description: r.description, count: r.product_count,
    subcategories: subs || [],
  };
}

function mapAddress(r) {
  if (!r) return r;
  return {
    id: r.id, userId: r.user_id, title: r.title, fullName: r.full_name, mobile: r.mobile,
    province: r.province, city: r.city, address: r.address, postalCode: r.postal_code,
    isDefault: !!r.is_default,
  };
}

const VALID_PAYMENT_STATUSES = new Set(['unpaid', 'pending', 'paid', 'failed', 'refunded']);
const VALID_PAYMENT_METHODS = new Set(['cod', 'online', 'card']);

function normalizePaymentMethod(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'card' || s.includes('کارت به کارت') || s.includes('کارت‌به‌کارت')
    || (s.includes('کارت') && s.includes('کارت') && !s.includes('آنلاین'))) {
    // 'کارت به کارت' explicitly; avoid catching bank-card mentions for online
    if (s.includes('به کارت') || s === 'card') return 'card';
  }
  if (s === 'online' || s.includes('online') || s.includes('gateway')
    || s.includes('آنلاین') || s.includes('درگاه') || s.includes('اینترنتی')) return 'online';
  if (s === 'card' || s.includes('کارت به کارت') || s.includes('کارت‌به‌کارت') || s.includes('card-to-card') || s.includes('cardtocard')) return 'card';
  return 'cod';
}

function mapOrder(r, items) {
  if (!r) return r;
  const pm = VALID_PAYMENT_METHODS.has(r.payment_method) ? r.payment_method : normalizePaymentMethod(r.payment_method);
  const ps = VALID_PAYMENT_STATUSES.has(r.payment_status) ? r.payment_status : 'unpaid';
  return {
    id: r.id, userId: r.user_id, date: r.date, status: r.status, statusText: r.status_text,
    total: r.total, itemsCount: r.items_count, shipping: r.shipping, discount: r.discount,
    discountCode: r.discount_code || '', discount_code: r.discount_code || '',
    address: r.address, addressId: r.address_id, paymentMethod: pm, payment_method: pm,
    paymentStatus: ps, payment_status: ps,
    paymentAuthority: r.payment_authority ?? null, payment_authority: r.payment_authority ?? null,
    paymentRefId: r.payment_ref_id ?? null, payment_ref_id: r.payment_ref_id ?? null,
    paymentAmount: r.payment_amount ?? null, payment_amount: r.payment_amount ?? null,
    paidAt: r.paid_at ?? null, paid_at: r.paid_at ?? null,
    timeline: JSON.parse(r.timeline_json || '[]'),
    items: (items || []).map((i) => {
      let options = [];
      try { options = JSON.parse(i.options_json || '[]'); } catch (_) { options = []; }
      return {
        id: i.id, productId: i.product_id, name: i.name, price: i.price, quantity: i.quantity,
        options: options,
      };
    }),
  };
}

const api = express.Router();
app.use('/api', api);

api.get('/health', (req, res) => res.json({ ok: true }));

// ── Catalog (read) ──
api.get('/categories', (req, res) => {
  const cats = db.prepare('SELECT * FROM categories ORDER BY id').all();
  const subs = db.prepare('SELECT id, category_id, name FROM subcategories ORDER BY id').all();
  const byCat = new Map();
  for (const s of subs) {
    if (!byCat.has(s.category_id)) byCat.set(s.category_id, []);
    byCat.get(s.category_id).push({ id: s.id, name: s.name });
  }
  const countStmt = db.prepare('SELECT COUNT(*) AS n FROM products WHERE category_id = ? OR category_slug = ?');
  res.json(cats.map((c) => {
    const subObjs = byCat.get(c.id) || [];
    let count = 0;
    try { count = countStmt.get(c.id, c.slug).n; } catch (_) { count = 0; }
    return {
      id: c.id, name: c.name, slug: c.slug, icon: c.icon, color: c.color,
      description: c.description, count,
      subcategories: subObjs.map((s) => s.name),
      subcategoryItems: subObjs,
    };
  }));
});

// ── Categories (admin write) ──
function slugifyCategory(s) {
  return String(s || '').trim().toLowerCase()
    .replace(/[_\s]+/g, '-').replace(/[^a-z0-9\u0600-\u06FF-]+/g, '')
    .replace(/-+/g, '-').replace(/^-|-$/g, '') || ('category-' + Date.now().toString(36));
}

function categoryInput(b, isCreate) {
  const out = {};
  if (b.name !== undefined) out.name = String(b.name).trim();
  if (b.slug !== undefined && String(b.slug).trim()) out.slug = String(b.slug).trim().toLowerCase().replace(/\s+/g, '-');
  if (b.description !== undefined) out.description = String(b.description || '');
  if (b.icon !== undefined) out.icon = String(b.icon || '');
  if (b.color !== undefined) out.color = String(b.color || '');
  if (isCreate) {
    if (!out.name) return { error: 'name is required' };
    if (!out.slug) out.slug = slugifyCategory(out.name);
  }
  return { values: out };
}

function readCategory(id) {
  const c = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!c) return null;
  const subs = db.prepare('SELECT id, name FROM subcategories WHERE category_id = ? ORDER BY id').all(id);
  const count = db.prepare('SELECT COUNT(*) AS n FROM products WHERE category_id = ? OR category_slug = ?').get(c.id, c.slug).n;
  return {
    id: c.id, name: c.name, slug: c.slug, icon: c.icon, color: c.color,
    description: c.description, count: count || 0,
    subcategories: subs.map((s) => s.name), subcategoryItems: subs,
  };
}

api.post('/categories', requireAdmin, (req, res) => {
  const { values, error } = categoryInput(req.body || {}, true);
  if (error) return res.status(400).json({ error });
  try {
    const info = db.prepare(`INSERT INTO categories (name, slug, icon, color, description, product_count)
      VALUES (@name, @slug, @icon, @color, @description, 0)`)
      .run({ name: values.name, slug: values.slug, icon: values.icon || '', color: values.color || '', description: values.description || '' });
    const subs = Array.isArray(req.body.subcategories) ? req.body.subcategories : [];
    const ins = db.prepare('INSERT OR IGNORE INTO subcategories (category_id, name) VALUES (?, ?)');
    for (const s of subs) { const n = String(s).trim(); if (n) ins.run(info.lastInsertRowid, n); }
    res.status(201).json(readCategory(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Category slug already exists' });
    throw e;
  }
});

api.put('/categories/:id', requireAdmin, (req, res) => {
  const cur = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Category not found' });
  const { values, error } = categoryInput(req.body || {}, false);
  if (error) return res.status(400).json({ error });
  if (values.name === '') return res.status(400).json({ error: 'name is required' });
  const oldSlug = cur.slug;
  const merged = {
    name: values.name ?? cur.name,
    slug: values.slug || (values.name ? slugifyCategory(values.name) : cur.slug),
    icon: values.icon ?? cur.icon, color: values.color ?? cur.color,
    description: values.description ?? cur.description,
  };
  try {
    db.prepare(`UPDATE categories SET name=@name, slug=@slug, icon=@icon, color=@color,
      description=@description WHERE id=@id`).run({ ...merged, id: req.params.id });
    if (merged.slug !== oldSlug) {
      db.prepare('UPDATE products SET category_slug = ?, category = ? WHERE category_id = ? OR category_slug = ?')
        .run(merged.slug, merged.name, req.params.id, oldSlug);
    } else if (merged.name !== cur.name) {
      db.prepare('UPDATE products SET category = ? WHERE category_id = ? OR category_slug = ?')
        .run(merged.name, req.params.id, merged.slug);
    }
    if (Array.isArray(req.body.subcategories)) {
      db.prepare('DELETE FROM subcategories WHERE category_id = ?').run(req.params.id);
      const ins = db.prepare('INSERT OR IGNORE INTO subcategories (category_id, name) VALUES (?, ?)');
      for (const s of req.body.subcategories) { const n = String(s).trim(); if (n) ins.run(req.params.id, n); }
    }
    res.json(readCategory(req.params.id));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Category slug already exists' });
    throw e;
  }
});

api.delete('/categories/:id', requireAdmin, (req, res) => {
  const cur = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Category not found' });
  const n = db.prepare('SELECT COUNT(*) AS n FROM products WHERE category_id = ? OR category_slug = ?').get(cur.id, cur.slug).n;
  if (n > 0 && req.query.force !== '1' && req.query.force !== 'true') {
    return res.status(409).json({ error: 'Category has products. Pass ?force=1 to delete anyway.', count: n });
  }
  db.prepare("UPDATE products SET category_id = NULL, category = '', category_slug = '' WHERE category_id = ? OR category_slug = ?")
    .run(cur.id, cur.slug);
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

api.post('/categories/:id/subcategories', requireAdmin, (req, res) => {
  const cur = db.prepare('SELECT id FROM categories WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Category not found' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const info = db.prepare('INSERT INTO subcategories (category_id, name) VALUES (?, ?)').run(req.params.id, name);
    res.status(201).json({ id: info.lastInsertRowid, name });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Subcategory already exists' });
    throw e;
  }
});

api.delete('/subcategories/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM subcategories WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Subcategory not found' });
  res.json({ ok: true });
});

api.get('/brands', (req, res) => {
  const rows = db.prepare('SELECT * FROM brands ORDER BY id').all();
  const countStmt = db.prepare('SELECT COUNT(*) AS n FROM products WHERE brand = ?');
  res.json(rows.map((b) => {
    let count = 0;
    try { count = countStmt.get(b.name).n; } catch (_) { count = 0; }
    return {
      id: b.id, name: b.name, slug: b.name,
      displayName: b.display_name, display_name: b.display_name,
      logo: b.logo, country: b.country, description: b.description,
      count,
    };
  }));
});

function brandInput(b, isCreate) {
  const out = {};
  if (b.name !== undefined) out.name = String(b.name).trim().toLowerCase().replace(/\s+/g, '-');
  if (b.slug !== undefined && String(b.slug).trim()) out.name = String(b.slug).trim().toLowerCase().replace(/\s+/g, '-');
  if (b.displayName !== undefined) out.display_name = String(b.displayName || '').trim();
  if (b.display_name !== undefined) out.display_name = String(b.display_name || '').trim();
  if (b.logo !== undefined) out.logo = String(b.logo || '').trim();
  if (b.country !== undefined) out.country = String(b.country || '').trim();
  if (b.description !== undefined) out.description = String(b.description || '').trim();
  if (isCreate) {
    if (!out.name) return { error: 'name is required' };
    if (!out.display_name) out.display_name = out.name;
  }
  return { values: out };
}

api.post('/brands', requireAdmin, (req, res) => {
  const { values, error } = brandInput(req.body || {}, true);
  if (error) return res.status(400).json({ error });
  try {
    const info = db.prepare('INSERT INTO brands (name, display_name, logo, country, description) VALUES (?, ?, ?, ?, ?)')
      .run(values.name, values.display_name || values.name, values.logo || '', values.country || '', values.description || '');
    const row = db.prepare('SELECT * FROM brands WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ id: row.id, name: row.name, slug: row.name, displayName: row.display_name, display_name: row.display_name, logo: row.logo, country: row.country, description: row.description, count: 0 });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Brand already exists' });
    throw e;
  }
});

api.put('/brands/:id', requireAdmin, (req, res) => {
  const cur = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Brand not found' });
  const { values, error } = brandInput(req.body || {}, false);
  if (error) return res.status(400).json({ error });
  if (values.name === '') return res.status(400).json({ error: 'name is required' });
  const oldName = cur.name;
  const merged = {
    name: values.name ?? cur.name,
    display_name: values.display_name ?? cur.display_name,
    logo: values.logo ?? cur.logo,
    country: values.country ?? cur.country,
    description: values.description ?? cur.description,
  };
  try {
    db.prepare('UPDATE brands SET name=@name, display_name=@display_name, logo=@logo, country=@country, description=@description WHERE id=@id')
      .run({ ...merged, id: req.params.id });
    if (merged.name !== oldName) {
      db.prepare('UPDATE products SET brand = ?, brand_name = ? WHERE brand = ?').run(merged.name, merged.display_name, oldName);
    } else if (merged.display_name !== cur.display_name) {
      db.prepare('UPDATE products SET brand_name = ? WHERE brand = ?').run(merged.display_name, cur.name);
    }
    const row = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id);
    const count = db.prepare('SELECT COUNT(*) AS n FROM products WHERE brand = ?').get(row.name).n;
    res.json({ id: row.id, name: row.name, slug: row.name, displayName: row.display_name, display_name: row.display_name, logo: row.logo, country: row.country, description: row.description, count });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Brand already exists' });
    throw e;
  }
});

api.delete('/brands/:id', requireAdmin, (req, res) => {
  const cur = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Brand not found' });
  const n = db.prepare('SELECT COUNT(*) AS n FROM products WHERE brand = ?').get(cur.name).n;
  if (n > 0 && req.query.force !== '1' && req.query.force !== 'true') {
    return res.status(409).json({ error: 'Brand has products. Pass ?force=1 to delete anyway.', count: n });
  }
  db.prepare("UPDATE products SET brand = '', brand_name = '', brand_id = NULL WHERE brand = ?").run(cur.name);
  db.prepare('DELETE FROM brands WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

api.get('/products', (req, res) => {
  const { category, brand, q, inStock, stock, status, limit = 100, offset = 0 } = req.query;
  const where = [];
  const params = [];
  if (category) { where.push('(category_slug = ? OR category = ?)'); params.push(category, category); }
  if (brand) { where.push('brand = ?'); params.push(brand); }
  if (inStock === 'true' || inStock === '1') where.push('in_stock = 1');
  if (stock === 'in') where.push('(in_stock = 1 AND COALESCE(stock_count, 0) > 0)');
  else if (stock === 'out') where.push('(in_stock = 0 OR COALESCE(stock_count, 0) <= 0)');
  if (status === 'active') where.push('COALESCE(is_active, 1) = 1');
  else if (status === 'inactive') where.push('COALESCE(is_active, 1) = 0');
  if (q) { where.push('(name LIKE ? OR sku LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const lim = Math.min(+limit || 100, 200);
  const off = Math.max(+offset || 0, 0);
  if (req.query.count === '1' || req.query.meta === '1') {
    const total = db.prepare(`SELECT COUNT(*) AS n FROM products ${clause}`).get(...params).n;
    const rows = db.prepare(`SELECT * FROM products ${clause} ORDER BY id LIMIT ? OFFSET ?`).all(...params, lim, off);
    return res.json({ total, items: rows.map(mapProduct) });
  }
  const sql = `SELECT * FROM products ${clause}
    ORDER BY id LIMIT ? OFFSET ?`;
  const rows = db.prepare(sql).all(...params, lim, off);
  res.json(rows.map(mapProduct));
});

const ExcelJS = require('exceljs');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits:{fileSize:5*1024*1024} });
const EXCEL_HEADERS = ['شناسه','نام محصول','برند','دسته‌بندی','زیردسته','SKU','مدل','توضیحات کوتاه','توضیحات کامل','قیمت','قیمت فروش','تخفیف','موجودی','وضعیت موجودی','حداقل سفارش','حداکثر سفارش','وزن','ابعاد','تولیدکننده','کشور سازنده','گارانتی','اقلام همراه','اصالت','ویژگی‌ها','تصاویر','واریانت‌ها','عنوان SEO','توضیحات SEO','کلمات کلیدی SEO','تصویر OG'];
function featuresToStr(j){ try{ const a=JSON.parse(j||'[]'); if(!Array.isArray(a)||!a.length) return ''; return a.map(f=>{ if(typeof f==='string') return f; const k=f.title||f.key||f.name||''; const v=f.value||f.val||''; return k? (v? `${k}: ${v}`:k):v; }).filter(Boolean).join(' | ');}catch(_){return '';} }
function strToFeatures(s){ if(!s) return '[]'; const parts=String(s).split('|').map(x=>x.trim()).filter(Boolean); const arr=parts.map(p=>{ const idx=p.indexOf(':'); if(idx>-1) return {title:p.slice(0,idx).trim(), value:p.slice(idx+1).trim()}; return {title:p,value:''}; }); return JSON.stringify(arr); }
function variantsToStr(j){ try{const a=JSON.parse(j||'[]'); return a.length?JSON.stringify(a):'';}catch(_){return '';} }
function strToVariants(s){ if(!s) return '[]'; try{ const a=JSON.parse(s); return JSON.stringify(Array.isArray(a)?a:[]);}catch(_){ return '[]'; } }
const EXPORT_COLUMNS = {
  id:{header:'شناسه',getter:r=>r.id, width:10, numFmt:'0'},
  name:{header:'نام محصول',getter:r=>r.name||'', width:28},
  sku:{header:'SKU',getter:r=>r.sku||'', width:16},
  brand:{header:'برند',getter:r=>r.brand||r.brand_name||'', width:16},
  category:{header:'دسته‌بندی',getter:r=>r.category||'', width:16},
  subcategory:{header:'زیردسته',getter:r=>r.subcategory||'', width:16},
  model:{header:'مدل',getter:r=>r.model||'', width:16},
  short_description:{header:'توضیحات کوتاه',getter:r=>r.short_description||'', width:30},
  description:{header:'توضیحات کامل',getter:r=>r.description||'', width:40},
  price:{header:'قیمت',getter:r=>r.price||0, width:14, numFmt:'#,##0'},
  
  sale_price:{header:'قیمت فروش',getter:r=>r.sale_price==null||r.sale_price===''?'':Number(r.sale_price), width:14, numFmt:'#,##0'},
  discount:{header:'تخفیف',getter:r=>r.discount||0, width:10, numFmt:'0'},
  stock_count:{header:'موجودی',getter:r=>r.stock_count||0, width:10, numFmt:'0'},
  in_stock:{header:'وضعیت موجودی',getter:r=>r.in_stock?'موجود':'ناموجود', width:13},
  min_order:{header:'حداقل سفارش',getter:r=>r.min_order||1, width:12, numFmt:'0'},
  max_order:{header:'حداکثر سفارش',getter:r=>r.max_order||0, width:12, numFmt:'0'},
  warehouse:{header:'انبار',getter:r=>r.warehouse||'', width:14},
  weight:{header:'وزن',getter:r=>r.weight==null||r.weight===''? '':Number(r.weight), width:10, numFmt:'0.00'},
  dimensions:{header:'ابعاد',getter:r=>r.dimensions||'', width:14},
  manufacturer:{header:'تولیدکننده',getter:r=>r.manufacturer||'', width:16},
  country:{header:'کشور سازنده',getter:r=>r.country||'', width:14},
  warranty:{header:'گارانتی',getter:r=>r.warranty||'', width:16},
  included_items:{header:'اقلام همراه',getter:r=>r.included_items||'', width:22},
  authenticity:{header:'اصالت',getter:r=>r.authenticity||'', width:12},
  features_json:{header:'ویژگی‌ها',getter:r=>featuresToStr(r.features_json||r.specs_json), width:36},
  gallery:{header:'تصاویر',getter:r=>{ try{const g=JSON.parse(r.gallery_json||'[]'); if(g.length) return g.join(', '); }catch(_){} try{const a=JSON.parse(r.images_json||'[]'); return a.join(', ');}catch(_){} return ''; }, width:30},
  variants_json:{header:'واریانت‌ها',getter:r=>{ try{const a=JSON.parse(r.variants_json||'[]'); if(!a.length) return ''; return a.map(v=>{ if(typeof v==='string') return v; const t=v.title||v.name||v.sku||''; const p=v.price!=null?` قیمت:${v.price}`:''; const s=v.stock!=null?` موجودی:${v.stock}`:''; return `${t}${p}${s}`.trim(); }).join(' | '); }catch(_){return '';} }, width:30},
  is_active:{header:'وضعیت',getter:r=>r.is_active==0||r.is_active===false?'غیرفعال':'فعال', width:10},
  created_at:{header:'تاریخ ایجاد',getter:r=>r.created_at||'', width:18},
  updated_at:{header:'تاریخ بروزرسانی',getter:r=>r.updated_at||'', width:18},
  seo_title:{header:'عنوان SEO',getter:r=>r.seo_title||'', width:24},
  seo_description:{header:'توضیحات SEO',getter:r=>r.seo_description||'', width:30},
  seo_keywords:{header:'کلمات کلیدی SEO',getter:r=>r.seo_keywords||'', width:24},
  og_image:{header:'تصویر OG',getter:r=>r.og_image||'', width:24},
};
const EXPORT_FULL_COLS = Object.keys(EXPORT_COLUMNS);
const EXPORT_SUMMARY_COLS = ['id','name','sku','brand','category','price','stock_count','in_stock','is_active'];

api.get('/products/export/excel', requireAdmin, async (req,res)=>{
  try{
    let cols;
    const type=(req.query.type||'').toLowerCase();
    if(req.query.cols){ cols=String(req.query.cols).split(',').map(s=>s.trim()).filter(Boolean).filter(k=>EXPORT_COLUMNS[k]); if(!cols.length) cols=EXPORT_FULL_COLS; }
    else if(type==='summary') cols=EXPORT_SUMMARY_COLS;
    else if(type==='custom' && req.query.cols) cols=String(req.query.cols).split(',').map(s=>s.trim()).filter(k=>EXPORT_COLUMNS[k]);
    else cols=EXPORT_FULL_COLS;
    if(type==='custom' && !req.query.cols) cols=EXPORT_FULL_COLS;
    const headers=cols.map(k=>EXPORT_COLUMNS[k].header);
    const rows=db.prepare('SELECT * FROM products ORDER BY id').all();
    const wb=new ExcelJS.Workbook(); wb.creator='Camzy'; wb.created=new Date();
    const ws=wb.addWorksheet('محصولات',{views:[{rightToLeft:true, state:'frozen', ySplit:1}]});
    ws.properties.defaultRowHeight=16;
    const headerRow=ws.addRow(headers);
    headerRow.font={bold:true, color:{argb:'FFFFFFFF'}, size:11};
    headerRow.alignment={horizontal:'center', vertical:'middle', wrapText:true};
    headerRow.eachCell(c=>{ c.fill={type:'pattern', pattern:'solid', fgColor:{argb:'FF1E3A5F'}}; c.border={top:{style:'thin',color:{argb:'FFB0B0B0'}},bottom:{style:'thin',color:{argb:'FFB0B0B0'}},left:{style:'thin',color:{argb:'FFB0B0B0'}},right:{style:'thin',color:{argb:'FFB0B0B0'}}}; });
    ws.getRow(1).height=20;
    // practical column widths
    ws.columns=cols.map(k=>({header:EXPORT_COLUMNS[k].header, key:k, width:EXPORT_COLUMNS[k].width||18, style:{alignment:{vertical:'middle', wrapText:k==='short_description'||k==='description'||k==='features_json'||k==='gallery'||k==='variants_json'?true:false, horizontal: EXPORT_COLUMNS[k].numFmt ? 'center' : 'right'}}}));
    // need to keep header row values after redefining columns (ExcelJS clears first row) -> rewrite header
    ws.getRow(1).values=[null,...headers];
    ws.getRow(1).font={bold:true, color:{argb:'FFFFFFFF'}, size:11};
    ws.getRow(1).alignment={horizontal:'center', vertical:'middle', wrapText:true};
    ws.getRow(1).eachCell(c=>{ if(c.value!=null){ c.fill={type:'pattern', pattern:'solid', fgColor:{argb:'FF1E3A5F'}}; c.border={top:{style:'thin',color:{argb:'FFB0B0B0'}},bottom:{style:'thin',color:{argb:'FFB0B0B0'}},left:{style:'thin',color:{argb:'FFB0B0B0'}},right:{style:'thin',color:{argb:'FFB0B0B0'}}}; }});
    for(const r of rows){
      const vals=cols.map(k=>{ try{return EXPORT_COLUMNS[k].getter(r);}catch(_){return '';} });
      const row=ws.addRow(vals);
      row.alignment={vertical:'middle', wrapText:false};
      // numeric formatting
      cols.forEach((k,i)=>{
        const col=EXPORT_COLUMNS[k];
        if(col.numFmt){
          const cell=row.getCell(i+1);
          const v=cell.value;
          if(v!=='' && v!=null && !isNaN(Number(v))){
            cell.value=Number(v);
            cell.numFmt=col.numFmt;
          } else if(v==='') { cell.value=''; }
        }
        // RTL read fix: right align text cells
        const c=row.getCell(i+1);
        if(!col.numFmt) c.alignment={vertical:'middle', horizontal:'right', wrapText: k==='short_description'||k==='description'||k==='features_json'||k==='gallery'||k==='variants_json'};
        else c.alignment={vertical:'middle', horizontal:'center'};
      });
      row.eachCell(c=>{ c.border={top:{style:'thin',color:{argb:'FFE0E0E0'}},bottom:{style:'thin',color:{argb:'FFE0E0E0'}},left:{style:'thin',color:{argb:'FFE0E0E0'}},right:{style:'thin',color:{argb:'FFE0E0E0'}}}; });
    }
    if(ws.rowCount>1) ws.autoFilter={from:{row:1,column:1}, to:{row:1,column:cols.length}};
    ws.views=[{rightToLeft:true, state:'frozen', ySplit:1}];
    const buf=await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition','attachment; filename="products.xlsx"');
    res.send(Buffer.from(buf));
  }catch(e){ res.status(500).json({error:e.message}); }
});

api.post('/products/import/excel', requireAdmin, upload.single('file'), async (req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'فایل ارسال نشد'});
    const wb=new ExcelJS.Workbook(); await wb.xlsx.load(req.file.buffer);
    const ws=wb.worksheets[0]; if(!ws) return res.status(400).json({error:'شیت یافت نشد'});
    const headerRow=ws.getRow(1).values.slice(1).map(v=>String(v||'').trim());
    // allow flexible header check
    const idx={}; EXCEL_HEADERS.forEach((h,i)=> idx[h]=headerRow.indexOf(h));
    if(idx['نام محصول']===-1) return res.status(400).json({error:'هدر اکسل نامعتبر است'});
    let created=0, updated=0; const errors=[];
    for(let r=2;r<=ws.rowCount;r++){
      const row=ws.getRow(r); if(row.cellCount===0) continue;
      const vals=row.values.slice(1);
      const get=(h)=>{ const i=idx[h]; return i===-1?'': (vals[i]??''); };
      const rawId=String(get('شناسه')||'').trim();
      const name=String(get('نام محصول')||'').trim();
      const sku=String(get('SKU')||'').trim();
      const isEmptyRow=!name && !sku && !rawId;
      if(isEmptyRow) continue;
      // find existing
      let cur=null;
      if(rawId && /^\d+$/.test(rawId)) cur=db.prepare('SELECT * FROM products WHERE id=?').get(Number(rawId));
      if(!cur && sku) cur=db.prepare('SELECT * FROM products WHERE sku=?').get(sku);
      if(cur){
        // update preserving empty cells
        const fields={};
        const setIf = (excelHeader, col, transform)=>{ const v=get(excelHeader); if(String(v).trim()!==''){ fields[col]= transform?transform(v):String(v).trim(); } };
        setIf('نام محصول','name'); setIf('برند','brand'); setIf('دسته‌بندی','category'); setIf('زیردسته','subcategory');
        setIf('SKU','sku'); setIf('مدل','model'); setIf('توضیحات کوتاه','short_description'); setIf('توضیحات کامل','description');
        setIf('قیمت','price',v=>Math.round(Number(v)||0));  setIf('قیمت فروش','sale_price',v=>String(v).trim()===''?null:Math.round(Number(v)||0));
        setIf('تخفیف','discount',v=>Math.round(Number(v)||0)); setIf('موجودی','stock_count',v=>Math.round(Number(v)||0));
        setIf('وضعیت موجودی','in_stock',v=> String(v).includes('ناموجود')?0:1);
        setIf('حداقل سفارش','min_order',v=>Math.round(Number(v)||1)); setIf('حداکثر سفارش','max_order',v=>Math.round(Number(v)||0));
        setIf('وزن','weight',v=>Number(v)||0); setIf('ابعاد','dimensions'); setIf('تولیدکننده','manufacturer'); setIf('کشور سازنده','country');
        setIf('گارانتی','warranty'); setIf('اقلام همراه','included_items'); setIf('اصالت','authenticity');
        const feat=get('ویژگی‌ها'); if(String(feat).trim()!=='') fields['features_json']=strToFeatures(feat);
        const imgs=get('تصاویر'); if(String(imgs).trim()!==''){ const arr=String(imgs).split(',').map(s=>s.trim()).filter(Boolean); fields['gallery_json']=JSON.stringify(arr); fields['images_json']=JSON.stringify(arr); }
        const vari=get('واریانت‌ها'); if(String(vari).trim()!=='') fields['variants_json']=strToVariants(vari);
        setIf('عنوان SEO','seo_title'); setIf('توضیحات SEO','seo_description'); setIf('کلمات کلیدی SEO','seo_keywords'); setIf('تصویر OG','og_image');
        if(!Object.keys(fields).length){ errors.push({row:r, error:'ردیف بدون تغییر'}); continue; }
        const setClause=Object.keys(fields).map(k=>`${k}=@`+k).join(', ');
        try{ db.prepare(`UPDATE products SET ${setClause}, updated_at=datetime('now') WHERE id=@id`).run({...fields, id:cur.id}); updated++; }catch(e){ errors.push({row:r, error:e.message}); }
      } else {
        if(!name){ errors.push({row:r, error:'نام محصول الزامی است'}); continue; }
        const p={ name, sku: sku||null, brand:String(get('برند')||''), category:String(get('دسته‌بندی')||''), subcategory:String(get('زیردسته')||''), model:String(get('مدل')||''), short_description:String(get('توضیحات کوتاه')||''), description:String(get('توضیحات کامل')||''), price:Math.round(Number(get('قیمت'))||0), sale_price:String(get('قیمت فروش')).trim()===''?null:Math.round(Number(get('قیمت فروش'))||0), discount:Math.round(Number(get('تخفیف'))||0), stock_count:Math.round(Number(get('موجودی'))||0), in_stock:String(get('وضعیت موجودی')).includes('ناموجود')?0:1, min_order:Math.round(Number(get('حداقل سفارش'))||1), max_order:Math.round(Number(get('حداکثر سفارش'))||0), weight:Number(get('وزن'))||0, dimensions:String(get('ابعاد')||''), manufacturer:String(get('تولیدکننده')||''), country:String(get('کشور سازنده')||''), warranty:String(get('گارانتی')||''), included_items:String(get('اقلام همراه')||''), authenticity:String(get('اصالت')||''), features_json:strToFeatures(get('ویژگی‌ها')), gallery_json:JSON.stringify(String(get('تصاویر')||'').split(',').map(s=>s.trim()).filter(Boolean)), images_json:JSON.stringify(String(get('تصاویر')||'').split(',').map(s=>s.trim()).filter(Boolean)), variants_json:strToVariants(get('واریانت‌ها')), seo_title:String(get('عنوان SEO')||''), seo_description:String(get('توضیحات SEO')||''), seo_keywords:String(get('کلمات کلیدی SEO')||''), og_image:String(get('تصویر OG')||''), slug: String(name).trim().toLowerCase().replace(/[\s_]+/g,'-').replace(/[^a-z0-9\u0600-\u06FF-]+/g,'').replace(/-+/g,'-')||('product-'+Date.now()+r) };
        // handle duplicate sku
        try{ const cols=Object.keys(p); db.prepare(`INSERT INTO products (${cols.join(',')}) VALUES (${cols.map(c=>'@'+c).join(',')})`).run(p); created++; }catch(e){ errors.push({row:r, error:e.message}); }
      }
    }
    res.json({created, updated, errors, message:`${created} ایجاد، ${updated} به‌روزرسانی`});
  }catch(e){ res.status(500).json({error:e.message}); }
});

api.post('/products/import/preview', requireAdmin, upload.single('file'), async (req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'فایل ارسال نشد'});
    const wb=new ExcelJS.Workbook(); await wb.xlsx.load(req.file.buffer);
    const ws=wb.worksheets[0]; const headerRow=ws.getRow(1).values.slice(1).map(v=>String(v||'').trim());
    const idx={}; EXCEL_HEADERS.forEach(h=> idx[h]=headerRow.indexOf(h));
    const preview=[];
    for(let r=2;r<=Math.min(ws.rowCount,12);r++){ const vals=ws.getRow(r).values.slice(1); if(vals.filter(Boolean).length===0) continue; const get=h=>{const i=idx[h]; return i===-1?'':String(vals[i]??'').trim();}; const sku=get('SKU'), rawId=get('شناسه'); let action='create'; if(rawId && db.prepare('SELECT 1 FROM products WHERE id=?').get(Number(rawId))) action='update'; else if(sku && db.prepare('SELECT 1 FROM products WHERE sku=?').get(sku)) action='update'; preview.push({row:r, id:rawId, name:get('نام محصول'), sku, action}); }
    res.json({headers:headerRow, preview, totalRows: ws.rowCount-1});
  }catch(e){ res.status(500).json({error:e.message}); }
});
api.get('/products/:id/options', (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'Invalid product id' });
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const rows = db.prepare('SELECT * FROM product_options WHERE product_id = ? AND is_active = 1 ORDER BY sort_order, id').all(productId);
  res.json(rows.map(mapProductOption));
});

api.get('/admin/products/:id/options', requireAdmin, (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'Invalid product id' });
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const rows = db.prepare('SELECT * FROM product_options WHERE product_id = ? ORDER BY sort_order, id').all(productId);
  res.json(rows.map(mapProductOption));
});

api.post('/admin/products/:id/options', requireAdmin, (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'Invalid product id' });
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const { values, error } = optionInput(req.body || {}, true);
  if (error) return res.status(400).json({ error });
  try {
    const info = db.prepare(`INSERT INTO product_options (product_id, title, description, price, discount_percent, discount_price, sort_order, is_active, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`)
      .run(productId, values.title, values.description || '', values.price ?? 0, values.discount_percent ?? 0, values.discount_price, values.sort_order ?? 0, values.is_active ?? 1);
    res.status(201).json(mapProductOption(db.prepare('SELECT * FROM product_options WHERE id = ?').get(info.lastInsertRowid)));
  } catch (e) {
    throw e;
  }
});

api.put('/admin/products/:id/options/:optionId', requireAdmin, (req, res) => {
  const productId = Number(req.params.id);
  const optionId = Number(req.params.optionId);
  if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'Invalid product id' });
  if (!Number.isInteger(optionId) || optionId <= 0) return res.status(400).json({ error: 'Invalid option id' });
  const cur = db.prepare('SELECT * FROM product_options WHERE id = ? AND product_id = ?').get(optionId, productId);
  if (!cur) return res.status(404).json({ error: 'Option not found' });
  const { values, error } = optionInput(req.body || {}, false);
  if (error) return res.status(400).json({ error });
  const merged = {
    title: values.title ?? cur.title,
    description: values.description ?? cur.description,
    price: values.price !== undefined ? values.price : cur.price,
    discount_percent: values.discount_percent !== undefined ? values.discount_percent : cur.discount_percent,
    discount_price: values.discount_price !== undefined ? values.discount_price : cur.discount_price,
    sort_order: values.sort_order !== undefined ? values.sort_order : cur.sort_order,
    is_active: values.is_active !== undefined ? values.is_active : cur.is_active,
  };
  try {
    db.prepare(`UPDATE product_options SET title=@title, description=@description, price=@price, discount_percent=@discount_percent,
      discount_price=@discount_price, sort_order=@sort_order, is_active=@is_active, updated_at=datetime('now') WHERE id=@id`)
      .run({ ...merged, id: optionId });
    res.json(mapProductOption(db.prepare('SELECT * FROM product_options WHERE id = ?').get(optionId)));
  } catch (e) {
    throw e;
  }
});

api.delete('/admin/products/:id/options/:optionId', requireAdmin, (req, res) => {
  const productId = Number(req.params.id);
  const optionId = Number(req.params.optionId);
  if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'Invalid product id' });
  if (!Number.isInteger(optionId) || optionId <= 0) return res.status(400).json({ error: 'Invalid option id' });
  const info = db.prepare('DELETE FROM product_options WHERE id = ? AND product_id = ?').run(optionId, productId);
  if (!info.changes) return res.status(404).json({ error: 'Option not found' });
  res.json({ ok: true });
});

// ── Products (public detail) ──
api.get('/products/:idOrSlug', (req, res) => {
  const key = req.params.idOrSlug;
  const row = db.prepare('SELECT * FROM products WHERE id = ? OR slug = ?').get(key, key);
  if (!row) return res.status(404).json({ error: 'Product not found' });
  res.json(mapProduct(row));
});

// ── Products (admin write) ──
function slugify(s) {
  return String(s || '').trim().toLowerCase()
    .replace(/[_\s]+/g, '-').replace(/[^a-z0-9\u0600-\u06FF-]+/g, '')
    .replace(/-+/g, '-').replace(/^-|-$/g, '') || ('product-' + Date.now().toString(36));
}

function productInput(b, isCreate) {
  const out = {};
  if (b.name !== undefined) out.name = String(b.name).trim();
  if (b.slug !== undefined) out.slug = String(b.slug).trim();
  if (b.brand !== undefined) out.brand = String(b.brand || '');
  if (b.brandKey !== undefined) out.brand = String(b.brandKey || '');
  if (b.brandName !== undefined) out.brand_name = String(b.brandName || '');
  if (b.brand !== undefined && out.brand_name === undefined) out.brand_name = String(b.brandName || b.brand || '');
  if (b.category !== undefined) out.category = String(b.category || '');
  if (b.categorySlug !== undefined) out.category_slug = String(b.categorySlug || '');
  if (b.categoryName !== undefined) out.category = String(b.categoryName || '');
  if (b.subcategory !== undefined) out.subcategory = String(b.subcategory || '');
  if (b.model !== undefined) out.model = String(b.model || '');
  if (b.status !== undefined && !['active','inactive','outofstock'].includes(b.status)) out.status_custom = String(b.status||'');
  if (b.image !== undefined) {
    const img = String(b.image || '').split('/').pop();
    out.image = img.includes('.') ? img : img;
    out.images_json = JSON.stringify([b.image.includes('/') ? b.image : ('assets/images/products/' + img)]);
  }
  if (b.gallery !== undefined) out.gallery_json = JSON.stringify(Array.isArray(b.gallery)?b.gallery:[]);
  if (b.images !== undefined) out.images_json = JSON.stringify(Array.isArray(b.images)?b.images:[]);
  if (b.gallery_json !== undefined) out.gallery_json = String(b.gallery_json);
  if (b.price !== undefined) out.price = Math.max(0, Math.round(Number(b.price) || 0));
  if (b.salePrice !== undefined) out.sale_price = b.salePrice==null?'':Math.max(0, Math.round(Number(b.salePrice)||0));
  if (b.oldPrice !== undefined) out.old_price = b.oldPrice==null?null:Math.max(0, Math.round(Number(b.oldPrice)||0));
  if (b.discount !== undefined) out.discount = Math.max(0, Math.round(Number(b.discount)||0));
  if (b.discountEndsAt !== undefined) out.discount_ends_at = b.discountEndsAt?String(b.discountEndsAt):null;
  if (b.sku !== undefined) out.sku = String(b.sku || '').trim() || null;
  if (b.shortDescription !== undefined) out.short_description = String(b.shortDescription || '');
  if (b.desc !== undefined) out.short_description = String(b.desc || '');
  if (b.description !== undefined) out.description = String(b.description || '');
  if (b.stockCount !== undefined) out.stock_count = Math.max(0, Math.round(Number(b.stockCount) || 0));
  if (b.stock !== undefined) out.stock_count = Math.max(0, Math.round(Number(b.stock) || 0));
  if (b.stockStatus !== undefined) out.stock_status = String(b.stockStatus||'');
  if (b.minOrder !== undefined) out.min_order = Math.max(1, Math.round(Number(b.minOrder)||1));
  if (b.maxOrder !== undefined) out.max_order = Math.max(0, Math.round(Number(b.maxOrder)||0));
  if (b.warehouse !== undefined) out.warehouse = String(b.warehouse||'');
  if (b.weight !== undefined) out.weight = Number(b.weight)||0;
  if (b.dimensions !== undefined) out.dimensions = String(b.dimensions||'');
  if (b.manufacturer !== undefined) out.manufacturer = String(b.manufacturer||'');
  if (b.country !== undefined) out.country = String(b.country||'');
  if (b.warranty !== undefined) out.warranty = String(b.warranty||'');
  if (b.includedItems !== undefined) out.included_items = String(b.includedItems||'');
  if (b.authenticity !== undefined) out.authenticity = String(b.authenticity||'');
  if (b.seoTitle !== undefined) out.seo_title = String(b.seoTitle||'');
  if (b.seoDescription !== undefined) out.seo_description = String(b.seoDescription||'');
  if (b.seoKeywords !== undefined) out.seo_keywords = String(b.seoKeywords||'');
  if (b.ogImage !== undefined) out.og_image = String(b.ogImage||'');
  if (b.specs !== undefined) out.specs_json = JSON.stringify(Array.isArray(b.specs)?b.specs:b.specs||{});
  if (b.features !== undefined) out.features_json = JSON.stringify(Array.isArray(b.features)?b.features:[]);
  if (b.variants !== undefined) out.variants_json = JSON.stringify(Array.isArray(b.variants)?b.variants:[]);
  if (b.shipping !== undefined) out.shipping_json = JSON.stringify(b.shipping||{});
  if (b.status !== undefined) {
    if (b.status === 'inactive') out.is_active = 0;
    else if (b.status === 'active') out.is_active = 1;
    else if (b.status === 'outofstock') { out.in_stock = 0; out.stock_count = 0; }
    if (out.stock_count === undefined && b.inStock !== undefined) out.stock_count = b.inStock ? 50 : 0;
  } else if (b.inStock !== undefined) {
    out.in_stock = b.inStock ? 1 : 0;
  }
  if (b.isActive !== undefined) out.is_active = b.isActive ? 1 : 0;
  if (b.is_active !== undefined) out.is_active = b.is_active ? 1 : 0;
  if (out.stock_count !== undefined && out.in_stock === undefined) {
    out.in_stock = out.stock_count > 0 ? 1 : 0;
  }
  // Resolve category/brand display names + ids when slugs/keys given.
  if (b.categorySlug !== undefined || b.category !== undefined) {
    const slug = b.categorySlug || out.category_slug;
    if (slug) {
      const cat = db.prepare('SELECT id, name, slug FROM categories WHERE slug = ? OR name = ?').get(slug, out.category || slug);
      if (cat) { out.category_id = cat.id; out.category = cat.name; out.category_slug = cat.slug; }
    }
  }
  if (b.brandKey !== undefined || b.brand !== undefined) {
    const key = b.brandKey || out.brand;
    if (key) {
      const br = db.prepare('SELECT id, name, display_name FROM brands WHERE name = ? OR display_name = ?').get(key, out.brand_name || key);
      if (br) { out.brand_id = br.id; out.brand = br.name; out.brand_name = br.display_name; }
    }
  }
  if (isCreate) {
    if (!out.name) return { error: 'name is required' };
    if (!out.slug) out.slug = slugify(out.name);
  }
  return { values: out };
}

api.post('/products', requireAdmin, (req, res) => {
  const { values, error } = productInput(req.body || {}, true);
  if (error) return res.status(400).json({ error });
  try {
    // Generic insert for all provided columns + defaults
    const cols=['name','slug','brand','brand_name','brand_id','category','category_slug','category_id','subcategory','model','image','images_json','gallery_json','price','sale_price','old_price','discount','discount_ends_at','is_active','in_stock','stock_count','stock_status','min_order','max_order','warehouse','weight','dimensions','sku','short_description','description','specs_json','features_json','variants_json','shipping_json','manufacturer','country','warranty','included_items','authenticity','seo_title','seo_description','seo_keywords','og_image'];
    const row={}; cols.forEach(c=> row[c]=values[c]!==undefined?values[c]: (['brand','brand_name','category','category_slug','subcategory','model','image','stock_status','warehouse','dimensions','short_description','description','manufacturer','country','warranty','included_items','authenticity','seo_title','seo_description','seo_keywords','og_image'].includes(c)?'':null));
    if(!row.images_json) row.images_json='[]'; if(!row.gallery_json) row.gallery_json='[]'; if(!row.specs_json) row.specs_json='{}'; if(!row.features_json) row.features_json='[]'; if(!row.variants_json) row.variants_json='[]'; if(!row.shipping_json) row.shipping_json='{}';
    if(row.price==null) row.price=0; if(row.is_active==null) row.is_active=1; if(row.in_stock==null) row.in_stock=1; if(row.stock_count==null) row.stock_count=50;
    const keys=Object.keys(row).filter(k=>row[k]!==null);
    const placeholders=keys.map(k=>'@'+k).join(',');
    const params={}; keys.forEach(k=> params[k]=row[k]);
    const info=db.prepare(`INSERT INTO products (${keys.join(',')}) VALUES (${placeholders})`).run(params);
    res.status(201).json(mapProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid)));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'SKU or slug already exists' });
    throw e;
  }
});

api.put('/products/:id', requireAdmin, (req, res) => {
  const cur = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Product not found' });
  let { values, error } = productInput(req.body || {}, false);
  if (error) return res.status(400).json({ error });
  if (values.slug === '') values.slug = cur.slug;
  if (values.name === '') return res.status(400).json({ error: 'name is required' });
  const merged = {
    name: values.name ?? cur.name, slug: values.slug || slugify(values.name ?? cur.name),
    brand: values.brand ?? cur.brand, brand_name: values.brand_name ?? cur.brand_name,
    brand_id: values.brand_id ?? cur.brand_id,
    category: values.category ?? cur.category, category_slug: values.category_slug ?? cur.category_slug,
    subcategory: values.subcategory ?? cur.subcategory, model: values.model ?? cur.model,
    sale_price: values.sale_price!==undefined?values.sale_price:cur.sale_price, discount: values.discount ?? cur.discount, discount_ends_at: values.discount_ends_at!==undefined?values.discount_ends_at:cur.discount_ends_at,
    stock_status: values.stock_status ?? cur.stock_status, min_order: values.min_order ?? cur.min_order, max_order: values.max_order ?? cur.max_order, warehouse: values.warehouse ?? cur.warehouse, weight: values.weight ?? cur.weight, dimensions: values.dimensions ?? cur.dimensions,
    manufacturer: values.manufacturer ?? cur.manufacturer, country: values.country ?? cur.country, warranty: values.warranty ?? cur.warranty, included_items: values.included_items ?? cur.included_items, authenticity: values.authenticity ?? cur.authenticity,
    seo_title: values.seo_title ?? cur.seo_title, seo_description: values.seo_description ?? cur.seo_description, seo_keywords: values.seo_keywords ?? cur.seo_keywords, og_image: values.og_image ?? cur.og_image,
    gallery_json: values.gallery_json ?? cur.gallery_json, features_json: values.features_json ?? cur.features_json, variants_json: values.variants_json ?? cur.variants_json, shipping_json: values.shipping_json ?? cur.shipping_json, specs_json: values.specs_json ?? cur.specs_json,
    category_id: values.category_id ?? cur.category_id,
    image: values.image ?? cur.image, images_json: values.images_json ?? cur.images_json,
    price: values.price ?? cur.price,
    is_active: values.is_active !== undefined ? values.is_active : (cur.is_active == null ? 1 : cur.is_active),
    in_stock: values.in_stock ?? cur.in_stock,
    stock_count: values.stock_count ?? cur.stock_count ?? (cur.in_stock ? 50 : 0),
    sku: values.sku !== undefined ? values.sku : cur.sku,
    short_description: values.short_description ?? cur.short_description,
    description: values.description ?? cur.description,
  };
  try {
    db.prepare(`UPDATE products SET name=@name, slug=@slug, brand=@brand, brand_name=@brand_name,
      brand_id=@brand_id, category=@category, category_slug=@category_slug, category_id=@category_id, subcategory=@subcategory, model=@model,
      image=@image, images_json=@images_json, gallery_json=@gallery_json, price=@price, sale_price=@sale_price, old_price=@old_price, discount=@discount, discount_ends_at=@discount_ends_at,
      is_active=@is_active, in_stock=@in_stock, stock_status=@stock_status,
      stock_count=@stock_count, min_order=@min_order, max_order=@max_order, warehouse=@warehouse, weight=@weight, dimensions=@dimensions,
      sku=@sku, short_description=@short_description, specs_json=@specs_json, features_json=@features_json, variants_json=@variants_json, shipping_json=@shipping_json,
      manufacturer=@manufacturer, country=@country, warranty=@warranty, included_items=@included_items, authenticity=@authenticity, seo_title=@seo_title, seo_description=@seo_description, seo_keywords=@seo_keywords, og_image=@og_image,
      description=@description, updated_at=datetime('now') WHERE id=@id`)
      .run({ ...merged, id: req.params.id });
    res.json(mapProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'SKU or slug already exists' });
    throw e;
  }
});

// ── Products Excel Export/Import ──


api.delete('/products/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Product not found' });
  res.json({ ok: true });
});

// ── Product Options (add-on extras) ──
function mapProductOption(r) {
  if (!r) return r;
  return {
    id: r.id,
    productId: r.product_id,
    title: r.title,
    description: r.description,
    price: Number(r.price) || 0,
    discountPercent: Number(r.discount_percent) || 0,
    discountPrice: r.discount_price != null ? Number(r.discount_price) : null,
    sortOrder: Number(r.sort_order) || 0,
    isActive: !!r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function optionInput(b, isCreate) {
  const out = {};
  if (b.title !== undefined) out.title = String(b.title).trim();
  if (b.description !== undefined) out.description = String(b.description || '');
  if (b.price !== undefined) out.price = Math.max(0, Math.round(Number(b.price) || 0));
  if (b.discountPercent !== undefined) out.discount_percent = Math.max(0, Math.min(100, Math.round(Number(b.discountPercent) || 0)));
  if (b.discountPrice !== undefined) out.discount_price = b.discountPrice == null ? null : Math.max(0, Math.round(Number(b.discountPrice) || 0));
  if (b.sortOrder !== undefined) out.sort_order = Math.max(0, Math.round(Number(b.sortOrder) || 0));
  if (b.isActive !== undefined) out.is_active = b.isActive ? 1 : 0;
  if (isCreate) {
    if (!out.title) return { error: 'title is required' };
  }
  return { values: out };
}

// ── Customer auth (token-based, admin auth untouched) ──
const crypto = require('crypto');

function mapUser(r) {
  if (!r) return r;
  return {
    id: r.id, firstName: r.first_name, lastName: r.last_name,
    mobile: r.mobile, email: r.email || '', joinDate: r.join_date,
  };
}

function issueToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare("INSERT INTO customer_sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))")
    .run(token, userId);
  return token;
}

function getAuthUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const sess = db.prepare("SELECT user_id FROM customer_sessions WHERE token = ? AND expires_at > datetime('now')").get(token);
  if (!sess) return null;
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(sess.user_id);
  if (!row || Number(row.is_blocked) === 1) return null;
  return row ? { row, token } : null;
}

api.post('/auth/register', (req, res) => {
  const { firstName, lastName, mobile, email, password } = req.body || {};
  if (!firstName || !lastName || !mobile) {
    return res.status(400).json({ error: 'firstName, lastName, mobile are required' });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    const uid = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const joinDate = new Date().toLocaleDateString('fa-IR');
    db.prepare(`INSERT INTO users (id, first_name, last_name, mobile, email, password_hash, join_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(uid, String(firstName).trim(), String(lastName).trim(), String(mobile).trim(),
        email ? String(email).trim() || null : null, bcrypt.hashSync(String(password), 10), joinDate);
    const token = issueToken(uid);
    const user = mapUser(db.prepare('SELECT id, first_name, last_name, mobile, email, join_date FROM users WHERE id = ?').get(uid));
    res.status(201).json({ user, token });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Mobile or email already exists' });
    throw e;
  }
});

api.post('/auth/login', (req, res) => {
  const { identifier, mobile, email, password, username } = req.body || {};
  const idf = String(identifier || mobile || email || username || '').trim();
  if (!idf) return res.status(400).json({ error: 'identifier is required' });
  // Admin check first: allow admin username via main login
  try {
    const adminRow = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(idf);
    if (adminRow && adminRow.password_hash && password && bcrypt.compareSync(String(password), adminRow.password_hash)) {
      if (Number(adminRow.is_active == null ? 1 : adminRow.is_active) !== 1) {
        return res.status(403).json({ error: 'حساب مدیریتی شما غیرفعال شده است.' });
      }
      try { ensureAdminSessions(); } catch (_) {}
      const adminToken = crypto.randomBytes(32).toString('hex');
      db.prepare("INSERT INTO admin_sessions (token, admin_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))").run(adminToken, adminRow.id);
      return res.json({ user: { id: 'admin:'+adminRow.id, firstName: adminRow.name, lastName: '', mobile: adminRow.username, email: '', joinDate: '' }, token: adminToken, isAdmin: true, admin: mapAdmin(adminRow), adminToken });
    }
  } catch (_) {}
  const row = db.prepare('SELECT * FROM users WHERE mobile = ? OR email = ?').get(idf, idf);
  if (!row) return res.status(401).json({ error: 'کاربری با این مشخصات یافت نشد.' });
  if (Number(row.is_blocked) === 1) return res.status(403).json({ error: 'حساب کاربری شما مسدود شده است.' });
  if (row.password_hash) {
    if (!password || !bcrypt.compareSync(String(password), row.password_hash)) {
      return res.status(401).json({ error: 'رمز عبور اشتباه است.' });
    }
  }
  const token = issueToken(row.id);
  res.json({ user: mapUser(row), token, isAdmin: false });
});

api.post('/auth/logout', (req, res) => {
  const auth = getAuthUser(req);
  if (auth) db.prepare('DELETE FROM customer_sessions WHERE token = ?').run(auth.token);
  res.json({ ok: true });
});

api.get('/auth/me', (req, res) => {
  const auth = getAuthUser(req);
  if (!auth) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user: mapUser(auth.row) });
});

// ── Admin auth (token-based, backed by admin_users + bcrypt) ──
// Roles + per-section permissions, enforced server-side in requireAdmin.
// migrate existing accounts safely: new columns default to active + role-based perms.
function ensureAdminColumns() {
  try {
    const cols = db.prepare('PRAGMA table_info(admin_users)').all().map((c) => c.name);
    if (cols.indexOf('is_active') === -1) db.exec('ALTER TABLE admin_users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
    if (cols.indexOf('permissions') === -1) db.exec('ALTER TABLE admin_users ADD COLUMN permissions TEXT');
  } catch (_) {}
}
try { ensureAdminColumns(); } catch (_) {}
// One key per admin sidebar view (data-view). 'dashboard' needs no API section.
const ADMIN_SECTIONS = ['dashboard', 'orders', 'transactions', 'reports', 'discounts', 'products',
  'categories', 'users', 'notifications', 'tickets', 'contact-messages', 'chatbot-messages', 'brands', 'articles', 'reviews',
  'content', 'home', 'gallery', 'admins', 'logs', 'settings', 'store-info', 'sms', 'seo'];
const ROLE_PERMS = {
  superadmin: { sections: 'all', readonly: false },
  admin: { sections: 'all', readonly: false },
  manager: { sections: ADMIN_SECTIONS.filter((s) => s !== 'admins'), readonly: false },
  editor: { sections: ['products', 'categories', 'brands', 'articles', 'content', 'home', 'gallery', 'reviews'], readonly: false },
  support: { sections: ['tickets', 'contact-messages', 'users', 'notifications', 'reviews', 'orders'], readonly: false },
  viewer: { sections: 'all', readonly: true },
};
const VALID_ROLES = new Set(Object.keys(ROLE_PERMS));
function effectivePerms(row) {
  if (!row) return { sections: [], readonly: true };
  try {
    if (row.permissions) {
      const custom = JSON.parse(row.permissions);
      if (custom && typeof custom === 'object') {
        const sections = custom.sections === 'all' ? 'all'
          : (Array.isArray(custom.sections) ? custom.sections.filter((s) => ADMIN_SECTIONS.includes(s)) : []);
        return { sections, readonly: !!custom.readonly, custom: true };
      }
    }
  } catch (_) {}
  const preset = ROLE_PERMS[row.role];
  if (preset) return { sections: preset.sections, readonly: !!preset.readonly, custom: false };
  return { sections: [], readonly: true, custom: false };
}
function hasSection(perms, section) {
  if (!section) return true;
  if (perms.sections === 'all') return true;
  return Array.isArray(perms.sections) && perms.sections.indexOf(section) !== -1;
}
function mapAdmin(r) {
  if (!r) return r;
  const perms = effectivePerms(r);
  return {
    id: r.id, username: r.username, fullName: r.name, name: r.name, role: r.role,
    isActive: Number(r.is_active == null ? 1 : r.is_active) === 1,
    permissions: perms,
  };
}

function ensureAdminSessions() {
  db.exec(`CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL DEFAULT (datetime('now', '+30 days'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON admin_sessions(admin_id)');
}
ensureAdminSessions();

function getAdminAuth(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try { ensureAdminSessions(); } catch (_) {}
  const sess = db.prepare("SELECT admin_id FROM admin_sessions WHERE token = ? AND expires_at > datetime('now')").get(token);
  if (!sess) return null;
  try { ensureAdminColumns(); } catch (_) {}
  const row = db.prepare('SELECT id, username, name, role, is_active, permissions FROM admin_users WHERE id = ?').get(sess.admin_id);
  if (!row || Number(row.is_active == null ? 1 : row.is_active) !== 1) return null;
  return row ? { row, token } : null;
}

api.post('/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  const row = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(String(username).trim());
  if (!row || !bcrypt.compareSync(String(password), row.password_hash || '')) {
    return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است.' });
  }
  if (Number(row.is_active == null ? 1 : row.is_active) !== 1) {
    return res.status(403).json({ error: 'حساب مدیریتی شما غیرفعال شده است.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare("INSERT INTO admin_sessions (token, admin_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))")
    .run(token, row.id);
  res.json({ admin: mapAdmin(row), token });
});

api.post('/admin/logout', (req, res) => {
  const auth = getAdminAuth(req);
  if (auth) db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(auth.token);
  res.json({ ok: true });
});

api.get('/admin/me', (req, res) => {
  const auth = getAdminAuth(req);
  if (!auth) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ admin: mapAdmin(auth.row) });
});

api.get('/admin/validate', (req, res) => {
  const auth = getAdminAuth(req);
  if (!auth) return res.json({ valid: false });
  res.json({ valid: true, admin: mapAdmin(auth.row) });
});

// Admin-only guard: valid authenticated admin session required.
// Customer tokens (customer_sessions) are never accepted here.
// Additionally enforces per-section permissions server-side: every admin API
// maps to one sidebar section (or null for self-service); write methods
// additionally require a non-readonly grant.
const ADMIN_SELF_PATHS = new Set(['/admin/me', '/admin/validate', '/admin/logout', '/admin/password']);
const ADMIN_SECTION_PREFIXES = [
  ['/admin/logs', 'logs'],
  ['/admin/users', 'admins'],
  ['/admin/discounts', 'discounts'],
  ['/admin/bank-cards', 'settings'],
  ['/admin/summary', 'reports'],
  ['/admin/reports', 'reports'],
  ['/admin/reviews', 'reviews'],
  ['/admin/questions', 'reviews'],
  ['/admin/notifications', 'notifications'],
  ['/admin/seo', 'seo'],
  ['/admin/tickets', 'tickets'],
  ['/admin/contact-messages', 'contact-messages'],
  ['/admin/articles', 'articles'],
  ['/admin/article-categories', 'articles'],
  ['/admin/pages', 'content'],
  ['/admin/static-pages', 'content'],
  ['/admin/gallery', 'gallery'],
  ['/admin/transactions', 'transactions'],
  ['/products', 'products'],
  ['/categories', 'categories'],
  ['/subcategories', 'categories'],
  ['/brands', 'brands'],
  ['/users', 'users'],
  ['/orders', 'orders'],
  ['/settings', 'settings'],
  ['/sms-test', 'sms'],
  ['/shipping-methods', 'settings'],
  ['/content', 'content'],
  ['/reviews', 'reviews'],
  ['/questions', 'reviews'],
  ['/tickets', 'tickets'],
  ['/contact-messages', 'contact-messages'],
  ['/notifications', 'notifications'],
];
function sectionForAdminPath(path) {
  if (!path) return null;
  if (ADMIN_SELF_PATHS.has(path)) return null;
  for (const [prefix, section] of ADMIN_SECTION_PREFIXES) {
    if (path === prefix || path.startsWith(prefix + '/')) return section;
  }
  return null;
}
function requireAdmin(req, res, next) {
  const auth = getAdminAuth(req);
  if (!auth) return res.status(401).json({ error: 'Not authenticated' });
  const perms = effectivePerms(auth.row);
  const section = sectionForAdminPath(req.route && req.route.path);
  // The chatbot-messages view persists through /api/settings, so an admin who
  // has either the settings or the chatbot-messages section may use it.
  const sectionAllowed = !section
    || hasSection(perms, section)
    || (section === 'settings' && hasSection(perms, 'chatbot-messages'));
  if (section && !sectionAllowed) {
    return res.status(403).json({ error: 'Forbidden: no access to ' + section });
  }
  if (section && req.method !== 'GET' && perms.readonly) {
    return res.status(403).json({ error: 'Forbidden: read-only access' });
  }
  req.admin = auth.row;
  req.adminPerms = perms;
  next();
}
// Helper for mixed-auth routes that grant admins extra powers inline.
function adminHasSection(req, section) {
  try {
    const admin = getAdminAuth(req);
    if (!admin) return false;
    return hasSection(effectivePerms(admin.row), section);
  } catch (_) { return false; }
}

api.get('/admin/logs', requireAdmin, (req,res)=>{
  const { readLogs, isLogType } = require('./logger');
  const { level, limit, offset, type } = req.query;
  if(level && !['info','warn','error','security'].includes(String(level).toLowerCase())) return res.status(400).json({error:'Invalid level'});
  if(type !== undefined && !isLogType(type)) return res.status(400).json({error:'Invalid type'});
  const result = readLogs({ type, level, limit, offset });
  res.json({ total: result.total, limit: Math.min(Math.max(1,parseInt(limit,10)||100),500), offset: Math.max(0,parseInt(offset,10)||0), items: result.items });
});

api.get('/admin/logs/file', requireAdmin, (req,res)=>{
  const { logFileInfo, isLogDate, isLogType } = require('./logger');
  const { date, type } = req.query;
  if(date !== undefined && !isLogDate(date)) return res.status(400).json({error:'Invalid date'});
  if(type !== undefined && !isLogType(type)) return res.status(400).json({error:'Invalid type'});
  res.json(logFileInfo(date, type));
});

api.get('/admin/logs/raw', requireAdmin, (req,res)=>{
  const { logFileInfo, readLogFile, isLogDate, isLogType } = require('./logger');
  const { date, type } = req.query;
  if(date !== undefined && !isLogDate(date)) return res.status(400).json({error:'Invalid date'});
  if(type !== undefined && !isLogType(type)) return res.status(400).json({error:'Invalid type'});
  const info = logFileInfo(date, type);
  if(!info.exists) return res.status(404).json({ error:'Log file not found', path: info.path, date: info.date, type: info.type });
  const content = readLogFile(info.date, info.type);
  if(content === null) return res.status(500).json({ error:'Could not read log file' });
  res.setHeader('X-Log-Path', info.path);
  res.setHeader('X-Log-Date', info.date);
  res.setHeader('X-Log-Type', info.type);
  res.setHeader('X-Log-Size', String(info.size));
  if(String(req.query.download)==='1') res.setHeader('Content-Disposition', `attachment; filename="${info.fileName}"`);
  res.type('text/plain').send(content);
});

api.get('/admin/logs/files', requireAdmin, (req,res)=>{
  const { listLogFiles, isLogType } = require('./logger');
  const { type } = req.query;
  if(type !== undefined && !isLogType(type)) return res.status(400).json({error:'Invalid type'});
  res.json({ files: listLogFiles(type) });
});

// ── Store settings (admin-only persistence for the Settings page) ──
const SETTING_DEFAULTS = {
  // ── Centralized store identity / contact (single source of truth).
  // Admin → «اطلاعات فروشگاه» is the ONLY place these keys are editable.
  'store.name': 'کمزی',
  // store.logo is the single source of truth for the storefront logo and the
  // derived favicon/PWA icons (assets/images/uploads/store/icon-*.png). It is
  // editable only in Admin → اطلاعات فروشگاه and persisted here like the other
  // store.* identity keys; server/store-icons.js regenerates the icons on save.
  'store.logo': '',
  'store.favicon': '',
  'store.phone': '۰۲۱-۴۴۵۵۶۶۷۷',
  'store.phone2': '',
  'store.email': 'info@camzy.com',
  'store.address': 'تهران، خیابان ولیعصر، پلاک ۱۲۳۴، مجتمع تجاری کمزی',
  'store.map_url': 'https://maps.google.com/?q=تهران+ولیعصر',
  'store.latitude': '35.6892',
  'store.longitude': '51.3890',
  'store.hours': 'شنبه تا پنج‌شنبه',
  'store.hours_detail': '۹ صبح تا ۶ عصر — جمعه تعطیل',
  'store.website': 'www.camzy.com',
  'store.desc': 'کمزی فروشگاه تخصصی دوربین مداربسته، دستگاه‌های DVR و NVR و سیستم‌های امنیتی با بیش از ۱۰ سال تجربه در ارائه محصولات اورجینال به هموطنان عزیز.',
  // Footer social links (Admin → «اطلاعات فروشگاه»). Empty keeps the footer
  // icon in its disabled, non-navigating state (href="#").
  'store.social_telegram': '',
  'store.social_instagram': '',
  'store.social_twitter': '',
  'store.social_youtube': '',
  // ── Chatbot messages (Admin → «پیام‌های چت‌بات»). Empty answer falls back
  // to the built-in default on the storefront, so a blank field never yields
  // an empty bot reply. Labels are the suggestion-button captions.
  'chat.shipping.label': 'شرایط ارسال و هزینه',
  'chat.shipping.answer': 'هزینه ارسال برای سفارش‌های بالای ۵۰۰ هزار تومان رایگان است. ارسال به سراسر کشور در کمتر از ۴۸ ساعت کاری انجام می‌شود.',
  'chat.return.label': 'شرایط بازگشت کالا',
  'chat.return.answer': 'شما ۷ روز ضمانت بازگشت کالا بدون قید و شرط دارید. در صورت عدم رضایت از محصول، می‌توانید آن را بازگردانید.',
  'chat.warranty.label': 'گارانتی و اصالت',
  'chat.warranty.answer': 'تمامی محصولات با ضمانت اصالت کالا و گارانتی معتبر ارائه می‌شوند. ما نمایندگی رسمی برندهای هایکویژن، داهوا، یونیکنیو، تیاندی، ویوتک و سایر برندهای معتبر نظارتی هستیم.',
  'chat.categories.label': 'دسته‌بندی محصولات',
  'chat.categories.answer': 'ما ۱۲ دسته‌بندی محصول داریم: دوربین مداربسته، دستگاه DVR/NVR، سیستم‌های امنیتی، لنز و تجهیزات تصویربرداری، تجهیزات شبکه نظارتی، لوازم جانبی دوربین، ایمنی و حفاظت، کابینت و رک، تجهیزات نصب و راه‌اندازی، ذخیره‌سازی و مانیتورینگ، سیم و کابل دوربین و تجهیزات جانبی تخصصی.',
  'chat.brands.label': 'برندهای موجود',
  'chat.brands.answer': 'برندهای موجود شامل هایکویژن، داهوا، یونیکنیو، تیاندی، ویوتک، فریتک، اکسیس، ویژن هانوا، زایکل، یوبیکویتی، سیگیت، وسترن دیجیتال، تی‌پی‌لینک و سپکو هستند.',
  'chat.payment.label': 'روش‌های پرداخت',
  'chat.payment.answer': 'پرداخت به صورت آنلاین از طریق درگاه بانکی انجام می‌شود. همچنین امکان پرداخت در محل برای سفارش‌های تهران وجود دارد.',
  'chat.account.label': 'حساب کاربری',
  'chat.account.answer': 'با ایجاد حساب کاربری می‌توانید سفارش‌های خود را پیگیری کنید، لیست علاقه‌مندی‌ها داشته باشید و اطلاعات خود را مدیریت کنید.',
  'chat.contact.label': 'اطلاعات تماس',
  'chat.contact.answer': '',
  // Data-driven list of chatbot topics: JSON array of {key,label,answer}.
  // Empty => storefront falls back to the 8 individual chat.* keys / defaults.
  'chat.topics': '',
  'ship.method': 'پیک موتوری',
  'ship.cost': '45000',
  'ship.free_from': '500000',
  'pay.online': '1',
  'pay.cod': '0',
  'pay.card': '1',
  'pay.online.title': 'پرداخت آنلاین',
  'pay.online.desc': 'پرداخت از طریق درگاه بانکی',
  'pay.cod.title': 'پرداخت در محل',
  'pay.cod.desc': 'پرداخت نقدی هنگام تحویل',
  'pay.card.title': 'کارت به کارت',
  'pay.card.desc': 'پرداخت از طریق انتقال بانکی',
  'notify.new_order': '1',
  'notify.low_stock': '1',
  'notify.weekly': '0',
  'order.min_amount': '0',
  'order.max_amount': '0',
  'order.min_qty': '1',
  'order.max_qty': '0',
  'order.allow_guest': '1',
  'order.allow_qty_edit': '1',
  'order.allow_oos': '0',
  // SEO title/description are TEMPLATES: the site name lives only in store.name
  // (Admin → اطلاعات فروشگاه) and is injected on read, so the name is never a
  // second editable value. Legacy rows that still hold a literal name are
  // converted to the {name} token automatically.
  'seo.site_title': '{name} | فروشگاه تخصصی دوربین مداربسته و سیستم‌های امنیتی',
  'seo.meta_description': '{name} — فروشگاه تخصصی دوربین مداربسته و سیستم‌های امنیتی صنعتی و ساختمانی با ضمانت اصالت کالا و ارسال سریع.',
  'seo.meta_keywords': 'دوربین مداربسته, دوربین تحت شبکه, DVR, NVR, سیستم امنیتی, کنترل تردد, کابل کوکسیال, هارد نظارتی, سوئیچ PoE, دوربین بی سیم, کمزی',
  'seo.og_title': '',
  'seo.og_description': '',
  'seo.og_image': '',
  'seo.robots': 'index,follow',
  'seo.gsc_code': '',
  'sms.enabled': '0',
  'sms.provider': 'kavenegar',
  'sms.api_key': '',
  'sms.token': '',
  'sms.sender': '',
};
function ensureSettingsTable() {
  db.exec(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const ins = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  for (const [k, v] of Object.entries(SETTING_DEFAULTS)) ins.run(k, v);
}
ensureSettingsTable();
// SEO title/description are templates around the centralized store name. A
// stored value may be a {name} template, or a legacy row that still contains a
// literal (possibly stale) name. In both cases the current store.name must win,
// so only the separator+suffix part of a legacy row is kept.
function deriveSeoTemplate(v, storeName) {
  const name = String(storeName || '').trim();
  const raw = String(v == null ? '' : v).trim();
  if (!raw) return name;
  if (raw.indexOf('{name}') !== -1) return raw.split('{name}').join(name);
  // Legacy "<old name><sep><suffix>" -> keep the original separator + suffix.
  const m = raw.match(/^[\s\S]*?([|—–-])\s*([\s\S]+)$/);
  if (m && m[2].trim()) return name + ' ' + m[1] + ' ' + m[2].trim();
  return name;
}

function readSettings() {
  try { ensureSettingsTable(); } catch (_) {}
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...SETTING_DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  // Inject the centralized site name into the SEO templates so the name is
  // never duplicated as an independently editable value.
  try {
    const storeName = String(out['store.name'] || '').trim();
    for (const k of ['seo.site_title', 'seo.meta_description']) {
      out[k] = deriveSeoTemplate(out[k], storeName);
    }
  } catch (_) {}
  return out;
}

// ── Shipping methods (SQLite-backed, admin-managed) ──
function ensureShippingMethodsTable() {
  db.exec(`CREATE TABLE IF NOT EXISTS shipping_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    cost INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const count = db.prepare('SELECT COUNT(*) AS n FROM shipping_methods').get().n;
  if (!count) {
    const s = readSettings();
    const legacyCost = Math.max(0, Math.round(Number(String(s['ship.cost']).replace(/[^\d.-]/g, '')) || 45000));
    const legacyName = String(s['ship.method'] || 'پیک موتوری').trim() || 'پیک موتوری';
    const ins = db.prepare('INSERT INTO shipping_methods (name, description, cost, is_default) VALUES (?, ?, ?, ?)');
    // Root-cause fix: the default/legacy method must carry the configured
    // ship.cost. Seeding it with 0 made Checkout's shipCostFor() return 0
    // (free) even when subtotal < ship.free_from.
    ins.run(legacyName, '', legacyCost, 0);
    if (!/عادی|normal|پیک/i.test(legacyName)) {
      try { db.prepare('UPDATE shipping_methods SET is_default = 1 WHERE name = ?').run(legacyName); } catch (_) {}
    } else {
      ins.run('ارسال سریع', 'تحویل ۱ تا ۲ روز کاری', legacyCost, 0);
      try { db.prepare('UPDATE shipping_methods SET is_default = 1 WHERE name = ?').run(legacyName); } catch (_) {}
    }
    // Ensure exactly one default.
    try {
      const d = db.prepare('SELECT COUNT(*) AS n FROM shipping_methods WHERE is_default = 1').get().n;
      if (!d) db.exec('UPDATE shipping_methods SET is_default = 1 WHERE id = (SELECT MIN(id) FROM shipping_methods)');
    } catch (_) {}
  }
  // Repair existing DBs seeded with a zero-cost default method: align it with
  // the saved ship.cost so the free-threshold logic has a real cost to charge
  // when subtotal < free_from. Only touches the seed-created row (empty
  // description, still zero) — never admin-edited methods.
  try {
    const s = readSettings();
    const cfg = Math.max(0, Math.round(Number(String(s['ship.cost']).replace(/[^\d.-]/g, '')) || 0));
    if (cfg > 0) {
      db.prepare("UPDATE shipping_methods SET cost = ?, updated_at = datetime('now') WHERE is_default = 1 AND cost = 0 AND description = ''").run(cfg);
    }
  } catch (_) {}
}
try { ensureShippingMethodsTable(); } catch (_) {}
function listShippingMethods() {
  try { ensureShippingMethodsTable(); } catch (_) {}
  return db.prepare('SELECT id, name, description, cost, is_default AS isDefault FROM shipping_methods ORDER BY id').all()
    .map((r) => ({ id: r.id, name: r.name, description: r.description || '', cost: Number(r.cost) || 0, isDefault: !!r.isDefault }));
}
function getDefaultShippingMethod() {
  const rows = listShippingMethods();
  return rows.find((m) => m.isDefault) || rows[0] || null;
}
api.get('/shipping-methods', (req, res) => { res.json(listShippingMethods()); });
api.post('/shipping-methods', requireAdmin, (req, res) => {
  ensureShippingMethodsTable();
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '');
  const cost = Math.max(0, Math.round(Number(req.body?.cost) || 0));
  const isDefault = req.body?.isDefault === true || req.body?.isDefault === 1 || req.body?.isDefault === '1';
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const info = db.prepare("INSERT INTO shipping_methods (name, description, cost, is_default, updated_at) VALUES (?, ?, ?, ?, datetime('now'))")
      .run(name, description, cost, isDefault ? 1 : 0);
    if (isDefault) db.prepare('UPDATE shipping_methods SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END').run(info.lastInsertRowid);
    else {
      const d = db.prepare('SELECT COUNT(*) AS n FROM shipping_methods WHERE is_default = 1').get().n;
      if (!d) db.prepare('UPDATE shipping_methods SET is_default = 1 WHERE id = ?').run(info.lastInsertRowid);
    }
    res.status(201).json(db.prepare('SELECT id, name, description, cost, is_default AS isDefault FROM shipping_methods WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Shipping method already exists' });
    throw e;
  }
});
api.put('/shipping-methods/:id', requireAdmin, (req, res) => {
  ensureShippingMethodsTable();
  const cur = db.prepare('SELECT * FROM shipping_methods WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Shipping method not found' });
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : cur.name;
  const description = req.body?.description !== undefined ? String(req.body.description) : cur.description;
  const cost = req.body?.cost !== undefined ? Math.max(0, Math.round(Number(req.body.cost) || 0)) : cur.cost;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const isDefault = req.body?.isDefault !== undefined
    ? (req.body.isDefault === true || req.body.isDefault === 1 || req.body.isDefault === '1')
    : !!cur.is_default;
  try {
    db.prepare("UPDATE shipping_methods SET name = ?, description = ?, cost = ?, is_default = ?, updated_at = datetime('now') WHERE id = ?")
      .run(name, description, cost, isDefault ? 1 : 0, req.params.id);
    if (isDefault) db.prepare('UPDATE shipping_methods SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END').run(req.params.id);
    else {
      const d = db.prepare('SELECT COUNT(*) AS n FROM shipping_methods WHERE is_default = 1').get().n;
      if (!d) db.prepare('UPDATE shipping_methods SET is_default = 1 WHERE id = (SELECT MIN(id) FROM shipping_methods)').run();
    }
    // Keep legacy ship.method in sync with the default method name.
    try {
      const def = getDefaultShippingMethod();
      if (def) db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('ship.method', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')").run(def.name);
    } catch (_) {}
    res.json(db.prepare('SELECT id, name, description, cost, is_default AS isDefault FROM shipping_methods WHERE id = ?').get(req.params.id));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Shipping method already exists' });
    throw e;
  }
});
api.delete('/shipping-methods/:id', requireAdmin, (req, res) => {
  ensureShippingMethodsTable();
  const cur = db.prepare('SELECT * FROM shipping_methods WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Shipping method not found' });
  const total = db.prepare('SELECT COUNT(*) AS n FROM shipping_methods').get().n;
  if (total <= 1) return res.status(400).json({ error: 'Cannot delete the last shipping method' });
  db.prepare('DELETE FROM shipping_methods WHERE id = ?').run(req.params.id);
  if (cur.is_default) db.prepare('UPDATE shipping_methods SET is_default = 1 WHERE id = (SELECT MIN(id) FROM shipping_methods)').run();
  try {
    const def = getDefaultShippingMethod();
    if (def) db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('ship.method', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')").run(def.name);
  } catch (_) {}
  res.json({ ok: true });
});
api.get('/settings', (req, res) => { res.json(readSettings()); });
// Inverse of deriveSeoTemplate: turn whatever the admin submitted back into a
// {name} template, so a literal site name is never persisted alongside store.name.
function toSeoTemplate(v, storeName) {
  const name = String(storeName || '').trim();
  const raw = String(v == null ? '' : v).trim();
  if (!raw) return raw;
  if (raw.indexOf('{name}') !== -1) return raw;
  if (name && raw.indexOf(name) !== -1) return raw.split(name).join('{name}');
  const m = raw.match(/^[\s\S]*?([|—–-])\s*([\s\S]+)$/);
  if (m && m[2].trim()) return '{name} ' + m[1] + ' ' + m[2].trim();
  return '{name}';
}

api.put('/settings', requireAdmin, async (req, res, next) => {
  try {
  const b = req.body || {};
  ensureSettingsTable();
  const upd = db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')");
  // SEO title/description are templates around the centralized store name; a
  // literal name pasted by an admin is collapsed back to {name} before storing.
  const seoTpl = new Set(['seo.site_title', 'seo.meta_description']);
  let storeName = '';
  try { storeName = String(readSettings()['store.name'] || '').trim(); } catch (_) {}
  for (const k of Object.keys(SETTING_DEFAULTS)) {
    if (b[k] !== undefined) {
      let v = b[k];
      if (typeof v === 'boolean') v = v ? '1' : '0';
      if (k === 'chat.topics') {
        var raw = String(v == null ? '' : v).trim();
        if (raw === '') { v = ''; }
        else {
          var arr;
          try { arr = JSON.parse(raw); } catch (e) { return res.status(400).json({ error: 'فرمت موضوعات چت‌بات نامعتبر است' }); }
          if (!Array.isArray(arr)) return res.status(400).json({ error: 'موضوعات چت‌بات باید آرایه باشند' });
          var seen = new Set();
          var cleaned = [];
          for (var ti = 0; ti < arr.length; ti++) {
            var t = arr[ti];
            if (!t || typeof t !== 'object') return res.status(400).json({ error: 'موضوع نامعتبر' });
            var key = String(t.key || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
            var label = String(t.label || '').trim();
            var answer = String(t.answer == null ? '' : t.answer).slice(0, 20000);
            if (!key) return res.status(400).json({ error: 'کلید موضوع الزامی است' });
            if (!label) return res.status(400).json({ error: 'عنوان دکمه الزامی است' });
            if (seen.has(key)) return res.status(400).json({ error: 'کلید تکراری: ' + key });
            seen.add(key);
            cleaned.push({ key: key, label: label, answer: answer });
          }
          v = JSON.stringify(cleaned);
        }
      } else if (k.startsWith('chat.')) {
        v = String(v == null ? '' : v).slice(0, 20000);
      }
      if (seoTpl.has(k) && storeName) {
        v = toSeoTemplate(v, storeName);
      }
      upd.run(k, String(v));
    }
  }
  // Allow sms.* keys dynamically even if defaults change later.
  for (const k of Object.keys(b)) {
    if (k.startsWith('sms.') && !(k in SETTING_DEFAULTS)) {
      let v = b[k];
      if (typeof v === 'boolean') v = v ? '1' : '0';
      try { upd.run(k, String(v)); } catch (_) {}
    }
  }
  // Keep shipping_methods default in sync when legacy ship.method is saved.
  try {
    if (b['ship.method'] !== undefined) {
      ensureShippingMethodsTable();
      const nm = String(b['ship.method']).trim();
      const row = nm ? db.prepare('SELECT id FROM shipping_methods WHERE name = ?').get(nm) : null;
      if (row) db.prepare('UPDATE shipping_methods SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END').run(row.id);
    }
    // Keep the default method's cost in sync with the «هزینه ارسال» input so
    // the value the admin saves is the value Checkout charges below the
    // free-shipping threshold.
    if (b['ship.cost'] !== undefined) {
      ensureShippingMethodsTable();
      const cfg = Math.max(0, Math.round(Number(String(b['ship.cost']).replace(/[^\d.-]/g, '')) || 0));
      db.prepare("UPDATE shipping_methods SET cost = ?, updated_at = datetime('now') WHERE is_default = 1").run(cfg);
    }
  } catch (_) {}
  // Derived favicon/PWA icons: regenerate from the saved logo, or remove them
  // when the logo is cleared/invalid so the client never points at a 404.
  if (b['store.logo'] !== undefined) {
    try {
      const iconRes = await syncIcons(b['store.logo']);
      if (!iconRes.generated) {
        logWarn('store icons not generated', { logo: String(b['store.logo'] || ''), error: iconRes.error || 'no usable logo file' });
      }
    } catch (e) {
      logError('store icons sync failed', { error: String((e && e.message) || e) });
    }
  }
  res.json(readSettings());
} catch (e) { next(e); }});

// ── SMS test send (admin-only; logs instead of calling provider) ──
api.post('/sms-test', requireAdmin, (req, res) => {
  const to = String(req.body?.to || '').trim();
  const text = String(req.body?.text || '').trim();
  if (!to) return res.status(400).json({ error: 'to is required' });
  try {
    const s = readSettings();
    const { logInfo } = require('./logger');
    logInfo('sms test', { to, provider: s['sms.provider'], sender: s['sms.sender'], enabled: s['sms.enabled'] });
  } catch (_) {}
  res.json({ ok: true, to, text: text || 'ok' });
});

// ── Admin password change (real persistence in admin_users) ──
// ── Admin users management (admin-only) ──
function activeAdminCount(exceptId) {
  try { ensureAdminColumns(); } catch (_) {}
  const row = exceptId != null
    ? db.prepare('SELECT COUNT(*) AS n FROM admin_users WHERE COALESCE(is_active, 1) = 1 AND id != ?').get(exceptId)
    : db.prepare('SELECT COUNT(*) AS n FROM admin_users WHERE COALESCE(is_active, 1) = 1').get();
  return (row && row.n) || 0;
}
function parseCustomPerms(v) {
  if (v === undefined || v === null || v === '') return { present: false };
  const obj = typeof v === 'string' ? JSON.parse(v) : v;
  if (!obj || typeof obj !== 'object') return { error: 'Invalid permissions' };
  const sections = obj.sections === 'all' ? 'all'
    : (Array.isArray(obj.sections) ? obj.sections.filter((s) => ADMIN_SECTIONS.includes(s)) : null);
  if (sections === null) return { error: 'Invalid permissions' };
  return { present: true, value: JSON.stringify({ sections, readonly: !!obj.readonly }) };
}
// Only superadmin may grant superadmin/admin roles or the 'admins' section.
function assertGrantAllowed(callerRow, role, customSections) {
  const callerPerms = effectivePerms(callerRow);
  const grantsAdmins = role === 'superadmin' || role === 'admin'
    || customSections === 'all' || (Array.isArray(customSections) && customSections.indexOf('admins') !== -1);
  if (grantsAdmins && callerRow.role !== 'superadmin') {
    return 'Only a superadmin can grant admin-management access';
  }
  return null;
}
api.get('/admin/users', requireAdmin, (req, res) => {
  try { ensureAdminColumns(); } catch (_) {}
  const rows = db.prepare('SELECT id, username, name, role, is_active, permissions, created_at FROM admin_users ORDER BY id').all();
  res.json(rows.map(mapAdmin));
});
api.post('/admin/users', requireAdmin, (req, res) => {
  try { ensureAdminColumns(); } catch (_) {}
  const { username, password, name, role, isActive, permissions } = req.body || {};
  if (!username || !String(username).trim()) return res.status(400).json({ error: 'username is required' });
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const r = VALID_ROLES.has(String(role)) ? String(role) : 'support';
  const parsed = parseCustomPerms(permissions);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const customSections = parsed.present ? JSON.parse(parsed.value).sections : null;
  const grantErr = assertGrantAllowed(req.admin, r, customSections);
  if (grantErr) return res.status(403).json({ error: grantErr });
  try {
    const hash = bcrypt.hashSync(String(password), 10);
    const info = db.prepare('INSERT INTO admin_users (username, password_hash, name, role, is_active, permissions) VALUES (?, ?, ?, ?, ?, ?)')
      .run(String(username).trim(), hash, String(name || '').trim() || String(username).trim(), r,
        (isActive === undefined || isActive === null) ? 1 : (isActive ? 1 : 0),
        parsed.present ? parsed.value : null);
    const row = db.prepare('SELECT id, username, name, role, is_active, permissions, created_at FROM admin_users WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(mapAdmin(row));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
    throw e;
  }
});
api.put('/admin/users/:id', requireAdmin, (req, res) => {
  try { ensureAdminColumns(); } catch (_) {}
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'Admin not found' });
  const b = req.body || {};
  const name = b.name !== undefined ? String(b.name).trim() || cur.name : cur.name;
  let role = cur.role;
  if (b.role !== undefined) {
    if (!VALID_ROLES.has(String(b.role))) return res.status(400).json({ error: 'Invalid role' });
    role = String(b.role);
  }
  let isActive = Number(cur.is_active == null ? 1 : cur.is_active) === 1;
  if (b.isActive !== undefined) isActive = !!b.isActive;
  let permissions = cur.permissions;
  let customSections = null;
  if (b.permissions !== undefined) {
    const parsed = parseCustomPerms(b.permissions);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    permissions = parsed.present ? parsed.value : null;
    if (parsed.present) customSections = JSON.parse(parsed.value).sections;
  }
  // Escalation guard only when role/permissions actually change to a grant.
  if ((b.role !== undefined && (role === 'superadmin' || role === 'admin')) ||
      (b.permissions !== undefined && (customSections === 'all' || (Array.isArray(customSections) && customSections.indexOf('admins') !== -1)))) {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only a superadmin can grant admin-management access' });
    }
  }
  if (id === req.admin.id) {
    if (!isActive) return res.status(400).json({ error: 'Cannot deactivate own account' });
    if (role !== cur.role) return res.status(400).json({ error: 'Cannot change own role' });
  }
  const wasActive = Number(cur.is_active == null ? 1 : cur.is_active) === 1;
  if (wasActive && !isActive && activeAdminCount(id) < 1) {
    return res.status(400).json({ error: 'Cannot deactivate the last active admin' });
  }
  db.prepare('UPDATE admin_users SET name = ?, role = ?, is_active = ?, permissions = ? WHERE id = ?')
    .run(name, role, isActive ? 1 : 0, permissions, id);
  if (!isActive) db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?').run(id);
  const row = db.prepare('SELECT id, username, name, role, is_active, permissions, created_at FROM admin_users WHERE id = ?').get(id);
  res.json(mapAdmin(row));
});
api.delete('/admin/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.admin.id) return res.status(400).json({ error: 'Cannot delete own account' });
  const cur = db.prepare('SELECT id, is_active FROM admin_users WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'Admin not found' });
  const wasActive = Number(cur.is_active == null ? 1 : cur.is_active) === 1;
  if (wasActive && activeAdminCount(id) < 1) {
    return res.status(400).json({ error: 'Cannot delete the last active admin' });
  }
  db.prepare('DELETE FROM admin_users WHERE id = ?').run(id);
  db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?').run(id);
  res.json({ ok: true });
});
api.post('/admin/users/:id/password', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const cur = db.prepare('SELECT id FROM admin_users WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'Admin not found' });
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(newPassword), 10), id);
  if (id !== req.admin.id) db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?').run(id);
  res.json({ ok: true });
});

api.post('/admin/password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const row = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.admin.id);
  if (!row || !bcrypt.compareSync(String(currentPassword), row.password_hash || '')) {
    return res.status(401).json({ error: 'رمز عبور فعلی اشتباه است.' });
  }
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(String(newPassword), 10), req.admin.id);
  res.json({ ok: true });
});

api.patch('/users/:id', (req, res) => {
  const auth = getAuthUser(req);
  if (!auth || auth.row.id !== req.params.id) return res.status(401).json({ error: 'Not authenticated' });
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'User not found' });
  const firstName = b.firstName !== undefined ? String(b.firstName).trim() : cur.first_name;
  const lastName = b.lastName !== undefined ? String(b.lastName).trim() : cur.last_name;
  const mobile = b.mobile !== undefined ? String(b.mobile).trim() : cur.mobile;
  const email = b.email !== undefined ? (String(b.email).trim() || null) : cur.email;
  if (!firstName || !lastName || !mobile) return res.status(400).json({ error: 'firstName, lastName, mobile are required' });
  try {
    const updates = { id: req.params.id, firstName, lastName, mobile, email };
    db.prepare(`UPDATE users SET first_name=@firstName, last_name=@lastName, mobile=@mobile,
      email=@email, updated_at=datetime('now') WHERE id=@id`).run(updates);
    if (b.newPassword) {
      if (!b.currentPassword || !cur.password_hash || !bcrypt.compareSync(String(b.currentPassword), cur.password_hash)) {
        return res.status(401).json({ error: 'رمز عبور فعلی اشتباه است.' });
      }
      if (String(b.newPassword).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
        .run(bcrypt.hashSync(String(b.newPassword), 10), req.params.id);
    }
    const updated = db.prepare('SELECT id, first_name, last_name, mobile, email, join_date FROM users WHERE id = ?').get(req.params.id);
    res.json({ user: mapUser(updated) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Mobile or email already exists' });
    throw e;
  }
});

// ── Users ──
// Admin user list (read-only): real `users` rows + per-user order stats.
// No writes here; existing users are never modified by this endpoint.
function ensureUserBlockedColumn() {
  try {
    const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
    if (cols.indexOf('is_blocked') === -1) db.exec('ALTER TABLE users ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0');
  } catch (_) {}
}
try { ensureUserBlockedColumn(); } catch (_) {}
api.get('/users', requireAdmin, (req, res) => {
  try { ensureUserBlockedColumn(); } catch (_) {}
  let q = String(req.query.q || '').trim();
  // normalize Persian/Arabic digits and country prefix for mobile search
  const _faMap={ '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9','٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' };
  q = q.replace(/[۰-۹٠-٩]/g,c=>_faMap[c]||c);
  let qNorm = q.replace(/[^0-9+]/g,'');
  if(qNorm.startsWith('0098')) qNorm='0'+qNorm.slice(4);
  else if(qNorm.startsWith('+98')) qNorm='0'+qNorm.slice(3);
  else if(qNorm.startsWith('98') && qNorm.length>=11) qNorm='0'+qNorm.slice(2);
  const status = String(req.query.status || 'all').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 2000);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const where = [];
  const params = [];
  if (q) {
    // search both raw and normalized mobile
    where.push('(first_name LIKE ? OR last_name LIKE ? OR (first_name || \' \' || last_name) LIKE ? OR mobile LIKE ? OR mobile LIKE ? OR email LIKE ?)');
    const like = `%${q}%`;
    const likeNorm = `%${qNorm}%`;
    params.push(like, like, like, like, likeNorm, like);
  }
  if (status === 'active') where.push('COALESCE(is_blocked, 0) = 0');
  else if (status === 'blocked') where.push('COALESCE(is_blocked, 0) = 1');
  const total = db.prepare(
    `SELECT COUNT(*) AS n FROM users ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`).get(...params).n;
  const rows = db.prepare(
    `SELECT id, first_name, last_name, mobile, email, join_date, created_at, COALESCE(is_blocked, 0) AS is_blocked FROM users
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const ids = rows.map((r) => r.id);
  const stats = new Map();
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    const agg = db.prepare(
      `SELECT user_id, COUNT(*) AS n, COALESCE(SUM(total), 0) AS s FROM orders
       WHERE user_id IN (${placeholders}) AND status != 'cancelled' GROUP BY user_id`).all(...ids);
    for (const a of agg) stats.set(a.user_id, a);
  }
  res.json({
    total,
    items: rows.map((r) => {
      const a = stats.get(r.id) || { n: 0, s: 0 };
      return {
        id: r.id, firstName: r.first_name, lastName: r.last_name,
        mobile: r.mobile, email: r.email || '', joinDate: r.join_date,
        createdAt: r.created_at || null,
        isBlocked: Number(r.is_blocked) === 1,
        ordersCount: a.n || 0, totalSpent: Number(a.s) || 0,
      };
    }),
  });
});

api.get('/users/:id', (req, res) => {
  const auth = getAuthUser(req); const admin = getAdminAuth(req);
  if(!auth && !admin) return res.status(401).json({error:'Not authenticated'});
  if(auth && auth.row.id !== req.params.id && !admin) return res.status(403).json({error:'Forbidden'});
  if(admin && (!auth || auth.row.id !== req.params.id) && !adminHasSection(req, 'users')) {
    return res.status(403).json({error:'Forbidden: no access to users'});
  }
  const u = db.prepare('SELECT id, first_name, last_name, mobile, email, join_date, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json(u);
});

api.post('/users', requireAdmin, (req, res) => {
  const { id, firstName, lastName, mobile, email, password } = req.body || {};
  if (!firstName || !lastName || !mobile) {
    return res.status(400).json({ error: 'firstName, lastName, mobile are required' });
  }
  try {
    const uid = id || ('u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
    const joinDate = new Date().toLocaleDateString('fa-IR');
    db.prepare(`INSERT INTO users (id, first_name, last_name, mobile, email, password_hash, join_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(uid, firstName, lastName, mobile, email || null,
        password ? bcrypt.hashSync(password, 10) : null, joinDate);
    res.status(201).json({ id: uid, firstName, lastName, mobile, email: email || '', joinDate });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Mobile or email already exists' });
    throw e;
  }
});

// Admin: edit any customer profile
api.put('/users/:id/admin', requireAdmin, (req, res) => {
  const cur = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'User not found' });
  const b = req.body || {};
  const firstName = b.firstName !== undefined ? String(b.firstName).trim() : cur.first_name;
  const lastName = b.lastName !== undefined ? String(b.lastName).trim() : cur.last_name;
  const mobile = b.mobile !== undefined ? String(b.mobile).trim() : cur.mobile;
  const email = b.email !== undefined ? (String(b.email).trim() || null) : cur.email;
  if (!firstName || !lastName || !mobile) return res.status(400).json({ error: 'firstName, lastName, mobile are required' });
  try {
    db.prepare('UPDATE users SET first_name=@firstName, last_name=@lastName, mobile=@mobile, email=@email, updated_at=datetime(\'now\') WHERE id=@id')
      .run({ firstName, lastName, mobile, email, id: req.params.id });
    if (b.newPassword) {
      if (String(b.newPassword).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
        .run(bcrypt.hashSync(String(b.newPassword), 10), req.params.id);
    }
    const updated = db.prepare('SELECT id, first_name, last_name, mobile, email, join_date, created_at FROM users WHERE id = ?').get(req.params.id);
    const stats = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS s FROM orders WHERE user_id = ? AND status != 'cancelled'").get(req.params.id);
    res.json({ id: updated.id, firstName: updated.first_name, lastName: updated.last_name, mobile: updated.mobile, email: updated.email || '', joinDate: updated.join_date, createdAt: updated.created_at, ordersCount: stats.n || 0, totalSpent: Number(stats.s) || 0 });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Mobile or email already exists' });
    throw e;
  }
});

// Admin: block / unblock a customer. Blocking also revokes active sessions.
api.patch('/users/:id/block', requireAdmin, (req, res) => {
  try { ensureUserBlockedColumn(); } catch (_) {}
  const cur = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'User not found' });
  const b = req.body || {};
  const blocked = b.blocked === true || b.blocked === 1 || b.blocked === '1';
  db.prepare("UPDATE users SET is_blocked = ?, updated_at = datetime('now') WHERE id = ?").run(blocked ? 1 : 0, req.params.id);
  if (blocked) {
    try { db.prepare('DELETE FROM customer_sessions WHERE user_id = ?').run(req.params.id); } catch (_) {}
  }
  const updated = db.prepare('SELECT id, COALESCE(is_blocked, 0) AS is_blocked FROM users WHERE id = ?').get(req.params.id);
  res.json({ id: updated.id, isBlocked: Number(updated.is_blocked) === 1 });
});

api.delete('/users/:id', requireAdmin, (req, res) => {
  const cur = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'User not found' });
  const orderCount = db.prepare('SELECT COUNT(*) AS n FROM orders WHERE user_id = ?').get(req.params.id).n;
  if (orderCount > 0 && req.query.force !== '1' && req.query.force !== 'true') {
    return res.status(409).json({ error: 'User has orders. Pass ?force=1 to delete anyway.', count: orderCount });
  }
  db.exec('BEGIN');
  try {
    if (req.query.force === '1' || req.query.force === 'true') {
      db.prepare('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?)').run(req.params.id);
      db.prepare('DELETE FROM orders WHERE user_id = ?').run(req.params.id);
      db.prepare('DELETE FROM payment_events WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?)').run(req.params.id);
    }
    db.prepare('DELETE FROM addresses WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM carts WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM wishlists WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM recently_viewed WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM reviews WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM questions WHERE user_id = ?').run(req.params.id);
    try {
      const tids = db.prepare('SELECT id FROM tickets WHERE user_id = ?').all(req.params.id).map((r) => r.id);
      if (tids.length) {
        const ph = tids.map(() => '?').join(',');
        db.prepare(`DELETE FROM ticket_messages WHERE ticket_id IN (${ph})`).run(...tids);
      }
      db.prepare('DELETE FROM tickets WHERE user_id = ?').run(req.params.id);
    } catch (_) {}
    try { db.prepare('DELETE FROM notification_reads WHERE user_id = ?').run(req.params.id); } catch (_) {}
    db.prepare('DELETE FROM customer_sessions WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    db.exec('COMMIT');
  } catch (e) { try{ db.exec('ROLLBACK'); }catch(_){} throw e; }
  res.json({ ok: true });
});

// Admin: view user detail bundle (addresses, orders, cart, wishlist, reviews)
api.get('/users/:id/detail', requireAdmin, (req, res) => {
  const u = db.prepare('SELECT id, first_name, last_name, mobile, email, join_date, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const addresses = db.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC').all(req.params.id).map(mapAddress);
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(req.params.id);
  const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  const mappedOrders = orders.map(o => mapOrder(o, itemsStmt.all(o.id)));
  let cart = [];
  try { const r=db.prepare('SELECT items_json FROM carts WHERE user_id = ?').get(req.params.id); if(r) cart=JSON.parse(r.items_json||'[]'); } catch(_){}
  let wishlist = [];
  try { const r=db.prepare('SELECT items_json FROM wishlists WHERE user_id = ?').get(req.params.id); if(r) wishlist=JSON.parse(r.items_json||'[]'); } catch(_){}
  let recent = [];
  try { const r=db.prepare('SELECT items_json FROM recently_viewed WHERE user_id = ?').get(req.params.id); if(r) recent=JSON.parse(r.items_json||'[]'); } catch(_){}
  const reviews = db.prepare('SELECT * FROM reviews WHERE user_id = ? ORDER BY id DESC').all(req.params.id).map(r=>({ id:r.id, productId:r.product_id, rating:r.rating, title:r.title, text:r.text, date:r.date }));
  const stats = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS s FROM orders WHERE user_id = ? AND status != 'cancelled'").get(req.params.id);
  res.json({
    user: { id:u.id, firstName:u.first_name, lastName:u.last_name, mobile:u.mobile, email:u.email||'', joinDate:u.join_date, createdAt:u.created_at, isBlocked:Number(u.is_blocked)===1, ordersCount:stats.n||0, totalSpent:Number(stats.s)||0 },
    addresses, orders: mappedOrders, cart, wishlist, recentlyViewed: recent, reviews
  });
});

// ── Addresses (owner or admin only) ──
function requireAddressAuth(req, userId){
  const admin=getAdminAuth(req);
  if(admin) {
    if(!adminHasSection(req, 'users')) return {code:403,error:'Forbidden: no access to users'};
    return null;
  }
  const auth=getAuthUser(req); if(!auth) return {code:401,error:'Not authenticated'};
  if(auth.row.id!==userId) return {code:403,error:'Forbidden'};
  return null;
}
api.get('/users/:userId/addresses', (req, res) => {
  const d=requireAddressAuth(req, req.params.userId); if(d) return res.status(d.code).json({error:d.error});
  res.json(db.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC')
    .all(req.params.userId).map(mapAddress));
});

api.post('/users/:userId/addresses', (req, res) => {
  const dd=requireAddressAuth(req, req.params.userId); if(dd) return res.status(dd.code).json({error:dd.error});
  const b = req.body || {};
  if (!b.province || !b.city || !b.address) {
    return res.status(400).json({ error: 'province, city, address are required' });
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const info = db.prepare(`INSERT INTO addresses
    (user_id, title, full_name, mobile, province, city, address, postal_code, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.params.userId, b.title || '', b.fullName || '', b.mobile || '',
      b.province, b.city, b.address, b.postalCode || '', b.isDefault ? 1 : 0);
  if (b.isDefault) {
    db.prepare('UPDATE addresses SET is_default = (id = ?) WHERE user_id = ?')
      .run(info.lastInsertRowid, req.params.userId);
  }
  res.status(201).json(mapAddress(db.prepare('SELECT * FROM addresses WHERE id = ?').get(info.lastInsertRowid)));
});

api.put('/addresses/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM addresses WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Address not found' });
  const da=requireAddressAuth(req, cur.user_id); if(da) return res.status(da.code).json({error:da.error});
  const b = req.body || {};
  const merged = {
    title: b.title !== undefined ? String(b.title || '') : cur.title,
    full_name: b.fullName !== undefined ? String(b.fullName || '') : cur.full_name,
    mobile: b.mobile !== undefined ? String(b.mobile || '') : cur.mobile,
    province: b.province !== undefined ? String(b.province || '') : cur.province,
    city: b.city !== undefined ? String(b.city || '') : cur.city,
    address: b.address !== undefined ? String(b.address || '') : cur.address,
    postal_code: b.postalCode !== undefined ? String(b.postalCode || '') : cur.postal_code,
    is_default: b.isDefault !== undefined ? (b.isDefault ? 1 : 0) : cur.is_default,
  };
  if (!merged.province || !merged.city || !merged.address) {
    return res.status(400).json({ error: 'province, city, address are required' });
  }
  db.prepare(`UPDATE addresses SET title=@title, full_name=@full_name, mobile=@mobile,
    province=@province, city=@city, address=@address, postal_code=@postal_code,
    is_default=@is_default, updated_at=datetime('now') WHERE id=@id`)
    .run({ ...merged, id: req.params.id });
  if (merged.is_default) {
    db.prepare('UPDATE addresses SET is_default = (id = ?) WHERE user_id = ?')
      .run(req.params.id, cur.user_id);
  }
  res.json(mapAddress(db.prepare('SELECT * FROM addresses WHERE id = ?').get(req.params.id)));
});

api.patch('/addresses/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM addresses WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Address not found' });
  const da2=requireAddressAuth(req, cur.user_id); if(da2) return res.status(da2.code).json({error:da2.error});
  const b = req.body || {};
  if (b.isDefault !== undefined) {
    const val = b.isDefault ? 1 : 0;
    db.prepare("UPDATE addresses SET is_default = ?, updated_at = datetime('now') WHERE id = ?")
      .run(val, req.params.id);
    if (val) {
      db.prepare('UPDATE addresses SET is_default = (id = ?) WHERE user_id = ?')
        .run(req.params.id, cur.user_id);
    }
    return res.json(mapAddress(db.prepare('SELECT * FROM addresses WHERE id = ?').get(req.params.id)));
  }
  // Fallback: treat as full update.
  req.url = req.url; // no-op
  const merged = {
    title: b.title !== undefined ? String(b.title || '') : cur.title,
    full_name: b.fullName !== undefined ? String(b.fullName || '') : cur.full_name,
    mobile: b.mobile !== undefined ? String(b.mobile || '') : cur.mobile,
    province: b.province !== undefined ? String(b.province || '') : cur.province,
    city: b.city !== undefined ? String(b.city || '') : cur.city,
    address: b.address !== undefined ? String(b.address || '') : cur.address,
    postal_code: b.postalCode !== undefined ? String(b.postalCode || '') : cur.postal_code,
  };
  db.prepare(`UPDATE addresses SET title=@title, full_name=@full_name, mobile=@mobile,
    province=@province, city=@city, address=@address, postal_code=@postal_code,
    updated_at=datetime('now') WHERE id=@id`)
    .run({ ...merged, id: req.params.id });
  res.json(mapAddress(db.prepare('SELECT * FROM addresses WHERE id = ?').get(req.params.id)));
});

api.post('/addresses/:id/default', (req, res) => {
  const cur = db.prepare('SELECT * FROM addresses WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Address not found' });
  const da3=requireAddressAuth(req, cur.user_id); if(da3) return res.status(da3.code).json({error:da3.error});
  db.prepare('UPDATE addresses SET is_default = (id = ?) WHERE user_id = ?')
    .run(req.params.id, cur.user_id);
  res.json(mapAddress(db.prepare('SELECT * FROM addresses WHERE id = ?').get(req.params.id)));
});

api.delete('/addresses/:id', (req, res) => {
  const cur2 = db.prepare('SELECT user_id FROM addresses WHERE id = ?').get(req.params.id);
  if(!cur2) return res.status(404).json({ error: 'Address not found' });
  const da4=requireAddressAuth(req, cur2.user_id); if(da4) return res.status(da4.code).json({error:da4.error});
  const info = db.prepare('DELETE FROM addresses WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Address not found' });
  res.json({ ok: true });
});

// ── Discount codes (SQLite-backed, admin-managed, server-enforced) ──
function ensureDiscountTables() {
  db.exec(`CREATE TABLE IF NOT EXISTS discount_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 'fixed',
    value INTEGER NOT NULL DEFAULT 0,
    min_order INTEGER NOT NULL DEFAULT 0,
    usage_limit INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code)');
  try {
    const cols = db.prepare('PRAGMA table_info(orders)').all();
    if (!cols.some((c) => c.name === 'discount_code')) db.exec("ALTER TABLE orders ADD COLUMN discount_code TEXT NOT NULL DEFAULT ''");
  } catch (_) {}
}
try { ensureDiscountTables(); } catch (_) {}
function mapDiscount(r) {
  if (!r) return r;
  return {
    id: r.id, code: r.code, type: r.type,
    value: Number(r.value) || 0, minOrder: Number(r.min_order) || 0, min_order: Number(r.min_order) || 0,
    usageLimit: r.usage_limit == null ? null : Number(r.usage_limit),
    usage_limit: r.usage_limit == null ? null : Number(r.usage_limit),
    usedCount: Number(r.used_count) || 0, used_count: Number(r.used_count) || 0,
    expiresAt: r.expires_at || null, expires_at: r.expires_at || null,
    isEnabled: !!r.is_enabled, is_enabled: !!r.is_enabled,
    createdAt: r.created_at || null, updatedAt: r.updated_at || null,
  };
}
// Returns { ok, discount, row } or { ok:false, error, status }.
function validateDiscountCode(rawCode, subtotal) {
  try { ensureDiscountTables(); } catch (_) {}
  const code = String(rawCode || '').trim();
  if (!code) return { ok: false, status: 400, error: 'Discount code is required' };
  const row = db.prepare('SELECT * FROM discount_codes WHERE code = ? COLLATE NOCASE').get(code);
  if (!row) return { ok: false, status: 404, error: 'Discount code not found' };
  if (!row.is_enabled) return { ok: false, status: 409, error: 'Discount code is disabled' };
  if (row.expires_at) {
    const exp = new Date(String(row.expires_at).length <= 10 ? String(row.expires_at) + 'T23:59:59' : row.expires_at);
    if (!isNaN(exp) && Date.now() > exp.getTime()) return { ok: false, status: 409, error: 'Discount code expired' };
  }
  if (row.usage_limit != null && Number(row.used_count) >= Number(row.usage_limit)) {
    return { ok: false, status: 409, error: 'Discount usage limit reached' };
  }
  const sub = Math.max(0, Math.round(Number(subtotal) || 0));
  if (Number(row.min_order) > 0 && sub < Number(row.min_order)) {
    return { ok: false, status: 409, error: 'Minimum order amount not met' };
  }
  let discount = 0;
  if (row.type === 'percent') {
    const pct = Math.min(100, Math.max(0, Number(row.value) || 0));
    discount = Math.floor(sub * pct / 100);
  } else {
    discount = Math.max(0, Math.round(Number(row.value) || 0));
  }
  discount = Math.min(discount, sub); // never exceed eligible subtotal
  return { ok: true, discount, row };
}
function discountInput(b, isCreate) {
  const out = {};
  if (b.code !== undefined) out.code = String(b.code).trim().toUpperCase().replace(/\s+/g, '');
  if (b.type !== undefined) out.type = String(b.type).toLowerCase() === 'percent' ? 'percent' : 'fixed';
  if (b.value !== undefined) out.value = Math.max(0, Math.round(Number(b.value) || 0));
  if (b.minOrder !== undefined) out.min_order = Math.max(0, Math.round(Number(b.minOrder) || 0));
  if (b.min_order !== undefined) out.min_order = Math.max(0, Math.round(Number(b.min_order) || 0));
  if (b.usageLimit !== undefined) out.usage_limit = (b.usageLimit === null || b.usageLimit === '' ? null : Math.max(1, Math.round(Number(b.usageLimit) || 0) || 1));
  if (b.usage_limit !== undefined) out.usage_limit = (b.usage_limit === null || b.usage_limit === '' ? null : Math.max(1, Math.round(Number(b.usage_limit) || 0) || 1));
  if (b.expiresAt !== undefined) out.expires_at = (b.expiresAt ? String(b.expiresAt).slice(0, 10) : null);
  if (b.expires_at !== undefined) out.expires_at = (b.expires_at ? String(b.expires_at).slice(0, 10) : null);
  if (b.isEnabled !== undefined) out.is_enabled = b.isEnabled ? 1 : 0;
  if (b.is_enabled !== undefined) out.is_enabled = b.is_enabled ? 1 : 0;
  if (isCreate) {
    if (!out.code) return { error: 'code is required' };
    if (!out.type) out.type = 'fixed';
    if (out.value == null) return { error: 'value is required' };
    if (out.type === 'percent' && (out.value <= 0 || out.value > 100)) return { error: 'percent value must be 1-100' };
    if (out.min_order == null) out.min_order = 0;
    if (out.is_enabled == null) out.is_enabled = 1;
  }
  return { values: out };
}
api.get('/admin/discounts', requireAdmin, (req, res) => {
  ensureDiscountTables();
  res.json(db.prepare('SELECT * FROM discount_codes ORDER BY id DESC').all().map(mapDiscount));
});
api.post('/admin/discounts', requireAdmin, (req, res) => {
  ensureDiscountTables();
  const { values, error } = discountInput(req.body || {}, true);
  if (error) return res.status(400).json({ error });
  try {
    const info = db.prepare(`INSERT INTO discount_codes (code, type, value, min_order, usage_limit, expires_at, is_enabled, updated_at)
      VALUES (@code, @type, @value, @min_order, @usage_limit, @expires_at, @is_enabled, datetime('now'))`)
      .run({
        code: values.code, type: values.type || 'fixed', value: values.value ?? 0,
        min_order: values.min_order ?? 0,
        usage_limit: values.usage_limit === undefined ? null : values.usage_limit,
        expires_at: values.expires_at || null, is_enabled: values.is_enabled ?? 1,
      });
    res.status(201).json(mapDiscount(db.prepare('SELECT * FROM discount_codes WHERE id = ?').get(info.lastInsertRowid)));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Discount code already exists' });
    throw e;
  }
});
api.put('/admin/discounts/:id', requireAdmin, (req, res) => {
  ensureDiscountTables();
  const cur = db.prepare('SELECT * FROM discount_codes WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Discount not found' });
  const { values, error } = discountInput(req.body || {}, false);
  if (error) return res.status(400).json({ error });
  if (values.code === '') return res.status(400).json({ error: 'code is required' });
  const merged = {
    code: values.code ?? cur.code, type: values.type ?? cur.type,
    value: values.value ?? cur.value, min_order: values.min_order ?? cur.min_order,
    usage_limit: values.usage_limit !== undefined ? values.usage_limit : cur.usage_limit,
    expires_at: values.expires_at !== undefined ? values.expires_at : cur.expires_at,
    is_enabled: values.is_enabled !== undefined ? values.is_enabled : cur.is_enabled,
  };
  if (merged.type === 'percent' && (merged.value <= 0 || merged.value > 100)) return res.status(400).json({ error: 'percent value must be 1-100' });
  try {
    db.prepare(`UPDATE discount_codes SET code=@code, type=@type, value=@value, min_order=@min_order,
      usage_limit=@usage_limit, expires_at=@expires_at, is_enabled=@is_enabled, updated_at=datetime('now') WHERE id=@id`)
      .run({ ...merged, id: req.params.id });
    res.json(mapDiscount(db.prepare('SELECT * FROM discount_codes WHERE id = ?').get(req.params.id)));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Discount code already exists' });
    throw e;
  }
});
api.delete('/admin/discounts/:id', requireAdmin, (req, res) => {
  ensureDiscountTables();
  const info = db.prepare('DELETE FROM discount_codes WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Discount not found' });
  res.json({ ok: true });
});
// Public preview: validates code against a client-claimed subtotal for display only.
// Order creation re-validates against the server-computed subtotal — never trusted.
api.post('/discounts/validate', (req, res) => {
  const r = validateDiscountCode(req.body?.code ?? req.body?.discountCode, req.body?.subtotal);
  if (!r.ok) return res.status(r.status || 400).json({ ok: false, error: r.error });
  res.json({ ok: true, code: r.row.code, type: r.row.type, value: Number(r.row.value) || 0, discount: r.discount });
});

// ── کارت به کارت: admin-managed bank cards ────────────────────────────
function ensureBankCardsTable() {
  db.exec(`CREATE TABLE IF NOT EXISTS bank_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_name TEXT NOT NULL DEFAULT '',
    card_number TEXT NOT NULL DEFAULT '',
    card_holder TEXT NOT NULL DEFAULT '',
    account_number TEXT NOT NULL DEFAULT '',
    logo TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_bank_cards_order ON bank_cards(sort_order, id)');
}
try { ensureBankCardsTable(); } catch (_) {}

function normalizeCardNumber(v) { return String(v == null ? '' : v).replace(/[\s-]/g, '').replace(/[^0-9]/g, ''); }
function formatCardNumber(v) {
  const d = normalizeCardNumber(v);
  return d ? d.replace(/(\d{4})(?=\d)/g, '$1 ').trim() : '';
}
function mapBankCard(r) {
  if (!r) return r;
  const num = normalizeCardNumber(r.card_number);
  return {
    id: r.id,
    bankName: r.bank_name || '', bank_name: r.bank_name || '',
    cardNumber: num, card_number: num,
    cardNumberFormatted: formatCardNumber(num), card_number_formatted: formatCardNumber(num),
    cardHolder: r.card_holder || '', card_holder: r.card_holder || '',
    accountNumber: r.account_number || '', account_number: r.account_number || '',
    logo: r.logo || '', note: r.note || '',
    sortOrder: Number(r.sort_order) || 0, sort_order: Number(r.sort_order) || 0,
    isEnabled: !!r.is_enabled, is_enabled: !!r.is_enabled,
    createdAt: r.created_at || null, updatedAt: r.updated_at || null,
  };
}
function listBankCards(onlyEnabled) {
  try { ensureBankCardsTable(); } catch (_) {}
  const sql = onlyEnabled
    ? 'SELECT * FROM bank_cards WHERE is_enabled = 1 ORDER BY sort_order ASC, id ASC'
    : 'SELECT * FROM bank_cards ORDER BY sort_order ASC, id ASC';
  return db.prepare(sql).all().map(mapBankCard);
}
function bankCardInput(b, isCreate) {
  const out = {};
  if (b.bankName !== undefined) out.bank_name = String(b.bankName).trim();
  if (b.bank_name !== undefined) out.bank_name = String(b.bank_name).trim();
  if (b.cardNumber !== undefined) out.card_number = normalizeCardNumber(b.cardNumber);
  if (b.card_number !== undefined) out.card_number = normalizeCardNumber(b.card_number);
  if (b.cardHolder !== undefined) out.card_holder = String(b.cardHolder).trim();
  if (b.card_holder !== undefined) out.card_holder = String(b.card_holder).trim();
  if (b.accountNumber !== undefined) out.account_number = normalizeCardNumber(b.accountNumber);
  if (b.account_number !== undefined) out.account_number = normalizeCardNumber(b.account_number);
  if (b.logo !== undefined) out.logo = String(b.logo || '').trim();
  if (b.note !== undefined) out.note = String(b.note || '').trim();
  if (b.sortOrder !== undefined) out.sort_order = Math.max(0, Math.round(Number(b.sortOrder) || 0));
  if (b.sort_order !== undefined) out.sort_order = Math.max(0, Math.round(Number(b.sort_order) || 0));
  if (b.isEnabled !== undefined) out.is_enabled = b.isEnabled ? 1 : 0;
  if (b.is_enabled !== undefined) out.is_enabled = b.is_enabled ? 1 : 0;
  if (isCreate) {
    if (!out.bank_name) return { error: 'bankName is required' };
    if (!out.card_number) return { error: 'cardNumber is required' };
    if (out.is_enabled == null) out.is_enabled = 1;
    if (out.sort_order == null) out.sort_order = 0;
  }
  if (out.card_number != null && out.card_number !== '' && out.card_number.length !== 16) {
    return { error: 'شماره کارت باید ۱۶ رقم باشد' };
  }
  return { values: out };
}

// Public: checkout only ever sees enabled cards.
api.get('/bank-cards', (req, res) => { res.json(listBankCards(true)); });

api.get('/admin/bank-cards', requireAdmin, (req, res) => {
  ensureBankCardsTable();
  res.json(listBankCards(false));
});
api.post('/admin/bank-cards', requireAdmin, (req, res) => {
  ensureBankCardsTable();
  const { values, error } = bankCardInput(req.body || {}, true);
  if (error) return res.status(400).json({ error });
  const info = db.prepare(`INSERT INTO bank_cards
    (bank_name, card_number, card_holder, account_number, logo, note, sort_order, is_enabled, updated_at)
    VALUES (@bank_name, @card_number, @card_holder, @account_number, @logo, @note, @sort_order, @is_enabled, datetime('now'))`)
    .run({
      bank_name: values.bank_name, card_number: values.card_number,
      card_holder: values.card_holder ?? '', account_number: values.account_number ?? '',
      logo: values.logo ?? '', note: values.note ?? '',
      sort_order: values.sort_order ?? 0, is_enabled: values.is_enabled ?? 1,
    });
  res.status(201).json(mapBankCard(db.prepare('SELECT * FROM bank_cards WHERE id = ?').get(info.lastInsertRowid)));
});
api.put('/admin/bank-cards/:id', requireAdmin, (req, res) => {
  ensureBankCardsTable();
  // '/order' is the bulk-reorder endpoint and must be matched before ':id'.
  if (req.params.id === 'order') return bankCardsReorder(req, res);
  const cur = db.prepare('SELECT * FROM bank_cards WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Bank card not found' });
  const { values, error } = bankCardInput(req.body || {}, false);
  if (error) return res.status(400).json({ error });
  const merged = {
    bank_name: values.bank_name ?? cur.bank_name,
    card_number: values.card_number ?? cur.card_number,
    card_holder: values.card_holder ?? cur.card_holder,
    account_number: values.account_number ?? cur.account_number,
    logo: values.logo ?? cur.logo,
    note: values.note ?? cur.note,
    sort_order: values.sort_order ?? cur.sort_order,
    is_enabled: values.is_enabled ?? cur.is_enabled,
  };
  if (!String(merged.bank_name).trim()) return res.status(400).json({ error: 'bankName is required' });
  db.prepare(`UPDATE bank_cards SET bank_name=@bank_name, card_number=@card_number,
    card_holder=@card_holder, account_number=@account_number, logo=@logo, note=@note,
    sort_order=@sort_order, is_enabled=@is_enabled, updated_at=datetime('now') WHERE id=@id`)
    .run({ ...merged, id: req.params.id });
  res.json(mapBankCard(db.prepare('SELECT * FROM bank_cards WHERE id = ?').get(req.params.id)));
});
api.delete('/admin/bank-cards/:id', requireAdmin, (req, res) => {
  ensureBankCardsTable();
  const cur = db.prepare('SELECT * FROM bank_cards WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Bank card not found' });
  // Orders keep the denormalized bank/number/holder snapshot, so historical
  // orders still show which card the customer was instructed to transfer to.
  db.prepare('DELETE FROM bank_cards WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});
// Bulk reorder: the client sends the full id list in its desired order.
function bankCardsReorder(req, res) {
  ensureBankCardsTable();
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : Array.isArray(req.body) ? req.body : null;
  if (!ids) return res.status(400).json({ error: 'ids is required' });
  const upd = db.prepare("UPDATE bank_cards SET sort_order = ?, updated_at = datetime('now') WHERE id = ?");
  db.exec('BEGIN IMMEDIATE');
  try {
    ids.forEach((id, i) => upd.run(i + 1, id));
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw e;
  }
  res.json(listBankCards(false));
}

// ── Admin dashboard summary (real aggregates, read-only) ──
api.get('/admin/summary', requireAdmin, (req, res) => {
  const orders = db.prepare('SELECT id, total, status, created_at FROM orders').all();
  const totalOrders = orders.length;
  const totalRevenue = orders.filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + (Number(o.total) || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter((o) => String(o.created_at || '').slice(0, 10) === today);
  const todayRevenue = todayOrders.filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + (Number(o.total) || 0), 0);
  const pendingOrders = orders.filter((o) => ['pending', 'awaiting_payment_approval', 'awaiting_order_approval'].includes(o.status)).length;
  const usersCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const productsCount = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  const outOfStock = db.prepare(
    'SELECT COUNT(*) AS n FROM products WHERE in_stock = 0 OR stock_count <= 0').get().n;
  const lowStock = db.prepare(
    'SELECT COUNT(*) AS n FROM products WHERE in_stock = 1 AND stock_count > 0 AND stock_count <= 10').get().n;
  // Last 7 days revenue + order counts by created_at date.
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    const dayOrders = orders.filter((o) => String(o.created_at || '').slice(0, 10) === d
      && o.status !== 'cancelled');
    days.push({
      date: d,
      orders: dayOrders.length,
      revenue: dayOrders.reduce((s, o) => s + (Number(o.total) || 0), 0),
    });
  }
  // Top products by quantity sold (empty when no sales yet — real data, no mock fallback).
  const top = db.prepare(`SELECT oi.product_id AS productId, oi.name AS name,
      SUM(oi.quantity) AS sold, p.category AS category, p.image AS image
    FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
    GROUP BY oi.product_id ORDER BY sold DESC LIMIT 5`).all();
  res.json({
    totalOrders, totalRevenue, todayOrders: todayOrders.length, todayRevenue,
    pendingOrders, usersCount, productsCount, outOfStock, lowStock,
    last7Days: days,
    topProducts: top.map((t) => ({
      productId: t.productId, name: t.name, sold: t.sold,
      category: t.category || '', image: t.image || '',
    })),
  });
});


function getDateRange(range, from, to){
  const today=new Date(); today.setHours(0,0,0,0);
  const fmt=d=>d.toISOString().slice(0,10);
  const add=(d,n)=>{const x=new Date(d); x.setDate(x.getDate()+n); return x;};
  if(from && to) return {start:String(from).slice(0,10), end:String(to).slice(0,10)};
  if(from && !to) return {start:String(from).slice(0,10), end:String(from).slice(0,10)};
  switch(String(range||'')){
    case 'today': return {start:fmt(today), end:fmt(today)};
    case 'yesterday': return {start:fmt(add(today,-1)), end:fmt(add(today,-1))};
    case '7days': return {start:fmt(add(today,-6)), end:fmt(today)};
    case '30days': return {start:fmt(add(today,-29)), end:fmt(today)};
    case 'thisMonth': {const s=new Date(today.getFullYear(),today.getMonth(),1); return {start:fmt(s), end:fmt(today)}; }
    case 'lastMonth': {const s=new Date(today.getFullYear(),today.getMonth()-1,1); const e=new Date(today.getFullYear(),today.getMonth(),0); return {start:fmt(s), end:fmt(e)}; }
    case 'thisYear': {const s=new Date(today.getFullYear(),0,1); return {start:fmt(s), end:fmt(today)}; }
    case 'lastYear': {const s=new Date(today.getFullYear()-1,0,1); const e=new Date(today.getFullYear()-1,11,31); return {start:fmt(s), end:fmt(e)}; }
    default: return {start:fmt(add(today,-29)), end:fmt(today)};
  }
}
const ORDER_STATUS_FA={pending:'در انتظار پرداخت',awaiting_payment_approval:'در انتظار تأیید پرداخت',awaiting_order_approval:'در انتظار تأیید سفارش',approved:'تأیید شد / آماده ارسال',processing:'در حال پردازش',shipped:'ارسال‌شده',delivered:'تحویل‌شده',cancelled:'لغوشده'};
function buildReportsData(kind, range, from, to, topLimit){
  const {start,end}=getDateRange(range,from,to);
  if(!kind){
    const group=String(range||'day').toLowerCase();
    const mode=group==='month'?'month':group==='week'?'week':'day';
    const orders=db.prepare('SELECT id,total,status,created_at FROM orders').all();
    const valid=orders.filter(o=>o.status!=='cancelled');
    const totalRevenue=valid.reduce((s,o)=>s+(Number(o.total)||0),0);
    const usersCount=db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const byStatus={}; for(const o of orders){const st=String(o.status||'pending').toLowerCase(); byStatus[st]=(byStatus[st]||0)+1;}
    const bucketKey=(iso,mode)=>{const d=new Date((iso||'').slice(0,10)+'T12:00:00Z'); if(isNaN(d)) return null; if(mode==='month') return d.toISOString().slice(0,7); if(mode==='week'){const m=new Date(d); const dow=(m.getUTCDay()+6)%7; m.setUTCDate(m.getUTCDate()-dow); return m.toISOString().slice(0,10);} return d.toISOString().slice(0,10);};
    const buckets=new Map(); for(const o of valid){const k=bucketKey(o.created_at,mode); if(!k) continue; const b=buckets.get(k)||{date:k,orders:0,revenue:0}; b.orders+=1; b.revenue+=Number(o.total)||0; buckets.set(k,b);}
    const series=[...buckets.values()].sort((a,b)=>(a.date<b.date?-1:1)).slice(-30);
    const top=db.prepare("SELECT oi.product_id AS productId, oi.name AS name, SUM(oi.quantity) AS sold, SUM(oi.quantity*oi.price) AS revenue, p.category AS category, p.image AS image FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id LEFT JOIN orders o ON o.id=oi.order_id WHERE o.status IS NULL OR o.status != 'cancelled' GROUP BY oi.product_id, oi.name ORDER BY sold DESC LIMIT ?").all(topLimit);
    return {totalRevenue,totalOrders:orders.length,customersCount:usersCount,byStatus,group:mode,series,topProducts:top.map(t=>({productId:t.productId,name:t.name,sold:Number(t.sold)||0,revenue:Number(t.revenue)||0,category:t.category||'',image:t.image||''})),kind:'legacy',start,end};
  }
  if(kind==='products' || kind==='inventory'){
    // Product report shows all products regardless of date range; date filter does not hide products.
    // If needed, filtering by created_at can be enabled explicitly, but by default show full catalog.
    const rows=db.prepare('SELECT id,name,sku,category,price,stock_count,in_stock,is_active FROM products ORDER BY id').all();
    const total=rows.length; const totalStock=rows.reduce((s,r)=>s+(Number(r.stock_count)||0),0); const low=rows.filter(r=>(Number(r.stock_count)||0)<=5).length;
    return {kind,range,start,end,stats:{totalProducts:total,totalStock,lowStock:low},rows:rows.map(r=>({id:r.id,name:r.name,sku:r.sku,category:r.category,price:Number(r.price)||0,stockCount:Number(r.stock_count)||0,inStock:!!r.in_stock,isActive:r.is_active==0?false:true,stockStatus:(Number(r.stock_count)||0)<=0?'ناموجود':(Number(r.stock_count)||0)<=5?'کم‌موجود':'موجود'}))};
  }
  const orders=db.prepare('SELECT o.*, u.first_name, u.last_name, u.mobile FROM orders o LEFT JOIN users u ON u.id=o.user_id WHERE date(o.created_at) BETWEEN ? AND ? ORDER BY o.created_at DESC').all(start,end);
  const itemsStmt=db.prepare('SELECT name FROM order_items WHERE order_id=?');
  const rows=orders.map(o=>{
    const names=itemsStmt.all(o.id).map(x=>x.name).join(' ، ');
    const dt=String(o.created_at||'').slice(0,19).replace('T',' ');
    const d=dt.slice(0,10), t2=dt.slice(11);
    return {id:o.id,date:d,time:t2,customer:((o.first_name||'')+' '+(o.last_name||'')).trim()||'—',mobile:o.mobile||'',status:o.status,statusFa:ORDER_STATUS_FA[o.status]||o.status,itemsCount:Number(o.items_count)||0,total:Number(o.total)||0,discount:Number(o.discount)||0,shipping:Number(o.shipping)||0,products:names};
  });
  const totalOrders=orders.length; const totalSales=orders.filter(o=>o.status!=='cancelled').reduce((s,o)=>s+(Number(o.total)||0),0);
  const totalDiscount=orders.reduce((s,o)=>s+(Number(o.discount)||0),0); const totalShipping=orders.reduce((s,o)=>s+(Number(o.shipping)||0),0);
  const byStatus={}; for(const o of orders){const k=o.status||'pending'; byStatus[k]=(byStatus[k]||0)+1;}
  return {kind,range,start,end,stats:{totalOrders,totalSales,totalDiscount,totalShipping,byStatus},rows};
}
// ── Admin store reports (real SQLite aggregates, read-only) ──
api.get('/admin/reports', requireAdmin, (req, res) => {
  const topLimit = Math.min(Math.max(parseInt(req.query.top, 10) || 10, 1), 50);
  const kind = req.query.kind ? String(req.query.kind).toLowerCase() : null;
  const range = req.query.range || req.query.group || null;
  const from = req.query.from || null; const to = req.query.to || null;
  if(kind){
    const data=buildReportsData(kind, range, from, to, topLimit);
    if(kind==='orders'||kind==='sales'){
      const orders=db.prepare('SELECT total,status,created_at FROM orders WHERE date(created_at) BETWEEN ? AND ?').all(data.start,data.end);
      const valid=orders.filter(o=>o.status!=='cancelled');
      const buckets=new Map();
      for(const o of valid){const k=String(o.created_at||'').slice(0,10); const b=buckets.get(k)||{date:k,orders:0,revenue:0}; b.orders+=1; b.revenue+=Number(o.total)||0; buckets.set(k,b);}
      data.series=[...buckets.values()].sort((a,b)=>(a.date<b.date?-1:1));
      data.totalRevenue=valid.reduce((s,o)=>s+(Number(o.total)||0),0);
      data.totalOrders=orders.length;
      data.byStatus=data.stats.byStatus;
    }
    return res.json(data);
  }
  const data=buildReportsData(null, range, from, to, topLimit);
  res.json(data);
});
api.get('/admin/reports/export/excel', requireAdmin, async (req,res)=>{
  try{
    const kind=String(req.query.kind||'orders').toLowerCase();
    const range=req.query.range||null; const from=req.query.from||null; const to=req.query.to||null;
    const data=buildReportsData(kind,range,from,to,50);
    const wb=new ExcelJS.Workbook(); wb.creator='Camzy';
    const ws=wb.addWorksheet('گزارش',{views:[{rightToLeft:true,state:'frozen',ySplit:1}]});
    let headers, rows;
    if(kind==='products'||kind==='inventory'){
      headers=['شناسه','نام محصول','SKU','دسته‌بندی','قیمت','موجودی','وضعیت موجودی','وضعیت'];
      rows=data.rows.map(r=>[r.id,r.name,r.sku,r.category,r.price,r.stockCount,r.stockStatus,r.isActive?'فعال':'غیرفعال']);
    } else {
      headers=['شناسه سفارش','تاریخ','ساعت','مشتری','موبایل','وضعیت','تعداد اقلام','مبلغ فروش','تخفیف','هزینه ارسال','مبلغ نهایی','محصولات'];
      rows=data.rows.map(r=>[r.id,r.date,r.time,r.customer,r.mobile,r.statusFa,r.itemsCount,r.total,r.discount,r.shipping,r.total,r.products]);
    }
    ws.columns=headers.map((h,i)=>({header:h,key:'c'+i,width: i===headers.length-1?40:16, style:{alignment:{vertical:'middle',horizontal:'center',wrapText:true}}}));
    ws.getRow(1).values=[null,...headers];
    const hr=ws.getRow(1); hr.font={bold:true,color:{argb:'FFFFFFFF'},size:11}; hr.alignment={horizontal:'center',vertical:'middle',wrapText:true};
    hr.eachCell(c=>{ if(c.value!=null){c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1E3A5F'}}; c.border={top:{style:'thin',color:{argb:'FFB0B0B0'}},bottom:{style:'thin',color:{argb:'FFB0B0B0'}},left:{style:'thin',color:{argb:'FFB0B0B0'}},right:{style:'thin',color:{argb:'FFB0B0B0'}}}; }});
    hr.height=20;
    for(const r of rows){ const row=ws.addRow(r); row.eachCell(c=>{c.border={top:{style:'thin',color:{argb:'FFE0E0E0'}},bottom:{style:'thin',color:{argb:'FFE0E0E0'}},left:{style:'thin',color:{argb:'FFE0E0E0'}},right:{style:'thin',color:{argb:'FFE0E0E0'}}}; c.alignment={vertical:'middle',horizontal:'center',wrapText:true};}); }
    ws.autoFilter={from:{row:1,column:1},to:{row:1,column:headers.length}};
    const buf=await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition','attachment; filename="report-'+kind+'.xlsx"');
    res.send(Buffer.from(buf));
  }catch(e){ res.status(500).json({error:e.message}); }
});

// ── Orders + order items (linked to authenticated user) ──
// ── Orders (admin list: every order with customer + items) ──
api.get('/orders', requireAdmin, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  const userStmt = db.prepare('SELECT id, first_name, last_name, mobile, email FROM users WHERE id = ?');
  res.json(orders.map((o) => {
    const mapped = mapOrder(o, itemsStmt.all(o.id));
    const u = o.user_id ? userStmt.get(o.user_id) : null;
    mapped.customer = u
      ? { id: u.id, firstName: u.first_name, lastName: u.last_name, mobile: u.mobile, email: u.email || '' }
      : null;
    return mapped;
  }));
});

// ── Admin transactions (read-only projection over existing orders/payment data) ──
// No duplicate payment data: each order is one transaction. Transaction ID is
// the gateway refId, falling back to authority and then the order ID.
const VALID_TX_STATUSES = new Set(['pending', 'successful', 'failed', 'refunded']);
function txStatusOf(paymentStatus) {
  const ps = String(paymentStatus || 'unpaid');
  if (ps === 'paid') return 'successful';
  if (ps === 'failed') return 'failed';
  if (ps === 'refunded') return 'refunded';
  return 'pending';
}
function mapTransaction(o) {
  const ps = VALID_PAYMENT_STATUSES.has(o.payment_status) ? o.payment_status : 'unpaid';
  const amount = (o.payment_amount != null ? Number(o.payment_amount) : Number(o.total)) || 0;
  const refId = o.payment_ref_id || null;
  const authority = o.payment_authority || null;
  return {
    id: refId || authority || o.id,
    orderId: o.id,
    userId: o.user_id || null,
    userName: o.user_name || '',
    userMobile: o.user_mobile || '',
    amount,
    method: VALID_PAYMENT_METHODS.has(o.payment_method) ? o.payment_method : normalizePaymentMethod(o.payment_method),
    methodRaw: o.payment_method || '',
    status: txStatusOf(ps),
    paymentStatus: ps,
    refId, authority,
    paidAt: o.paid_at || null,
    createdAt: o.created_at || null,
    orderStatus: o.status || '',
  };
}
api.get('/admin/transactions', requireAdmin, (req, res) => {
  const { q, status, method, dateFrom, dateTo, limit = 20, offset = 0 } = req.query;
  const where = [];
  const params = [];
  if (q) {
    const like = `%${q}%`;
    where.push(`(o.id LIKE ? OR COALESCE(o.payment_ref_id,'') LIKE ? OR COALESCE(o.payment_authority,'') LIKE ?
      OR COALESCE(u.mobile,'') LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR (u.first_name || ' ' || u.last_name) LIKE ?)`);
    params.push(like, like, like, like, like, like, like);
  }
  if (status && VALID_TX_STATUSES.has(String(status))) {
    const s = String(status);
    if (s === 'successful') where.push(`COALESCE(o.payment_status,'unpaid') = 'paid'`);
    else if (s === 'failed') where.push(`COALESCE(o.payment_status,'unpaid') = 'failed'`);
    else if (s === 'refunded') where.push(`COALESCE(o.payment_status,'unpaid') = 'refunded'`);
    else where.push(`COALESCE(o.payment_status,'unpaid') IN ('pending','unpaid')`);
  }
  if (method && VALID_PAYMENT_METHODS.has(String(method))) { where.push('o.payment_method = ?'); params.push(String(method)); }
  if (dateFrom) { where.push('DATE(o.created_at) >= DATE(?)'); params.push(String(dateFrom).slice(0, 10)); }
  if (dateTo) { where.push('DATE(o.created_at) <= DATE(?)'); params.push(String(dateTo).slice(0, 10)); }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 500);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const base = `FROM orders o LEFT JOIN users u ON u.id = o.user_id ${clause}`;
  const rows = db.prepare(`SELECT o.*, TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS user_name,
      u.mobile AS user_mobile ${base} ORDER BY o.created_at DESC, o.rowid DESC LIMIT ? OFFSET ?`).all(...params, lim, off);
  const total = db.prepare(`SELECT COUNT(*) AS n ${base}`).get(...params).n;
  const sums = db.prepare(`SELECT COUNT(*) AS n,
      COALESCE(SUM(COALESCE(o.payment_amount, o.total)), 0) AS s ${base}`).get(...params);
  res.json({
    total,
    items: rows.map(mapTransaction),
    summary: { count: sums.n || 0, totalAmount: Number(sums.s) || 0 },
  });
});
api.get('/admin/transactions/:orderId', requireAdmin, (req, res) => {
  const o = db.prepare(`SELECT o.*, TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS user_name,
      u.mobile AS user_mobile, u.email AS user_email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?`).get(req.params.orderId);
  if (!o) return res.status(404).json({ error: 'Transaction not found' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
  const order = mapOrder(o, items);
  order.customer = o.user_id ? { id: o.user_id, firstName: '', lastName: o.user_name || '', name: o.user_name || '', mobile: o.user_mobile || '', email: o.user_email || '' } : null;
  let events = [];
  try { events = db.prepare('SELECT id, event, detail, created_at FROM payment_events WHERE order_id = ? ORDER BY id').all(o.id); } catch (_) {}
  res.json({ ...mapTransaction(o), order, events });
});

api.get('/users/:userId/orders', (req, res) => {
  const auth = getAuthUser(req);
  // Authenticated users may only list their own orders; unauthenticated
  // legacy access still allowed for backward compat when ids match locally.
  if (auth && auth.row.id !== req.params.userId) return res.status(403).json({ error: 'Forbidden' });
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(req.params.userId);
  const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  res.json(orders.map((o) => mapOrder(o, itemsStmt.all(o.id))));
});

api.get('/orders/:id', (req, res) => {
  const o = db.prepare('SELECT o.*, u.first_name, u.last_name, u.mobile as user_mobile, u.email as user_email FROM orders o LEFT JOIN users u ON u.id=o.user_id WHERE o.id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  const auth = getAuthUser(req);
  let admin=null; try{ admin=getAdminAuth(req); }catch(e){}
  if (!admin && auth && o.user_id && o.user_id !== auth.row.id) return res.status(403).json({ error: 'Forbidden' });
  const mapped = mapOrder(o, db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id));
  if (o.user_id) mapped.customer = { id: o.user_id, firstName: o.first_name || '', lastName: o.last_name || '', mobile: o.user_mobile || '', email: o.user_email || '' };
  res.json(mapped);
});

function getShipSettings() {
  const s = readSettings();
  const cost = Math.max(0, Math.round(Number(String(s['ship.cost']).replace(/[^\d.-]/g, '')) || 0));
  const freeFrom = Math.max(0, Math.round(Number(String(s['ship.free_from']).replace(/[^\d.-]/g, '')) || 0));
  return { cost, freeFrom };
}
function isPaymentEnabled(method) {
  const s = readSettings();
  if (method === 'online') return String(s['pay.online']) === '1';
  if (method === 'card') return String(s['pay.card']) === '1';
  return String(s['pay.cod']) === '1';
}

// ── Purchase settings (DB-backed via settings table, admin-managed) ──
// order.min_amount / order.max_amount: 0 = no limit. order.min_qty: >=1.
// order.max_qty: 0 = no limit. Toggles stored as '1'/'0'.
function getPurchaseSettings() {
  const s = readSettings();
  const toNum = (v, fb) => {
    const n = Math.max(0, Math.round(Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0));
    return Number.isFinite(n) ? n : fb;
  };
  return {
    minAmount: toNum(s['order.min_amount'], 0),
    maxAmount: toNum(s['order.max_amount'], 0),
    minQty: Math.max(1, toNum(s['order.min_qty'], 1) || 1),
    maxQty: toNum(s['order.max_qty'], 0),
    allowGuest: String(s['order.allow_guest']) === '1',
    allowQtyEdit: String(s['order.allow_qty_edit']) === '1',
    allowOos: String(s['order.allow_oos']) === '1',
  };
}
// Per-line quantity guard. Returns null when OK, else { status, error }.
function checkPurchaseQty(quantity, productName) {
  const ps = getPurchaseSettings();
  const label = productName ? ` (${productName})` : '';
  if (quantity < ps.minQty) {
    return { status: 409, error: `حداقل تعداد هر محصول ${ps.minQty} عدد است${label}.` };
  }
  if (ps.maxQty > 0 && quantity > ps.maxQty) {
    return { status: 409, error: `حداکثر تعداد هر محصول ${ps.maxQty} عدد است${label}.` };
  }
  return null;
}
// Order-total guard (server-computed subtotal). Returns null when OK.
function checkPurchaseAmount(subtotal) {
  const ps = getPurchaseSettings();
  if (ps.minAmount > 0 && subtotal < ps.minAmount) {
    return { status: 409, error: `حداقل مبلغ سفارش ${Number(ps.minAmount).toLocaleString('fa-IR')} تومان است.` };
  }
  if (ps.maxAmount > 0 && subtotal > ps.maxAmount) {
    return { status: 409, error: `حداکثر مبلغ سفارش ${Number(ps.maxAmount).toLocaleString('fa-IR')} تومان است.` };
  }
  return null;
}

const LEGACY_SHIPPING_COST = 35000;

api.post('/orders', orderLimiter, (req, res) => {
  const b = req.body || {};
  if (!Array.isArray(b.items) || !b.items.length) {
    return res.status(400).json({ error: 'سبد خرید شما خالی است' });
  }
  // Link each order to the authenticated user when a token is provided.
  const auth = getAuthUser(req);
  // An admin_sessions token is a valid /admin login but not a customer
  // identity: getAuthUser() cannot resolve it, so the order would silently
  // degrade to a guest order (user_id NULL) and never appear in any account
  // order list. Refuse loudly instead of hiding the purchase.
  if (!auth) {
    let adminAuth = null;
    try { adminAuth = getAdminAuth(req); } catch (_) {}
    if (adminAuth) {
      return res.status(401).json({ error: 'ثبت سفارش با حساب مدیریتی ممکن نیست. لطفاً با حساب کاربری مشتری وارد شوید و دوباره تلاش کنید.' });
    }
  }
  let userId = (auth && auth.row.id) || b.userId || null;
  // A stale client session (user deleted, DB restored, expired token) can send
  // a userId that no longer exists. Verify it against users; otherwise fall
  // back to a guest order so the INSERT never violates the users FK.
  if (!auth && userId && !db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) {
    userId = null;
  }
  // Purchase settings: guest checkout may be disabled by admin.
  const ps = getPurchaseSettings();
  if (!ps.allowGuest && !auth) {
    return res.status(401).json({ error: 'ثبت سفارش نیاز به ورود به حساب کاربری دارد. لطفاً وارد شوید.' });
  }
  if (b.userId && auth && b.userId !== auth.row.id) {
    return res.status(403).json({ error: 'Order user mismatch' });
  }
  // Address is required and addressId must reference a real address.
  // An addressId belonging to another user is rejected.
  const addressText = String(b.address || '').trim();
  if (!addressText) {
    return res.status(400).json({ error: 'address is required' });
  }
  let addressId = b.addressId ?? null;
  if (addressId !== null && addressId !== '') {
    const addrRow = db.prepare('SELECT id, user_id FROM addresses WHERE id = ?').get(addressId);
    if (!addrRow) return res.status(400).json({ error: 'Invalid addressId' });
    if (userId && addrRow.user_id && addrRow.user_id !== userId) {
      return res.status(403).json({ error: 'Address does not belong to user' });
    }
    addressId = addrRow.id;
  } else {
    addressId = null;
  }
  // Never trust frontend pricing: recalculate everything from the database.
  // Aggregate quantities per product so duplicate lines can't bypass stock checks.
  const qtyByProduct = new Map();
  const optionsByProduct = new Map(); // productId -> options from first occurrence
  for (const it of b.items) {
    const productId = Number(it.productId ?? it.id);
    const quantity = Math.round(Number(it.quantity ?? 1));
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Invalid productId' });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }
    qtyByProduct.set(productId, (qtyByProduct.get(productId) || 0) + quantity);
    // Store options from the first occurrence of this product
    if (!optionsByProduct.has(productId) && it.options && Array.isArray(it.options) && it.options.length) {
      optionsByProduct.set(productId, it.options);
    }
  }
  const prodStmt = db.prepare('SELECT id, name, price, in_stock, stock_count FROM products WHERE id = ?');
  const serverItems = [];
  let subtotal = 0;
  for (const [productId, quantity] of qtyByProduct) {
    const p = prodStmt.get(productId);
    if (!p) return res.status(400).json({ error: 'Product not found: ' + productId });
    const qErr = checkPurchaseQty(quantity, p.name);
    if (qErr) return res.status(qErr.status).json({ error: qErr.error });
    const stockCount = p.stock_count != null ? p.stock_count : (p.in_stock ? 50 : 0);
    if (!ps.allowOos && (!p.in_stock || stockCount < quantity)) {
      return res.status(409).json({ error: 'Product unavailable or insufficient stock: ' + p.name });
    }
    const baseUnitPrice = p.price;
    // Validate options against database
    let optionsPrice = 0;
    const opts = optionsByProduct.get(productId) || [];
    const validatedOpts = [];
    for (const opt of opts) {
      const optId = Number(opt.id);
      if (!Number.isInteger(optId) || optId <= 0) {
        return res.status(400).json({ error: 'Invalid option id: ' + optId });
      }
      const dbOpt = db.prepare('SELECT id, product_id, title, price, discount_price, is_active FROM product_options WHERE id = ?').get(optId);
      if (!dbOpt) {
        return res.status(400).json({ error: 'Option not found: ' + optId });
      }
      if (dbOpt.product_id !== productId) {
        return res.status(400).json({ error: 'Option does not belong to product: ' + optId });
      }
      if (!dbOpt.is_active) {
        return res.status(400).json({ error: 'Option is not available: ' + dbOpt.title });
      }
      // Use database price (discounted if available)
      const optPrice = dbOpt.discount_price != null ? Number(dbOpt.discount_price) : Number(dbOpt.price);
      optionsPrice += optPrice;
      validatedOpts.push({ id: dbOpt.id, title: dbOpt.title, price: optPrice });
    }
    const unitPrice = baseUnitPrice + optionsPrice;
    subtotal += unitPrice * quantity;
    serverItems.push({ productId: p.id, name: p.name, price: unitPrice, quantity, basePrice: baseUnitPrice, options: validatedOpts });
  }
  // Shipping/discount are server-controlled. Free-shipping threshold from
  // settings is enforced: subtotal >= freeFrom => shipping is 0.
  // Otherwise allowed values are 0 (normal) or any configured shipping-method
  // cost, plus legacy 35000 for backward compat.
  const { cost: shipCost, freeFrom } = getShipSettings();
  const clientShipping = Math.round(Number(b.shipping) || 0);
  let methodCosts = [];
  try { methodCosts = listShippingMethods().map((m) => Math.max(0, Math.round(Number(m.cost) || 0))); } catch (_) {}
  const allowed = new Set([0, shipCost, LEGACY_SHIPPING_COST, ...methodCosts]);
  let shipping = allowed.has(clientShipping) ? clientShipping : 0;
  if (freeFrom > 0 && subtotal >= freeFrom) shipping = 0;
  // Discount is strictly server-computed: client amount is never trusted.
  let discount = 0;
  let discountCode = '';
  const rawCode = b.discountCode ?? b.discount_code ?? b.code;
  if (rawCode !== undefined && rawCode !== null && String(rawCode).trim() !== '') {
    const v = validateDiscountCode(rawCode, subtotal);
    if (!v.ok) return res.status(v.status || 400).json({ error: v.error });
    discount = v.discount;
    discountCode = v.row.code;
  }
  const total = Math.max(0, subtotal + shipping - discount);
  // Purchase settings: order amount limits enforced on server subtotal.
  const amtErr = checkPurchaseAmount(subtotal);
  if (amtErr) return res.status(amtErr.status).json({ error: amtErr.error });
  const itemsCount = serverItems.reduce((s, i) => s + i.quantity, 0);
  const id = b.id || ('ORD-' + Date.now().toString(36).toUpperCase().slice(-8));
  // Server-side payment state: normalize method, derive initial payment_status.
  // No gateway yet: cod -> unpaid, online/card -> pending (awaiting payment).
  // Never trust client statusText / status / timeline / paymentStatus.
  const paymentMethod = normalizePaymentMethod(b.paymentMethod ?? b.payment_method);
  if (!isPaymentEnabled(paymentMethod)) {
    return res.status(409).json({ error: 'Payment method is disabled: ' + paymentMethod });
  }
  const paymentStatus = paymentMethod === 'cod' ? 'unpaid' : 'pending';
  // Admin approval gate: card-to-card orders await payment approval, COD
  // orders await order approval. Only online orders start as 'pending'.
  const awaitingPaymentApproval = paymentMethod === 'card';
  const awaitingOrderApproval = paymentMethod === 'cod';
  const initialStatus = awaitingPaymentApproval ? 'awaiting_payment_approval'
    : awaitingOrderApproval ? 'awaiting_order_approval' : 'pending';
  const initialStatusText = awaitingPaymentApproval ? 'در انتظار تأیید پرداخت'
    : awaitingOrderApproval ? 'در انتظار تأیید سفارش' : 'در انتظار پرداخت';
  const nowIso = new Date().toISOString();
  const serverTimeline = JSON.stringify([{ status: initialStatus, date: nowIso }]);
  try {
    db.exec('BEGIN IMMEDIATE');
    const ins = db.prepare('INSERT INTO order_items (order_id, product_id, name, price, quantity, options_json) VALUES (?, ?, ?, ?, ?, ?)');
    const dec = db.prepare('UPDATE products SET stock_count = stock_count - ?, in_stock = CASE WHEN stock_count - ? > 0 THEN 1 ELSE 0 END WHERE id = ? AND stock_count >= ?');
    db.prepare(`INSERT INTO orders
      (id, user_id, date, status, status_text, total, items_count, shipping, discount, discount_code,
       address, address_id, payment_method, payment_status, timeline_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, userId, b.date || '', initialStatus, initialStatusText,
        total, itemsCount, shipping, discount, discountCode,
        addressText, addressId, paymentMethod, paymentStatus,
        serverTimeline);
    for (const it of serverItems) {
      const optionsJson = JSON.stringify(it.options || []);
      ins.run(id, it.productId, it.name, it.price, it.quantity, optionsJson);
      if (ps.allowOos) {
        // OOS purchases allowed: decrement without the stock guard (stock
        // may go negative); flag out-of-stock state when depleted.
        const ch = db.prepare('UPDATE products SET stock_count = stock_count - ?, in_stock = CASE WHEN stock_count - ? > 0 THEN 1 ELSE 0 END WHERE id = ?')
          .run(it.quantity, it.quantity, it.productId);
        if (!ch.changes) throw Object.assign(new Error('Product not found: ' + it.name), { code: 'INSUFFICIENT_STOCK' });
      } else {
        const ch = dec.run(it.quantity, it.quantity, it.productId, it.quantity);
        if (!ch.changes) {
          throw Object.assign(new Error('Insufficient stock: ' + it.name), { code: 'INSUFFICIENT_STOCK' });
        }
      }
    }
    if (discountCode) {
      db.prepare('UPDATE discount_codes SET used_count = used_count + 1, updated_at = datetime(\'now\') WHERE code = ?').run(discountCode);
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    if (e.code === 'INSUFFICIENT_STOCK') return res.status(409).json({ error: e.message });
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Order id already exists' });
    if (String(e.message).includes('database is locked') || String(e.message).includes('busy')) return res.status(409).json({ error: 'Concurrent order conflict, please retry' });
    throw e;
  }
  const created = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  res.status(201).json(mapOrder(created, db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id)));
});

function normalizeOrderStatus(s) {
  const v = String(s || '').trim().toLowerCase();
  if (v === 'canceled') return 'cancelled';
  if (v === 'shipping') return 'shipped';
  return v;
}

const VALID_ORDER_STATUSES = new Set(['pending', 'awaiting_payment_approval', 'awaiting_order_approval', 'approved', 'processing', 'shipped', 'delivered', 'cancelled']);
// Terminal states: stock (cancelled) or fulfillment (delivered) is final.
const TERMINAL_ORDER_STATUSES = new Set(['cancelled', 'delivered']);

function isCancelledStatus(s) {
  return normalizeOrderStatus(s) === 'cancelled';
}

function ensureStockRestoredColumn() {
  try {
    const cols = db.prepare('PRAGMA table_info(orders)').all();
    if (!cols.some((c) => c.name === 'stock_restored')) {
      db.exec('ALTER TABLE orders ADD COLUMN stock_restored INTEGER NOT NULL DEFAULT 0');
    }
  } catch (_) {}
}
ensureStockRestoredColumn();

api.patch('/orders/:id', requireAdmin, (req, res) => {
  const status = req.body.status;
  let statusText = req.body.statusText ?? req.body.status_text;
  const paymentStatus = req.body.paymentStatus ?? req.body.payment_status;
  const paymentMethod = req.body.paymentMethod ?? req.body.payment_method;
  if (status === undefined && statusText === undefined && paymentStatus === undefined && paymentMethod === undefined) return res.status(400).json({ error: 'status, paymentStatus or paymentMethod required' });
  ensureStockRestoredColumn();
  try {
    const cols = db.prepare('PRAGMA table_info(orders)').all();
    if (!cols.some((c) => c.name === 'payment_status')) {
      db.exec("ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid'");
    }
  } catch (_) {}
  const o = db.prepare('SELECT id, status, stock_restored, payment_method FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  let nextStatus = null;
  if (status !== undefined) {
    if (typeof status !== 'string') return res.status(400).json({ error: 'Invalid status' });
    nextStatus = normalizeOrderStatus(status);
    if (!VALID_ORDER_STATUSES.has(nextStatus)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const current = normalizeOrderStatus(o.status);
    if (nextStatus !== current && TERMINAL_ORDER_STATUSES.has(current)) {
      return res.status(409).json({ error: `Cannot transition order from '${current}'` });
    }
    // Derive the Persian label from the status itself when the client
    // does not send one, so status and statusText never diverge.
    if (statusText === undefined) {
      const derived = ORDER_STATUS_FA[nextStatus];
      if (derived !== undefined) statusText = derived;
    }
    // Admin approval gate: card/COD orders must be approved before the
    // shipping workflow (processing/shipped) can proceed.
    const requiresApproval = o.payment_method === 'card' || o.payment_method === 'cod';
    if (requiresApproval && (nextStatus === 'processing' || nextStatus === 'shipped') && current !== 'approved') {
      return res.status(409).json({ error: 'سفارش باید ابتدا توسط مدیر تأیید شود' });
    }
    if (nextStatus === 'approved' && current !== 'awaiting_payment_approval' && current !== 'awaiting_order_approval') {
      return res.status(409).json({ error: `Cannot transition order from '${current}'` });
    }
  }
  // Restore stock atomically when transitioning into a cancelled status.
  // Guarded by stock_restored so repeated cancellations restore only once.
  const willCancel = nextStatus !== null && nextStatus === 'cancelled';
  const needsRestore = willCancel && !isCancelledStatus(o.status) && !o.stock_restored;
  let nextPaymentStatus = null;
  if (paymentStatus !== undefined) {
    if (typeof paymentStatus !== 'string' || !VALID_PAYMENT_STATUSES.has(paymentStatus.trim().toLowerCase())) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      return res.status(400).json({ error: 'Invalid paymentStatus' });
    }
    nextPaymentStatus = paymentStatus.trim().toLowerCase();
  }
  let nextPaymentMethod = null;
  if (paymentMethod !== undefined) {
    nextPaymentMethod = normalizePaymentMethod(paymentMethod);
  }
  try {
    db.exec('BEGIN');
    if (nextStatus !== null) db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(nextStatus, req.params.id);
    if (statusText !== undefined) db.prepare("UPDATE orders SET status_text = ?, updated_at = datetime('now') WHERE id = ?").run(statusText, req.params.id);
    if (nextPaymentStatus !== null) db.prepare("UPDATE orders SET payment_status = ?, updated_at = datetime('now') WHERE id = ?").run(nextPaymentStatus, req.params.id);
    if (nextPaymentMethod !== null) db.prepare("UPDATE orders SET payment_method = ?, updated_at = datetime('now') WHERE id = ?").run(nextPaymentMethod, req.params.id);
    if (needsRestore) {
      const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(req.params.id);
      const rest = db.prepare('UPDATE products SET stock_count = stock_count + ?, in_stock = 1 WHERE id = ?');
      for (const it of items) {
        if (it.product_id != null) rest.run(it.quantity, it.product_id);
      }
      db.prepare('UPDATE orders SET stock_restored = 1 WHERE id = ?').run(req.params.id);
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw e;
  }
  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  res.json(mapOrder(updated, db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(updated.id)));
});

// ── Payment gateway seam (STUB — no external gateway connected) ──
// Tables/columns exist so a real gateway can plug in later:
//   orders.payment_authority / payment_ref_id / payment_amount / paid_at + payment_events log.
// Flow when a gateway is added:
//   1. POST :id/payment/initiate → server stores authority + amount, returns them;
//      replace the STUB authority with a real gateway request and return its payment URL.
//   2. Gateway redirects user back → POST :id/payment/callback → replace the
//      stub `success` flag with a real server-to-server verification call, then
//      transition payment_status (pending → paid / failed) only on verified result.
function ensurePaymentColumns() {
  try {
    const cols = db.prepare('PRAGMA table_info(orders)').all();
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('payment_authority')) db.exec('ALTER TABLE orders ADD COLUMN payment_authority TEXT');
    if (!names.has('payment_ref_id')) db.exec('ALTER TABLE orders ADD COLUMN payment_ref_id TEXT');
    if (!names.has('payment_amount')) db.exec('ALTER TABLE orders ADD COLUMN payment_amount INTEGER');
    if (!names.has('paid_at')) db.exec('ALTER TABLE orders ADD COLUMN paid_at TEXT');
    db.exec(`CREATE TABLE IF NOT EXISTS payment_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      event TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_payment_events_order ON payment_events(order_id)');
  } catch (_) {}
}
ensurePaymentColumns();

function logPaymentEvent(orderId, event, detail) {
  try {
    ensurePaymentColumns();
    db.prepare('INSERT INTO payment_events (order_id, event, detail) VALUES (?, ?, ?)')
      .run(orderId, String(event || ''), String(detail || '').slice(0, 1000));
  } catch (_) {}
}

// Owner (order.user_id) or admin may access payment refs; guest orders
// (user_id NULL, legacy backward compat) keep legacy open access.
function checkPaymentAccess(order, req) {
  if (!order.user_id) return null;
  const auth = getAuthUser(req);
  const admin = getAdminAuth(req);
  if (admin) return null;
  if (!auth) return { code: 401, error: 'Not authenticated' };
  if (auth.row.id !== order.user_id) return { code: 403, error: 'Forbidden' };
  return null;
}

function paymentStatePayload(o) {
  return {
    orderId: o.id, paymentMethod: o.payment_method, paymentStatus: o.payment_status,
    authority: o.payment_authority ?? null, refId: o.payment_ref_id ?? null,
    amount: o.payment_amount ?? null, paidAt: o.paid_at ?? null,
  };
}

// Initiate an online payment: idempotent while pending (returns existing authority).
api.post('/orders/:id/payment/initiate', (req, res) => {
  ensurePaymentColumns();
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  const denied = checkPaymentAccess(o, req);
  if (denied) return res.status(denied.code).json({ error: denied.error });
  const pm = normalizePaymentMethod(o.payment_method);
  if (pm !== 'online') return res.status(409).json({ error: 'Order is not an online payment' });
  if (!isPaymentEnabled('online')) return res.status(409).json({ error: 'Online payment is disabled' });
  if (o.payment_status === 'paid') return res.status(409).json({ error: 'Order already paid' });
  if (o.payment_status === 'refunded') return res.status(409).json({ error: 'Order refunded' });
  if (o.payment_status === 'pending' && o.payment_authority) {
    return res.json({ ...paymentStatePayload(o), gateway: 'not-connected' });
  }
  // STUB authority: replace with a real gateway payment-request call.
  const authority = 'STUB-' + crypto.randomBytes(12).toString('hex');
  db.prepare(`UPDATE orders SET payment_authority = ?, payment_amount = ?, payment_ref_id = NULL,
    paid_at = NULL, payment_status = 'pending', updated_at = datetime('now') WHERE id = ?`)
    .run(authority, o.total, req.params.id);
  logPaymentEvent(o.id, 'initiate', `authority=${authority} amount=${o.total}`);
  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  res.status(201).json({ ...paymentStatePayload(updated), gateway: 'not-connected' });
});

api.get('/orders/:id/payment', (req, res) => {
  ensurePaymentColumns();
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  const denied = checkPaymentAccess(o, req);
  if (denied) return res.status(denied.code).json({ error: denied.error });
  res.json(paymentStatePayload(o));
});

api.get('/orders/:id/payment/events', requireAdmin, (req, res) => {
  ensurePaymentColumns();
  const o = db.prepare('SELECT id FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  res.json(db.prepare('SELECT id, event, detail, created_at FROM payment_events WHERE order_id = ? ORDER BY id').all(req.params.id));
});

// Gateway callback receiver (STUB verification: trusts the `success` flag +
// matching authority). When a real gateway is connected, replace this with a
// server-to-server verify(authority) call and transition state only on success.
api.post('/orders/:id/payment/callback', (req, res) => {
  ensurePaymentColumns();
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  const pm = normalizePaymentMethod(o.payment_method);
  if (pm !== 'online') return res.status(409).json({ error: 'Order is not an online payment' });
  const b = req.body || {};
  const authority = String(b.authority ?? b.Authority ?? '').trim();
  if (!authority || !o.payment_authority || authority !== o.payment_authority) {
    logPaymentEvent(o.id, 'callback-rejected', 'authority mismatch');
    return res.status(403).json({ error: 'Invalid payment authority' });
  }
  if (o.payment_status === 'paid') {
    return res.json({ ...paymentStatePayload(o), gateway: 'not-connected' });
  }
  if (o.payment_status !== 'pending') {
    return res.status(409).json({ error: `Cannot settle payment from '${o.payment_status}'` });
  }
  const success = b.success === true || String(b.success ?? b.status ?? '').trim().toLowerCase() === 'ok';
  if (success) {
    const refId = String(b.refId ?? b.refID ?? b.RefID ?? '').trim() || ('STUB-REF-' + crypto.randomBytes(6).toString('hex'));
    db.prepare(`UPDATE orders SET payment_status = 'paid', payment_ref_id = ?,
      paid_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .run(refId, req.params.id);
    logPaymentEvent(o.id, 'verify-success', `refId=${refId}`);
  } else {
    db.prepare("UPDATE orders SET payment_status = 'failed', updated_at = datetime('now') WHERE id = ?")
      .run(req.params.id);
    logPaymentEvent(o.id, 'verify-failed', String(b.error ?? b.message ?? 'gateway reported failure').slice(0, 500));
  }
  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  res.json({ ...paymentStatePayload(updated), gateway: 'not-connected' });
});

// ── Customer cart (per authenticated user) ──
function getCartItems(userId) {
  db.exec(`CREATE TABLE IF NOT EXISTS carts (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    items_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const row = db.prepare('SELECT items_json FROM carts WHERE user_id = ?').get(userId);
  if (!row) return [];
  try {
    const items = JSON.parse(row.items_json || '[]');
    return Array.isArray(items) ? items : [];
  } catch (_) { return []; }
}

function setCartItems(userId, items) {
  db.prepare(`INSERT INTO carts (user_id, items_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET items_json = excluded.items_json, updated_at = datetime('now')`)
    .run(userId, JSON.stringify(items || []));
}

function normalizeCartItems(items) {
  const out = [];
  for (const it of (items || [])) {
    const productId = Number(it.productId ?? it.id);
    if (!productId) continue;
    const qty = Math.max(0, Math.round(Number(it.quantity) || 0));
    if (qty <= 0) continue;
    const pricingMode = 'retail';
    const key = productId + '_' + pricingMode;
    const ex = out.find((x) => x.key === key);
    if (ex) { ex.quantity += qty; continue; }
    const p = db.prepare('SELECT id, name, price, brand_name, image, slug FROM products WHERE id = ?').get(productId);
    if (!p) continue;
    // Never trust client-supplied price/name: always use database values.
    const price = p.price;
    out.push({
      key, id: productId,
      name: p.name,
      price,
      pricingMode, quantity: qty,
      brandName: p.brand_name || '',
      image: p.image || '',
      slug: p.slug || '',
    });
  }
  return out;
}

function cartStockFor(productId) {
  const p = db.prepare('SELECT id, name, in_stock, stock_count FROM products WHERE id = ?').get(productId);
  if (!p) return { missing: true };
  const stock = p.stock_count != null ? p.stock_count : (p.in_stock ? 50 : 0);
  return { row: p, stock };
}

// Returns null when OK, otherwise { status, error, available }.
// Never trusts client-supplied stock/availability: always reads the database.
// When order.allow_oos=1, out-of-stock products may be purchased (stock
// check skipped); otherwise OOS/insufficient stock is rejected.
// Per-line min/max quantity from purchase settings is always enforced.
function checkCartStock(items) {
  const ps = getPurchaseSettings();
  for (const it of (items || [])) {
    const qErr = checkPurchaseQty(it.quantity, null);
    if (qErr) {
      const s = cartStockFor(it.id);
      const nm = (!s.missing && s.row) ? s.row.name : ('#' + it.id);
      return { status: qErr.status, error: checkPurchaseQty(it.quantity, nm).error };
    }
    const s = cartStockFor(it.id);
    if (s.missing) return { status: 404, error: 'Product not found: ' + it.id };
    if (ps.allowOos) continue;
    if (!s.row.in_stock || s.stock <= 0) {
      return { status: 409, error: 'Product out of stock: ' + s.row.name, available: 0 };
    }
    if (it.quantity > s.stock) {
      return { status: 409, error: 'Insufficient stock for ' + s.row.name + ': only ' + s.stock + ' available', available: s.stock };
    }
  }
  return null;
}
function requireCartAuth(req, res) {
  const auth = getAuthUser(req);
  if (!auth) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  return auth;
}

api.get('/cart', (req, res) => {
  const auth = requireCartAuth(req, res);
  if (!auth) return;
  res.json({ items: getCartItems(auth.row.id) });
});

api.post('/cart/items', (req, res) => {
  const auth = requireCartAuth(req, res);
  if (!auth) return;
  const b = req.body || {};
  const productId = Number(b.productId ?? b.id);
  const quantity = Math.max(1, Math.round(Number(b.quantity) || 1));
  if (!productId) return res.status(400).json({ error: 'productId is required' });
  const pricingMode = 'retail';
  const items = normalizeCartItems([...getCartItems(auth.row.id),
    { productId, quantity, pricingMode, price: b.price, name: b.name, brandName: b.brandName, image: b.image, slug: b.slug }]);
  if (!items.some((x) => x.id === productId)) return res.status(404).json({ error: 'Product not found: ' + productId });
  const stockErr = checkCartStock(items);
  if (stockErr) return res.status(stockErr.status).json({ error: stockErr.error, available: stockErr.available });
  setCartItems(auth.row.id, items);
  res.status(201).json({ items });
});

api.patch('/cart/items/:key', (req, res) => {
  const auth = requireCartAuth(req, res);
  if (!auth) return;
  const items = getCartItems(auth.row.id);
  const item = items.find((x) => x.key === req.params.key);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const qty = Math.round(Number(req.body?.quantity));
  if (!Number.isFinite(qty) || qty < 0) return res.status(400).json({ error: 'quantity must be >= 0' });
  if (qty === 0) {
    setCartItems(auth.row.id, items.filter((x) => x.key !== req.params.key));
    return res.json({ items: getCartItems(auth.row.id) });
  }
  if (!getPurchaseSettings().allowQtyEdit) {
    return res.status(403).json({ error: 'ویرایش تعداد در سبد خرید توسط فروشگاه غیرفعال شده است.' });
  }
  item.quantity = qty;
  const stockErr = checkCartStock(items);
  if (stockErr) return res.status(stockErr.status).json({ error: stockErr.error, available: stockErr.available });
  setCartItems(auth.row.id, items);
  res.json({ items });
});

api.delete('/cart/items/:key', (req, res) => {
  const auth = requireCartAuth(req, res);
  if (!auth) return;
  const items = getCartItems(auth.row.id);
  if (!items.some((x) => x.key === req.params.key)) return res.status(404).json({ error: 'Item not found' });
  setCartItems(auth.row.id, items.filter((x) => x.key !== req.params.key));
  res.json({ items: getCartItems(auth.row.id) });
});

api.delete('/cart', (req, res) => {
  const auth = requireCartAuth(req, res);
  if (!auth) return;
  setCartItems(auth.row.id, []);
  res.json({ items: [] });
});

api.post('/cart/merge', (req, res) => {
  const auth = requireCartAuth(req, res);
  if (!auth) return;
  const guestItems = Array.isArray(req.body?.items) ? req.body.items : [];
  const items = normalizeCartItems([...getCartItems(auth.row.id), ...guestItems]);
  const stockErr = checkCartStock(items);
  if (stockErr) return res.status(stockErr.status).json({ error: stockErr.error, available: stockErr.available });
  setCartItems(auth.row.id, items);
  res.json({ items });
});

api.put('/cart', (req, res) => {
  const auth = requireCartAuth(req, res);
  if (!auth) return;
  const items = normalizeCartItems(Array.isArray(req.body?.items) ? req.body.items : []);
  if (!getPurchaseSettings().allowQtyEdit) {
    const cur = new Map(getCartItems(auth.row.id).map((x) => [x.key, x.quantity]));
    const changed = items.some((x) => cur.has(x.key) && cur.get(x.key) !== x.quantity);
    if (changed) return res.status(403).json({ error: 'ویرایش تعداد در سبد خرید توسط فروشگاه غیرفعال شده است.' });
  }
  const stockErr2 = checkCartStock(items);
  if (stockErr2) return res.status(stockErr2.status).json({ error: stockErr2.error, available: stockErr2.available });
  setCartItems(auth.row.id, items);
  res.json({ items });
});

// ── Customer wishlist (per authenticated user) ──
function getWishlistItems(userId) {
  db.exec(`CREATE TABLE IF NOT EXISTS wishlists (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    items_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const row = db.prepare('SELECT items_json FROM wishlists WHERE user_id = ?').get(userId);
  if (!row) return [];
  try {
    const items = JSON.parse(row.items_json || '[]');
    return Array.isArray(items) ? items : [];
  } catch (_) { return []; }
}

function setWishlistItems(userId, items) {
  db.prepare(`INSERT INTO wishlists (user_id, items_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET items_json = excluded.items_json, updated_at = datetime('now')`)
    .run(userId, JSON.stringify(items || []));
}

function normalizeWishlistItems(items) {
  const out = [];
  const seen = new Set();
  for (const it of (items || [])) {
    const productId = Number(it && typeof it === 'object' ? (it.productId ?? it.id) : it);
    if (!Number.isInteger(productId) || productId <= 0 || seen.has(productId)) continue;
    const p = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
    if (!p) continue;
    seen.add(productId);
    out.push(productId);
  }
  return out;
}

function requireWishlistAuth(req, res) {
  const auth = getAuthUser(req);
  if (!auth) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  return auth;
}

api.get('/wishlist', (req, res) => {
  const auth = requireWishlistAuth(req, res);
  if (!auth) return;
  res.json({ items: getWishlistItems(auth.row.id) });
});

api.post('/wishlist/items', (req, res) => {
  const auth = requireWishlistAuth(req, res);
  if (!auth) return;
  const productId = Number(req.body?.productId ?? req.body?.id);
  if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'productId is required' });
  const exists = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!exists) return res.status(404).json({ error: 'Product not found' });
  const items = normalizeWishlistItems([...getWishlistItems(auth.row.id), productId]);
  setWishlistItems(auth.row.id, items);
  res.status(201).json({ items });
});

api.delete('/wishlist/items/:productId', (req, res) => {
  const auth = requireWishlistAuth(req, res);
  if (!auth) return;
  const productId = Number(req.params.productId);
  const items = getWishlistItems(auth.row.id);
  if (!items.includes(productId)) return res.status(404).json({ error: 'Item not found' });
  const next = items.filter((id) => id !== productId);
  setWishlistItems(auth.row.id, next);
  res.json({ items: next });
});

api.delete('/wishlist', (req, res) => {
  const auth = requireWishlistAuth(req, res);
  if (!auth) return;
  setWishlistItems(auth.row.id, []);
  res.json({ items: [] });
});

api.post('/wishlist/merge', (req, res) => {
  const auth = requireWishlistAuth(req, res);
  if (!auth) return;
  const guestItems = Array.isArray(req.body?.items) ? req.body.items : [];
  const items = normalizeWishlistItems([...getWishlistItems(auth.row.id), ...guestItems]);
  setWishlistItems(auth.row.id, items);
  res.json({ items });
});

api.put('/wishlist', (req, res) => {
  const auth = requireWishlistAuth(req, res);
  if (!auth) return;
  const items = normalizeWishlistItems(Array.isArray(req.body?.items) ? req.body.items : []);
  setWishlistItems(auth.row.id, items);
  res.json({ items });
});

// ── Recently viewed (per authenticated user, most-recent-first) ──
const RECENT_MAX = 20;

function getRecentItems(userId) {
  db.exec(`CREATE TABLE IF NOT EXISTS recently_viewed (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    items_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const row = db.prepare('SELECT items_json FROM recently_viewed WHERE user_id = ?').get(userId);
  if (!row) return [];
  try {
    const items = JSON.parse(row.items_json || '[]');
    return Array.isArray(items) ? items : [];
  } catch (_) { return []; }
}

function setRecentItems(userId, items) {
  db.prepare(`INSERT INTO recently_viewed (user_id, items_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET items_json = excluded.items_json, updated_at = datetime('now')`)
    .run(userId, JSON.stringify(items || []));
}

function normalizeRecentItems(items) {
  const out = [];
  const seen = new Set();
  for (const it of (items || [])) {
    const productId = Number(it && typeof it === 'object' ? (it.productId ?? it.id) : it);
    if (!Number.isInteger(productId) || productId <= 0 || seen.has(productId)) continue;
    const p = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
    if (!p) continue;
    seen.add(productId);
    out.push(productId);
  }
  return out.slice(0, RECENT_MAX);
}

function requireRecentAuth(req, res) {
  const auth = getAuthUser(req);
  if (!auth) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  return auth;
}

api.get('/recently-viewed', (req, res) => {
  const auth = requireRecentAuth(req, res);
  if (!auth) return;
  res.json({ items: getRecentItems(auth.row.id) });
});

api.post('/recently-viewed/items', (req, res) => {
  const auth = requireRecentAuth(req, res);
  if (!auth) return;
  const productId = Number(req.body?.productId ?? req.body?.id);
  if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'productId is required' });
  const exists = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!exists) return res.status(404).json({ error: 'Product not found' });
  const prev = getRecentItems(auth.row.id).filter((id) => id !== productId);
  const items = [productId, ...prev].slice(0, RECENT_MAX);
  setRecentItems(auth.row.id, items);
  res.status(201).json({ items });
});

api.delete('/recently-viewed', (req, res) => {
  const auth = requireRecentAuth(req, res);
  if (!auth) return;
  setRecentItems(auth.row.id, []);
  res.json({ items: [] });
});

api.post('/recently-viewed/merge', (req, res) => {
  const auth = requireRecentAuth(req, res);
  if (!auth) return;
  const guestItems = normalizeRecentItems(Array.isArray(req.body?.items) ? req.body.items : []);
  // Guest list is most-recent-first; replay oldest-first so recency order is preserved.
  let items = getRecentItems(auth.row.id);
  for (let i = guestItems.length - 1; i >= 0; i--) {
    const id = guestItems[i];
    items = [id, ...items.filter((x) => x !== id)].slice(0, RECENT_MAX);
  }
  setRecentItems(auth.row.id, items);
  res.json({ items });
});

api.put('/recently-viewed', (req, res) => {
  const auth = requireRecentAuth(req, res);
  if (!auth) return;
  const items = normalizeRecentItems(Array.isArray(req.body?.items) ? req.body.items : []);
  setRecentItems(auth.row.id, items);
  res.json({ items });
});

// ── Product reviews (authenticated CRUD for own reviews; public product listing) ──
// Moderation columns + questions table are ensured at runtime so existing
// databases pick them up without a manual migration run.
function ensureReviewModeration() {
  try {
    const rcols = db.prepare('PRAGMA table_info(reviews)').all().map((c) => c.name);
    if (rcols.indexOf('status') === -1) db.exec("ALTER TABLE reviews ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'");
    if (rcols.indexOf('reply') === -1) db.exec("ALTER TABLE reviews ADD COLUMN reply TEXT NOT NULL DEFAULT ''");
  } catch (_) {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author TEXT NOT NULL DEFAULT '',
      question TEXT NOT NULL DEFAULT '',
      reply TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      date TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_questions_product ON questions(product_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_questions_user ON questions(user_id)');
  } catch (_) {}
}
try { ensureReviewModeration(); } catch (_) {}
function mapReview(r) {
  if (!r) return r;
  return {
    id: r.id, productId: r.product_id, userId: r.user_id, author: r.author,
    rating: r.rating, title: r.title || '', text: r.text || '', date: r.date || '',
    status: r.status || 'approved', reply: r.reply || '',
  };
}
function mapQuestion(r) {
  if (!r) return r;
  return {
    id: r.id, productId: r.product_id, userId: r.user_id, author: r.author,
    question: r.question || '', reply: r.reply || '',
    status: r.status || 'pending', date: r.date || '',
  };
}
const VALID_MOD_STATUSES = new Set(['pending', 'approved', 'rejected']);

function requireReviewAuth(req, res) {
  const auth = getAuthUser(req);
  if (!auth) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  return auth;
}

function validateReviewInput(b) {
  const productId = Number(b.productId ?? b.product_id);
  if (!Number.isInteger(productId) || productId <= 0) return { error: 'productId is required' };
  const rating = Math.round(Number(b.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return { error: 'rating must be 1-5' };
  const text = String(b.text ?? '').trim();
  if (!text) return { error: 'text is required' };
  if (text.length > 2000) return { error: 'text is too long' };
  return {
    values: {
      productId, rating, text,
      title: String(b.title ?? '').trim().slice(0, 200),
    },
  };
}

// Public: list approved reviews for a product (DB rows; seed reviews stay frontend-only).
api.get('/products/:id/reviews', (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'Invalid product id' });
  const exists = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!exists) return res.status(404).json({ error: 'Product not found' });
  try { ensureReviewModeration(); } catch (_) {}
  const rows = db.prepare("SELECT * FROM reviews WHERE product_id = ? AND COALESCE(status, 'approved') = 'approved' ORDER BY id DESC").all(productId);
  res.json(rows.map(mapReview));
});

// Authenticated: list own reviews (optionally ?productId=).
api.get('/reviews/me', (req, res) => {
  const auth = requireReviewAuth(req, res);
  if (!auth) return;
  const pid = req.query.productId != null ? Number(req.query.productId) : null;
  if (pid != null && (!Number.isInteger(pid) || pid <= 0)) return res.status(400).json({ error: 'Invalid productId' });
  const rows = pid != null
    ? db.prepare('SELECT * FROM reviews WHERE user_id = ? AND product_id = ? ORDER BY id DESC').all(auth.row.id, pid)
    : db.prepare('SELECT * FROM reviews WHERE user_id = ? ORDER BY id DESC').all(auth.row.id);
  res.json(rows.map(mapReview));
});

api.post('/reviews', reviewLimiter, (req, res) => {
  const auth = requireReviewAuth(req, res);
  if (!auth) return;
  const { values, error } = validateReviewInput(req.body || {});
  if (error) return res.status(400).json({ error });
  const exists = db.prepare('SELECT id FROM products WHERE id = ?').get(values.productId);
  if (!exists) return res.status(404).json({ error: 'Product not found' });
  const author = ((auth.row.first_name || '') + ' ' + (auth.row.last_name || '')).trim()
    || auth.row.mobile || 'کاربر';
  const date = new Date().toISOString().slice(0, 10);
  const info = db.prepare(`INSERT INTO reviews (product_id, user_id, author, rating, title, text, date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`)
    .run(values.productId, auth.row.id, author, values.rating, values.title, values.text, date);
  res.status(201).json(mapReview(db.prepare('SELECT * FROM reviews WHERE id = ?').get(info.lastInsertRowid)));
});

api.put('/reviews/:id', (req, res) => {
  const auth = requireReviewAuth(req, res);
  if (!auth) return;
  const cur = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Review not found' });
  if (cur.user_id !== auth.row.id) return res.status(403).json({ error: 'Forbidden' });
  const b = req.body || {};
  const rating = b.rating !== undefined ? Math.round(Number(b.rating)) : cur.rating;
  if (b.rating !== undefined && (!Number.isFinite(rating) || rating < 1 || rating > 5)) {
    return res.status(400).json({ error: 'rating must be 1-5' });
  }
  const text = b.text !== undefined ? String(b.text).trim() : cur.text;
  if (b.text !== undefined && !text) return res.status(400).json({ error: 'text is required' });
  if (text.length > 2000) return res.status(400).json({ error: 'text is too long' });
  const title = b.title !== undefined ? String(b.title).trim().slice(0, 200) : cur.title;
  db.prepare("UPDATE reviews SET rating = ?, title = ?, text = ?, updated_at = datetime('now') WHERE id = ?")
    .run(rating, title, text, req.params.id);
  res.json(mapReview(db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id)));
});

api.delete('/reviews/:id', (req, res) => {
  const auth = requireReviewAuth(req, res);
  if (!auth) return;
  const cur = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Review not found' });
  if (cur.user_id !== auth.row.id) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Admin reviews (list all, moderate, reply, delete any) ──
api.get('/admin/reviews', requireAdmin, (req, res) => {
  try { ensureReviewModeration(); } catch (_) {}
  const { productId, userId, q, rating, status, limit = 100, offset = 0 } = req.query;
  const where = [];
  const params = [];
  if (productId) { where.push('r.product_id = ?'); params.push(Number(productId)); }
  if (userId) { where.push('r.user_id = ?'); params.push(String(userId)); }
  if (rating) { where.push('r.rating = ?'); params.push(Number(rating)); }
  if (status && VALID_MOD_STATUSES.has(String(status))) { where.push("COALESCE(r.status, 'approved') = ?"); params.push(String(status)); }
  if (q) { where.push('(r.text LIKE ? OR r.title LIKE ? OR r.author LIKE ? OR p.name LIKE ?)'); const like=`%${q}%`; params.push(like,like,like,like); }
  const sql = `SELECT r.*, p.name AS product_name FROM reviews r LEFT JOIN products p ON p.id=r.product_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY r.id DESC LIMIT ? OFFSET ?`;
  const rows = db.prepare(sql).all(...params, Math.min(+limit||100,500), Math.max(+offset||0,0));
  const total = db.prepare(`SELECT COUNT(*) AS n FROM reviews r LEFT JOIN products p ON p.id=r.product_id ${where.length?'WHERE '+where.join(' AND '):''}`).get(...params).n;
  res.json({ total, items: rows.map(r=>({ ...mapReview(r), productName: r.product_name || '' })) });
});
// Admin: approve/reject and/or reply to a review.
api.patch('/admin/reviews/:id', requireAdmin, (req, res) => {
  try { ensureReviewModeration(); } catch (_) {}
  const cur = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Review not found' });
  const b = req.body || {};
  let status = cur.status || 'approved';
  if (b.status !== undefined) {
    if (!VALID_MOD_STATUSES.has(String(b.status))) return res.status(400).json({ error: 'Invalid status' });
    status = String(b.status);
  }
  const reply = b.reply !== undefined ? String(b.reply).slice(0, 2000) : (cur.reply || '');
  db.prepare("UPDATE reviews SET status = ?, reply = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, reply, req.params.id);
  const updated = db.prepare(`SELECT r.*, p.name AS product_name FROM reviews r LEFT JOIN products p ON p.id=r.product_id WHERE r.id = ?`).get(req.params.id);
  res.json({ ...mapReview(updated), productName: updated.product_name || '' });
});
api.delete('/admin/reviews/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Review not found' });
  res.json({ ok: true });
});

// ── Product questions (customer Q&A; admin-moderated, same pattern as reviews) ──
// Authenticated customers can ask; public listing shows approved only.
api.post('/questions', reviewLimiter, (req, res) => {
  try { ensureReviewModeration(); } catch (_) {}
  const auth = requireReviewAuth(req, res);
  if (!auth) return;
  const b = req.body || {};
  const productId = Number(b.productId ?? b.product_id);
  if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'productId is required' });
  const question = String(b.question ?? b.text ?? '').trim();
  if (!question) return res.status(400).json({ error: 'question is required' });
  if (question.length > 2000) return res.status(400).json({ error: 'question is too long' });
  const exists = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!exists) return res.status(404).json({ error: 'Product not found' });
  const author = ((auth.row.first_name || '') + ' ' + (auth.row.last_name || '')).trim()
    || auth.row.mobile || 'کاربر';
  const date = new Date().toISOString().slice(0, 10);
  const info = db.prepare(`INSERT INTO questions (product_id, user_id, author, question, date, status)
    VALUES (?, ?, ?, ?, ?, 'pending')`)
    .run(productId, auth.row.id, author, question.slice(0, 2000), date);
  res.status(201).json(mapQuestion(db.prepare('SELECT * FROM questions WHERE id = ?').get(info.lastInsertRowid)));
});
api.get('/products/:id/questions', (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'Invalid product id' });
  const exists = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!exists) return res.status(404).json({ error: 'Product not found' });
  try { ensureReviewModeration(); } catch (_) {}
  const rows = db.prepare("SELECT * FROM questions WHERE product_id = ? AND COALESCE(status, 'pending') = 'approved' ORDER BY id DESC").all(productId);
  res.json(rows.map(mapQuestion));
});
// ── Admin questions (list all, moderate, reply, delete any) ──
api.get('/admin/questions', requireAdmin, (req, res) => {
  try { ensureReviewModeration(); } catch (_) {}
  const { productId, userId, q, status, limit = 100, offset = 0 } = req.query;
  const where = [];
  const params = [];
  if (productId) { where.push('t.product_id = ?'); params.push(Number(productId)); }
  if (userId) { where.push('t.user_id = ?'); params.push(String(userId)); }
  if (status && VALID_MOD_STATUSES.has(String(status))) { where.push("COALESCE(t.status, 'pending') = ?"); params.push(String(status)); }
  if (q) { where.push('(t.question LIKE ? OR t.reply LIKE ? OR t.author LIKE ? OR p.name LIKE ?)'); const like=`%${q}%`; params.push(like,like,like,like); }
  const sql = `SELECT t.*, p.name AS product_name FROM questions t LEFT JOIN products p ON p.id=t.product_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY t.id DESC LIMIT ? OFFSET ?`;
  const rows = db.prepare(sql).all(...params, Math.min(+limit||100,500), Math.max(+offset||0,0));
  const total = db.prepare(`SELECT COUNT(*) AS n FROM questions t LEFT JOIN products p ON p.id=t.product_id ${where.length?'WHERE '+where.join(' AND '):''}`).get(...params).n;
  res.json({ total, items: rows.map(r=>({ ...mapQuestion(r), productName: r.product_name || '' })) });
});
api.patch('/admin/questions/:id', requireAdmin, (req, res) => {
  try { ensureReviewModeration(); } catch (_) {}
  const cur = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Question not found' });
  const b = req.body || {};
  let status = cur.status || 'pending';
  if (b.status !== undefined) {
    if (!VALID_MOD_STATUSES.has(String(b.status))) return res.status(400).json({ error: 'Invalid status' });
    status = String(b.status);
  }
  const reply = b.reply !== undefined ? String(b.reply).slice(0, 2000) : (cur.reply || '');
  db.prepare("UPDATE questions SET status = ?, reply = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, reply, req.params.id);
  const updated = db.prepare(`SELECT t.*, p.name AS product_name FROM questions t LEFT JOIN products p ON p.id=t.product_id WHERE t.id = ?`).get(req.params.id);
  res.json({ ...mapQuestion(updated), productName: updated.product_name || '' });
});
api.delete('/admin/questions/:id', requireAdmin, (req, res) => {
  try { ensureReviewModeration(); } catch (_) {}
  const info = db.prepare('DELETE FROM questions WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Question not found' });
  res.json({ ok: true });
});

// ── In-app notifications (admin-created; no SMS/push) ──
const VALID_NOTIF_TYPES = new Set(['info', 'success', 'warning', 'error', 'promo']);
function ensureNotificationsTable() {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'info',
      target TEXT NOT NULL DEFAULT 'all',
      is_active INTEGER NOT NULL DEFAULT 1,
      starts_at TEXT NOT NULL DEFAULT '',
      ends_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_target ON notifications(target)');
    db.exec(`CREATE TABLE IF NOT EXISTS notification_reads (
      notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (notification_id, user_id)
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id)');
  } catch (_) {}
}
try { ensureNotificationsTable(); try { db.exec("ALTER TABLE notifications ADD COLUMN image_url TEXT NOT NULL DEFAULT ''"); } catch(_){} try { db.exec("ALTER TABLE notifications ADD COLUMN link_type TEXT NOT NULL DEFAULT ''"); } catch(_){} try { db.exec("ALTER TABLE notifications ADD COLUMN link_value TEXT NOT NULL DEFAULT ''"); } catch(_){} try { db.exec("ALTER TABLE notifications ADD COLUMN product_id TEXT NOT NULL DEFAULT ''"); } catch(_){} try { db.exec("ALTER TABLE notifications ADD COLUMN channel TEXT NOT NULL DEFAULT 'inapp'"); } catch(_){} } catch (_) {}
function mapNotification(r, readCount) {
  if (!r) return r;
  return {
    id: r.id, title: r.title || '', message: r.message || '',
    type: VALID_NOTIF_TYPES.has(r.type) ? r.type : 'info',
    target: r.target || 'all', isActive: Number(r.is_active) === 1,
    startsAt: r.starts_at || '', endsAt: r.ends_at || '',
    createdAt: r.created_at || null, updatedAt: r.updated_at || null,
    readCount: readCount != null ? Number(readCount) : undefined,
    imageUrl: r.image_url || '', linkType: r.link_type || '', linkValue: r.link_value || '', productId: r.product_id || '', channel: r.channel || 'inapp',
  };
}
const VALID_NOTIF_LINK_TYPES = new Set(['', 'product', 'category', 'custom']);
const VALID_NOTIF_CHANNELS = new Set(['inapp', 'sms', 'both']);
function notifInput(b, isCreate) {
  const out = {};
  if (b.title !== undefined) out.title = String(b.title).trim().slice(0, 200);
  if (b.message !== undefined) out.message = String(b.message).trim().slice(0, 2000);
  if (b.imageUrl !== undefined || b.image_url !== undefined) out.image_url = String(b.imageUrl ?? b.image_url ?? '').trim().slice(0, 2000);
  if (b.linkType !== undefined || b.link_type !== undefined) {
    const lt = String(b.linkType ?? b.link_type ?? '').trim();
    if (!VALID_NOTIF_LINK_TYPES.has(lt)) return { error: 'Invalid linkType' };
    out.link_type = lt;
  }
  if (b.linkValue !== undefined || b.link_value !== undefined) out.link_value = String(b.linkValue ?? b.link_value ?? '').trim().slice(0, 2000);
  if (b.productId !== undefined || b.product_id !== undefined) out.product_id = String(b.productId ?? b.product_id ?? '').trim().slice(0, 100);
  if (out.link_type === 'product' && out.product_id) {
    const pr = db.prepare('SELECT id FROM products WHERE id = ?').get(out.product_id);
    if (!pr) return { error: 'Product not found' };
  }
  if (out.link_type && !out.link_type) { out.link_value = ''; out.product_id = ''; }
  if (out.link_type !== 'product') out.product_id = '';
  if (b.channel !== undefined) {
    const ch = String(b.channel).trim() || 'inapp';
    if (!VALID_NOTIF_CHANNELS.has(ch)) return { error: 'Invalid channel' };
    out.channel = ch;
  }
  if (b.type !== undefined) {
    if (!VALID_NOTIF_TYPES.has(String(b.type))) return { error: 'Invalid type' };
    out.type = String(b.type);
  }
  if (b.target !== undefined) {
    const t = String(b.target).trim() || 'all';
    if (t !== 'all') {
      const u = db.prepare('SELECT id FROM users WHERE id = ?').get(t);
      if (!u) return { error: 'Target user not found' };
    }
    out.target = t;
  }
  if (b.isActive !== undefined) out.is_active = b.isActive ? 1 : 0;
  if (b.is_active !== undefined) out.is_active = b.is_active ? 1 : 0;
  if (b.startsAt !== undefined) out.starts_at = String(b.startsAt || '').trim().slice(0, 32);
  if (b.starts_at !== undefined) out.starts_at = String(b.starts_at || '').trim().slice(0, 32);
  if (b.endsAt !== undefined) out.ends_at = String(b.endsAt || '').trim().slice(0, 32);
  if (b.ends_at !== undefined) out.ends_at = String(b.ends_at || '').trim().slice(0, 32);
  if (out.starts_at && out.ends_at) {
    var sd = new Date(out.starts_at); var ed = new Date(out.ends_at);
    if (isFinite(sd.getTime()) && isFinite(ed.getTime()) && sd.getTime() >= ed.getTime()) {
      return { error: 'End date must be after start date' };
    }
  }
  if (isCreate) {
    if (!out.title) return { error: 'title is required' };
    if (!out.message) return { error: 'message is required' };
  } else if (out.title !== undefined && !out.title) {
    return { error: 'title is required' };
  }
  return { values: out };
}
function readNotifRow(id) {
  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
  if (!row) return null;
  const rc = db.prepare('SELECT COUNT(*) AS n FROM notification_reads WHERE notification_id = ?').get(id).n;
  return mapNotification(row, rc);
}
// Admin: list (search title/message, filter type/active state/target) + pagination.
api.get('/admin/notifications', requireAdmin, (req, res) => {
  try { ensureNotificationsTable(); } catch (_) {}
  const { q, type, active, target, limit = 20, offset = 0 } = req.query;
  const where = [];
  const params = [];
  if (q) { where.push('(title LIKE ? OR message LIKE ?)'); const like = `%${q}%`; params.push(like, like); }
  if (type && VALID_NOTIF_TYPES.has(String(type))) { where.push('n.type = ?'); params.push(String(type)); }
  if (active === '1') where.push('n.is_active = 1');
  else if (active === '0') where.push('n.is_active = 0');
  if (target === 'all') where.push("n.target = 'all'");
  else if (target === 'user') where.push("n.target != 'all'");
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 500);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const rows = db.prepare(`SELECT n.*, (SELECT COUNT(*) FROM notification_reads r WHERE r.notification_id = n.id) AS read_count
    FROM notifications n ${clause} ORDER BY n.id DESC LIMIT ? OFFSET ?`).all(...params, lim, off);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM notifications n ${clause}`).get(...params).n;
  res.json({ total, items: rows.map((r) => mapNotification(r, r.read_count)) });
});
// Admin: detail (full content + readers).
api.get('/admin/notifications/:id', requireAdmin, (req, res) => {
  try { ensureNotificationsTable(); } catch (_) {}
  const item = readNotifRow(req.params.id);
  if (!item) return res.status(404).json({ error: 'Notification not found' });
  const readers = db.prepare(`SELECT r.user_id AS userId, r.read_at AS readAt,
      TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS name
    FROM notification_reads r LEFT JOIN users u ON u.id = r.user_id
    WHERE r.notification_id = ? ORDER BY r.read_at DESC LIMIT 200`).all(req.params.id);
  let targetUser = null;
  if (item.target !== 'all') {
    const u = db.prepare('SELECT id, first_name, last_name, mobile FROM users WHERE id = ?').get(item.target);
    if (u) targetUser = { id: u.id, name: ((u.first_name || '') + ' ' + (u.last_name || '')).trim(), mobile: u.mobile };
  }
  res.json({ ...item, readers, targetUser });
});
// Admin: create.
api.post('/admin/notifications', requireAdmin, (req, res) => {
  try { ensureNotificationsTable(); } catch (_) {}
  const { values, error } = notifInput(req.body || {}, true);
  if (error) return res.status(400).json({ error });
  const info = db.prepare(`INSERT INTO notifications (title, message, type, target, is_active, starts_at, ends_at, image_url, link_type, link_value, product_id, channel)
    VALUES (@title, @message, @type, @target, @is_active, @starts_at, @ends_at, @image_url, @link_type, @link_value, @product_id, @channel)`).run({
    title: values.title, message: values.message, type: values.type || 'info',
    target: values.target || 'all', is_active: values.is_active ?? 1,
    starts_at: values.starts_at || '', ends_at: values.ends_at || '',
    image_url: values.image_url || '', link_type: values.link_type || '', link_value: values.link_value || '', product_id: values.product_id || '',
    channel: values.channel || 'inapp',
  });
  res.status(201).json(readNotifRow(info.lastInsertRowid));
});
// Admin: full edit.
api.put('/admin/notifications/:id', requireAdmin, (req, res) => {
  try { ensureNotificationsTable(); } catch (_) {}
  const cur = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Notification not found' });
  const { values, error } = notifInput(req.body || {}, false);
  if (error) return res.status(400).json({ error });
  const merged = {
    title: values.title ?? cur.title, message: values.message ?? cur.message,
    type: values.type ?? cur.type, target: values.target ?? cur.target,
    is_active: values.is_active ?? cur.is_active,
    starts_at: values.starts_at ?? cur.starts_at, ends_at: values.ends_at ?? cur.ends_at,
    image_url: values.image_url ?? cur.image_url, link_type: values.link_type ?? cur.link_type, link_value: values.link_value ?? cur.link_value, product_id: values.product_id ?? cur.product_id,
  };
  if (merged.starts_at && merged.ends_at) {
    var msd = new Date(merged.starts_at); var med = new Date(merged.ends_at);
    if (isFinite(msd.getTime()) && isFinite(med.getTime()) && msd.getTime() >= med.getTime()) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }
  }
  db.prepare(`UPDATE notifications SET title=@title, message=@message, type=@type, target=@target,
    is_active=@is_active, starts_at=@starts_at, ends_at=@ends_at, image_url=@image_url, link_type=@link_type, link_value=@link_value, product_id=@product_id, updated_at=datetime('now') WHERE id=@id`)
    .run({ ...merged, id: req.params.id });
  res.json(readNotifRow(req.params.id));
});
// Admin: delete (reads cascade).
api.delete('/admin/notifications/:id', requireAdmin, (req, res) => {
  try { ensureNotificationsTable(); } catch (_) {}
  db.prepare('DELETE FROM notification_reads WHERE notification_id = ?').run(req.params.id);
  const info = db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Notification not found' });
  res.json({ ok: true });
});

// ── SEO (global via settings seo.* + per-item overrides in seo_meta) ──
function ensureSeoTable() {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS seo_meta (
      scope TEXT NOT NULL,
      ref TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      noindex INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (scope, ref)
    )`);
  } catch (_) {}
}
try { ensureSeoTable(); } catch (_) {}
const VALID_SEO_SCOPES = new Set(['page', 'product', 'article']);
function seoFor(scope, ref) {
  try {
    ensureSeoTable();
    const r = db.prepare('SELECT title, description, noindex FROM seo_meta WHERE scope = ? AND ref = ?').get(scope, String(ref));
    if (!r) return { title: '', description: '', noindex: false };
    return { title: r.title || '', description: r.description || '', noindex: Number(r.noindex) === 1 };
  } catch (_) { return { title: '', description: '', noindex: false }; }
}
// Public: single per-page lookup (static page keys + site_pages slugs share scope 'page').
api.get('/seo/page', (req, res) => {
  const key = String(req.query.key || '').trim().slice(0, 80);
  if (!key) return res.status(400).json({ error: 'key is required' });
  res.json({ key, ...seoFor('page', key) });
});
// Admin: list overrides with names (scope filter + search), paginated.
api.get('/admin/seo/items', requireAdmin, (req, res) => {
  try { ensureSeoTable(); } catch (_) {}
  const scope = String(req.query.scope || '').trim();
  const q = String(req.query.q || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  if (scope === 'product') {
    const where = q ? 'AND (p.name LIKE ? OR p.slug LIKE ?)' : '';
    const params = q ? [`%${q}%`, `%${q}%`] : [];
    const rows = db.prepare(`SELECT p.id, p.name, p.slug, s.title, s.description, s.noindex
      FROM products p LEFT JOIN seo_meta s ON s.scope = 'product' AND s.ref = CAST(p.id AS TEXT)
      WHERE 1 = 1 ${where} ORDER BY p.id LIMIT ? OFFSET ?`).all(...params, limit, offset);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM products p WHERE 1 = 1 ${where}`).get(...params).n;
    return res.json({ total, items: rows.map((r) => ({ scope: 'product', ref: String(r.id), name: r.name, slug: r.slug, title: r.title || '', description: r.description || '', noindex: Number(r.noindex) === 1 })) });
  }
  if (scope === 'article') {
    const where = q ? 'AND (a.title LIKE ? OR a.slug LIKE ?)' : '';
    const params = q ? [`%${q}%`, `%${q}%`] : [];
    const rows = db.prepare(`SELECT a.id, a.title AS name, a.slug, s.title AS seo_title, s.description, s.noindex
      FROM articles a LEFT JOIN seo_meta s ON s.scope = 'article' AND s.ref = CAST(a.id AS TEXT)
      WHERE 1 = 1 ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM articles a WHERE 1 = 1 ${where}`).get(...params).n;
    return res.json({ total, items: rows.map((r) => ({ scope: 'article', ref: String(r.id), name: r.name, slug: r.slug, title: r.seo_title || '', description: r.description || '', noindex: Number(r.noindex) === 1 })) });
  }
  // scope 'page': static keys + site_pages slugs.
  const STATIC_PAGES = [
    ['home', 'صفحه اصلی'], ['shop', 'فروشگاه'], ['product', 'صفحه محصول (پیش‌فرض)'],
    ['category', 'صفحه دسته‌بندی'], ['brands', 'برندها'], ['articles', 'مقالات'],
    ['article', 'صفحه مقاله (پیش‌فرض)'], ['cart', 'سبد خرید'], ['checkout', 'تسویه‌حساب'],
    ['account', 'حساب کاربری'],
  ];
  try {
    const pages = db.prepare('SELECT slug, title FROM site_pages ORDER BY slug').all();
    pages.forEach((p) => STATIC_PAGES.push([p.slug, p.title || p.slug]));
  } catch (_) {}
  const filtered = STATIC_PAGES.filter(([ref, name]) => !q || ref.includes(q) || String(name).includes(q));
  const total = filtered.length;
  const slice = filtered.slice(offset, offset + limit);
  const items = slice.map(([ref, name]) => {
    const s = seoFor('page', ref);
    return { scope: 'page', ref, name, title: s.title, description: s.description, noindex: s.noindex };
  });
  res.json({ total, items });
});
// Admin: upsert a single override (empty title+description+noindex=0 deletes the row).
api.put('/admin/seo/items', requireAdmin, (req, res) => {
  try { ensureSeoTable(); } catch (_) {}
  const b = req.body || {};
  const scope = String(b.scope || '').trim();
  const ref = String(b.ref || '').trim().slice(0, 80);
  if (!VALID_SEO_SCOPES.has(scope)) return res.status(400).json({ error: 'Invalid scope' });
  if (!ref) return res.status(400).json({ error: 'ref is required' });
  const title = String(b.title || '').trim().slice(0, 200);
  const description = String(b.description || '').trim().slice(0, 500);
  const noindex = b.noindex ? 1 : 0;
  if (!title && !description && !noindex) {
    db.prepare('DELETE FROM seo_meta WHERE scope = ? AND ref = ?').run(scope, ref);
  } else {
    db.prepare(`INSERT INTO seo_meta (scope, ref, title, description, noindex, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(scope, ref) DO UPDATE SET title=excluded.title, description=excluded.description, noindex=excluded.noindex, updated_at=datetime('now')`)
      .run(scope, ref, title, description, noindex);
  }
  res.json({ scope, ref, title, description, noindex: noindex === 1 });
});
// Customer: list own notifications (active + in date window), with read flags.
api.get('/notifications', (req, res) => {
  const auth = getAuthUser(req);
  if (!auth) return res.status(401).json({ error: 'Not authenticated' });
  try { ensureNotificationsTable(); } catch (_) {}
  const now = new Date().toISOString();
  const onlyUnread = req.query.unread === '1' || req.query.unread === 'true';
  const rows = db.prepare(`SELECT n.*, CASE WHEN r.notification_id IS NULL THEN 0 ELSE 1 END AS is_read
    FROM notifications n LEFT JOIN notification_reads r
      ON r.notification_id = n.id AND r.user_id = ?
    WHERE n.is_active = 1 AND (n.target = 'all' OR n.target = ?)
      AND (n.starts_at = '' OR n.starts_at <= ?) AND (n.ends_at = '' OR n.ends_at >= ?)
      ${onlyUnread ? 'AND r.notification_id IS NULL' : ''}
    ORDER BY n.id DESC LIMIT 100`).all(auth.row.id, auth.row.id, now, now);
  const unread = db.prepare(`SELECT COUNT(*) AS n FROM notifications n LEFT JOIN notification_reads r
      ON r.notification_id = n.id AND r.user_id = ?
    WHERE n.is_active = 1 AND (n.target = 'all' OR n.target = ?)
      AND (n.starts_at = '' OR n.starts_at <= ?) AND (n.ends_at = '' OR n.ends_at >= ?)
      AND r.notification_id IS NULL`).get(auth.row.id, auth.row.id, now, now).n;
  res.json({
    unreadCount: unread,
    items: rows.map((r) => ({ ...mapNotification(r), isRead: !!r.is_read })),
  });
});
// Customer: mark as read.
api.post('/notifications/:id/read', (req, res) => {
  const auth = getAuthUser(req);
  if (!auth) return res.status(401).json({ error: 'Not authenticated' });
  try { ensureNotificationsTable(); } catch (_) {}
  const cur = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Notification not found' });
  if (cur.target !== 'all' && cur.target !== auth.row.id) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('INSERT OR IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)').run(req.params.id, auth.row.id);
  res.json({ ok: true });
});

// ── Support tickets (admin-managed; support widget untouched) ──
const VALID_TICKET_STATUSES = new Set(['open', 'pending', 'answered', 'closed']);
const VALID_TICKET_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const VALID_TICKET_CATEGORIES = new Set(['پشتیبانی سفارش', 'مشکل پرداخت', 'مرجوعی/تعویض', 'شکایت', 'پیشنهاد', 'سایر']);
function normalizeTicketCategory(v) {
  const s = String(v || '').trim();
  return VALID_TICKET_CATEGORIES.has(s) ? s : 'سایر';
}
function ensureTicketTables() {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'سایر',
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'open',
      created_by TEXT NOT NULL DEFAULT 'customer',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)');
    db.exec(`CREATE TABLE IF NOT EXISTS ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      sender TEXT NOT NULL DEFAULT 'customer',
      author_name TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id)');
    /* Category column added after the initial tickets table: attach to existing DBs. */
    try {
      const tcols = db.prepare('PRAGMA table_info(tickets)').all().map((c) => c.name);
      if (tcols.indexOf('category') === -1) db.exec("ALTER TABLE tickets ADD COLUMN category TEXT NOT NULL DEFAULT 'سایر'");
    } catch (_) {}
  } catch (_) {}
}
try { ensureTicketTables(); } catch (_) {}
function userLabel(u) {
  if (!u) return '';
  const nm = ((u.first_name || '') + ' ' + (u.last_name || '')).trim();
  return nm || u.mobile || u.id;
}
function mapTicket(t) {
  if (!t) return t;
  return {
    id: t.id, userId: t.user_id,
    userName: t.user_name || '', userMobile: t.user_mobile || '', userEmail: t.user_email || '',
    subject: t.subject || '',
    category: t.category || 'سایر',
    priority: VALID_TICKET_PRIORITIES.has(t.priority) ? t.priority : 'normal',
    status: VALID_TICKET_STATUSES.has(t.status) ? t.status : 'open',
    createdBy: t.created_by || 'customer',
    messageCount: Number(t.message_count) || 0,
    lastMessage: t.last_message || '', lastSender: t.last_sender || '',
    createdAt: t.created_at || null, updatedAt: t.updated_at || null,
  };
}
function ticketListJoins() {
  return `LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN (SELECT ticket_id, COUNT(*) AS n FROM ticket_messages GROUP BY ticket_id) mc ON mc.ticket_id = t.id
    LEFT JOIN ticket_messages lm ON lm.id = (SELECT MAX(id) FROM ticket_messages WHERE ticket_id = t.id)`;
}
function ticketListSelect() {
  return `t.*, TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS user_name,
    u.mobile AS user_mobile, u.email AS user_email, COALESCE(mc.n, 0) AS message_count,
    lm.message AS last_message, lm.sender AS last_sender`;
}
// Admin: list with search (user/mobile/subject/ID) + status/priority filters + pagination.
api.get('/admin/tickets', requireAdmin, (req, res) => {
  try { ensureTicketTables(); } catch (_) {}
  const { q, status, priority, limit = 20, offset = 0 } = req.query;
  const where = [];
  const params = [];
  if (q) {
    const like = `%${q}%`;
    where.push(`(CAST(t.id AS TEXT) LIKE ? OR t.subject LIKE ? OR u.mobile LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR (u.first_name || ' ' || u.last_name) LIKE ?)`);
    params.push(like, like, like, like, like, like);
  }
  if (status && VALID_TICKET_STATUSES.has(String(status))) { where.push('t.status = ?'); params.push(String(status)); }
  if (priority && VALID_TICKET_PRIORITIES.has(String(priority))) { where.push('t.priority = ?'); params.push(String(priority)); }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 500);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const rows = db.prepare(`SELECT ${ticketListSelect()} FROM tickets t ${ticketListJoins()} ${clause} ORDER BY t.updated_at DESC, t.id DESC LIMIT ? OFFSET ?`).all(...params, lim, off);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM tickets t LEFT JOIN users u ON u.id = t.user_id ${clause}`).get(...params).n;
  res.json({ total, items: rows.map(mapTicket) });
});
// Admin: detail with full conversation.
api.get('/admin/tickets/:id', requireAdmin, (req, res) => {
  try { ensureTicketTables(); } catch (_) {}
  const t = db.prepare(`SELECT ${ticketListSelect()} FROM tickets t ${ticketListJoins()} WHERE t.id = ?`).get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Ticket not found' });
  const messages = db.prepare('SELECT id, sender, author_name, message, created_at, file_url, file_name, file_type, file_size FROM ticket_messages WHERE ticket_id = ? ORDER BY id').all(req.params.id)
    .map((m) => ({ id: m.id, sender: m.sender, authorName: m.author_name || '', message: m.message || '', createdAt: m.created_at, fileUrl: m.file_url, fileName: m.file_name, fileType: m.file_type, fileSize: m.file_size }));
  res.json({ ...mapTicket(t), messages });
});
// Admin: create ticket for a customer (first message from admin).
api.post('/admin/tickets', requireAdmin, (req, res) => {
  try { ensureTicketTables(); } catch (_) {}
  const b = req.body || {};
  const userId = String(b.userId || b.user_id || '').trim();
  const subject = String(b.subject || '').trim().slice(0, 200);
  const message = String(b.message || '').trim().slice(0, 5000);
  const category = normalizeTicketCategory(b.category);
  const priority = String(b.priority || 'normal');
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  if (!subject) return res.status(400).json({ error: 'subject is required' });
  if (!message) return res.status(400).json({ error: 'message is required' });
  if (!VALID_TICKET_PRIORITIES.has(priority)) return res.status(400).json({ error: 'Invalid priority' });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const info = db.prepare(`INSERT INTO tickets (user_id, subject, category, priority, status, created_by)
    VALUES (?, ?, ?, ?, 'open', 'admin')`).run(userId, subject, category, priority);
  const adminName = (req.admin && (req.admin.name || req.admin.username)) || 'پشتیبانی';
  db.prepare(`INSERT INTO ticket_messages (ticket_id, sender, author_name, message) VALUES (?, 'admin', ?, ?)`)
    .run(info.lastInsertRowid, adminName, message);
  db.prepare("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?").run(info.lastInsertRowid);
  const t = db.prepare(`SELECT ${ticketListSelect()} FROM tickets t ${ticketListJoins()} WHERE t.id = ?`).get(info.lastInsertRowid);
  res.status(201).json(mapTicket(t));
});
// Admin: reply (reopens answered flow → status answered; closed tickets must be reopened first).
api.post('/admin/tickets/:id/reply', requireAdmin, (req, res) => {
  try { ensureTicketTables(); } catch (_) {}
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Ticket not found' });
  if (t.status === 'closed') return res.status(400).json({ error: 'Ticket is closed. Reopen it first.' });
  const message = String((req.body || {}).message || '').trim().slice(0, 5000);
  if (!message) return res.status(400).json({ error: 'message is required' });
  const adminName = (req.admin && (req.admin.name || req.admin.username)) || 'پشتیبانی';
  db.prepare(`INSERT INTO ticket_messages (ticket_id, sender, author_name, message) VALUES (?, 'admin', ?, ?)`)
    .run(req.params.id, adminName, message);
  db.prepare("UPDATE tickets SET status = 'answered', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  const updated = db.prepare(`SELECT ${ticketListSelect()} FROM tickets t ${ticketListJoins()} WHERE t.id = ?`).get(req.params.id);
  res.status(201).json(mapTicket(updated));
});
// Admin: close / reopen / pending / priority.
api.patch('/admin/tickets/:id', requireAdmin, (req, res) => {
  try { ensureTicketTables(); } catch (_) {}
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Ticket not found' });
  const b = req.body || {};
  let status = t.status;
  if (b.status !== undefined) {
    if (!VALID_TICKET_STATUSES.has(String(b.status))) return res.status(400).json({ error: 'Invalid status' });
    status = String(b.status);
  }
  let priority = t.priority;
  if (b.priority !== undefined) {
    if (!VALID_TICKET_PRIORITIES.has(String(b.priority))) return res.status(400).json({ error: 'Invalid priority' });
    priority = String(b.priority);
  }
  db.prepare("UPDATE tickets SET status = ?, priority = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, priority, req.params.id);
  const updated = db.prepare(`SELECT ${ticketListSelect()} FROM tickets t ${ticketListJoins()} WHERE t.id = ?`).get(req.params.id);
  res.json(mapTicket(updated));
});
// Admin: delete (messages cascade).
api.delete('/admin/tickets/:id', requireAdmin, (req, res) => {
  try { ensureTicketTables(); } catch (_) {}
  db.prepare('DELETE FROM ticket_messages WHERE ticket_id = ?').run(req.params.id);
  const info = db.prepare('DELETE FROM tickets WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Ticket not found' });
  res.json({ ok: true });
});

// --- Contact messages (public form -> DB, admin management) ---
function ensureContactMessagesTable() {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      email TEXT,
      phone TEXT,
      subject TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_contact_messages_created ON contact_messages(created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_contact_messages_read ON contact_messages(is_read)');
  } catch (_) {}
}
try { ensureContactMessagesTable(); } catch (_) {}

function normalizeContactPhone(raw) {
  const map = { '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9','٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' };
  let s = String(raw || '').trim().replace(/[۰-۹٠-٩]/g, (c) => (map[c] || c));
  s = s.replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('0098')) s = '0' + s.slice(4);
  else if (s.startsWith('98') && s.length >= 11) s = '0' + s.slice(2);
  else if (s.startsWith('9') && s.length === 10) s = '0' + s;
  s = s.replace(/\D/g, '');
  return s;
}
function isValidContactEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()); }
function isValidContactPhone(raw) {
  const n = normalizeContactPhone(raw);
  return /^0\d{9,10}$/.test(n);
}

const contactLimiter = rateLimit({ windowMs: 15*60*1000, max: 5, standardHeaders:true, legacyHeaders:false, message:{error:'Too many requests, please try again later'} });

api.post('/contact', contactLimiter, (req, res) => {
  try { ensureContactMessagesTable(); } catch (_) {}
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const subject = String(b.subject || '').trim();
  const message = String(b.message || '').trim();
  const email = String(b.email || '').trim();
  const phoneRaw = String(b.phone || '').trim();

  if (!name) return res.status(400).json({ error: 'نام الزامی است' });
  if (name.length > 100) return res.status(400).json({ error: 'نام بیش از حد طولانی است' });
  if (!subject) return res.status(400).json({ error: 'موضوع الزامی است' });
  if (subject.length > 200) return res.status(400).json({ error: 'موضوع بیش از حد طولانی است' });
  if (!message) return res.status(400).json({ error: 'پیام الزامی است' });
  if (message.length > 2000) return res.status(400).json({ error: 'پیام بیش از حد طولانی است' });

  const hasEmail = email.length > 0;
  const phone = phoneRaw ? normalizeContactPhone(phoneRaw) : '';
  const hasPhone = phone.length > 0;

  if (hasEmail) {
    if (email.length > 254) return res.status(400).json({ error: 'ایمیل نامعتبر است' });
    if (!isValidContactEmail(email)) return res.status(400).json({ error: 'ایمیل نامعتبر است' });
  }
  if (hasPhone) {
    if (!isValidContactPhone(phoneRaw)) return res.status(400).json({ error: 'شماره تماس نامعتبر است' });
  }
  if (!hasEmail && !hasPhone) {
    return res.status(400).json({ error: 'وارد کردن ایمیل یا شماره تماس الزامی است' });
  }

  const info = db.prepare(`INSERT INTO contact_messages (name, email, phone, subject, message, is_read)
    VALUES (?, ?, ?, ?, ?, 0)`)
    .run(name, hasEmail ? email : null, hasPhone ? phone : null, subject, message);
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

// Admin: list contact messages
api.get('/admin/contact-messages', requireAdmin, (req, res) => {
  try { ensureContactMessagesTable(); } catch (_) {}
  const { q, status, subject, limit = 50, offset = 0 } = req.query;
  const where = [];
  const params = [];
  if (status === 'read') { where.push('is_read = 1'); }
  else if (status === 'unread') { where.push('is_read = 0'); }
  if (subject) { where.push('subject = ?'); params.push(String(subject)); }
  if (q) {
    const like = `%${String(q)}%`;
    where.push('(name LIKE ? OR email LIKE ? OR phone LIKE ? OR subject LIKE ? OR message LIKE ?)');
    params.push(like, like, like, like, like);
  }
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const clause = where.length ? ('WHERE ' + where.join(' AND ')) : '';
  const rows = db.prepare(`SELECT * FROM contact_messages ${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(...params, lim, off);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM contact_messages ${clause}`).get(...params).n;
  const unreadCount = db.prepare('SELECT COUNT(*) AS n FROM contact_messages WHERE is_read = 0').get().n;
  const totalCount = db.prepare('SELECT COUNT(*) AS n FROM contact_messages').get().n;
  res.json({
    total, items: rows.map((r) => ({
      id: r.id, name: r.name, email: r.email, phone: r.phone, subject: r.subject,
      message: r.message, isRead: !!r.is_read, createdAt: r.created_at,
    })), unreadCount, totalCount,
  });
});

// Distinct subjects for filter
api.get('/admin/contact-messages/subjects', requireAdmin, (req, res) => {
  try { ensureContactMessagesTable(); } catch (_) {}
  const rows = db.prepare("SELECT DISTINCT subject FROM contact_messages WHERE subject <> '' ORDER BY subject").all();
  res.json(rows.map((r) => r.subject));
});

api.get('/admin/contact-messages/:id', requireAdmin, (req, res) => {
  try { ensureContactMessagesTable(); } catch (_) {}
  const r = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'پیام یافت نشد' });
  res.json({ id: r.id, name: r.name, email: r.email, phone: r.phone, subject: r.subject, message: r.message, isRead: !!r.is_read, createdAt: r.created_at });
});

api.patch('/admin/contact-messages/:id', requireAdmin, (req, res) => {
  try { ensureContactMessagesTable(); } catch (_) {}
  const cur = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'پیام یافت نشد' });
  const b = req.body || {};
  let isRead = cur.is_read;
  if (b.isRead !== undefined) isRead = b.isRead ? 1 : 0;
  else if (b.read !== undefined) isRead = b.read ? 1 : 0;
  else if (b.status !== undefined) isRead = (String(b.status) === 'read') ? 1 : 0;
  db.prepare('UPDATE contact_messages SET is_read = ? WHERE id = ?').run(isRead, req.params.id);
  const r = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(req.params.id);
  res.json({ id: r.id, name: r.name, email: r.email, phone: r.phone, subject: r.subject, message: r.message, isRead: !!r.is_read, createdAt: r.created_at });
});

api.delete('/admin/contact-messages/:id', requireAdmin, (req, res) => {
  try { ensureContactMessagesTable(); } catch (_) {}
  const info = db.prepare('DELETE FROM contact_messages WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'پیام یافت نشد' });
  res.json({ ok: true });
});

// Customer: own tickets (list + detail), create, reply. Widget untouched.
api.get('/tickets', (req, res) => {
  const auth = getAuthUser(req);
  if (!auth) return res.status(401).json({ error: 'Not authenticated' });
  try { ensureTicketTables(); } catch (_) {}
  const rows = db.prepare(`SELECT ${ticketListSelect()} FROM tickets t ${ticketListJoins()} WHERE t.user_id = ? ORDER BY t.updated_at DESC, t.id DESC LIMIT 100`).all(auth.row.id);
  res.json({ items: rows.map(mapTicket) });
});
api.get('/tickets/:id', (req, res) => {
  const auth = getAuthUser(req);
  if (!auth) return res.status(401).json({ error: 'Not authenticated' });
  try { ensureTicketTables(); } catch (_) {}
  const t = db.prepare(`SELECT ${ticketListSelect()} FROM tickets t ${ticketListJoins()} WHERE t.id = ?`).get(req.params.id);
  if (!t || t.user_id !== auth.row.id) return res.status(404).json({ error: 'Ticket not found' });
  const messages = db.prepare('SELECT id, sender, author_name, message, created_at, file_url, file_name, file_type, file_size FROM ticket_messages WHERE ticket_id = ? ORDER BY id').all(req.params.id)
    .map((m) => ({ id: m.id, sender: m.sender, authorName: m.author_name || '', message: m.message || '', createdAt: m.created_at, fileUrl: m.file_url, fileName: m.file_name, fileType: m.file_type, fileSize: m.file_size }));
  res.json({ ...mapTicket(t), messages });
});
api.post('/tickets', (req, res) => {
  const auth = getAuthUser(req);
  if (!auth) return res.status(401).json({ error: 'Not authenticated' });
  try { ensureTicketTables(); } catch (_) {}
  const b = req.body || {};
  const subject = String(b.subject || '').trim().slice(0, 200);
  const message = String(b.message || '').trim().slice(0, 5000);
  const category = normalizeTicketCategory(b.category);
  if (!subject) return res.status(400).json({ error: 'subject is required' });
  if (!message) return res.status(400).json({ error: 'message is required' });
  const info = db.prepare(`INSERT INTO tickets (user_id, subject, category, priority, status, created_by)
    VALUES (?, ?, ?, 'normal', 'open', 'customer')`).run(auth.row.id, subject, category);
  db.prepare(`INSERT INTO ticket_messages (ticket_id, sender, author_name, message) VALUES (?, 'customer', ?, ?)`)
    .run(info.lastInsertRowid, userLabel(auth.row), message);
  const t = db.prepare(`SELECT ${ticketListSelect()} FROM tickets t ${ticketListJoins()} WHERE t.id = ?`).get(info.lastInsertRowid);
  res.status(201).json(mapTicket(t));
});
api.post('/tickets/:id/reply', (req, res) => {
  const auth = getAuthUser(req);
  if (!auth) return res.status(401).json({ error: 'Not authenticated' });
  try { ensureTicketTables(); } catch (_) {}
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!t || t.user_id !== auth.row.id) return res.status(404).json({ error: 'Ticket not found' });
  if (t.status === 'closed') return res.status(400).json({ error: 'Ticket is closed.' });
  const message = String((req.body || {}).message || '').trim().slice(0, 5000);
  if (!message) return res.status(400).json({ error: 'message is required' });
  db.prepare(`INSERT INTO ticket_messages (ticket_id, sender, author_name, message) VALUES (?, 'customer', ?, ?)`)
    .run(req.params.id, userLabel(auth.row), message);
  db.prepare("UPDATE tickets SET status = 'open', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  const updated = db.prepare(`SELECT ${ticketListSelect()} FROM tickets t ${ticketListJoins()} WHERE t.id = ?`).get(req.params.id);
  res.status(201).json(mapTicket(updated));
});

// ── Chat widget support (reuse tickets) ──
function getChatIdentity(req){
  const auth=getAuthUser(req);
  if(auth) return {userId:auth.row.id, label:userLabel(auth.row), kind:'user'};
  // guest: header X-Guest-Id or create via ensure
  let gid=String(req.headers['x-guest-id']||req.query.guestId||'').trim();
  if(gid && /^guest_/.test(gid)) return {userId:gid, label:'مهمان '+gid.slice(-4), kind:'guest'};
  return null;
}
function ensureGuestUser(userId){
  try{ db.prepare("INSERT OR IGNORE INTO users (id, first_name, last_name, mobile, join_date) VALUES (?, 'مهمان', ?, ?, datetime('now'))").run(userId, userId.slice(-6), userId); }catch(e){ try{ db.prepare("INSERT OR IGNORE INTO users (id, first_name, last_name, mobile) VALUES (?, 'مهمان', ?, ?)").run(userId, userId.slice(-6), userId); }catch(_){} }
}
api.post('/support/chat/request',(req,res)=>{
  try{ensureTicketTables();}catch(_){}
  // Priority: valid Authorization Bearer token wins; guest only if no valid auth
  let auth=null; try{ auth=getAuthUser(req); }catch(_){}
  let ident=null;
  if(auth) ident={userId:auth.row.id, label:userLabel(auth.row), kind:'user'};
  else ident=getChatIdentity(req);
  let gid=String(req.body&&req.body.guestId||req.headers['x-guest-id']||'').trim();
  if(!ident){
    if(!gid || !/^guest_/.test(gid)){ gid='guest_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
    ident={userId:gid, label:'مهمان '+gid.slice(-4), kind:'guest'};
  } else if(ident.kind==='guest' && auth){
    // stale guestId in storage must not override valid auth
    ident={userId:auth.row.id, label:userLabel(auth.row), kind:'user'};
  }
  if(ident.kind==='guest') ensureGuestUser(ident.userId);
  const subject='چت پشتیبانی - '+ident.label;
  // reuse open ticket if exists (last 24h open/pending/answered)
  let existing=db.prepare("SELECT id FROM tickets WHERE user_id=? AND subject LIKE 'چت پشتیبانی%' AND status!='closed' ORDER BY updated_at DESC LIMIT 1").get(ident.userId);
  if(existing) return res.json({ticketId:existing.id, guestId:ident.kind==='guest'?ident.userId:undefined});
  const info=db.prepare("INSERT INTO tickets (user_id, subject, priority, status, created_by) VALUES (?, ?, 'normal','open','customer')").run(ident.userId, subject);
  db.prepare("INSERT INTO ticket_messages (ticket_id,sender,author_name,message) VALUES (?,'customer',?,?)").run(info.lastInsertRowid, ident.label, 'درخواست چت با پشتیبانی');
  db.prepare("UPDATE tickets SET updated_at=datetime('now') WHERE id=?").run(info.lastInsertRowid);
  res.status(201).json({ticketId:info.lastInsertRowid, guestId:ident.kind==='guest'?ident.userId:undefined});
});
api.get('/support/chat/:id/messages',(req,res)=>{
  try{ensureTicketTables();}catch(_){}
  const ident=getChatIdentity(req);
  if(!ident) return res.status(401).json({error:'Need auth or guestId'});
  const t=db.prepare("SELECT * FROM tickets WHERE id=?").get(req.params.id);
  if(!t || t.user_id!==ident.userId) return res.status(404).json({error:'Not found'});
  const msgs=db.prepare("SELECT id,sender,author_name,message,created_at,file_url,file_name,file_type,file_size FROM ticket_messages WHERE ticket_id=? ORDER BY id").all(req.params.id).map(m=>({id:m.id,sender:m.sender,authorName:m.author_name,message:m.message,createdAt:m.created_at,fileUrl:m.file_url,fileName:m.file_name,fileType:m.file_type,fileSize:m.file_size}));
  res.json({ticket:t, messages:msgs});
});
api.post('/support/chat/:id/message',(req,res)=>{
  try{ensureTicketTables();}catch(_){}
  const ident=getChatIdentity(req);
  if(!ident) return res.status(401).json({error:'Need auth or guestId'});
  const t=db.prepare("SELECT * FROM tickets WHERE id=?").get(req.params.id);
  if(!t || t.user_id!==ident.userId) return res.status(404).json({error:'Not found'});
  if(t.status==='closed') return res.status(400).json({error:'Ticket closed'});
  const msg=String((req.body||{}).message||'').trim().slice(0,5000);
  if(!msg) return res.status(400).json({error:'message required'});
  db.prepare("INSERT INTO ticket_messages (ticket_id,sender,author_name,message) VALUES (?,'customer',?,?)").run(req.params.id, ident.label, msg);
  db.prepare("UPDATE tickets SET status='open', updated_at=datetime('now') WHERE id=?").run(req.params.id);
  res.status(201).json({ok:true});
});
// attachment
try{ db.exec("ALTER TABLE ticket_messages ADD COLUMN file_url TEXT"); }catch(_){}
try{ db.exec("ALTER TABLE ticket_messages ADD COLUMN file_name TEXT"); }catch(_){}
try{ db.exec("ALTER TABLE ticket_messages ADD COLUMN file_type TEXT"); }catch(_){}
try{ db.exec("ALTER TABLE ticket_messages ADD COLUMN file_size INTEGER"); }catch(_){}
const uploadDir=require('path').join(__dirname,'..','uploads','chat'); try{require('fs').mkdirSync(uploadDir,{recursive:true});}catch(_){}
const allowedMime=new Set(['image/jpeg','image/png','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
const multerChat=multer; const storageChat=multerChat.diskStorage({destination:(r,f,cb)=>cb(null,uploadDir), filename:(r,f,cb)=>{ const e=require('path').extname(f.originalname).toLowerCase(); cb(null,Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6)+e); }});
const uploadChat=multerChat({storage:storageChat, limits:{fileSize:5*1024*1024}, fileFilter:(r,f,cb)=>{ if(allowedMime.has(f.mimetype)) cb(null,true); else cb(new Error('Invalid file type')); }});
api.post('/support/chat/:id/attachment', uploadChat.single('file'), (req,res)=>{
  try{ensureTicketTables();}catch(_){}
  const admin=getAdminAuth(req);
  if(admin){
    const t=db.prepare("SELECT * FROM tickets WHERE id=?").get(req.params.id);
    if(!t) return res.status(404).json({error:'Not found'});
    if(!req.file) return res.status(400).json({error:'file required'});
    const url='/uploads/chat/'+req.file.filename;
    const an=(admin.row&& (admin.row.name||admin.row.username))||'پشتیبانی';
    db.prepare("INSERT INTO ticket_messages (ticket_id,sender,author_name,message,file_url,file_name,file_type,file_size) VALUES (?,'admin',?,?,?,?,?,?)").run(req.params.id, an, req.body.message||'', url, req.file.originalname, req.file.mimetype, req.file.size);
    db.prepare("UPDATE tickets SET status='answered', updated_at=datetime('now') WHERE id=?").run(req.params.id);
    return res.status(201).json({ok:true, url});
  }
  const ident=getChatIdentity(req);
  if(!ident) return res.status(401).json({error:'Need auth or guestId'});
  const t=db.prepare("SELECT * FROM tickets WHERE id=?").get(req.params.id);
  if(!t || t.user_id!==ident.userId) return res.status(404).json({error:'Not found'});
  if(!req.file) return res.status(400).json({error:'file required'});
  const url='/uploads/chat/'+req.file.filename;
  db.prepare("INSERT INTO ticket_messages (ticket_id,sender,author_name,message,file_url,file_name,file_type,file_size) VALUES (?,'customer',?,?,?,?,?,?)").run(req.params.id, ident.label, req.body.message||'', url, req.file.originalname, req.file.mimetype, req.file.size);
  db.prepare("UPDATE tickets SET status='open', updated_at=datetime('now') WHERE id=?").run(req.params.id);
  res.status(201).json({ok:true, url});
});
try{ app.use('/uploads', require('express').static(require('path').join(__dirname,'..','uploads'))); }catch(_){}

// ── Articles (SQLite-backed; public read, admin write) ──
function ensureArticlesTable(){
  db.exec(`CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL UNIQUE,
    excerpt TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    category TEXT NOT NULL DEFAULT '',
    category_slug TEXT NOT NULL DEFAULT ''
  )`);
  try { var _ac=db.prepare('PRAGMA table_info(articles)').all().map(function(c){return c.name;}); if(_ac.indexOf('category')===-1) db.exec("ALTER TABLE articles ADD COLUMN category TEXT NOT NULL DEFAULT ''"); } catch(_){}
  try { var _as=db.prepare('PRAGMA table_info(articles)').all().map(function(c){return c.name;}); if(_as.indexOf('category_slug')===-1) db.exec("ALTER TABLE articles ADD COLUMN category_slug TEXT NOT NULL DEFAULT ''"); } catch(_){}
  db.exec('CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category_slug)');
}
ensureArticlesTable();
// ── Article categories (SQLite-backed; managed from Admin → Articles) ──
function ensureArticleCategoriesTable(){
  db.exec(`CREATE TABLE IF NOT EXISTS article_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  try { var _cols=db.prepare('PRAGMA table_info(articles)').all().map(function(c){return c.name;}); if(_cols.indexOf('category_id')===-1) db.exec('ALTER TABLE articles ADD COLUMN category_id INTEGER'); } catch(_){}
  db.exec('CREATE INDEX IF NOT EXISTS idx_articles_category_id ON articles(category_id)');
  var seed=db.prepare('INSERT OR IGNORE INTO article_categories (name, slug) VALUES (?, ?)');
  seed.run('راهنمای خرید دوربین', 'buying-guide');
  seed.run('آموزش نصب دوربین', 'installation-tutorial');
  seed.run('مقایسه دوربین', 'camera-comparison');
  seed.run('نگهداری سیستم امنیتی', 'security-maintenance');
  seed.run('اخبار فناوری امنیتی', 'security-news');
}
ensureArticleCategoriesTable();
function getArticleCategories(){
  try { ensureArticleCategoriesTable(); } catch(_){}
  return db.prepare('SELECT * FROM article_categories ORDER BY id').all();
}
function articleCategoryCount(slug, name){
  try {
    return db.prepare('SELECT COUNT(*) AS n FROM articles WHERE category_slug = ? OR category = ?').get(slug, name).n || 0;
  } catch(_) { return 0; }
}
function mapArticleCategory(r){
  if(!r) return r;
  return { id:r.id, name:r.name, slug:r.slug, count:articleCategoryCount(r.slug, r.name) };
}
function slugifyArticleCategory(s){
  return String(s||'').trim().toLowerCase().replace(/[_\s]+/g,'-').replace(/[^a-z0-9\u0600-\u06FF-]+/g,'').replace(/-+/g,'-').replace(/^-|-$/g,'') || ('article-category-'+Date.now().toString(36));
}
function resolveArticleCategory(name, slug){
  var n=String(name==null?'':name).trim(), s=String(slug==null?'':slug).trim();
  var row=null;
  try {
    if(s) row=db.prepare('SELECT * FROM article_categories WHERE slug = ?').get(s);
    if(!row && n) row=db.prepare('SELECT * FROM article_categories WHERE name = ?').get(n);
    if(!row && n) row=db.prepare('SELECT * FROM article_categories WHERE slug = ?').get(n);
  } catch(_){ row=null; }
  if(row) return { category_id:row.id, category:row.name, category_slug:row.slug };
  if(n) return { category_id:null, category:n, category_slug:s||n };
  if(s) return { category_id:null, category:s, category_slug:s };
  return { category_id:null, category:'', category_slug:'' };
}
function mapArticle(r){ if(!r) return r; return { id:r.id, title:r.title, slug:r.slug, excerpt:r.excerpt||'', content:r.content||'', image:r.image||'', featuredImage:r.image||'', status:r.status||'draft', category:r.category||'', categorySlug:r.category_slug||'', category_slug:r.category_slug||'', categoryId:(r.category_id==null?null:r.category_id), category_id:(r.category_id==null?null:r.category_id), createdAt:r.created_at, updatedAt:r.updated_at, created_at:r.created_at, updated_at:r.updated_at, seo:seoFor('article', r.id) }; }
function slugifyArticle(s){
  return String(s||'').trim().toLowerCase().replace(/[_\s]+/g,'-').replace(/[^a-z0-9\u0600-\u06FF-]+/g,'').replace(/-+/g,'-').replace(/^-|-$/g,'') || ('article-'+Date.now().toString(36));
}
function articleInput(b, isCreate){
  const out={};
  if(b.title!==undefined) out.title=String(b.title).trim();
  if(b.slug!==undefined && String(b.slug).trim()) out.slug=String(b.slug).trim().toLowerCase().replace(/\s+/g,'-');
  if(b.excerpt!==undefined) out.excerpt=String(b.excerpt||'');
  if(b.content!==undefined) out.content=String(b.content||'');
  if(b.image!==undefined) out.image=String(b.image||'');
  if(b.featuredImage!==undefined && out.image===undefined) out.image=String(b.featuredImage||'');
  if(b.featured_image!==undefined && out.image===undefined) out.image=String(b.featured_image||'');
  if(b.status!==undefined) out.status=(String(b.status).toLowerCase()==='published')?'published':'draft';
  if(b.category!==undefined || b.categorySlug!==undefined || b.category_slug!==undefined || b.categoryId!==undefined || b.category_id!==undefined){
    var _cid=(b.categoryId!==undefined?b.categoryId:b.category_id);
    if(_cid!==undefined && _cid!==null && String(_cid)!==''){
      var _row=null;
      try { _row=db.prepare('SELECT * FROM article_categories WHERE id = ? OR slug = ?').get(Number(_cid)||-1, String(_cid)); } catch(_){ _row=null; }
      if(_row){ out.category_id=_row.id; out.category=_row.name; out.category_slug=_row.slug; }
      else { var _rc2=resolveArticleCategory(b.category, b.categorySlug!==undefined?b.categorySlug:b.category_slug); out.category_id=_rc2.category_id; out.category=_rc2.category; out.category_slug=_rc2.category_slug; }
    } else {
      var _rc=resolveArticleCategory(b.category, b.categorySlug!==undefined?b.categorySlug:b.category_slug);
      out.category_id=_rc.category_id; out.category=_rc.category; out.category_slug=_rc.category_slug;
    }
  }
  if(isCreate){
    if(!out.title) return { error:'title is required' };
    if(!out.slug) out.slug=slugifyArticle(out.title);
    if(!out.status) out.status='draft';
  }
  return { values:out };
}
// Public: published only (unless ?all with admin? no — admin uses /admin/articles)
api.get('/articles', (req,res)=>{
  ensureArticlesTable();
  const { status, q, category, limit=100, offset=0 }=req.query;
  const where=[]; const params=[];
  if(status==='draft'||status==='published'){ where.push('status = ?'); params.push(status); }
  else { where.push("status = 'published'"); }
  if(category){ where.push('(category_slug = ? OR category = ?)'); params.push(category, category); }
  if(q){ where.push('(title LIKE ? OR excerpt LIKE ? OR content LIKE ?)'); const like=`%${q}%`; params.push(like,like,like); }
  const rows=db.prepare(`SELECT * FROM articles ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, Math.min(+limit||100,500), Math.max(+offset||0,0));
  const total=db.prepare(`SELECT COUNT(*) AS n FROM articles ${where.length?'WHERE '+where.join(' AND '):''}`).get(...params).n;
  res.json({ total, items: rows.map(mapArticle) });
});
api.get('/articles/:slug', (req,res)=>{
  ensureArticlesTable();
  const key=req.params.slug;
  const row=db.prepare('SELECT * FROM articles WHERE slug = ? OR id = ?').get(key, Number(key)||-1);
  if(!row || row.status!=='published') return res.status(404).json({ error:'Article not found' });
  res.json(mapArticle(row));
});
// Admin: full CRUD
api.get('/admin/articles', requireAdmin, (req,res)=>{
  ensureArticlesTable();
  const { status, q, limit=200, offset=0 }=req.query;
  const where=[]; const params=[];
  if(status==='draft'||status==='published'){ where.push('status = ?'); params.push(status); }
  if(q){ where.push('(title LIKE ? OR slug LIKE ? OR excerpt LIKE ?)'); const like=`%${q}%`; params.push(like,like,like); }
  const rows=db.prepare(`SELECT * FROM articles ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, Math.min(+limit||200,500), Math.max(+offset||0,0));
  const total=db.prepare(`SELECT COUNT(*) AS n FROM articles ${where.length?'WHERE '+where.join(' AND '):''}`).get(...params).n;
  res.json({ total, items: rows.map(mapArticle) });
});
api.get('/admin/articles/:id', requireAdmin, (req,res)=>{
  ensureArticlesTable();
  const row=db.prepare('SELECT * FROM articles WHERE id = ? OR slug = ?').get(req.params.id, req.params.id);
  if(!row) return res.status(404).json({ error:'Article not found' });
  res.json(mapArticle(row));
});
api.post('/admin/articles', requireAdmin, (req,res)=>{
  ensureArticlesTable();
  const { values, error }=articleInput(req.body||{}, true);
  if(error) return res.status(400).json({ error });
  try{
    const info=db.prepare(`INSERT INTO articles (title, slug, excerpt, content, image, status, category, category_slug, category_id, created_at, updated_at)
      VALUES (@title, @slug, @excerpt, @content, @image, @status, @category, @category_slug, @category_id, datetime('now'), datetime('now'))`).run({
      title:values.title, slug:values.slug, excerpt:values.excerpt||'', content:values.content||'', image:values.image||'', status:values.status||'draft', category:values.category||'', category_slug:values.category_slug||'', category_id:(values.category_id==null?null:values.category_id) });
    res.status(201).json(mapArticle(db.prepare('SELECT * FROM articles WHERE id = ?').get(info.lastInsertRowid)));
  }catch(e){ if(String(e.message).includes('UNIQUE')) return res.status(409).json({ error:'Article slug already exists' }); throw e; }
});
api.put('/admin/articles/:id', requireAdmin, (req,res)=>{
  ensureArticlesTable();
  const cur=db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if(!cur) return res.status(404).json({ error:'Article not found' });
  const { values, error }=articleInput(req.body||{}, false);
  if(error) return res.status(400).json({ error });
  if(values.title==='') return res.status(400).json({ error:'title is required' });
  const merged={ title:values.title??cur.title, slug:values.slug||cur.slug, excerpt:values.excerpt??cur.excerpt, content:values.content??cur.content, image:values.image??cur.image, status:values.status??cur.status, category:values.category??(cur.category||''), category_slug:values.category_slug??(cur.category_slug||''), category_id:(values.category_id!==undefined?values.category_id:(cur.category_id==null?null:cur.category_id)) };
  if(!merged.title) return res.status(400).json({ error:'title is required' });
  try{
    db.prepare(`UPDATE articles SET title=@title, slug=@slug, excerpt=@excerpt, content=@content, image=@image, status=@status, category=@category, category_slug=@category_slug, category_id=@category_id, updated_at=datetime('now') WHERE id=@id`).run({ ...merged, id:req.params.id });
    res.json(mapArticle(db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id)));
  }catch(e){ if(String(e.message).includes('UNIQUE')) return res.status(409).json({ error:'Article slug already exists' }); throw e; }
});
api.delete('/admin/articles/:id', requireAdmin, (req,res)=>{
  ensureArticlesTable();
  const info=db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id);
  if(!info.changes) return res.status(404).json({ error:'Article not found' });
  res.json({ ok:true });
});

// ── Article categories: public list (for storefront filters) ──
api.get('/article-categories', (req,res)=>{
  ensureArticleCategoriesTable();
  res.json(getArticleCategories().map(mapArticleCategory));
});
// ── Article categories: admin CRUD ──
api.get('/admin/article-categories', requireAdmin, (req,res)=>{
  ensureArticleCategoriesTable();
  res.json(getArticleCategories().map(mapArticleCategory));
});
api.post('/admin/article-categories', requireAdmin, (req,res)=>{
  ensureArticleCategoriesTable();
  const name=String(req.body?.name||'').trim();
  let slug=String(req.body?.slug||'').trim().toLowerCase().replace(/\s+/g,'-');
  if(!name) return res.status(400).json({ error:'name is required' });
  if(!slug) slug=slugifyArticleCategory(name);
  try{
    const info=db.prepare('INSERT INTO article_categories (name, slug) VALUES (?, ?)').run(name, slug);
    res.status(201).json(mapArticleCategory(db.prepare('SELECT * FROM article_categories WHERE id = ?').get(info.lastInsertRowid)));
  }catch(e){ if(String(e.message).includes('UNIQUE')) return res.status(409).json({ error:'Category slug already exists' }); throw e; }
});
api.put('/admin/article-categories/:id', requireAdmin, (req,res)=>{
  ensureArticleCategoriesTable();
  const cur=db.prepare('SELECT * FROM article_categories WHERE id = ?').get(req.params.id);
  if(!cur) return res.status(404).json({ error:'Category not found' });
  const name=req.body?.name!==undefined?String(req.body.name).trim():cur.name;
  let slug=req.body?.slug!==undefined&&String(req.body.slug).trim()?String(req.body.slug).trim().toLowerCase().replace(/\s+/g,'-'):cur.slug;
  if(!name) return res.status(400).json({ error:'name is required' });
  if(!slug) slug=slugifyArticleCategory(name);
  try{
    db.prepare("UPDATE article_categories SET name=?, slug=?, updated_at=datetime('now') WHERE id=?").run(name, slug, req.params.id);
    if(slug!==cur.slug || name!==cur.name){
      db.prepare('UPDATE articles SET category = ?, category_slug = ? WHERE category_id = ? OR category_slug = ?').run(name, slug, req.params.id, cur.slug);
    }
    res.json(mapArticleCategory(db.prepare('SELECT * FROM article_categories WHERE id = ?').get(req.params.id)));
  }catch(e){ if(String(e.message).includes('UNIQUE')) return res.status(409).json({ error:'Category slug already exists' }); throw e; }
});
api.delete('/admin/article-categories/:id', requireAdmin, (req,res)=>{
  ensureArticleCategoriesTable();
  const cur=db.prepare('SELECT * FROM article_categories WHERE id = ?').get(req.params.id);
  if(!cur) return res.status(404).json({ error:'Category not found' });
  const n=articleCategoryCount(cur.slug, cur.name);
  const reassignTo=String(req.query.reassign_to||req.query.reassignTo||req.body?.reassign_to||req.body?.reassignTo||'').trim();
  if(n>0 && !reassignTo){
    return res.status(409).json({ error:'Category has articles. Reassign them to another category first.', count:n });
  }
  if(n>0 && reassignTo){
    const target=db.prepare('SELECT * FROM article_categories WHERE slug = ? OR id = ?').get(reassignTo, Number(reassignTo)||-1);
    if(!target) return res.status(400).json({ error:'Reassignment target category not found' });
    if(String(target.id)===String(cur.id)) return res.status(400).json({ error:'Cannot reassign to the same category' });
    db.prepare('UPDATE articles SET category = ?, category_slug = ?, category_id = ? WHERE category_id = ? OR category_slug = ? OR category = ?')
      .run(target.name, target.slug, target.id, cur.id, cur.slug, cur.name);
  } else {
    db.prepare("UPDATE articles SET category = '', category_slug = '', category_id = NULL WHERE category_id = ? OR category_slug = ? OR category = ?")
      .run(cur.id, cur.slug, cur.name);
  }
  db.prepare('DELETE FROM article_categories WHERE id = ?').run(req.params.id);
  res.json({ ok:true });
});

// ── Site content / CMS (key-value, admin write, public read) ──
const CONTENT_DEFAULTS = {
  'hero.slide1.badge': 'فروش ویژه دوربین مداربسته',
  'hero.slide1.title': 'دوربین مداربسته حرفه‌ای با بهترین قیمت',
  'hero.slide1.text': 'دوربین‌های تحت شبکه و آنالوگ از معتبرترین برندهای جهان با ضمانت اصالت کالا و ارسال رایگان',
  'hero.slide2.badge': 'برندهای معتبر',
  'hero.slide2.title': 'دوربین مداربسته اورجینال با گارانتی معتبر',
  'hero.slide2.text': 'محصولات اورجینال هایکویژن، داهوا، یونیکنیو، تیاندی و ویوتک با گارانتی رسمی و ارسال سریع به سراسر کشور',
  'hero.slide3.badge': 'تخفیف ویژه',
  'hero.slide3.title': 'سیستم‌های ضبط DVR و NVR با تخفیف ویژه',
  'hero.slide3.text': 'دستگاه‌های DVR و NVR با ظرفیت ذخیره‌سازی بالا، قیمت استثنایی و ضمانت بازگشت کالا',
  'hero.slide4.badge': 'ارسال رایگان',
  'hero.slide4.title': 'سیستم‌های امنیتی و کنترل تردد',
  'hero.slide4.text': 'هشدار دزد بی‌سیم، کنترل تردد RFID و تجهیزات حفاظت فردی با استانداردهای بین‌المللی',
  'hero.slide1.image': 'assets/images/products/hikvision-ds-2cd2t47wd-l3.svg',
  'hero.slide1.image_position': 'center',
  'hero.slide1.link': '/shop?category=cctv-cameras',
  'hero.slide2.image': 'assets/images/products/dahua-hdw3441r3.svg',
  'hero.slide2.image_position': 'center',
  'hero.slide2.link': '/brands',
  'hero.slide3.image': 'assets/images/products/hikvision-ds-7608ni-k2-8.svg',
  'hero.slide3.image_position': 'center',
  'hero.slide3.link': '/shop?category=dvr-nvr',
  'hero.slide4.image': 'assets/images/products/feritac-wireless-alarm-kit.svg',
  'hero.slide4.image_position': 'center',
  'hero.slide4.link': '/shop?category=security-systems',
  'section.categories.title': 'دسته‌بندی محصولات',
  'section.bestsellers.title': 'پرفروش‌ترین محصولات',
  'section.offers.title': 'پیشنهاد شگفت‌انگیز',
  'section.new.title': 'جدیدترین محصولات',
  'section.brands.title': 'برندهای محبوب',
  'section.why.title': 'چرا کمزی؟',
  'promo.topbar.1': 'ارسال رایگان برای سفارش‌های بالای ۵۰۰ هزار تومان',
  'promo.topbar.2': '۷ روز ضمانت بازگشت کالا بدون قید و شرط',
  'promo.topbar.3': 'تضمین اصالت کالا با گارانتی معتبر',
  'promo.topbar.1.image': '',
  'promo.topbar.2.image': '',
  'promo.topbar.3.image': '',
  'promo.topbar.height': '35',
  'promo.topbar.img_height': '20',
  'promo.topbar.img_width': '20',
  'service.ship.title': 'ارسال رایگان',
  'service.ship.desc': 'سفارش‌های بالای ۵۰۰ هزار تومان',
  'service.return.title': '۷ روز ضمانت بازگشت',
  'service.return.desc': 'بدون قید و شرط',
  'service.auth.title': 'تضمین اصالت کالا',
  'service.auth.desc': 'محصول اصل با گارانتی',
  'service.support.title': 'مشاوره تخصصی رایگان',
  'service.support.desc': 'تماس با کارشناسان',
  'footer.brand.desc': 'کمزی فروشگاه تخصصی دوربین مداربسته و سیستم‌های امنیتی با بیش از ۱۰ سال تجربه در ارائه محصولات اورجینال به هموطنان عزیز.',
  'footer.address': 'تهران، خیابان ولیعصر، پلاک ۱۲۳۴، مجتمع تجاری کمزی',
  'footer.copyright': 'تمامی حقوق این وب‌سایت متعلق به فروشگاه کمزی می‌باشد.',
  // Homepage sections (مدیریت صفحه اصلی): order, per-section enable,
  // featured selections and amazing-discounts countdown. Empty selection
  // lists mean "show all" (storefront fallback unchanged).
  'home.sections.order': 'hero,categories,bestsellers,amazing,new,brands',
  'home.sections.hero.enabled': '1',
  'home.sections.categories.enabled': '1',
  'home.sections.bestsellers.enabled': '1',
  'home.sections.amazing.enabled': '1',
  'home.sections.new.enabled': '1',
  'home.sections.brands.enabled': '1',
  'home.topbar.enabled': '1',
  'home.featured.categories': '',
  'home.featured.products': '',
  'home.amazing.products': '',
  'home.amazing.ends_at': '',
};
function ensureContentTable(){
  db.exec(`CREATE TABLE IF NOT EXISTS site_content (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const ins=db.prepare('INSERT OR IGNORE INTO site_content (key, value) VALUES (?, ?)');
  for(const [k,v] of Object.entries(CONTENT_DEFAULTS)) ins.run(k,v);
}
ensureContentTable();
function readContent(){
  try{ ensureContentTable(); }catch(_){}
  const rows=db.prepare('SELECT key, value FROM site_content').all();
  const out={ ...CONTENT_DEFAULTS };
  for(const r of rows){
    // Empty stored section titles must not override the bundled defaults.
    if(/^section\..*\.title$/.test(r.key) && String(r.value||'').trim()==='') continue;
    out[r.key]=r.value;
  }
  // ── Centralized identity: footer contact/brand keys are read-only mirrors
  // of /api/settings store.* (editable ONLY in Admin → اطلاعات فروشگاه).
  try{
    const s=readSettings();
    if(s['store.address']) out['footer.address']=s['store.address'];
    if(s['store.desc']) out['footer.brand.desc']=s['store.desc'];
    if(s['store.name']) out['footer.copyright']='تمامی حقوق این وب‌سایت متعلق به فروشگاه '+s['store.name']+' می‌باشد.';
  }catch(_){}
  return out;
}
api.get('/content', (req,res)=>{ res.json(readContent()); });
api.put('/content', requireAdmin, (req,res)=>{
  const b=req.body||{};
  ensureContentTable();
  const upd=db.prepare("INSERT INTO site_content (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')");
  // Read-only mirrors of centralized store settings — never writable here.
  const READONLY_CONTENT_KEYS=new Set(['footer.address','footer.brand.desc','footer.copyright']);
  for(const k of Object.keys(CONTENT_DEFAULTS)){
    if(READONLY_CONTENT_KEYS.has(k)) continue;
    if(b[k]!==undefined) upd.run(k, String(b[k]).slice(0,2000));
  }
  // also allow any hero/section/promo/service/footer/home key that starts with known prefix
  // (except the read-only centralized mirrors above).
  for(const k of Object.keys(b)){
    if(READONLY_CONTENT_KEYS.has(k)) continue;
    if(!(k in CONTENT_DEFAULTS) && /^(hero|section|promo|service|footer|home)\./.test(k)){
      upd.run(k, String(b[k]).slice(0,2000));
    }
  }
  res.json(readContent());
});

function ensureHeroSlidesTable(){
  try{
    db.exec(`CREATE TABLE IF NOT EXISTS hero_slides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      image TEXT NOT NULL DEFAULT '',
      image_desktop TEXT NOT NULL DEFAULT '',
      image_mobile TEXT NOT NULL DEFAULT '',
      image_position TEXT NOT NULL DEFAULT 'center',
      badge TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      btn1_text TEXT NOT NULL DEFAULT '',
      btn1_url TEXT NOT NULL DEFAULT '',
      btn2_text TEXT NOT NULL DEFAULT '',
      btn2_url TEXT NOT NULL DEFAULT '',
      slide_type TEXT NOT NULL DEFAULT 'content',
      link_url TEXT NOT NULL DEFAULT '',
      show_badge INTEGER NOT NULL DEFAULT 1,
      badge_icon TEXT NOT NULL DEFAULT '',
      show_title INTEGER NOT NULL DEFAULT 1,
      show_text INTEGER NOT NULL DEFAULT 1,
      show_image INTEGER NOT NULL DEFAULT 1,
image_size TEXT NOT NULL DEFAULT 'medium',
      show_btn1 INTEGER NOT NULL DEFAULT 1,
      show_btn2 INTEGER NOT NULL DEFAULT 1,
      content_position TEXT NOT NULL DEFAULT 'right',
      is_active INTEGER NOT NULL DEFAULT 1,
      show_mobile INTEGER NOT NULL DEFAULT 1,
      background_color TEXT NOT NULL DEFAULT '',
      background_gradient_second TEXT NOT NULL DEFAULT '',
      background_gradient_angle TEXT NOT NULL DEFAULT '135deg',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    `);
    var c=db.prepare('SELECT COUNT(*) as c FROM hero_slides').get();
    if(c.c===0){
      var ins=db.prepare('INSERT INTO hero_slides (sort_order,image_desktop,image_mobile,image_position,badge,title,text,btn1_text,btn1_url,btn2_text,btn2_url,show_mobile,background_color,background_gradient_second,background_gradient_angle) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      ins.run(1,'assets/images/products/hikvision-ds-2cd2t47wd-l3.svg','','center','فروش ویژه دوربین مداربسته','دوربین مداربسته حرفه‌ای با بهترین قیمت','دوربین‌های تحت شبکه و آنالوگ از معتبرترین برندهای جهان با ضمانت اصالت کالا و ارسال رایگان','مشاهده محصولات','/shop?category=cctv-cameras','دسته‌بندی محصولات','#categories',1,'','','');
      ins.run(2,'assets/images/products/dahua-hdw3441r3.svg','','center','برندهای معتبر','دوربین مداربسته اورجینال با گارانتی معتبر','محصولات اورجینال هایکویژن، داهوا، یونیکنیو، تیاندی و ویوتک با گارانتی رسمی و ارسال سریع به سراسر کشور','مشاهده محصولات','/shop?category=cctv-cameras','برندها','/brands',1,'','','');
      ins.run(3,'assets/images/products/hikvision-ds-7608ni-k2-8.svg','','center','تخفیف ویژه','سیستم‌های ضبط DVR و NVR با تخفیف ویژه','دستگاه‌های DVR و NVR با ظرفیت ذخیره‌سازی بالا، قیمت استثنایی و ضمانت بازگشت کالا','مشاهده تخفیف‌ها','/shop?category=dvr-nvr','همه محصولات','/shop',1,'','','');
      ins.run(4,'assets/images/products/feritac-wireless-alarm-kit.svg','','center','ارسال رایگان','سیستم‌های امنیتی و کنترل تردد','هشدار دزد بی‌سیم، کنترل تردد RFID و تجهیزات حفاظت فردی با استانداردهای بین‌المللی','مشاهده محصولات','/shop?category=security-systems','دسته‌بندی محصولات','/categories',1,'','','');
    }
    }catch(e){}
  try{ var __hc=db.prepare("SELECT COUNT(*) as c FROM pragma_table_info('hero_slides') WHERE name='slide_type'").get(); if(__hc&&__hc.c===0) db.exec("ALTER TABLE hero_slides ADD COLUMN slide_type TEXT NOT NULL DEFAULT 'content'"); }catch(e){}
  try{ var __hc2=db.prepare("SELECT COUNT(*) as c FROM pragma_table_info('hero_slides') WHERE name='link_url'").get(); if(__hc2&&__hc2.c===0) db.exec("ALTER TABLE hero_slides ADD COLUMN link_url TEXT NOT NULL DEFAULT ''"); }catch(e){}
  var __newCols=[
  ['show_badge',"INTEGER NOT NULL DEFAULT 1"],
  ['badge_icon',"TEXT NOT NULL DEFAULT ''"],
  ['show_title',"INTEGER NOT NULL DEFAULT 1"],
  ['show_text',"INTEGER NOT NULL DEFAULT 1"],
  ['show_image',"TEXT NOT NULL DEFAULT 'medium'"],
  ['show_btn1',"INTEGER NOT NULL DEFAULT 1"],
  ['show_btn2',"INTEGER NOT NULL DEFAULT 1"],
  ['content_position',"TEXT NOT NULL DEFAULT 'right'"],
  ['image_desktop',"TEXT NOT NULL DEFAULT ''"],
  ['image_mobile',"TEXT NOT NULL DEFAULT ''"],
  ['show_mobile',"INTEGER NOT NULL DEFAULT 1"],
  ['background_color',"TEXT NOT NULL DEFAULT ''"],
  ['background_gradient_second',"TEXT NOT NULL DEFAULT ''"],
  ['background_gradient_angle',"TEXT NOT NULL DEFAULT '135deg'"]
];
  __newCols.forEach(function(nc){ try{ var __c=db.prepare("SELECT COUNT(*) as c FROM pragma_table_info('hero_slides') WHERE name='"+nc[0]+"'").get(); if(__c&&__c.c===0) db.exec("ALTER TABLE hero_slides ADD COLUMN "+nc[0]+" "+nc[1]); }catch(e){} });
}
ensureHeroSlidesTable();
api.get('/admin/hero-slides', (req,res)=>{
  try{
    ensureHeroSlidesTable();
    var rows=db.prepare('SELECT * FROM hero_slides ORDER BY sort_order ASC, id ASC').all();
    res.json(rows);
  }catch(e){ res.json([]); }
});
api.get('/hero-slides', (req,res)=>{
  try{
    ensureHeroSlidesTable();
    var rows=db.prepare('SELECT * FROM hero_slides WHERE is_active=1 ORDER BY sort_order ASC, id ASC').all();
    res.json(rows);
  }catch(e){ res.json([]); }
});
api.put('/admin/hero-slides', requireAdmin, (req,res)=>{
  try{
    ensureHeroSlidesTable();
    var b=req.body||{};
    var slides=Array.isArray(b.slides)?b.slides:[];
    var ids=[];
    for(var i=0;i<slides.length;i++){
      var s=slides[i];
      var so=i+1;
      var img=String(s.image||'').trim();
      var imgDesktop=String(s.image_desktop||'').trim();
      var imgMobile=String(s.image_mobile||'').trim();
      var ip=String(s.image_position||'center').trim()||'center';
      var badge=String(s.badge||'').trim();
      var title=String(s.title||'').trim();
      var text=String(s.text||'').trim();
      var b1t=String(s.btn1_text||'').trim();
      var b1u=String(s.btn1_url||'').trim();
      var b2t=String(s.btn2_text||'').trim();
      var b2u=String(s.btn2_url||'').trim();
      var st=(String(s.slide_type||'content').trim()==='full'?'full':'content');
      var lu=String(s.link_url||'').trim();
      var sb=s.show_badge===false||s.show_badge===0?0:1;
      var bi=String(s.badge_icon||'').trim();
      var sti=s.show_title===false||s.show_title===0?0:1;
      var stx=s.show_text===false||s.show_text===0?0:1;
      var si=s.show_image===false||s.show_image===0?0:1;
      var isz=String(s.image_size||'medium').trim()||'medium';
      var sb1=s.show_btn1===false||s.show_btn1===0?0:1;
      var sb2=s.show_btn2===false||s.show_btn2===0?0:1;
      var cp=String(s.content_position||'right').trim()||'right';
      var active=s.is_active===false||s.is_active===0?0:1;
      var showMobile=s.show_mobile===false||s.show_mobile===0?0:1;
      var bg1=String(s.background_color||'').trim();
      var bg2=String(s.background_gradient_second||'').trim();
      var bgAng=String(s.background_gradient_angle||'135deg').trim()||'135deg';
      if(s.id){
        var existing=db.prepare('SELECT id FROM hero_slides WHERE id=?').get(s.id);
        if(existing){
          db.prepare("UPDATE hero_slides SET sort_order=?, image=?, image_desktop=?, image_mobile=?, image_position=?, badge=?, title=?, text=?, btn1_text=?, btn1_url=?, btn2_text=?, btn2_url=?, slide_type=?, link_url=?, show_badge=?, badge_icon=?, show_title=?, show_text=?, show_image=?, image_size=?, show_btn1=?, show_btn2=?, content_position=?, is_active=?, show_mobile=?, background_color=?, background_gradient_second=?, background_gradient_angle=?, updated_at=datetime('now') WHERE id=?").run(so,img,imgDesktop,imgMobile,ip,badge,title,text,b1t,b1u,b2t,b2u,st,lu,sb,bi,sti,stx,si,isz,sb1,sb2,cp,active,showMobile,bg1,bg2,bgAng,s.id);
          ids.push(s.id);
        }
      }else{
        var r=db.prepare("INSERT INTO hero_slides (sort_order,image,image_desktop,image_mobile,image_position,badge,title,text,btn1_text,btn1_url,btn2_text,btn2_url,slide_type,link_url,show_badge,badge_icon,show_title,show_text,show_image,image_size,show_btn1,show_btn2,content_position,is_active,show_mobile,background_color,background_gradient_second,background_gradient_angle) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(so,img,imgDesktop,imgMobile,ip,badge,title,text,b1t,b1u,b2t,b2u,st,lu,sb,bi,sti,stx,si,isz,sb1,sb2,cp,active,showMobile,bg1,bg2,bgAng);
        ids.push(r.lastInsertRowid);
      }
    }
    // Delete slides not in the list
    if(slides.length>0){
      var placeholders=ids.map(function(){return '?';}).join(',');
      db.prepare('DELETE FROM hero_slides WHERE id NOT IN ('+placeholders+')').run(...ids);
    }
    var rows=db.prepare('SELECT * FROM hero_slides ORDER BY sort_order ASC, id ASC').all();
    res.json(rows);
  }catch(e){ res.status(500).json({error:e.message}); }
});

if(process.env.NODE_ENV!=='production') api.get('/_test500', (req,res,next)=> next(new Error('intentional 500')));
// ── Gallery (admin-only): list / upload / delete / move / folders ──
// Uses the existing project assets location: assets/images (+ uploads subdir).
// Auth: existing requireAdmin (admin_sessions tokens). No new auth system.
const fs = require('fs');
const IMAGES_ROOT = path.join(__dirname, '..', 'assets', 'images');
const UPLOADS_DIR = path.join(IMAGES_ROOT, 'uploads');
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (_) {}
const IMAGE_EXTS = new Set(['.png','.jpg','.jpeg','.gif','.webp','.svg','.avif','.bmp','.ico']);
function isSafePath(full, root) {
  const resolvedRoot = path.resolve(root);
  const resolvedFull = path.resolve(full);
  return resolvedFull === resolvedRoot || resolvedFull.startsWith(resolvedRoot + path.sep);
}
function statItem(full, rel) {
  const stat = fs.statSync(full);
  const isDir = stat.isDirectory();
  const base = path.basename(full);
  const item = { name: base, path: '/' + rel.replace(/\\/g, '/'), isDir, size: isDir ? 0 : stat.size, mtime: stat.mtime.toISOString() };
  if (!isDir) { item.filename = base; item.url = '/assets/images/' + rel.replace(/\\/g, '/'); }
  return item;
}
function listDir(relPath) {
  const root = path.resolve(IMAGES_ROOT);
  const target = relPath ? path.resolve(IMAGES_ROOT, relPath) : root;
  if (!isSafePath(target, root)) return null;
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) return null;
  const entries = fs.readdirSync(target, { withFileTypes: true });
  const dirs = [], files = [];
  for (const e of entries) {
    const full = path.join(target, e.name);
    const rel = path.relative(root, full).replace(/\\/g, '/');
    if (e.isDirectory()) { dirs.push(statItem(full, rel)); continue; }
    const ext = path.extname(e.name).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    files.push(statItem(full, rel));
  }
  dirs.sort((a,b)=>a.name.localeCompare(b.name));
  files.sort((a,b)=>a.name.localeCompare(b.name));
  return { folders: dirs, files: files, currentPath: relPath ? '/' + relPath : '/' };
}
function galleryListFiles() {
  const out = [];
  function walk(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      const ext = path.extname(e.name).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) continue;
      let stat = null;
      try { stat = fs.statSync(full); } catch (_) { continue; }
      const rel = path.relative(path.join(__dirname, '..'), full).replace(/\\/g, '/');
      out.push({ filename: e.name, path: '/' + rel, url: '/' + rel, size: stat.size, mtime: stat.mtime.toISOString() });
    }
  }
  walk(IMAGES_ROOT);
  out.sort((a, b) => (a.path < b.path ? -1 : 1));
  return out;
}
const galleryStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = req.query.folder || '';
    const target = folder ? path.resolve(IMAGES_ROOT, folder) : UPLOADS_DIR;
    if (!isSafePath(target, IMAGES_ROOT)) return cb(new Error('Invalid folder'), null);
    try { fs.mkdirSync(target, { recursive: true }); } catch (_) {}
    cb(null, target);
  },
  filename: (req, file, cb) => {
    const base = path.basename(file.originalname || 'image', path.extname(file.originalname || '')).replace(/[^a-zA-Z0-9\u0600-\u06FF._-]+/g, '_').slice(0, 80) || 'image';
    const ext = (path.extname(file.originalname || '').toLowerCase() || '.png').slice(0, 10);
    cb(null, Date.now().toString(36) + '-' + base + ext);
  },
});
function galleryFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (IMAGE_EXTS.has(ext)) return cb(null, true);
  cb(new Error('Only image files are allowed'));
}
const galleryUpload = multer({ storage: galleryStorage, fileFilter: galleryFileFilter, limits: { files: 1 } });
api.get('/admin/gallery', requireAdmin, (req, res) => {
  const relPath = String(req.query.path || '').replace(/^\/+/, '');
  const result = listDir(relPath);
  if (!result) return res.status(400).json({ error: 'Invalid path' });
  // Flat recursive file list: the shared media picker (بنرهای تبلیغاتی,
  // بنرهای اسلایدر, لوگو و…) consumes `items` and has no folder navigation,
  // so without this it could only ever show "تصویری یافت نشد".
  if (!relPath) result.items = galleryListFiles();
  res.json(result);
});
api.post('/admin/gallery/upload', requireAdmin, (req, res) => {
  galleryUpload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'image file is required' });
    const rel = path.relative(path.join(__dirname, '..'), req.file.path).replace(/\\/g, '/');
    res.status(201).json({ filename: req.file.filename, path: '/' + rel, url: '/' + rel, size: req.file.size });
  });
});
api.post('/admin/gallery/folder', requireAdmin, (req, res) => {
  const parent = String(req.query.path || req.body?.path || '').replace(/^\/+/, '');
  const name = String(req.body?.name || '').trim();
  if (!name || /[\\/]/.test(name)) return res.status(400).json({ error: 'Invalid folder name' });
  const parentPath = parent ? path.resolve(IMAGES_ROOT, parent) : path.resolve(IMAGES_ROOT);
  if (!isSafePath(parentPath, IMAGES_ROOT)) return res.status(400).json({ error: 'Invalid path' });
  const newFolder = path.join(parentPath, name);
  if (!isSafePath(newFolder, IMAGES_ROOT)) return res.status(400).json({ error: 'Invalid path' });
  try {
    if (fs.existsSync(newFolder)) return res.status(409).json({ error: 'Folder already exists' });
    fs.mkdirSync(newFolder, { recursive: true });
    const rel = path.relative(path.join(__dirname, '..'), newFolder).replace(/\\/g, '/');
    res.status(201).json({ name, path: '/' + rel, isDir: true });
  } catch (e) { res.status(500).json({ error: 'Failed to create folder' }); }
});
api.delete('/admin/gallery', requireAdmin, (req, res) => {
  const rel = String(req.query.path || req.body?.path || '');
  if (!rel) return res.status(400).json({ error: 'path is required' });
  const noLead = rel.replace(/^\/+/, '');
  const full = path.resolve(IMAGES_ROOT, noLead);
  const root = path.resolve(IMAGES_ROOT);
  if (!isSafePath(full, root)) return res.status(400).json({ error: 'Invalid path' });
  try {
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'Not found' });
    const stat = fs.statSync(full);
    if (stat.isFile()) {
      if (!IMAGE_EXTS.has(path.extname(full).toLowerCase())) return res.status(400).json({ error: 'Invalid path' });
      fs.unlinkSync(full);
    } else if (stat.isDirectory()) {
      fs.rmSync(full, { recursive: true, force: true });
    }
    res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: 'Delete failed' }); }
});
api.post('/admin/gallery/bulk-delete', requireAdmin, (req, res) => {
  const paths = Array.isArray(req.body?.paths) ? req.body.paths : [];
  if (!paths.length) return res.status(400).json({ error: 'paths array required' });
  const root = path.resolve(IMAGES_ROOT);
  const results = { deleted: [], failed: [] };
  for (const rel of paths) {
    const noLead = String(rel).replace(/^\/+/, '');
    const full = path.resolve(IMAGES_ROOT, noLead);
    if (!isSafePath(full, root)) { results.failed.push({ path: rel, error: 'Invalid path' }); continue; }
    try {
      if (!fs.existsSync(full)) { results.failed.push({ path: rel, error: 'Not found' }); continue; }
      const stat = fs.statSync(full);
      if (stat.isFile()) {
        if (!IMAGE_EXTS.has(path.extname(full).toLowerCase())) { results.failed.push({ path: rel, error: 'Invalid file type' }); continue; }
        fs.unlinkSync(full);
      } else if (stat.isDirectory()) {
        fs.rmSync(full, { recursive: true, force: true });
      }
      results.deleted.push(rel);
    } catch (e) { results.failed.push({ path: rel, error: e.message }); }
  }
  res.json(results);
});
api.post('/admin/gallery/move', requireAdmin, (req, res) => {
  const paths = Array.isArray(req.body?.paths) ? req.body.paths : [];
  const dest = String(req.body?.dest || '').replace(/^\/+/, '');
  if (!paths.length || typeof dest !== 'string') return res.status(400).json({ error: 'paths array and dest required' });
  const root = path.resolve(IMAGES_ROOT);
  const destFull = dest ? path.resolve(IMAGES_ROOT, dest) : root;
  if (!isSafePath(destFull, root) || !fs.existsSync(destFull) || !fs.statSync(destFull).isDirectory()) {
    return res.status(400).json({ error: 'Invalid destination folder' });
  }
  const results = { moved: [], failed: [] };
  for (const rel of paths) {
    const noLead = String(rel).replace(/^\/+/, '');
    const src = path.resolve(IMAGES_ROOT, noLead);
    if (!isSafePath(src, root)) { results.failed.push({ path: rel, error: 'Invalid path' }); continue; }
    if (!fs.existsSync(src)) { results.failed.push({ path: rel, error: 'Not found' }); continue; }
    const base = path.basename(src);
    const target = path.join(destFull, base);
    if (!isSafePath(target, root)) { results.failed.push({ path: rel, error: 'Invalid destination' }); continue; }
    if (fs.existsSync(target)) { results.failed.push({ path: rel, error: 'Destination already exists' }); continue; }
    try {
      fs.renameSync(src, target);
      const newRel = path.relative(path.join(__dirname, '..'), target).replace(/\\/g, '/');
      results.moved.push({ from: rel, to: '/' + newRel });
    } catch (e) { results.failed.push({ path: rel, error: e.message }); }
  }
  res.json(results);
});
api.get('/admin/gallery/folders', requireAdmin, (req, res) => {
  const out = [];
  function walk(dir, relPrefix) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const full = path.join(dir, e.name);
      const rel = (relPrefix ? relPrefix + '/' : '') + e.name;
      out.push({ name: e.name, path: '/' + rel });
      walk(full, rel);
    }
  }
  walk(IMAGES_ROOT, '');
  out.sort((a, b) => a.path.localeCompare(b.path));
  res.json({ folders: out });
});
// ── Content pages (DB-backed, admin CRUD, public read) ──
function ensurePagesTable(){
  db.exec(`CREATE TABLE IF NOT EXISTS site_pages (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    excerpt TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'published',
    is_system INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  // Visual Builder round-trip: header chrome edited in slug mode must persist.
  // (Footer is removed on DB pages by common.js, so only the header is stored.)
  try { var _pc=db.prepare('PRAGMA table_info(site_pages)').all().map(function(c){return c.name;}); if(_pc.indexOf('header_html')===-1) db.exec("ALTER TABLE site_pages ADD COLUMN header_html TEXT NOT NULL DEFAULT ''"); } catch(_){}
  const seeds = [
    ['about','درباره ما','<p>کمزی فروشگاه تخصصی دوربین مداربسته و سیستم‌های امنیتی است؛ از سال ۱۳۹۳ در کنار نصاب‌ها و کسب‌وکارهایی بوده‌ایم که امنیت فضای خود را جدی می‌گیرند.</p>','درباره فروشگاه کمزی',1],
    ['contact','تماس با ما','<p>تهران، خیابان ولیعصر، پلاک ۱۲۳۴ — تلفن ۰۲۱-۴۴۵۵۶۶۷۷</p>','اطلاعات تماس',1],
    ['faq','سوالات متداول','<p>پاسخ سوالات پرتکرار مشتریان.</p>','سوالات متداول',1],
    ['terms','قوانین و مقررات','<p>قوانین استفاده از فروشگاه.</p>','قوانین فروشگاه',1],
    ['privacy','حریم خصوصی','<p>سیاست حریم خصوصی فروشگاه.</p>','حریم خصوصی',1],
    ['shipping','شرایط ارسال','<p>شرایط و هزینه‌های ارسال.</p>','شرایط ارسال',1],
    ['returns','بازگشت کالا','<p>شرایط ۷ روز ضمانت بازگشت کالا.</p>','بازگشت کالا',1],
    ['authenticity','ضمانت اصالت','<p>تضمین اصالت کالا با گارانتی معتبر.</p>','ضمانت اصالت',1],
    ['pricing','راهنمای قیمت‌گذاری','<p>راهنمای قیمت‌گذاری محصولات.</p>','قیمت‌گذاری',1],
  ];
  const ins = db.prepare("INSERT OR IGNORE INTO site_pages (slug,title,body,excerpt,status,is_system) VALUES (?,?,?,?,'published',?)");
  for(const s of seeds) ins.run(s[0],s[1],s[2],s[3],s[4]);
}
ensurePagesTable();
function pageRow(r){ return r ? { slug:r.slug, title:r.title, body:r.body, headerHtml:r.header_html||'', excerpt:r.excerpt, status:r.status, is_system:!!r.is_system, updated_at:r.updated_at, url:'/page.html?slug='+encodeURIComponent(r.slug), file:r.slug+'.html', seo:seoFor('page', r.slug) } : null; }
function validSlug(s){ return typeof s==='string' && /^[a-z0-9-]{1,80}$/.test(s); }
api.get('/pages', (req,res)=>{
  try{ ensurePagesTable(); }catch(_){}
  const rows = db.prepare('SELECT * FROM site_pages ORDER BY slug').all();
  res.json({ items: rows.map(pageRow) });
});
api.get('/pages/:slug', (req,res)=>{
  try{ ensurePagesTable(); }catch(_){}
  const r = db.prepare('SELECT * FROM site_pages WHERE slug=?').get(req.params.slug);
  if(!r || r.status!=='published') return res.status(404).json({ error:'Page not found' });
  res.json(pageRow(r));
});
api.get('/admin/pages', requireAdmin, (req,res)=>{
  try{ ensurePagesTable(); }catch(_){}
  const rows = db.prepare('SELECT * FROM site_pages ORDER BY slug').all();
  // also list existing static HTML files
  let files = [];
  try{
    files = fs.readdirSync(ROOT_LIKE()).filter(f=>/\.html$/i.test(f));
  }catch(_){}
  res.json({ items: rows.map(pageRow), staticFiles: files });
});
api.get('/admin/pages/:slug', requireAdmin, (req,res)=>{
  try{ ensurePagesTable(); }catch(_){}
  const r = db.prepare('SELECT * FROM site_pages WHERE slug=?').get(req.params.slug);
  if(!r) return res.status(404).json({ error:'Page not found' });
  res.json(pageRow(r));
});
function ROOT_LIKE(){ return path.join(__dirname, '..'); }
api.post('/admin/pages', requireAdmin, (req,res)=>{
  try{ ensurePagesTable(); }catch(_){}
  const { slug='', title='', body='', excerpt='', status='published' } = req.body||{};
  const s = String(slug).trim().toLowerCase();
  if(!validSlug(s)) return res.status(400).json({ error:'Invalid slug (a-z, 0-9, -)' });
  if(!String(title).trim()) return res.status(400).json({ error:'Title is required' });
  try{
    db.prepare("INSERT INTO site_pages (slug,title,body,excerpt,status,updated_at) VALUES (?,?,?,?,'published',datetime('now'))").run(s, String(title).slice(0,200), String(body).slice(0,50000), String(excerpt||'').slice(0,500));
    if(status==='draft') db.prepare("UPDATE site_pages SET status='draft' WHERE slug=?").run(s);
  }catch(e){ if(String(e.message||'').includes('UNIQUE')) return res.status(409).json({ error:'Slug already exists' }); throw e; }
  res.status(201).json(pageRow(db.prepare('SELECT * FROM site_pages WHERE slug=?').get(s)));
});
api.put('/admin/pages/:slug', requireAdmin, (req,res)=>{
  try{ ensurePagesTable(); }catch(_){}
  const s = req.params.slug;
  const cur = db.prepare('SELECT * FROM site_pages WHERE slug=?').get(s);
  if(!cur) return res.status(404).json({ error:'Page not found' });
  const b = req.body||{};
  // headerHtml arrives from the Visual Builder (cleanClone of #site-header); it was
  // previously discarded, so header edits showed "saved" yet reverted on reload.
  // Empty payloads keep the stored value (mirrors the static-pages handler).
  var newHeader=(b.headerHtml!==undefined&&String(b.headerHtml).trim())?String(b.headerHtml).slice(0,100000):(cur.header_html||'');
  db.prepare("UPDATE site_pages SET title=COALESCE(?,title), body=COALESCE(?,body), header_html=COALESCE(?,header_html), excerpt=COALESCE(?,excerpt), status=COALESCE(?,status), updated_at=datetime('now') WHERE slug=?").run(
    b.title!==undefined?String(b.title).slice(0,200):cur.title,
    b.body!==undefined?String(b.body).slice(0,50000):cur.body,
    newHeader,
    b.excerpt!==undefined?String(b.excerpt||'').slice(0,500):cur.excerpt,
    b.status!==undefined?(b.status==='draft'?'draft':'published'):cur.status, s);
  res.json(pageRow(db.prepare('SELECT * FROM site_pages WHERE slug=?').get(s)));
});
api.delete('/admin/pages/:slug', requireAdmin, (req,res)=>{
  try{ ensurePagesTable(); }catch(_){}
  const cur = db.prepare('SELECT * FROM site_pages WHERE slug=?').get(req.params.slug);
  if(!cur) return res.status(404).json({ error:'Page not found' });
  if(cur.is_system) return res.status(400).json({ error:'System pages cannot be deleted (they can be edited or drafted)' });
  db.prepare('DELETE FROM site_pages WHERE slug=?').run(req.params.slug);
  res.json({ ok:true });
});
// ── Static HTML files (read/write full file, minimal) ──
function safeStaticFile(name){
  const f = String(name||'');
  if(!/^[a-z0-9-]+\.html$/i.test(f)) return null;
  const p = path.join(ROOT_LIKE(), f);
  if(path.dirname(p) !== ROOT_LIKE()) return null;
  return p;
}
function parseStaticHtml(html, file){
  const t = (html.match(/<title[^>]*>([^<]*)<\/title>/i)||[])[1]||file;
  const m = (html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)||[])[1];
  const b = m!==undefined ? m : ((html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)||[])[1]||'');
  return { file, title: String(t||'').trim(), body: String(b||'').trim() };
}
api.get('/admin/static-pages/:file', requireAdmin, (req,res)=>{
  const p = safeStaticFile(req.params.file);
  if(!p) return res.status(400).json({ error:'Invalid file' });
  if(!fs.existsSync(p)) return res.status(404).json({ error:'File not found' });
  res.json(parseStaticHtml(fs.readFileSync(p,'utf8'), path.basename(p)));
});
api.put('/admin/static-pages/:file', requireAdmin, (req,res)=>{
  const p = safeStaticFile(req.params.file);
  if(!p) return res.status(400).json({ error:'Invalid file' });
  if(!fs.existsSync(p)) return res.status(404).json({ error:'File not found' });
  const b = req.body||{};
  let html = fs.readFileSync(p,'utf8');
  if(b.title!==undefined) html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, '<title>'+String(b.title).slice(0,200).replace(/</g,'&lt;')+' | کمزی</title>');
  if(b.headerHtml!==undefined && /<header[^>]*(?:id="site-header"|site-header)[^>]*>[\s\S]*?<\/header>/i.test(html)){
    if(String(b.headerHtml).trim()) html = html.replace(/(<header[^>]*(?:id="site-header"|site-header)[^>]*>)[\s\S]*?(<\/header>)/i, '$1'+String(b.headerHtml).slice(0,100000)+'$2');
  }
  if(b.footerHtml!==undefined && /<footer[^>]*(?:id="site-footer"|site-footer)[^>]*>[\s\S]*?<\/footer>/i.test(html)){
    if(String(b.footerHtml).trim()) html = html.replace(/(<footer[^>]*(?:id="site-footer"|site-footer)[^>]*>)[\s\S]*?(<\/footer>)/i, '$1'+String(b.footerHtml).slice(0,100000)+'$2');
  }
  if(b.body!==undefined){
    const inner = String(b.body).slice(0,500000);
    if(/<main[^>]*>[\s\S]*?<\/main>/i.test(html)) html = html.replace(/(<main[^>]*>)[\s\S]*?(<\/main>)/i, '$1'+inner+'$2');
    else if(/<body[^>]*>[\s\S]*?<\/body>/i.test(html)) html = html.replace(/(<body[^>]*>)[\s\S]*?(<\/body>)/is, '$1'+inner+'$2');
    else return res.status(400).json({ error:'No editable region' });
  }
  fs.writeFileSync(p, html, 'utf8');
  res.json(parseStaticHtml(html, path.basename(p)));
});
// ── Static storefront (unchanged UI) ──
const ROOT = path.join(__dirname, '..');
// ── Clean URLs (canonical, no .html) ──
// Same HTML files served under clean paths; legacy .html URLs (with their
// identifying query params) 301-redirect to the canonical clean form.
// No UI/API change: files, CSS, JS and /api routes are untouched.
(function installCleanUrls(){
  var fsMod = require('fs');
  var DETAIL = {
    '/product.html': { keys: ['slug', 'id'], base: '/product' },
    '/category.html': { keys: ['slug', 'category'], base: '/category' },
    '/brand.html': { keys: ['slug', 'brand'], base: '/brand' },
    '/brand-detail.html': { keys: ['brand', 'slug'], base: '/brand' },
    '/article-detail.html': { keys: ['id', 'slug'], base: '/article' },
    '/page.html': { keys: ['slug'], base: '/page' },
    '/account-order-detail.html': { keys: ['id'], base: '/account/orders' }
  };
  var PLAIN = {
    '/index.html': '/',
    '/shop.html': '/shop',
    '/brands.html': '/brands',
    '/categories.html': '/categories',
    '/articles.html': '/articles',
    '/login.html': '/login',
    '/register.html': '/register',
    '/forgot-password.html': '/forgot-password',
    '/offline.html': '/offline',
    '/account.html': '/account',
    '/account-cart.html': '/cart',
    '/account-orders.html': '/account/orders',
    '/account-profile.html': '/account/profile',
    '/account-addresses.html': '/account/addresses',
    '/account-wishlist.html': '/account/wishlist',
    '/account-notifications.html': '/account/notifications',
    '/account-contact.html': '/account/contact',
    '/checkout.html': '/checkout',
    '/checkout-step1.html': '/checkout/step1',
    '/checkout-step2.html': '/checkout/step2',
    '/checkout-step3.html': '/checkout/step3',
    '/checkout-step4.html': '/checkout/step4',
    '/about.html': '/about',
    '/contact.html': '/contact',
    '/faq.html': '/faq',
    '/returns.html': '/returns',
    '/shipping.html': '/shipping',
    '/privacy.html': '/privacy',
    '/terms.html': '/terms',
    '/authenticity.html': '/authenticity',
    '/pricing.html': '/pricing'
  };
  function enc(s){ return encodeURIComponent(String(s)); }
  function restQuery(q, drop){
    var out = [];
    Object.keys(q).forEach(function(k){
      if (drop.indexOf(k) !== -1) return;
      var v = q[k];
      if (Array.isArray(v)) v.forEach(function(x){ out.push(enc(k) + '=' + enc(x)); });
      else if (v !== undefined) out.push(enc(k) + '=' + enc(v));
    });
    return out.length ? '?' + out.join('&') : '';
  }
  // 1) Legacy .html -> clean canonical (301). Bare files (no identifying param) keep serving as before.
  app.use(function cleanUrlRedirect(req, res, next){
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    var p = req.path;
    var d = DETAIL[p];
    if (d) {
      var ref = null, used = null;
      for (var i = 0; i < d.keys.length; i++) {
        var v = req.query && req.query[d.keys[i]];
        if (v !== undefined && v !== null && String(v) !== '') { ref = String(v); used = d.keys[i]; break; }
      }
      if (ref === null) return next();
      return res.redirect(301, d.base + '/' + enc(ref) + restQuery(req.query || {}, [used]));
    }
    var t = PLAIN[p];
    if (t) return res.redirect(301, t + restQuery(req.query || {}, []));
    return next();
  });
  // 2) Clean routes -> underlying HTML files (browser URL stays clean).
  function serveClean(file){
    return function(req, res, next){
      try{
        var fp = path.join(ROOT, file);
        if (!fsMod.existsSync(fp)) return next();
        var html = fsMod.readFileSync(fp, 'utf8');
        // Pages use relative asset/link URLs: anchor them at site root so
        // nested clean paths (e.g. /product/123) resolve identically.
        if (html.indexOf('<base') === -1) html = html.replace(/<head([^>]*)>/i, '<head$1><base href="/">');
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
      }catch(e){ next(); }
    };
  }
  app.get('/product/:ref', serveClean('product.html'));
  app.get('/category/:ref', serveClean('category.html'));
  app.get('/brand/:ref', serveClean('brand-detail.html'));
  app.get('/article/:ref', serveClean('article-detail.html'));
  app.get('/page/:ref', serveClean('page.html'));
  app.get('/shop', serveClean('shop.html'));
  app.get('/brands', serveClean('brands.html'));
  app.get('/categories', serveClean('categories.html'));
  app.get('/articles', serveClean('articles.html'));
  app.get('/login', serveClean('login.html'));
  app.get('/register', serveClean('register.html'));
  app.get('/forgot-password', serveClean('forgot-password.html'));
  app.get('/offline', serveClean('offline.html'));
  app.get('/cart', serveClean('account-cart.html'));
  /* Alias for the mobile product-page header cart link (/checkout/cart/). */
  app.get('/checkout/cart', serveClean('account-cart.html'));
  app.get('/account', serveClean('account.html'));
  app.get('/account/orders', serveClean('account-orders.html'));
  app.get('/account/orders/:ref', serveClean('account-order-detail.html'));
  app.get('/account/profile', serveClean('account-profile.html'));
  app.get('/account/addresses', serveClean('account-addresses.html'));
  app.get('/account/wishlist', serveClean('account-wishlist.html'));
  app.get('/account/notifications', serveClean('account-notifications.html'));
  app.get('/account/contact', serveClean('account-contact.html'));
  app.get('/checkout', serveClean('checkout.html'));
  app.get('/checkout/step1', serveClean('checkout-step1.html'));
  app.get('/checkout/step2', serveClean('checkout-step2.html'));
  app.get('/checkout/step3', serveClean('checkout-step3.html'));
  app.get('/checkout/step4', serveClean('checkout-step4.html'));
  app.get('/about', serveClean('about.html'));
  app.get('/contact', serveClean('contact.html'));
  app.get('/faq', serveClean('faq.html'));
  app.get('/returns', serveClean('returns.html'));
  app.get('/shipping', serveClean('shipping.html'));
  app.get('/privacy', serveClean('privacy.html'));
  app.get('/terms', serveClean('terms.html'));
  app.get('/authenticity', serveClean('authenticity.html'));
  app.get('/pricing', serveClean('pricing.html'));
})();

// ── robots.txt / sitemap.xml (SEO) ────────────────────────────────────────
// The canonical origin comes from the store.website setting (the live domain
// is preserved); a request host override keeps local/staging deployments
// self-consistent without ever rewriting the stored domain.
const SITE_ORIGIN = (function () {
  try {
    var w = String(readSettings()['store.website'] || '').trim();
    var m = w.match(/^(?:https?:\/\/)?([^/\s]+)/i);
    return m ? ('https://' + m[1].replace(/^www\./, 'www.')) : 'https://www.camzy.com';
  } catch (e) { return 'https://www.camzy.com'; }
})();
function siteOrigin(req) {
  try {
    if (req && req.headers && req.headers.host) {
      var h = String(req.headers.host);
      if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(h)) return 'http://' + h;
    }
  } catch (e) {}
  return SITE_ORIGIN;
}
app.get('/robots.txt', (req, res) => {
  var origin = siteOrigin(req);
  var body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /checkout',
    'Disallow: /checkout/',
    'Disallow: /account',
    'Disallow: /account/',
    'Disallow: /cart',
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /forgot-password',
    'Disallow: /offline',
    '',
    'Sitemap: ' + origin + '/sitemap.xml',
    ''
  ].join('\n');
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(body);
});
app.get('/sitemap.xml', (req, res) => {
  var origin = siteOrigin(req);
  var urls = [];
  function push(loc, priority, changefreq) {
    urls.push({ loc: loc, priority: priority, changefreq: changefreq });
  }
  push(origin + '/', '1.0', 'daily');
  push(origin + '/shop', '0.9', 'daily');
  push(origin + '/categories', '0.8', 'weekly');
  push(origin + '/brands', '0.7', 'weekly');
  push(origin + '/articles', '0.7', 'weekly');
  push(origin + '/about', '0.6', 'monthly');
  push(origin + '/contact', '0.6', 'monthly');
  push(origin + '/faq', '0.6', 'monthly');
  push(origin + '/shipping', '0.4', 'yearly');
  push(origin + '/returns', '0.4', 'yearly');
  push(origin + '/authenticity', '0.4', 'yearly');
  push(origin + '/pricing', '0.4', 'yearly');
  push(origin + '/privacy', '0.3', 'yearly');
  push(origin + '/terms', '0.3', 'yearly');
  try {
    var cats = db.prepare("SELECT slug FROM categories WHERE slug IS NOT NULL AND slug != ''").all();
    for (var i = 0; i < cats.length; i++) push(origin + '/category/' + encodeURIComponent(cats[i].slug), '0.8', 'weekly');
    var brands = db.prepare("SELECT name FROM brands WHERE name IS NOT NULL AND name != ''").all();
    for (var j = 0; j < brands.length; j++) push(origin + '/brand/' + encodeURIComponent(brands[j].name), '0.6', 'weekly');
    var prods = db.prepare("SELECT slug FROM products WHERE slug IS NOT NULL AND slug != '' AND is_active = 1").all();
    for (var k = 0; k < prods.length; k++) push(origin + '/product/' + encodeURIComponent(prods[k].slug), '0.7', 'weekly');
    var arts = db.prepare("SELECT id FROM articles WHERE status = 'published'").all();
    for (var m2 = 0; m2 < arts.length; m2++) push(origin + '/article/' + encodeURIComponent(arts[m2].id), '0.6', 'monthly');
  } catch (e) { logWarn('sitemap catalog lookup failed', { error: String(e && e.message || e) }); }
  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(function (u) {
      return '  <url><loc>' + u.loc.replace(/&/g, '&amp;') + '</loc><changefreq>' + u.changefreq + '</changefreq><priority>' + u.priority + '</priority></url>';
    }).join('\n') +
    '\n</urlset>\n';
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.send(xml);
});
// Prevent source/template/config leakage: the static root contains server code,
// migration scripts, logs and duplicate copies of the project. Block public
// access to those paths while keeping the storefront assets available.
function blockSensitivePaths(req, res, next) {
  const p = (req.path || '/');
  // Normalize once against %2e/%2f-style evasions: decode, then map any
  // remaining encoded dots/slashes/backslashes to their literal form.
  let norm = '';
  try { norm = decodeURIComponent(String(req.originalUrl || p).split('?')[0]); } catch (_) { norm = ''; }
  norm = String(norm).replace(/%2e/gi, '.').replace(/%2f/gi, '/').replace(/%5c/gi, '/');
  const paths = [p, norm];
  const isData = paths.some((s) => /^\/data(\/|$)/i.test(s || ''));
  if (isData) return res.status(404).type('text/plain').send('Not found');
  if (paths.some((s) => /\.(db|db-wal|db-shm)$/i.test(s || ''))) return res.status(404).type('text/plain').send('Not found');
  if (/^\/server(\/|$)/i.test(p)) return res.status(404).type('text/plain').send('Not found');
  /* Nested duplicate copies of the project (abzar-shokri/ and any deeper
     copy) must never be reachable over HTTP. */
  if (/(^|\/)abzar-shokri(\/|$)/i.test(p)) return res.status(404).type('text/plain').send('Not found');
  if (/^\/admin\/admin(\/|$)/i.test(p)) return res.status(404).type('text/plain').send('Not found');
  if (/\.(env|log|sql|sqlite|sqlite-wal|sqlite-shm|bak|ps1|bat|md|txt|mjs)$/i.test(p)) return res.status(404).type('text/plain').send('Not found');
  if (p === '/package.json' || p === '/package-lock.json') return res.status(404).type('text/plain').send('Not found');
  next();
}
app.use(blockSensitivePaths);
app.use(express.static(ROOT, { index: 'index.html' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ error: 'Payload too large', requestId: req.requestId });
  }
  console.error(err);
  try{
    let userId=null;
    try{ const a=getAuthUser(req); if(a) userId=a.row.id; }catch(_){}
    try{ const ad=getAdminAuth(req); if(ad) userId='admin:'+ad.row.id; }catch(_){}
    const duration = req._startAt ? Date.now()-req._startAt : undefined;
    logError('unhandled 5xx', { requestId:req.requestId, method:req.method, path:req.originalUrl, status:500, statusCode:500, ...(userId?{userId}:{}), errorName: err.name||'Error', error: err.message, message: err.message, stack: err.stack?.slice(0,4000), durationMs: duration, duration });
  }catch(_){}
  res.status(500).json({ error: 'Internal server error', requestId: req.requestId });
});



module.exports = app;

if (require.main === module) {
  const PORT = parseInt(process.env.PORT, 10) || 3000;
  app.listen(PORT, () => console.log(`Camzy server running at http://127.0.0.1:${PORT}`));
}
