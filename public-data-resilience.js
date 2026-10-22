// Only public GET data. Never intercept administrative writes or cache access codes.
(function (root) {
  'use strict';
  const legacy = 'https://ranepa-dpo-public-api.onrender.com';
  const materials = 'https://ranepa-dpo-materials-api.rt9b8frtkg.chatgpt.site';
  const materialPrimary = 'https://ranepa-materials-access.onrender.com';
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
  root.dpoMaterialFetch = async function (code) {
    const controllers = [];
    const timers = [];
    try {
      // Independent origins: a regional block or cold start must not block both entry points.
      return await Promise.any([materialPrimary, materials].map(async (base, index) => {
        const controller = new AbortController();
        controllers.push(controller);
        let timer;
        try {
          return await Promise.race([
            (async () => {
              const response = await fetch(base + '/material?code=' + encodeURIComponent(code), {signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
              const data = await response.clone().json();
              // These are live, definitive answers. Never fall back to a static code directory.
              if ([400,404,429].includes(response.status) && data && data.ok === false) return response;
              if (!response.ok || data?.ok !== true || !data.item || typeof data.item !== 'object') throw new Error('Material service unavailable');
              return response;
            })(),
            new Promise((_,reject) => {timer = setTimeout(() => {controller.abort();reject(new Error('Material lookup timeout'));},index === 0 ? 65000 : 12000);timers.push(timer);})
          ]);
        } finally { clearTimeout(timer); }
      }));
    } catch (_) { throw new Error('Material services unavailable'); }
    finally { timers.forEach(clearTimeout); controllers.forEach(controller => controller.abort()); }
  };
  root.dpoPublicFetch = async function (input, options) {
    const url = new URL(input, root.location.href);
    const localSpec = url.origin === root.location.origin || url.origin === new URL(root.location.href).origin ? Object.entries(snapshots).find(([, spec]) => url.pathname === '/' + spec[0]) : null;
    if (localSpec) url.pathname = localSpec[0];
    if ((!localSpec && url.origin !== legacy) || (options && options.method && options.method !== 'GET')) return fetch(input, options);
    if (url.pathname === '/material') {
      // Preserve definitive 400/404 responses; never resurrect a revoked material from a browser cache.
      return root.dpoMaterialFetch(url.searchParams.get('code') || '');
    }
    const spec = snapshots[url.pathname];
    if (!spec) throw new Error('Unsupported public endpoint');
    // Own bounded attempts replace the old Render-only deadline.
    const suffix = '?v=' + Math.floor(Date.now() / 60000);
    try { return await bounded(new URL('./' + spec[0] + suffix, root.location.href).href, 4000, spec[1]); }
    catch (_) { return await bounded(mirror + spec[0] + suffix, 4000, spec[1]); }
  };
})(window);
