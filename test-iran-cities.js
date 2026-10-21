const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Read the JS files
const iranCitiesJs = fs.readFileSync(path.join(__dirname, 'assets/js/iran-cities.js'), 'utf8');
const accountJs = fs.readFileSync(path.join(__dirname, 'assets/js/account.js'), 'utf8');
const commonJs = fs.readFileSync(path.join(__dirname, 'assets/js/common.js'), 'utf8');
const iconsJs = fs.readFileSync(path.join(__dirname, 'assets/js/icons.js'), 'utf8');
const dataJs = fs.readFileSync(path.join(__dirname, 'assets/js/data.js'), 'utf8');

// Create a mock for localStorage
const localStorageMock = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, value) { this.store[key] = value.toString(); },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};

// Create a mock for fetch
const originalFetch = global.fetch;
const iranCitiesJson = fs.readFileSync(path.join(__dirname, 'assets/data/iran-cities.json'), 'utf8');

global.fetch = async (url) => {
  if (url.includes('iran-cities.json')) {
    return {
      ok: true,
      json: async () => JSON.parse(iranCitiesJson),
      headers: new Map([['content-type', 'application/json']])
    };
  }
  if (url.includes('manifest.webmanifest')) {
    return { ok: true, json: async () => ({}) };
  }
  return { ok: false, status: 404 };
};

// Setup JSDOM
const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
  url: 'http://localhost/account-profile.html',
  pretendToBeVisual: true,
  resources: 'usable',
  runScripts: 'dangerously',
  beforeParse(window) {
    window.localStorage = localStorageMock;
    window.fetch = global.fetch;
    window.AppData = {};
    window.Icons = {};
    window.Format = {
      toPersianNumber: (n) => n.toString(),
      price: (n) => n.toLocaleString(),
      priceWithCurrency: (n) => n.toLocaleString() + ' تومان',
      rating: (n) => ({ full: Math.floor(n), empty: 5 - Math.floor(n) })
    };
    window.App = {
      isLoggedIn: () => true,
      getCurrentUser: () => ({ id: 'u_test', firstName: 'Test', lastName: 'User', mobile: '09123456789', email: 'test@test.com' }),
      getUserData: (key, fallback) => fallback,
      setUserData: (key, value) => {},
      showToast: (msg, type) => console.log('Toast:', msg, type),
      addToCart: () => {},
      toggleWishlist: () => {},
      toggleCartDrawer: () => {},
      updateCartQty: () => {},
      removeFromCart: () => {}
    };
    window.console.log = console.log;
    window.console.error = console.error;
    window.console.warn = console.warn;
  }
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.Event = dom.window.Event;
global.CustomEvent = dom.window.CustomEvent;
global.HTMLFormElement = dom.window.HTMLFormElement;
global.HTMLInputElement = dom.window.HTMLInputElement;
global.HTMLSelectElement = dom.window.HTMLSelectElement;
global.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;

// Execute the scripts in order
console.log('=== Executing data.js ===');
dom.window.eval(dataJs);

console.log('=== Executing icons.js ===');
dom.window.eval(iconsJs);

console.log('=== Executing common.js ===');
dom.window.eval(commonJs);

console.log('=== Executing iran-cities.js ===');
dom.window.eval(iranCitiesJs);

// Wait a bit for the async load to complete
setTimeout(() => {
  console.log('\n=== After iran-cities.js load ===');
  console.log('window.IranCities:', dom.window.IranCities ? 'EXISTS (' + dom.window.IranCities.length + ' provinces)' : 'NULL/UNDEFINED');
  console.log('window.IranCitiesLoader:', dom.window.IranCitiesLoader ? 'EXISTS' : 'NULL/UNDEFINED');
  console.log('window.AppData.provinces:', dom.window.AppData && dom.window.AppData.provinces ? 'EXISTS (' + dom.window.AppData.provinces.length + ' provinces)' : 'NULL/UNDEFINED');

  // Now execute account.js
  console.log('\n=== Executing account.js ===');
  dom.window.eval(accountJs);

  // Wait for render to complete
  setTimeout(() => {
    console.log('\n=== Testing openAddressModal ===');
    
    // Check if AccountPage exists
    console.log('window.AccountPage:', dom.window.AccountPage ? 'EXISTS' : 'NULL/UNDEFINED');
    
    if (dom.window.AccountPage && dom.window.AccountPage.showAddAddress) {
      console.log('Calling AccountPage.showAddAddress()...');
      dom.window.AccountPage.showAddAddress();
      
      // Check the modal
      setTimeout(() => {
        const overlay = dom.window.document.getElementById('address-modal-overlay');
        if (overlay) {
          console.log('Modal overlay created: YES');
          const provinceSelect = dom.window.document.getElementById('addr-province');
          const citySelect = dom.window.document.getElementById('addr-city');
          
          if (provinceSelect) {
            console.log('Province dropdown options count:', provinceSelect.options.length);
            console.log('First few province options:', Array.from(provinceSelect.options).slice(0, 5).map(o => o.value));
          } else {
            console.log('Province dropdown: NOT FOUND');
          }
          
          if (citySelect) {
            console.log('City dropdown options count:', citySelect.options.length);
          } else {
            console.log('City dropdown: NOT FOUND');
          }
        } else {
          console.log('Modal overlay created: NO');
        }
      }, 100);
    }
  }, 500);
}, 500);