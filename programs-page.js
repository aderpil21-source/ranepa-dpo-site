let programsCache = [];
const PROGRAM_REFRESH_MS = 5 * 60 * 1000;
let programRefreshTimer = null;
let programSettings = { visibility:{}, customPrograms:[] };

function mergeProgramSets(base, custom) {
  const map = new Map();
  (Array.isArray(base) ? base : []).forEach(p => { if (p?.id) map.set(String(p.id), {...p}); });
  (Array.isArray(custom) ? custom : []).forEach(p => {
    if (!p?.id) return;
    map.set(String(p.id), {active:true,tab:'tab-pk',sector:'prof',...p});
  });
  return [...map.values()];
}

async function loadProgramSettings(){
  try {
    const res = await fetch('./site-settings.json?v=' + Math.floor(Date.now()/60000), {cache:'no-store'});
    if (!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    const s = data?.settings || {};
    return {visibility:s.visibility||{}, customPrograms:Array.isArray(s.customPrograms)?s.customPrograms:[]};
  } catch (_) {
    return {visibility:{},customPrograms:[]};
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

async function refreshProgramsInBackground(){
  try {
    const bucket = Math.floor(Date.now() / PROGRAM_REFRESH_MS);
    const res = await fetch('./program-list.json?v=' + bucket, { cache:'default' });
    if (!res.ok) return;
    const data = await res.json();
    programSettings = await loadProgramSettings();
    const fresh = mergeProgramSets(
      (data.programs || []).filter(p => p && p.id && p.title_ru),
      programSettings.customPrograms
    ).filter(p => programSettings.visibility['program:'+p.id] !== false);
    if (JSON.stringify(fresh) !== JSON.stringify(programsCache)) {
      programsCache = fresh;
      renderPrograms();
    }
  } catch (_) {}
}

function renderPrograms() {
  const q = document.getElementById('programSearch').value.trim().toLowerCase();
  const type = document.getElementById('programType').value;
  const grid = document.getElementById('programGrid');

  const items = programsCache.filter(p => {
    if (p.active === false) return false;
    const hay = [p.title_ru,p.desc_ru,p.type,p.format,p.hours,p.dates].join(' ').toLowerCase();
    return (!q || hay.includes(q)) && (!type || p.type === type);
  }).sort((a,b) => {
    const ao = Number.isFinite(Number(a?.cmsOrder)) ? Number(a.cmsOrder) : null;
    const bo = Number.isFinite(Number(b?.cmsOrder)) ? Number(b.cmsOrder) : null;
    if (ao !== null && bo !== null && ao !== bo) return ao - bo;
    if (ao !== null && bo === null) return -1;
    if (ao === null && bo !== null) return 1;
    return String(a?.title_ru || '').localeCompare(String(b?.title_ru || ''), 'ru');
  });

  if (!items.length) {
    grid.innerHTML = '<div class="empty">По вашему запросу программы не найдены.</div>';
    return;
  }

  grid.innerHTML = items.map(p => {
    const meta = [p.type,p.hours,p.format].filter(Boolean).map(x => '<span class="badge">'+escapeHtml(x)+'</span>').join('');
    const dates = p.dates ? '<div class="muted" style="margin-top:10px"><b>Сроки:</b> '+escapeHtml(p.dates)+'</div>' : '';
    const price = p.price ? '<div class="muted" style="margin-top:6px"><b>Стоимость:</b> '+escapeHtml(p.price)+'</div>' : '';
    const enrollUrl = p.tab === 'tab-kadry'
      ? 'https://trudvsem.ru/?region=3900000000000'
      : 'https://forms.yandex.ru';

    return '<article class="panel card">'+
      '<div class="meta">'+meta+'</div>'+
      '<h2>'+escapeHtml(p.title_ru || 'Программа')+'</h2>'+
      '<p class="muted card-desc">'+escapeHtml(p.desc_ru || '')+'</p>'+dates+price+
      '<div class="card-actions">'+
        '<a class="button button-secondary" href="program.html?id='+encodeURIComponent(p.id)+'">Подробнее</a>'+
        '<a class="button enroll-button" href="'+enrollUrl+'" target="_blank" rel="noopener noreferrer">Записаться</a>'+
      '</div>'+
    '</article>';
  }).join('');
}

async function initPrograms() {
  const grid = document.getElementById('programGrid');
  try {
    const bucket = Math.floor(Date.now() / PROGRAM_REFRESH_MS);
    const res = await fetch('./program-list.json?v=' + bucket, { cache:'default' });
    if (!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    programSettings = await loadProgramSettings();
    programsCache = mergeProgramSets(
      Array.isArray(data.programs) ? data.programs : [],
      programSettings.customPrograms
    ).filter(p => programSettings.visibility['program:'+p.id] !== false);

    const types = [...new Set(programsCache.map(p => p.type).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
    const select = document.getElementById('programType');
    types.forEach(t => {
      const o = document.createElement('option');
      o.value = t; o.textContent = t; select.appendChild(o);
    });

    document.getElementById('programSearch').oninput = renderPrograms;
    select.onchange = renderPrograms;
    renderPrograms();
    clearInterval(programRefreshTimer);
    programRefreshTimer = setInterval(refreshProgramsInBackground, PROGRAM_REFRESH_MS);
  } catch (e) {
    console.error(e);
    grid.innerHTML = '<div class="empty">Не удалось загрузить каталог программ.</div>';
  }
}

document.addEventListener('DOMContentLoaded', initPrograms);
