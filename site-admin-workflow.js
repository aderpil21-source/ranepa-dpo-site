(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isBaseProgramOverride=x=>!!(x&&Array.isArray(basePrograms)&&basePrograms.some(b=>b&&String(b.id)===String(x.id)));
const splitSet=(allKey,incoming,isFixed)=>{const current=allKey(),fixed=current.filter(isFixed);return [...fixed,...incoming];};
const defs={
  programs:{label:'Программы — созданные в PRO',get:()=>siteCustomPrograms.filter(x=>x&&!isBaseProgramOverride(x)),set:v=>{siteCustomPrograms=splitSet(()=>siteCustomPrograms,v,isBaseProgramOverride)},title:x=>x.title_ru||x.id,prefix:'custom-p-',edit:id=>openSiteProgramEditor(id)},
  contacts:{label:'Контакты — созданные в PRO',get:()=>siteCustomContacts.filter(x=>x&&!x.sourceKey),set:v=>{siteCustomContacts=splitSet(()=>siteCustomContacts,v,x=>x&&x.sourceKey)},title:x=>x.name||x.position||x.id,prefix:'custom-c-',edit:id=>openSiteContactEditor(id)},
  faq:{label:'FAQ — созданные в PRO',get:()=>siteCustomFaqs.filter(x=>x&&!x.sourceKey),set:v=>{siteCustomFaqs=splitSet(()=>siteCustomFaqs,v,x=>x&&x.sourceKey)},title:x=>x.question||x.id,prefix:'custom-faq-',edit:id=>openSiteFaqEditor(id)},
  schedule:{label:'Расписание — добавленные вручную',get:()=>siteCustomSchedules.filter(x=>x&&!x.sourceKey),set:v=>{siteCustomSchedules=splitSet(()=>siteCustomSchedules,v,x=>x&&x.sourceKey)},title:x=>[x.date,x.time,x.program,x.subject].filter(Boolean).join(' · ')||x.id,prefix:'custom-s-',edit:id=>openSiteScheduleEditor(id)},
  nav:{label:'Меню — созданное в PRO',get:()=>siteCustomNavItems.filter(x=>x&&!x.sourceKey),set:v=>{siteCustomNavItems=splitSet(()=>siteCustomNavItems,v,x=>x&&x.sourceKey)},title:x=>x.label||x.url||x.id,prefix:'custom-nav-',edit:id=>openSiteNavEditor(id)},
  docs:{label:'Документы — созданные в PRO',get:()=>siteCustomDocs.filter(x=>x&&!x.sourceKey),set:v=>{siteCustomDocs=splitSet(()=>siteCustomDocs,v,x=>x&&x.sourceKey)},title:x=>x.title||x.id,prefix:'custom-doc-',edit:id=>openSiteDocEditor(id)},
  blocks:{label:'Информационные блоки',get:()=>siteCustomBlocks,set:v=>siteCustomBlocks=v,title:x=>x.title||x.id,prefix:'custom-block-',edit:id=>openSiteBlockEditor(id)}
};
const uid=p=>p+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
let previewDrafts=false;
let previewModal=null;
function ensurePreviewModal(){
  if(previewModal)return previewModal;
  previewModal=document.createElement('div');
  previewModal.className='cms-preview-modal';
  previewModal.id='cmsPreviewModal';
  previewModal.innerHTML='<div class="cms-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="cmsPreviewTitle"><div class="cms-preview-head"><div><small>Предпросмотр черновика</small><h3 id="cmsPreviewTitle">Предпросмотр</h3></div><button type="button" class="cms-preview-close" aria-label="Закрыть">×</button></div><div id="cmsPreviewBody" class="cms-preview-body"></div></div>';
  document.body.appendChild(previewModal);
  previewModal.querySelector('.cms-preview-close').onclick=()=>previewModal.classList.remove('active');
  previewModal.addEventListener('click',e=>{if(e.target===previewModal)previewModal.classList.remove('active');});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&previewModal.classList.contains('active'))previewModal.classList.remove('active');});
  return previewModal;
}
function previewMarkup(type,x){
  if(type==='programs')return '<article class="cms-preview-card"><div class="cms-preview-meta">'+esc(x.type||'Программа')+' · '+esc(x.hours||'')+'</div><h4>'+esc(x.title_ru||'Без названия')+'</h4><p>'+esc(x.desc_ru||'')+'</p><div class="cms-preview-tags">'+[x.format,x.dates,x.price].filter(Boolean).map(v=>'<span>'+esc(v)+'</span>').join('')+'</div></article>';
  if(type==='contacts')return '<article class="cms-preview-card"><h4>'+esc(x.name||'Контакт')+'</h4><p><b>'+esc(x.position||'')+'</b></p><p>'+esc(x.department||'')+'</p><p>'+[x.office,x.phone,x.extension,x.email].filter(Boolean).map(esc).join(' · ')+'</p></article>';
  if(type==='faq')return '<article class="cms-preview-card"><h4>'+esc(x.question||'Вопрос')+'</h4><p>'+esc(x.answer||'')+'</p></article>';
  if(type==='schedule')return '<article class="cms-preview-card"><h4>'+esc(x.program||'Занятие')+'</h4><p>'+[x.date,x.time].filter(Boolean).map(esc).join(' · ')+'</p><p>'+esc(x.subject||'')+'</p><p>'+[x.teacher,x.room].filter(Boolean).map(esc).join(' · ')+'</p></article>';
  if(type==='nav')return '<article class="cms-preview-nav"><span>'+esc(x.label||'Пункт меню')+'</span><small>'+esc(x.url||'встроенное действие')+'</small></article>';
  if(type==='docs')return '<article class="cms-preview-card">'+(x.image?'<img src="'+esc(x.image)+'" alt="">':'')+'<h4>'+esc(x.title||'Документ')+'</h4><p>'+esc(x.subtitle||'')+'</p></article>';
  if(type==='blocks')return '<article class="cms-preview-card"><h4>'+esc(x.title||'Информационный блок')+'</h4><p class="cms-preview-pre">'+esc(x.text||'')+'</p>'+(x.linkLabel?'<div class="cms-preview-link">'+esc(x.linkLabel)+'</div>':'')+'</article>';
  return '<pre>'+esc(JSON.stringify(x,null,2))+'</pre>';
}
window.siteWorkflowPreview=function(type,id){
  const d=defs[type];if(!d)return;
  const x=d.get().find(y=>y&&String(y.id)===String(id));if(!x)return;
  const m=ensurePreviewModal();
  m.querySelector('#cmsPreviewTitle').textContent=d.title(x);
  m.querySelector('#cmsPreviewBody').innerHTML=previewMarkup(type,x);
  m.classList.add('active');
};
window.siteWorkflowBulk=async function(type,action){
  const d=defs[type];if(!d)return;
  const selected=[...document.querySelectorAll('.cms-flow-select[data-type="'+type+'"]:checked')].map(x=>x.value);
  if(!selected.length)return;
  const ids=new Set(selected),arr=d.get().slice();
  if(action==='publish' && typeof siteCmsValidateEntity==='function'){
    const invalid=arr.filter(x=>ids.has(String(x.id))).map(x=>({x,r:siteCmsValidateEntity(type,x)})).filter(v=>v.r&&v.r.errors&&v.r.errors.length);
    if(invalid.length){
      siteAdminSetStatus('Публикация остановлена: исправьте ошибки в выбранных записях','err');
      if(typeof openSiteDiagnostics==='function') openSiteDiagnostics();
      return;
    }
  }
  const before=arr.slice();
  const next=arr.map(x=>ids.has(String(x.id))?Object.assign({},x,{active:action==='publish'}):x);
  d.set(next);
  await save((action==='publish'?'Массовая публикация: ':'Массово в черновик: ')+d.label,()=>d.set(before));
};
window.siteWorkflowToggleDraftPreview=function(){
  previewDrafts=!previewDrafts;
  document.body.classList.toggle('cms-preview-drafts',previewDrafts);
  renderDraftPreview();
  panel();
};
function refresh(){if(typeof applySiteCustomContent==='function')applySiteCustomContent();else renderSiteAdminPanel();renderDraftPreview();}

