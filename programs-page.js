let programsCache = [];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

function renderPrograms() {
  const q = document.getElementById('programSearch').value.trim().toLowerCase();
  const type = document.getElementById('programType').value;
  const grid = document.getElementById('programGrid');

  const items = programsCache.filter(p => {
    if (p.active === false) return false;
    const hay = [p.title_ru,p.desc_ru,p.type,p.format,p.hours,p.dates].join(' ').toLowerCase();
    return (!q || hay.includes(q)) && (!type || p.type === type);
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
  grid.innerHTML = '<div class="empty">Загрузка программ…</div>';
  try {
    const res = await fetch('./program-data.json?v='+Date.now(), {cache:'no-store'});
    if (!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    programsCache = Array.isArray(data.programs) ? data.programs : [];

    const types = [...new Set(programsCache.map(p => p.type).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
    const select = document.getElementById('programType');
    types.forEach(t => {
      const o = document.createElement('option');
      o.value = t; o.textContent = t; select.appendChild(o);
    });

    document.getElementById('programSearch').addEventListener('input', renderPrograms);
    select.addEventListener('change', renderPrograms);
    renderPrograms();
  } catch (e) {
    console.error(e);
    grid.innerHTML = '<div class="empty">Не удалось загрузить каталог программ.</div>';
  }
}

document.addEventListener('DOMContentLoaded', initPrograms);
