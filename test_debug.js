const http = require('http');

async function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        console.log('Response status:', res.statusCode);
        console.log('Response headers:', res.headers);
        console.log('Response body:', body);
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
  console.log('Token:', token);

  // Create option
  const optionData = JSON.stringify({
    title: 'گارانتی تمدید شده',
    description: 'گارانتی ۳ ساله به جای ۱ ساله',
    price: 500000,
    discountPercent: 10,
    discountPrice: 450000,
    sortOrder: 1,
    isActive: 1
  });
  const createOptions = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/admin/products/1/options',
    method: 'POST',
    headers: { 
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Content-Length': optionData.length
    }
  };
  console.log('\n--- Creating option ---');
  await request(createOptions, optionData);
}

runTest().catch(console.error);