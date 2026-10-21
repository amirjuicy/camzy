const http = require('http');
http.get('http://127.0.0.1:3000/product/bosch-gsr-180-li', (res) => {
  let data = ''; res.on('data', c => data += c); res.on('end', () => {
    // Check if product.js is being loaded and executed
    console.log('Contains product.js:', data.includes('product.js'));
    console.log('Contains common.js:', data.includes('common.js'));
    console.log('Contains data.js:', data.includes('data.js'));
    
    // Check for AppData
    if (data.includes('AppData')) {
      const idx = data.indexOf('AppData');
      console.log('AppData found at:', idx);
    }
    
    // Check for any inline script that might initialize
    console.log('\n--- Checking for bootProduct or render ---');
    console.log('bootProduct:', data.includes('bootProduct'));
    console.log('render:', data.includes('render'));
  });
}).on('error', e => console.error('Error:', e.message));