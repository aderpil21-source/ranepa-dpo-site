let scheduleCache = [];

function parseRuDate(value) {
  const m = String(value || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2])-1, Number(m[1])) : new Date(8640000000000000);
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
  list.innerHTML = html;
}

async function initSchedule() {
  const list = document.getElementById('scheduleList');
  list.innerHTML = '<div class="empty">Загрузка расписания…</div>';
  try {
    const res = await fetch('./schedule-data.json?v='+Date.now(), {cache:'no-store'});
    if (!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    scheduleCache = Array.isArray(data.schedules) ? data.schedules : [];

    const programs = [...new Set(scheduleCache.map(x => x.program).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
    const select = document.getElementById('scheduleProgram');
    programs.forEach(name => {
      const o = document.createElement('option');
      o.value = name; o.textContent = name; select.appendChild(o);
    });

    document.getElementById('scheduleSearch').addEventListener('input', renderSchedule);
    select.addEventListener('change', renderSchedule);
    renderSchedule();
  } catch (e) {
    console.error(e);
    list.innerHTML = '<div class="empty">Не удалось загрузить расписание.</div>';
  }
}

document.addEventListener('DOMContentLoaded', initSchedule);
