import express from 'express';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

const PORT = Number(process.env.PORT || 10000);
const PORTAL_UPSTREAM = String(process.env.PORTAL_UPSTREAM || '').trim();
const NEWS_UPSTREAM = String(process.env.NEWS_UPSTREAM || '').trim();
const ALLOWED_ORIGINS = new Set([
  'https://ranepa-dpo39.ru',
  'https://www.ranepa-dpo39.ru',
  'https://aderpil21-source.github.io'
]);

const cache = new Map();
const inflight = new Map();

function setCors(req, res) {
  const origin = String(req.get('origin') || '');
  if (ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Cache-Control', 'no-store, max-age=0');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
}

app.use((req, res, next) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  next();
});

function safeString(v, max = 10000) {
  return String(v == null ? '' : v).slice(0, max);
}

function safePortalPayload(raw) {
  const programs = Array.isArray(raw?.programs)
    ? raw.programs.filter(x => x && x.id).map(x => ({
        id:safeString(x.id,120), tab:safeString(x.tab,80), sector:safeString(x.sector,80),
        price:safeString(x.price,120), hours:safeString(x.hours,120), format:safeString(x.format,500),
        type:safeString(x.type,200), dates:safeString(x.dates,500), title_ru:safeString(x.title_ru,1000),
        desc_ru:safeString(x.desc_ru,6000), bullets_ru:Array.isArray(x.bullets_ru)?x.bullets_ru.map(v=>safeString(v,1000)).slice(0,30):[],
        title_en:safeString(x.title_en,1000), desc_en:safeString(x.desc_en,6000),
        bullets_en:Array.isArray(x.bullets_en)?x.bullets_en.map(v=>safeString(v,1000)).slice(0,30):[],
        pdf_link:/^https:\/\//i.test(String(x.pdf_link||''))?safeString(x.pdf_link,3000):''
      }))
    : [];
  const schedules = Array.isArray(raw?.schedules)
    ? raw.schedules.filter(Boolean).map(x => ({
        id:safeString(x.id,120), program:safeString(x.program,1000), date:safeString(x.date,120),
        time:safeString(x.time,120), subject:safeString(x.subject,4000),
        teacher:safeString(x.teacher,1500), room:safeString(x.room,1500)
      }))
    : [];
  const currentAlert = raw?.currentAlert && typeof raw.currentAlert === 'object' && safeString(raw.currentAlert.text, 4000).trim()
    ? { text:safeString(raw.currentAlert.text, 4000).trim() }
    : null;
  return { programs, schedules, currentAlert };
}

function sanitizePublicSettings(raw) {
  const visibility = {};
  for (const [key,value] of Object.entries(raw?.visibility || {})) {
    if (!String(key).startsWith('material:')) visibility[key] = value;
  }
  const entityNames = ['customPrograms','customContacts','customFaqs','customSchedules','customNavItems','customDocs','customBlocks'];
  const out = {
    version: raw?.version || 1,
    visibility,
    content: raw?.content && typeof raw.content === 'object' ? raw.content : {},
    attributes: {},
    theme: raw?.theme && typeof raw.theme === 'object' ? raw.theme : {},
    seo: raw?.seo && typeof raw.seo === 'object' ? raw.seo : {},
    updatedAt: safeString(raw?.updatedAt, 200)
  };
  for (const [selector,record] of Object.entries(raw?.attributes || {})) {
    if (!record || typeof record !== 'object') continue;
    out.attributes[selector] = record.hidden === true
      ? { selector:safeString(record.selector || selector, 1000), hidden:true }
      : record;
  }
  for (const name of entityNames) {
    const items = Array.isArray(raw?.[name]) ? raw[name] : [];
    out[name] = items.flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const inactive = item.active === false || item.archived === true;
      let isBase = !!item.sourceKey;
      if (name === 'customPrograms' && !isBase) {
        isBase = !!item.id && !String(item.id).startsWith('custom-p-');
      }
      if (!inactive) return [item];
      if (!isBase) return [];
      const tombstone = { id:item.id, sourceKey:item.sourceKey || ('base-program:' + String(item.id || '')), active:false };
      if (item.archived === true) tombstone.archived = true;
      if (Number.isFinite(Number(item.cmsOrder))) tombstone.cmsOrder = Number(item.cmsOrder);
      return [tombstone];
    });
  }
  return out;
}

