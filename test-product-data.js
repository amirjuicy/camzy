const http = require('http');
http.get('http://127.0.0.1:3000/assets/js/data.js', (res) => {
  let data = ''; res.on('data', c => data += c); res.on('end', () => {
    // Check for the product slug
    console.log('Contains bosch-gsr-180-li:', data.includes('bosch-gsr-180-li'));
    console.log('Contains slug:', data.includes('slug'));
    
    // Find the product in the data
    const idx = data.indexOf('bosch-gsr-180-li');
    if (idx > -1) {
      console.log('Context:', data.substring(idx-200, idx+200));
    }
  });
}).on('error', e => console.error('Error:', e.message));