const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) return void res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404).end(); }
});

let browser;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({timezoneId:'America/Los_Angeles',viewport:{width:1280,height:900}});
 await page.clock.install({time:new Date('2026-10-30T15:59:00.000Z')});
 await page.clock.pauseAt(new Date('2026-10-30T15:59:59.500Z'));
 const lesson={id:'live',date:'30.10.2026',time:'18:00–19:30',program:'Эффективные письменные коммуникации',subject:'Работа с документами',teacher:'Преподаватель',room:'Аудитория 308'};
 let settings={};
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/schedule'||url.pathname.endsWith('/schedule-data.json'))return route.fulfill({json:{schedules:[lesson,{...lesson,id:'cancelled',subject:'Отменённое занятие',cancelled:true}]}});
  if(url.pathname==='/settings'||url.pathname.endsWith('/site-settings.json'))return route.fulfill({json:{settings}});
  if(url.pathname.endsWith('/schedule-word-loader.js'))return route.fulfill({contentType:'application/javascript',body:'window.SiteWordSchedule={load:async()=>[],merge:x=>x};'});
  return route.request().url().startsWith(base)?route.continue():route.abort();
 });
 await page.goto(base+'/students.html',{waitUntil:'networkidle'});
 const banner=page.locator('#studentsLiveLecture');
 assert(await banner.isHidden(),'Hidden before start');
 await page.clock.runFor(500);
 assert(await banner.isVisible(),'Appears at Kaliningrad start without refresh');
 assert.equal(await page.locator('.live-lecture-card').count(),1);
 assert.match(await banner.innerText(),/18:00–19:30 · Калининград/);
 await page.clock.setSystemTime(new Date('2026-10-30T17:29:59.500Z'));
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.screenshot({path:'../live-lecture-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 assert(await banner.evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
 await page.screenshot({path:'../live-lecture-mobile.png'});
 await page.clock.runFor(500);assert(await banner.isHidden(),'Disappears exactly at end without refresh');
 await page.clock.setSystemTime(new Date('2026-10-30T16:30:00Z'));
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));assert(await banner.isVisible());
 settings={customSchedules:[{sourceKey:'schedule:'+['live',lesson.date,lesson.time,lesson.subject].map(encodeURIComponent).join('|'),active:false}]};
 await page.reload({waitUntil:'networkidle'});assert(await banner.isHidden(),'Admin hide removes live banner');
 console.log('Live banner browser checks passed: automatic boundaries, foreign timezone, cancelled/hidden lessons, desktop/mobile layout.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.close()});
