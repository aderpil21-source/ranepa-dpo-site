(function(){
  'use strict';
  let entityModal = null;
  let entityType = '';
  let entityId = '';

  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }

  function makeId(prefix){
    return prefix + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
  }

  function ensureStyles(){
    if(document.getElementById('siteAdminEntityStyles')) return;
    const style=document.createElement('style');
    style.id='siteAdminEntityStyles';
    style.textContent=`
.site-admin-entity-group{border:1px solid rgba(56,189,248,.22)!important}
.site-admin-entity-actions{display:flex;gap:6px;padding:8px 10px;border-top:1px solid rgba(255,255,255,.055);flex-wrap:wrap}
.site-admin-entity-actions button{flex:1;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.055);color:#fff;border-radius:8px;padding:7px 8px;font-size:.68rem;font-weight:800;cursor:pointer}
.site-admin-entity-actions .danger{color:#fecdd3;border-color:rgba(202,15,62,.35)}
.site-admin-entity-empty{padding:10px 12px;color:#94a3b8;font-size:.7rem}
.site-admin-entity-add{width:calc(100% - 20px);margin:10px;border:1px solid rgba(202,15,62,.45);background:rgba(202,15,62,.14);color:#fff;border-radius:9px;padding:9px 10px;font-size:.72rem;font-weight:900;cursor:pointer}
.site-admin-entity-add:hover{background:rgba(202,15,62,.24)}
.site-admin-owl-grid{display:grid;gap:6px;padding:8px 10px 10px}
.site-admin-owl-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 9px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:rgba(255,255,255,.025)}
.site-admin-owl-row span{font-size:.7rem;line-height:1.25}
.site-admin-owl-row input{width:16px;height:16px;accent-color:#ca0f3e;cursor:pointer}
.site-admin-theme-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px}
.site-admin-theme-field{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:rgba(255,255,255,.025)}
.site-admin-theme-field span{font-size:.66rem;line-height:1.2;color:#cbd5e1}
.site-admin-theme-field input[type=color]{width:38px;height:28px;padding:0;border:0;border-radius:7px;background:transparent;cursor:pointer}
.site-admin-theme-reset{grid-column:1/-1;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.055);color:#fff;border-radius:9px;padding:9px;font-size:.7rem;font-weight:850;cursor:pointer}
body.site-admin-pick-mode{cursor:crosshair!important}
body.site-admin-pick-mode .site-admin-pick-target{outline:2px solid #38bdf8!important;outline-offset:3px!important}
.site-entity-modal{position:fixed;inset:0;z-index:30120;display:none;place-items:center;padding:18px;background:rgba(2,6,15,.78);backdrop-filter:blur(12px)}
.site-entity-modal.active{display:grid}
.site-entity-dialog{width:min(760px,100%);max-height:92vh;overflow:auto;border:1px solid rgba(202,15,62,.45);border-radius:20px;background:#0b1220;color:#fff;box-shadow:0 30px 90px rgba(0,0,0,.6);padding:22px}
.site-entity-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}
.site-entity-head h3{margin:0;font:900 1.05rem Montserrat,sans-serif}
.site-entity-x{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#fff;width:36px;height:36px;border-radius:10px;cursor:pointer}
.site-entity-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.site-entity-field{display:flex;flex-direction:column;gap:6px}
.site-entity-field.wide{grid-column:1/-1}
.site-entity-field label{font-size:.72rem;font-weight:800;color:#cbd5e1}
.site-entity-field input,.site-entity-field textarea,.site-entity-field select{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:#111827;color:#fff;padding:10px 11px;font:600 .82rem Manrope,sans-serif;outline:none}
.site-entity-field textarea{min-height:92px;resize:vertical}
.site-entity-field input:focus,.site-entity-field textarea:focus,.site-entity-field select:focus{border-color:#ca0f3e;box-shadow:0 0 0 3px rgba(202,15,62,.12)}
.site-entity-footer{display:flex;gap:10px;margin-top:18px}
.site-entity-footer button{flex:1;border:0;border-radius:11px;padding:12px;font-weight:900;cursor:pointer}
.site-entity-save{background:#ca0f3e;color:#fff}.site-entity-cancel{background:#1f2937;color:#fff}
@media(max-width:640px){.site-entity-grid{grid-template-columns:1fr}.site-entity-field.wide{grid-column:auto}.site-entity-modal{padding:0}.site-entity-dialog{width:100%;height:100%;max-height:none;border-radius:0}}
`;
    document.head.appendChild(style);
  }
  function ensureModal(){
    ensureStyles();
    if(entityModal) return entityModal;
    entityModal=document.createElement('div');
    entityModal.className='site-entity-modal';
    entityModal.id='siteAdminEntityModal';
    entityModal.innerHTML='<div class="site-entity-dialog" role="dialog" aria-modal="true"><div class="site-entity-head"><h3 id="siteEntityTitle"></h3><button type="button" class="site-entity-x" aria-label="Закрыть">×</button></div><form id="siteEntityForm"><div class="site-entity-grid" id="siteEntityFields"></div><div class="site-entity-footer"><button class="site-entity-save" type="submit">Сохранить</button><button class="site-entity-cancel" type="button">Отмена</button></div></form></div>';
    document.body.appendChild(entityModal);
    entityModal.querySelector('.site-entity-x').onclick=closeSiteEntityEditor;
    entityModal.querySelector('.site-entity-cancel').onclick=closeSiteEntityEditor;
    entityModal.addEventListener('click',e=>{if(e.target===entityModal) closeSiteEntityEditor();});
    entityModal.querySelector('#siteEntityForm').addEventListener('submit',saveSiteEntityEditor);
    return entityModal;
  }

  function field(name,label,value,type,wide,options){
    const cls='site-entity-field'+(wide?' wide':'');
    if(type==='textarea'){
      return '<div class="'+cls+'"><label>'+esc(label)+'</label><textarea name="'+esc(name)+'">'+esc(value||'')+'</textarea></div>';
    }
    if(type==='select'){
      return '<div class="'+cls+'"><label>'+esc(label)+'</label><select name="'+esc(name)+'">'+
        options.map(o=>'<option value="'+esc(o[0])+'"'+(String(value||'')===String(o[0])?' selected':'')+'>'+esc(o[1])+'</option>').join('')+
        '</select></div>';
    }
    return '<div class="'+cls+'"><label>'+esc(label)+'</label><input type="'+(type||'text')+'" name="'+esc(name)+'" value="'+esc(value||'')+'"></div>';
  }

  function findProgram(id){
    return (siteCustomPrograms||[]).find(x=>x&&x.id===id)||
      (Array.isArray(globalPrograms)?globalPrograms.find(x=>x&&String(x.id)===String(id)):null)||
      null;
  }
  function findContact(id){ return (siteCustomContacts||[]).find(x=>x&&x.id===id)||null; }

  const SITE_THEME_DEFAULTS={
    accent:'#CA0F3E',burgundy:'#881337',blue:'#1E3A8A',
    darkBg:'#05080E',darkCard:'#111827',darkText:'#F8FAFC',darkMuted:'#94A3B8',
    lightBg:'#F1F5F9',lightCard:'#FFFFFF',lightText:'#0F172A',lightMuted:'#475569'
  };

  function colorValue(value,fallback){
    const v=String(value||'').trim();
    return /^#[0-9a-f]{6}$/i.test(v)?v.toUpperCase():fallback;
  }
  function hexRgba(hex,alpha){
    const h=colorValue(hex,'#111827').slice(1);
    const n=parseInt(h,16);
    return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+alpha+')';
  }
  window.applySiteThemeConfig=function(){
    const cfg=Object.assign({},SITE_THEME_DEFAULTS,siteThemeConfig||{});
    const root=document.documentElement;
    const light=root.getAttribute('data-theme')==='light';
    root.style.setProperty('--ranepa-red',colorValue(cfg.accent,SITE_THEME_DEFAULTS.accent));
    root.style.setProperty('--ranepa-burgundy',colorValue(cfg.burgundy,SITE_THEME_DEFAULTS.burgundy));
    root.style.setProperty('--ranepa-rich-blue',colorValue(cfg.blue,SITE_THEME_DEFAULTS.blue));
    root.style.setProperty('--bg-deep',colorValue(light?cfg.lightBg:cfg.darkBg,light?SITE_THEME_DEFAULTS.lightBg:SITE_THEME_DEFAULTS.darkBg));
    root.style.setProperty('--text-main',colorValue(light?cfg.lightText:cfg.darkText,light?SITE_THEME_DEFAULTS.lightText:SITE_THEME_DEFAULTS.darkText));
    root.style.setProperty('--text-muted',colorValue(light?cfg.lightMuted:cfg.darkMuted,light?SITE_THEME_DEFAULTS.lightMuted:SITE_THEME_DEFAULTS.darkMuted));
    root.style.setProperty('--bg-card',hexRgba(light?cfg.lightCard:cfg.darkCard,light?.94:.62));
    root.style.setProperty('--bg-glass',hexRgba(light?cfg.lightCard:cfg.darkCard,light?.92:.78));
  };

  function findFaq(id){ return (siteCustomFaqs||[]).find(x=>x&&x.id===id)||null; }
  function renderSiteCustomFaqs(){
    const target=document.querySelector('.faq-container');
    if(!target) return;
    target.querySelectorAll('.site-custom-faq').forEach(n=>n.remove());
    (siteCustomFaqs||[]).forEach(f=>{
      if(!f||!f.id||f.active===false) return;
      const details=document.createElement('details');
      details.className='faq-item site-custom-faq';
      details.dataset.siteFaqId=f.id;
      if(!siteKeyIsVisible('faq:'+f.id)) details.classList.add(siteAdminMode?'site-admin-preview-hidden':'site-admin-force-hidden');
      details.innerHTML='<summary>'+esc(f.question||'Новый вопрос')+'</summary><div class="faq-answer">'+esc(f.answer||'')+'</div>';
      target.appendChild(details);
    });
  }

  window.openSiteFaqEditor=function(id){
    if(!siteAdminMode) return openSiteAdminLogin();
    entityType='faq'; entityId=id||'';
    const f=id?findFaq(id):null;
    const modal=ensureModal();
    modal.querySelector('#siteEntityTitle').textContent=f?'Редактировать вопрос FAQ':'Добавить вопрос FAQ';
    modal.querySelector('#siteEntityFields').innerHTML=
      field('question','Вопрос',f&&f.question,'text',true)+
      field('answer','Ответ',f&&f.answer,'textarea',true);
    modal.classList.add('active');
    modal.querySelector('input,textarea')?.focus();
  };

  window.deleteSiteCustomFaq=async function(id){
    if(typeof siteWorkflowDelete==='function') return siteWorkflowDelete('faq',id);
    const item=findFaq(id); if(!item) return;
    if(!confirm('Переместить вопрос «'+(item.question||id)+'» в корзину?')) return;
    const idx=siteCustomFaqs.findIndex(x=>x&&x.id===id);
    if(idx<0) return;
    siteCustomFaqs[idx]=Object.assign({},item,{active:false,archived:true,archivedAt:new Date().toISOString()});
    renderSiteCustomFaqs();
    renderSiteAdminPanel();
    await saveSiteSettings({recordVersion:true,reason:'В корзину: '+(item.question||id)});
  };

  window.resetSiteThemeConfig=async function(){
    if(!siteAdminMode) return;
    if(!confirm('Вернуть фирменные цвета темы по умолчанию?')) return;
    siteThemeConfig={};
    applySiteThemeConfig();
    renderSiteAdminPanel();
    await saveSiteSettings({recordVersion:true,reason:'Сброшены цвета темы'});
  };

  const themeObserver=new MutationObserver(()=>applySiteThemeConfig());
  themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});


  let siteElementPickMode=false;
  let siteElementPickHover=null;

  function protectedElement(el){
    return !el || el.closest('#siteAdminPanel,#siteAdminLoginModal,#siteAdminReopen,#siteAdminEntityModal,#enrollModal,#leavingSiteModal,.consent-block,[data-payment-protected]');
  }
  function clearPickHover(){
    if(siteElementPickHover) siteElementPickHover.classList.remove('site-admin-pick-target');
    siteElementPickHover=null;
  }
  window.toggleSiteElementPicker=function(force){
    if(!siteAdminMode) return openSiteAdminLogin();
    siteElementPickMode=typeof force==='boolean'?force:!siteElementPickMode;
    document.body.classList.toggle('site-admin-pick-mode',siteElementPickMode);
    clearPickHover();
    const b=document.getElementById('siteAdminPickerBtn');
    if(b) b.classList.toggle('active',siteElementPickMode);
    siteAdminSetStatus(siteElementPickMode?'Выберите элемент на странице':'Выбор элемента выключен','ok');
  };
  function elementRecordKey(el){
    return siteCssPath(el);
  }
  function safeEditorHref(value){
    const s=String(value||'').trim();
    if(!s) return '';
    if(/^#/.test(s) || /^(\.\.?\/|\/)/.test(s)) return s;
    if(/^(mailto:|tel:)/i.test(s)) return s;
    try{
      const u=new URL(s,location.href);
      return (u.protocol==='https:'||u.protocol==='http:')?u.href:'';
    }catch(_){return '';}
  }
  function safeEditorMediaUrl(value){
    const s=String(value||'').trim();
    if(!s) return '';
    if(/^(\.\.?\/|\/)/.test(s)) return s;
    try{
      const u=new URL(s,location.href);
      return (u.protocol==='https:'||u.protocol==='http:')?u.href:'';
    }catch(_){return '';}
  }
  function applySiteAttributeOverrides(){
    Object.values(siteAttributeOverrides||{}).forEach(rec=>{
      if(!rec||!rec.selector) return;
      let el=null; try{el=document.querySelector(rec.selector);}catch(_){}
      if(!el) return;
      if(rec.href!=null && el.matches('a')) {
        const href=safeEditorHref(rec.href);
        if(href||String(rec.href||'').trim()==='') el.setAttribute('href',href);
      }
      if(rec.src!=null && el.matches('img')) {
        const src=safeEditorMediaUrl(rec.src);
        if(src||String(rec.src||'').trim()==='') el.setAttribute('src',src);
      }
      if(rec.alt!=null && el.matches('img')) el.setAttribute('alt',rec.alt);
      if(rec.title!=null) el.setAttribute('title',rec.title);
      el.classList.remove('site-admin-force-hidden','site-admin-preview-hidden');
      if(rec.hidden===true) el.classList.add(siteAdminMode?'site-admin-preview-hidden':'site-admin-force-hidden');
    });
  }
  window.applySiteAttributeOverrides=applySiteAttributeOverrides;

  window.openSiteElementEditor=function(el){
    if(!siteAdminMode||!el||protectedElement(el)) return;
    const selector=elementRecordKey(el); if(!selector) return;
    entityType='element'; entityId=selector;
    const prev=siteAttributeOverrides[selector]||{};
    const modal=ensureModal();
    modal.querySelector('#siteEntityTitle').textContent='Настроить элемент';
    let html=field('title','Подсказка / title',prev.title??el.getAttribute('title')??'','text',true);
    if(el.matches('a')) html+=field('href','Ссылка',prev.href??el.getAttribute('href')??'','text',true);
    if(el.matches('img')){
      html+=field('src','Путь к изображению',prev.src??el.getAttribute('src')??'','text',true);
      html+=field('alt','Описание изображения',prev.alt??el.getAttribute('alt')??'','text',true);
    }
    html+=field('hidden','Видимость',prev.hidden===true?'yes':'no','select',false,[['no','Показывать'],['yes','Скрыть']]);
    modal.querySelector('#siteEntityFields').innerHTML=html;
    modal.classList.add('active');
  };
  document.addEventListener('mouseover',e=>{
    if(!siteElementPickMode||protectedElement(e.target)) return;
    clearPickHover(); siteElementPickHover=e.target; siteElementPickHover.classList.add('site-admin-pick-target');
  },true);
  document.addEventListener('click',e=>{
    if(!siteElementPickMode||protectedElement(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    const el=e.target.closest('a,img,button,[id],section,article,div')||e.target;
    toggleSiteElementPicker(false);
    openSiteElementEditor(el);
  },true);

  window.openSiteProgramEditor=function(id){
    if(!siteAdminMode) return openSiteAdminLogin();
    entityType='program'; entityId=id||'';
    const p=id?findProgram(id):null;
    const modal=ensureModal();
    modal.querySelector('#siteEntityTitle').textContent=p?'Редактировать программу':'Добавить программу';
    modal.querySelector('#siteEntityFields').innerHTML=
      field('title_ru','Название программы',p&&p.title_ru,'text',true)+
      field('desc_ru','Краткое описание',p&&p.desc_ru,'textarea',true)+
      field('type','Тип программы',p&&p.type,'text',false)+
      field('hours','Объём / часы',p&&p.hours,'text',false)+
      field('format','Формат обучения',p&&p.format,'text',true)+
      field('dates','Сроки / даты',p&&p.dates,'text',false)+
      field('price','Стоимость',p&&p.price,'text',false)+
      field('tab','Раздел',p&&p.tab||'tab-pk','select',false,[['tab-pk','Повышение квалификации'],['tab-pp','Профессиональная переподготовка'],['tab-po','Профессиональное обучение'],['tab-sem','Семинары'],['tab-kadry','Нацпроект «Кадры»']])+
      field('sector','Направление',p&&p.sector||'prof','select',false,[['gos','Государственное управление'],['biz','Бизнес и управление'],['horeca','Туризм / HoReCa'],['prof','Профессиональное развитие']])+
      field('pdf_link','Ссылка на учебный план / PDF',p&&p.pdf_link,'url',true)+
      field('long_desc_ru','Подробное описание',p&&p.long_desc_ru,'textarea',true)+
      field('audience_ru','Для кого',p&&p.audience_ru,'textarea',true)+
      field('goal_ru','Цель программы',p&&p.goal_ru,'textarea',true)+
      field('outcomes_ru','Результаты обучения',p&&p.outcomes_ru,'textarea',true)+
      field('topics_ru','Содержание программы',p&&p.topics_ru,'textarea',true);
    modal.classList.add('active');
    modal.querySelector('input,textarea,select')?.focus();
  };
  window.openSiteContactEditor=function(id){
    if(!siteAdminMode) return openSiteAdminLogin();
    entityType='contact'; entityId=id||'';
    const c=id?findContact(id):null;
    const modal=ensureModal();
    modal.querySelector('#siteEntityTitle').textContent=c?'Редактировать контакт':'Добавить контакт';
    modal.querySelector('#siteEntityFields').innerHTML=
      field('name','ФИО',c&&c.name,'text',true)+
      field('position','Должность',c&&c.position,'text',true)+
      field('department','Подразделение / отдел',c&&c.department,'text',true)+
      field('office','Кабинет',c&&c.office,'text',false)+
      field('phone','Телефон',c&&c.phone,'text',false)+
      field('extension','Добавочный',c&&c.extension,'text',false)+
      field('email','E-mail',c&&c.email,'email',false);
    modal.classList.add('active');
    modal.querySelector('input,textarea,select')?.focus();
  };

  window.closeSiteEntityEditor=function(){
    if(entityModal) entityModal.classList.remove('active');
    entityType=''; entityId='';
  };

  function formObject(form){
    const out={};
    new FormData(form).forEach((v,k)=>{out[k]=String(v||'').trim();});
    return out;
  }

  async function saveSiteEntityEditor(event){
    event.preventDefault();
    if(!siteAdminMode) return;
    const data=formObject(event.currentTarget);
    if(entityType==='program'){
      if(!data.title_ru){ siteAdminSetStatus('Укажите название программы','err'); return; }
      const id=entityId||makeId('custom-p-');
      const prev=findProgram(id)||{};
      const record=Object.assign({},prev,data,{id,active:prev&&prev.active===false?false:true,custom:true,title_en:prev.title_en||data.title_ru,desc_en:prev.desc_en||data.desc_ru});
      const before=siteCustomPrograms.slice();
      const idx=siteCustomPrograms.findIndex(x=>x&&x.id===id);
      if(idx>=0) siteCustomPrograms[idx]=record; else siteCustomPrograms.push(record);
      applySiteCustomContent();
      renderSiteAdminPanel();
      const saved=await saveSiteSettings({recordVersion:true,reason:(entityId?'Изменена':'Добавлена')+' программа: '+record.title_ru});
      if(!saved){siteCustomPrograms=before;applySiteCustomContent();renderSiteAdminPanel();return;}
      siteAdminSetStatus('Программа сохранена','ok');
    } else if(entityType==='contact'){
      if(!data.name){ siteAdminSetStatus('Укажите ФИО','err'); return; }
      const id=entityId||makeId('custom-c-');
      const prev=findContact(id)||{};
      const record=Object.assign({},prev,data,{id,custom:true});
      const before=siteCustomContacts.slice();
      const idx=siteCustomContacts.findIndex(x=>x&&x.id===id);
      if(idx>=0) siteCustomContacts[idx]=record; else siteCustomContacts.push(record);
      applySiteCustomContent();
      renderSiteAdminPanel();
      const saved=await saveSiteSettings({recordVersion:true,reason:(entityId?'Изменён':'Добавлен')+' контакт: '+record.name});
      if(!saved){siteCustomContacts=before;applySiteCustomContent();renderSiteAdminPanel();return;}
      siteAdminSetStatus('Контакт сохранён','ok');
    } else if(entityType==='faq'){
      if(!data.question){ siteAdminSetStatus('Укажите вопрос','err'); return; }
      const id=entityId||makeId('custom-faq-');
      const prev=findFaq(id)||{};
      const record=Object.assign({},prev,data,{id,active:prev&&prev.active===false?false:true,custom:true});
      const before=siteCustomFaqs.slice();
      const idx=siteCustomFaqs.findIndex(x=>x&&x.id===id);
      if(idx>=0) siteCustomFaqs[idx]=record; else siteCustomFaqs.push(record);
      renderSiteCustomFaqs();
      renderSiteAdminPanel();
      const saved=await saveSiteSettings({recordVersion:true,reason:(entityId?'Изменён':'Добавлен')+' FAQ: '+record.question});
      if(!saved){siteCustomFaqs=before;renderSiteCustomFaqs();renderSiteAdminPanel();return;}
      siteAdminSetStatus('FAQ сохранён','ok');
    } else if(entityType==='element'){
      const selector=entityId;
      const prev=siteAttributeOverrides[selector]||{};
      if(Object.prototype.hasOwnProperty.call(data,'href') && data.href && !safeEditorHref(data.href)){
        siteAdminSetStatus('Недопустимая схема ссылки. Разрешены http, https, mailto, tel и внутренние ссылки.','err');
        return;
      }
      if(Object.prototype.hasOwnProperty.call(data,'src') && data.src && !safeEditorMediaUrl(data.src)){
        siteAdminSetStatus('Недопустимый адрес изображения. Разрешены http, https и внутренние пути.','err');
        return;
      }
      const rec=Object.assign({},prev,{selector,title:data.title||'',hidden:data.hidden==='yes'});
      if(Object.prototype.hasOwnProperty.call(data,'href')) rec.href=data.href;
      if(Object.prototype.hasOwnProperty.call(data,'src')) rec.src=data.src;
      if(Object.prototype.hasOwnProperty.call(data,'alt')) rec.alt=data.alt;
      const hadPrev=Object.prototype.hasOwnProperty.call(siteAttributeOverrides,selector);
      const before=hadPrev?Object.assign({},siteAttributeOverrides[selector]):null;
      siteAttributeOverrides[selector]=rec;
      applySiteAttributeOverrides();
      const saved=await saveSiteSettings({recordVersion:true,reason:'Изменён элемент: '+selector});
      if(!saved){
        if(hadPrev)siteAttributeOverrides[selector]=before;else delete siteAttributeOverrides[selector];
        applySiteAttributeOverrides();
        return;
      }
      siteAdminSetStatus('Элемент сохранён','ok');
    }
    closeSiteEntityEditor();
  }
  window.deleteSiteCustomProgram=async function(id){
    if(typeof siteWorkflowDelete==='function') return siteWorkflowDelete('programs',id);
    const item=findProgram(id); if(!item) return;
    if(!confirm('Переместить программу «'+(item.title_ru||id)+'» в корзину?')) return;
    const idx=siteCustomPrograms.findIndex(x=>x&&String(x.id)===String(id));
    if(idx<0) return;
    siteCustomPrograms[idx]=Object.assign({},siteCustomPrograms[idx],{active:false,archived:true,archivedAt:new Date().toISOString()});
    applySiteCustomContent();
    renderSiteAdminPanel();
    await saveSiteSettings({recordVersion:true,reason:'В корзину: '+(item.title_ru||id)});
  };

  window.deleteSiteCustomContact=async function(id){
    if(typeof siteWorkflowDelete==='function') return siteWorkflowDelete('contacts',id);
    const item=findContact(id); if(!item) return;
    if(!confirm('Переместить контакт «'+(item.name||id)+'» в корзину?')) return;
    const idx=siteCustomContacts.findIndex(x=>x&&x.id===id);
    if(idx<0) return;
    siteCustomContacts[idx]=Object.assign({},item,{active:false,archived:true,archivedAt:new Date().toISOString()});
    applySiteCustomContent();
    renderSiteAdminPanel();
    await saveSiteSettings({recordVersion:true,reason:'В корзину: '+(item.name||id)});
  };

  function programCatalogForAdmin(){
    const map=new Map();
    (Array.isArray(basePrograms)?basePrograms:[]).forEach(p=>{if(p&&p.id)map.set(String(p.id),Object.assign({},p));});
    (siteCustomPrograms||[]).forEach(p=>{
      if(!p||!p.id)return;
      const pid=String(p.id),base=map.get(pid)||{};
      map.set(pid,Object.assign({},base,p));
    });
    return [...map.values()].filter(p=>p&&p.archived!==true).sort((a,b)=>{
      const ao=Number.isFinite(Number(a.cmsOrder))?Number(a.cmsOrder):null;
      const bo=Number.isFinite(Number(b.cmsOrder))?Number(b.cmsOrder):null;
      if(ao!==null&&bo!==null&&ao!==bo)return ao-bo;
      if(ao!==null&&bo===null)return -1;
      if(ao===null&&bo!==null)return 1;
      return String(a.title_ru||'').localeCompare(String(b.title_ru||''),'ru');
    });
  }

  function upsertProgramOverride(id,patch){
    const pid=String(id),idx=(siteCustomPrograms||[]).findIndex(x=>x&&String(x.id)===pid);
    if(idx>=0) siteCustomPrograms[idx]=Object.assign({},siteCustomPrograms[idx],patch,{id:pid,custom:true});
    else siteCustomPrograms.push(Object.assign({id:pid,custom:true},patch));
  }

  window.siteProgramSetPublished=async function(id,published){
    const current=findProgram(id);if(!current)return;
    const before=siteCustomPrograms.map(x=>x&&Object.assign({},x));
    upsertProgramOverride(id,{active:!!published,archived:false});
    applySiteCustomContent();renderSiteAdminPanel();
    const ok=await saveSiteSettings({recordVersion:true,reason:(published?'Опубликована программа: ':'Программа в черновик: ')+(current.title_ru||id)});
    if(!ok){siteCustomPrograms=before;applySiteCustomContent();renderSiteAdminPanel();}
  };

  window.siteProgramDuplicateAny=async function(id){
    const src=findProgram(id);if(!src)return;
    const before=siteCustomPrograms.map(x=>x&&Object.assign({},x));
    const copy=JSON.parse(JSON.stringify(src));
    copy.id=makeId('custom-p-');copy.custom=true;copy.active=false;copy.archived=false;
    delete copy.archivedAt;
    copy.title_ru=(copy.title_ru||'Программа')+' — копия';
    siteCustomPrograms.push(copy);
    applySiteCustomContent();renderSiteAdminPanel();
    const ok=await saveSiteSettings({recordVersion:true,reason:'Создана копия программы: '+copy.title_ru});
    if(!ok){siteCustomPrograms=before;applySiteCustomContent();renderSiteAdminPanel();return;}
    openSiteProgramEditor(copy.id);
  };

  window.siteProgramMoveAny=async function(id,dir){
    const list=programCatalogForAdmin(),i=list.findIndex(x=>x&&String(x.id)===String(id)),j=i+Number(dir);
    if(i<0||j<0||j>=list.length)return;
    [list[i],list[j]]=[list[j],list[i]];
    const before=siteCustomPrograms.map(x=>x&&Object.assign({},x));
    list.forEach((p,index)=>upsertProgramOverride(p.id,{cmsOrder:index}));
    applySiteCustomContent();renderSiteAdminPanel();
    const ok=await saveSiteSettings({recordVersion:true,reason:'Изменён порядок программ'});
    if(!ok){siteCustomPrograms=before;applySiteCustomContent();renderSiteAdminPanel();}
  };

  function managerHtml(){
    const owlItems=[
      ['owl_menu_test','Тест на профориентацию'],
      ['owl_menu_catalog','Кратко обо всех программах'],
      ['owl_menu_news','Новости центра'],
      ['owl_menu_schedule','Расписание занятий'],
      ['owl_menu_contacts','Контакты руководства'],
      ['owl_menu_ai','AR-Лаборатория: Практика ИИ']
    ].map(item=>
      '<label class="site-admin-owl-row"><span>'+esc(item[1])+'</span><input type="checkbox" data-site-entity-visibility="'+esc(item[0])+'"'+(siteKeyIsVisible(item[0])?' checked':'')+'></label>'
    ).join('');

    const programList=programCatalogForAdmin();
    const programs=programList.map((p,index)=>{
      const key='program:'+p.id;
      const isCustom=(siteCustomPrograms||[]).some(x=>x&&String(x.id)===String(p.id));
      const draft=p.active===false;
      return '<div class="site-admin-row"><span>'+esc(p.title_ru||p.id)+(isCustom?' · PRO':'')+(draft?' · ЧЕРНОВИК':'')+'</span><label class="site-admin-switch"><input type="checkbox" data-site-entity-visibility="'+esc(key)+'"'+(siteKeyIsVisible(key)?' checked':'')+'><span class="site-admin-slider"></span></label></div>'+
      '<div class="site-admin-entity-actions">'+
      '<button type="button" '+(index===0?'disabled':'')+' onclick="siteProgramMoveAny(\''+esc(p.id)+'\',-1)">↑</button>'+
      '<button type="button" '+(index===programList.length-1?'disabled':'')+' onclick="siteProgramMoveAny(\''+esc(p.id)+'\',1)">↓</button>'+
      '<button type="button" onclick="siteProgramSetPublished(\''+esc(p.id)+'\','+(draft?'true':'false')+')">'+(draft?'Опубликовать':'В черновик')+'</button>'+
      '<button type="button" onclick="siteProgramDuplicateAny(\''+esc(p.id)+'\')">Дублировать</button>'+
      '<button type="button" onclick="openSiteProgramEditor(\''+esc(p.id)+'\')">Редактировать</button>'+
      (isCustom?'<button type="button" class="danger" onclick="deleteSiteCustomProgram(\''+esc(p.id)+'\')">В корзину</button>':'')+
      '</div>';
    }).join('')||'<div class="site-admin-entity-empty">Программы пока не загружены.</div>';

    const contacts=(siteCustomContacts||[]).map(c=>{
      const key='contact:'+encodeURIComponent(c.id);
      return '<div class="site-admin-row"><span>'+esc(c.name||c.id)+(c.position?' · '+esc(c.position):'')+'</span><label class="site-admin-switch"><input type="checkbox" data-site-entity-visibility="'+esc(key)+'"'+(siteKeyIsVisible(key)?' checked':'')+'><span class="site-admin-slider"></span></label></div>'+
      '<div class="site-admin-entity-actions"><button type="button" onclick="openSiteContactEditor(\''+esc(c.id)+'\')">Редактировать</button><button type="button" class="danger" onclick="deleteSiteCustomContact(\''+esc(c.id)+'\')">Удалить</button></div>';
    }).join('')||'<div class="site-admin-entity-empty">Добавленных вручную контактов пока нет.</div>';

    const faqs=(siteCustomFaqs||[]).map(f=>{
      const key='faq:'+f.id;
      return '<div class="site-admin-row"><span>'+esc(f.question||f.id)+'</span><label class="site-admin-switch"><input type="checkbox" data-site-entity-visibility="'+esc(key)+'"'+(siteKeyIsVisible(key)?' checked':'')+'><span class="site-admin-slider"></span></label></div>'+
      '<div class="site-admin-entity-actions"><button type="button" onclick="openSiteFaqEditor(\''+esc(f.id)+'\')">Редактировать</button><button type="button" class="danger" onclick="deleteSiteCustomFaq(\''+esc(f.id)+'\')">Удалить</button></div>';
    }).join('')||'<div class="site-admin-entity-empty">Добавленных вручную вопросов пока нет.</div>';

    const cfg=Object.assign({},SITE_THEME_DEFAULTS,siteThemeConfig||{});
    const themeDefs=[
      ['accent','Акцент / бордовый'],['burgundy','Тёмный бордовый'],['blue','Фирменный синий'],
      ['darkBg','Тёмная: фон'],['darkCard','Тёмная: карточки'],['darkText','Тёмная: текст'],['darkMuted','Тёмная: вторичный текст'],
      ['lightBg','Светлая: фон'],['lightCard','Светлая: карточки'],['lightText','Светлая: текст'],['lightMuted','Светлая: вторичный текст']
    ];
    const themeHtml=themeDefs.map(d=>'<label class="site-admin-theme-field"><span>'+esc(d[1])+'</span><input type="color" data-site-theme-color="'+esc(d[0])+'" value="'+esc(colorValue(cfg[d[0]],SITE_THEME_DEFAULTS[d[0]]))+'"></label>').join('');

    return '<details class="site-admin-group site-admin-entity-group" data-site-admin-group="Дизайн сайта" open><summary>🎨 Дизайн сайта</summary><div class="site-admin-theme-grid">'+themeHtml+'<button type="button" class="site-admin-theme-reset" onclick="resetSiteThemeConfig()">Вернуть фирменные цвета</button></div></details>'+
      '<details class="site-admin-group site-admin-entity-group" data-site-admin-group="Сова: кнопки меню" open><summary>Сова: кнопки меню</summary><div class="site-admin-owl-grid">'+owlItems+'</div></details>'+
      '<details class="site-admin-group site-admin-entity-group" data-site-admin-group="Ручные программы"><summary>Программы — управление ('+(siteCustomPrograms||[]).length+')</summary><button type="button" class="site-admin-entity-add" onclick="openSiteProgramEditor()">＋ Добавить программу</button>'+programs+'</details>'+
      '<details class="site-admin-group site-admin-entity-group" data-site-admin-group="Ручные контакты"><summary>Контакты — ручное управление ('+(siteCustomContacts||[]).length+')</summary><button type="button" class="site-admin-entity-add" onclick="openSiteContactEditor()">＋ Добавить контакт</button>'+contacts+'</details>'+
      '<details class="site-admin-group site-admin-entity-group" data-site-admin-group="FAQ — ручное управление"><summary>FAQ — ручное управление ('+(siteCustomFaqs||[]).length+')</summary><button type="button" class="site-admin-entity-add" onclick="openSiteFaqEditor()">＋ Добавить вопрос</button>'+faqs+'</details>';
  }

  const originalVisibilityTargets=siteVisibilityTargets;
  siteVisibilityTargets=function(){
    const out=originalVisibilityTargets();
    (siteCustomFaqs||[]).forEach(f=>{
      if(!f||!f.id) return;
      out.push({
        key:'faq:'+f.id,
        label:f.question||f.id,
        group:'FAQ: добавленные вопросы',
        selector:'[data-site-faq-id="'+String(f.id).replace(/"/g,'\\\"')+'"]'
      });
    });
    return out;
  };

  const originalApplySiteCustomContent=applySiteCustomContent;
  applySiteCustomContent=function(){
    originalApplySiteCustomContent();
    renderSiteCustomFaqs();
    applySiteThemeConfig();
    applySiteAttributeOverrides();
  };

  function ensurePickerButton(){
    const tools=document.querySelector('#siteAdminPanel .site-admin-tools');
    if(!tools||document.getElementById('siteAdminPickerBtn')) return;
    const btn=document.createElement('button');
    btn.type='button'; btn.id='siteAdminPickerBtn'; btn.textContent='🧩 Выбрать элемент';
    btn.onclick=()=>toggleSiteElementPicker();
    tools.appendChild(btn);
  }

  const originalRender=renderSiteAdminPanel;
  renderSiteAdminPanel=function(){
    originalRender();
    ensurePickerButton();
    const box=document.getElementById('siteAdminControls');
    if(!box) return;
    box.insertAdjacentHTML('beforeend',managerHtml());
    box.querySelectorAll('input[data-site-entity-visibility]').forEach(input=>{
      input.addEventListener('change',()=>{
        setSiteVisibility(input.dataset.siteEntityVisibility,input.checked);
      });
    });
    box.querySelectorAll('input[data-site-theme-color]').forEach(input=>{
      const key=input.dataset.siteThemeColor;
      input.addEventListener('input',()=>{
        siteThemeConfig=Object.assign({},siteThemeConfig||{},{[key]:input.value});
        applySiteThemeConfig();
      });
      input.addEventListener('change',()=>{
        scheduleSiteSettingsSave('Изменены цвета темы');
      });
    });
  };

  ensureStyles();
  ensurePickerButton();
  renderSiteCustomFaqs();
  applySiteThemeConfig();
  applySiteAttributeOverrides();
})();
