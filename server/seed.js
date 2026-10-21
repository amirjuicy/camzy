/* Seed catalog data (categories, brands, products) from assets/js/data.js. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const bcrypt = require('bcryptjs');
const { getDb } = require('./db');
const { migrate } = require('./migrate');

function loadAppData() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'data.js'), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`${src}\nthis.__AppData = AppData;`, sandbox);
  return sandbox.__AppData;
}

function seed() {
  migrate();
  const db = getDb();
  const data = loadAppData();

  db.exec('BEGIN');
  try {
    const upsertCat = db.prepare(`
      INSERT INTO categories (id, name, slug, icon, color, description, product_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, slug=excluded.slug, icon=excluded.icon,
        color=excluded.color, description=excluded.description, product_count=excluded.product_count`);
    const delSubs = db.prepare('DELETE FROM subcategories WHERE category_id = ?');
    const insSub = db.prepare('INSERT OR IGNORE INTO subcategories (category_id, name) VALUES (?, ?)');
    for (const c of data.categories) {
      upsertCat.run(c.id, c.name, c.slug, c.icon || '', c.color || '', c.description || '', c.count || 0);
      delSubs.run(c.id);
      for (const s of c.subcategories || []) insSub.run(c.id, s);
    }

    const upsertBrand = db.prepare(`
      INSERT INTO brands (id, name, display_name, logo, country, description)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, display_name=excluded.display_name,
        logo=excluded.logo, country=excluded.country, description=excluded.description`);
    const brandIdByName = new Map();
    for (const b of data.brands) {
      upsertBrand.run(b.id, b.name, b.displayName || b.name, b.logo || '', b.country || '', b.description || '');
      brandIdByName.set(b.name, b.id);
    }

    const upsertProduct = db.prepare(`
      INSERT INTO products (id, name, slug, brand, brand_name, brand_id, category, category_slug,
        category_id, image, images_json, price, old_price, rating, review_count,
        discount, is_new, is_best_seller, in_stock, sku, short_description, description, specs_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, slug=excluded.slug, brand=excluded.brand,
        brand_name=excluded.brand_name, brand_id=excluded.brand_id, category=excluded.category,
        category_slug=excluded.category_slug, category_id=excluded.category_id, image=excluded.image,
        images_json=excluded.images_json, price=excluded.price,
        old_price=excluded.old_price, rating=excluded.rating, review_count=excluded.review_count,
        discount=excluded.discount, is_new=excluded.is_new, is_best_seller=excluded.is_best_seller,
        in_stock=excluded.in_stock, sku=excluded.sku, short_description=excluded.short_description,
        description=excluded.description, specs_json=excluded.specs_json,
        updated_at=datetime('now')`);
    for (const p of data.products) {
      upsertProduct.run(p.id, p.name, p.slug, p.brand || '', p.brandName || '',
        brandIdByName.get(p.brand) || null, p.category || '', p.categorySlug || '',
        p.categoryId || null, p.image || '', JSON.stringify(p.images || []), p.price || 0,
        p.oldPrice ?? null, p.rating || 0, p.reviewCount || 0,
        p.discount || 0, p.isNew ? 1 : 0, p.isBestSeller ? 1 : 0, p.inStock ? 1 : 0,
        p.sku || null, p.shortDescription || '', p.description || '', JSON.stringify(p.specs || {}));
    }

    const adminCount = db.prepare('SELECT COUNT(*) AS n FROM admin_users').get().n;
    if (adminCount === 0) {
      const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
      db.prepare('INSERT INTO admin_users (username, password_hash, name, role) VALUES (?, ?, ?, ?)')
        .run(process.env.ADMIN_USER || 'admin', hash, 'مدیر فروشگاه', 'admin');
      console.log('Seeded default admin user: admin / admin123');
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  const counts = db.prepare(`
    SELECT (SELECT COUNT(*) FROM categories) AS categories,
           (SELECT COUNT(*) FROM brands) AS brands,
           (SELECT COUNT(*) FROM products) AS products`).get();
  console.log(`Seed complete: ${counts.categories} categories, ${counts.brands} brands, ${counts.products} products`);
}

if (require.main === module) seed();

module.exports = { seed };
