const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, body, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runE2ETest() {
  // 1. Login as customer
  const loginData = JSON.stringify({ identifier: '09123456789', password: 'password123' });
  const loginOptions = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': loginData.length }
  };
  let loginResult = await request(loginOptions, loginData);
  if (loginResult.status === 404) {
    // Create user first
    const regData = JSON.stringify({ firstName: 'Test', lastName: 'User', mobile: '09123456789', email: 'test@test.com', password: 'password123' });
    const regOptions = {
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': regData.length }
    };
    loginResult = await request(regOptions, regData);
  }
  console.log('Login/Register:', loginResult.status, loginResult.body);
  const token = JSON.parse(loginResult.body).token;
  const authHeader = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };

  // 2. Add product with options to cart
  // First create an option for product 1
  const adminLoginData = JSON.stringify({ username: 'admin', password: 'admin123' });
  const adminLoginOptions = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/admin/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': adminLoginData.length }
  };
  const adminLoginResult = await request(adminLoginOptions, adminLoginData);
  const adminToken = JSON.parse(adminLoginResult.body).token;
  const adminAuthHeader = { 'Authorization': 'Bearer ' + adminToken, 'Content-Type': 'application/json' };

  // Create option for product 1
  const optionData = JSON.stringify({
    title: 'گارانتی تمدید شده',
    description: 'گارانتی ۳ ساله',
    price: 500000,
    discountPercent: 10,
    discountPrice: 450000,
    isActive: 1
  });
  await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/admin/products/1/options',
    method: 'POST',
    headers: adminAuthHeader
  }, optionData);

  // 3. Get product options (public)
  const publicOptionsResult = await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/products/1/options',
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  console.log('Public options:', publicOptionsResult.body);

  // 4. Add to cart with option selected
  const addToCartData = JSON.stringify({
    productId: 1,
    quantity: 1,
    pricingMode: 'retail',
    options: [{ id: 1, title: 'گارانتی تمدید شده', price: 450000 }] // Use the discounted price
  });
  const addToCartResult = await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/cart/items',
    method: 'POST',
    headers: authHeader
  }, addToCartData);
  console.log('\nAdd to cart:', addToCartResult.status, addToCartResult.body);

  // 5. Get cart
  const cartResult = await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/cart',
    method: 'GET',
    headers: authHeader
  });
  console.log('\nCart:', cartResult.body);

  // 6. Create order (checkout)
  const orderData = JSON.stringify({
    address: 'Tehran, Test Street, No 123',
    province: 'Tehran',
    city: 'Tehran',
    postalCode: '1234567890',
    paymentMethod: 'online', // Use online payment since COD might be disabled
    discountCode: '',
    shipping: 0,
    items: [{
      productId: 1,
      quantity: 1,
      pricingMode: 'retail',
      options: [{ id: 6, title: 'گارانتی تمدید شده', price: 450000 }] // Use the new option with discount
    }]
  });
  const orderResult = await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/orders',
    method: 'POST',
    headers: authHeader
  }, orderData);
  console.log('\nCreate order:', orderResult.status, orderResult.body);
  
  if (orderResult.status === 201) {
    const order = JSON.parse(orderResult.body);
    console.log('\nOrder items:', JSON.stringify(order.items, null, 2));
    console.log('Order total:', order.total);
  }

  // 7. Test server-side validation: try to create order with tampered option price
  console.log('\n=== Testing server-side price validation ===');
  const tamperedOrderData = JSON.stringify({
    address: 'Tehran, Test Street, No 123',
    province: 'Tehran',
    city: 'Tehran',
    postalCode: '1234567890',
    paymentMethod: 'online',
    discountCode: '',
    shipping: 0,
    items: [{
      productId: 1,
      quantity: 1,
      pricingMode: 'retail',
      options: [{ id: 1, title: 'گارانتی تمدید شده', price: 1000 }] // Tampered price - should be rejected or recalculated
    }]
  });
  const tamperedResult = await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/orders',
    method: 'POST',
    headers: authHeader
  }, tamperedOrderData);
  console.log('\nTampered order:', tamperedResult.status, tamperedResult.body);

  // 8. Test inactive option rejection
  console.log('\n=== Testing inactive option rejection ===');
  // First disable the option
  await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/admin/products/1/options/1',
    method: 'PUT',
    headers: adminAuthHeader
  }, JSON.stringify({ isActive: 0 }));

  const inactiveOrderData = JSON.stringify({
    address: 'Tehran, Test Street, No 123',
    province: 'Tehran',
    city: 'Tehran',
    postalCode: '1234567890',
    paymentMethod: 'online',
    discountCode: '',
    shipping: 0,
    items: [{
      productId: 1,
      quantity: 1,
      pricingMode: 'retail',
      options: [{ id: 1, title: 'گارانتی تمدید شده', price: 450000 }]
    }]
  });
  const inactiveResult = await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/orders',
    method: 'POST',
    headers: authHeader
  }, inactiveOrderData);
  console.log('\nInactive option order:', inactiveResult.status, inactiveResult.body);

  // Re-enable option
  await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/admin/products/1/options/1',
    method: 'PUT',
    headers: adminAuthHeader
  }, JSON.stringify({ isActive: 1 }));

  // 9. Test option from another product rejection
  console.log('\n=== Testing cross-product option rejection ===');
  const crossProductOrderData = JSON.stringify({
    address: 'Tehran, Test Street, No 123',
    province: 'Tehran',
    city: 'Tehran',
    postalCode: '1234567890',
    paymentMethod: 'online',
    discountCode: '',
    shipping: 0,
    items: [{
      productId: 1,
      quantity: 1,
      pricingMode: 'retail',
      options: [{ id: 5, title: 'گزینه محصول ۲', price: 100000 }] // Option belongs to product 2
    }]
  });
  const crossResult = await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/orders',
    method: 'POST',
    headers: authHeader
  }, crossProductOrderData);
  console.log('\nCross-product option order:', crossResult.status, crossResult.body);

  console.log('\n=== E2E Test Complete ===');
}

runE2ETest().catch(console.error);