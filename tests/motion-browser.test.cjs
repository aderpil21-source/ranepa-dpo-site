/* Run with Playwright installed; optional MOTION_BROWSER points to a local Chromium. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!file.startsWith(root + path.sep)) {res.writeHead(403).end(); return;}
  try {
    const ext = path.extname(file);
    res.setHeader('Content-Type', ({'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[ext] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch {res.writeHead(404).end();}
});
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({headless:true, ...(process.env.MOTION_BROWSER ? {executablePath:process.env.MOTION_BROWSER, args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']} : {})});
  const context = await browser.newContext({viewport:{width:1280,height:900}});
  await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await context.route('**/premium-motion.js*', route => route.fulfill({contentType:'application/javascript', body: `
    window.motionCalls=[];
    const originalMotionAnimate=Motion.animate;
    Motion.animate=(el,values,options)=>{
      window.motionCalls.push({key:el.dataset?.siteProgramId||el.dataset?.openid||el.id||el.className,program:!!el.dataset?.siteProgramId,values});
      return originalMotionAnimate(el,values,options);
    };
    ` + fs.readFileSync(path.join(root,'premium-motion.js'),'utf8')}));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push({message:error.message,stack:error.stack}));
  const calls = () => page.evaluate(() => window.motionCalls.filter(c => c.values.opacity?.[0] === 0).length);
  for (const name of ['index','programs','students','contacts','faq','schedule','news','program']) {
    await page.goto(base + '/' + name + '.html' + (name === 'program' ? '?id=' + encodeURIComponent(JSON.parse(fs.readFileSync(path.join(root,'program-list.json'),'utf8')).programs[0].id) : ''));
    await page.waitForFunction(() => !!window.SiteMotion);
    await page.waitForTimeout(400);
    assert(await page.evaluate(() => !!document.documentElement.classList.contains('site-motion')), name + ': initialized');
    assert.equal(await page.evaluate(() => document.querySelectorAll('script[src*="motion-12.23.24"]').length),1);
    assert(await page.locator('h1:visible,h2:visible').first().isVisible(), name + ': heading remains usable');
  }
  await page.goto(base + '/programs.html');
  await page.waitForSelector('#programGrid .card');
  await page.waitForTimeout(400);
  const first = page.locator('#programGrid .card').first();
  await first.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await first.hover();
  await page.waitForTimeout(500);
  assert(await first.evaluate(el => parseFloat(getComputedStyle(el).translate.split(' ')[1] || '0') < -6), 'spring hover lifts the card');
  assert(await first.evaluate(el=>parseFloat(getComputedStyle(el).scale)>1.01),'card scale is rendered, not blocked by legacy CSS');
  assert(await first.locator(':scope > .motion-sheen').evaluate(el=>parseFloat(getComputedStyle(el).opacity)>0.9),'pointer light is visible');
  const action=first.locator('.button').first();
  await action.focus();
  await page.waitForTimeout(500);
  assert(await action.evaluate(el=>parseFloat(getComputedStyle(el).translate.split(' ')[1]||'0')<-1.5),'keyboard focus gets visible button feedback');
  await action.evaluate(el=>el.blur());
  await page.mouse.move(1,1);
  await page.waitForTimeout(500);
  assert(await first.evaluate(el => Math.abs(parseFloat(getComputedStyle(el).translate.split(' ')[1] || '0')) < 0.1), 'hover settles without residual lift');
  assert(await first.locator(':scope > .motion-sheen').count(),'cards have a pointer light accent');
  const visibleEntrance = await page.evaluate(() => motionCalls.find(c=>c.program && c.values.opacity?.[0]===0));
  assert(visibleEntrance && parseFloat(visibleEntrance.values.translate[0].split(' ')[1])>=24,'card entrance has visible travel');
  assert(await page.locator('.motion-heading').count(),'page title has a Motion accent');
  const beforeFilter = await calls();
  await page.locator('#programSearch').fill('менедж');
  await page.waitForTimeout(200);
  await page.locator('#programSearch').fill('');
  await page.waitForTimeout(400);
  assert.equal(await calls(),beforeFilter,'search rerender must not replay entrance');
  const beforeTheme = await calls();
  await page.evaluate(() => document.documentElement.dataset.theme='light');
  await page.waitForTimeout(100);
  assert.equal(await calls(),beforeTheme,'theme change must not replay entrance');
  await page.evaluate(() => {window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
  await page.waitForTimeout(300);
  assert.equal(await calls(),beforeTheme,'bfcache lifecycle must not replay visible entrances');

  await page.goto(base + '/index.html');
  await page.waitForSelector('#tab-all .card');
  const tabButton=page.locator('.tab-btn').first();
  await tabButton.evaluate(el=>window.scrollTo({top:Math.max(0,window.scrollY+el.getBoundingClientRect().top-window.innerHeight*0.45),behavior:'instant'}));
  await page.waitForTimeout(600);
  await tabButton.hover();
  await page.waitForTimeout(400);
  assert(await tabButton.evaluate(el=>parseFloat(getComputedStyle(el).scale)>1.02),'button hover is visibly rendered');
  await page.mouse.down();
  await page.waitForTimeout(180);
  assert(await tabButton.evaluate(el=>parseFloat(getComputedStyle(el).scale)<0.985),'button press gives visible feedback');
  await page.mouse.up();
  await page.waitForTimeout(400);
  assert(await tabButton.evaluate(el=>Math.abs(parseFloat(getComputedStyle(el).scale)-1)<0.01),'button press settles without queued effects');
  await page.locator('#tab-all .card').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  for (let i=0;i<3;i++) {
    await page.evaluate(() => filterPrograms(null,'tab-pk'));
    await page.waitForTimeout(50);
    await page.evaluate(() => filterPrograms(null,'tab-all'));
    await page.waitForTimeout(50);
  }
  const duplicates = await page.evaluate(() => {
    const counts={};
    for (const c of motionCalls) if(c.program && c.values.opacity?.[0]===0) counts[c.key]=(counts[c.key]||0)+1;
    return Object.entries(counts).filter(([,count])=>count>1);
  });
  assert.deepEqual(duplicates,[],'same program must not fly in again across tab copies');
  assert.equal(await page.locator('.puzzle-piece,.glow-effect').count(),0,'old puzzle motion removed');
  await page.evaluate(() => {document.getElementById('filterSort').value='alpha_desc';applyFilters();});
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.puzzle-piece,.glow-effect').count(),0,'sorting keeps old entrances disabled');
  await page.evaluate(() => openModal());
  await page.waitForTimeout(350);
  assert(await page.locator('#enrollModal .modal-box').isVisible(),'modal remains usable');
  await page.evaluate(() => closeModal());
  await page.evaluate(() => {const faq=document.querySelector('details.faq-item');faq.open=true;});
  await page.waitForTimeout(250);
  assert(await page.locator('details.faq-item[open] .faq-answer').first().isVisible(),'native FAQ remains readable');
  await page.evaluate(() => {document.querySelector('details.faq-item').open=false;});
  await page.emulateMedia({reducedMotion:'reduce'});
  const reducedCount = await page.evaluate(() => motionCalls.length);
  await page.evaluate(() => filterPrograms(null,'tab-pp'));
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => motionCalls.length),reducedCount,'runtime reduced motion suppresses movement');
  await page.goto(base + '/students.html');
  await page.waitForFunction(() => !!window.SiteMotion);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => motionCalls.length),0,'reduced motion before load suppresses movement');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:390,height:844});
  for (const name of ['index','students','programs']) {
    await page.goto(base + '/' + name + '.html' + (name === 'program' ? '?id=' + encodeURIComponent(JSON.parse(fs.readFileSync(path.join(root,'program-list.json'),'utf8')).programs[0].id) : ''));
    await page.waitForFunction(() => !!window.SiteMotion);
    assert(await page.locator('h1:visible,h2:visible').first().isVisible(),name+': mobile heading');
  }
  // Confirmed on the untouched main-page baseline; unrelated admin bugs are not suppressed silently.
  const baselineErrors = new Set(['Invalid regular expression: /^(.?.?/: Unterminated group', 'bindSeoUpload is not defined']);
  assert.deepEqual(errors.filter(e => !baselineErrors.has(e.message)),[], 'no new JavaScript errors');
  if (errors.length) console.log('Existing main-page admin errors (also reproduced before this change):', [...new Set(errors.map(e => e.message))].join('; '));
  await context.close();
  const touch = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await touch.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  const phone = await touch.newPage();
  await phone.goto(base+'/programs.html');
  await phone.waitForSelector('#programGrid .card');
  await phone.waitForTimeout(400);
  assert.equal(await phone.evaluate(() => matchMedia('(hover:hover) and (pointer:fine)').matches),false,'touch device has no hover-only effects');
  await phone.locator('#programGrid .card').first().tap();
  await phone.waitForTimeout(400);
  assert(await phone.locator('#programGrid .card').first().evaluate(el=>Math.abs(parseFloat(getComputedStyle(el).translate.split(' ')[1]||'0'))<0.1),'touch tap does not leave sticky lift');
  await touch.close();
  const fallback = await browser.newContext();
  await fallback.route('**/assets/vendor/motion-*',route=>route.abort());
  await fallback.route('**/*', route => route.request().url().startsWith(base) ? route.fallback() : route.abort());
  const plain=await fallback.newPage();
  await plain.goto(base+'/programs.html');
  await plain.waitForSelector('#programGrid .card');
  assert(await plain.locator('#programGrid .card').first().isVisible(),'content remains visible if Motion cannot load');
  await fallback.close();
  console.log('Motion browser regression checks passed: 8 pages, hover, tabs, search, theme, lifecycle, reduced motion, mobile and library failure.');
})().catch(error => {console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
