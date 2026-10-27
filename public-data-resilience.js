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
            if(root.dpoRegisterDownloadSources)root.dpoRegisterDownloadSources(data);
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
  const downloadSources = new Map();
  const reverseDownloads = new Map();
  root.dpoDriveFileId = function(value) {
    try {
      const u=new URL(value);
      if(u.protocol!=='https:'||!['drive.google.com','drive.usercontent.google.com','lh3.googleusercontent.com'].includes(u.hostname))return '';
      const id=u.searchParams.get('id')||u.pathname.match(/\/d\/([\w-]+)/)?.[1];
      return /^[\w-]{15,150}$/.test(id||'')?id:'';
    }catch{return '';}
  };
  function rememberSources(google,yandex) {
    const id=root.dpoDriveFileId(google);
    if(!id||!/^https:\/\/storage\.yandexcloud\.net\//.test(yandex||''))return;
    downloadSources.set(id,{google,yandex});reverseDownloads.set(yandex,{google,yandex});
  }
  root.dpoRegisterDownloadSources = function(data) {
    function scan(value) {
      if(Array.isArray(value))return value.forEach(scan);
      if(!value||typeof value!=='object')return;
      rememberSources(value.googleUrl,value.yandexUrl);
      for(const key of Object.keys(value)) {
        if(key.endsWith('GoogleUrl'))rememberSources(value[key],value[key.slice(0,-9)+'YandexUrl']);
        scan(value[key]);
      }
    }
    scan(data);
  };
  root.dpoYandexDownloadHref = function(google,yandex) {
    const id=root.dpoDriveFileId(google);if(!id)return '';
    const query=new URLSearchParams({download:id});
    const copy=yandex||downloadSources.get(id)?.yandex;
    if(copy)query.set('yandex',copy);
    return materialRussia+'?'+query;
  };
  root.dpoResolveYandexDownload = async function(google,yandex) {
    const href=root.dpoYandexDownloadHref(google,yandex);
    if(!href)throw new Error('Invalid Google file');
    const controller=new AbortController();let timer;
    try {
      return await Promise.race([
        (async()=>{
          const r=await fetch(href+'&format=json',{signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
          if(!r.ok)throw Error();const selected=await r.json();
          if(selected.provider==='yandex'&&/^https:\/\/storage\.yandexcloud\.net\//.test(selected.url||''))return {url:selected.url,provider:'yandex'};
          return {url:google,provider:'google'};
        })(),
        new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({url:google,provider:'google'});},3500);})
      ]);
    }catch{return {url:google,provider:'google'};}
    finally{clearTimeout(timer);controller.abort();}
  };
  if(root.document && root.MutationObserver) {
    const doc=root.document;
    function enhanceDownloads(){
      for(const link of doc.querySelectorAll('a[href]')) {
        if(link.dataset.downloadChoices||link.dataset.downloadProvider||link.closest('#siteAdminPanel,#siteAdminControls'))continue;
        const original=reverseDownloads.get(link.href);
        const google=original?.google||link.href;
        if(!root.dpoDriveFileId(google))continue;
        link.dataset.downloadChoices='1';link.href=google;
        link.title=(doc.documentElement.lang==='en'?'Download from Google Drive':'Скачать с Google Диска');
        const alternative=doc.createElement('a');
        alternative.href=root.dpoYandexDownloadHref(google,original?.yandex);
        alternative.target='_blank';alternative.rel='noopener noreferrer';
        alternative.className='download-source-choice';alternative.dataset.downloadProvider='yandex';
        alternative.dataset.googleUrl=google;
        if(original?.yandex)alternative.dataset.yandexUrl=original.yandex;
        alternative.textContent=doc.documentElement.lang==='en'?'Download from Yandex':'Скачать с Яндекса';
        link.insertAdjacentElement('afterend',alternative);
      }
    }
    doc.addEventListener('click',async event=>{
      const link=event.target.closest?.('a[data-download-provider="yandex"]');if(!link)return;
      event.preventDefault();const google=link.dataset.googleUrl;
      if(!root.dpoDriveFileId(google))return;
      const popup=root.open('about:blank','_blank');if(popup)popup.opener=null;
      const label=link.textContent;link.textContent='Проверяем Яндекс…';link.setAttribute('aria-busy','true');
      const chosen=await root.dpoResolveYandexDownload(google,link.dataset.yandexUrl);
      if(chosen.provider==='google') {
        let note=link.nextElementSibling;
        if(!note?.classList.contains('download-source-status')){note=doc.createElement('small');note.className='download-source-status';note.setAttribute('role','status');link.insertAdjacentElement('afterend',note);}
        note.textContent='Яндекс недоступен или отвечает медленно. Открываем Google Диск.';
      }
      if(popup)popup.location.replace(chosen.url);else root.location.assign(chosen.url);
      link.textContent=label;link.removeAttribute('aria-busy');
    });
    doc.addEventListener('error',async event=>{
      const media=event.target;if(!['IMG','VIDEO'].includes(media?.tagName)||media.dataset.sourceFallbackUsed)return;
      const current=media.currentSrc||media.src,pair=reverseDownloads.get(current);
      const google=pair?.google||(root.dpoDriveFileId(current)?current:'');if(!google)return;
      media.dataset.sourceFallbackUsed='1';media.dataset.sourceFallbackPending='1';
      if(pair){media.src=google;queueMicrotask(()=>{delete media.dataset.sourceFallbackPending;});return;}
      const chosen=await root.dpoResolveYandexDownload(google);
      delete media.dataset.sourceFallbackPending;
      if(chosen.provider==='yandex')media.src=chosen.url;else media.dispatchEvent(new Event('error'));
    },true);
    function startDownloadChoices(){
      const style=doc.createElement('style');style.textContent='.download-source-choice{display:inline-flex;align-items:center;gap:5px;margin:6px 0 6px 10px;padding:7px 10px;border:1px solid currentColor;border-radius:8px;font-size:.85em;text-decoration:none}.download-source-status{display:block;margin:5px 0;color:var(--text-muted,#94a3b8)}';doc.head.appendChild(style);
      enhanceDownloads();let pending=false;
      new root.MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;enhanceDownloads();});}).observe(doc.body,{childList:true,subtree:true});
    }
    if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',startDownloadChoices,{once:true});else startDownloadChoices();
  }
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
              root.dpoRegisterDownloadSources(data);
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
