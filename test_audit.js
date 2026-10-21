const http = require('http');

async function request(options, data) {
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

async function runTests() {
  // 1. Login as admin
  const loginData = JSON.stringify({ username: 'admin', password: 'admin123' });
  const loginOptions = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/admin/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': loginData.length }
  };
  const loginResult = await request(loginOptions, loginData);
  console.log('Login:', loginResult.status, loginResult.body);
  const token = JSON.parse(loginResult.body).token;

  const authHeader = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };

  // 2. Create a test option for product 1
  const optionData = JSON.stringify({
    title: 'گارانتی تمدید شده',
    description: 'گارانتی ۳ ساله به جای ۱ ساله',
    price: 500000,
    discountPercent: 10,
    discountPrice: 450000,
    sortOrder: 1,
    isActive: 1
  });
  console.log('Creating option with data:', optionData);
  const createOptions = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/admin/products/1/options',
    method: 'POST',
    headers: authHeader
  };
  const createResult = await request(createOptions, optionData);
  console.log('\nCreate option:', createResult.status, createResult.body);
  if (createResult.status !== 201) {
    console.log('CREATE FAILED - stopping');
    return;
  }
  const createdOption = JSON.parse(createResult.body);
  const optionId = createdOption.id;

  // 3. List options (admin) - should include inactive
  const listAdminOptions = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/admin/products/1/options',
    method: 'GET',
    headers: authHeader
  };
  const listAdminResult = await request(listAdminOptions);
  console.log('\nList options (admin):', listAdminResult.status, listAdminResult.body);

  // 4. List options (public) - should only show active
  const listPublicOptions = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/products/1/options',
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  };
  const listPublicResult = await request(listPublicOptions);
  console.log('\nList options (public):', listPublicResult.status, listPublicResult.body);

  // 5. Edit the option
  const editData = JSON.stringify({
    title: 'گارانتی تمدید شده (ویرایش)',
    price: 600000,
    discountPercent: 15,
    discountPrice: 510000
  });
  console.log('Editing option with data:', editData);
  const editOptions = {
    hostname: '127.0.0.1',
    port: 3000,
    path: `/api/admin/products/1/options/${optionId}`,
    method: 'PUT',
    headers: authHeader
  };
  const editResult = await request(editOptions, editData);
  console.log('\nEdit option:', editResult.status, editResult.body);

  // 6. Disable the option
  const disableData = JSON.stringify({ isActive: 0 });
  const disableOptions = {
    hostname: '127.0.0.1',
    port: 3000,
    path: `/api/admin/products/1/options/${optionId}`,
    method: 'PUT',
    headers: authHeader
  };
  const disableResult = await request(disableOptions, disableData);
  console.log('\nDisable option:', disableResult.status, disableResult.body);

  // 7. Verify public list no longer shows it
  const listPublicResult2 = await request(listPublicOptions);
  console.log('\nList options (public) after disable:', listPublicResult2.status, listPublicResult2.body);

  // 8. Re-enable
  const enableData = JSON.stringify({ isActive: 1 });
  const enableOptions = {
    hostname: '127.0.0.1',
    port: 3000,
    path: `/api/admin/products/1/options/${optionId}`,
    method: 'PUT',
    headers: authHeader
  };
  const enableResult = await request(enableOptions, enableData);
  console.log('\nRe-enable option:', enableResult.status, enableResult.body);

  // 9. Delete the option
  const deleteOptions = {
    hostname: '127.0.0.1',
    port: 3000,
    path: `/api/admin/products/1/options/${optionId}`,
    method: 'DELETE',
    headers: authHeader
  };
  const deleteResult = await request(deleteOptions);
  console.log('\nDelete option:', deleteResult.status, deleteResult.body);

  // 10. Verify it's gone
  const listAdminResult2 = await request(listAdminOptions);
  console.log('\nList options (admin) after delete:', listAdminResult2.status, listAdminResult2.body);

  // 11. Test option isolation - create option for product 2, verify not visible on product 1
  const optionData2 = JSON.stringify({
    title: 'گزینه محصول ۲',
    price: 100000,
    isActive: 1
  });
  console.log('Creating option for product 2 with data:', optionData2);
  const createOptions2 = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/admin/products/2/options',
    method: 'POST',
    headers: authHeader
  };
  const createResult2 = await request(createOptions2, optionData2);
  console.log('\nCreate option for product 2:', createResult2.status, createResult2.body);

  const listProduct1Options = await request(listPublicOptions);
  console.log('\nProduct 1 options (should not include product 2 option):', listProduct1Options.status, listProduct1Options.body);

  const listProduct2Options = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/products/2/options',
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  };
  const listProduct2Result = await request(listProduct2Options);
  console.log('\nProduct 2 options (should include product 2 option):', listProduct2Result.status, listProduct2Result.body);

  console.log('\n=== ADMIN EDITOR PERSISTENCE TEST ===');
  console.log('Option created, edited, disabled, re-enabled, deleted - all operations completed.');
}

runTests().catch(console.error);