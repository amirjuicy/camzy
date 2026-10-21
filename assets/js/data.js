/* ================================================================
   Camzy — Mock Data (CCTV & security catalog)
   ================================================================ */

const AppData = {
  categories: [
    { id: 1, name: 'دوربین مداربسته', icon: 'cctv', count: 5, slug: 'cctv-cameras', color: '#D71920', description: 'دوربین‌های تحت شبکه و آنالوگ از نوع بولت، دام، توری و پانوژوم با کیفیت تصویر بالا، دید در شب و مقاومت در برابر شرایط جوی', subcategories: ['دوربین تحت شبکه', 'دوربین آنالوگ AHD', 'دوربین دام', 'دوربین بولت', 'پانوژوم', 'دوربین بی‌سیم'] },
    { id: 2, name: 'دستگاه DVR / NVR', icon: 'dvr', count: 4, slug: 'dvr-nvr', color: '#E34A50', description: 'دستگاه‌های ضبط‌کننده تصویر DVR و NVR با ظرفیت ذخیره‌سازی بالا، پشتیبانی از دوربین‌های شبکه‌ای و آنالوگ و خروجی مانیتور HDMI', subcategories: ['دستگاه NVR', 'دستگاه DVR', 'NVR بی‌سیم', 'NVR هوشمند', 'دستگاه ضبط ترکیبی', 'هارد مخصوص DVR'] },
    { id: 3, name: 'سیستم‌های امنیتی', icon: 'shieldCheck', count: 4, slug: 'security-systems', color: '#2E7D32', description: 'سیستم‌های امنیتی یکپارچه شامل هشدار دزد، کنترل تردد، اعلام حریق و راهکارهای حفاظتی برای خانه و محل کار', subcategories: ['سیستم هشدار دزد', 'کنترل تردد', 'دزدگیر بی‌سیم', 'درب اتوماتیک', 'اعلام حریق', 'گیت تردد'] },
    { id: 4, name: 'لنز و تجهیزات تصویربرداری', icon: 'lens', count: 3, slug: 'lenses-imaging', color: '#ED6C02', description: 'لنزها و تجهیزات تصویربرداری مکمل دوربین‌های مداربسته با زوم بالا، زاویه دید تنظیم‌پذیر و کیفیت تصویر شفاف', subcategories: ['لنز دوربین', 'لنز زوم', 'کاور و محافظ لنز', 'فیلتر تصویر', 'لنز واید', 'مبدل لنز'] },
    { id: 5, name: 'تجهیزات شبکه نظارتی', icon: 'network', count: 4, slug: 'network-equipment', color: '#D71920', description: 'تجهیزات شبکه و اتصال مورد نیاز سیستم‌های نظارتی شامل سوئیچ PoE، روتر، رپیتر و تجهیزات انتقال تصویر', subcategories: ['سوئیچ PoE', 'روتر', 'رپیتر', 'اکسیس پوینت', 'رک شبکه', 'تجهیزات PoE'] },
    { id: 6, name: 'لوازم جانبی دوربین', icon: 'package', count: 2, slug: 'camera-accessories', color: '#D71920', description: 'لوازم جانبی و اقلام مکمل دوربین مداربسته شامل پایه، قیف، آداپتور و اتصالات نصب', subcategories: ['پایه و قیف دوربین', 'آداپتور و منبع تغذیه', 'فیوز و محافظ', 'کانکتور', 'لوازم نصب', 'برچسب و علامت'] },
    { id: 7, name: 'ایمنی و حفاظت', icon: 'shield', count: 2, slug: 'safety-security', color: '#F4511E', description: 'تجهیزات ایمنی و حفاظت فردی مورد نیاز تیم‌های نصب در ارتفاع و محیط‌های صنعتی', subcategories: ['کلاه ایمنی', 'دستکش کار', 'عینک ایمنی', 'لباس کار', 'گوشی ایمنی', 'هارنس'] },
    { id: 8, name: 'کابینت و رک', icon: 'rack', count: 2, slug: 'rack-cabinet', color: '#6D4C41', description: 'کابینت‌ها و رک‌های مخصوص نگهداری تجهیزات نظارتی و شبکه با تهویه مناسب، قفل و امنیت بالا', subcategories: ['کابینت سرور', 'رک تجهیزات', 'رک دیواری', 'کابینت شارژ', 'قفسه تجهیزات', 'رک زمینی'] },
    { id: 9, name: 'تجهیزات نصب و راه‌اندازی', icon: 'wrench', count: 2, slug: 'installation-tools', color: '#171717', description: 'ابزار و تجهیزات مورد نیاز برای نصب، تست و راه‌اندازی دوربین و سیستم‌های امنیتی', subcategories: ['تستر کابل', 'پراب و مانیتور', 'متر و تراز', 'سیم‌چین و سیم‌بر', 'جعبه اتصال', 'دوربین تست'] },
    { id: 10, name: 'ذخیره‌سازی و مانیتورینگ', icon: 'memory', count: 4, slug: 'storage-monitoring', color: '#171717', description: 'تجهیزات ذخیره‌سازی و مانیتورینگ مخصوص تصاویر دوربین شامل هارد نظارتی، SSD، مانیتور و یو پی اس', subcategories: ['هارد نظارتی', 'SSD', 'مانیتور', 'کارت حافظه', 'قفسه ذخیره', 'UPS'] },
    { id: 11, name: 'سیم و کابل دوربین', icon: 'cable', count: 3, slug: 'cables-wiring', color: '#D71920', description: 'سیم و کابل‌های مخصوص دوربین و سیستم‌های امنیتی شامل کوکسیال، شبکه و برق با استاندارد انتقال پایدار تصویر', subcategories: ['کابل کوکسیال', 'کابل شبکه', 'کابل برق', 'کانکتور BNC', 'پچ کورد', 'لوله و درپوش'] },
    { id: 12, name: 'تجهیزات جانبی تخصصی', icon: 'puzzle', count: 2, slug: 'specialized-equipment', color: '#2E7D32', description: 'تجهیزات تخصصی مکمل سیستم‌های نظارتی و امنیتی برای کاربردهای خاص مانند سنسورهای هوشمند و تجهیزات ضد انفجار', subcategories: ['تجهیزات ضد انفجار', 'سنسور هوشمند', 'ریموت و کنترل', 'برچسب RFID', 'قفل الکترونیکی', 'تجهیزات تخصصی'] }
  ],

  brands: [
    { id: 1, name: 'hikvision', displayName: 'هایکویژن', logo: 'assets/images/brands/hikvision.svg', country: 'چین', description: 'هایکویژن یکی از بزرگ‌ترین تولیدکنندگان دوربین مداربسته و سیستم‌های نظارتی در جهان با بیش از ۲۰ سال سابقه.' },
    { id: 2, name: 'dahua', displayName: 'داهوا', logo: 'assets/images/brands/dahua.svg', country: 'چین', description: 'داهوا از پیشروان فناوری ویدئویی و راهکارهای نظارتی هوشمند با فناوری Starlight و H.265+ است.' },
    { id: 3, name: 'uniview', displayName: 'یونیکنیو', logo: 'assets/images/brands/uniview.svg', country: 'چین', description: 'یونیکنیو (UNV) تولیدکننده سیستم‌های نظارتی و کنترل تردد با نسل جدید پردازش تصویر لبه.' },
    { id: 4, name: 'tiandy', displayName: 'تیاندی', logo: 'assets/images/brands/tiandy.svg', country: 'چین', description: 'تیاندی یکی از ده برند برتر جهان در حوزه دوربین مداربسته با تمرکز بر راهکارهای ذخیره‌سازی هوشمند.' },
    { id: 5, name: 'vivotek', displayName: 'ویوتک', logo: 'assets/images/brands/vivotek.svg', country: 'تایوان', description: 'ویوتک سازنده تخصصی دوربین‌های تحت شبکه صنعتی و دریایی با کیفیت تصویر بسیار بالا.' },
    { id: 6, name: 'feritac', displayName: 'فریتک', logo: 'assets/images/brands/feritac.svg', country: 'ایران', description: 'فریتک تولیدکننده ایرانی سیستم‌های هشدار دزد، اعلام حریق و تجهیزات نظارتی با پشتیبانی سریع.' },
    { id: 7, name: 'axis', displayName: 'اکسیس', logo: 'assets/images/brands/axis.svg', country: 'سوئد', description: 'اکسیس پیشرو جهانی در دوربین‌های شبکه‌ای حرفه‌ای با گارانتی طولانی‌مدت و امنیت بالا.' },
    { id: 8, name: 'hanwha', displayName: 'ویژن هانوا', logo: 'assets/images/brands/hanwha.svg', country: 'کره جنوبی', description: 'ویژن هانوا با فناوری Wisenet و Wisenet Analytics راهکارهای هوشمند نظارتی ارائه می‌کند.' },
    { id: 9, name: 'zyxel', displayName: 'زایکل', logo: 'assets/images/brands/zyxel.svg', country: 'تایوان', description: 'زایکل متخصص تجهیزات شبکه برای انتقال پایدار تصویر دوربین‌های مداربسته در شبکه‌های حرفه‌ای.' },
    { id: 10, name: 'ubiquiti', displayName: 'یوبیکویتی', logo: 'assets/images/brands/ubiquiti.svg', country: 'آمریکا', description: 'یوبیکویتی سازنده تجهیزات شبکه حرفه‌ای با استاندارد PoE و مدیریت متمرکز کنترلر UniFi.' },
    { id: 11, name: 'seagate', displayName: 'سیگیت', logo: 'assets/images/brands/seagate.svg', country: 'آمریکا', description: 'سیگیت با خانواده هاردهای نظارتی SkyHawk راهکار ذخیره‌سازی پایدار برای سیستم‌های ویدئویی است.' },
    { id: 12, name: 'wd', displayName: 'وسترن دیجیتال', logo: 'assets/images/brands/wd.svg', country: 'آمریکا', description: 'وسترن دیجیتال با خانواده Purple و WD Purple Surveillance هاردهای مخصوص دوربین مداربسته عرضه می‌کند.' },
    { id: 13, name: 'tp-link', displayName: 'تی‌پی‌لینک', logo: 'assets/images/brands/tp-link.svg', country: 'چین', description: 'تی‌پی‌لینک سازنده تجهیزات شبکه و روترهای کم‌مصرف با پشتیبانی کامل از استاندارد PoE.' },
    { id: 14, name: 'sepco', displayName: 'سپکو', logo: 'assets/images/brands/sepco.svg', country: 'ایران', description: 'سپکو تولیدکننده ایرانی تجهیزات ایمنی و حفاظت فردی با استانداردهای ملی و اروپایی.' }
  ],

  products: [
    { id: 1, name: 'دوربین مداربسته بولت تحت شبکه هایکویژن DS-2CD2T47WD-L3', slug: 'hikvision-ds-2cd2t47wd-l3', brand: 'hikvision', brandName: 'هایکویژن', category: 'دوربین مداربسته', categorySlug: 'cctv-cameras', image: 'assets/images/products/hikvision-ds-2cd2t47wd-l3.svg', images: ['assets/images/products/hikvision-ds-2cd2t47wd-l3.svg'], categoryId: 1, price: 4850000, oldPrice: 5400000, rating: 4.7, reviewCount: 86, discount: 10, isNew: false, isBestSeller: true, inStock: true, sku: 'HKV-2T47WD', shortDescription: 'دوربین بولت ۴ مگاپیکسل IP67 با دید در شب ۳۰ متری و تغذیه PoE.', description: 'دوربین مداربسته بولت تحت شبکه هایکویژن مدل DS-2CD2T47WD-L3 با رزولوشن ۴ مگاپیکسل، بدنه ضدآب IP67 و دید درشب ۳۰ متری، گزینه‌ای مطمئن برای نظارت بر محوطه‌های بیرونی است.', specs: { 'رزولوشن': '۴ مگاپیکسل (۲۵۶۰×۱۴۴۰)', 'نوع دوربین': 'بولت تحت شبکه (IP)', 'لنز': '۲٫۸ میلی‌متری ثابت', 'دید در شب': '۳۰ متر IR', 'استاندارد حفاظتی': 'IP67', 'اتصال': 'PoE (IEEE 802.3af) / RJ45', 'ذخیره‌سازی پشتیبان': 'microSD تا ۲۵۶ گیگابایت', 'گارانتی': '۱۸ ماه گارانتی معتبر' } },
    { id: 2, name: 'دوربین مداربسته دام تحت شبکه هایکویژن DS-2CD2143G2-I', slug: 'hikvision-ds-2cd2143g2-i', brand: 'hikvision', brandName: 'هایکویژن', category: 'دوربین مداربسته', categorySlug: 'cctv-cameras', image: 'assets/images/products/hikvision-ds-2cd2143g2-i.svg', images: ['assets/images/products/hikvision-ds-2cd2143g2-i.svg'], categoryId: 1, price: 3950000, oldPrice: null, rating: 4.5, reviewCount: 54, discount: 0, isNew: false, isBestSeller: true, inStock: true, sku: 'HKV-2143G2', shortDescription: 'دوربین دام ۴ مگاپیکسل IP66 با میکروفون و دید در شب ۳۰ متری.', description: 'دوربین مداربسته دام تحت شبکه هایکویژن مدل DS-2CD2143G2-I با رزولوشن ۴ مگاپیکسل، پوشش دید ۱۰۵ درجه، دیافراگم بازشونده خودکار و میکروفون داخلی برای فضاهای داخلی مناسب است.', specs: { 'رزولوشن': '۴ مگاپیکسل (۲۵۶۰×۱۴۴۰)', 'نوع دوربین': 'دام تحت شبکه (IP)', 'لنز': '۲٫۸ میلی‌متری با دیافراگم خودکار', 'دید در شب': '۳۰ متر IR', 'استاندارد حفاظتی': 'IP66', 'اتصال': 'PoE / RJ45', 'ذخیره‌سازی پشتیبان': 'microSD تا ۲۵۶ گیگابایت', 'گارانتی': '۱۸ ماه گارانتی معتبر' } },
    { id: 3, name: 'دوربین مداربسته توری داهوا HDW3441R3', slug: 'dahua-hdw3441r3', brand: 'dahua', brandName: 'داهوا', category: 'دوربین مداربسته', categorySlug: 'cctv-cameras', image: 'assets/images/products/dahua-hdw3441r3.svg', images: ['assets/images/products/dahua-hdw3441r3.svg'], categoryId: 1, price: 4200000, oldPrice: 4750000, rating: 4.6, reviewCount: 41, discount: 12, isNew: true, isBestSeller: false, inStock: true, sku: 'DUA-3441R3', shortDescription: 'دوربین توری ۴ مگاپیکسل با فناوری Starlight و دید در شب ۴۰ متری.', description: 'دوربین مداربسته توری داهوا مدل HDW3441R3 با سنسور ۴ مگاپیکسل، فناوری Starlight برای تصویر رنگی در نور کم و دید در شب ۴۰ متری طراحی شده است.', specs: { 'رزولوشن': '۴ مگاپیکسل (۲۵۶۰×۱۴۴۰)', 'نوع دوربین': 'توری (Turret) تحت شبکه', 'لنز': '۲٫۸ میلی‌متری ثابت', 'دید در شب': '۴۰ متر Starlight', 'استاندارد حفاظتی': 'IP67', 'اتصال': 'PoE / RJ45', 'فشرده‌سازی': 'H.265+', 'گارانتی': '۱۸ ماه گارانتی معتبر' } },
    { id: 4, name: 'دوربین مداربسته بی‌سیم یونیکنیو IPC2124SR3-UD', slug: 'uniview-ipc2124sr3-ud', brand: 'uniview', brandName: 'یونیکنیو', category: 'دوربین مداربسته', categorySlug: 'cctv-cameras', image: 'assets/images/products/uniview-ipc2124sr3-ud.svg', images: ['assets/images/products/uniview-ipc2124sr3-ud.svg'], categoryId: 1, price: 3650000, oldPrice: null, rating: 4.4, reviewCount: 33, discount: 0, isNew: true, isBestSeller: false, inStock: true, sku: 'UNV-2124SR3', shortDescription: 'دوربین وایرلس ۴ مگاپیکسل با Wi-Fi و دید در شب ۳۰ متری.', description: 'دوربین مداربسته بی‌سیم یونیکنیو مدل IPC2124SR3-UD با پشتیبانی از Wi-Fi دوباند ۲٫۴ و ۵ گیگاهرتز، مناسب نصب سریع در محیط‌های بدون کابل‌کشی.', specs: { 'رزولوشن': '۴ مگاپیکسل (۲۵۶۰×۱۴۴۰)', 'نوع دوربین': 'بولت بی‌سیم (Wi-Fi)', 'لنز': '۲٫۸ میلی‌متری ثابت', 'دید در شب': '۳۰ متر IR', 'استاندارد حفاظتی': 'IP66', 'اتصال': 'Wi-Fi دوباند + RJ45', 'ذخیره‌سازی پشتیبان': 'microSD تا ۲۵۶ گیگابایت', 'گارانتی': '۱۸ ماه گارانتی معتبر' } },
    { id: 5, name: 'دوربین مداربسته پانوژوم تیاندی TC-S32DI', slug: 'tiandy-tc-s32di', brand: 'tiandy', brandName: 'تیاندی', category: 'دوربین مداربسته', categorySlug: 'cctv-cameras', image: 'assets/images/products/tiandy-tc-s32di.svg', images: ['assets/images/products/tiandy-tc-s32di.svg'], categoryId: 1, price: 5600000, oldPrice: 6300000, rating: 4.8, reviewCount: 27, discount: 11, isNew: false, isBestSeller: false, inStock: true, sku: 'TIA-S32DI', shortDescription: 'دوربین پانوژوم ۲ مگاپیکسل با زوم ۲۵ برابر و دید در شب ۱۰۰ متری.', description: 'دوربین مداربسته پانوژوم تیاندی مدل TC-S32DI با زوم اپتیکال ۲۵ برابر، برد دید در شب ۱۰۰ متری و قابلیت چرخش و زوم سریع، برای فضاهای باز و محوطه‌های بزرگ طراحی شده است.', specs: { 'رزولوشن': '۲ مگاپیکسل (۱۹۲۰×۱۰۸۰)', 'نوع دوربین': 'پانوژوم تحت شبکه', 'لنز': 'زوم اپتیکال ۲۵ برابر', 'دید در شب': '۱۰۰ متر IR', 'استاندارد حفاظتی': 'IP66', 'اتصال': 'PoE / RJ45', 'قابلیت چرخش': '۳۶۰ درجه افقی و ۹۰ درجه عمودی', 'گارانتی': '۱۸ ماه گارانتی معتبر' } },

    { id: 6, name: 'دستگاه NVR هشت کانال PoE هایکویژن DS-7608NI-K2/8', slug: 'hikvision-ds-7608ni-k2-8', brand: 'hikvision', brandName: 'هایکویژن', category: 'دستگاه DVR / NVR', categorySlug: 'dvr-nvr', image: 'assets/images/products/hikvision-ds-7608ni-k2-8.svg', images: ['assets/images/products/hikvision-ds-7608ni-k2-8.svg'], categoryId: 2, price: 12800000, oldPrice: 14500000, rating: 4.8, reviewCount: 64, discount: 12, isNew: false, isBestSeller: true, inStock: true, sku: 'HKV-7608NI', shortDescription: 'NVR ۸ کانال با ۸ پورت PoE، خروجی HDMI 4K و پشتیبانی از ۸ هارد.', description: 'دستگاه NVR تحت شبکه هایکویژن مدل DS-7608NI-K2/8 با ۸ کانال ضبط، هشت پورت PoE با کنترل هوشمند مصرف برق، خروجی HDMI 4K و پشتیبانی از حداکثر ۸ هارد ۱۶ ترابایتی.', specs: { 'تعداد کانال': '۸ کانال (۸ کانال PoE)', 'رزولوشن ضبط': 'تا ۴K (۸ مگاپیکسل)', 'خروجی تصویر': 'HDMI 4K / VGA', 'تعداد هارد': '۱ تا ۸ هارد SATA', 'ذخیره‌سازی پشتیبان': 'NAS و هارد اکسترنال', 'اتصال': 'RJ45 10/100/1000 + PoE', 'گارانتی': '۱۸ ماه گارانتی معتبر' } },
    { id: 7, name: 'دستگاه NVR شانزده کانال داهوا NVR4216-4K', slug: 'dahua-nvr4216-4k', brand: 'dahua', brandName: 'داهوا', category: 'دستگاه DVR / NVR', categorySlug: 'dvr-nvr', image: 'assets/images/products/dahua-nvr4216-4k.svg', images: ['assets/images/products/dahua-nvr4216-4k.svg'], categoryId: 2, price: 15400000, oldPrice: null, rating: 4.6, reviewCount: 38, discount: 0, isNew: false, isBestSeller: true, inStock: true, sku: 'DUA-NVR4216', shortDescription: 'NVR ۱۶ کانال 4K با ۲ هارد داخلی و پشتیبانی از دوربین‌های PoE.', description: 'دستگاه NVR داهوا مدل NVR4216-4K با ۱۶ کانال، ضبط ۴K روی دو هارد SATA، پشتیبانی از دوربین‌های شبکه‌ای PoE و آنالوگ و خروجی HDMI با قابلیت نمایش ۴ تصویر.', specs: { 'تعداد کانال': '۱۶ کانال', 'رزولوشن ضبط': '۴K / ۸ مگاپیکسل', 'خروجی تصویر': 'HDMI (4K) / VGA', 'تعداد هارد': '۱ تا ۲ هارد SATA', 'پشتیبانی دوربین': 'IP، آنالوگ، PoE و HDCVI', 'فشرده‌سازی': 'H.265+ / AI', 'گارانتی': '۱۸ ماه گارانتی معتبر' } },
    { id: 8, name: 'دستگاه DVR هشت کانال تیاندی TD-5108K1', slug: 'tiandy-td-5108k1', brand: 'tiandy', brandName: 'تیاندی', category: 'دستگاه DVR / NVR', categorySlug: 'dvr-nvr', image: 'assets/images/products/tiandy-td-5108k1.svg', images: ['assets/images/products/tiandy-td-5108k1.svg'], categoryId: 2, price: 6900000, oldPrice: 7600000, rating: 4.3, reviewCount: 45, discount: 9, isNew: false, isBestSeller: false, inStock: true, sku: 'TIA-5108K1', shortDescription: 'DVR ۸ کانال ۵ مگاپیکسل با ۱ هارد SATA و خروجی HDMI.', description: 'دستگاه DVR تیاندی مدل TD-5108K1 با پشتیبانی از ۸ دوربین آنالوگ ۵ مگاپیکسلی، یک جایگاه هارد SATA و خروجی HDMI 4K، راهکاری اقتصادی برای سیستم‌های نظارتی آنالوگ است.', specs: { 'تعداد کانال': '۸ کانال', 'رزولوشن ضبط': '۵ مگاپیکسل', 'خروجی تصویر': 'HDMI 4K / VGA', 'تعداد هارد': '۱ هارد SATA', 'پشتیبانی دوربین': 'آنالوگ AHD و HDCVI', 'فشرده‌سازی': 'H.265+', 'گارانتی': '۱۸ ماه گارانتی معتبر' } },
    { id: 9, name: 'دستگاه NVR سی و دو کانال یونیکنیو NVR308-32X', slug: 'uniview-nvr308-32x', brand: 'uniview', brandName: 'یونیکنیو', category: 'دستگاه DVR / NVR', categorySlug: 'dvr-nvr', image: 'assets/images/products/uniview-nvr308-32x.svg', images: ['assets/images/products/uniview-nvr308-32x.svg'], categoryId: 2, price: 21500000, oldPrice: null, rating: 4.7, reviewCount: 19, discount: 0, isNew: true, isBestSeller: false, inStock: true, sku: 'UNV-NVR308', shortDescription: 'NVR ۳۲ کانال با ۸ پورت PoE، دو هارد و رمزنگاری ویدئویی.', description: 'دستگاه NVR یونیکنیو مدل NVR308-32X با ۳۲ کانال، هشت پورت PoE، دو جایگاه هارد SATA تا ۱۰ ترابایت و پشتیبانی از رمزنگاری جریان ویدئویی.', specs: { 'تعداد کانال': '۳۲ کانال (۸ پورت PoE)', 'رزولوشن ضبط': 'تا ۸ مگاپیکسل', 'خروجی تصویر': 'HDMI 4K / دو خروجی VGA', 'تعداد هارد': '۲ هارد SATA', 'ذخیره‌سازی پشتیبان': 'RAID و NAS', 'اتصال': 'RJ45 گیگابیت + PoE', 'گارانتی': '۱۸ ماه گارانتی معتبر' } },

    { id: 10, name: 'سیستم هشدار دزد بی‌سیم فریتک با ۸ سنسور', slug: 'feritac-wireless-alarm-kit', brand: 'feritac', brandName: 'فریتک', category: 'سیستم‌های امنیتی', categorySlug: 'security-systems', image: 'assets/images/products/feritac-wireless-alarm-kit.svg', images: ['assets/images/products/feritac-wireless-alarm-kit.svg'], categoryId: 3, price: 8900000, oldPrice: 9800000, rating: 4.4, reviewCount: 31, discount: 9, isNew: false, isBestSeller: true, inStock: true, sku: 'FER-AL8W', shortDescription: 'کیت دزدگیر بی‌سیم ۸ زونی با پنل، سنسورها و آژیر.', description: 'سیستم هشدار دزد بی‌سیم فریتک با پنل مرکزی ۸ زون، چهار سنسور بازکننده، دو سنسور حرکتی PIR، ریموت و آژیر داخلی؛ مناسب خانه و مغازه با نصب بدون سیم‌کشی.', specs: { 'تعداد زون': '۸ زون قابل گسترش', 'ارتباط': 'بی‌سیم ۴۳۳ مگاهرتز', 'سنسور همراه': '۴ سنسور بازکننده + ۲ سنسور PIR', 'برد ارتباطی': 'تا ۱۰۰ متر در فضای باز', 'باتری پشتیبان': 'باتری لیتیوم داخلی', 'اعلان': 'اپلیکیشن و تماس تلفنی', 'گارانتی': '۱۲ ماه گارانتی معتبر' } },
    { id: 11, name: 'دستگاه کنترل تردد اکسس‌کنترل با ۵۰۰ کارت', slug: 'feritac-access-control-500', brand: 'feritac', brandName: 'فریتک', category: 'سیستم‌های امنیتی', categorySlug: 'security-systems', image: 'assets/images/products/feritac-access-control-500.svg', images: ['assets/images/products/feritac-access-control-500.svg'], categoryId: 3, price: 13500000, oldPrice: null, rating: 4.2, reviewCount: 22, discount: 0, isNew: false, isBestSeller: false, inStock: true, sku: 'FER-AC500', shortDescription: 'کنترل تردد با ۵۰۰ کارت RFID، دو درب و خروجی دزدگیر.', description: 'دستگاه کنترل تردد فریتک با ظرفیت ۵۰۰ کارت RFID، مدیریت دو درب، ثبت تردد کارکنان و خروجی قابل اتصال به سیستم هشدار دزد برای ساختمان‌های اداری.', specs: { 'ظرفیت کارت': '۵۰۰ کارت RFID', 'تعداد درب': '۲ درب', 'نوع کارت': 'RFID ۱۳٫۵۶ مگاهرتز M1', 'خروجی دزدگیر': 'دارد (relay خروجی)', 'ارتباط': 'TCP / RS485', 'برد کارت': 'تا ۱۰ سانتی‌متر', 'گارانتی': '۱۲ ماه گارانتی معتبر' } },
    { id: 12, name: 'گیت تردد سرعتی دو کارتنه چهارصد', slug: 'feritac-speed-gate-2-lane', brand: 'feritac', brandName: 'فریتک', category: 'سیستم‌های امنیتی', categorySlug: 'security-systems', image: 'assets/images/products/feritac-speed-gate-2-lane.svg', images: ['assets/images/products/feritac-speed-gate-2-lane.svg'], categoryId: 3, price: 42000000, oldPrice: 46500000, rating: 4.5, reviewCount: 12, discount: 10, isNew: true, isBestSeller: false, inStock: false, sku: 'FER-GATE2L', shortDescription: 'گیت سرعتی دو کارتنه با حسگر و نمایشگر LED برای ورود سازمانی.', description: 'گیت تردد سرعتی دو کارتنه با بدنه استیل، حسگرهای مادون قرمز و نمایشگر LED، مناسب لابی سازمان‌ها، مجتمع‌های تجاری و ساختمان‌های اداری پرتردد.', specs: { 'تعداد کارتنه': '۲ کارتنه', 'نوع حسگر': 'مادون قرمز چند نقطه‌ای', 'نمایشگر': 'LED دو طرفه', 'جنس بدنه': 'استیل ضدزنگ', 'سرعت عبور': 'حدود ۳۵ نفر در دقیقه', 'قابلیت اتصال': 'پایانه شبکه و کنترل تردد', 'گارانتی': '۱۸ ماه گارانتی معتبر' } },
    { id: 13, name: 'آژیر و کریمپر اعلام حریق آدرس‌پذیر ۲۴ ولت', slug: 'feritac-addressable-fire-alarm', brand: 'feritac', brandName: 'فریتک', category: 'سیستم‌های امنیتی', categorySlug: 'security-systems', image: 'assets/images/products/feritac-addressable-fire-alarm.svg', images: ['assets/images/products/feritac-addressable-fire-alarm.svg'], categoryId: 3, price: 3400000, oldPrice: null, rating: 4.1, reviewCount: 15, discount: 0, isNew: false, isBestSeller: false, inStock: true, sku: 'FER-FIRE24', shortDescription: 'آژیر اعلام حریق آدرس‌پذیر با گزینه‌های تعداد دفعات فعال‌سازی.', description: 'آژیر و کریمپر اعلام حریق آدرس‌پذیر ۲۴ ولت با قابلیت تعریف آدرس روی حلقه، قابل استفاده در سیستم‌های آتش‌نشانی صنعتی و ساختمان‌های پرتردد.', specs: { 'ولتاژ': '۲۴ ولت DC', 'نوع': 'آدرس‌پذیر (Addressable)', 'جریان مصرفی': 'حدود ۳۵ میلی‌آمپر', 'دمای کاری': 'منهای ۲۰ تا مثبت ۵۰ درجه', 'استاندارد': 'مطابق استانداردهای اعلام حریق', 'تعداد دفعات فعال‌سازی': 'قابل تنظیم', 'گارانتی': '۱۲ ماه گارانتی معتبر' } },

    { id: 14, name: 'لنز زوم موتوریزر ۲ مگاپیکسل فاصله کانونی ۴ تا ۱۲ میلی‌متر', slug: 'feritac-motorized-lens-4-12mm', brand: 'feritac', brandName: 'فریتک', category: 'لنز و تجهیزات تصویربرداری', categorySlug: 'lenses-imaging', image: 'assets/images/products/feritac-motorized-lens-4-12mm.svg', images: ['assets/images/products/feritac-motorized-lens-4-12mm.svg'], categoryId: 4, price: 2750000, oldPrice: 3100000, rating: 4.3, reviewCount: 18, discount: 11, isNew: false, isBestSeller: false, inStock: true, sku: 'FER-LENS412', shortDescription: 'لنز زوم موتوریزر ۴ تا ۱۲ میلی‌متر با کنترل IR و فوکوس دقیق.', description: 'لنز زوم موتوریزر با فاصله کانونی قابل تنظیم ۴ تا ۱۲ میلی‌متر، مناسب دوربین‌های دام و پانوژوم؛ امکان فوکوس و زوم از طریق کنترلر DVR یا NVR فراهم می‌شود.', specs: { 'فاصله کانونی': '۴ تا ۱۲ میلی‌متر', 'نوع لنز': 'زوم موتوریزر', 'دیافراگم': 'F1.6', 'سنسور سازگار': 'سنسور ۱/۲٫۸ اینچ', 'رابط کنترل': 'IR / RS-485', 'گارانتی': '۶ ماه گارانتی معتبر' } },
    { id: 15, name: 'لنز ثابت ۴ میلی‌متری F1.6 برای دوربین مداربسته', slug: 'feritac-fixed-lens-4mm', brand: 'feritac', brandName: 'فریتک', category: 'لنز و تجهیزات تصویربرداری', categorySlug: 'lenses-imaging', image: 'assets/images/products/feritac-fixed-lens-4mm.svg', images: ['assets/images/products/feritac-fixed-lens-4mm.svg'], categoryId: 4, price: 480000, oldPrice: null, rating: 4.0, reviewCount: 26, discount: 0, isNew: false, isBestSeller: false, inStock: true, sku: 'FER-LENS4', shortDescription: 'لنز ثابت ۴ میلی‌متری با دیافراگم F1.6 و پوشش تصویر عریض.', description: 'لنز ثابت ۴ میلی‌متری با دیافراگم F1.6، گزینه‌ای اقتصادی برای پوشش تصویر عریض در دوربین‌های مداربسته و کیت‌های آماده دوربین.', specs: { 'فاصله کانونی': '۴ میلی‌متر', 'نوع لنز': 'ثابت (Fixed)', 'دیافراگم': 'F1.6', 'زاویه دید': 'حدود ۹۰ درجه', 'گارانتی': '۶ ماه گارانتی معتبر' } },
    { id: 16, name: 'کاور و محافظ ضدآب دوربین مداربسته دام', slug: 'feritac-dome-camera-housing', brand: 'feritac', brandName: 'فریتک', category: 'لنز و تجهیزات تصویربرداری', categorySlug: 'lenses-imaging', image: 'assets/images/products/feritac-dome-camera-housing.svg', images: ['assets/images/products/feritac-dome-camera-housing.svg'], categoryId: 4, price: 1250000, oldPrice: 1450000, rating: 4.2, reviewCount: 9, discount: 14, isNew: false, isBestSeller: false, inStock: true, sku: 'FER-HOUSING', shortDescription: 'کاور محافظ دوربین دام با پایه فلزی و درپوش ضدآب.', description: 'کاور و محافظ دوربین مداربسته دام از جنس آلومینیوم با پایه فلزی محکم و درپوش ضدآب، برای نصب در محیط‌های نیمه‌مرطوب و بیرونی.', specs: { 'جنس': 'آلومینیوم', 'قطر لنز': '۱۰۰ میلی‌متر', 'استاندارد حفاظتی': 'IP65', 'نوع نصب': 'سقفی و دیواری', 'گارانتی': '۶ ماه گارانتی معتبر' } },

    { id: 17, name: 'سوئیچ PoE هشت پورت گیگابیت زایکل GS1200-8', slug: 'zyxel-gs1200-8-poe', brand: 'zyxel', brandName: 'زایکل', category: 'تجهیزات شبکه نظارتی', categorySlug: 'network-equipment', image: 'assets/images/products/zyxel-gs1200-8-poe.svg', images: ['assets/images/products/zyxel-gs1200-8-poe.svg'], categoryId: 5, price: 7800000, oldPrice: 8900000, rating: 4.6, reviewCount: 34, discount: 12, isNew: false, isBestSeller: true, inStock: true, sku: 'ZYX-GS12008', shortDescription: 'سوئیچ PoE هشت پورت با ۱۲۰ وات توان PoE و مدیریت وب.', description: 'سوئیچ PoE هشت پورت گیگابیت زایکل مدل GS1200-8 با مجموع ۱۲۰ وات توان PoE، دو پورت SFP و مدیریت تحت وب، گزینه‌ای مطمئن برای تغذیه و انتقال تصویر دوربین‌های تحت شبکه است.', specs: { 'تعداد پورت': '۸ پورت RJ45 گیگابیت + ۲ پورت SFP', 'توان PoE': '۱۲۰ وات (۸ پورت × ۱۵ وات)', 'استاندارد': 'IEEE 802.3af / 802.3at', 'قابلیت مدیریت': 'داشبورد تحت وب و VLAN', 'گارانتی': '۱۲ ماه گارانتی معتبر' } },
    { id: 18, name: 'سوئیچ PoE هشت پورت یوبیکویتی USW-Flex-8-PoE', slug: 'ubiquiti-usw-flex-8-poe', brand: 'ubiquiti', brandName: 'یوبیکویتی', category: 'تجهیزات شبکه نظارتی', categorySlug: 'network-equipment', image: 'assets/images/products/ubiquiti-usw-flex-8-poe.svg', images: ['assets/images/products/ubiquiti-usw-flex-8-poe.svg'], categoryId: 5, price: 14500000, oldPrice: null, rating: 4.9, reviewCount: 21, discount: 0, isNew: true, isBestSeller: true, inStock: true, sku: 'UBI-FLEX8P', shortDescription: 'سوئیچ PoE هشت پورت با کنترلر یونیکی متمرکز و ۱۳۰ وات توان.', description: 'سوئیچ PoE هشت پورت یوبیکویتی USW-Flex-8-PoE با پشتیبانی از کنترلر UniFi، توان PoE برابر ۱۳۰ وات و قابلیت مانیتورینگ کامل شبکه از طریق اپلیکیشن.', specs: { 'تعداد پورت': '۸ پورت RJ45 گیگابیت PoE+ + ۲ پورت SFP+', 'توان PoE': '۱۳۰ وات', 'استاندارد': 'IEEE 802.3at', 'مدیریت': 'اپلیکیشن UniFi Controller', 'گارانتی': '۱۲ ماه گارانتی معتبر' } },
    { id: 19, name: 'رپیتر و بریج تصویر وایرلس یوبیکویتی UniFi UBR-Ir', slug: 'ubiquiti-ubr-ir', brand: 'ubiquiti', brandName: 'یوبیکویتی', category: 'تجهیزات شبکه نظارتی', categorySlug: 'network-equipment', image: 'assets/images/products/ubiquiti-ubr-ir.svg', images: ['assets/images/products/ubiquiti-ubr-ir.svg'], categoryId: 5, price: 9800000, oldPrice: 11200000, rating: 4.5, reviewCount: 11, discount: 13, isNew: false, isBestSeller: false, inStock: true, sku: 'UBI-UBRIR', shortDescription: 'رپیتر بی‌سیم ۵ گیگاهرتز برای انتقال تصویر دوربین در ساختمان‌های بزرگ.', description: 'رپیتر و بریج تصویر بی‌سیم یوبیکویتی با فرکانس ۵ گیگاهرتز و پورت PoE، برای انتقال پایدار تصویر دوربین‌های مداربسته در ساختمان‌های بزرگ و طبقات زیاد.', specs: { 'نوع': 'رپیتر بی‌سیم / بریج', 'فرکانس': '۵ گیگاهرتز', 'پورت‌ها': '۱ پورت RJ45 با PoE', 'برد': 'تا ۲۰۰ متر در فضای باز', 'مدیریت': 'UniFi Controller', 'گارانتی': '۱۲ ماه گارانتی معتبر' } },
    { id: 20, name: 'کابل شبکه Cat6 ریال ۳۰۵ متری Cat6', slug: 'tp-link-cat6-305m', brand: 'tp-link', brandName: 'تی‌پی‌لینک', category: 'تجهیزات شبکه نظارتی', categorySlug: 'network-equipment', image: 'assets/images/products/tp-link-cat6-305m.svg', images: ['assets/images/products/tp-link-cat6-305m.svg'], categoryId: 5, price: 4750000, oldPrice: 5200000, rating: 4.3, reviewCount: 48, discount: 9, isNew: false, isBestSeller: false, inStock: true, sku: 'TPL-CAT6305', shortDescription: 'کابل شبکه Cat6 استاندارد با روکش PVC و متراژ ۳۰۵ متر.', description: 'کابل شبکه Cat6 با هسته مسی خالص و روکش PVC استاندارد در بسته ۳۰۵ متری، مناسب کابل‌کشی دوربین‌های تحت شبکه و شبکه‌های داخلی ساختمان.', specs: { 'نوع کابل': 'Cat6 UTP', 'جنس هسته': 'مس خالص', 'قطر کابل': '۲۳ میلی‌متر', 'روکش': 'PVC', 'متراژ': '۳۰۵ متر', 'گارانتی': '۱۲ ماه گارانتی معتبر' } },

    { id: 21, name: 'پایه و قیف دوربین مداربسته فلزی قابل تنظیم', slug: 'feritac-camera-mount-bracket', brand: 'feritac', brandName: 'فریتک', category: 'لوازم جانبی دوربین', categorySlug: 'camera-accessories', image: 'assets/images/products/feritac-camera-mount-bracket.svg', images: ['assets/images/products/feritac-camera-mount-bracket.svg'], categoryId: 6, price: 385000, oldPrice: 460000, rating: 4.2, reviewCount: 57, discount: 16, isNew: false, isBestSeller: true, inStock: true, sku: 'FER-BRACKET', shortDescription: 'پایه دیواری فلزی دوربین مداربسته با مفصل قابل تنظیم.', description: 'پایه و قیف فلزی دوربین مداربسته با پوشش رنگ کوره‌ای ضدزنگ و مفصل قابل تنظیم در سه محور، مناسب نصب بولت و توری روی دیوار و سقف.', specs: { 'جنس': 'آلومینیوم', 'نوع نصب': 'دیواری و سقفی', 'قابلیت تنظیم': 'سه محور', 'پوشش': 'رنگ کوره‌ای ضدزنگ', 'حداکثر وزن دوربین': '۲ کیلوگرم', 'گارانتی': '۶ ماه گارانتی معتبر' } },
    { id: 22, name: 'آداپتور تغذیه ۱۲ ولت ۲ آمپر برای دوربین مداربسته', slug: 'feritac-camera-power-adapter-12v2a', brand: 'feritac', brandName: 'فریتک', category: 'لوازم جانبی دوربین', categorySlug: 'camera-accessories', image: 'assets/images/products/feritac-camera-power-adapter-12v2a.svg', images: ['assets/images/products/feritac-camera-power-adapter-12v2a.svg'], categoryId: 6, price: 245000, oldPrice: null, rating: 4.1, reviewCount: 63, discount: 0, isNew: false, isBestSeller: false, inStock: true, sku: 'FER-ADP12V2', shortDescription: 'آداپتور تغذیه ۱۲ ولت ۲ آمپر سوئیچینگ برای دوربین و ریموت.', description: 'آداپتور تغذیه ۱۲ ولت ۲ آمپر با خروجی سوئیچینگ و محافظت در برابر اضافه‌ولتاژ، گزینه‌ای مطمئن برای تغذیه دوربین‌های مداربسته آنالوگ.', specs: { 'ولتاژ خروجی': '۱۲ ولت DC', 'جریان': '۲ آمپر', 'ورودی': '۲۲۰ ولت AC / ۵۰ هرتز', 'نوع': 'سوئیچینگ', 'خروجی': 'jack 5.5×2.1 میلی‌متر', 'گارانتی': '۶ ماه گارانتی معتبر' } },

    { id: 23, name: 'کلاه ایمنی سپکو استاندارد ملی', slug: 'sepco-safety-helmet', brand: 'sepco', brandName: 'سپکو', category: 'ایمنی و حفاظت', categorySlug: 'safety-security', image: 'assets/images/products/sepco-safety-helmet.svg', images: ['assets/images/products/sepco-safety-helmet.svg'], categoryId: 7, price: 285000, oldPrice: 340000, rating: 4.4, reviewCount: 39, discount: 16, isNew: false, isBestSeller: true, inStock: true, sku: 'SPC-HELMET01', shortDescription: 'کلاه ایمنی صنعتی استاندارد ملی با بند چندنقطه‌ای.', description: 'کلاه ایمنی سپکو با استاندارد ملی ایران، بند چندنقطه‌ای و قابلیت تنظیم اندازه، برای تیم‌های نصب دوربین در ارتفاع و محیط‌های صنعتی.', specs: { 'استاندارد': 'ملی ایران', 'جنس': 'پلی‌اتیلن فشرده', 'بند': 'چندنقطه‌ای قابل تنظیم', 'رنگ': 'سفید / زرد / آبی', 'وزن': '۲۵۰ گرم', 'گارانتی': '۶ ماه گارانتی معتبر' } },
    { id: 24, name: 'دستکش عایق برق مخصوص نصب دوربین', slug: 'sepco-insulated-gloves', brand: 'sepco', brandName: 'سپکو', category: 'ایمنی و حفاظت', categorySlug: 'safety-security', image: 'assets/images/products/sepco-insulated-gloves.svg', images: ['assets/images/products/sepco-insulated-gloves.svg'], categoryId: 7, price: 420000, oldPrice: null, rating: 4.6, reviewCount: 24, discount: 0, isNew: true, isBestSeller: false, inStock: true, sku: 'SPC-GLOVE01', shortDescription: 'دستکش عایق ۱۰۰۰ ولت با روکش ضد لغزش برای کار با برق.', description: 'دستکش عایق برق سپکو با تحمل ولتاژ تا ۱۰۰۰ ولت، روکش نیتریل ضد لغزش و ساق بلند، مناسب کار با منبع تغذیه و تابلوهای برق هنگام نصب.', specs: { 'ولتاژ عایق': 'تا ۱۰۰۰ ولت AC', 'جنس': 'لاستیک طبیعی با روکش نیتریل', 'سایز': 'M / L / XL', 'طول ساق': '۳۰ سانتی‌متر', 'گارانتی': '۶ ماه گارانتی معتبر' } },

    { id: 25, name: 'رک شبکه ۱۹ اینچ ۹ یونیتی دیواری', slug: 'feritac-wall-rack-9u', brand: 'feritac', brandName: 'فریتک', category: 'کابینت و رک', categorySlug: 'rack-cabinet', image: 'assets/images/products/feritac-wall-rack-9u.svg', images: ['assets/images/products/feritac-wall-rack-9u.svg'], categoryId: 8, price: 5600000, oldPrice: 6300000, rating: 4.3, reviewCount: 17, discount: 11, isNew: false, isBestSeller: false, inStock: true, sku: 'FER-RACK9U', shortDescription: 'رک دیواری ۱۹ اینچ ۹ یونیت با درِ شیشه‌ای و تهویه.', description: 'رک شبکه دیواری ۱۹ اینچ با ۹ یونیت فضای مفید، درِ شیشه‌ای قفل‌دار، تهویه فنی و سینی کابل برای نصب NVR و تجهیزات شبکه در فضای محدود.', specs: { 'نوع': 'رک دیواری', 'استاندارد': '۱۹ اینچ', 'یونیت': '۹ یونیت', 'در': 'شیشه‌ای با قفل', 'تهویه': 'فن ۱۲۰ میلی‌متری', 'گارانتی': '۱۲ ماه گارانتی معتبر' } },
    { id: 26, name: 'کابینت رک ۷۵ سانتی ۹ یونیت با درب فلزی', slug: 'feritac-floor-cabinet-75cm', brand: 'feritac', brandName: 'فریتک', category: 'کابینت و رک', categorySlug: 'rack-cabinet', image: 'assets/images/products/feritac-floor-cabinet-75cm.svg', images: ['assets/images/products/feritac-floor-cabinet-75cm.svg'], categoryId: 8, price: 8900000, oldPrice: null, rating: 4.5, reviewCount: 13, discount: 0, isNew: true, isBestSeller: false, inStock: true, sku: 'FER-CAB75', shortDescription: 'کابینت ایستاده ۷۵ سانتی با ۹ یونیت و تهویه هدایت‌شونده.', description: 'کابینت رک ایستاده ۷۵ سانتی‌متری با ۹ یونیت، درب فلزی با قفل، تهویه هدایت‌شونده و پایه تنظیم‌شونده برای نگهداری امن تجهیزات نظارتی و شبکه.', specs: { 'ارتفاع': '۷۵ سانتی‌متر', 'یونیت': '۹ یونیت', 'عرض': '۶۰ سانتی‌متر', 'عمق': '۶۰ سانتی‌متر', 'درب': 'فلزی با قفل', 'گارانتی': '۱۲ ماه گارانتی معتبر' } },

    { id: 27, name: 'پراب دوربین مداربسته با کابل RCA', slug: 'feritac-cctv-test-probe', brand: 'feritac', brandName: 'فریتک', category: 'تجهیزات نصب و راه‌اندازی', categorySlug: 'installation-tools', image: 'assets/images/products/feritac-cctv-test-probe.svg', images: ['assets/images/products/feritac-cctv-test-probe.svg'], categoryId: 9, price: 890000, oldPrice: 1050000, rating: 4.4, reviewCount: 29, discount: 15, isNew: false, isBestSeller: true, inStock: true, sku: 'FER-PROBE01', shortDescription: 'پراب تست دوربین آنالوگ با ورودی BNC و RCA و تغذیه دوربین.', description: 'پراب تست دوربین مداربسته آنالوگ با ورودی BNC و خروجی RCA به همراه منبع تغذیه ۱۲ ولت، برای عیب‌یابی سریع نصب دوربین در محل.', specs: { 'ورودی': 'BNC و RCA', 'تغذیه': '۱۲ ولت DC', 'اتصال': 'کابل ۵۰ سانتی‌متری', 'کاربرد': 'تست تصویر و تغذیه دوربین', 'گارانتی': '۶ ماه گارانتی معتبر' } },
    { id: 28, name: 'دستگاه تستر کابل شبکه و RJ45', slug: 'feritac-network-cable-tester', brand: 'feritac', brandName: 'فریتک', category: 'تجهیزات نصب و راه‌اندازی', categorySlug: 'installation-tools', image: 'assets/images/products/feritac-network-cable-tester.svg', images: ['assets/images/products/feritac-network-cable-tester.svg'], categoryId: 9, price: 1650000, oldPrice: null, rating: 4.2, reviewCount: 21, discount: 0, isNew: true, isBestSeller: false, inStock: true, sku: 'FER-TESTER01', shortDescription: 'تستر کابل شبکه با نمایشگر دیجیتال و تست پیوستگی.', description: 'دستگاه تستر کابل شبکه با نمایشگر دیجیتال برای بررسی پیوستگی و شماره سیم‌های کابل Cat5/Cat6 و تست خطای اتصال کوتاه.', specs: { 'نوع تست': 'پیوستگی و شماره سیم', 'نوع کابل': 'Cat5 / Cat5e / Cat6', 'نمایشگر': 'LED و دیجیتال', 'اتصال': 'RJ45 و RJ11', 'تغذیه': 'باتری', 'گارانتی': '۶ ماه گارانتی معتبر' } },

    { id: 29, name: 'هارد نظارتی وسترن دیجیتال Purple ۴ ترابایت', slug: 'wd-purple-4tb', brand: 'wd', brandName: 'وسترن دیجیتال', category: 'ذخیره‌سازی و مانیتورینگ', categorySlug: 'storage-monitoring', image: 'assets/images/products/wd-purple-4tb.svg', images: ['assets/images/products/wd-purple-4tb.svg'], categoryId: 10, price: 3950000, oldPrice: 4300000, rating: 4.7, reviewCount: 72, discount: 8, isNew: false, isBestSeller: true, inStock: true, sku: 'WD-PURPLE4TB', shortDescription: 'هارد ۴ ترابایت مخصوص دوربین مداربسته با پایداری ۱۸۰ روز ضبط.', description: 'هارد نظارتی WD Purple با ظرفیت ۴ ترابایت، سنسور حرارتی اختصاصی و قابلیت ضبط پیوسته ۱۸۰ روزه در سیستم‌های DVR و NVR، گزینه‌ای مطمئن برای آرشیو تصاویر است.', specs: { 'ظرفیت': '۴ ترابایت', 'رابط': 'SATA ۶ گیگابیت', 'فرم‌فاکتور': '۳٫۵ اینچ', 'رکورد': '۱۸۰ روز ضبط پیوسته', 'حافظه نهان': '۶۴ مگابایت', 'گارانتی': '۳۶ ماه گارانتی معتبر' } },
    { id: 30, name: 'هارد نظارتی سیگیت SkyHawk ۶ ترابایت', slug: 'seagate-skyhawk-6tb', brand: 'seagate', brandName: 'سیگیت', category: 'ذخیره‌سازی و مانیتورینگ', categorySlug: 'storage-monitoring', image: 'assets/images/products/seagate-skyhawk-6tb.svg', images: ['assets/images/products/seagate-skyhawk-6tb.svg'], categoryId: 10, price: 5600000, oldPrice: null, rating: 4.8, reviewCount: 46, discount: 0, isNew: true, isBestSeller: true, inStock: true, sku: 'SEA-SKY6TB', shortDescription: 'هارد ۶ ترابایت نظارتی با فناوری ImagePerfect و ضبط ۲۴ ساعته.', description: 'هارد نظارتی Seagate SkyHawk با ظرفیت ۶ ترابایت، فناوری ImagePerfect برای بهینه‌سازی ضبط پیوسته و سازگاری کامل با سیستم‌های DVR و NVR طراحی شده است.', specs: { 'ظرفیت': '۶ ترابایت', 'رابط': 'SATA ۶ گیگابیت', 'فرم‌فاکتور': '۳٫۵ اینچ', 'ویژگی': 'ImagePerfect و Health Management', 'ضبط': '۲۴ ساعته شبانه‌روز', 'گارانتی': '۳۶ ماه گارانتی معتبر' } },
    { id: 31, name: 'مانیتور نظارتی ۲۲ اینچ با خروجی HDMI و VGA', slug: 'generic-security-monitor-22', brand: 'feritac', brandName: 'فریتک', category: 'ذخیره‌سازی و مانیتورینگ', categorySlug: 'storage-monitoring', image: 'assets/images/products/generic-security-monitor-22.svg', images: ['assets/images/products/generic-security-monitor-22.svg'], categoryId: 10, price: 6300000, oldPrice: 7100000, rating: 4.0, reviewCount: 18, discount: 11, isNew: false, isBestSeller: false, inStock: true, sku: 'FER-MON22', shortDescription: 'مانیتور ۲۲ اینچ مناسب اتاق سرور با ورودی HDMI و VGA.', description: 'مانیتور نظارتی ۲۲ اینچ با رزولوشن Full HD، ورودی HDMI و VGA و طراحی مناسب نصب در اتاق سرور برای نمایش تصاویر NVR و DVR.', specs: { 'اندازه صفحه': '۲۲ اینچ', 'رزولوشن': 'Full HD (۱۹۲۰×۱۰۸۰)', 'ورودی': 'HDMI و VGA', 'نسبت تصویر': '۱۶:۹', 'برق': '۱۰۰ تا ۲۴۰ ولت', 'گارانتی': '۱۸ ماه گارانتی معتبر' } },
    { id: 32, name: 'یو پی اس آنلاین ۶۰۰ واتا برای سیستم نظارتی', slug: 'feritac-ups-600va', brand: 'feritac', brandName: 'فریتک', category: 'ذخیره‌سازی و مانیتورینگ', categorySlug: 'storage-monitoring', image: 'assets/images/products/feritac-ups-600va.svg', images: ['assets/images/products/feritac-ups-600va.svg'], categoryId: 10, price: 2950000, oldPrice: 3300000, rating: 4.3, reviewCount: 27, discount: 11, isNew: false, isBestSeller: false, inStock: true, sku: 'FER-UPS600', shortDescription: 'یو پی اس ۶۰۰ واتا با AVR و خروجی Pure Sine Wave برای NVR.', description: 'یو پی اس آنلاین ۶۰۰ واتا با تثبیت ولتاژ AVR، خروجی سینوسی خالص و زمان پشتیبانی تا ۱۵ دقیقه، از تجهیزات ضبط در زمان قطعی برق محافظت می‌کند.', specs: { 'توان': '۶۰۰ واتا / ۱۰۰۰ ولت‌آمپر', 'نوع': 'Online با AVR', 'خروجی': 'سینوسی خالص', 'زمان پشتیبانی': 'تا ۱۵ دقیقه', 'باتری': 'داخلی قابل تعویض', 'گارانتی': '۱۸ ماه گارانتی معتبر' } },

    { id: 33, name: 'کابل کوکسیال RG59 با کانکتور BNC آماده', slug: 'tp-link-coaxial-rg59-bnc-100m', brand: 'tp-link', brandName: 'تی‌پی‌لینک', category: 'سیم و کابل دوربین', categorySlug: 'cables-wiring', image: 'assets/images/products/tp-link-coaxial-rg59-bnc-100m.svg', images: ['assets/images/products/tp-link-coaxial-rg59-bnc-100m.svg'], categoryId: 11, price: 2350000, oldPrice: 2700000, rating: 4.1, reviewCount: 34, discount: 13, isNew: false, isBestSeller: true, inStock: true, sku: 'TPL-RG59-100', shortDescription: 'کابل کوکسیال RG59 آماده با کانکتور BNC در بسته ۱۰۰ متری.', description: 'کابل کوکسیال RG59 به همراه کانکتور BNC آماده و فیش RG58 برای انتقال تصویر آنالوگ دوربین مداربسته تا فاصله ۳۰۰ متر بدون افت محسوس کیفیت.', specs: { 'نوع کابل': 'RG59', 'امواج': '۷۵ اهم', 'بسته‌بندی': '۱۰۰ متر', 'اتصال': 'BNC و RG58', 'کاربرد': 'انتقال تصویر آنالوگ و AHD', 'گارانتی': '۶ ماه گارانتی معتبر' } },
    { id: 34, name: 'کابل برق دوربین مداربسته ۲×۱ متری', slug: 'tp-link-camera-power-cable-2x1', brand: 'tp-link', brandName: 'تی‌پی‌لینک', category: 'سیم و کابل دوربین', categorySlug: 'cables-wiring', image: 'assets/images/products/tp-link-camera-power-cable-2x1.svg', images: ['assets/images/products/tp-link-camera-power-cable-2x1.svg'], categoryId: 11, price: 1450000, oldPrice: null, rating: 4.0, reviewCount: 41, discount: 0, isNew: false, isBestSeller: false, inStock: true, sku: 'TPL-PWR2X1', shortDescription: 'کابل برق دوربین مداربسته با روکش PVC و هسته مسی.', description: 'کابل برق دوربین مداربسته دو هسته با هسته مسی ۰٫۵ میلی‌متر مربع و روکش PVC، مناسب انتقال برق دوربین‌های آنالوگ تا فاصله ۱۵۰ متر.', specs: { 'تعداد هسته': '۲ هسته', 'سطح مقطع': '۰٫۵ میلی‌متر مربع', 'جنس': 'مس آنیل‌شده', 'روکش': 'PVC', 'گارانتی': '۶ ماه گارانتی معتبر' } },
    { id: 35, name: 'کانکتور BNC مسی برای کابل کوکسیال (بسته ۱۰ عددی)', slug: 'tp-link-bnc-connector-10', brand: 'tp-link', brandName: 'تی‌پی‌لینک', category: 'سیم و کابل دوربین', categorySlug: 'cables-wiring', image: 'assets/images/products/tp-link-bnc-connector-10.svg', images: ['assets/images/products/tp-link-bnc-connector-10.svg'], categoryId: 11, price: 320000, oldPrice: 380000, rating: 4.0, reviewCount: 22, discount: 16, isNew: false, isBestSeller: false, inStock: true, sku: 'TPL-BNC10', shortDescription: 'کانکتور BNC مسی با سوزن فنری برای کوکسیال RG59.', description: 'کانکتور BNC مسی با سوزن فنری و آب‌بندی لاستیکی، مناسب اتصال کابل کوکسیال RG59 و RG58 به دوربین و رکورد.', specs: { 'نوع': 'BNC با سوزن فنری', 'جنس': 'مس', 'سازگاری': 'RG59 / RG58', 'آب‌بندی': 'لاستیکی', 'بسته‌بندی': '۱۰ عدد', 'گارانتی': '۶ ماه گارانتی معتبر' } },

    { id: 36, name: 'سنسور حرکتی PIR بی‌سیم برای سیستم هشدار', slug: 'feritac-pir-motion-sensor', brand: 'feritac', brandName: 'فریتک', category: 'تجهیزات جانبی تخصصی', categorySlug: 'specialized-equipment', image: 'assets/images/products/feritac-pir-motion-sensor.svg', images: ['assets/images/products/feritac-pir-motion-sensor.svg'], categoryId: 12, price: 1650000, oldPrice: 1890000, rating: 4.2, reviewCount: 16, discount: 13, isNew: false, isBestSeller: false, inStock: true, sku: 'FER-PIR01', shortDescription: 'سنسور حرکتی PIR بی‌سیم با زاویه ۱۱۰ درجه و برد ۱۲ متر.', description: 'سنسور حرکتی PIR بی‌سیم با زاویه تشخیص ۱۱۰ درجه، برد ۱۲ متر، قابلیت تنظیم حساسیت و هشدار کاهش باتری، مکمل مناسب سیستم‌های دزدگیر.', specs: { 'نوع': 'PIR بی‌سیم', 'زاویه تشخیص': '۱۱۰ درجه', 'برد': '۱۲ متر', 'ارتباط': 'بی‌سیم ۴۳۳ مگاهرتز', 'تغذیه': 'باتری CR123A', 'گارانتی': '۱۲ ماه گارانتی معتبر' } },
    { id: 37, name: 'برچسب RFID کنترل تردد با کارت آویزان', slug: 'feritac-rfid-card-tag', brand: 'feritac', brandName: 'فریتک', category: 'تجهیزات جانبی تخصصی', categorySlug: 'specialized-equipment', image: 'assets/images/products/feritac-rfid-card-tag.svg', images: ['assets/images/products/feritac-rfid-card-tag.svg'], categoryId: 12, price: 38000, oldPrice: 45000, rating: 4.0, reviewCount: 53, discount: 16, isNew: false, isBestSeller: true, inStock: true, sku: 'FER-RFID01', shortDescription: 'برچسب RFID ۱۳٫۵۶ مگاهرتز با کارت آویزان قابل شماره‌گذاری.', description: 'برچسب RFID با فرکانس ۱۳٫۵۶ مگاهرتز به همراه کارت آویزان شماره‌دار، سازگار با دستگاه‌های کنترل تردد فریتک و قابل چاپ شناسه روی سطح کارت.', specs: { 'فرکانس': '۱۳٫۵۶ مگاهرتز', 'نوع': 'MIFARE Classic', 'تعداد': '۵۰ عدد', 'قابلیت شماره‌گذاری': 'بله', 'سازگاری': 'دستگاه‌های کنترل تردد RFID', 'گارانتی': '۶ ماه گارانتی معتبر' } }
  ],

  articleCategories: [
    { id: 1, name: 'راهنمای خرید دوربین', slug: 'buying-guide', count: 8 },
    { id: 2, name: 'آموزش نصب دوربین', slug: 'installation-tutorial', count: 12 },
    { id: 3, name: 'مقایسه دوربین', slug: 'camera-comparison', count: 6 },
    { id: 4, name: 'نگهداری سیستم امنیتی', slug: 'security-maintenance', count: 9 },
    { id: 5, name: 'اخبار فناوری امنیتی', slug: 'security-news', count: 5 }
  ],

  articles: [
    { id: 1, slug: 'best-cctv-camera-guide', title: 'راهنمای خرید دوربین مداربسته مناسب', excerpt: 'انتخاب دوربین مداربسته مناسب نیاز به بررسی عواملی از جمله کیفیت تصویر، دید در شب و کاربرد مورد نظر دارد.', category: 'راهنمای خرید دوربین', categorySlug: 'buying-guide', date: '۱۵ مرداد ۱۴۰۵', readTime: '۵ دقیقه', author: 'تیم تحریریه کمزی', image: 'assets/images/products/hikvision-ds-2cd2t47wd-l3.svg', content: '<p>انتخاب دوربین مداربسته مناسب یکی از مهم‌ترین تصمیمات هر پروژه امنیتی است.</p><h2>کیفیت تصویر</h2><p>وضوح تصویر یکی از مهم‌ترین مشخصات است. دوربین‌های ۲ مگاپیکسلی برای فضاهای کوچک و ۴ مگاپیکسل و 4K برای پروژه‌های حرفه‌ای مناسب‌اند.</p><h2>دید در شب</h2><p>دید در شب پیشرفته یعنی نظارت واضح‌تر در تاریکی؛ برد IR بین ۲۰ تا ۴۰ متر برای محوطه‌های بیرونی کافی است.</p><h2>برندهای پیشنهادی</h2><p>هایکویژن، داهوا، یونیکنیو، تیاندی و ویوتک از معتبرترین برندهای بازار ایران هستند.</p>' },
    { id: 2, slug: 'security-system-maintenance-tips', title: 'نکات مهم در نگهداری سیستم امنیتی', excerpt: 'نگهداری صحیح از سیستم امنیتی عمر مفید آن را افزایش می‌دهد و از خرابی زودهنگام جلوگیری می‌کند.', category: 'نگهداری سیستم امنیتی', categorySlug: 'security-maintenance', date: '۱۲ مرداد ۱۴۰۵', readTime: '۴ دقیقه', author: 'تیم تحریریه کمزی', image: 'assets/images/products/feritac-wireless-alarm-kit.svg', content: '<p>نگهداری صحیح از سیستم امنیتی بسیار مهم است.</p><h2>تمیز کردن منظم</h2><p>لنز و بدنه دوربین را پس از هر بار استفاده تمیز کنید.</p><h2>بررسی اتصالات</h2><p>کابل‌ها و اتصالات را دوره‌ای بررسی کنید.</p>' },
    { id: 3, slug: 'hikvision-vs-dahua-comparison', title: 'مقایسه برندهای امنیتی: هایکویژن یا داهوا؟', excerpt: 'بررسی تفصیلی و مقایسه دو برند مطرح بازار دوربین مداربسته ایران.', category: 'مقایسه دوربین', categorySlug: 'camera-comparison', date: '۱۰ مرداد ۱۴۰۵', readTime: '۷ دقیقه', author: 'تیم تحریریه کمزی', image: 'assets/images/products/dahua-hdw3441r3.svg', content: '<p>هایکویژن و داهوا دو برند برتر بازار دوربین مداربسته ایران هستند.</p><h2>کیفیت ساخت</h2><p>هر دو برند کیفیت بالایی دارند؛ داهوا در فناوری Starlight و هایکویژن در پایداری نرم‌افزاری شناخته شده است.</p><h2>قیمت</h2><p>قیمت محصولات نسبتاً مشابه است.</p>' },
    { id: 4, slug: 'cctv-installation-starter-kit', title: 'تجهیزات ضروری برای نصب دوربین مداربسته', excerpt: 'لیست کامل تجهیزات مورد نیاز برای راه‌اندازی یک پروژه نصب دوربین حرفه‌ای.', category: 'آموزش نصب دوربین', categorySlug: 'installation-tutorial', date: '۸ مرداد ۱۴۰۵', readTime: '۶ دقیقه', author: 'تیم تحریریه کمزی', image: 'assets/images/products/feritac-cctv-test-probe.svg', content: '<p>برای راه‌اندازی یک پروژه نصب دوربین به تجهیزات مختلفی نیاز دارید.</p><h2>تجهیزات پایه</h2><p>پراب تست، تستر کابل، کابل کوکسیال و شبکه، پایه دوربین و رک از تجهیزات پایه هستند.</p>' },
    { id: 5, slug: 'camera-installation-safety', title: 'ایمنی در نصب و راه‌اندازی سیستم امنیتی', excerpt: 'رعایت نکات ایمنی هنگام نصب دوربین و سیستم امنیتی از اهمیت بالایی برخوردار است.', category: 'آموزش نصب دوربین', categorySlug: 'installation-tutorial', date: '۵ مرداد ۱۴۰۵', readTime: '۳ دقیقه', author: 'تیم تحریریه کمزی', image: 'assets/images/products/sepco-safety-helmet.svg', content: '<p>ایمنی در نصب دوربین و سیستم امنیتی بسیار مهم است.</p><h2>تجهیزات حفاظتی</h2><p>همیشه از کلاه ایمنی، دستکش عایق و عینک محافظ استفاده کنید.</p>' },
    { id: 6, slug: 'new-cctv-2026', title: 'معرفی جدیدترین دوربین‌های ۲۰۲۶', excerpt: 'نگاهی به جدیدترین دوربین‌های عرضه شده در بازار ایران.', category: 'اخبار فناوری امنیتی', categorySlug: 'security-news', date: '۳ مرداد ۱۴۰۵', readTime: '۵ دقیقه', author: 'تیم تحریریه کمزی', image: 'assets/images/products/uniview-ipc2124sr3-ud.svg', content: '<p>دوربین‌های جدید و نوآورانه‌ای در بازار عرضه شده‌اند.</p><h2>سنسورهای نسل جدید</h2><p>کیفیت تصویر بالاتر و دید در شب پیشرفته‌تر.</p>' },
    { id: 7, slug: 'camera-for-every-space', title: 'راهنمای انتخاب دوربین مناسب برای هر فضا', excerpt: 'انتخاب دوربین مناسب برای هر پروژه و فضای مشخص.', category: 'راهنمای خرید دوربین', categorySlug: 'buying-guide', date: '۱ مرداد ۱۴۰۵', readTime: '۴ دقیقه', author: 'تیم تحریریه کمزی', image: 'assets/images/products/hikvision-ds-2cd2143g2-i.svg', content: '<p>انتخاب دوربین مناسب از مهم‌ترین تصمیمات هر پروژه امنیتی است.</p>' },
    { id: 8, slug: 'essential-security-equipment', title: 'تجهیزات ضروری برای هر خانه', excerpt: 'هر خانه‌ای به مجموعه‌ای از تجهیزات پایه نظارتی نیاز دارد.', category: 'راهنمای خرید دوربین', categorySlug: 'buying-guide', date: '۲۸ تیر ۱۴۰۵', readTime: '۳ دقیقه', author: 'تیم تحریریه کمزی', image: 'assets/images/products/tiandy-tc-s32di.svg', content: '<p>داشتن سیستم پایه در هر خانه ضروری است.</p><h2>تجهیزات پایه</h2><p>دوربین داخلی، دوربین بولت، دستگاه ضبط و کابل.</p>' }
  ],

  reviews: [
    { id: 1, productId: 1, author: 'علی محمدی', date: '۱۰ مرداد ۱۴۰۵', rating: 5, title: 'تصویر فوق‌العاده روشن', text: 'دوربین در شب هم تصویر روشن و بدون نویز دارد. کیفیت ساخت بدنه هم عالی است.' },
    { id: 2, productId: 1, author: 'رضا احمدی', date: '۸ مرداد ۱۴۰۵', rating: 4, title: 'خوب ولی گران', text: 'کیفیت عالی ولی قیمت نسبت به بازار کمی بالاتر است.' },
    { id: 3, productId: 1, author: 'حسن رضایی', date: '۵ مرداد ۱۴۰۵', rating: 5, title: 'پیشنهاد می‌کنم', text: 'چند ماه است در پارکینگ نصب کرده‌ایم و بی‌نقص کار می‌کند.' },
    { id: 4, productId: 6, author: 'امیر حسینی', date: '۱۲ مرداد ۱۴۰۵', rating: 5, title: 'راه‌اندازی آسان', text: 'برق و شبکه را با یک کابل بالا آورد؛ راه‌اندازی بسیار ساده بود.' },
    { id: 5, productId: 6, author: 'سعید کریمی', date: '۹ مرداد ۱۴۰۵', rating: 5, title: 'ارزش خرید بالا', text: 'با پشتیبانی فنی خوب و گارانتی معتبر، ارزش قیمتش را دارد.' },
    { id: 6, productId: 29, author: 'مهدی عباسی', date: '۷ مرداد ۱۴۰۵', rating: 4, title: 'مناسب برای ضبط طولانی', text: 'برای ضبط پیوسته طراحی شده و تا حالا مشکلی نداشته است.' },
    { id: 7, productId: 10, author: 'کامران نوری', date: '۱۱ مرداد ۱۴۰۵', rating: 5, title: 'حرفه‌ای و مطمئن', text: 'نصب بدون سیم‌کشی انجام شد و اپلیکیشن هم سریع اعلان می‌دهد.' },
    { id: 8, productId: 21, author: 'فریدون صالحی', date: '۶ مرداد ۱۴۰۵', rating: 4, title: 'ساخت محکم', text: 'پایه فلزی و محکم است و روی دیوار بی‌لرزش می‌ماند.' }
  ],

  /* orders, addresses, and user data are stored per-user in localStorage.
     See common.js for user management (register/login/session).
     User-specific data keys: as_user_{id}_orders, as_user_{id}_addresses, as_user_{id}_profile */


  faqCategories: [
    { id: 'orders', name: 'سفارش' },
    { id: 'payment', name: 'پرداخت' },
    { id: 'shipping', name: 'ارسال' },
    { id: 'returns', name: 'مرجوعی' },
    { id: 'products', name: 'محصولات' },
    { id: 'account', name: 'حساب کاربری' }
  ],

  faqItems: [
    { id: 1, category: 'orders', question: 'چگونه سفارش خود را ثبت کنم؟', answer: 'محصول مورد نظر را به سبد خرید اضافه کنید و مراحل تکمیل اطلاعات و پرداخت را طی کنید.' },
    { id: 2, category: 'orders', question: 'آیا امکان لغو سفارش وجود دارد؟', answer: 'بله، تا زمانی که سفارش ارسال نشده باشد، امکان لغو آن وجود دارد.' },
    { id: 3, category: 'orders', question: 'چگونه سفارش خود را پیگیری کنم؟', answer: 'با ورود به حساب کاربری و بخش سفارش‌های من، وضعیت سفارش را مشاهده کنید.' },
    { id: 4, category: 'payment', question: 'چه روش‌های پرداختی پذیرفته می‌شود؟', answer: 'پرداخت آنلاین از طریق درگاه بانکی و همچنین کارت به کارت و پرداخت در محل (در صورت فعال بودن).' },
    { id: 5, category: 'payment', question: 'آیا پرداخت امن است؟', answer: 'بله، اطلاعات کارت بانکی شما روی سرور فروشگاه ذخیره نمی‌شود و از پروتکل امن SSL استفاده می‌شود.' },
    { id: 6, category: 'shipping', question: 'هزینه ارسال چقدر است؟', answer: 'ارسال برای سفارش‌های بالای ۵۰۰ هزار تومان رایگان است.' },
    { id: 7, category: 'shipping', question: 'زمان تحویل سفارش چقدر است؟', answer: 'ارسال عادی ۳ تا ۵ روز کاری و ارسال سریع ۱ تا ۲ روز کاری.' },
    { id: 8, category: 'returns', question: 'آیا امکان مرجوعی کالا وجود دارد؟', answer: 'بله، تا ۷ روز پس از تحویل در صورت عدم رضایت و سالم بودن بسته‌بندی.' },
    { id: 9, category: 'products', question: 'آیا محصولات ضمانت اصالت دارند؟', answer: 'بله، تمامی محصولات با ضمانت اصالت از نمایندگی‌های رسمی تأمین شده‌اند.' },
    { id: 10, category: 'products', question: 'برای پوشش تصویر چند دوربین نیاز دارم؟', answer: 'برای هر ورودی اصلی یک دوربین و برای محدوده‌های بزرگ‌تر از پانوژوم یا دوربین با لنز واید استفاده کنید. کارشناسان ما برای طراحی پوشش تصویر مشاوره رایگان ارائه می‌دهند.' },
    { id: 11, category: 'products', question: 'هارد مخصوص دوربین با هارد معمولی چه تفاوتی دارد؟', answer: 'هاردهای نظارتی برای ضبط پیوسته ۲۴ ساعته بهینه شده‌اند و تحمل کارکرد دائمی بالاتری دارند.' },
    { id: 12, category: 'account', question: 'چگونه حساب کاربری بسازم؟', answer: 'با کلیک روی آیکون حساب کاربری و انتخاب ثبت‌نام.' }
  ],

  shippingMethods: [
    { id: 'normal', name: 'ارسال عادی', description: 'تحویل ۳ تا ۵ روز کاری', price: 0 },
    { id: 'express', name: 'ارسال سریع', description: 'تحویل ۱ تا ۲ روز کاری', price: 35000 }
  ],

  searchSuggestions: ['دوربین مداربسته', 'دوربین تحت شبکه', 'NVR', 'DVR', 'کابل کوکسیال', 'لنز دوربین', 'هارد نظارتی', 'سوئیچ PoE', 'کنترل تردد', 'دزدگیر بی‌سیم']
};

