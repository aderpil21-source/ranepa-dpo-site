let scheduleCache = [];
const SCHEDULE_TIME_ZONE = 'Europe/Kaliningrad';
const SCHEDULE_CUTOFF_HOUR = 21;
let scheduleCutoffTimer = null;
let schedulePollTimer = null;
let scheduleRenderCount = 0;
let scheduleRenderTimer = 0;
function scheduleRenderDebounced(){ clearTimeout(scheduleRenderTimer); scheduleRenderTimer = setTimeout(renderSchedule, 85); }
function scheduleKey(x){return 'schedule:'+[x?.id,x?.date,x?.time,x?.subject].map(v=>encodeURIComponent(String(v||'').trim())).join('|')}
function mergeSchedule(base,custom){const o=new Map(),a=[];(custom||[]).forEach(x=>{if(!x)return;if(x.sourceKey){o.set(x.sourceKey,x);return}if(x.active===false||x.archived===true)return;a.push(x)});const out=[];(base||[]).forEach(x=>{const k=scheduleKey(x);if(o.has(k)){const ov=o.get(k);o.delete(k);if(ov.active===false||ov.archived===true)return;const y={...x,...ov};delete y.sourceKey;out.push(y)}else out.push(x)});o.forEach(x=>{if(x.active===false||x.archived===true)return;const y={...x};delete y.sourceKey;out.push(y)});return out.concat(a).sort((x,y)=>{const xo=Number.isFinite(Number(x&&x.cmsOrder))?Number(x.cmsOrder):null,yo=Number.isFinite(Number(y&&y.cmsOrder))?Number(y.cmsOrder):null;if(xo!==null&&yo!==null&&xo!==yo)return xo-yo;if(xo!==null&&yo===null)return -1;if(xo===null&&yo!==null)return 1;return 0})}
async function loadProSchedule(){try{const r=await fetch('./site-settings.json?v='+Math.floor(Date.now()/60000),{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json(),s=d?.settings||{};return {v:s.visibility||{},c:Array.isArray(s.customSchedules)?s.customSchedules:[]}}catch(_){return {v:{},c:[]}}}

function getKaliningradParts(date = new Date()) {
  const out = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHEDULE_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).forEach(part => {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  });
  return out;
}

function makeDateKey(day, month, year) {
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return year * 10000 + month * 100 + day;
}

function parseScheduleRange(value) {
  const matches = Array.from(String(value || '').matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{4})/g));
  if (!matches.length) return null;
  const first = makeDateKey(Number(matches[0][1]), Number(matches[0][2]), Number(matches[0][3]));
  if (!first) return null;
  const lastMatch = matches[matches.length - 1];
  const last = makeDateKey(Number(lastMatch[1]), Number(lastMatch[2]), Number(lastMatch[3]));
  if (!last || last < first) return null;
  return { start:first, end:last };
}

function scheduleIsVisibleByTime(item) {
  const parsed = parseScheduleRange(item && item.date);
  if (!parsed) return true;
  const now = getKaliningradParts();
  const today = now.year * 10000 + now.month * 100 + now.day;
  if (parsed.end > today) return true;
  if (parsed.end < today) return false;
  return now.hour < SCHEDULE_CUTOFF_HOUR;
}

function parseRuDate(value) {
  const parsed = parseScheduleRange(value);
  if (!parsed) return new Date(8640000000000000);
  const key = parsed.start;
  const year = Math.floor(key / 10000);
  const month = Math.floor((key % 10000) / 100);
  const day = key % 100;
  return new Date(year, month - 1, day);
}

