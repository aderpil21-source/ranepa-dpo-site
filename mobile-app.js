(function () {
  'use strict';
  if (document.documentElement.classList.contains('owl-embed-mode')) return;
  document.body.classList.add('site-app-ui');
  const page = location.pathname.split('/').pop() || 'index.html';
  const home = page === 'index.html';
  const header = document.querySelector('body > header');
  if (header) {
    let topNav = header.querySelector('.header-nav,.page-nav,.audience-nav');
    if (!topNav) {
      topNav = document.createElement('nav');
      topNav.className = 'mobile-primary-nav';
      topNav.setAttribute('aria-label', 'Разделы сайта');
      header.appendChild(topNav);
    }
    topNav.classList.add('app-top-nav');
    const existing = new Map();
    [...topNav.children].forEach(link => {
      const href = link.getAttribute('href') || '';
      const action = link.getAttribute('onclick') || '';
      const key = /news\.html/.test(href) ? 'news'
        : /schedule\.html/.test(href) || action.includes('showSchedule') ? 'schedule'
        : /students\.html/.test(href) ? 'students'
        : link.matches('.nav-enroll,.header-nav-btn') ? 'enroll' : 'extra';
      link.dataset.mobileNav = key !== 'extra' && !existing.has(key) ? key : 'extra';
      if (key !== 'extra' && !existing.has(key)) existing.set(key, link);
      if (link.matches('span[onclick]')) {
        link.setAttribute('role', 'button');
        link.tabIndex = 0;
        link.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); link.click(); }
        });
      }
    });
    [
      ['news','news.html','Новости'],
      ['schedule','schedule.html','Расписание'],
      ['students','students.html','Слушателям'],
      ['enroll','https://forms.yandex.ru/cloud/6ac66e491f1eb55cd4148bc8/','Записаться']
    ].forEach(([key, href, label]) => {
      if (existing.has(key)) return;
      const link = document.createElement('a');
      link.className = 'app-mobile-only';
      link.dataset.mobileNav = key;
      link.href = href;
      link.textContent = label;
      if (key === 'enroll') { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      topNav.appendChild(link);
    });
    // Keep sticky notices and anchor destinations aligned with the actual header.
    const measureHeader = () => document.documentElement.style.setProperty('--app-header-height', header.getBoundingClientRect().height + 'px');
    if ('ResizeObserver' in window) new ResizeObserver(measureHeader).observe(header);
    measureHeader();
  }
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
  const mountAssistant = () => {
    if (nav.querySelector('.app-assistant')) return;
    const listenerAssistant = document.querySelector('.students-owl-hit');
    const homeAssistant = home && document.getElementById('owlChat');
    if (!listenerAssistant && !homeAssistant) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'app-assistant';
    button.setAttribute('aria-label', 'Открыть помощника');
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2Z"/><path d="M7 10h.01M12 10h.01M17 10h.01"/></svg>';
    const label = document.createElement('span');
    button.appendChild(label);
    links.push({label,ru:'Помощь',en:'Help'});
    button.addEventListener('click', () => {
      if (listenerAssistant) listenerAssistant.click();
      else if (typeof window.toggleChat === 'function') window.toggleChat();
    });
    nav.appendChild(button);
    nav.classList.add('has-assistant');
    document.body.classList.add('app-assistant-in-dock');
    updateLanguage();
  };
  mountAssistant();
  document.addEventListener('DOMContentLoaded', mountAssistant, {once:true});
  const mobileViewport = matchMedia('(max-width:768px)');
  let themeHome = null;
  const mountThemeControl = () => {
    const toggle = document.querySelector('.site-theme-toggle');
    if (!mobileViewport.matches) {
      if (themeHome && toggle && header.contains(toggle)) {
        const {parent,next} = themeHome;
        parent.insertBefore(toggle,next?.parentNode === parent ? next : null);
        header.classList.remove('app-theme-in-header');
      }
      return;
    }
    if (header && toggle && !header.contains(toggle)) {
      if (!themeHome) themeHome = {parent:toggle.parentNode,next:toggle.nextSibling};
      header.appendChild(toggle);
      header.classList.add('app-theme-in-header');
    }
  };
  mountThemeControl();
  document.addEventListener('DOMContentLoaded', mountThemeControl, {once:true});
  mobileViewport.addEventListener('change',mountThemeControl);
})();
