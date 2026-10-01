(function(){
  'use strict';

  const API='https://script.google.com/macros/s/AKfycbxCqcmGgAhHU3dG7ClzCjJZpELqpF-ic9H_Qg49BysA30Ybl4khxnwPOS7Pj9gE3g9I/exec';
  const SETTINGS_ID='__site_admin_settings__';
  const token=sessionStorage.getItem('siteAdminToken')||'';
  if(!token) return;

  let settings={};
  let editing=false;
  let saving=false;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function request(body){
    const response=await fetch(API,{
      method:'POST',
      body:JSON.stringify(body)
    });
    const data=await response.json();
    if(!response.ok||!data||data.ok===false) throw new Error(data&&data.error?data.error:'Ошибка Pro API');
    return data;
  }

  async function loadSettings(){
    try{
      const data=await request({action:'newsReadAdmin',token});
      const item=(data.items||[]).find(x=>x&&(x.id===SETTINGS_ID||x.title==='__SITE_ADMIN_SETTINGS__'));
      settings=item&&item.lead?JSON.parse(item.lead):{};
    }catch(_){
      const response=await fetch('./site-settings.json?v='+Date.now(),{cache:'no-store'});
      const data=await response.json();
      settings=data&&data.settings&&typeof data.settings==='object'?data.settings:{};
    }
    settings.visibility=settings.visibility&&typeof settings.visibility==='object'?settings.visibility:{};
    settings.content=settings.content&&typeof settings.content==='object'?settings.content:{};
    settings.attributes=settings.attributes&&typeof settings.attributes==='object'?settings.attributes:{};
  }

  function currentContentValue(key,el){
    const rec=settings.content['custom:'+key];
    if(rec&&typeof rec==='object'&&rec.ru!=null) return String(rec.ru);
    return String(el.textContent||'').trim();
  }

  function isSystemUi(el){
    return !!(el && el.closest && el.closest('[data-system-ui], [data-site-admin-protected]'));
  }

  function editableNodes(){
    return [...document.querySelectorAll('[data-site-edit-key]')].filter(el=>!isSystemUi(el));
  }

  function blockNodes(){
    return [...document.querySelectorAll('[data-site-visibility-key]')].filter(el=>!isSystemUi(el));
  }

  function setEditing(on){
    editing=!!on;
    document.body.classList.toggle('students-pro-editing',editing);
    editableNodes().forEach(el=>{
      el.contentEditable=editing?'true':'false';
      el.spellcheck=editing;
      if(editing) el.classList.add('students-pro-editable');
      else el.classList.remove('students-pro-editable');
    });
    blockNodes().forEach(el=>{
      const key=String(el.dataset.siteVisibilityKey||'');
      const visible=settings.visibility[key]!==false;
      if(editing){
        el.style.display='';
        el.classList.toggle('students-pro-hidden-preview',!visible);
      }else{
        el.classList.remove('students-pro-hidden-preview');
        el.style.display=visible?'':'none';
      }
    });
    const toggle=document.getElementById('studentsProToggle');
    if(toggle) toggle.textContent=editing?'Закончить редактирование':'Редактировать страницу';
    const save=document.getElementById('studentsProSave');
    if(save) save.hidden=!editing;
  }

  function renderPanel(){
    const old=document.getElementById('studentsProPanel');
    if(old) old.remove();
    const panel=document.createElement('aside');
    panel.id='studentsProPanel';
    panel.className='students-pro-panel';
    panel.innerHTML='<div class="students-pro-head"><strong>PRO · Слушателям</strong><button type="button" id="studentsProClose" aria-label="Скрыть панель">×</button></div>'+
      '<div class="students-pro-actions"><button type="button" id="studentsProToggle">Редактировать страницу</button><button type="button" id="studentsProSave" hidden>Сохранить</button></div>'+
      '<div class="students-pro-note">Текст редактируется прямо на странице. Двойной клик по кнопке/ссылке меняет её адрес.</div>'+
      '<div class="students-pro-list">'+blockNodes().map(el=>{
        const key=String(el.dataset.siteVisibilityKey||'');
        const label=el.dataset.siteBlockLabel||key;
        const checked=settings.visibility[key]!==false?' checked':'';
        return '<label><input type="checkbox" data-students-pro-vis="'+esc(key)+'"'+checked+'><span>'+esc(label)+'</span></label>';
      }).join('')+'</div>'+
      '<div class="students-pro-status" id="studentsProStatus"></div>';
    document.body.appendChild(panel);

    panel.querySelector('#studentsProToggle').onclick=()=>setEditing(!editing);
    panel.querySelector('#studentsProSave').onclick=save;
    panel.querySelector('#studentsProClose').onclick=()=>{panel.hidden=true;};
    panel.querySelectorAll('[data-students-pro-vis]').forEach(input=>{
      input.addEventListener('change',()=>{
        const key=input.dataset.studentsProVis;
        settings.visibility[key]=input.checked;
        const el=document.querySelector('[data-site-visibility-key="'+CSS.escape(key)+'"]');
        if(el){
          if(editing){el.style.display='';el.classList.toggle('students-pro-hidden-preview',!input.checked);}
          else el.style.display=input.checked?'':'none';
        }
      });
    });
  }

  function status(text,type){
    const el=document.getElementById('studentsProStatus');
    if(!el) return;
    el.textContent=text||'';
    el.className='students-pro-status'+(type?' '+type:'');
  }

  function collect(){
    editableNodes().forEach(el=>{
      const key=String(el.dataset.siteEditKey||'').trim();
      if(!key) return;
      settings.content['custom:'+key]={ru:String(el.textContent||'').trim()};
    });
  }

  async function save(){
    if(saving) return;
    saving=true;
    status('Сохраняем…');
    collect();
    const now=new Date().toISOString();
    const payload=Object.assign({
      version:7,visibility:{},content:{},attributes:{},
      customPrograms:[],customContacts:[],customFaqs:[],customSchedules:[],
      customNavItems:[],customDocs:[],customBlocks:[],theme:{},seo:{}
    },settings,{updatedAt:now});
    const item={
      id:SETTINGS_ID,
      title:'__SITE_ADMIN_SETTINGS__',
      lead:JSON.stringify(payload),
      tags:['__system__'],
      blocks:[],
      coverImage:'',
      status:'published',
      createdAt:settings.createdAt||now,
      updatedAt:now
    };
    try{
      await request({action:'newsSave',token,item});
      try{localStorage.setItem('ranepa_site_settings_v2',JSON.stringify(payload));}catch(_){}
      settings=payload;
      status('Сохранено','ok');
      setTimeout(()=>status(''),1600);
    }catch(error){
      status('Ошибка: '+error.message,'err');
    }finally{
      saving=false;
    }
  }

  function bindLinks(){
    document.addEventListener('click',event=>{
      if(!editing) return;
      const link=event.target.closest('[data-site-edit-link]');
      if(link && !isSystemUi(link)){event.preventDefault();}
    },true);

    document.addEventListener('dblclick',event=>{
      if(!editing) return;
      const link=event.target.closest('[data-site-edit-link]');
      if(!link || isSystemUi(link)) return;
      event.preventDefault();
      const selector='#'+link.id;
      if(!link.id) return;
      const next=prompt('Адрес ссылки / кнопки:',link.getAttribute('href')||'');
      if(next===null) return;
      settings.attributes[selector]=Object.assign({},settings.attributes[selector]||{},{
        selector,
        href:String(next).trim()
      });
      link.setAttribute('href',String(next).trim()||'#');
      status('Ссылка изменена. Нажмите «Сохранить».','ok');
    },true);
  }

  function styles(){
    const style=document.createElement('style');
    style.textContent=`
      .students-pro-panel{position:fixed;left:16px;top:128px;z-index:22000;width:min(330px,calc(100vw - 32px));max-height:calc(100vh - 150px);overflow:auto;border:1px solid rgba(56,189,248,.36);border-radius:18px;background:rgba(5,8,14,.96);color:#f8fafc;box-shadow:0 24px 70px rgba(2,6,23,.42);font-family:Manrope,Arial,sans-serif}
      .students-pro-head{display:flex;align-items:center;justify-content:space-between;padding:13px 14px;border-bottom:1px solid rgba(255,255,255,.1)}
      .students-pro-head strong{font:850 .86rem Montserrat,Arial,sans-serif}
      .students-pro-head button{border:0;background:transparent;color:#fff;font-size:20px;cursor:pointer}
      .students-pro-actions{display:flex;gap:8px;padding:12px}
      .students-pro-actions button{flex:1;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(255,255,255,.07);color:#fff;padding:9px;font-weight:800;cursor:pointer}
      #studentsProSave{background:#16a34a;border-color:#16a34a}
      .students-pro-note{padding:0 12px 10px;color:#94a3b8;font-size:.72rem;line-height:1.45}
      .students-pro-list{display:grid;gap:4px;padding:0 12px 12px}
      .students-pro-list label{display:flex;gap:9px;align-items:center;padding:7px 8px;border-radius:9px;background:rgba(255,255,255,.035);font-size:.76rem}
      .students-pro-status{min-height:30px;padding:0 12px 12px;color:#cbd5e1;font-size:.74rem}
      .students-pro-status.ok{color:#86efac}.students-pro-status.err{color:#fca5a5}
      .students-pro-editable{outline:1px dashed rgba(56,189,248,.65)!important;outline-offset:3px;border-radius:4px;cursor:text}
      .students-pro-editable:focus{outline:2px solid #38bdf8!important;background:rgba(56,189,248,.08)!important}
      .students-pro-hidden-preview{opacity:.34!important;filter:grayscale(.5)}
      body.students-pro-editing [data-site-edit-link]{cursor:alias!important}
      @media(max-width:760px){.students-pro-panel{top:auto;bottom:12px;left:12px;width:calc(100vw - 24px);max-height:52vh}}
    `;
    document.head.appendChild(style);
  }

  async function boot(){
    styles();
    bindLinks();
    await loadSettings();
    editableNodes().forEach(el=>{
      const key=String(el.dataset.siteEditKey||'').trim();
      if(key) el.textContent=currentContentValue(key,el);
    });
    renderPanel();
  }

  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();