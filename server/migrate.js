/* Camzy — database initialization / migrations (node:sqlite, no native build).
 * Schema mirrors the current frontend data structures (see previous revision).
 */
const fs = require('fs');
const path = require('path');
const { getDb, DB_PATH } = require('./db');

const MIGRATIONS = [
  `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    mobile TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT,
    join_date TEXT NOT NULL,
    is_blocked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'admin',
    is_active INTEGER NOT NULL DEFAULT 1,
    permissions TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    product_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS subcategories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE (category_id, name)
  );
  CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    logo TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    brand TEXT NOT NULL DEFAULT '',
    brand_name TEXT NOT NULL DEFAULT '',
    brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    category TEXT NOT NULL DEFAULT '',
    category_slug TEXT NOT NULL DEFAULT '',
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    image TEXT NOT NULL DEFAULT '',
    images_json TEXT NOT NULL DEFAULT '[]',
    price INTEGER NOT NULL DEFAULT 0,
    old_price INTEGER,
    rating REAL NOT NULL DEFAULT 0,
    review_count INTEGER NOT NULL DEFAULT 0,
    discount INTEGER NOT NULL DEFAULT 0,
    is_new INTEGER NOT NULL DEFAULT 0,
    is_best_seller INTEGER NOT NULL DEFAULT 0,
    in_stock INTEGER NOT NULL DEFAULT 1,
    sku TEXT UNIQUE,
    short_description TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    specs_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    full_name TEXT NOT NULL DEFAULT '',
    mobile TEXT NOT NULL DEFAULT '',
    province TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    postal_code TEXT NOT NULL DEFAULT '',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    date TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    status_text TEXT NOT NULL DEFAULT '',
    total INTEGER NOT NULL DEFAULT 0,
    items_count INTEGER NOT NULL DEFAULT 0,
    shipping INTEGER NOT NULL DEFAULT 0,
    discount INTEGER NOT NULL DEFAULT 0,
    address TEXT NOT NULL DEFAULT '',
    address_id INTEGER REFERENCES addresses(id) ON DELETE SET NULL,
    payment_method TEXT NOT NULL DEFAULT '',
    timeline_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 1,
    options_json TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS customer_sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL DEFAULT (datetime('now', '+30 days'))
  );
  CREATE INDEX IF NOT EXISTS idx_customer_sessions_user ON customer_sessions(user_id);
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
  CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
  CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  `,
  // v2: stock count for admin inventory management (in_stock derived from it).
  `SELECT 1`,
];

