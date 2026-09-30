(function(){
'use strict';
const SIGN_URL='https://functions.yandexcloud.net/d4ejfbsrku9a7pv25b9j';
const RECENT_KEY='ranepa_pro_media_recent_v1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function recent(){
  try{const x=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');return Array.isArray(x)?x:[];}catch(_){return [];}
}
function remember(item){
  const list=[item,...recent().filter(x=>x&&x.url!==item.url)].slice(0,30);
  try{localStorage.setItem(RECENT_KEY,JSON.stringify(list));}catch(_){}
  renderPanel();
}
function humanSize(n){n=Number(n)||0;if(n<1024)return n+' Б';if(n<1048576)return (n/1024).toFixed(1)+' КБ';return (n/1048576).toFixed(1)+' МБ';}
function validateFile(file){
  if(!file||!file.name)throw new Error('Файл не выбран');
  const max=file.type.startsWith('video/')?500*1024*1024:100*1024*1024;
  if(file.size>max)throw new Error('Файл слишком большой: '+humanSize(file.size));
}
async function signedUrl(file){
  if(!siteAdminToken)throw new Error('Сессия PRO истекла');
  const r=await fetch(SIGN_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    editorToken:siteAdminToken,
    filename:file.name,
    contentType:file.type||'application/octet-stream',
    size:file.size
  })});
  const text=await r.text();let data={};try{data=JSON.parse(text);}catch(_){}
  if(!r.ok||!data.ok||!data.uploadUrl){
    if(data.code==='SESSION_EXPIRED'||data.code==='UNAUTHORIZED'){
      sessionStorage.removeItem('siteAdminToken');sessionStorage.removeItem('newsAdminToken');
      throw new Error('Сессия PRO истекла. Войдите снова.');
    }
    throw new Error(data.error||('Хранилище вернуло HTTP '+r.status));
  }
  return data;
}
function put(file,url,onProgress){
  return new Promise((resolve,reject)=>{
    const x=new XMLHttpRequest();x.open('PUT',url);x.setRequestHeader('Content-Type',file.type||'application/octet-stream');x.timeout=600000;
    x.upload.onprogress=e=>{if(e.lengthComputable&&onProgress)onProgress(e.loaded/e.total);};
    x.onload=()=>x.status<300?resolve():reject(new Error('Загрузка отклонена: HTTP '+x.status));
    x.onerror=()=>reject(new Error('Ошибка сети при загрузке'));
    x.ontimeout=()=>reject(new Error('Загрузка превысила время ожидания'));
    x.send(file);
  });
}
window.siteAdminUploadMedia=async function(file,options){
  validateFile(file);const opts=options||{};
  const signed=await signedUrl(file);await put(file,signed.uploadUrl,opts.onProgress);
  const item={url:signed.publicUrl,name:file.name,type:file.type||'',size:file.size,at:new Date().toISOString()};
  remember(item);return item;
};
async function uploadIntoInput(file,input,progress){
  try{
    progress.textContent='0%';
    const item=await siteAdminUploadMedia(file,{onProgress:p=>{progress.textContent=Math.round(p*100)+'%';}});
    input.value=item.url;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
    progress.textContent='Готово';siteAdminSetStatus('Файл загружен: '+file.name,'ok');
  }catch(e){progress.textContent='Ошибка';siteAdminSetStatus(e.message||'Ошибка загрузки','err');}
}
function addUpload(input,accept,label){
  if(!input||input.dataset.mediaUploadBound==='1')return;
  input.dataset.mediaUploadBound='1';
  const wrap=document.createElement('div');wrap.className='cms-media-field';
  const btn=document.createElement('button');btn.type='button';btn.className='cms-media-pick';btn.textContent=label||'Загрузить файл';
  const stat=document.createElement('span');stat.className='cms-media-progress';
  const file=document.createElement('input');file.type='file';file.hidden=true;if(accept)file.accept=accept;
  btn.onclick=()=>file.click();
  file.onchange=()=>{const f=file.files&&file.files[0];if(f)uploadIntoInput(f,input,stat);file.value='';};
  wrap.append(btn,stat,file);input.insertAdjacentElement('afterend',wrap);
}
function enhanceEditors(){
  const oldDoc=window.openSiteDocEditor;
  if(oldDoc&&!oldDoc.__mediaWrapped){
    const fn=function(id){oldDoc(id);setTimeout(()=>{const m=document.getElementById('siteAdminStructureModal');if(!m)return;addUpload(m.querySelector('input[name="image"]'),'image/*','Загрузить изображение');addUpload(m.querySelector('input[name="url"]'),'.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,image/*','Загрузить документ');},0);};
    fn.__mediaWrapped=true;window.openSiteDocEditor=fn;
  }
  const oldProgram=window.openSiteProgramEditor;
  if(oldProgram&&!oldProgram.__mediaWrapped){
    const fn=function(id){oldProgram(id);setTimeout(()=>{const m=document.getElementById('siteAdminEntityModal');if(!m)return;addUpload(m.querySelector('input[name="pdf_link"]'),'.pdf,application/pdf','Загрузить PDF');},0);};
    fn.__mediaWrapped=true;window.openSiteProgramEditor=fn;
  }
  const seoObserverTarget=()=>document.getElementById('siteSeoPanel');
  const bindSeoUpload=()=>{
    const panel=seoObserverTarget();if(!panel)return;
    addUpload(panel.querySelector('input[data-seo="ogImage"]'),'image/*','Загрузить OG изображение');
  };
  const oldElement=window.openSiteElementEditor;
  if(oldElement&&!oldElement.__mediaWrapped){
    const fn=function(el){oldElement(el);setTimeout(()=>{const m=document.getElementById('siteAdminEntityModal');if(!m)return;addUpload(m.querySelector('input[name="src"]'),'image/*','Загрузить изображение');},0);};
    fn.__mediaWrapped=true;window.openSiteElementEditor=fn;
  }
}
function normalizeUrl(v){
  const s=String(v||'').trim();if(!s)return '';
  try{return new URL(s,location.href).href;}catch(_){return s;}
}
function usageFor(url){
  const target=normalizeUrl(url),hits=[];
  if(!target)return hits;
  document.querySelectorAll('[src],[href]').forEach(el=>{
    const raw=el.getAttribute('src')||el.getAttribute('href')||'';
    if(normalizeUrl(raw)!==target)return;
    let label=el.tagName.toLowerCase();
    if(el.matches('[data-site-program-id]'))label='программа';
    else if(el.closest('[data-site-doc-grid]'))label='документы';
    else if(el.closest('#contactsSection'))label='контакты';
    else if(el.closest('.header-nav'))label='меню';
    else if(el.id)label+='#'+el.id;
    hits.push('страница: '+label);
  });
  const scan=(list,label,fields)=>{
    (Array.isArray(list)?list:[]).forEach(item=>{
      if(!item)return;
      fields.forEach(field=>{if(normalizeUrl(item[field])===target)hits.push(label+': '+String(item.title_ru||item.title||item.name||item.label||item.id||field));});
    });
  };
  scan(siteCustomPrograms,'программа',['pdf_link']);
  scan(siteCustomContacts,'контакт',['image','url']);
  scan(siteCustomFaqs,'FAQ',['image','url']);
  scan(siteCustomNavItems,'меню',['url']);
  scan(siteCustomDocs,'документ',['image','url']);
  scan(siteCustomBlocks,'инфоблок',['url','image']);
  Object.values(siteAttributeOverrides||{}).forEach(rec=>{
    if(!rec)return;
    if(normalizeUrl(rec.src)===target)hits.push('элемент: '+String(rec.selector||'изображение'));
    if(normalizeUrl(rec.href)===target)hits.push('ссылка: '+String(rec.selector||'элемент'));
  });
  Object.entries(siteSeoConfig||{}).forEach(([page,seo])=>{
    if(seo&&normalizeUrl(seo.ogImage)===target)hits.push('SEO '+page+': OpenGraph image');
  });
  return [...new Set(hits)];
}
function row(x){
  const uses=usageFor(x.url),usage=uses.length?('Используется: '+uses.join(' · ')):'Не найден в текущей странице/CMS';
  return '<div class="cms-media-row"><div><b>'+esc(x.name||'Файл')+'</b><small>'+esc(humanSize(x.size))+' · '+esc(x.type||'файл')+'</small><small class="'+(uses.length?'cms-media-used':'cms-media-unused')+'">'+esc(usage)+'</small></div><button type="button" data-media-copy="'+esc(x.url)+'">Копировать ссылку</button></div>';
}
function renderPanel(){
  const root=document.getElementById('siteAdminControls');if(!root)return;
  let p=document.getElementById('siteAdminMediaPanel');
  if(!p){
    p=document.createElement('details');p.id='siteAdminMediaPanel';p.className='site-admin-group';p.dataset.siteAdminGroup='Медиа';
    p.innerHTML='<summary>🖼 Медиа и файлы</summary><div class="cms-media-main"><label class="cms-media-drop">Загрузить файл<input id="siteAdminMediaInput" type="file" multiple hidden></label><div id="siteAdminMediaStatus"></div><div id="siteAdminMediaRecent"></div></div>';
    root.prepend(p);
    const input=p.querySelector('#siteAdminMediaInput');
    p.querySelector('.cms-media-drop').onclick=e=>{if(e.target!==input)input.click();};
    input.onchange=async()=>{
      const files=[...(input.files||[])],status=p.querySelector('#siteAdminMediaStatus');
      for(const f of files){
        try{
          status.textContent='Загружаем '+f.name+'…';
          const item=await siteAdminUploadMedia(f,{onProgress:x=>status.textContent='Загружаем '+f.name+': '+Math.round(x*100)+'%'});
          status.textContent='Загружено: '+item.name;
        }catch(e){status.textContent='Ошибка: '+e.message;break;}
      }
      input.value='';
    };
    p.addEventListener('click',async e=>{
      const b=e.target.closest('[data-media-copy]');if(!b)return;
      const url=b.dataset.mediaCopy;try{await navigator.clipboard.writeText(url);siteAdminSetStatus('Ссылка скопирована','ok');}catch(_){siteAdminSetStatus('Не удалось скопировать ссылку','err');}
    });
  }
  const list=p.querySelector('#siteAdminMediaRecent');if(list)list.innerHTML=recent().map(row).join('')||'<div class="cms-media-empty">Загруженных через PRO файлов пока нет.</div>';
}
function styles(){
  if(document.getElementById('siteAdminMediaStyles'))return;
  const s=document.createElement('style');s.id='siteAdminMediaStyles';s.textContent='.cms-media-main{padding:9px}.cms-media-drop,.cms-media-pick{display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(202,15,62,.42);background:rgba(202,15,62,.12);color:#fff;border-radius:8px;padding:7px 9px;font-size:.67rem;font-weight:850;cursor:pointer}.cms-media-field{display:flex;align-items:center;gap:7px;margin-top:6px}.cms-media-progress{font-size:.62rem;color:#94a3b8}.cms-media-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px solid rgba(255,255,255,.06)}.cms-media-row>div{display:flex;flex-direction:column;min-width:0}.cms-media-row b{font-size:.66rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cms-media-row small{font-size:.59rem;color:#94a3b8}.cms-media-used{color:#86efac!important}.cms-media-unused{color:#fbbf24!important}.cms-media-row button{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#fff;border-radius:7px;padding:5px 7px;font-size:.6rem;cursor:pointer}.cms-media-empty,#siteAdminMediaStatus{font-size:.64rem;color:#94a3b8;padding:8px 0}';
  document.head.appendChild(s);
}
const prevRender=renderSiteAdminPanel;
renderSiteAdminPanel=function(){prevRender();renderPanel();enhanceEditors();setTimeout(bindSeoUpload,0);};
styles();enhanceEditors();setTimeout(bindSeoUpload,0);if(siteAdminMode)renderPanel();
})();