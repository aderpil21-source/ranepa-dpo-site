// Only public GET data. Never intercept administrative writes or cache access codes.
(function (root) {
  'use strict';
  const legacy = 'https://ranepa-dpo-public-api.onrender.com';
  const materials = 'https://ranepa-dpo-materials-api.rt9b8frtkg.chatgpt.site';
  const mirror = 'https://raw.githubusercontent.com/aderpil21-source/ranepa-dpo-site/main/';
  const snapshots = {
    '/portal': ['portal-data.json', 'schedules'],
    '/schedule': ['schedule-data.json', 'schedules'],
    '/programs': ['program-list.json', 'programs'],
    '/news': ['news-data.json', 'items'],
    '/settings': ['site-settings.json', 'settings'],
    '/alert': ['portal-alert.json', 'currentAlert']
  };
  async function bounded(url, timeout, validate) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetch(url, {signal:controller.signal, cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer'});
          if (!response.ok) throw new Error('HTTP ' + response.status);
          if (validate) {
            const data = await response.clone().json();
            if (!data || typeof data !== 'object' || !(validate in data)) throw new Error('Invalid public snapshot');
            if (['schedules','programs','items'].includes(validate) && !Array.isArray(data[validate])) throw new Error('Invalid public list');
          }
          return response;
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Public data timeout')); }, timeout); })
      ]);
    } finally { clearTimeout(timer); }
  }
  root.dpoPublicFetch = async function (input, options) {
    const url = new URL(input, root.location.href);
    const localSpec = url.origin === root.location.origin || url.origin === new URL(root.location.href).origin ? Object.entries(snapshots).find(([, spec]) => url.pathname === '/' + spec[0]) : null;
    if (localSpec) url.pathname = localSpec[0];
    if ((!localSpec && url.origin !== legacy) || (options && options.method && options.method !== 'GET')) return fetch(input, options);
    if (url.pathname === '/material') {
      // Preserve definitive 400/404 responses; never resurrect a revoked material from a browser cache.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try { return await fetch(materials + '/material?code=' + encodeURIComponent(url.searchParams.get('code') || ''), {signal:controller.signal, cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer'}); }
      finally { clearTimeout(timer); }
    }
    const spec = snapshots[url.pathname];
    if (!spec) throw new Error('Unsupported public endpoint');
    // Own bounded attempts replace the old Render-only deadline.
    const suffix = '?v=' + Math.floor(Date.now() / 60000);
    try { return await bounded(new URL('./' + spec[0] + suffix, root.location.href).href, 4000, spec[1]); }
    catch (_) { return await bounded(mirror + spec[0] + suffix, 4000, spec[1]); }
  };
})(window);
