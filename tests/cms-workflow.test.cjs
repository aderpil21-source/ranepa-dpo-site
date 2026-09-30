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
const unsafeUrlGuards = structure.split("d.url&&!safeCmsHref(d.url)").length - 1;
assert(
  unsafeUrlGuards >= 3,
  'CMS save handlers must reject unsafe URLs'
);


const workflow = fs.readFileSync('site-admin-workflow.js','utf8');

assert(
  workflow.includes("async function save(reason,rollback)") &&
  workflow.includes("if(!ok&&typeof rollback==='function'){rollback();refresh();}"),
  'CMS workflow must rollback local state when server save fails'
);

assert(
  entities.includes("if(!saved){siteCustomPrograms=before") &&
  entities.includes("if(!saved){siteCustomContacts=before") &&
  entities.includes("if(!saved){siteCustomFaqs=before"),
  'Entity editors must rollback failed saves'
);

assert(
  structure.includes("let saved=false") &&
  structure.includes("if(saved){close();renderSiteAdminPanel();}"),
  'Structure editor must close only after confirmed save'
);


assert(
  structure.includes("if(override.active===false||override.archived===true)return"),
  'Inactive schedule overrides must suppress base schedule entries'
);


assert(
  entities.includes("function programCatalogForAdmin") &&
  entities.includes("window.siteProgramSetPublished") &&
  entities.includes("window.siteProgramDuplicateAny") &&
  entities.includes("window.siteProgramMoveAny"),
  'Base programs must be manageable directly from PRO CMS'
);


assert(
  entities.includes("if(base&&override) return Object.assign({},base,override)"),
  'Program editor lookup must merge base data with sparse PRO overrides'
);
assert(
  structure.includes("return base?Object.assign({},base,custom):custom"),
  'Schedule editor lookup must merge base data with sparse PRO overrides'
);
assert(
  structure.includes("window.siteScheduleSetPublished") &&
  structure.includes("window.siteScheduleDuplicateAny") &&
  structure.includes("window.siteScheduleArchiveAny") &&
  structure.includes("window.siteScheduleRestoreBase"),
  'Base schedule entries must have full CMS lifecycle controls'
);


assert(
  entities.includes("function baseContacts") &&
  entities.includes("function applyBaseContactOverrides") &&
  entities.includes("window.siteContactSetPublished") &&
  entities.includes("window.siteContactDuplicateAny") &&
  entities.includes("window.siteContactArchiveAny") &&
  entities.includes("window.siteContactRestoreBase"),
  'Existing contact cards must be manageable through PRO overlays'
);

assert(
  structure.includes("const y={...x,...override}") &&
  structure.includes("window.siteScheduleSetPublished") &&
  structure.includes("window.siteScheduleDuplicateAny") &&
  structure.includes("window.siteScheduleArchiveAny"),
  'Base schedule entries must use overlay merges and full lifecycle controls'
);


assert(
  entities.includes("function baseFaqs") &&
  entities.includes("function applyBaseFaqOverrides") &&
  entities.includes("window.siteFaqSetPublished") &&
  entities.includes("window.siteFaqDuplicateAny") &&
  entities.includes("window.siteFaqArchiveAny") &&
  entities.includes("window.siteFaqRestoreBase"),
  'Existing FAQ entries must be manageable through PRO overlays'
);
assert(
  entities.includes("if(!f||!f.id||f.active===false||f.sourceKey) return"),
  'Base FAQ overrides must not render duplicate custom FAQ cards'
);


assert(
  structure.includes("function baseDocs") &&
  structure.includes("function applyBaseDocOverrides") &&
  structure.includes("window.siteDocSetPublished") &&
  structure.includes("window.siteDocDuplicateAny") &&
  structure.includes("window.siteDocArchiveAny") &&
  structure.includes("window.siteDocRestoreBase"),
  'Existing document cards must be manageable through PRO overlays'
);
assert(
  structure.includes("card.onclick=()=>openDocLightbox(image"),
  'Edited base documents must open the current PRO image in lightbox'
);
assert(
  workflow.includes("siteCustomContacts.filter(x=>x&&!x.sourceKey)") &&
  workflow.includes("siteCustomFaqs.filter(x=>x&&!x.sourceKey)") &&
  workflow.includes("siteCustomDocs.filter(x=>x&&!x.sourceKey)"),
  'Base overlay records must stay out of custom workflow lists'
);


assert(
  structure.includes("function baseNavItems") &&
  structure.includes("function applyBaseNavOverrides") &&
  structure.includes("window.siteNavSetPublished") &&
  structure.includes("window.siteNavDuplicateAny") &&
  structure.includes("window.siteNavArchiveAny") &&
  structure.includes("window.siteNavRestoreBase"),
  'Existing navigation items must be manageable through PRO overlays'
);
assert(
  workflow.includes("siteCustomNavItems.filter(x=>x&&!x.sourceKey)"),
  'Base navigation overlays must stay out of custom workflow lists'
);


assert(
  workflow.includes("window.siteWorkflowPreview") &&
  workflow.includes("function previewMarkup") &&
  workflow.includes("Предпросмотр"),
  'Draft workflow must provide a non-publishing preview modal'
);

console.log('CMS workflow regression checks passed');
