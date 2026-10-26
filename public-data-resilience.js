// Only public GET data. Never intercept administrative writes or cache access codes.
(function (root) {
  'use strict';
  const legacy = 'https://ranepa-dpo-public-api.onrender.com';
  const materials = 'https://ranepa-materials-access.onrender.com';
  const materialRussia = 'https://functions.yandexcloud.net/d4epn9fj3lub5pa30m7u';
  const materialPrimary = 'https://ranepa-dpo-site.vercel.app/api';
  const mirror = 'https://raw.githubusercontent.com/aderpil21-source/ranepa-dpo-site/main/';
  const serverlessMirror = 'https://ranepa-dpo-site.vercel.app/';
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
            const data = await response.json();
            if (!data || typeof data !== 'object' || !(validate in data)) throw new Error('Invalid public snapshot');
            if (['schedules','programs','items'].includes(validate) && !Array.isArray(data[validate])) throw new Error('Invalid public list');
            return Response.json(data, {status:response.status});
          }
          return response;
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Public data timeout')); }, timeout); })
      ]);
    } finally { clearTimeout(timer); }
  }
  root.dpoNormalizeMaterialCode = function (value) {
    const clean = String(value || '').normalize('NFKC').trim().toUpperCase()
      .replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\s+/g, '');
    const match = clean.match(/^(?:ЛК|LK|ЛK|LК)-(\d{4}|[A-F0-9]{8})$/);
    return match ? 'ЛК-' + match[1] : '';
  };
  root.dpoMaterialFetch = async function (code) {
    code = root.dpoNormalizeMaterialCode(code);
    if (!code) return Response.json({ok:false,error:'bad_code'}, {status:400});
    let rateLimited;

    const controllers = [];
    const timers = [];
    try {
      // Independent origins: a regional block or cold start must not block both entry points.
      return await Promise.any([materialRussia, materialPrimary + '/material', materials + '/material'].map(async (endpoint) => {
        const controller = new AbortController();
        controllers.push(controller);
        let timer;
        try {
          return await Promise.race([
            (async () => {
              const response = await fetch(endpoint + '?code=' + encodeURIComponent(code), {signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
              const data = await response.clone().json();
              // These are live, definitive answers. Never fall back to a static code directory.
              if ([400,404].includes(response.status) && data && data.ok === false) return new Response(JSON.stringify(data), {status:response.status,headers:response.headers});
              // A provider's quota does not invalidate a code on another provider.
              if (response.status === 429 && data?.ok === false) rateLimited = new Response(JSON.stringify(data), {status:429,headers:response.headers});
              if (!response.ok || data?.ok !== true || !data.item || typeof data.item !== 'object') throw new Error('Material service unavailable');
              // Detach the consumed JSON before aborting losing connections.
              return new Response(JSON.stringify(data), {status:response.status,headers:response.headers});
            })(),
            new Promise((_,reject) => {timer = setTimeout(() => {controller.abort();reject(new Error('Material lookup timeout'));},22000);timers.push(timer);})
          ]);
        } finally { clearTimeout(timer); }
      }));
    } catch (_) { if (rateLimited) return rateLimited; throw new Error('Material services unavailable'); }
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
    catch (_) {
      try { return await bounded(serverlessMirror + spec[0] + suffix, 4000, spec[1]); }
      catch (_) { return await bounded(mirror + spec[0] + suffix, 4000, spec[1]); }
    }
  };
})(window);
