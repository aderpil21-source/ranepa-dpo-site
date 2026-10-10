const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) return void res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({headless:true});
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await context.addInitScript(() => localStorage.setItem('cookieConsentAccepted','1'));
  const page = await context.newPage();
  const program = JSON.parse(fs.readFileSync(path.join(root,'program-list.json'),'utf8')).programs[0].id;
  for (const width of [320,390,430]) {
    await page.setViewportSize({width,height:844});
    for (const name of ['index','students','schedule','programs','program','news','contacts','faq']) {
      await page.goto(base+'/'+name+'.html'+(name==='program'?'?id='+encodeURIComponent(program):''));
      await page.waitForSelector('.app-top-nav');
      await page.waitForTimeout(150);
      const themeToggle = page.locator('.site-theme-toggle');
      if (await themeToggle.count()) {
        assert(await themeToggle.evaluate(el=>{
          const nav=document.querySelector('.app-top-nav').getBoundingClientRect();
          const r=el.getBoundingClientRect();
          return r.bottom<=nav.top+1 && r.left>=0 && r.right<=innerWidth;
        }),`${name} ${width}: theme toggle sits above navigation, outside content`);
      }
      for (const theme of ['dark','light']) {
        await page.evaluate(theme => document.documentElement.dataset.theme=theme, theme);
        const state = await page.evaluate(() => {
          const header = document.querySelector('body > header');
          const links = [...header.querySelectorAll('[data-mobile-nav]')].filter(el=>el.getBoundingClientRect().width>0)
            .sort((a,b)=>a.getBoundingClientRect().left-b.getBoundingClientRect().left);
          return {
            keys:links.map(el=>el.dataset.mobileNav),
            fit:links.every(el=>{const r=el.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth+1 && r.height>=44 && el.scrollWidth<=el.clientWidth+1;}),
            overlap:links.some((el,i)=>i>0 && links[i-1].getBoundingClientRect().right>el.getBoundingClientRect().left+1),
            width:document.documentElement.scrollWidth, viewport:innerWidth
          };
        });
        assert.deepEqual(state.keys,['news','schedule','students','enroll'],`${name} ${width} ${theme}: four top links`);
        assert(state.fit && !state.overlap,`${name} ${width} ${theme}: navigation fits without clipping`);
        assert(state.width<=state.viewport+1,`${name} ${width}: no horizontal overflow`);
      }
      await page.evaluate(()=>scrollTo({top:650,behavior:'instant'}));
      await page.waitForTimeout(100);
      assert(Math.abs(await page.locator('body > header').evaluate(el=>el.getBoundingClientRect().top))<1,`${name} ${width}: header stays at top`);
      const movingText = await page.locator('.motion-owned').evaluateAll(nodes=>nodes.filter(el=>{
        if (!el.matches('.card,.lesson,.audience-card,.page-title,.hero h1,.hero p')) return false;
        const style=getComputedStyle(el);
        return style.translate!=='none' && style.translate.split(' ').some(v=>Math.abs(parseFloat(v)||0)>.1);
      }).length);
      assert.equal(movingText,0,`${name} ${width}: scrolling never translates text across other content`);
    }
  }
  await page.goto(base+'/index.html');
  await page.waitForSelector('.app-assistant');
  assert.equal(await page.locator('.owl-container:visible').count(),0,'floating assistant does not cover content');
  await page.evaluate(()=>{
    window.SiteWordSchedule={load:async()=>{},merge:items=>items};
    refreshScheduleSnapshot=async()=>{};
    scheduleDataLoaded=true;
    window.schedules=Array.from({length:20},(_,i)=>({date:i<10?'12.10.2099':'12.11.2099',time:'10:00',program:'Управление',subject:'Практическое занятие '+i,teacher:'Иванов',room:'101'}));
  });
  await page.locator('header [data-mobile-nav="schedule"]').tap();
  await page.waitForSelector('#scheduleOverlay.active');
  await page.waitForTimeout(350);
  assert.equal(await page.locator('.mobile-app-dock:visible').count(),0,'dock hides below schedule dialog');
  await page.locator('#scheduleMonthsNav button').last().tap();
  await page.waitForTimeout(100);
  assert.match(await page.locator('#scheduleMonthsNav [aria-current="true"]').innerText(),/Ноябрь/);
  assert(await page.locator('#scheduleTimeline').evaluate(el=>el.scrollTop>0),'month selection scrolls schedule');
  await page.locator('.close-sch-btn').tap();
  assert(await page.locator('.mobile-app-dock').isVisible(),'dock returns after closing dialog');
  await page.goto(base+'/students.html');
  await page.waitForSelector('.app-assistant');
  await page.locator('.app-assistant').tap();
  await page.waitForSelector('.students-owl-shell.active');
  assert.equal(await page.locator('.mobile-app-dock:visible').count(),0,'dock hides while assistant is open');
  await page.locator('.students-owl-close').tap();
  assert(await page.locator('.mobile-app-dock').isVisible(),'assistant closes back to navigation');
  await page.setViewportSize({width:1280,height:900});
  await page.goto(base+'/index.html');
  assert(await page.locator('.header-nav [onclick*="openQuickContacts"]').isVisible(),'desktop contacts retained');
  assert(await page.locator('.header-nav [onclick*="programsSection"]').isVisible(),'desktop programs retained');
  console.log('Mobile layout passed: 8 pages, 320/390/430px, both themes, sticky headers, stable text, month navigation, assistant and desktop menu.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