/* ================================================================
   Format Helpers
   ================================================================ */
const Format = {
  price(v) { return new Intl.NumberFormat('fa-IR').format(v); },
  priceWithCurrency(v) { return this.price(v) + ' تومان'; },
  rating(v) { const f = Math.floor(v); const h = v % 1 >= 0.5 ? 1 : 0; return { full: f, half: h, empty: 5 - f - h }; },
  starHtml(v) { const r = this.rating(v); let s = ''; for (let i = 0; i < r.full; i++) s += Icons.star; for (let i = 0; i < r.empty; i++) s += Icons.starEmpty; return s; },
  productSlug(p) { return p.slug || 'product-' + p.id; },
  categorySlug(c) { return c.slug || 'category-' + c.id; },
  brandSlug(b) { return b.name || 'brand-' + b.id; },
  toPersianNumber(n) { const d = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹']; return String(n).replace(/\d/g, x => d[x]); }
};

/* ================================================================
   Storefront catalog — database/API as source of truth.
   Static arrays above are offline fallback only. On load, products,
   categories (and brands) are replaced with /api data so admin
   changes are reflected on the storefront. UI/styling/routes unchanged.
   ================================================================ */
(function () {
  if (typeof AppData === 'undefined') return;

  function toNum(v, fallback) {
    var n = Number(v);
    return isFinite(n) ? n : fallback;
  }

  function normalizeProduct(p, idx) {
    var images = Array.isArray(p.images) && p.images.length ? p.images.slice()
      : (p.image ? [p.image] : []);
    return {
      id: toNum(p.id, idx + 1),
      name: p.name || '',
      slug: p.slug || ('product-' + (p.id != null ? p.id : idx)),
      brand: p.brand || '',
      brandName: p.brandName || p.brand || '',
      category: p.category || '',
      categorySlug: p.categorySlug || p.category || '',
      categoryId: p.categoryId != null ? p.categoryId : null,
      image: p.image || (images[0] || ''),
      images: images,
      price: toNum(p.price, 0),
      oldPrice: p.oldPrice != null ? toNum(p.oldPrice, null) : null,
      rating: toNum(p.rating, 0),
      reviewCount: toNum(p.reviewCount, 0),
      discount: toNum(p.discount, 0),
      isNew: !!p.isNew,
      isBestSeller: !!p.isBestSeller,
      inStock: p.inStock !== undefined ? !!p.inStock : true,
      stockCount: p.stockCount != null ? toNum(p.stockCount, 0) : (p.inStock ? 50 : 0),
      sku: p.sku || '',
      shortDescription: p.shortDescription || '',
      description: p.description || p.shortDescription || '',
      specs: (p.specs && typeof p.specs === 'object') ? p.specs : {}
    };
  }

  function normalizeCategory(c, idx) {
    var rawSubs = Array.isArray(c.subcategories) ? c.subcategories
      : (Array.isArray(c.subcategoryItems) ? c.subcategoryItems : []);
    var subs = rawSubs.map(function (s) {
      return typeof s === 'string' ? s : (s && s.name ? String(s.name) : '');
    }).filter(function (s) { return !!s; });
    var subItems = Array.isArray(c.subcategoryItems) ? c.subcategoryItems.map(function (s) {
      return { id: toNum(s.id, 0), name: String(s.name || '') };
    }).filter(function (s) { return !!s.name; }) : [];
    return {
      id: toNum(c.id, idx + 1),
      name: c.name || '',
      slug: c.slug || ('category-' + (c.id != null ? c.id : idx)),
      icon: c.icon || 'package',
      color: c.color || '',
      description: c.description || '',
      count: toNum(c.count, 0),
      subcategories: subs,
      subcategoryItems: subItems
    };
  }

  function normalizeBrand(b, idx) {
    return {
      id: toNum(b.id, idx + 1),
      name: b.name || b.slug || ('brand-' + idx),
      slug: b.slug || b.name || ('brand-' + idx),
      displayName: b.displayName || b.display_name || b.name || '',
      logo: b.logo || '',
      country: b.country || '',
      description: b.description || '',
      count: toNum(b.count, 0)
    };
  }

  function applyCatalog(products, categories, brands) {
    if (Array.isArray(products)) {
      AppData.products = products.map(normalizeProduct);
    }
    if (Array.isArray(categories)) {
      AppData.categories = categories.map(normalizeCategory);
    }
    if (Array.isArray(brands) && brands.length) {
      AppData.brands = brands.map(normalizeBrand);
    }
    try {
      if (typeof document !== 'undefined' && document.dispatchEvent) {
        document.dispatchEvent(new CustomEvent('camzy:catalog-updated'));
      }
    } catch (e) {}
  }

  function fetchJson(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return res.json();
    });
  }

  function refreshFromAPI() {
    // file:// preview has no API — keep static fallback silently.
    if (typeof fetch !== 'function') return Promise.resolve(false);
    if (typeof location !== 'undefined' && location.protocol === 'file:') return Promise.resolve(false);
    return Promise.all([
      fetchJson('/api/products?limit=200').catch(function () { return null; }),
      fetchJson('/api/categories').catch(function () { return null; }),
      fetchJson('/api/brands').catch(function () { return null; })
    ]).then(function (results) {
      var products = results[0], categories = results[1], brands = results[2];
      if (!Array.isArray(products) && !Array.isArray(categories)) return false;
      applyCatalog(
        Array.isArray(products) ? products : null,
        Array.isArray(categories) ? categories : null,
        Array.isArray(brands) ? brands : null
      );
      return true;
    }).catch(function () { return false; });
  }

  AppData.refreshFromAPI = refreshFromAPI;
  AppData.catalogReady = refreshFromAPI();
})();

/* ================================================================
   Derived review helpers — always computed from actual reviews array
   ================================================================ */
function getReviewCount(productId) {
  return AppData.reviews.filter(function (r) { return r.productId === productId; }).length;
}
function getAvgRating(productId) {
  var list = AppData.reviews.filter(function (r) { return r.productId === productId; });
  if (list.length === 0) return 0;
  return list.reduce(function (s, r) { return s + r.rating; }, 0) / list.length;
}
