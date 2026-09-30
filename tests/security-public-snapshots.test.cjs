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
  assert(
    items.every(x => x && x.active !== false && x.archived !== true),
    'Public '+name+' must contain only published, non-archived records'
  );
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
  newsWorkflow.includes('public_attributes'),
  'Public settings generator must sanitize secret and draft CMS data'
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

console.log('Public snapshot security checks passed');
