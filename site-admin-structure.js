(function(){
'use strict';
let type='',id='',modal=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=p=>p+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
function safeCmsHref(value){const s=String(value||'').trim();if(!s)return '';if(/^#/.test(s)||/^(\.\.?\/|\/)/.test(s))return s;if(/^(mailto:|tel:)/i.test(s))return s;try{const u=new URL(s,location.href);return(u.protocol==='https:'||u.protocol==='http:')?u.href:''}catch(_){return ''}}
function safeCmsMediaUrl(value){const s=String(value||'').trim();if(!s)return '';if(/^(\.\.?\/|\/)/.test(s))return s;try{const u=new URL(s,location.href);return(u.protocol==='https:'||u.protocol==='http:')?u.href:''}catch(_){return ''}}
function field(n,l,v,t='text',w=false,o=[]){const c='site-entity-field'+(w?' wide':'');if(t==='textarea')return '<div class="'+c+'"><label>'+esc(l)+'</label><textarea name="'+esc(n)+'">'+esc(v||'')+'</textarea></div>';if(t==='select')return '<div class="'+c+'"><label>'+esc(l)+'</label><select name="'+esc(n)+'">'+o.map(x=>'<option value="'+esc(x[0])+'"'+(String(v||'')===String(x[0])?' selected':'')+'>'+esc(x[1])+'</option>').join('')+'</select></div>';return '<div class="'+c+'"><label>'+esc(l)+'</label><input type="'+esc(t)+'" name="'+esc(n)+'" value="'+esc(v||'')+'"></div>'}
function ensure(){if(modal)return modal;modal=document.createElement('div');modal.className='site-entity-modal';modal.id='siteAdminStructureModal';modal.innerHTML='<div class="site-entity-dialog"><div class="site-entity-head"><h3 id="structTitle"></h3><button type="button" class="site-entity-x">×</button></div><form id="structForm"><div class="site-entity-grid" id="structFields"></div><div class="site-entity-footer"><button class="site-entity-save" type="submit">Сохранить</button><button class="site-entity-cancel" type="button">Отмена</button></div></form></div>';document.body.appendChild(modal);modal.querySelector('.site-entity-x').onclick=close;modal.querySelector('.site-entity-cancel').onclick=close;modal.addEventListener('click',e=>{if(e.target===modal)close()});modal.querySelector('#structForm').addEventListener('submit',save);return modal}
function close(){if(modal)modal.classList.remove('active');type='';id=''}
function open(t,i,title,html){if(!siteAdminMode)return openSiteAdminLogin();type=t;id=i||'';const m=ensure();m.querySelector('#structTitle').textContent=title;m.querySelector('#structFields').innerHTML=html;m.classList.add('active')}
function key(x){return 'schedule:'+[x?.id,x?.date,x?.time,x?.subject].map(v=>encodeURIComponent(String(v||'').trim())).join('|')}
function merge(base,custom){const o=new Map(),a=[];(custom||[]).forEach(x=>{if(!x)return;if(x.sourceKey){o.set(x.sourceKey,x);return}if(x.active===false||x.archived===true)return;a.push(x)});const out=[];(base||[]).forEach(x=>{const k=key(x);if(o.has(k)){const override=o.get(k);o.delete(k);if(override.active===false||override.archived===true)return;const y={...x,...override};delete y.sourceKey;out.push(y)}else out.push(x)});o.forEach(x=>{if(x.active===false||x.archived===true)return;const y={...x};delete y.sourceKey;out.push(y)});return out.concat(a)}
const findSchedule=i=>{const custom=(siteCustomSchedules||[]).find(x=>x&&(x.id===i||x.sourceKey===i))||null;if(custom&&custom.sourceKey){const base=(window.schedules||[]).find(x=>key(x)===custom.sourceKey)||null;return base?Object.assign({},base,custom):custom}return custom||(window.schedules||[]).find(x=>key(x)===i)||null};
function baseNavKey(node){
  if(!node)return '';
  const token=node.dataset&&node.dataset.i18n?node.dataset.i18n:'';
  const href=node.matches('a')?(node.getAttribute('href')||''):'';
  return 'base-nav:'+(token||href||String(node.textContent||'').trim().toLowerCase().replace(/[^a-zа-яё0-9]+/gi,'-'));
}
function baseNavRecord(node){
  if(!node)return null;const id=baseNavKey(node);if(!id||id==='base-nav:')return null;
  return {id,sourceKey:id,label:String(node.textContent||'').trim(),url:node.matches('a')?String(node.getAttribute('href')||'').trim():'',newTab:node.getAttribute('target')==='_blank',active:true,custom:false};
}
function baseNavItems(){return [...document.querySelectorAll('.header-nav .header-nav-link:not(.site-custom-nav-item)')].map(baseNavRecord).filter(Boolean);}
const findNav=i=>{const nid=String(i||'');const custom=(siteCustomNavItems||[]).find(x=>x&&(String(x.id)===nid||String(x.sourceKey||'')===nid))||null;const base=baseNavItems().find(x=>String(x.id)===nid)||null;if(base&&custom)return Object.assign({},base,custom,{id:nid,sourceKey:nid});return custom||base||null};
function baseDocKey(card){
  if(!card)return '';
  const title=card.querySelector('h4'),img=card.querySelector('img');
  const token=title&&title.dataset&&title.dataset.i18n?title.dataset.i18n:'';
  const path=img?(img.getAttribute('data-deferred-src')||img.getAttribute('src')||''):'';
  return 'base-doc:'+(token||path||'').trim();
}
function baseDocRecord(card){
  if(!card)return null;
  const id=baseDocKey(card);if(!id||id==='base-doc:')return null;
  const title=card.querySelector('h4'),subtitle=card.querySelector('p'),img=card.querySelector('img');
  return {id,sourceKey:id,title:String(title&&title.textContent||'').trim(),subtitle:String(subtitle&&subtitle.textContent||'').trim(),image:String(img&&(img.getAttribute('data-deferred-src')||img.getAttribute('src'))||'').trim(),url:'',newTab:false,active:true,custom:false};
}
function baseDocs(){return [...document.querySelectorAll('[data-site-doc-grid] .doc-card:not(.site-custom-doc)')].map(baseDocRecord).filter(Boolean);}
const findDoc=i=>{const did=String(i||'');const custom=(siteCustomDocs||[]).find(x=>x&&(String(x.id)===did||String(x.sourceKey||'')===did))||null;const base=baseDocs().find(x=>String(x.id)===did)||null;if(base&&custom)return Object.assign({},base,custom,{id:did,sourceKey:did});return custom||base||null};
const findBlock=i=>(siteCustomBlocks||[]).find(x=>x&&x.id===i)||null;
window.openSiteScheduleEditor=i=>{const x=i?findSchedule(i):null;open('schedule',i,x?'Редактировать занятие':'Добавить занятие',field('program','Программа',x&&x.program,'text',true)+field('date','Дата',x&&x.date)+field('time','Время',x&&x.time)+field('subject','Тема занятия',x&&x.subject,'textarea',true)+field('teacher','Преподаватель',x&&x.teacher,'text',true)+field('room','Место / аудитория',x&&x.room,'text',true))};
window.openSiteNavEditor=i=>{const x=i?findNav(i):null;open('nav',i,x?'Редактировать пункт меню':'Добавить пункт меню',field('label','Название',x&&x.label,'text',true)+field('url','Ссылка',x&&x.url,'text',true)+field('newTab','Открывать',x&&x.newTab?'yes':'no','select',false,[['no','В этой вкладке'],['yes','В новой вкладке']]))};
window.openSiteDocEditor=i=>{const x=i?findDoc(i):null;open('doc',i,x?'Редактировать документ':'Добавить документ',field('title','Название',x&&x.title,'text',true)+field('subtitle','Подпись',x&&x.subtitle,'text',true)+field('image','Изображение / путь',x&&x.image,'text',true)+field('url','Ссылка',x&&x.url,'text',true)+field('newTab','Открывать ссылку',x&&x.newTab?'yes':'no','select',false,[['no','В этой вкладке'],['yes','В новой вкладке']]))};
window.openSiteBlockEditor=i=>{const x=i?findBlock(i):null;open('block',i,x?'Редактировать блок':'Добавить информационный блок',field('title','Заголовок',x&&x.title,'text',true)+field('text','Текст',x&&x.text,'textarea',true)+field('url','Ссылка',x&&x.url,'text',true)+field('linkLabel','Текст ссылки',x&&x.linkLabel||'Подробнее')+field('placement','Размещение',x&&x.placement||'before-faq','select',false,[['before-documents','Перед документами'],['before-faq','Перед FAQ'],['before-contacts','Перед контактами']])+field('newTab','Открывать ссылку',x&&x.newTab?'yes':'no','select',false,[['no','В этой вкладке'],['yes','В новой вкладке']]))};

function scheduleBaseByKey(i){return (window.schedules||[]).find(x=>key(x)===i)||null}
function scheduleOverrideByKey(i){return (siteCustomSchedules||[]).find(x=>x&&x.sourceKey===i)||null}
function upsertScheduleOverride(sourceKey,patch){
  const idx=siteCustomSchedules.findIndex(x=>x&&x.sourceKey===sourceKey);
  if(idx>=0)siteCustomSchedules[idx]=Object.assign({},siteCustomSchedules[idx],patch,{sourceKey,custom:true});
  else siteCustomSchedules.push(Object.assign({id:uid('custom-s-'),sourceKey,custom:true},patch));
}
window.siteScheduleSetPublished=async function(i,published){
  const base=scheduleBaseByKey(i);
  if(!base){
    if(typeof siteWorkflowTogglePublish==='function')return siteWorkflowTogglePublish('schedule',i);
    return;
  }
  const before=siteCustomSchedules.map(x=>x&&Object.assign({},x));
  upsertScheduleOverride(i,{active:!!published,archived:false});
  if(typeof applySiteCustomContent==='function')applySiteCustomContent();
  const ok=await saveSiteSettings({recordVersion:true,reason:(published?'Опубликовано занятие: ':'Занятие в черновик: ')+([base.date,base.time,base.program,base.subject].filter(Boolean).join(' · '))});
  if(!ok){siteCustomSchedules=before;if(typeof applySiteCustomContent==='function')applySiteCustomContent();}
  renderSiteAdminPanel();
};
window.siteScheduleDuplicateAny=async function(i){
  const src=findSchedule(i);if(!src)return;
  const before=siteCustomSchedules.map(x=>x&&Object.assign({},x));
  const copy=JSON.parse(JSON.stringify(src));copy.id=uid('custom-s-');delete copy.sourceKey;copy.custom=true;copy.active=false;copy.archived=false;delete copy.archivedAt;
  siteCustomSchedules.push(copy);
  if(typeof applySiteCustomContent==='function')applySiteCustomContent();
  const ok=await saveSiteSettings({recordVersion:true,reason:'Создана копия занятия: '+([copy.date,copy.time,copy.program,copy.subject].filter(Boolean).join(' · '))});
  if(!ok){siteCustomSchedules=before;if(typeof applySiteCustomContent==='function')applySiteCustomContent();renderSiteAdminPanel();return;}
  renderSiteAdminPanel();openSiteScheduleEditor(copy.id);
};
window.siteScheduleArchiveAny=async function(i){
  const base=scheduleBaseByKey(i);
  if(!base){
    if(typeof siteWorkflowDelete==='function')return siteWorkflowDelete('schedule',i);
    return;
  }
  if(!confirm('Переместить занятие в корзину?'))return;
  const before=siteCustomSchedules.map(x=>x&&Object.assign({},x));
  upsertScheduleOverride(i,{active:false,archived:true,archivedAt:new Date().toISOString()});
  if(typeof applySiteCustomContent==='function')applySiteCustomContent();
  const ok=await saveSiteSettings({recordVersion:true,reason:'В корзину занятие: '+([base.date,base.time,base.program,base.subject].filter(Boolean).join(' · '))});
  if(!ok){siteCustomSchedules=before;if(typeof applySiteCustomContent==='function')applySiteCustomContent();}
  renderSiteAdminPanel();
};
window.siteScheduleRestoreBase=async function(i){
  const override=scheduleOverrideByKey(i),base=scheduleBaseByKey(i);if(!override||!base)return;
  const before=siteCustomSchedules.map(x=>x&&Object.assign({},x));
  upsertScheduleOverride(i,{active:false,archived:false});
  const idx=siteCustomSchedules.findIndex(x=>x&&x.sourceKey===i);if(idx>=0)delete siteCustomSchedules[idx].archivedAt;
  if(typeof applySiteCustomContent==='function')applySiteCustomContent();
  const ok=await saveSiteSettings({recordVersion:true,reason:'Восстановлено занятие из корзины'});
  if(!ok){siteCustomSchedules=before;if(typeof applySiteCustomContent==='function')applySiteCustomContent();}
  renderSiteAdminPanel();
};
function docCatalogForAdmin(){
  const map=new Map();
  baseDocs().forEach(x=>{if(x&&x.id)map.set(String(x.id),Object.assign({},x));});
  (siteCustomDocs||[]).forEach(x=>{
    if(!x||!x.id)return;
    const key=String(x.sourceKey||x.id),base=map.get(key)||{};
    map.set(key,Object.assign({},base,x,{id:key}));
  });
  return [...map.values()];
}
function upsertDocOverride(id,patch){
  const did=String(id),idx=(siteCustomDocs||[]).findIndex(x=>x&&(String(x.id)===did||String(x.sourceKey||'')===did));
  if(idx>=0)siteCustomDocs[idx]=Object.assign({},siteCustomDocs[idx],patch,{id:did,sourceKey:did,custom:true});
  else siteCustomDocs.push(Object.assign({id:did,sourceKey:did,custom:true},patch));
}
window.siteDocSetPublished=async function(id,published){
  const base=baseDocs().find(x=>String(x.id)===String(id));
  if(!base){
    if(typeof siteWorkflowTogglePublish==='function')return siteWorkflowTogglePublish('docs',id);
    return;
  }
  const before=siteCustomDocs.map(x=>x&&Object.assign({},x));
  upsertDocOverride(id,{active:!!published,archived:false});
  applyBaseDocOverrides();renderDocs();renderSiteAdminPanel();
  const ok=await saveSiteSettings({recordVersion:true,reason:(published?'Опубликован документ: ':'Документ в черновик: ')+(base.title||id)});
  if(!ok){siteCustomDocs=before;applyBaseDocOverrides();renderDocs();renderSiteAdminPanel();}
};
window.siteDocDuplicateAny=async function(id){
  const src=findDoc(id);if(!src)return;
  const before=siteCustomDocs.map(x=>x&&Object.assign({},x));
  const copy=JSON.parse(JSON.stringify(src));copy.id=uid('custom-doc-');delete copy.sourceKey;copy.custom=true;copy.active=false;copy.archived=false;delete copy.archivedAt;copy.title=(copy.title||'Документ')+' — копия';
  siteCustomDocs.push(copy);applyBaseDocOverrides();renderDocs();renderSiteAdminPanel();
  const ok=await saveSiteSettings({recordVersion:true,reason:'Создана копия документа: '+copy.title});
  if(!ok){siteCustomDocs=before;applyBaseDocOverrides();renderDocs();renderSiteAdminPanel();return;}
  openSiteDocEditor(copy.id);
};
window.siteDocArchiveAny=async function(id){
  const base=baseDocs().find(x=>String(x.id)===String(id));
  if(!base){
    if(typeof siteWorkflowDelete==='function')return siteWorkflowDelete('docs',id);
    return;
  }
  if(!confirm('Переместить документ «'+(base.title||id)+'» в корзину?'))return;
  const before=siteCustomDocs.map(x=>x&&Object.assign({},x));
  upsertDocOverride(id,{active:false,archived:true,archivedAt:new Date().toISOString()});
  applyBaseDocOverrides();renderDocs();renderSiteAdminPanel();
  const ok=await saveSiteSettings({recordVersion:true,reason:'В корзину документ: '+(base.title||id)});
  if(!ok){siteCustomDocs=before;applyBaseDocOverrides();renderDocs();renderSiteAdminPanel();}
};
window.siteDocRestoreBase=async function(id){
  const base=baseDocs().find(x=>String(x.id)===String(id));if(!base)return;
  const before=siteCustomDocs.map(x=>x&&Object.assign({},x));
  upsertDocOverride(id,{active:false,archived:false});
  const idx=siteCustomDocs.findIndex(x=>x&&(String(x.id)===String(id)||String(x.sourceKey||'')===String(id)));if(idx>=0)delete siteCustomDocs[idx].archivedAt;
  applyBaseDocOverrides();renderDocs();renderSiteAdminPanel();
  const ok=await saveSiteSettings({recordVersion:true,reason:'Восстановлен документ из корзины: '+(base.title||id)});
  if(!ok){siteCustomDocs=before;applyBaseDocOverrides();renderDocs();renderSiteAdminPanel();}
}

function baseNavNodeByKey(key){return [...document.querySelectorAll('.header-nav .header-nav-link:not(.site-custom-nav-item)')].find(n=>baseNavKey(n)===key)||null}
function applyBaseNavOverrides(){
  baseNavItems().forEach(base=>{
    const node=baseNavNodeByKey(base.id);if(!node)return;
    if(!node.__cmsOriginalNav){
      node.__cmsOriginalNav={label:node.innerHTML,href:node.matches('a')?(node.getAttribute('href')||''):'',target:node.getAttribute('target')||'',rel:node.getAttribute('rel')||'',onclick:node.getAttribute('onclick')||''};
    }
    const orig=node.__cmsOriginalNav;
    node.innerHTML=orig.label;
    if(node.matches('a')){if(orig.href)node.setAttribute('href',orig.href);else node.removeAttribute('href');}
    if(orig.target)node.setAttribute('target',orig.target);else node.removeAttribute('target');
    if(orig.rel)node.setAttribute('rel',orig.rel);else node.removeAttribute('rel');
    node.onclick=null;if(orig.onclick)node.setAttribute('onclick',orig.onclick);else node.removeAttribute('onclick');
    node.classList.remove('site-admin-force-hidden','site-admin-preview-hidden');
    const ov=(siteCustomNavItems||[]).find(x=>x&&String(x.sourceKey||'')===String(base.id));
    if(!ov)return;
    if(ov.active===false||ov.archived===true){node.classList.add(siteAdminMode?'site-admin-preview-hidden':'site-admin-force-hidden');return;}
    if(ov.label!=null)node.textContent=ov.label;
    const href=safeCmsHref(ov.url);
    if(href){
      node.removeAttribute('onclick');node.onclick=null;
      if(node.matches('a'))node.setAttribute('href',href);
      else node.onclick=()=>{if(ov.newTab)window.open(href,'_blank','noopener');else location.href=href;};
      if(ov.newTab){node.setAttribute('target','_blank');node.setAttribute('rel','noopener noreferrer');}
      else{node.removeAttribute('target');node.removeAttribute('rel');}
    }
  });
}
function renderNav(){document.querySelectorAll('.site-custom-nav-item').forEach(n=>n.remove());const n=document.querySelector('.header-nav');if(!n)return;const b=n.querySelector('.header-nav-btn');(siteCustomNavItems||[]).forEach(x=>{if(!x||x.active===false||x.sourceKey||siteVisibility['nav-custom:'+x.id]===false)return;const href=safeCmsHref(x.url);if(!href)return;const a=document.createElement('a');a.className='header-nav-link site-custom-nav-item';a.textContent=x.label||'Новый пункт';a.href=href;a.dataset.siteNavId=x.id;if(x.newTab){a.target='_blank';a.rel='noopener noreferrer'}n.insertBefore(a,b||null)})}
function baseDocCardByKey(key){return [...document.querySelectorAll('[data-site-doc-grid] .doc-card:not(.site-custom-doc)')].find(card=>baseDocKey(card)===key)||null}
function applyBaseDocOverrides(){
  baseDocs().forEach(base=>{
    const card=baseDocCardByKey(base.id);if(!card)return;
    if(!card.__cmsOriginalDoc){
      const img=card.querySelector('img'),title=card.querySelector('h4'),subtitle=card.querySelector('p');
      card.__cmsOriginalDoc={title:title?.innerHTML||'',subtitle:subtitle?.innerHTML||'',src:img?.getAttribute('src')||'',deferred:img?.getAttribute('data-deferred-src')||'',onclick:card.getAttribute('onclick')||''};
    }
    const orig=card.__cmsOriginalDoc,img=card.querySelector('img'),title=card.querySelector('h4'),subtitle=card.querySelector('p');
    if(title)title.innerHTML=orig.title;if(subtitle)subtitle.innerHTML=orig.subtitle;
    if(img){if(orig.src)img.setAttribute('src',orig.src);if(orig.deferred)img.setAttribute('data-deferred-src',orig.deferred);else img.removeAttribute('data-deferred-src');}
    card.onclick=null;if(orig.onclick)card.setAttribute('onclick',orig.onclick);else card.removeAttribute('onclick');
    card.classList.remove('site-admin-force-hidden','site-admin-preview-hidden');
    const ov=(siteCustomDocs||[]).find(x=>x&&String(x.sourceKey||'')===String(base.id));
    if(!ov)return;
    if(ov.active===false||ov.archived===true){card.classList.add(siteAdminMode?'site-admin-preview-hidden':'site-admin-force-hidden');return;}
    if(title&&ov.title!=null)title.textContent=ov.title;
    if(subtitle&&ov.subtitle!=null)subtitle.textContent=ov.subtitle;
    const image=safeCmsMediaUrl(ov.image),href=safeCmsHref(ov.url);
    if(img&&image){img.setAttribute('src',image);img.removeAttribute('data-deferred-src');img.alt=ov.title||base.title||'';}
    if(href){
      card.removeAttribute('onclick');
      card.onclick=()=>{if(ov.newTab)window.open(href,'_blank','noopener');else location.href=href;};
    }else if(image&&typeof openDocLightbox==='function'){
      card.removeAttribute('onclick');
      card.onclick=()=>openDocLightbox(image,ov.title||base.title||'');
    }
  });
}
function renderDocs(){const g=document.querySelector('[data-site-doc-grid]');if(!g)return;g.querySelectorAll('.site-custom-doc').forEach(n=>n.remove());(siteCustomDocs||[]).forEach(x=>{if(!x||x.active===false||x.sourceKey||siteVisibility['doc-custom:'+x.id]===false)return;const href=safeCmsHref(x.url),image=safeCmsMediaUrl(x.image);const c=document.createElement(href?'a':'div');c.className='doc-card site-custom-doc';c.dataset.siteDocId=x.id;if(href)c.href=href;if(x.newTab&&href){c.target='_blank';c.rel='noopener noreferrer'}c.style.cssText='background:var(--bg-card);border:1px solid var(--border-glass);border-radius:22px;padding:20px;text-decoration:none;color:inherit;display:block';c.innerHTML=(image?'<img src="'+esc(image)+'" alt="'+esc(x.title||'')+'" style="width:100%;height:220px;object-fit:contain;margin-bottom:16px">':'')+'<h4 style="color:var(--text-main)">'+esc(x.title||'Документ')+'</h4><p style="color:var(--text-muted)">'+esc(x.subtitle||'')+'</p>';g.appendChild(c)})}
function renderBlocks(){document.querySelectorAll('.site-custom-info-block').forEach(n=>n.remove());(siteCustomBlocks||[]).forEach(x=>{if(!x||x.active===false||siteVisibility['block-custom:'+x.id]===false)return;const t=x.placement==='before-contacts'?document.querySelector('#contactsSection'):x.placement==='before-documents'?document.querySelector('.documents-section'):document.querySelector('.faq-container');if(!t||!t.parentNode)return;const href=safeCmsHref(x.url);const e=document.createElement('section');e.className='site-custom-info-block';e.dataset.siteBlockId=x.id;e.style.cssText='max-width:950px;margin:28px auto;padding:24px;border-radius:18px;border:1px solid var(--border-glass);background:var(--bg-card);position:relative;z-index:5';e.innerHTML='<h3 style="color:var(--text-main)">'+esc(x.title||'Информационный блок')+'</h3><div style="color:var(--text-muted);white-space:pre-line;line-height:1.7">'+esc(x.text||'')+'</div>'+(href?'<a href="'+esc(href)+'"'+(x.newTab?' target="_blank" rel="noopener noreferrer"':'')+' style="display:inline-flex;margin-top:14px;color:var(--ranepa-red);font-weight:800">'+esc(x.linkLabel||'Подробнее')+'</a>':'');t.parentNode.insertBefore(e,t)})}
async function save(ev){ev.preventDefault();if(!siteAdminMode)return;const d=Object.fromEntries(new FormData(ev.currentTarget).entries());let saved=false;
if(type==='schedule'){if(!d.program||!d.date||!d.subject)return siteAdminSetStatus('Укажите программу, дату и тему','err');const base=id?findSchedule(id):null,source=id&&(window.schedules||[]).some(x=>key(x)===id)?id:(base&&base.sourceKey)||'',rid=base&&String(base.id||'').startsWith('custom-s-')?base.id:uid('custom-s-'),r={...(base||{}),...d,id:rid,active:base&&base.active===false?false:true,custom:true};if(source)r.sourceKey=source;const before=siteCustomSchedules.slice(),p=siteCustomSchedules.findIndex(x=>x===base||x&&x.id===rid||source&&x&&x.sourceKey===source);p>=0?siteCustomSchedules[p]=r:siteCustomSchedules.push(r);saved=await saveSiteSettings({recordVersion:true,reason:'Изменено расписание'});if(!saved){siteCustomSchedules=before;return;}}
if(type==='nav'){const baseId=String(id||''),isBase=baseId.indexOf('base-nav:')===0;if(!d.label||(!isBase&&!d.url))return siteAdminSetStatus(isBase?'Укажите название':'Укажите название и ссылку','err');if(d.url&&!safeCmsHref(d.url))return siteAdminSetStatus('Недопустимая ссылка. Разрешены http, https, mailto, tel и внутренние ссылки.','err');const rid=isBase?baseId:(id||uid('custom-nav-')),prev=findNav(rid)||{},r={...prev,...d,id:rid,active:prev.active===false?false:true,newTab:d.newTab==='yes'};if(isBase)r.sourceKey=rid;const before=siteCustomNavItems.slice(),p=siteCustomNavItems.findIndex(x=>x&&(String(x.id)===String(rid)||String(x.sourceKey||'')===String(rid)));p>=0?siteCustomNavItems[p]=r:siteCustomNavItems.push(r);applyBaseNavOverrides();renderNav();saved=await saveSiteSettings({recordVersion:true,reason:'Изменено меню'});if(!saved){siteCustomNavItems=before;applyBaseNavOverrides();renderNav();return;}}
if(type==='doc'){if(!d.title)return siteAdminSetStatus('Укажите название документа','err');if(d.url&&!safeCmsHref(d.url))return siteAdminSetStatus('Недопустимая ссылка документа.','err');if(d.image&&!safeCmsMediaUrl(d.image))return siteAdminSetStatus('Недопустимый адрес изображения.','err');const baseId=String(id||''),isBase=baseId.indexOf('base-doc:')===0,rid=isBase?baseId:(id||uid('custom-doc-')),prev=findDoc(rid)||{},r={...prev,...d,id:rid,active:prev.active===false?false:true,newTab:d.newTab==='yes'};if(isBase)r.sourceKey=rid;const before=siteCustomDocs.slice(),p=siteCustomDocs.findIndex(x=>x&&(String(x.id)===String(rid)||String(x.sourceKey||'')===String(rid)));p>=0?siteCustomDocs[p]=r:siteCustomDocs.push(r);applyBaseDocOverrides();renderDocs();saved=await saveSiteSettings({recordVersion:true,reason:'Изменены документы'});if(!saved){siteCustomDocs=before;applyBaseDocOverrides();renderDocs();return;}}
if(type==='block'){if(!d.title&&!d.text)return siteAdminSetStatus('Заполните заголовок или текст','err');if(d.url&&!safeCmsHref(d.url))return siteAdminSetStatus('Недопустимая ссылка блока.','err');const rid=id||uid('custom-block-'),prev=findBlock(rid)||{},r={...prev,...d,id:rid,active:prev.active===false?false:true,newTab:d.newTab==='yes'},before=siteCustomBlocks.slice(),p=siteCustomBlocks.findIndex(x=>x&&x.id===rid);p>=0?siteCustomBlocks[p]=r:siteCustomBlocks.push(r);renderBlocks();saved=await saveSiteSettings({recordVersion:true,reason:'Изменён информационный блок'});if(!saved){siteCustomBlocks=before;renderBlocks();return;}}
if(saved){close();renderSiteAdminPanel();}}
window.deleteSiteCustomNav=async i=>{if(typeof siteWorkflowDelete==='function')return siteWorkflowDelete('nav',i);const x=findNav(i);if(x&&confirm('Переместить пункт меню в корзину?')){x.active=false;x.archived=true;x.archivedAt=new Date().toISOString();renderNav();await saveSiteSettings({recordVersion:true,reason:'В корзину: '+(x.label||i)});renderSiteAdminPanel()}};
window.deleteSiteCustomDoc=async i=>{if(typeof siteWorkflowDelete==='function')return siteWorkflowDelete('docs',i);const x=findDoc(i);if(x&&confirm('Переместить документ в корзину?')){x.active=false;x.archived=true;x.archivedAt=new Date().toISOString();renderDocs();await saveSiteSettings({recordVersion:true,reason:'В корзину: '+(x.title||i)});renderSiteAdminPanel()}};
window.deleteSiteCustomBlock=async i=>{if(typeof siteWorkflowDelete==='function')return siteWorkflowDelete('blocks',i);const x=findBlock(i);if(x&&confirm('Переместить блок в корзину?')){x.active=false;x.archived=true;x.archivedAt=new Date().toISOString();renderBlocks();await saveSiteSettings({recordVersion:true,reason:'В корзину: '+(x.title||i)});renderSiteAdminPanel()}};
if(typeof getVisibleSchedules==='function'){const base=getVisibleSchedules;getVisibleSchedules=x=>base(merge(x,siteCustomSchedules||[]))}
const pa=applySiteCustomContent;applySiteCustomContent=function(){pa();applyBaseNavOverrides();renderNav();applyBaseDocOverrides();renderDocs();renderBlocks()};
function groups(){
  const baseRows=(window.schedules||[]).map(x=>{
    const sid=key(x),ov=scheduleOverrideByKey(sid),arch=!!(ov&&ov.archived===true),draft=!!(ov&&ov.active===false&&!arch);
    const title=esc([x.date,x.time,x.program,x.subject].filter(Boolean).join(' · '));
    return '<div class="site-admin-row"><span>'+title+(arch?' · В КОРЗИНЕ':draft?' · ЧЕРНОВИК':'')+'</span></div>'+
      '<div class="site-admin-entity-actions">'+
      (arch?'<button type="button" onclick="siteScheduleRestoreBase(\''+esc(sid)+'\')">Восстановить</button>':
        '<button type="button" onclick="siteScheduleSetPublished(\''+esc(sid)+'\','+(draft?'true':'false')+')">'+(draft?'Опубликовать':'В черновик')+'</button>'+
        '<button type="button" onclick="siteScheduleDuplicateAny(\''+esc(sid)+'\')">Дублировать</button>'+
        '<button type="button" onclick="openSiteScheduleEditor(\''+esc(sid)+'\')">Редактировать</button>'+
        '<button type="button" class="danger" onclick="siteScheduleArchiveAny(\''+esc(sid)+'\')">В корзину</button>')+
      '</div>';
  }).join('');
  const manualRows=(siteCustomSchedules||[]).filter(x=>x&&!x.sourceKey&&x.archived!==true).map(x=>{
    const title=esc([x.date,x.time,x.program,x.subject].filter(Boolean).join(' · '));
    const draft=x.active===false;
    return '<div class="site-admin-row"><span>'+title+(draft?' · ЧЕРНОВИК':'')+'</span></div>'+
      '<div class="site-admin-entity-actions">'+
      '<button type="button" onclick="siteScheduleSetPublished(\''+esc(x.id)+'\','+(draft?'true':'false')+')">'+(draft?'Опубликовать':'В черновик')+'</button>'+
      '<button type="button" onclick="siteScheduleDuplicateAny(\''+esc(x.id)+'\')">Дублировать</button>'+
      '<button type="button" onclick="openSiteScheduleEditor(\''+esc(x.id)+'\')">Редактировать</button>'+
      '<button type="button" class="danger" onclick="siteScheduleArchiveAny(\''+esc(x.id)+'\')">В корзину</button></div>';
  }).join('');
  const nav=(siteCustomNavItems||[]).map(x=>'<div class="site-admin-row"><span>'+esc(x.label||'')+'</span></div><div class="site-admin-entity-actions"><button type="button" onclick="openSiteNavEditor(\''+esc(x.id)+'\')">Редактировать</button><button type="button" class="danger" onclick="deleteSiteCustomNav(\''+esc(x.id)+'\')">Удалить</button></div>').join('');
  const docs=docCatalogForAdmin().map(x=>{
    const isBase=String(x.id||'').indexOf('base-doc:')===0,draft=x.active===false&&x.archived!==true,arch=x.archived===true;
    return '<div class="site-admin-row"><span>'+esc(x.title||x.id)+(arch?' · В КОРЗИНЕ':draft?' · ЧЕРНОВИК':'')+'</span></div>'+
      '<div class="site-admin-entity-actions">'+
      (arch?(isBase?'<button type="button" onclick="siteDocRestoreBase(\''+esc(x.id)+'\')">Восстановить</button>':'<button type="button" onclick="siteWorkflowRestore(\'docs\',\''+esc(x.id)+'\')">Восстановить</button>'):
        '<button type="button" onclick="siteDocSetPublished(\''+esc(x.id)+'\','+(draft?'true':'false')+')">'+(draft?'Опубликовать':'В черновик')+'</button>'+
        '<button type="button" onclick="siteDocDuplicateAny(\''+esc(x.id)+'\')">Дублировать</button>'+
        '<button type="button" onclick="openSiteDocEditor(\''+esc(x.id)+'\')">Редактировать</button>'+
        '<button type="button" class="danger" onclick="siteDocArchiveAny(\''+esc(x.id)+'\')">В корзину</button>')+
      '</div>';
  }).join('');
  const blocks=(siteCustomBlocks||[]).map(x=>'<div class="site-admin-row"><span>'+esc(x.title||'')+'</span></div><div class="site-admin-entity-actions"><button type="button" onclick="openSiteBlockEditor(\''+esc(x.id)+'\')">Редактировать</button><button type="button" class="danger" onclick="deleteSiteCustomBlock(\''+esc(x.id)+'\')">Удалить</button></div>').join('');
  return '<details class="site-admin-group"><summary>Расписание</summary><button class="site-admin-entity-add" type="button" onclick="openSiteScheduleEditor()">＋ Добавить занятие</button>'+baseRows+manualRows+'</details>'+
    '<details class="site-admin-group"><summary>Меню</summary><button class="site-admin-entity-add" type="button" onclick="openSiteNavEditor()">＋ Добавить пункт меню</button>'+nav+'</details>'+
    '<details class="site-admin-group"><summary>Документы</summary><button class="site-admin-entity-add" type="button" onclick="openSiteDocEditor()">＋ Добавить документ</button>'+docs+'</details>'+
    '<details class="site-admin-group"><summary>Информационные блоки</summary><button class="site-admin-entity-add" type="button" onclick="openSiteBlockEditor()">＋ Добавить блок</button>'+blocks+'</details>';
}
const pr=renderSiteAdminPanel;renderSiteAdminPanel=function(){pr();const b=document.getElementById('siteAdminControls');if(b)b.insertAdjacentHTML('beforeend',groups())};
renderNav();renderDocs();renderBlocks();
})();