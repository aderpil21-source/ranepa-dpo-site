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
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({headless:true});
  const context = await browser.newContext({viewport:{width:1280,height:800}});
  await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(base + '/index.html', {waitUntil:'domcontentloaded'});
  await page.waitForSelector('#scheduleOverlay', {state:'attached'});
  await page.evaluate(() => {
    document.body.style.minHeight = '4000px';
    document.getElementById('scheduleTimeline').innerHTML = Array.from({length:36},(_,i)=>
      '<div class="schedule-month-section"><div class="timeline-card" style="height:160px">Проверка прокрутки ' + (i+1) + '</div></div>').join('');
    document.getElementById('scheduleMonthsNav').innerHTML =
      '<button class="schedule-month-link active">Октябрь 2026</button><button class="schedule-month-link">Ноябрь 2026</button>';
    window.scrollTo({top:650,behavior:'instant'});
  });
  await page.waitForTimeout(100);
  const initialScrollY = await page.evaluate(() => window.scrollY);
  assert(initialScrollY > 300, 'Background page must start scrolled');
  await page.evaluate(() => {
    startScheduleScrollIsolation();
    document.getElementById('scheduleOverlay').classList.add('active');
  });
  await page.evaluate(() => document.getElementById('scheduleOverlay').scrollTop = 780);
  await page.waitForTimeout(130);
  let state = await page.evaluate(() => {
    const overlay = document.getElementById('scheduleOverlay');
    const title = overlay.querySelector('.schedule-header');
    const nav = overlay.querySelector('.schedule-months');
    const rect = title.getBoundingClientRect();
    return {
      overlayTop:overlay.getBoundingClientRect().top,
      scroll:overlay.scrollTop,
      titleTop:rect.top, titleBottom:rect.bottom,
      navTop:nav.getBoundingClientRect().top,
      titleBG:getComputedStyle(title).backgroundColor,
      locked:document.documentElement.classList.contains('schedule-modal-open'),
      overflow:getComputedStyle(document.documentElement).overflowY,
      mainScrollY:window.scrollY,
      titleVisible:document.elementFromPoint(rect.left+30, rect.top+20)?.closest('.schedule-header') === title
    };
  });
  assert.equal(state.overlayTop,0, 'Schedule overlay must cover viewport, not follow the main header');
  assert(state.scroll > 500, 'Schedule itself must scroll');
  assert(state.locked && state.overflow==='hidden', 'Background page must be scroll-locked');
  assert(Math.abs(state.mainScrollY-initialScrollY)<2, 'Background must remain at the same scroll position');
  assert(Math.abs(state.titleTop)<=1, 'Schedule title must stay pinned to top when scrolling');
  assert(state.titleVisible, 'Opaque sticky title must cover cards scrolled underneath');
  assert(state.navTop >= state.titleBottom, 'Month navigation must stay below the title');
  assert(!state.titleBG.includes('0)'), 'Sticky title must not be transparent');
  await page.evaluate(() => document.documentElement.dataset.theme='light');
  const lightBG = await page.locator('.schedule-header').evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.equal(lightBG,'rgb(248, 250, 252)', 'Light theme schedule title must remain opaque and readable');
  await page.setViewportSize({width:390,height:760});
  await page.evaluate(() => document.getElementById('scheduleOverlay').scrollTop = 720);
  await page.waitForTimeout(150);
  state = await page.evaluate(() => {
    const overlay = document.getElementById('scheduleOverlay');
    const heading = overlay.querySelector('.schedule-header').getBoundingClientRect();
    return {top:heading.top,bottom:heading.bottom,monthTop:overlay.querySelector('.schedule-months').getBoundingClientRect().top,overlayTop:overlay.getBoundingClientRect().top};
  });
  assert(state.overlayTop===0 && Math.abs(state.top)<=1, 'Mobile title must remain visible while scrolling');
  assert(state.monthTop>=state.bottom, 'Mobile month selector must not cover title');
  await page.evaluate(() => closeSchedule());
  const closed = await page.evaluate(() => ({
    active:document.getElementById('scheduleOverlay').classList.contains('active'),
    locked:document.documentElement.classList.contains('schedule-modal-open'),
    overflow:getComputedStyle(document.documentElement).overflowY,
    y:window.scrollY
  }));
  assert(!closed.active && !closed.locked && closed.overflow!=='hidden', 'Closing restores page scrolling');
  assert(Math.abs(closed.y-initialScrollY)<2, 'Closing preserves reader position');
  await context.close();
  console.log('Schedule scroll browser test passed: desktop, mobile, light theme, sticky title, locked background, close restore.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});