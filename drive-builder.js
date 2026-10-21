// Real Builder UI test via puppeteer-core + system Chrome.
const puppeteer = require('puppeteer-core');
const BASE = 'http://127.0.0.1:3000';
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-gpu'],
    headless: 'new',
  });
  const page = await browser.newPage();
  page.on('console', m => console.log('[pg]', m.text().slice(0, 160)));
  let putReq = null, putResp = null;
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (req.url().includes('/api/admin/static-pages/') && req.method() === 'PUT') {
      putReq = { url: req.url(), body: req.postData() ? req.postData().slice(0, 300) : null, len: req.postData() ? req.postData().length : 0 };
    }
    req.continue();
  });
  page.on('response', async res => {
    if (res.url().includes('/api/admin/static-pages/') && res.request().method() === 'PUT') {
      putResp = { status: res.status(), body: (await res.text()).slice(0, 300) };
    }
  });
  try {
    await page.goto(BASE + '/login.html', { waitUntil: 'networkidle0', timeout: 30000 });
    const tok = await page.evaluate(async () => {
      const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
      const j = await r.json();
      localStorage.setItem('as_admin_session', JSON.stringify({ token: j.token, admin: j.admin }));
      return j.token;
    });
    console.log('token:', tok ? tok.slice(0, 8) + '...' : 'NONE');
    await page.goto(BASE + '/admin/builder.html?file=about.html', { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForFunction(() => {
      const el = document.getElementById('pb-status');
      return el && /آماده/.test(el.textContent);
    }, { timeout: 30000 });
    console.log('builder ready');
    // click first <p> inside iframe main, edit via side textarea
    await page.evaluate(() => {
      const iframe = document.getElementById('pb-iframe');
      const d = iframe.contentDocument;
      const p = d.querySelector('main p');
      p.scrollIntoView();
      p.click();
    });
    await new Promise(r => setTimeout(r, 800));
    const selInfo = await page.evaluate(() => ({
      tag: document.getElementById('pb-tag').textContent,
      text: document.getElementById('pb-text').value.slice(0, 80),
    }));
    console.log('selected:', JSON.stringify(selInfo));
    await page.evaluate(() => {
      const t = document.getElementById('pb-text');
      t.value = t.value + ' SAVE_TEST_123';
      t.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 500));
    await page.click('#pb-save');
    await page.waitForFunction(() => {
      const el = document.getElementById('pb-status');
      return el && (/ذخیره شد/.test(el.textContent) || /خطا/.test(el.textContent));
    }, { timeout: 30000 });
    console.log('status:', await page.evaluate(() => document.getElementById('pb-status').textContent));
    console.log('PUT req:', JSON.stringify(putReq));
    console.log('PUT resp:', JSON.stringify(putResp));
    // same endpoint browser uses after reload
    const raw = await page.evaluate(async () => (await fetch('/about.html', { cache: 'no-store' })).text());
    console.log('raw reload marker:', raw.includes('SAVE_TEST_123'), 'len:', raw.length);
    // hard refresh render
    await page.goto(BASE + '/about.html', { waitUntil: 'networkidle0', timeout: 30000 });
    const rendered = await page.content();
    console.log('rendered marker:', rendered.includes('SAVE_TEST_123'), 'has main:', rendered.includes('<main'));
  } catch (e) { console.error('ERR', e.message); }
  await browser.close();
})().catch(e => console.error('FATAL', e));
