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

console.log('Public snapshot security checks passed');
