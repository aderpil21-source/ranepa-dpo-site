const fs = require('fs');
const assert = require('assert');

const entities = fs.readFileSync('site-admin-entities.js','utf8');
const structure = fs.readFileSync('site-admin-structure.js','utf8');

assert(
  entities.includes("active:prev&&prev.active===false?false:true"),
  'Entity editor must preserve draft state instead of forcing active:true'
);

for (const type of ['faq','programs','contacts']) {
  assert(
    entities.includes("siteWorkflowDelete('"+type+"'"),
    'Legacy delete for '+type+' must route through CMS trash workflow'
  );
}

assert(
  structure.includes("active:base&&base.active===false?false:true"),
  'Schedule editor must preserve draft state'
);

for (const marker of [
  "active:prev.active===false?false:true,newTab:d.newTab==='yes'",
]) {
  assert(
    structure.includes(marker),
    'Structure editors must preserve draft state'
  );
}

for (const type of ['nav','docs','blocks']) {
  assert(
    structure.includes("siteWorkflowDelete('"+type+"'"),
    'Legacy delete for '+type+' must route through CMS trash workflow'
  );
}

assert(
  !/siteCustom(?:Programs|Contacts|Faqs|NavItems|Docs|Blocks)\s*=\s*siteCustom(?:Programs|Contacts|Faqs|NavItems|Docs|Blocks)\.filter\([^\n]+deleteSiteCustom/.test(entities + '\n' + structure),
  'Legacy delete handlers must not hard-delete CMS content'
);


assert(
  structure.includes("function safeCmsHref") && structure.includes("function safeCmsMediaUrl"),
  'Structured CMS editors must validate links and media URLs'
);
assert(
  structure.includes("if(!safeCmsHref(d.url))") &&
  structure.includes("if(d.url&&!safeCmsHref(d.url))"),
  'CMS save handlers must reject unsafe URLs'
);

console.log('CMS workflow regression checks passed');