function safeNewsPayload(raw) {
  const items = Array.isArray(raw?.items) ? raw.items : [];
  return items.filter(item =>
    item && item.status === 'published' &&
    item.id !== '__site_admin_settings__'
  ).filter(item => {
    const tags = Array.isArray(item.tags) ? item.tags : [];
    return !tags.includes('__site_version__') && !tags.includes('__system__');
  }).map(item => ({
    id:safeString(item.id,200), title:safeString(item.title,2000), lead:safeString(item.lead,8000),
    coverImage:safeString(item.coverImage,4000), tags:Array.isArray(item.tags)?item.tags.map(v=>safeString(v,200)).slice(0,30):[],
    blocks:Array.isArray(item.blocks)?item.blocks.slice(0,200):[], status:'published',
    createdAt:safeString(item.createdAt,200), updatedAt:safeString(item.updatedAt,200)
  }));
}

async function fetchJson(url, key, ttlMs = 15000) {
  if (!url) throw new Error('upstream_not_configured');
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.at < ttlMs) return cached.value;
  if (inflight.has(key)) return inflight.get(key);
  const task = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(url, {
        redirect:'follow',
        cache:'no-store',
        signal:controller.signal,
        headers:{'User-Agent':'RANEPA-DPO-Public-Proxy/1.0'}
      });
      if (!res.ok) throw new Error('upstream_http_' + res.status);
      const data = await res.json();
      cache.set(key, {at:Date.now(), value:data});
      return data;
    } finally {
      clearTimeout(timeout);
      inflight.delete(key);
    }
  })();
  inflight.set(key, task);
  return task;
}

async function portalRaw() {
  return fetchJson(PORTAL_UPSTREAM, 'portal', 10000);
}

async function newsRaw() {
  return fetchJson(NEWS_UPSTREAM, 'news', 10000);
}

app.get('/health', (req,res) => {
  res.json({ok:true, service:'ranepa-dpo-public-api', now:new Date().toISOString()});
});

app.get('/portal', async (req,res) => {
  try { res.json(safePortalPayload(await portalRaw())); }
  catch (e) { res.status(503).json({ok:false,error:'portal_unavailable'}); }
});

app.get('/schedule', async (req,res) => {
  try { const d=safePortalPayload(await portalRaw()); res.json({schedules:d.schedules}); }
  catch (e) { res.status(503).json({ok:false,error:'schedule_unavailable'}); }
});

app.get('/programs', async (req,res) => {
  try { const d=safePortalPayload(await portalRaw()); res.json({programs:d.programs}); }
  catch (e) { res.status(503).json({ok:false,error:'programs_unavailable'}); }
});

app.get('/alert', async (req,res) => {
  try { const d=safePortalPayload(await portalRaw()); res.json({currentAlert:d.currentAlert}); }
  catch (e) { res.status(503).json({ok:false,error:'alert_unavailable'}); }
});

app.get('/material', async (req,res) => {
  try {
    const code = safeString(req.query.code, 64).trim().toUpperCase();
    if (!/^ЛК-(?:\d{4}|[A-F0-9]{8})$/i.test(code)) return res.status(400).json({ok:false,error:'bad_code'});
    const raw = await portalRaw();
    const files = Array.isArray(raw?.owlFiles) ? raw.owlFiles : [];
    const item = files.find(x => String(x?.code || '').trim().toUpperCase() === code);
    if (!item) return res.status(404).json({ok:false,error:'not_found'});
    const url = /^https?:\/\//i.test(String(item.url||'')) ? safeString(item.url,4000) : '';
    return res.json({
      ok:true,
      item:{
        title:safeString(item.title,2000),
        url,
        date:safeString(item.date,300),
        comment:safeString(item.comment,5000),
        isPublished:item.isPublished === true
      }
    });
  } catch (e) {
    res.status(503).json({ok:false,error:'material_unavailable'});
  }
});

app.get('/news', async (req,res) => {
  try { res.json({items:safeNewsPayload(await newsRaw())}); }
  catch (e) { res.status(503).json({ok:false,error:'news_unavailable'}); }
});

app.get('/settings', async (req,res) => {
  try {
    const raw = await newsRaw();
    const settingsItem = Array.isArray(raw?.items) ? raw.items.find(x => x && x.id === '__site_admin_settings__') : null;
    let settings = {};
    try { settings = JSON.parse(settingsItem?.lead || '{}'); } catch {}
    res.json({settings:sanitizePublicSettings(settings)});
  } catch (e) {
    res.status(503).json({ok:false,error:'settings_unavailable'});
  }
});

app.use((req,res) => res.status(404).json({ok:false,error:'not_found'}));

app.listen(PORT, '0.0.0.0', () => {
  console.log('RANEPA DPO public API listening on', PORT);
});
