const fs = require('fs');
const assert = require('assert');

const settingsDoc = JSON.parse(fs.readFileSync('site-settings.json','utf8'));
const settings = settingsDoc.settings || {};
const visibility = settings.visibility || {};

assert(
  !Object.keys(visibility).some(k => String(k).startsWith('material:')),
  'Public site-settings.json must not expose Owl material access-code keys'
);
assert(
  !Object.prototype.hasOwnProperty.call(settings,'currentVersionId'),
  'Public site-settings.json must not expose the internal CMS version pointer'
);

for (const name of ['customPrograms','customContacts','customFaqs','customSchedules','customNavItems','customDocs','customBlocks']) {
  const items = Array.isArray(settings[name]) ? settings[name] : [];
  for (const item of items) {
    assert(item && typeof item === 'object', 'Public '+name+' records must be objects');
    if (item.active === false || item.archived === true) {
      assert(
        typeof item.sourceKey === 'string' && item.sourceKey.length > 0,
        'Inactive public '+name+' records are allowed only as base-entity tombstones'
      );
      const allowed = new Set(['id','sourceKey','active','archived','cmsOrder']);
      assert(
        Object.keys(item).every(k => allowed.has(k)),
        'Public tombstones must not leak draft content or private metadata'
      );
      assert(item.active === false, 'Public tombstones must remain inactive');
    }
  }
}

for (const rec of Object.values(settings.attributes || {})) {
  if (rec && rec.hidden === true) {
    const keys = Object.keys(rec).sort();
    assert(
      keys.every(k => k === 'selector' || k === 'hidden'),
      'Hidden public attribute overrides must not leak hidden URLs or metadata'
    );
  }
}

const owl = JSON.parse(fs.readFileSync('owl-files.json','utf8'));
assert(Array.isArray(owl.owlFiles) && owl.owlFiles.length === 0,
  'owl-files.json must never publish access codes or material URLs');

const portal = JSON.parse(fs.readFileSync('portal-data.json','utf8'));
assert(Array.isArray(portal.owlFiles) && portal.owlFiles.length === 0,
  'portal-data.json must never publish the Owl access catalogue');

const snapshotJs = fs.readFileSync('portal-snapshot.js','utf8');
const match = snapshotJs.match(/window\.__RANEPA_PORTAL_SNAPSHOT__\s*=\s*(\{[\s\S]*\});?\s*$/);
assert(match,'portal-snapshot.js payload must be parseable');
const snapshot = JSON.parse(match[1]);
assert(Array.isArray(snapshot.owlFiles) && snapshot.owlFiles.length === 0,
  'portal-snapshot.js must never publish the Owl access catalogue');

const newsWorkflow = fs.readFileSync('.github/workflows/refresh-news-data.yml','utf8');
assert(
  newsWorkflow.includes('if not str(key).startswith("material:")') &&
  newsWorkflow.includes('public_entities') &&
  newsWorkflow.includes('public_attributes') &&
  newsWorkflow.includes('is_base_override') &&
  newsWorkflow.includes('tombstone'),
  'Public settings generator must sanitize secret/draft CMS data while preserving safe base tombstones'
);

const portalWorkflow = fs.readFileSync('.github/workflows/refresh-portal-data.yml','utf8');
assert(
  portalWorkflow.includes('owl_files = []') &&
  portalWorkflow.includes('Access codes and material URLs are secrets'),
  'Portal snapshot generator must never republish Owl access codes'
);

const indexHtml = fs.readFileSync('index.html','utf8');
assert(!indexHtml.includes("localStorage.setItem('siteAdminToken'"),
  'PRO token must not be persisted to localStorage');
assert(!/[?&](?:token|adminToken)=/i.test(indexHtml),
  'PRO token must not be placed into client URLs');


