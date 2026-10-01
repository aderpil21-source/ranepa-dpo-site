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
  structure.includes("if(override.archived===true||(override.active===false&&!window.sitePreviewDraftMode))return"),
  'Inactive schedule overrides must stay hidden in production and appear only in authenticated preview'
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
  entities.includes("if(!f||!f.id||f.sourceKey||f.archived===true||(f.active===false&&!window.sitePreviewDraftMode)) return"),
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


assert(
  workflow.includes("data-preview-viewport=\"mobile\"") &&
  workflow.includes("data-preview-theme=\"light\"") &&
  workflow.includes("preview-mobile") &&
  workflow.includes("preview-light"),
  'Draft preview must support mobile and light-theme modes'
);


assert(
  entities.includes("function baseFaqs") &&
  entities.includes("function applyBaseFaqOverrides") &&
  entities.includes("window.siteFaqSetPublished") &&
  entities.includes("window.siteFaqDuplicateAny") &&
  entities.includes("window.siteFaqArchiveAny") &&
  entities.includes("window.siteFaqRestoreBase"),
  'Built-in FAQ must have full PRO overlay lifecycle'
);
assert(
  structure.includes("data-site-doc-static") || fs.readFileSync('index.html','utf8').includes('data-site-doc-static="1"'),
  'Built-in documents must have stable CMS IDs'
);
assert(
  structure.includes("function applyBaseDocOverrides") &&
  structure.includes("window.siteDocSetPublished") &&
  structure.includes("window.siteDocDuplicateAny") &&
  structure.includes("window.siteDocArchiveAny") &&
  structure.includes("window.siteDocRestoreBase"),
  'Built-in documents must have full PRO overlay lifecycle'
);
assert(
  structure.includes("if(!x||x.sourceKey||x.archived===true") &&
  structure.includes("siteVisibility['doc-custom:'+x.id]"),
  'Document overrides must not render as duplicate custom cards'
);


const indexHtml = fs.readFileSync('index.html','utf8');
const preview = fs.readFileSync('site-admin-preview.js','utf8');

assert(
  indexHtml.includes("window.sitePreviewDraftMode = new URLSearchParams(location.search).get('cmsPreview') === 'drafts' && !!siteAdminToken"),
  'Draft preview must require an authenticated PRO session'
);
assert(
  indexHtml.includes('site-admin-preview.js?v=1'),
  'PRO preview module must be loaded by the page'
);
assert(
  preview.includes("get('cmsPreview')==='drafts'") &&
  preview.includes('#siteAdminPanel,#siteAdminReopen,#siteAdminLoginModal{display:none!important}'),
  'Embedded preview must hide administrative UI'
);
assert(
  preview.includes('Mobile 390px') &&
  preview.includes("data-theme=\"light\""),
  'PRO preview must support mobile and light/dark review'
);


assert(
  indexHtml.includes("let siteSettingsDirty = false") &&
  indexHtml.includes("function flushSiteSettingsSave()") &&
  indexHtml.includes("siteSettingsDirty = true;") &&
  indexHtml.includes("siteSettingsDirty = siteSavedRevision < siteSaveRevision") &&
  indexHtml.includes("settleSiteSaveWaiters(false, savingRevision)"),
  'CMS must expose pending-save state and preserve it correctly across failed saves'
);
assert(
  indexHtml.includes("window.addEventListener('beforeunload'") &&
  indexHtml.includes("siteAdminSaveNowBtn"),
  'CMS must warn on pending changes and provide Save now'
);


assert(
  entities.includes("window.siteFaqMoveAny") &&
  entities.includes("function applyFaqOrder") &&
  entities.includes("cmsOrder:index"),
  'FAQ ordering must persist across built-in and custom entries'
);
assert(
  structure.includes("window.siteDocMoveAny") &&
  structure.includes("function applyDocOrder") &&
  structure.includes("cmsOrder:index"),
  'Document ordering must persist across built-in and custom entries'
);


assert(
  structure.includes("window.siteNavMoveAny") &&
  structure.includes("function applyNavOrder") &&
  structure.includes("cmsOrder:index"),
  'Menu ordering must persist across built-in and custom entries'
);


assert(
  entities.includes("field('departmentKey','Раздел контактов'") &&
  entities.includes("function contactGridByKey") &&
  indexHtml.includes("function gridForContact(contact)"),
  'Contacts must render and move by stable department keys'
);


assert(
  entities.includes("window.siteContactMoveAny") &&
  entities.includes("function applyContactOrder") &&
  entities.includes("cmsOrder:index"),
  'Contact ordering must persist within departments'
);


const seo = fs.readFileSync('site-admin-seo.js','utf8');
const media = fs.readFileSync('site-admin-media.js','utf8');
assert(
  seo.includes("function safeSeoUrl") &&
  seo.includes("meta[property=\"og:image\"]") &&
  seo.includes("const before=JSON.parse(JSON.stringify(siteSeoConfig||{}))") &&
  seo.includes("if(!ok){siteSeoConfig=before;applySiteSeoConfig();return;}"),
  'SEO editing must validate URLs, support og:image, and rollback failed saves'
);
assert(
  media.includes("input[data-seo=\"ogImage\"]") &&
  media.includes("Загрузить OG изображение"),
  'SEO editor must support direct OpenGraph image upload'
);


