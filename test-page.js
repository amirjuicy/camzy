const http = require('http');
http.get('http://127.0.0.1:3000/product/bosch-gsr-180-li', (res) => {
  let data = ''; res.on('data', c => data += c); res.on('end', () => {
    const idx = data.indexOf('id="product-detail-content"');
    console.log('Found at:', idx);
    console.log('Context:', data.substring(idx-50, idx+100));
  });
}).on('error', e => console.error('Error:', e.message));