function scheduleNextCutoffRefresh() {
  if (scheduleCutoffTimer) clearTimeout(scheduleCutoffTimer);
  const now = getKaliningradParts();
  const secondsNow = now.hour * 3600 + now.minute * 60 + now.second;
  const cutoffSeconds = SCHEDULE_CUTOFF_HOUR * 3600;
  const secondsUntilCutoff = secondsNow < cutoffSeconds
    ? cutoffSeconds - secondsNow
    : (24 * 3600 - secondsNow) + cutoffSeconds;
  scheduleCutoffTimer = setTimeout(() => {
    renderSchedule();
    scheduleNextCutoffRefresh();
  }, Math.max(1000, secondsUntilCutoff * 1000 + 250));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

function renderSchedule() {
  const q = document.getElementById('scheduleSearch').value.trim().toLowerCase();
  const program = document.getElementById('scheduleProgram').value;
  const list = document.getElementById('scheduleList');

  const items = scheduleCache.filter(x => {
    if (!scheduleIsVisibleByTime(x)) return false;
    const hay = [x.program,x.subject,x.teacher,x.room,x.time,x.date].join(' ').toLowerCase();
    return (!q || hay.includes(q)) && (!program || x.program === program);
  }).sort((a,b) => parseRuDate(a.date)-parseRuDate(b.date) || String(a.time).localeCompare(String(b.time)));

  if (!items.length) {
    list.innerHTML = '<div class="empty">Занятия не найдены.</div>';
    return;
  }

  let lastDate = '';
  let html = '';
  for (const x of items) {
    if (x.date !== lastDate) {
      lastDate = x.date;
      html += '<div class="schedule-day">'+escapeHtml(x.date)+'</div>';
    }
    html += '<article class="lesson">'+
      '<div class="lesson-time">'+escapeHtml(x.time || '')+'</div>'+
      '<div>'+
        '<div class="lesson-program">'+escapeHtml(x.program || '')+'</div>'+
        '<div class="lesson-subject">'+escapeHtml(x.subject || '')+'</div>'+
        '<div class="lesson-meta">'+
          (x.teacher ? 'Преподаватель: '+escapeHtml(x.teacher)+'<br>' : '')+
          (x.room ? 'Место: '+escapeHtml(x.room) : '')+
        '</div>'+
      '</div>'+
    '</article>';
  }
  scheduleRenderCount += 1;
  list.innerHTML = html;
  if (scheduleRenderCount > 1) {
    list.querySelectorAll('.lesson,.schedule-day').forEach(el => {
      el.classList.add('pm-reveal','pm-in','pm-done');
      el.style.transitionDelay = '0ms';
    });
  }
}

async function loadScheduleSnapshot(silent) {
  const list = document.getElementById('scheduleList');
  if (!silent) list.innerHTML = '<div class="empty">Загрузка расписания…</div>';
  try {
    const res = await fetch('./schedule-data.json?v='+Date.now(), {cache:'no-store'});
    if (!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    const pro = await loadProSchedule();
    scheduleCache = mergeSchedule(Array.isArray(data.schedules) ? data.schedules : [], pro.c).filter(x=>pro.v[scheduleKey(x)]!==false);

    const programs = [...new Set(scheduleCache.map(x => x.program).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
    const select = document.getElementById('scheduleProgram');
    const previousValue = select.value;
    while (select.options.length > 1) select.remove(1);
    programs.forEach(name => {
      const o = document.createElement('option');
      o.value = name;
      o.textContent = name;
      select.appendChild(o);
    });
    if (programs.includes(previousValue)) select.value = previousValue;

    renderSchedule();
    return true;
  } catch (e) {
    console.error(e);
    if (!silent) list.innerHTML = '<div class="empty">Не удалось загрузить расписание.</div>';
    return false;
  }
}

async function initSchedule() {
  const loaded = await loadScheduleSnapshot(false);
  if (!loaded) return;

  document.getElementById('scheduleSearch').addEventListener('input', scheduleRenderDebounced);
  document.getElementById('scheduleProgram').addEventListener('change', renderSchedule);

  scheduleNextCutoffRefresh();
  if (schedulePollTimer) clearInterval(schedulePollTimer);
  schedulePollTimer = setInterval(() => {
    loadScheduleSnapshot(true);
  }, 60 * 1000);
}

document.addEventListener('DOMContentLoaded', initSchedule);