function normalizeOrder(type,arr){
  if(type==='programs') return arr.map((x,i)=>Object.assign({},x,{cmsOrder:i}));
  return arr;
}
async function save(reason,rollback){refresh();const ok=await saveSiteSettings({recordVersion:true,reason});if(!ok&&typeof rollback==='function'){rollback();refresh();}return !!ok;}
window.siteWorkflowDuplicate=async function(type,id){
  const d=defs[type];if(!d)return;const arr=d.get(),src=arr.find(x=>x&&String(x.id)===String(id));if(!src)return;
  const before=arr.slice();const copy=JSON.parse(JSON.stringify(src));copy.id=uid(d.prefix);copy.custom=true;copy.active=false;
  if(type==='programs')copy.title_ru=(copy.title_ru||'Программа')+' — копия';
  else if(type==='contacts')copy.name=(copy.name||'Контакт')+' — копия';
  else if(type==='faq')copy.question=(copy.question||'Вопрос')+' — копия';
  else if(type==='nav')copy.label=(copy.label||'Пункт')+' — копия';
  else if(type==='docs')copy.title=(copy.title||'Документ')+' — копия';
  else if(type==='blocks')copy.title=(copy.title||'Блок')+' — копия';
  d.set([...arr,copy]);if(await save('Создана копия: '+d.title(copy),()=>d.set(before)))d.edit(copy.id);
};
window.siteWorkflowTogglePublish=async function(type,id){
  const d=defs[type];if(!d)return;const arr=d.get().slice(),i=arr.findIndex(x=>x&&String(x.id)===String(id));if(i<0)return;
  const willPublish=arr[i].active===false;
  if(willPublish && typeof siteCmsValidateEntity==='function'){
    const result=siteCmsValidateEntity(type,arr[i]);
    if(result&&result.errors&&result.errors.length){
      siteAdminSetStatus('Нельзя опубликовать: '+result.errors[0],'err');
      if(typeof openSiteDiagnostics==='function') openSiteDiagnostics();
      return;
    }
  }
  const before=d.get().slice();arr[i]={...arr[i],active:willPublish};d.set(arr);await save((arr[i].active===false?'Черновик: ':'Опубликовано: ')+d.title(arr[i]),()=>d.set(before));
};
window.siteWorkflowMove=async function(type,id,dir){
  const d=defs[type];if(!d)return;const arr=d.get().slice(),i=arr.findIndex(x=>x&&String(x.id)===String(id)),j=i+Number(dir);
  if(i<0||j<0||j>=arr.length)return;const before=d.get().slice();[arr[i],arr[j]]=[arr[j],arr[i]];d.set(normalizeOrder(type,arr));await save('Изменён порядок: '+d.label,()=>d.set(before));
};
window.siteWorkflowDelete=async function(type,id){
  const d=defs[type];if(!d)return;const arr=d.get().slice(),i=arr.findIndex(y=>y&&String(y.id)===String(id));if(i<0)return;
  const x=arr[i];if(!confirm('Переместить «'+d.title(x)+'» в корзину?'))return;
  const before=d.get().slice();
  arr[i]=Object.assign({},x,{active:false,archived:true,archivedAt:new Date().toISOString()});
  d.set(arr);await save('В корзину: '+d.title(arr[i]),()=>d.set(before));
};
window.siteWorkflowRestore=async function(type,id){
  const d=defs[type];if(!d)return;const arr=d.get().slice(),i=arr.findIndex(y=>y&&String(y.id)===String(id));if(i<0)return;
  const before=d.get().slice();
  arr[i]=Object.assign({},arr[i],{active:false,archived:false});
  delete arr[i].archivedAt;
  d.set(arr);await save('Восстановлено из корзины: '+d.title(arr[i]),()=>d.set(before));
};
window.siteWorkflowDestroy=async function(type,id){
  const d=defs[type];if(!d)return;const arr=d.get(),x=arr.find(y=>y&&String(y.id)===String(id));if(!x)return;
  if(!confirm('Удалить «'+d.title(x)+'» навсегда? Это действие нельзя отменить кроме восстановления предыдущей версии сайта.'))return;
  const before=arr.slice();d.set(arr.filter(y=>y!==x));await save('Удалено навсегда: '+d.title(x),()=>d.set(before));
};

