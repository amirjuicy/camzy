const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Headers:', JSON.stringify(res.headers, null, 2));
        console.log('Body:', body);
        resolve({ status: res.statusCode, body, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTest() {
  // Login
  const loginData = JSON.stringify({ username: 'admin', password: 'admin123' });
  const loginOptions = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/admin/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': loginData.length }
  };
  const loginResult = await request(loginOptions, loginData);
  const token = JSON.parse(loginResult.body).token;
  console.log('Token obtained\n');

  // Test 1: GET public options
  console.log('=== Test 1: GET /api/products/1/options (public) ===');
  await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/products/1/options',
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  // Test 2: GET admin options
  console.log('\n=== Test 2: GET /api/admin/products/1/options (admin) ===');
  await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/admin/products/1/options',
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
  });

  // Test 3: POST admin options
  console.log('\n=== Test 3: POST /api/admin/products/1/options (admin) ===');
  const optionData = JSON.stringify({
    title: 'Test Option',
    price: 100000,
    isActive: 1
  });
  await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/admin/products/1/options',
    method: 'POST',
    headers: { 
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Content-Length': optionData.length
    }
  }, optionData);
}

runTest().catch(console.error);