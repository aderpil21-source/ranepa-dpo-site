(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const specs={
  programs:{label:'Программы',items:()=>siteCustomPrograms||[],required:[['title_ru','Название программы']]},
  contacts:{label:'Контакты',items:()=>siteCustomContacts||[],required:[['name','ФИО']]},
  faq:{label:'FAQ',items:()=>siteCustomFaqs||[],required:[['question','Вопрос'],['answer','Ответ']]},
  schedule:{label:'Расписание',items:()=>siteCustomSchedules||[],required:[['program','Программа'],['date','Дата'],['subject','Тема занятия']]},
  nav:{label:'Меню',items:()=>siteCustomNavItems||[],required:[['label','Название'],['url','Ссылка']]},
  docs:{label:'Документы',items:()=>siteCustomDocs||[],required:[['title','Название']]},
  blocks:{label:'Информационные блоки',items:()=>siteCustomBlocks||[],required:[]}
};
function validUrl(v){
  const s=String(v||'').trim(); if(!s) return true;
  if(/^(.?.?/|#)/.test(s)) return true;
  if(/^(mailto:|tel:)/i.test(s)) return true;
  try{const u=new URL(s,location.href);return /^https?:$/.test(u.protocol);}catch(_){return false;}
}
function urlFields(type,x){
  const out=[];
  if(type==='programs'&&x.pdf_link) out.push(['Ссылка PDF',x.pdf_link]);
  if(type==='nav'&&x.url) out.push(['Ссылка',x.url]);
  if(type==='docs'){if(x.url)out.push(['Ссылка',x.url]);if(x.image)out.push(['Изображение',x.image]);}
  if(type==='blocks'&&x.url) out.push(['Ссылка',x.url]);
  return out;
}
window.siteCmsValidateEntity=function(type,x){
  const s=specs[type],errors=[],warnings=[];
  if(!s||!x) return {errors,warnings};
  (s.required||[]).forEach(([k,l])=>{if(!String(x[k]??'').trim())errors.push(l+' не заполнено');});
  urlFields(type,x).forEach(([l,v])=>{if(!validUrl(v))errors.push(l+': некорректный адрес');});
  if(type==='blocks'&&!String(x.title||'').trim()&&!String(x.text||'').trim())errors.push('Нужен заголовок или текст блока');
  if(type==='contacts'&&!String(x.phone||'').trim()&&!String(x.email||'').trim())warnings.push('Не указан телефон или e-mail');
  if(type==='programs'&&!String(x.desc_ru||'').trim())warnings.push('Нет краткого описания');
  if(type==='docs'&&!String(x.url||'').trim()&&!String(x.image||'').trim())warnings.push('Нет ссылки и изображения');
  return {errors,warnings};
};
function duplicateIds(){
  const issues=[];
  Object.entries(specs).forEach(([type,s])=>{
    const seen=new Set();
    s.items().forEach(x=>{
      const id=String(x&&x.id||'').trim();if(!id)return;
      if(seen.has(id)) issues.push({level:'error',where:s.label,text:'Дублирующий ID: '+id});
      seen.add(id);
    });
  });
  return issues;
}
function domIdIssues(){
  const m=new Map(),out=[];
  document.querySelectorAll('[id]').forEach(el=>{const id=el.id;if(!id)return;if(!m.has(id))m.set(id,[]);m.get(id).push(el);});
  m.forEach((els,id)=>{if(els.length>1)out.push({level:'error',where:'HTML',text:'ID #'+id+' встречается '+els.length+' раза'});});
  return out;
}
function contentIssues(){
  const out=[];
  Object.entries(specs).forEach(([type,s])=>{
    s.items().forEach(x=>{
      if(!x||x.archived===true)return;
      const r=siteCmsValidateEntity(type,x),title=(x.title_ru||x.name||x.question||x.label||x.title||x.subject||x.id||'без названия');
      r.errors.forEach(t=>out.push({level:'error',where:s.label,text:title+': '+t}));
      r.warnings.forEach(t=>out.push({level:'warning',where:s.label,text:title+': '+t}));
    });
  });
  return out;
}
function settingsSizeIssue(){
  try{
    const snapshot=typeof siteSnapshot==='function'?siteSnapshot():null;
    if(!snapshot)return [];
    const n=new Blob([JSON.stringify(snapshot)]).size;
    if(n>200000)return [{level:'warning',where:'CMS',text:'Настройки занимают '+Math.round(n/1024)+' КБ. Крупные медиа лучше хранить вне объекта настроек.'}];
  }catch(_){}
  return [];
}
function draftInfo(){
  let n=0,arch=0;
  Object.values(specs).forEach(s=>s.items().forEach(x=>{if(!x)return;if(x.archived)arch++;else if(x.active===false)n++;}));
  const out=[];if(n)out.push({level:'info',where:'CMS',text:'Черновиков: '+n});if(arch)out.push({level:'info',where:'CMS',text:'В корзине: '+arch});return out;
}
function localLinks(){
  const set=new Set();
  document.querySelectorAll('a[href]').forEach(a=>{
    if(a.closest('[data-payment-protected],#enrollModal,#leavingSiteModal'))return;
    const h=(a.getAttribute('href')||'').trim();
    if(!h||h.startsWith('#')||/^(mailto:|tel:|javascript:)/i.test(h))return;
    try{const u=new URL(h,location.href);if(u.origin===location.origin)set.add(u.href.split('#')[0]);}catch(_){}
  });
  return [...set];
}
async function networkIssues(){
  const out=[];
  for(const href of localLinks()){
    try{
      let r=await fetch(href,{method:'HEAD',cache:'no-store'});
      if(!r.ok&&(r.status===405||r.status===403))r=await fetch(href,{method:'GET',cache:'no-store'});
      if(!r.ok)out.push({level:'error',where:'Ссылки',text:new URL(href).pathname+' → HTTP '+r.status});
    }catch(_){out.push({level:'warning',where:'Ссылки',text:new URL(href).pathname+' не удалось проверить'});}
  }
  return out;
}
window.runSiteDiagnostics=async function(options){
  const opts=options||{},issues=[...duplicateIds(),...domIdIssues(),...contentIssues(),...settingsSizeIssue(),...draftInfo()];
  if(opts.network)issues.push(...await networkIssues());
  return issues;
};
function icon(l){return l==='error'?'⛔':l==='warning'?'⚠️':'ℹ️';}
function render(issues,networkChecked){
  const box=document.getElementById('siteDiagnosticsResults');if(!box)return;
  const e=issues.filter(x=>x.level==='error').length,w=issues.filter(x=>x.level==='warning').length;
  box.innerHTML='<div class="diag-summary"><b>'+(e?'Есть ошибки':'Критических ошибок нет')+'</b><span>⛔ '+e+' · ⚠️ '+w+'</span></div>'+
    (issues.length?issues.map(x=>'<div class="diag-item '+x.level+'"><span>'+icon(x.level)+'</span><div><b>'+esc(x.where)+'</b><p>'+esc(x.text)+'</p></div></div>').join(''):'<div class="diag-ok">✅ Проверка пройдена без замечаний.</div>')+
    (!networkChecked?'<div class="diag-note">Внутренние ссылки ещё не проверялись по сети.</div>':'');
}
window.refreshSiteDiagnostics=async function(network){
  const b=document.getElementById('siteDiagnosticsRun');if(b){b.disabled=true;b.textContent='Проверяем…';}
  const issues=await runSiteDiagnostics({network:!!network});render(issues,!!network);
  if(b){b.disabled=false;b.textContent='Проверить сайт';}
  return issues;
};
window.openSiteDiagnostics=function(){
  const d=document.getElementById('siteDiagnosticsPanel');if(d){d.open=true;d.scrollIntoView({behavior:'smooth',block:'nearest'});refreshSiteDiagnostics(false);}
};
function mount(){
  const root=document.getElementById('siteAdminControls');if(!root||document.getElementById('siteDiagnosticsPanel'))return;
  const d=document.createElement('details');d.className='site-admin-group diag-panel';d.id='siteDiagnosticsPanel';d.dataset.siteAdminGroup='Проверка сайта';
  d.innerHTML='<summary>🩺 Проверка сайта</summary><div class="diag-actions"><button id="siteDiagnosticsRun" type="button">Проверить сайт</button><button id="siteDiagnosticsNetwork" type="button">Проверить внутренние ссылки</button></div><div id="siteDiagnosticsResults"></div>';
  root.prepend(d);
  d.querySelector('#siteDiagnosticsRun').onclick=()=>refreshSiteDiagnostics(false);
  d.querySelector('#siteDiagnosticsNetwork').onclick=()=>refreshSiteDiagnostics(true);
}
function styles(){
  if(document.getElementById('siteDiagnosticsStyles'))return;
  const s=document.createElement('style');s.id='siteDiagnosticsStyles';s.textContent='.diag-actions{display:flex;gap:6px;padding:9px;flex-wrap:wrap}.diag-actions button{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;border-radius:8px;padding:7px 9px;font-size:.68rem;font-weight:800;cursor:pointer}.diag-summary{display:flex;justify-content:space-between;gap:8px;padding:9px 10px;border-top:1px solid rgba(255,255,255,.06);font-size:.69rem}.diag-item{display:grid;grid-template-columns:22px 1fr;gap:6px;padding:8px 10px;border-top:1px solid rgba(255,255,255,.05)}.diag-item b{font-size:.65rem}.diag-item p{margin:2px 0 0;color:#cbd5e1;font-size:.64rem;line-height:1.35}.diag-item.error p{color:#fecaca}.diag-item.warning p{color:#fde68a}.diag-ok,.diag-note{padding:10px;color:#a7f3d0;font-size:.67rem}.diag-note{color:#94a3b8}';
  document.head.appendChild(s);
}
const prev=renderSiteAdminPanel;
renderSiteAdminPanel=function(){prev();mount();};
styles();if(siteAdminMode){mount();refreshSiteDiagnostics(false);}
})();