function row(type,x,index,total){
  const d=defs[type],draft=x.active===false;
  return '<div class="cms-flow-row" draggable="true" data-flow-type="'+esc(type)+'" data-flow-id="'+esc(x.id)+'" data-flow-search="'+esc((d.title(x)+' '+d.label).toLowerCase())+'">'+
    '<span class="cms-flow-grip" title="Изменить порядок">⋮⋮</span>'+
    '<input class="cms-flow-select" data-type="'+esc(type)+'" type="checkbox" value="'+esc(x.id)+'" aria-label="Выбрать">'+
    '<div class="cms-flow-name"><b>'+esc(d.title(x))+'</b><small>'+(draft?'Черновик':'Опубликовано')+'</small></div>'+
    '<div class="cms-flow-actions">'+
      '<button type="button" '+(index===0?'disabled':'')+' onclick="siteWorkflowMove(\''+type+'\',\''+esc(x.id)+'\',-1)">↑</button>'+
      '<button type="button" '+(index===total-1?'disabled':'')+' onclick="siteWorkflowMove(\''+type+'\',\''+esc(x.id)+'\',1)">↓</button>'+
      '<button type="button" onclick="siteWorkflowPreview(\''+type+'\',\''+esc(x.id)+'\')">Предпросмотр</button>'+
      '<button type="button" onclick="siteWorkflowTogglePublish(\''+type+'\',\''+esc(x.id)+'\')">'+(draft?'Опубликовать':'В черновик')+'</button>'+
      '<button type="button" onclick="siteWorkflowDuplicate(\''+type+'\',\''+esc(x.id)+'\')">Дублировать</button>'+
      '<button type="button" onclick="defsShimEdit(\''+type+'\',\''+esc(x.id)+'\')">Изменить</button>'+
      '<button type="button" class="danger" onclick="siteWorkflowDelete(\''+type+'\',\''+esc(x.id)+'\')">Удалить</button>'+
    '</div></div>';
}
window.defsShimEdit=function(type,id){const d=defs[type];if(d)d.edit(id);};

