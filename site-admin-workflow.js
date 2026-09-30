(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defs={
  programs:{label:'Программы',get:()=>siteCustomPrograms,set:v=>siteCustomPrograms=v,title:x=>x.title_ru||x.id,prefix:'custom-p-',edit:id=>openSiteProgramEditor(id)},
  contacts:{label:'Контакты',get:()=>siteCustomContacts,set:v=>siteCustomContacts=v,title:x=>x.name||x.position||x.id,prefix:'custom-c-',edit:id=>openSiteContactEditor(id)},
  faq:{label:'FAQ',get:()=>siteCustomFaqs,set:v=>siteCustomFaqs=v,title:x=>x.question||x.id,prefix:'custom-faq-',edit:id=>openSiteFaqEditor(id)},
  schedule:{label:'Расписание — добавленные вручную',get:()=>siteCustomSchedules.filter(x=>x&&!x.sourceKey),set:v=>{const fixed=siteCustomSchedules.filter(x=>x&&x.sourceKey);siteCustomSchedules=[...fixed,...v]},title:x=>[x.date,x.time,x.program,x.subject].filter(Boolean).join(' · ')||x.id,prefix:'custom-s-',edit:id=>openSiteScheduleEditor(id)},
  nav:{label:'Меню',get:()=>siteCustomNavItems,set:v=>siteCustomNavItems=v,title:x=>x.label||x.url||x.id,prefix:'custom-nav-',edit:id=>openSiteNavEditor(id)},
  docs:{label:'Документы',get:()=>siteCustomDocs,set:v=>siteCustomDocs=v,title:x=>x.title||x.id,prefix:'custom-doc-',edit:id=>openSiteDocEditor(id)},
  blocks:{label:'Информационные блоки',get:()=>siteCustomBlocks,set:v=>siteCustomBlocks=v,title:x=>x.title||x.id,prefix:'custom-block-',edit:id=>openSiteBlockEditor(id)}
};
const uid=p=>p+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
function refresh(){if(typeof applySiteCustomContent==='function')applySiteCustomContent();else renderSiteAdminPanel();}

async function save(reason){refresh();await saveSiteSettings({recordVersion:true,reason});}
window.siteWorkflowDuplicate=async function(type,id){
  const d=defs[type];if(!d)return;const arr=d.get(),src=arr.find(x=>x&&String(x.id)===String(id));if(!src)return;
  const copy=JSON.parse(JSON.stringify(src));copy.id=uid(d.prefix);copy.custom=true;copy.active=false;
  if(type==='programs')copy.title_ru=(copy.title_ru||'Программа')+' — копия';
  else if(type==='contacts')copy.name=(copy.name||'Контакт')+' — копия';
  else if(type==='faq')copy.question=(copy.question||'Вопрос')+' — копия';
  else if(type==='nav')copy.label=(copy.label||'Пункт')+' — копия';
  else if(type==='docs')copy.title=(copy.title||'Документ')+' — копия';
  else if(type==='blocks')copy.title=(copy.title||'Блок')+' — копия';
  d.set([...arr,copy]);await save('Создана копия: '+d.title(copy));d.edit(copy.id);
};
window.siteWorkflowTogglePublish=async function(type,id){
  const d=defs[type];if(!d)return;const arr=d.get().slice(),i=arr.findIndex(x=>x&&String(x.id)===String(id));if(i<0)return;
  arr[i]={...arr[i],active:arr[i].active===false};d.set(arr);await save((arr[i].active===false?'Черновик: ':'Опубликовано: ')+d.title(arr[i]));
};
window.siteWorkflowMove=async function(type,id,dir){
  const d=defs[type];if(!d)return;const arr=d.get().slice(),i=arr.findIndex(x=>x&&String(x.id)===String(id)),j=i+Number(dir);
  if(i<0||j<0||j>=arr.length)return;[arr[i],arr[j]]=[arr[j],arr[i]];d.set(arr);await save('Изменён порядок: '+d.label);
};
window.siteWorkflowDelete=async function(type,id){
  const d=defs[type];if(!d)return;const arr=d.get(),x=arr.find(y=>y&&String(y.id)===String(id));if(!x||!confirm('Удалить «'+d.title(x)+'»?'))return;
  d.set(arr.filter(y=>y!==x));await save('Удалено: '+d.title(x));
};

function row(type,x,index,total){
  const d=defs[type],draft=x.active===false;
  return '<div class="cms-flow-row" data-flow-search="'+esc((d.title(x)+' '+d.label).toLowerCase())+'">'+
    '<span class="cms-flow-grip" title="Изменить порядок">⋮⋮</span>'+
    '<div class="cms-flow-name"><b>'+esc(d.title(x))+'</b><small>'+(draft?'Черновик':'Опубликовано')+'</small></div>'+
    '<div class="cms-flow-actions">'+
      '<button type="button" '+(index===0?'disabled':'')+' onclick="siteWorkflowMove(\''+type+'\',\''+esc(x.id)+'\',-1)">↑</button>'+
      '<button type="button" '+(index===total-1?'disabled':'')+' onclick="siteWorkflowMove(\''+type+'\',\''+esc(x.id)+'\',1)">↓</button>'+
      '<button type="button" onclick="siteWorkflowTogglePublish(\''+type+'\',\''+esc(x.id)+'\')">'+(draft?'Опубликовать':'В черновик')+'</button>'+
      '<button type="button" onclick="siteWorkflowDuplicate(\''+type+'\',\''+esc(x.id)+'\')">Дублировать</button>'+
      '<button type="button" onclick="defsShimEdit(\''+type+'\',\''+esc(x.id)+'\')">Изменить</button>'+
      '<button type="button" class="danger" onclick="siteWorkflowDelete(\''+type+'\',\''+esc(x.id)+'\')">Удалить</button>'+
    '</div></div>';
}
window.defsShimEdit=function(type,id){const d=defs[type];if(d)d.edit(id);};

function panel(){
  let el=document.getElementById('siteAdminWorkflow');
  if(!el){el=document.createElement('section');el.id='siteAdminWorkflow';el.className='cms-flow';const box=document.getElementById('siteAdminControls');if(!box)return;box.prepend(el);}
  let html='<div class="cms-flow-head"><div><b>Управление контентом</b><small>Порядок · черновики · копии</small></div><input id="cmsFlowSearch" type="search" placeholder="Поиск в PRO…"></div>';
  Object.entries(defs).forEach(([type,d])=>{const arr=d.get();if(!arr.length)return;html+='<details class="cms-flow-group" open><summary>'+esc(d.label)+' <small>'+arr.length+'</small></summary>'+arr.map((x,i)=>row(type,x,i,arr.length)).join('')+'</details>';});
  el.innerHTML=html;
  const q=el.querySelector('#cmsFlowSearch');q?.addEventListener('input',()=>{const s=q.value.trim().toLowerCase();el.querySelectorAll('.cms-flow-row').forEach(r=>r.hidden=!!s&&!r.dataset.flowSearch.includes(s));});
}
function styles(){
  if(document.getElementById('cmsFlowStyles'))return;const s=document.createElement('style');s.id='cmsFlowStyles';s.textContent=`
.cms-flow{margin:10px 0 14px;border:1px solid rgba(202,15,62,.32);border-radius:12px;overflow:hidden;background:rgba(8,13,23,.92)}
.cms-flow-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px;background:rgba(202,15,62,.08);border-bottom:1px solid rgba(255,255,255,.08)}
.cms-flow-head>div{display:flex;flex-direction:column;gap:2px}.cms-flow-head b{font-size:.78rem}.cms-flow-head small,.cms-flow-name small{font-size:.62rem;color:#94a3b8}
.cms-flow-head input{min-width:0;width:48%;border:1px solid rgba(255,255,255,.12);background:#0b1220;color:#fff;border-radius:8px;padding:7px 9px;font-size:.7rem}
.cms-flow-group{border-bottom:1px solid rgba(255,255,255,.06)}.cms-flow-group>summary{padding:9px 10px;font-size:.72rem;font-weight:850;cursor:pointer}
.cms-flow-row{display:grid;grid-template-columns:24px minmax(0,1fr);gap:7px;padding:8px 9px;border-top:1px solid rgba(255,255,255,.055)}
.cms-flow-grip{grid-row:1/3;display:grid;place-items:center;color:#64748b;font-size:.9rem}.cms-flow-name{display:flex;flex-direction:column;gap:2px;min-width:0}.cms-flow-name b{font-size:.69rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cms-flow-actions{grid-column:2;display:flex;flex-wrap:wrap;gap:4px}.cms-flow-actions button{border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.055);color:#e5e7eb;border-radius:7px;padding:5px 7px;font-size:.6rem;font-weight:800;cursor:pointer}.cms-flow-actions button:disabled{opacity:.3;cursor:default}.cms-flow-actions .danger{color:#fecdd3;border-color:rgba(202,15,62,.3)}
`;document.head.appendChild(s);
}
const old=renderSiteAdminPanel;renderSiteAdminPanel=function(){old();panel();};
styles();if(siteAdminMode)panel();
})();