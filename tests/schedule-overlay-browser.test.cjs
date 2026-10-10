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
    window.SiteWordSchedule = {load:async()=>{}, merge:items=>items};
    refreshScheduleSnapshot = async()=>{};
    scheduleDataLoaded = true;
    window.schedules = [
      {date:'12.10.2099', time:'10:00', program:'Управление', subject:'Экономика', teacher:'Иванов', room:'101'},
      {date:'12.10.2099', time:'12:00', program:'Управление', subject:'Право', teacher:'Петров', room:'102'},
      {date:'12.11.2099', time:'10:00', program:'Педагогика', subject:'Экономика', teacher:'Сидорова', room:'103'},
      {date:'12.10.2000', time:'10:00', program:'Архив', subject:'Экономика', teacher:'Иванов', room:'101'}
    ];
  });
  await page.locator('.header-nav [onclick="showSchedule()"]').click();
  await page.waitForSelector('#scheduleOverlay.active');
  const cards = page.locator('#scheduleTimeline .timeline-card');
  assert.equal(await cards.count(), 3, 'Opening from header shows upcoming classes');
  await page.locator('#scheduleSearch').fill('  иВаНоВ  ');
  assert.equal(await cards.count(), 1, 'Teacher search ignores case and surrounding spaces');
  assert.match(await cards.first().innerText(), /Иванов/);
  assert.equal(await page.locator('#scheduleMonthsNav button').count(), 1);
  await page.locator('#scheduleSearch').fill('эконом');
  assert.equal(await cards.count(), 2, 'Partial subject search works across months');
  await page.locator('#scheduleProgram').selectOption('Педагогика');
  assert.equal(await cards.count(), 1, 'Program filter combines with subject search');
  assert.match(await cards.first().innerText(), /Сидорова/);
  await page.evaluate(() => renderSchedule());
  assert.equal(await page.locator('#scheduleProgram').inputValue(), 'Педагогика', 'Refresh preserves program selection');
  await page.locator('#scheduleSearch').fill('нет такого занятия');
  assert.equal(await cards.count(), 0);
  assert.match(await page.locator('#scheduleTimeline').innerText(), /Занятия не найдены/);
  assert.equal(await page.locator('#scheduleMonthsNav button').count(), 0);
  await page.locator('#scheduleSearch').fill('');
  await page.locator('#scheduleProgram').selectOption('');
  assert.equal(await cards.count(), 3, 'Clearing filters restores upcoming classes');
  await page.setViewportSize({width:390,height:760});
  const filtersFit = await page.locator('.schedule-filters').evaluate(el => {
    const bounds = el.getBoundingClientRect();
    return [...el.children].every(control => {
      const rect = control.getBoundingClientRect();
      return rect.width > 0 && rect.left >= bounds.left && rect.right <= bounds.right + 1;
    });
  });
  assert(filtersFit, 'Search and program controls fit on mobile');
  await page.evaluate(() => closeSchedule());
  await page.setViewportSize({width:1280,height:800});
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
  await page.evaluate(() => document.getElementById('scheduleTimeline').scrollTop = 780);
  await page.waitForTimeout(400);
  let state = await page.evaluate(() => {
    const overlay = document.getElementById('scheduleOverlay');
    const title = overlay.querySelector('.schedule-header');
    const nav = overlay.querySelector('.schedule-months');
    const rect = title.getBoundingClientRect();
    return {
      overlayTop:overlay.getBoundingClientRect().top,
      scroll:overlay.querySelector('.schedule-content').scrollTop,
      overlayScroll:overlay.scrollTop,
      contentTop:overlay.querySelector('.schedule-content').getBoundingClientRect().top,
      titleTop:rect.top, titleBottom:rect.bottom,
      navTop:nav.getBoundingClientRect().top,
      titleBG:getComputedStyle(title).backgroundColor,
      locked:document.documentElement.classList.contains('schedule-modal-open'),
      overflow:getComputedStyle(document.documentElement).overflowY,
      mainScrollY:window.scrollY,
      titleVisible:document.elementFromPoint(rect.left+30, rect.top+20)?.closest('.schedule-header') === title
    };
  });
  console.log('SCHEDULE_DESKTOP_GEOMETRY', JSON.stringify(state));
  assert.equal(state.overlayTop,0, 'Schedule overlay must cover viewport, not follow the main header');
  assert(state.scroll > 500 && state.overlayScroll===0, 'Only schedule cards must scroll');
  assert(state.locked && state.overflow==='hidden', 'Background page must be scroll-locked');
  assert(Math.abs(state.mainScrollY-initialScrollY)<2, 'Background must remain at the same scroll position');
  assert(Math.abs(state.titleTop)<=5, 'Schedule title must stay fixed at top when scrolling');
  assert(state.titleVisible, 'Opaque sticky title must cover cards scrolled underneath');
  assert(state.navTop >= state.titleBottom, 'Month navigation must stay below the title');
  assert(state.contentTop >= state.titleBottom, 'Scrollable cards must begin below the title');
  assert(!state.titleBG.includes('0)'), 'Sticky title must not be transparent');
  await page.evaluate(() => document.documentElement.dataset.theme='light');
  const lightBG = await page.locator('.schedule-header').evaluate(el=>getComputedStyle(el).backgroundColor);
  console.log('SCHEDULE_LIGHT_BACKGROUND', lightBG, await page.evaluate(() => document.documentElement.dataset.theme));
  assert.equal(lightBG,'rgb(248, 250, 252)', 'Light theme schedule title must remain opaque and readable');
  await page.setViewportSize({width:390,height:760});
  await page.evaluate(() => document.getElementById('scheduleTimeline').scrollTop = 720);
  await page.waitForTimeout(150);
  state = await page.evaluate(() => {
    const overlay = document.getElementById('scheduleOverlay');
    const heading = overlay.querySelector('.schedule-header').getBoundingClientRect();
    return {top:heading.top,bottom:heading.bottom,monthTop:overlay.querySelector('.schedule-months').getBoundingClientRect().top,overlayTop:overlay.getBoundingClientRect().top};
  });
  assert(state.overlayTop===0 && Math.abs(state.top)<=5, 'Mobile title must remain visible while scrolling');
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