function renderDraftPreview(){
  document.querySelectorAll('.cms-draft-preview').forEach(n=>n.remove());
  if(!siteAdminMode||!previewDrafts)return;
  const add=(container,title,type)=>{
    if(!container)return;
    const box=document.createElement('div');
    box.className='cms-draft-preview';
    box.innerHTML='<div class="cms-draft-preview-label">Черновик · '+esc(type)+'</div><div class="cms-draft-preview-title">'+esc(title)+'</div>';
    container.appendChild(box);
  };
  (siteCustomPrograms||[]).filter(x=>x&&x.active===false&&x.archived!==true).forEach(x=>add(document.querySelector('#programsSection .cards-grid, #programsSection'),' '+(x.title_ru||x.id),'Программа'));
  (siteCustomContacts||[]).filter(x=>x&&x.active===false&&x.archived!==true).forEach(x=>add(document.querySelector('#contactsSection .contacts-grid:last-of-type, #contactsSection'),x.name||x.id,'Контакт'));
  (siteCustomFaqs||[]).filter(x=>x&&x.active===false&&x.archived!==true).forEach(x=>add(document.querySelector('.faq-container'),x.question||x.id,'FAQ'));
  (siteCustomDocs||[]).filter(x=>x&&x.active===false&&x.archived!==true).forEach(x=>add(document.querySelector('[data-site-doc-grid]'),x.title||x.id,'Документ'));
  (siteCustomBlocks||[]).filter(x=>x&&x.active===false&&x.archived!==true).forEach(x=>add(document.querySelector('.faq-container'),x.title||x.id,'Блок'));
}
function panel(){
  let el=document.getElementById('siteAdminWorkflow');
  if(!el){el=document.createElement('section');el.id='siteAdminWorkflow';el.className='cms-flow';const box=document.getElementById('siteAdminControls');if(!box)return;box.prepend(el);}
  let html='<div class="cms-flow-head"><div><b>Управление контентом</b><small>Порядок · черновики · копии</small></div><div class="cms-flow-head-actions"><button type="button" class="'+(previewDrafts?'active':'')+'" onclick="siteWorkflowToggleDraftPreview()">👁 Черновики</button><input id="cmsFlowSearch" type="search" placeholder="Поиск в PRO…"></div></div>';
  Object.entries(defs).forEach(([type,d])=>{
    const arr=d.get().filter(x=>x&&x.archived!==true);if(!arr.length)return;
    html+='<details class="cms-flow-group" open><summary>'+esc(d.label)+' <small>'+arr.length+'</small></summary>'+
      '<div class="cms-flow-bulk"><button type="button" onclick="siteWorkflowBulk(\''+type+'\',\'publish\')">Опубликовать выбранные</button><button type="button" onclick="siteWorkflowBulk(\''+type+'\',\'draft\')">В черновики</button></div>'+
      arr.map((x,i)=>row(type,x,i,arr.length)).join('')+'</details>';
  });
  const trash=[];
  Object.entries(defs).forEach(([type,d])=>{
    d.get().filter(x=>x&&x.archived===true).forEach(x=>trash.push({type,d,x}));
  });
  if(trash.length){
    html+='<details class="cms-flow-group cms-trash-group"><summary>🗑 Корзина <small>'+trash.length+'</small></summary>'+
      trash.map(({type,d,x})=>'<div class="cms-flow-row cms-trash-row" data-flow-search="'+esc((d.title(x)+' корзина '+d.label).toLowerCase())+'">'+
        '<span class="cms-flow-grip">×</span><span></span><div class="cms-flow-name"><b>'+esc(d.title(x))+'</b><small>'+esc(d.label)+'</small></div>'+
        '<div class="cms-flow-actions"><button type="button" onclick="siteWorkflowRestore(\''+type+'\',\''+esc(x.id)+'\')">Восстановить</button>'+
        '<button type="button" class="danger" onclick="siteWorkflowDestroy(\''+type+'\',\''+esc(x.id)+'\')">Удалить навсегда</button></div></div>').join('')+
      '</details>';
  }
  el.innerHTML=html;
  const q=el.querySelector('#cmsFlowSearch');q?.addEventListener('input',()=>{const s=q.value.trim().toLowerCase();el.querySelectorAll('.cms-flow-row').forEach(r=>r.hidden=!!s&&!r.dataset.flowSearch.includes(s));});
  bindDrag(el);
}
let dragState=null;
function clearDragMarks(root){
  root.querySelectorAll('.cms-flow-row').forEach(r=>r.classList.remove('dragging','drop-before','drop-after'));
}
function bindDrag(root){
  root.querySelectorAll('.cms-flow-row').forEach(row=>{
    row.addEventListener('dragstart',e=>{
      dragState={type:row.dataset.flowType,id:row.dataset.flowId};
      row.classList.add('dragging');
      if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragState.type+':'+dragState.id);}
    });
    row.addEventListener('dragend',()=>{clearDragMarks(root);dragState=null;});
    row.addEventListener('dragover',e=>{
      if(!dragState||dragState.type!==row.dataset.flowType||dragState.id===row.dataset.flowId)return;
      e.preventDefault();
      clearDragMarks(root);
      row.classList.add((e.clientY-row.getBoundingClientRect().top)<row.offsetHeight/2?'drop-before':'drop-after');
    });
    row.addEventListener('drop',async e=>{
      if(!dragState||dragState.type!==row.dataset.flowType||dragState.id===row.dataset.flowId)return;
      e.preventDefault();
      const type=dragState.type,d=defs[type],arr=d.get().slice();
      const from=arr.findIndex(x=>x&&String(x.id)===String(dragState.id));
      let to=arr.findIndex(x=>x&&String(x.id)===String(row.dataset.flowId));
      if(from<0||to<0)return;
      const after=row.classList.contains('drop-after');
      const [item]=arr.splice(from,1);
      if(from<to)to--;
      if(after)to++;
      arr.splice(Math.max(0,Math.min(to,arr.length)),0,item);
      const before=d.get().slice();
      d.set(normalizeOrder(type,arr));
      clearDragMarks(root);dragState=null;
      await save('Изменён порядок drag-and-drop: '+d.label,()=>d.set(before));
    });
  });
}
function styles(){
  if(document.getElementById('cmsFlowStyles'))return;const s=document.createElement('style');s.id='cmsFlowStyles';s.textContent=`
.cms-flow{margin:10px 0 14px;border:1px solid rgba(202,15,62,.32);border-radius:12px;overflow:hidden;background:rgba(8,13,23,.92)}
.cms-flow-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px;background:rgba(202,15,62,.08);border-bottom:1px solid rgba(255,255,255,.08)}
.cms-flow-head>div:first-child{display:flex;flex-direction:column;gap:2px}.cms-flow-head b{font-size:.78rem}.cms-flow-head small,.cms-flow-name small{font-size:.62rem;color:#94a3b8}
.cms-flow-head-actions{display:flex;align-items:center;gap:6px;min-width:0}.cms-flow-head-actions button,.cms-flow-bulk button{border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.055);color:#e5e7eb;border-radius:7px;padding:6px 8px;font-size:.61rem;font-weight:800;cursor:pointer}.cms-flow-head-actions button.active{background:rgba(56,189,248,.16);border-color:rgba(56,189,248,.45);color:#bae6fd}
.cms-flow-head input{min-width:0;width:180px;border:1px solid rgba(255,255,255,.12);background:#0b1220;color:#fff;border-radius:8px;padding:7px 9px;font-size:.7rem}
.cms-flow-group{border-bottom:1px solid rgba(255,255,255,.06)}.cms-flow-group>summary{padding:9px 10px;font-size:.72rem;font-weight:850;cursor:pointer}
.cms-flow-bulk{display:flex;gap:5px;padding:6px 9px;border-top:1px solid rgba(255,255,255,.04)}
.cms-flow-row{display:grid;grid-template-columns:24px 18px minmax(0,1fr);gap:7px;padding:8px 9px;border-top:1px solid rgba(255,255,255,.055);transition:opacity .16s ease,background .16s ease,box-shadow .16s ease}
.cms-flow-row.dragging{opacity:.42}.cms-flow-row.drop-before{box-shadow:inset 0 2px 0 #38bdf8}.cms-flow-row.drop-after{box-shadow:inset 0 -2px 0 #38bdf8}
 .cms-flow-grip{grid-row:1/3;display:grid;place-items:center;color:#64748b;font-size:.9rem;cursor:grab}.cms-flow-row:active .cms-flow-grip{cursor:grabbing}.cms-flow-name{display:flex;flex-direction:column;gap:2px;min-width:0}.cms-flow-name b{font-size:.69rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cms-flow-select{align-self:center;accent-color:#ca0f3e}.cms-flow-name{grid-column:3}.cms-flow-actions{grid-column:3;display:flex;flex-wrap:wrap;gap:4px}.cms-flow-actions button{border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.055);color:#e5e7eb;border-radius:7px;padding:5px 7px;font-size:.6rem;font-weight:800;cursor:pointer}.cms-flow-actions button:disabled{opacity:.3;cursor:default}.cms-flow-actions .danger{color:#fecdd3;border-color:rgba(202,15,62,.3)}
.cms-draft-preview{position:relative;border:1px dashed rgba(148,163,184,.45);background:rgba(100,116,139,.10);border-radius:14px;padding:14px;opacity:.72;filter:saturate(.65);pointer-events:none}
.cms-draft-preview-label{font-size:.62rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:5px}
.cms-draft-preview-title{font-size:.82rem;font-weight:800;color:var(--text-main,#e5e7eb)}
.cms-preview-modal{position:fixed;inset:0;z-index:30180;display:none;place-items:center;padding:18px;background:rgba(2,6,15,.82);backdrop-filter:blur(12px)}.cms-preview-modal.active{display:grid}.cms-preview-dialog{width:min(760px,100%);max-height:92vh;overflow:auto;border:1px solid rgba(56,189,248,.38);border-radius:20px;background:var(--bg-deep,#0b1220);color:var(--text-main,#fff);box-shadow:0 30px 90px rgba(0,0,0,.58);padding:20px}.cms-preview-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px}.cms-preview-head small{display:block;color:#94a3b8;font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.cms-preview-head h3{margin:3px 0 0;font-size:1.05rem}.cms-preview-close{width:36px;height:36px;border-radius:10px;border:1px solid var(--border-glass,rgba(255,255,255,.12));background:var(--btn-glass,rgba(255,255,255,.06));color:var(--text-main,#fff);font-size:1.25rem;cursor:pointer}.cms-preview-body{padding:4px}.cms-preview-card{border:1px solid var(--border-glass,rgba(255,255,255,.1));border-radius:18px;padding:22px;background:var(--bg-card,#111827);box-shadow:0 18px 45px rgba(0,0,0,.22)}.cms-preview-card h4{margin:0 0 10px;font-size:1.1rem}.cms-preview-card p{margin:6px 0;color:var(--text-muted,#94a3b8);line-height:1.6}.cms-preview-card img{display:block;width:100%;max-height:360px;object-fit:contain;border-radius:12px;margin-bottom:16px}.cms-preview-meta{font-size:.7rem;font-weight:850;color:#38bdf8;margin-bottom:8px}.cms-preview-tags{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}.cms-preview-tags span,.cms-preview-link{display:inline-flex;padding:6px 9px;border-radius:999px;background:rgba(202,15,62,.13);border:1px solid rgba(202,15,62,.28);font-size:.68rem;font-weight:800}.cms-preview-pre{white-space:pre-line}.cms-preview-nav{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border-radius:12px;background:var(--bg-card,#111827);border:1px solid var(--border-glass,rgba(255,255,255,.1));font-weight:850}.cms-preview-nav small{color:var(--text-muted,#94a3b8)}
`;document.head.appendChild(s);
}
const old=renderSiteAdminPanel;renderSiteAdminPanel=function(){old();panel();};
styles();if(siteAdminMode)panel();
})();