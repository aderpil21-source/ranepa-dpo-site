(function () {
  'use strict';
  if (document.documentElement.classList.contains('owl-embed-mode')) return;
  document.body.classList.add('site-app-ui');
  const page = location.pathname.split('/').pop() || 'index.html';
  const home = page === 'index.html';
  const nav = document.createElement('nav');
  nav.className = 'mobile-app-dock';
  nav.setAttribute('aria-label', 'Основные разделы');
  const icons = {
    home:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    programs:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    schedule:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2"/>',
    students:'<path d="m2 8 10-5 10 5-10 5Zm4 3v6c4 3 8 3 12 0v-6m4-3v8"/>'
  };
  const entries = [
    ['home','index.html','Главная','Home'],
    ['programs','programs.html','Программы','Programs'],
    ['schedule','schedule.html','Расписание','Schedule'],
    ['students','students.html','Слушателям','Students']
  ];
  const links = [];
  entries.forEach(([key, href, ru, en]) => {
    const link = document.createElement('a');
    link.href = href;
    if (key === 'schedule') link.dataset.siteVisibilityKey = 'schedule';
    if (key === 'programs') link.dataset.siteVisibilityKey = 'nav_programs';
    link.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + icons[key] + '</svg>';
    const label = document.createElement('span');
    link.appendChild(label);
    const selected = href === page || (key === 'programs' && page === 'program.html');
    if (selected) link.setAttribute('aria-current','page');
    if (home && key === 'schedule') {
      link.addEventListener('click', event => {
        if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && typeof window.showSchedule === 'function') {
          event.preventDefault();
          window.showSchedule();
        }
      });
    }
    nav.appendChild(link);
    links.push({label,ru,en});
  });
  const updateLanguage = () => {
    const en = document.documentElement.lang === 'en';
    nav.setAttribute('aria-label',en ? 'Main navigation' : 'Основные разделы');
    links.forEach(item => { item.label.textContent = en ? item.en : item.ru; });
  };
  updateLanguage();
  new MutationObserver(updateLanguage).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  document.body.appendChild(nav);
})();
