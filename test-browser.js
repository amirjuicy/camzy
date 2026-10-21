const puppeteer = require('puppeteer-core');

async function test() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', error => {
    errors.push(error.message);
  });
  
  // First login
  await page.goto('http://127.0.0.1:3000/login.html', { waitUntil: 'networkidle0' });
  await page.type('#login-identifier', '09123456789');
  await page.type('#login-password', '123456');
  await page.click('#login-form button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle0' });
  
  console.log('After login, URL:', page.url());
  
  // Now test account page
  await page.goto('http://127.0.0.1:3000/account.html', { waitUntil: 'networkidle0' });
  console.log('Account page URL:', page.url());
  console.log('Account page title:', await page.title());
  
  // Check for errors
  if (errors.length > 0) {
    console.log('ERRORS:');
    errors.forEach(e => console.log('  -', e));
  } else {
    console.log('No console errors on account.html');
  }
  
  // Check sidebar content
  const sidebarName = await page.$eval('.account-sidebar__name', el => el.textContent);
  console.log('Sidebar name:', sidebarName);
  
  // Test navigation to orders
  await page.goto('http://127.0.0.1:3000/account-orders.html', { waitUntil: 'networkidle0' });
  console.log('Orders page URL:', page.url());
  const ordersTitle = await page.$eval('.account-content__title', el => el.textContent);
  console.log('Orders page title:', ordersTitle);
  
  // Test profile
  await page.goto('http://127.0.0.1:3000/account-profile.html', { waitUntil: 'networkidle0' });
  console.log('Profile page URL:', page.url());
  const profileTitle = await page.$eval('.account-content__title', el => el.textContent);
  console.log('Profile page title:', profileTitle);
  
  // Test addresses
  await page.goto('http://127.0.0.1:3000/account-addresses.html', { waitUntil: 'networkidle0' });
  console.log('Addresses page URL:', page.url());
  const addressesTitle = await page.$eval('.account-content__title', el => el.textContent);
  console.log('Addresses page title:', addressesTitle);
  
  // Test wishlist
  await page.goto('http://127.0.0.1:3000/account-wishlist.html', { waitUntil: 'networkidle0' });
  console.log('Wishlist page URL:', page.url());
  const wishlistTitle = await page.$eval('.account-content__title', el => el.textContent);
  console.log('Wishlist page title:', wishlistTitle);
  
  // Test cart
  await page.goto('http://127.0.0.1:3000/account-cart.html', { waitUntil: 'networkidle0' });
  console.log('Cart page URL:', page.url());
  const cartTitle = await page.$eval('.account-content__title', el => el.textContent);
  console.log('Cart page title:', cartTitle);
  
  // Test notifications
  await page.goto('http://127.0.0.1:3000/account-notifications.html', { waitUntil: 'networkidle0' });
  console.log('Notifications page URL:', page.url());
  const notifTitle = await page.$eval('.account-content__title', el => el.textContent);
  console.log('Notifications page title:', notifTitle);
  
  // Test logout (click the logout link in sidebar)
  await page.goto('http://127.0.0.1:3000/account.html', { waitUntil: 'networkidle0' });
  await page.click('.account-nav-link[href="login.html"]');
  // Wait for redirect to login.html
  await page.waitForFunction(() => window.location.href.includes('login.html'), { timeout: 5000 });
  console.log('After logout, URL:', page.url());
  
  await browser.close();
}

test().catch(console.error);