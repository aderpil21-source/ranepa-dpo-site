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
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
 const inventory=await page.evaluate(async()=>{
  await SiteWordSchedule.load();
  const removed=SiteWordSchedule.getRows().filter(x=>x.date==='09.11.2026'&&/горбунов/i.test(x.teacher));
  const merged=SiteWordSchedule.merge(removed);
  return {removed:removed.map(x=>({id:x.id,program:x.program,time:x.time})),remaining:merged.filter(x=>x.date==='09.11.2026'&&/горбунов/i.test(x.teacher)).length};
 });
 assert(inventory.removed.length>0);assert.equal(inventory.remaining,0);
 console.log(JSON.stringify(inventory));
 await page.evaluate(()=>{
  siteAdminMode=true;saveSiteSettings=async()=>true;renderSiteAdminPanel=()=>{};
  const imported=SiteWordSchedule.getRows().find(x=>x.date==='12.11.2026');
  window.testLesson=imported;window.schedules=[];
  window.testKey='schedule:'+ [imported.id,imported.date,imported.time,imported.subject].map(v=>encodeURIComponent(String(v||'').trim())).join('|');
  openSiteScheduleEditor(testKey);
 });
 assert.equal(await page.locator('[name=subject]').inputValue(),await page.evaluate(()=>testLesson.subject));
 await page.locator('[name=lessonStatus]').selectOption('cancelled');
 await page.locator('#structForm').evaluate(f=>f.requestSubmit());
 assert(await page.evaluate(()=>getVisibleSchedules([]).some(({item})=>item.subject===testLesson.subject&&item.cancelled&&!item.replacement)));
 await page.evaluate(()=>openSiteScheduleEditor(testKey));
 await page.locator('[name=lessonStatus]').selectOption('replacement');
 await page.locator('#structForm').evaluate(f=>f.requestSubmit());
 assert(await page.evaluate(()=>getVisibleSchedules([]).some(({item})=>item.subject===testLesson.subject&&item.replacement&&!item.cancelled)));
 await page.evaluate(()=>siteScheduleSetPublished(testKey,false));
 assert(!await page.evaluate(()=>getVisibleSchedules([]).some(({item})=>item.subject===testLesson.subject)));
 await page.evaluate(()=>siteScheduleSetPublished(testKey,true));
 assert(await page.evaluate(()=>getVisibleSchedules([]).some(({item})=>item.subject===testLesson.subject)));
 page.on('dialog',d=>d.accept());
 await page.evaluate(()=>siteScheduleArchiveAny(testKey));
 assert(!await page.evaluate(()=>getVisibleSchedules([]).some(({item})=>item.subject===testLesson.subject)));
 await page.evaluate(()=>siteScheduleRestoreBase(testKey));
 await page.evaluate(()=>siteScheduleSetPublished(testKey,true));
 await page.evaluate(()=>openSiteScheduleEditor());
 for(const [name,value] of Object.entries({program:'Тест',date:'12.11.2026',subject:'Новое занятие',teacher:'Преподаватель'}))await page.locator('[name='+name+']').fill(value);
 await page.locator('[name=lessonStatus]').selectOption('cancelled');await page.locator('#structForm').evaluate(f=>f.requestSubmit());
 assert(await page.evaluate(()=>getVisibleSchedules([]).some(({item})=>item.subject==='Новое занятие'&&item.cancelled)));
 const custom=await page.evaluate(()=>JSON.parse(JSON.stringify(siteCustomSchedules)));
 await page.goto(base+'/schedule.html',{waitUntil:'domcontentloaded'});
 await page.evaluate(custom=>{scheduleCache=mergeSchedule(SiteWordSchedule.merge([]),custom);renderSchedule()},custom);
 assert.match(await page.locator('#scheduleList').innerText(),/ОТМЕНЕНА/);
 assert.match(await page.locator('#scheduleList').innerText(),/ЗАМЕНА/);
 await page.evaluate(()=>{scheduleCache=mergeSchedule(SiteWordSchedule.merge([]),[]);renderSchedule()});
 console.log('Schedule editing passed: imported edit, replacement, cancellation, hide/show, trash/restore, add, public page.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.close()});
