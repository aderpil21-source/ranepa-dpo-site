/* Query-specific metadata for the existing program.html?id=… route. */
(function () {
  'use strict';
  const base = 'https://ranepa-dpo39.ru/';
  const id = (new URLSearchParams(location.search).get('id') || '').trim();
  const canonical = base + 'program.html' + (id ? '?id=' + encodeURIComponent(id) : '');
  function meta(key, value, property = false) {
    const attribute = property ? 'property' : 'name';
    let node = document.head.querySelector(`meta[${attribute}="${key}"]`);
    if (!node) {
      node = document.createElement('meta');
      node.setAttribute(attribute, key);
      document.head.appendChild(node);
    }
    node.content = value;
  }
  const link = document.createElement('link');
  link.rel = 'canonical';
  link.href = canonical;
  document.head.appendChild(link);
  meta('og:url', canonical, true);
  window.updateProgramSeo = function (program, lang, title, lead) {
    document.documentElement.lang = lang;
    if (!program) {
      meta('robots', 'noindex, follow');
      document.getElementById('program-schema')?.remove();
      return;
    }
    const description = String(lead || title).replace(/\s+/g, ' ').trim().slice(0, 200);
    const pageTitle = title + (lang === 'en' ? ' | RANEPA Western Branch' : ' | РАНХиГС Калининград');
    document.title = pageTitle;
    meta('robots', 'index, follow, max-image-preview:large');
    meta('description', description);
    meta('og:title', pageTitle, true);
    meta('og:description', description, true);
    meta('og:locale', lang === 'en' ? 'en_US' : 'ru_RU', true);
    meta('twitter:title', pageTitle);
    meta('twitter:description', description);
    let schema = document.getElementById('program-schema');
    if (!schema) {
      schema = document.createElement('script');
      schema.id = 'program-schema';
      schema.type = 'application/ld+json';
      document.head.appendChild(schema);
    }
    schema.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Course',
      name: title, description, url: canonical, inLanguage: lang,
      provider: {'@type': 'CollegeOrUniversity', name: 'Западный филиал РАНХиГС', url: base}
    });
  };
  if (!id) window.updateProgramSeo(null, 'ru');
}());