const overlayDnd = fs.readFileSync('site-admin-overlay-dnd.js','utf8');
assert(
  overlayDnd.includes("data-cms-dnd-type") &&
  overlayDnd.includes("type==='contacts'") &&
  overlayDnd.includes("siteCustomContacts") &&
  overlayDnd.includes("const ok=await saveSiteSettings") &&
  overlayDnd.includes("setArray(type,before)"),
  'Base overlay drag-and-drop must preserve contact groups and rollback failed saves'
);
assert(
  entities.includes('data-cms-dnd-type="programs"') &&
  entities.includes('data-cms-dnd-type="contacts"') &&
  entities.includes('data-cms-dnd-type="faq"') &&
  structure.includes('data-cms-dnd-type="nav"') &&
  structure.includes('data-cms-dnd-type="docs"'),
  'All primary overlay CMS rows must expose drag reorder metadata'
);


assert(
  entities.includes("function baseFaqs") &&
  entities.includes("function applyBaseFaqOverrides") &&
  entities.includes("window.siteFaqSetPublished") &&
  entities.includes("window.siteFaqDuplicateAny") &&
  entities.includes("window.siteFaqArchiveAny") &&
  entities.includes("window.siteFaqRestoreBase"),
  'Existing FAQ items must have full CMS overlay lifecycle'
);
assert(
  structure.includes("function baseDocs") &&
  structure.includes("function applyBaseDocOverrides") &&
  structure.includes("window.siteDocSetPublished") &&
  structure.includes("window.siteDocDuplicateAny") &&
  structure.includes("window.siteDocArchiveAny") &&
  structure.includes("window.siteDocRestoreBase"),
  'Existing document cards must have full CMS overlay lifecycle'
);
assert(
  structure.includes('data-cms-dnd-type="blocks"') &&
  structure.includes("siteWorkflowTogglePublish") &&
  structure.includes("siteWorkflowDuplicate") &&
  structure.includes("siteWorkflowDelete") &&
  structure.includes("siteWorkflowRestore"),
  'Information blocks must expose the full CMS lifecycle in the structure panel'
);



assert(
  overlayDnd.includes("if(type==='blocks')return siteCustomBlocks") &&
  overlayDnd.includes("else if(type==='blocks')siteCustomBlocks=value"),
  'Overlay drag-and-drop must persist information block order'
);



assert(
  indexHtml.includes("const beforeSnapshot = siteSnapshot()") &&
  indexHtml.includes("if (!saved) {") &&
  indexHtml.includes("siteCurrentVersionId = beforeId"),
  'Version restore must rollback local CMS state when server save fails'
);
assert(
  indexHtml.includes("const beforeRedo = siteRedoStack.slice()") &&
  indexHtml.includes("const nextId = siteRedoStack.length ? siteRedoStack[siteRedoStack.length - 1] : null"),
  'Undo and redo stacks must remain consistent when version switching fails'
);


assert(
  indexHtml.includes("let siteSaveRevision = 0") &&
  indexHtml.includes("let siteSavedRevision = 0") &&
  indexHtml.includes("let siteSaveWaiters = []") &&
  indexHtml.includes("siteSaveWaiters.push({ revision:requestedRevision, resolve:resolve })") &&
  indexHtml.includes("settleSiteSaveWaiters(true, siteSavedRevision)") &&
  indexHtml.includes("settleSiteSaveWaiters(false, savingRevision)"),
  'Concurrent CMS saves must wait for the revision that contains their own changes'
);


assert(
  indexHtml.includes("const versionBeforeSave = siteCurrentVersionId") &&
  indexHtml.includes("const redoBeforeSave = siteRedoStack.slice()") &&
  indexHtml.includes("siteCurrentVersionId = versionBeforeSave") &&
  indexHtml.includes("siteRedoStack = redoBeforeSave"),
  'Failed CMS saves must rollback version pointer and redo history'
);


assert(
  entities.includes("window.siteProgramArchiveAny") &&
  entities.includes("window.siteProgramRestoreBase"),
  'Base programs must support trash and restore lifecycle'
);
assert(
  structure.includes("siteCustomBlocks||[]).slice().sort") &&
  structure.includes("cmsOrder"),
  'Information block renderer must honor persisted drag order'
);


const mediaJs = fs.readFileSync('site-admin-media.js','utf8');
assert(
  mediaJs.includes("function usageFor(url)") &&
  mediaJs.includes("siteAttributeOverrides") &&
  mediaJs.includes("siteSeoConfig") &&
  mediaJs.includes("Не найден в текущей странице/CMS"),
  'Media manager must show where recent uploads are used in the page or CMS'
);


assert(
  workflow.includes("new Set(['programs','contacts','faq','schedule','nav','docs','blocks'])"),
  'Generic CMS drag-and-drop must persist cmsOrder for every entity type'
);
assert(
  structure.includes("return out.concat(a).sort") &&
  structure.includes("x&&x.cmsOrder"),
  'Schedule merge must honor persisted cmsOrder'
);


assert(
  indexHtml.includes('<script src="./portal-snapshot.js?v=20261001-1"></script>') &&
  indexHtml.indexOf('<script src="./portal-snapshot.js?v=20261001-1"></script>') < indexHtml.indexOf('function loadPortalData()'),
  'Homepage must load the embedded portal snapshot before program data is requested'
);
assert(
  indexHtml.includes("scheduleNextCutoffRefresh();") &&
  !indexHtml.includes("if (scheduleRefreshTimer) {\n            clearTimeout(scheduleRefreshTimer);\n            scheduleRefreshTimer = null;\n        }\n        stopScheduleSnapshotPolling();"),
  'Kaliningrad 21:00 schedule cutoff clock must survive closing the schedule overlay'
);

console.log('CMS workflow regression checks passed');
