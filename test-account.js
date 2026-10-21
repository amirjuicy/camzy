const http = require('http');

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  // Login
  const loginRes = await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { identifier: '09123456789', password: '123456' });
  
  const token = loginRes.body.token;
  console.log('Login success, token:', token.substring(0, 20) + '...');
  
  // Test account page HTML
  const accountRes = await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/account.html',
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  
  console.log('Account page status:', accountRes.statusCode);
  console.log('Account page has account-content:', accountRes.body.includes('account-content'));
  console.log('Account page has sidebar:', accountRes.body.includes('account-sidebar'));
  
  // Test API endpoints
  const endpoints = ['/api/auth/me', '/api/cart', '/api/wishlist', '/api/users/u_mumvfbxn3ooft/addresses', '/api/users/u_mumvfbxn3ooft/orders', '/api/notifications'];
  for (const ep of endpoints) {
    const res = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: ep,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    console.log(`${ep}: ${res.statusCode}`);
  }
}

test().catch(console.error);