function ensureColumn(db, table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

function migrate() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = getDb();
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  const insert = db.prepare('INSERT INTO schema_migrations (version) VALUES (?)');
  MIGRATIONS.forEach((sql, i) => {
    const version = i + 1;
    if (applied.has(version)) return;
    db.exec(sql);
    insert.run(version);
    console.log(`Applied migration ${String(version).padStart(3, '0')}`);
  });
  ensureColumn(db, 'products', 'stock_count', 'INTEGER NOT NULL DEFAULT 50');
  ensureColumn(db, 'products', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(db, 'orders', 'stock_restored', 'INTEGER NOT NULL DEFAULT 0');
  /* Server-side payment state: payment_status in unpaid|pending|paid|failed|refunded,
   * payment_method normalized to cod|online. No gateway yet. */
  ensureColumn(db, 'orders', 'payment_status', "TEXT NOT NULL DEFAULT 'unpaid'");
  try {
    db.exec("UPDATE orders SET payment_status = 'unpaid' WHERE payment_status IS NULL OR payment_status NOT IN ('unpaid','pending','paid','failed','refunded')");
    // Normalize legacy payment_method values; default to cod (all legacy orders are COD).
    const rows = db.prepare('SELECT id, payment_method FROM orders').all();
    const upd = db.prepare('UPDATE orders SET payment_method = ? WHERE id = ?');
    for (const r of rows) {
      const v = String(r.payment_method || '').trim().toLowerCase();
      const normalized = (v === 'online' || v.includes('online') || v.includes('gateway') || v.includes('zarin') || v.includes('parsian'))
        ? 'online' : 'cod';
      if (r.payment_method !== normalized) upd.run(normalized, r.id);
    }
  } catch (_) {}
  /* Gateway-ready payment refs: authority/verification tracking + event log.
   * No external gateway is connected; values are server-generated placeholders. */
  ensureColumn(db, 'orders', 'payment_authority', 'TEXT');
  ensureColumn(db, 'orders', 'payment_ref_id', 'TEXT');
  ensureColumn(db, 'orders', 'payment_amount', 'INTEGER');
  ensureColumn(db, 'orders', 'paid_at', 'TEXT');
  db.exec(`CREATE TABLE IF NOT EXISTS payment_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    event TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_payment_events_order ON payment_events(order_id)');
  /* Auth sessions table (added after v1 was already applied in existing DBs). */
  db.exec(`CREATE TABLE IF NOT EXISTS customer_sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL DEFAULT (datetime('now', '+30 days'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_customer_sessions_user ON customer_sessions(user_id)');
  /* Admin sessions table (token-based admin auth). */
  db.exec(`CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL DEFAULT (datetime('now', '+30 days'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON admin_sessions(admin_id)');
  /* Per-user customer cart (single JSON row per user). */
  db.exec(`CREATE TABLE IF NOT EXISTS carts (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    items_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  /* Per-user wishlist (single JSON array of product ids per user). */
  db.exec(`CREATE TABLE IF NOT EXISTS wishlists (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    items_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  /* Per-user recently viewed (ordered JSON array of product ids, most recent first). */
  db.exec(`CREATE TABLE IF NOT EXISTS recently_viewed (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    items_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  /* Product reviews (one row per user review; seed reviews stay frontend-only). */
  db.exec(`CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author TEXT NOT NULL DEFAULT '',
    rating INTEGER NOT NULL DEFAULT 5,
    title TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id)');
  /* Review moderation: status pending|approved|rejected + admin reply.
   * Legacy rows default to approved so the storefront listing is unchanged. */
  ensureColumn(db, 'reviews', 'status', "TEXT NOT NULL DEFAULT 'approved'");
  ensureColumn(db, 'reviews', 'reply', "TEXT NOT NULL DEFAULT ''");
  /* Admin roles/permissions: safe defaults keep existing accounts fully active. */
  ensureColumn(db, 'admin_users', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(db, 'admin_users', 'permissions', 'TEXT');
  /* Product questions (customer Q&A per product; admin-moderated like reviews). */
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
  /* In-app notifications (admin-created; in-date + active ones are served
   * to users. No SMS/push. Reads tracked per user. */
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
  /* Per-page / per-product / per-article SEO overrides (empty = global fallback). */
  db.exec(`CREATE TABLE IF NOT EXISTS seo_meta (
    scope TEXT NOT NULL,
    ref TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    noindex INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (scope, ref)
  )`);
  /* Product add-on options (per product, admin-managed). */
  db.exec(`CREATE TABLE IF NOT EXISTS product_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL DEFAULT 0,
    discount_percent INTEGER NOT NULL DEFAULT 0,
    discount_price INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_product_options_product ON product_options(product_id)');
  /* Support tickets + conversation messages (admin-managed; widget untouched). */
  db.exec(`CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL DEFAULT '',
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
  /* Articles (blog/magazine: title, slug, excerpt, content, image, status). */
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
  /* Article categories (managed from Admin → Articles → دسته‌بندی مقالات). */
  db.exec(`CREATE TABLE IF NOT EXISTS article_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  try { var _aci=db.prepare('PRAGMA table_info(articles)').all().map(function(c){return c.name;}); if(_aci.indexOf('category_id')===-1) db.exec('ALTER TABLE articles ADD COLUMN category_id INTEGER'); } catch(_){}
  db.exec('CREATE INDEX IF NOT EXISTS idx_articles_category_id ON articles(category_id)');
  var _seedCat=db.prepare('INSERT OR IGNORE INTO article_categories (name, slug) VALUES (?, ?)');
  _seedCat.run('راهنمای خرید دوربین', 'buying-guide');
  _seedCat.run('آموزش نصب دوربین', 'installation-tutorial');
  _seedCat.run('مقایسه دوربین', 'camera-comparison');
  _seedCat.run('نگهداری سیستم امنیتی', 'security-maintenance');
  _seedCat.run('اخبار فناوری امنیتی', 'security-news');
  /* Discount codes (admin-managed; enforced server-side at order creation). */
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
  try { var _oc=db.prepare('PRAGMA table_info(orders)').all().map(function(c){return c.name;}); if(_oc.indexOf('discount_code')===-1) db.exec("ALTER TABLE orders ADD COLUMN discount_code TEXT NOT NULL DEFAULT ''"); } catch(_){}
  try { var _uc=db.prepare('PRAGMA table_info(users)').all().map(function(c){return c.name;}); if(_uc.indexOf('is_blocked')===-1) db.exec("ALTER TABLE users ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0"); } catch(_){}
  db.exec(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  /* Shipping methods (admin-managed; one row flagged as default). */
  db.exec(`CREATE TABLE IF NOT EXISTS shipping_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    cost INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  // Extended product fields for full admin edit (all JSON/text, defaults keep existing products valid)
  ensureColumn(db, 'products', 'model', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'products', 'subcategory', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'products', 'sale_price', "INTEGER");
  ensureColumn(db, 'products', 'discount_ends_at', "TEXT");
  ensureColumn(db, 'products', 'stock_status', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'products', 'min_order', "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, 'products', 'max_order', "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, 'products', 'warehouse', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'products', 'weight', "REAL NOT NULL DEFAULT 0");
  ensureColumn(db, 'products', 'dimensions', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'products', 'manufacturer', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'products', 'country', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'products', 'warranty', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'products', 'included_items', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'products', 'authenticity', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'products', 'seo_title', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'products', 'seo_description', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'products', 'seo_keywords', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'products', 'og_image', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'products', 'variants_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'products', 'features_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'products', 'gallery_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'products', 'shipping_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'order_items', 'options_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'notifications', 'image_url', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'notifications', 'link_type', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'notifications', 'link_value', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'notifications', 'product_id', "TEXT NOT NULL DEFAULT ''");
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  ensureColumn(db, 'hero_slides', 'slide_type', "TEXT NOT NULL DEFAULT 'content'");
  ensureColumn(db, 'hero_slides', 'link_url', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'hero_slides', 'show_badge', "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, 'hero_slides', 'badge_icon', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'hero_slides', 'show_title', "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, 'hero_slides', 'show_text', "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, 'hero_slides', 'show_image', "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, 'hero_slides', 'image_size', "TEXT NOT NULL DEFAULT 'medium'");
  ensureColumn(db, 'hero_slides', 'show_btn1', "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, 'hero_slides', 'show_btn2', "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, 'hero_slides', 'content_position', "TEXT NOT NULL DEFAULT 'right'");
  ensureColumn(db, 'hero_slides', 'image_desktop', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'hero_slides', 'image_mobile', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'hero_slides', 'show_mobile', "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, 'hero_slides', 'background_color', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'hero_slides', 'background_gradient_second', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'hero_slides', 'background_gradient_angle', "TEXT NOT NULL DEFAULT '135deg'");
  var _hs=db.prepare('SELECT COUNT(*) as c FROM hero_slides').get();  if(_hs.c===0){
    var _ins=db.prepare('INSERT INTO hero_slides (sort_order,image_desktop,image_mobile,image_position,badge,title,text,btn1_text,btn1_url,btn2_text,btn2_url,show_mobile) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    _ins.run(1,'assets/images/products/hikvision-ds-2cd2t47wd-l3.svg','','center','فروش ویژه دوربین مداربسته','دوربین مداربسته حرفه‌ای با بهترین قیمت','دوربین‌های تحت شبکه و آنالوگ از معتبرترین برندهای جهان با ضمانت اصالت کالا و ارسال رایگان','مشاهده محصولات','/shop?category=cctv-cameras','دسته‌بندی محصولات','#categories',1);
    _ins.run(2,'assets/images/products/dahua-hdw3441r3.svg','','center','برندهای معتبر','دوربین مداربسته اورجینال با گارانتی معتبر','محصولات اورجینال هایکویژن، داهوا، یونیکنیو، تیاندی و ویوتک با گارانتی رسمی و ارسال سریع به سراسر کشور','مشاهده محصولات','/shop?category=cctv-cameras','برندها','/brands',1);
    _ins.run(3,'assets/images/products/hikvision-ds-7608ni-k2-8.svg','','center','تخفیف ویژه','سیستم‌های ضبط DVR و NVR با تخفیف ویژه','دستگاه‌های DVR و NVR با ظرفیت ذخیره‌سازی بالا، قیمت استثنایی و ضمانت بازگشت کالا','مشاهده تخفیف‌ها','/shop?category=dvr-nvr','همه محصولات','/shop',1);
    _ins.run(4,'assets/images/products/sepco-hardhat.svg','','center','ارسال رایگان','ایمنی و حفاظت حرفه‌ای','کلاه ایمنی، دستکش، عینک و تجهیزات حفاظت فردی با استانداردهای بین‌المللی','مشاهده محصولات','shop.html?category=safety','دسته‌بندی محصولات','categories.html',1);
  }
}

/* Contact messages table (idempotent; safe for already-migrated DBs). */
try {
  const __db = getDb();
  __db.exec(`CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    email TEXT,
    phone TEXT,
    subject TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  __db.exec('CREATE INDEX IF NOT EXISTS idx_contact_messages_created ON contact_messages(created_at)');
  __db.exec('CREATE INDEX IF NOT EXISTS idx_contact_messages_read ON contact_messages(is_read)');
} catch (_) {}

if (require.main === module) {
  migrate();
  console.log(`Database ready at ${DB_PATH}`);
}

module.exports = { migrate };
