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
      const record=Object.assign({},prev,data,{id,active:true,custom:true,title_en:prev.title_en||data.title_ru,desc_en:prev.desc_en||data.desc_ru});
      const idx=siteCustomPrograms.findIndex(x=>x&&x.id===id);
      if(idx>=0) siteCustomPrograms[idx]=record; else siteCustomPrograms.push(record);
      applySiteCustomContent();
      renderSiteAdminPanel();
      await saveSiteSettings({recordVersion:true,reason:(entityId?'Изменена':'Добавлена')+' программа: '+record.title_ru});
      siteAdminSetStatus('Программа сохранена','ok');
    } else if(entityType==='contact'){
      if(!data.name){ siteAdminSetStatus('Укажите ФИО','err'); return; }
      const id=entityId||makeId('custom-c-');
      const prev=findContact(id)||{};
      const record=Object.assign({},prev,data,{id,custom:true});
      const idx=siteCustomContacts.findIndex(x=>x&&x.id===id);
      if(idx>=0) siteCustomContacts[idx]=record; else siteCustomContacts.push(record);
      applySiteCustomContent();
      renderSiteAdminPanel();
      await saveSiteSettings({recordVersion:true,reason:(entityId?'Изменён':'Добавлен')+' контакт: '+record.name});
      siteAdminSetStatus('Контакт сохранён','ok');
    }
    closeSiteEntityEditor();
  }
  window.deleteSiteCustomProgram=async function(id){
    const item=findProgram(id); if(!item) return;
    if(!confirm('Удалить программу «'+(item.title_ru||id)+'»?')) return;
    siteCustomPrograms=siteCustomPrograms.filter(x=>!x||x.id!==id);
    delete siteVisibility['program:'+id];
    applySiteCustomContent();
    renderSiteAdminPanel();
    await saveSiteSettings({recordVersion:true,reason:'Удалена программа: '+(item.title_ru||id)});
  };

  window.deleteSiteCustomContact=async function(id){
    const item=findContact(id); if(!item) return;
    if(!confirm('Удалить контакт «'+(item.name||id)+'»?')) return;
    siteCustomContacts=siteCustomContacts.filter(x=>!x||x.id!==id);
    delete siteVisibility['contact:'+encodeURIComponent(id)];
    applySiteCustomContent();
    renderSiteAdminPanel();
    await saveSiteSettings({recordVersion:true,reason:'Удалён контакт: '+(item.name||id)});
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

    const allProgramMap=new Map();
    (Array.isArray(globalPrograms)?globalPrograms:[]).forEach(p=>{if(p&&p.id) allProgramMap.set(String(p.id),p);});
    (siteCustomPrograms||[]).forEach(p=>{if(p&&p.id) allProgramMap.set(String(p.id),p);});
    const programs=[...allProgramMap.values()].map(p=>{
      const key='program:'+p.id;
      const isCustom=(siteCustomPrograms||[]).some(x=>x&&String(x.id)===String(p.id));
      return '<div class="site-admin-row"><span>'+esc(p.title_ru||p.id)+(isCustom?' · PRO':'')+'</span><label class="site-admin-switch"><input type="checkbox" data-site-entity-visibility="'+esc(key)+'"'+(siteKeyIsVisible(key)?' checked':'')+'><span class="site-admin-slider"></span></label></div>'+
      '<div class="site-admin-entity-actions"><button type="button" onclick="openSiteProgramEditor(\''+esc(p.id)+'\')">Редактировать</button>'+(isCustom?'<button type="button" class="danger" onclick="deleteSiteCustomProgram(\''+esc(p.id)+'\')">Удалить PRO-версию</button>':'')+'</div>';
    }).join('')||'<div class="site-admin-entity-empty">Программы пока не загружены.</div>';

    const contacts=(siteCustomContacts||[]).map(c=>{
      const key='contact:'+encodeURIComponent(c.id);
      return '<div class="site-admin-row"><span>'+esc(c.name||c.id)+(c.position?' · '+esc(c.position):'')+'</span><label class="site-admin-switch"><input type="checkbox" data-site-entity-visibility="'+esc(key)+'"'+(siteKeyIsVisible(key)?' checked':'')+'><span class="site-admin-slider"></span></label></div>'+
      '<div class="site-admin-entity-actions"><button type="button" onclick="openSiteContactEditor(\''+esc(c.id)+'\')">Редактировать</button><button type="button" class="danger" onclick="deleteSiteCustomContact(\''+esc(c.id)+'\')">Удалить</button></div>';
    }).join('')||'<div class="site-admin-entity-empty">Добавленных вручную контактов пока нет.</div>';

    return '<details class="site-admin-group site-admin-entity-group" data-site-admin-group="Сова: кнопки меню" open><summary>Сова: кнопки меню</summary><div class="site-admin-owl-grid">'+owlItems+'</div></details>'+
      '<details class="site-admin-group site-admin-entity-group" data-site-admin-group="Ручные программы"><summary>Программы — ручное управление ('+(siteCustomPrograms||[]).length+')</summary><button type="button" class="site-admin-entity-add" onclick="openSiteProgramEditor()">＋ Добавить программу</button>'+programs+'</details>'+
      '<details class="site-admin-group site-admin-entity-group" data-site-admin-group="Ручные контакты"><summary>Контакты — ручное управление ('+(siteCustomContacts||[]).length+')</summary><button type="button" class="site-admin-entity-add" onclick="openSiteContactEditor()">＋ Добавить контакт</button>'+contacts+'</details>';
  }

  const originalRender=renderSiteAdminPanel;
  renderSiteAdminPanel=function(){
    originalRender();
    const box=document.getElementById('siteAdminControls');
    if(!box) return;
    box.insertAdjacentHTML('beforeend',managerHtml());
    box.querySelectorAll('input[data-site-entity-visibility]').forEach(input=>{
      input.addEventListener('change',()=>{
        setSiteVisibility(input.dataset.siteEntityVisibility,input.checked);
      });
    });
  };

  ensureStyles();
})();