for (const page of ['index.html','programs.html','program.html','schedule.html','students.html','faq.html','contacts.html','news.html','ai-lecture.html','media-player.html']) {
  const html = fs.readFileSync(page,'utf8');
  assert(/http-equiv=["']Content-Security-Policy["']/i.test(html),
    page+' must define a Content Security Policy');
  assert(/name=["']referrer["']/i.test(html),
    page+' must define a referrer policy');
}

const vkAuth = fs.readFileSync('vk-auth.html','utf8');
assert(/http-equiv=["']Content-Security-Policy["']/i.test(vkAuth),
  'vk-auth.html must define a Content Security Policy');
assert(/name=["']referrer["'][^>]+content=["']no-referrer["']/i.test(vkAuth),
  'vk-auth.html must never send a referrer while handling a VK access token');

const payHtml = fs.readFileSync('pay/index.html','utf8');
assert(/default-src 'none'/i.test(payHtml) && /content=["']no-referrer["']/i.test(payHtml),
  'Payment page must retain its strict isolated CSP and no-referrer policy');


assert(
  vkAuth.includes('@vkontakte/vk-bridge@2.15.12/dist/browser.min.js') &&
  !vkAuth.includes('@vkontakte/vk-bridge/dist/browser.min.js'),
  'VK auth helper must pin the browser bridge to a known compatible version'
);

const robots = fs.readFileSync('robots.txt','utf8');
for (const path of ['/vk-auth.html','/media-player.html','/site-settings.json','/owl-files.json','/portal-snapshot.js']) {
  assert(robots.includes('Disallow: '+path),
    'robots.txt must discourage indexing of '+path);
}


for (const file of ['programs-page.js','schedule-page.js','contacts-page.js']) {
  const source = fs.readFileSync(file,'utf8');
  assert(!source.includes('__site_admin_settings__'),
    file+' must not read raw CMS settings from the public news API');
  assert(!source.includes('?type=news'),
    file+' must not use the public news API as a settings transport');
  assert(source.includes('site-settings.json'),
    file+' must use the sanitized public settings snapshot');
}


const newsHtml = fs.readFileSync('news.html','utf8');
const publicSettingsFn = newsHtml.match(/async function loadPublicNewsPageEnabled\(\)[\s\S]*?\n\}/);
assert(publicSettingsFn && publicSettingsFn[0].includes('site-settings.json'),
  'Public news visibility must use the sanitized site settings snapshot');
assert(publicSettingsFn && !publicSettingsFn[0].includes('__site_admin_settings__') && !publicSettingsFn[0].includes('?type=news'),
  'Public news visibility must not read raw system settings from Apps Script');


const indexSource = fs.readFileSync('index.html','utf8');
const loadSettingsFn = indexSource.match(/async function loadSiteSettings\(useAdmin\)[\s\S]*?\n    \}/);
assert(loadSettingsFn && loadSettingsFn[0].includes("if (!useAdmin || !siteAdminToken)"),
  'Public main-page settings load must stop after the sanitized snapshot');
assert(loadSettingsFn && !loadSettingsFn[0].includes("const publicUrl = API_URL + '?type=news"),
  'Public main page must not fetch raw CMS settings from Apps Script');

const refreshPublicNewsFn = newsHtml.match(/async function refreshPublicNewsSnapshot\(options\)[\s\S]*?\n\}/);
assert(refreshPublicNewsFn && refreshPublicNewsFn[0].includes('publicNewsSnapshotUrl()'),
  'Public news refresh must use news-data.json');
assert(refreshPublicNewsFn && !refreshPublicNewsFn[0].includes("CONFIG.api + '?type=news"),
  'Public news refresh must not download the raw Apps Script item list');


const cspPages = ['index.html','programs.html','program.html','schedule.html','students.html','faq.html','contacts.html','news.html','ai-lecture.html','media-player.html'];
for (const page of cspPages) {
  const html = fs.readFileSync(page,'utf8');
  const meta = html.match(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*content="([^"]+)"/i);
  assert(meta, page+' must expose a parseable CSP meta tag');
  const scriptSrc = (meta[1].match(/(?:^|;)\s*script-src\s+([^;]+)/i) || [])[1] || '';
  assert(!/(?:^|\s)https:(?:\s|$)/.test(scriptSrc),
    page+' script-src must not trust every HTTPS origin');
}

for (const page of ['index.html','programs.html','program.html','schedule.html','students.html','faq.html','contacts.html','news.html','ai-lecture.html','media-player.html','pay/index.html']) {
  const html = fs.readFileSync(page,'utf8');
  for (const tag of html.match(/<a\b[^>]*target=["']_blank["'][^>]*>/gi) || []) {
    assert(/rel=["'][^"']*(?:noopener|noreferrer)/i.test(tag),
      page+' target=_blank link must include noopener or noreferrer: '+tag.slice(0,160));
  }
}


const newsSecurity = fs.readFileSync('news.html','utf8');
assert(
  newsSecurity.includes("const win = window.open(VK_GROUP_URL, 'ranepaVkManualPhoto')") &&
  newsSecurity.includes("if (win) win.opener = null") &&
  newsSecurity.includes("const vkWindow = wantsVkNow ? openVkWindowForManualPhoto() : null"),
  'External VK windows must be detached from the news page opener'
);


const aiLecture = fs.readFileSync('ai-lecture.html','utf8');
assert(
  aiLecture.includes('@mediapipe/camera_utils@0.3.1675466862/camera_utils.js') &&
  aiLecture.includes('@mediapipe/drawing_utils@0.3.1675466124/drawing_utils.js') &&
  aiLecture.includes('@mediapipe/hands@0.4.1675469240/hands.js') &&
  aiLecture.includes('@mediapipe/hands@0.4.1675469240/${file}'),
  'AI lecture MediaPipe dependencies must be pinned to exact versions'
);
assert(
  !aiLecture.includes('@mediapipe/camera_utils/camera_utils.js') &&
  !aiLecture.includes('@mediapipe/drawing_utils/drawing_utils.js') &&
  !aiLecture.includes('@mediapipe/hands/hands.js'),
  'AI lecture must not use unversioned MediaPipe CDN URLs'
);


const mediaAdmin = fs.readFileSync('site-admin-media.js','utf8');
assert(
  mediaAdmin.includes("const allowed=new Set(['png','jpg','jpeg','webp','gif','pdf','doc','docx','ppt','pptx','xls','xlsx','zip','mp4','webm','mov','m4v','avi','mkv','mp3','wav','m4a','ogg'])") &&
  mediaAdmin.includes("image\\/svg\\+xml") &&
  mediaAdmin.includes("text\\/html"),
  'PRO media upload must reject active web files and use an explicit extension allowlist'
);


for (const page of ['index.html','programs.html','program.html','schedule.html','students.html','faq.html','contacts.html','news.html','ai-lecture.html','media-player.html','vk-auth.html','pay/index.html']) {
  const html = fs.readFileSync(page,'utf8');
  const blankLinks = [...html.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi)].map(m => m[0]);
  assert(
    blankLinks.every(tag => /rel=["'][^"']*\bnoopener\b/i.test(tag)),
    page+' must protect target=_blank links with rel=noopener'
  );
  assert(
    !/<a\b[^>]+href=["']\s*javascript:/i.test(html),
    page+' must not contain javascript: anchor URLs'
  );
}

for (const file of ['index.html','news.html','programs-page.js','schedule-page.js','contacts-page.js','section-page.js','site-admin-entities.js','site-admin-structure.js','site-admin-workflow.js','site-admin-media.js','site-admin-seo.js']) {
  const source = fs.readFileSync(file,'utf8');
  assert(!/\beval\s*\(/.test(source), file+' must not use eval()');
  assert(!/new\s+Function\s*\(/.test(source), file+' must not use new Function()');
}


const externalScriptPolicy = {
  'index.html': ['mc.yandex.ru'],
  'programs.html': [],
  'program.html': [],
  'schedule.html': [],
  'students.html': [],
  'faq.html': [],
  'contacts.html': [],
  'news.html': ['mc.yandex.ru'],
  'ai-lecture.html': ['mc.yandex.ru','cdn.jsdelivr.net','cdnjs.cloudflare.com'],
  'media-player.html': [],
  'vk-auth.html': ['unpkg.com']
};
for (const [page, allowedHosts] of Object.entries(externalScriptPolicy)) {
  const html = fs.readFileSync(page,'utf8');
  const urls = [...html.matchAll(/<script\b[^>]+src=["'](https?:\/\/[^"']+)["']/gi)].map(m => m[1]);
  for (const raw of urls) {
    const host = new URL(raw).hostname;
    assert(allowedHosts.includes(host), page+' contains an unapproved external script host: '+host);
  }
  const dynamic = [...html.matchAll(/\.src\s*=\s*["'](https?:\/\/[^"']+)["']/gi)].map(m => m[1]);
  for (const raw of dynamic) {
    const host = new URL(raw).hostname;
    assert(allowedHosts.includes(host), page+' dynamically loads an unapproved external script host: '+host);
  }
}


assert(
  indexHtml.includes("response.status === 401") &&
  indexHtml.includes("response.status === 403") &&
  indexHtml.includes("const authCode = String(data && (data.code || data.error) || '').trim().toUpperCase()"),
  'PRO session expiry must handle HTTP auth failures and normalized backend codes'
);
assert(
  indexHtml.includes("if (typeof toggleSiteTextEditMode === 'function') toggleSiteTextEditMode(false)") &&
  indexHtml.includes("applySiteVisibility();") &&
  indexHtml.includes("applySiteContentOverrides();"),
  'Expired PRO sessions must immediately restore visitor-mode rendering'
);



assert(
  mediaAdmin.includes("function requireHttpsUrl") &&
  mediaAdmin.includes("data.uploadUrl=requireHttpsUrl") &&
  mediaAdmin.includes("data.publicUrl=requireHttpsUrl"),
  'PRO media signing responses must be restricted to HTTPS URLs'
);
assert(
  mediaAdmin.includes("r.status===401||r.status===403") &&
  mediaAdmin.includes("typeof siteAdminLogout==='function'"),
  'PRO media upload must fully terminate expired admin sessions'
);


assert(
  newsHtml.includes("function clearNewsAdminSession()") &&
  newsHtml.includes("res.status === 401 || res.status === 403") &&
  newsHtml.includes("code === 'SESSION_EXPIRED' || code === 'UNAUTHORIZED'"),
  'News editor must terminate expired sessions centrally'
);
assert(
  newsHtml.includes("const SIGNATURES") &&
  newsHtml.includes("async function verifySignature") &&
  newsHtml.includes("async function fileHash") &&
  newsHtml.includes("async function compressImage") &&
  newsHtml.includes("const activeProviders") &&
  newsHtml.includes("async function checkStorageHealth"),
  'News media validation and upload helper pipeline must remain intact'
);
assert(
  newsHtml.includes("u.protocol!=='https:'||p.protocol!=='https:'") &&
  newsHtml.includes("code:'BAD_SIGNED_URL'"),
  'News media signing responses must be restricted to HTTPS URLs'
);


const cspExpectations = {
  'index.html': ["'self'","'unsafe-inline'","https://mc.yandex.ru"],
  'news.html': ["'self'","'unsafe-inline'","https://mc.yandex.ru"],
  'programs.html': ["'self'","'unsafe-inline'"],
  'program.html': ["'self'","'unsafe-inline'"],
  'schedule.html': ["'self'","'unsafe-inline'"],
  'students.html': ["'self'","'unsafe-inline'"],
  'faq.html': ["'self'","'unsafe-inline'"],
  'contacts.html': ["'self'","'unsafe-inline'"],
  'media-player.html': ["'self'","'unsafe-inline'"],
  'ai-lecture.html': ["'self'","'unsafe-inline'","'unsafe-eval'","https://mc.yandex.ru","https://cdn.jsdelivr.net","https://cdnjs.cloudflare.com"],
  'vk-auth.html': ["'self'","'unsafe-inline'","https://unpkg.com"],
  'pay/index.html': ["'none'"]
};
for (const [page, expected] of Object.entries(cspExpectations)) {
  const html = fs.readFileSync(page,'utf8');
  const tag = (html.match(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/i)||[])[0] || '';
  const content = (tag.match(/content="([^"]*)"/i)||tag.match(/content='([^']*)'/i)||[])[1] || '';
  const scriptSrc = (content.match(/script-src\s+([^;]+)/i)||[])[1] || '';
  for (const token of expected) assert(scriptSrc.includes(token), page+' missing required script-src token '+token);
  assert(!/(^|\s)https:(\s|$)/.test(scriptSrc), page+' must not allow arbitrary HTTPS script origins');
}


assert(
  newsHtml.includes("try { if (win) win.opener = null; } catch(e){}") &&
  newsHtml.includes("try { popup.opener = null; } catch(e){}"),
  'News popups must not retain window.opener access'
);


const cachedNewsBranch = newsHtml.match(/const cached = readCachedNews\(\);[\s\S]*?\/\/ Первый визит:/);
assert(
  cachedNewsBranch &&
  cachedNewsBranch[0].includes("refreshPublicNewsSnapshot({ silent:true, force:true, openHash:true })"),
  'Cached public news must immediately revalidate against the sanitized snapshot'
);


const entitiesAdmin = fs.readFileSync('site-admin-entities.js','utf8');
const publicSchedule = fs.readFileSync('schedule-page.js','utf8');
const publicContacts = fs.readFileSync('contacts-page.js','utf8');
const contactsHtml = fs.readFileSync('contacts.html','utf8');

assert(
  entitiesAdmin.includes("sourceKey:'base-program:'+pid") &&
  entitiesAdmin.includes("record.sourceKey='base-program:'+String(id)"),
  'Base program overrides must be identifiable for safe public tombstones'
);
assert(
  publicSchedule.includes("if(x.sourceKey){o.set(x.sourceKey,x);return}") &&
  publicSchedule.includes("if(ov.active===false||ov.archived===true)return"),
  'Public schedule must honor inactive base-entity tombstones'
);
assert(
  publicContacts.includes("String(c.sourceKey||'')===sourceKey") &&
  publicContacts.includes("!c.sourceKey&&c.active!==false&&c.archived!==true"),
  'Public contacts must apply base overrides without duplicating them as custom cards'
);
assert(
  contactsHtml.includes('data-site-contact-key="nameKanash"') &&
  contactsHtml.includes('data-site-contact-key="nameKhamzina"'),
  'Public contact cards must expose stable CMS keys'
);


const programHtml = fs.readFileSync('program.html','utf8');
const publicPrograms = fs.readFileSync('programs-page.js','utf8');

assert(
  programHtml.includes("./site-settings.json?v=") &&
  !programHtml.includes("SITE_ADMIN_API") &&
  !/script\.google\.com\/macros\//.test(programHtml),
  'Direct program pages must use only the sanitized public settings snapshot'
);
assert(
  programHtml.includes("customMatch.active===false||customMatch.archived===true") &&
  programHtml.includes("program=Object.assign({active:true,tab:'tab-pk',sector:'prof'},program||{},customMatch)"),
  'Direct program pages must honor base tombstones and overlay published overrides'
);
assert(
  publicPrograms.includes("const id=String(p.id), baseRecord=map.get(id)||{}") &&
  publicPrograms.includes("...baseRecord,...p"),
  'Public program catalog must overlay sparse CMS overrides on base data'
);
assert(
  publicContacts.includes("const hasDetails=['office','phone','extension','email'].some") &&
  entitiesAdmin.includes("const hasDetails=['office','phone','extension','email'].some"),
  'Sparse contact ordering overrides must not erase contact details'
);

console.log('Public snapshot security checks passed');
