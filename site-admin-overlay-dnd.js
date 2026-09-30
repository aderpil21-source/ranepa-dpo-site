(function(){
'use strict';
let drag=null;

function cloneList(list){return (list||[]).map(x=>x&&Object.assign({},x));}

function findIndexBy(arr,id){
  const sid=String(id);
  return arr.findIndex(x=>x&&(String(x.id)===sid||String(x.sourceKey||'')===sid));
}
function patch(arr,id,patchValue){
  const sid=String(id),i=findIndexBy(arr,sid);
  if(i>=0){arr[i]=Object.assign({},arr[i],patchValue);return;}
  const sparse={id:sid,custom:true};
  if(/^base-(faq|contact|nav|doc):/.test(sid))sparse.sourceKey=sid;
  arr.push(Object.assign(sparse,patchValue));
}
function arrayFor(type){
  if(type==='programs')return siteCustomPrograms;
  if(type==='contacts')return siteCustomContacts;
  if(type==='faq')return siteCustomFaqs;
  if(type==='nav')return siteCustomNavItems;
  if(type==='docs')return siteCustomDocs;
  return null;
}
function setArray(type,value){
  if(type==='programs')siteCustomPrograms=value;
  else if(type==='contacts')siteCustomContacts=value;
  else if(type==='faq')siteCustomFaqs=value;
  else if(type==='nav')siteCustomNavItems=value;
  else if(type==='docs')siteCustomDocs=value;
}
function title(type){
  return ({programs:'программ',contacts:'контактов',faq:'FAQ',nav:'меню',docs:'документов'})[type]||type;
}
function visibleRows(type,group){
  return [...document.querySelectorAll('.site-admin-row[data-cms-dnd-type="'+type+'"]')]
    .filter(row=>!row.closest('[hidden]') && (type!=='contacts'||String(row.dataset.cmsDndGroup||'')===String(group||'')));
}
async function persistOrder(type,orderedIds,before){
  const arr=arrayFor(type);if(!arr)return false;
  orderedIds.forEach((id,index)=>patch(arr,id,{cmsOrder:index}));
  if(typeof applySiteCustomContent==='function')applySiteCustomContent();
  if(typeof renderSiteAdminPanel==='function')renderSiteAdminPanel();
  const ok=await saveSiteSettings({recordVersion:true,reason:'Drag-and-drop: изменён порядок '+title(type)});
  if(!ok){
    setArray(type,before);
    if(typeof applySiteCustomContent==='function')applySiteCustomContent();
    if(typeof renderSiteAdminPanel==='function')renderSiteAdminPanel();
  }
  return ok;
}
function clear(){
  document.querySelectorAll('.site-admin-row.cms-overlay-dragging,.site-admin-row.cms-overlay-drop').forEach(x=>x.classList.remove('cms-overlay-dragging','cms-overlay-drop'));
  drag=null;
}
function bind(){
  document.querySelectorAll('.site-admin-row[data-cms-dnd-type]').forEach(row=>{
    if(row.dataset.cmsDndBound==='1')return;
    row.dataset.cmsDndBound='1';
    row.addEventListener('dragstart',e=>{
      const type=row.dataset.cmsDndType,id=row.dataset.cmsDndId,group=row.dataset.cmsDndGroup||'';
      if(!type||!id)return;
      drag={type,id,group};
      row.classList.add('cms-overlay-dragging');
      if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',type+':'+id);}
    });
    row.addEventListener('dragover',e=>{
      if(!drag)return;
      if(row.dataset.cmsDndType!==drag.type)return;
      if(drag.type==='contacts'&&String(row.dataset.cmsDndGroup||'')!==String(drag.group||''))return;
      if(row.dataset.cmsDndId===drag.id)return;
      e.preventDefault();
      document.querySelectorAll('.site-admin-row.cms-overlay-drop').forEach(x=>x.classList.remove('cms-overlay-drop'));
      row.classList.add('cms-overlay-drop');
    });
    row.addEventListener('drop',async e=>{
      if(!drag)return;
      const type=row.dataset.cmsDndType,targetId=row.dataset.cmsDndId;
      if(type!==drag.type||targetId===drag.id)return;
      if(type==='contacts'&&String(row.dataset.cmsDndGroup||'')!==String(drag.group||''))return;
      e.preventDefault();
      const rows=visibleRows(type,drag.group);
      const ids=rows.map(x=>String(x.dataset.cmsDndId||'')).filter(Boolean);
      const from=ids.indexOf(String(drag.id)),target=ids.indexOf(String(targetId));
      if(from<0||target<0){clear();return;}
      const [moved]=ids.splice(from,1);
      let to=target;
      if(from<target)to--;
      const rect=row.getBoundingClientRect();
      const after=e.clientY>rect.top+rect.height/2;
      if(after)to++;
      ids.splice(Math.max(0,Math.min(to,ids.length)),0,moved);
      const before=cloneList(arrayFor(type));
      clear();
      await persistOrder(type,ids,before);
    });
    row.addEventListener('dragend',clear);
  });
}
function styles(){
  if(document.getElementById('cmsOverlayDndStyles'))return;
  const s=document.createElement('style');s.id='cmsOverlayDndStyles';
  s.textContent='.site-admin-row[data-cms-dnd-type]{cursor:grab}.site-admin-row[data-cms-dnd-type]:active{cursor:grabbing}.site-admin-row.cms-overlay-dragging{opacity:.38}.site-admin-row.cms-overlay-drop{outline:2px dashed #38bdf8;outline-offset:-2px;background:rgba(56,189,248,.08)}';
  document.head.appendChild(s);
}
const old=renderSiteAdminPanel;
renderSiteAdminPanel=function(){old();bind();};
styles();bind();
})();