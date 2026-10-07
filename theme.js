(function(){
  'use strict';
  const KEY='ranepa-theme';
  const THEME_PUBLIC_DATA_API='https://ranepa-dpo-public-api.onrender.com';
  const SETTINGS_ID='__site_admin_settings__';
  const root=document.documentElement;
  const DEFAULTS={
    accent:'#CA0F3E',burgundy:'#881337',blue:'#1E3A8A',
    darkBg:'#05080E',darkCard:'#111827',darkText:'#F8FAFC',darkMuted:'#94A3B8',
    lightBg:'#F1F5F9',lightCard:'#FFFFFF',lightText:'#0F172A',lightMuted:'#475569'
  };
  let settings={};
  let saved=null;
  try{saved=localStorage.getItem(KEY);}catch(e){}
  root.setAttribute('data-theme',saved==='light'?'light':'dark');

  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const color=(v,f)=>/^#[0-9a-f]{6}$/i.test(String(v||''))?String(v).toUpperCase():f;
  function rgba(hex,a){
    const h=color(hex,'#111827').slice(1),n=parseInt(h,16);
    return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';
  }
  function applyThemeConfig(){
    const cfg=Object.assign({},DEFAULTS,settings.theme||{});
    const light=root.getAttribute('data-theme')==='light';
    const bg=color(light?cfg.lightBg:cfg.darkBg,light?DEFAULTS.lightBg:DEFAULTS.darkBg);
    const card=color(light?cfg.lightCard:cfg.darkCard,light?DEFAULTS.lightCard:DEFAULTS.darkCard);
    const text=color(light?cfg.lightText:cfg.darkText,light?DEFAULTS.lightText:DEFAULTS.darkText);
    const muted=color(light?cfg.lightMuted:cfg.darkMuted,light?DEFAULTS.lightMuted:DEFAULTS.darkMuted);
    root.style.setProperty('--ranepa-red',color(cfg.accent,DEFAULTS.accent));
    root.style.setProperty('--ranepa-burgundy',color(cfg.burgundy,DEFAULTS.burgundy));
    root.style.setProperty('--ranepa-rich-blue',color(cfg.blue,DEFAULTS.blue));
    root.style.setProperty('--bg',bg); root.style.setProperty('--bg-deep',bg);
    root.style.setProperty('--card',card); root.style.setProperty('--bg-card',rgba(card,light?.96:.68));
    root.style.setProperty('--glass',card); root.style.setProperty('--bg-glass',rgba(card,light?.93:.80));
    root.style.setProperty('--text',text); root.style.setProperty('--text-main',text);
    root.style.setProperty('--muted',muted); root.style.setProperty('--text-muted',muted);
  }
  function apply(next){
    root.setAttribute('data-theme',next);
    try{localStorage.setItem(KEY,next);}catch(e){}
    document.querySelectorAll('[data-theme-toggle]').forEach(b=>{
      b.setAttribute('aria-label',next==='dark'?'Включить светлую тему':'Включить тёмную тему');
      b.setAttribute('title',next==='dark'?'Светлая тема':'Тёмная тема');
      b.textContent=next==='dark'?'☀':'☾';
    });
    applyThemeConfig();
  }
  function setText(el,value){
    if(!el) return;
    el.textContent=String(value??'');
  }
  function applyContent(){
    const content=settings.content&&typeof settings.content==='object'?settings.content:{};
    Object.keys(content).forEach(key=>{
      const rec=content[key];
      const value=rec&&typeof rec==='object'?(rec.ru??rec.en):null;
      if(value==null) return;
      if(key.startsWith('custom:')){
        document.querySelectorAll('[data-site-edit-key="'+CSS.escape(key.slice(7))+'"]').forEach(el=>setText(el,value));
      }else if(key.startsWith('i18n:')){
        document.querySelectorAll('[data-i18n="'+CSS.escape(key.slice(5))+'"]').forEach(el=>setText(el,value));
      }
    });
  }
  function applySeo(){
    const path=location.pathname==='/'?'/':location.pathname;
    const cfg=settings.seo&&typeof settings.seo==='object'?(settings.seo[path]||{}):{};
    if(cfg.title) document.title=cfg.title;
    function m(sel,a,n,v){if(!v)return;let e=document.querySelector(sel);if(!e){e=document.createElement('meta');e.setAttribute(a,n);document.head.appendChild(e);}e.content=v;}
    m('meta[name="description"]','name','description',cfg.description);
    m('meta[property="og:title"]','property','og:title',cfg.ogTitle||cfg.title);
    m('meta[property="og:description"]','property','og:description',cfg.ogDescription||cfg.description);
    if(cfg.canonical){let l=document.querySelector('link[rel="canonical"]');if(!l){l=document.createElement('link');l.rel='canonical';document.head.appendChild(l);}l.href=cfg.canonical;}
  }
  function applyAttributes(){
    const attrs=settings.attributes&&typeof settings.attributes==='object'?settings.attributes:{};
    Object.values(attrs).forEach(rec=>{
      if(!rec||!rec.selector) return;
      let el=null; try{el=document.querySelector(rec.selector);}catch(_){}
      if(!el||el.closest('[data-payment-protected]')) return;
      if(rec.href!=null&&el.matches('a')) el.setAttribute('href',rec.href);
      if(rec.src!=null&&el.matches('img')) el.setAttribute('src',rec.src);
      if(rec.alt!=null&&el.matches('img')) el.setAttribute('alt',rec.alt);
      if(rec.title!=null) el.setAttribute('title',rec.title);
      if(rec.hidden===true) el.style.display='none';
    });
  }
  function visible(key){return !(settings.visibility&&settings.visibility[key]===false);}
  function applyVisibility(){
    for(let i=1;i<=5;i++){
      document.querySelectorAll('[data-site-faq-static="'+i+'"]').forEach(el=>{el.style.display=visible('faq_static_'+i)?'':'none';});
    }
    const list=document.querySelector('.faq-list');
    if(list) list.style.display=visible('faq')?'':'none';
    document.querySelectorAll('[data-site-visibility-key]').forEach(el=>{
      const key=String(el.getAttribute('data-site-visibility-key')||'').trim();
      if(!key) return;
      el.style.display=visible(key)?'':'none';
    });
  }
  function renderCustomNav(){
    document.querySelectorAll('.site-custom-nav-item').forEach(n=>n.remove());
    const nav=document.querySelector('.page-nav,.audience-nav,.header-nav');if(!nav)return;
    const before=nav.querySelector('.nav-enroll,.header-nav-btn');
    (Array.isArray(settings.customNavItems)?settings.customNavItems:[]).forEach(x=>{if(!x||x.active===false||!visible('nav-custom:'+x.id))return;const a=document.createElement('a');a.className='site-custom-nav-item';a.textContent=x.label||'Новый пункт';a.href=x.url||'#';if(x.newTab){a.target='_blank';a.rel='noopener noreferrer'}nav.insertBefore(a,before||null)});
  }
  function renderCustomFaqs(){
    const target=document.querySelector('.faq-list');
    if(!target) return;
    target.querySelectorAll('.site-custom-faq').forEach(n=>n.remove());
    (Array.isArray(settings.customFaqs)?settings.customFaqs:[]).forEach(f=>{
      if(!f||!f.id||f.active===false||!visible('faq:'+f.id)) return;
      const d=document.createElement('details');
      d.className='faq-item site-custom-faq';
      d.dataset.siteFaqId=f.id;
      d.innerHTML='<summary>'+esc(f.question||'Новый вопрос')+'</summary><div class="faq-answer">'+esc(f.answer||'')+'</div>';
      target.appendChild(d);
    });
  }
  async function loadSettings(){
    try{
      const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8000);
      try{
        const res=await fetch(THEME_PUBLIC_DATA_API+'/settings?_='+Date.now(),{cache:'no-store',signal:ctl.signal,referrerPolicy:'no-referrer'});
        if(!res.ok) throw new Error('HTTP '+res.status);
        const data=await res.json();
        settings=data?.settings||{};
      }finally{clearTimeout(timer);}
    }catch(_){
      try{
        const res=await fetch('./site-settings.json?v='+Math.floor(Date.now()/60000),{cache:'no-store'});
        const data=await res.json(); settings=data?.settings||{};
      }catch(_){settings={};}
    }
    applyThemeConfig(); applyContent(); applyAttributes(); applyVisibility(); renderCustomNav(); renderCustomFaqs(); applySeo();
  }
  function mount(){
    const nativeThemeButton=document.getElementById('themeBtn');
    let buttons=[...document.querySelectorAll('[data-theme-toggle]')];
    if(!buttons.length && !nativeThemeButton){
      const b=document.createElement('button');
      b.type='button'; b.className='site-theme-toggle'; b.setAttribute('data-theme-toggle','');
      document.body.appendChild(b); buttons=[b];
    }
    buttons.forEach(b=>{
      if(b.dataset.themeBound==='1') return;
      b.dataset.themeBound='1';
      b.addEventListener('click',()=>apply(root.getAttribute('data-theme')==='light'?'dark':'light'));
    });
    if(nativeThemeButton){
      applyThemeConfig();
    }else{
      apply(root.getAttribute('data-theme')==='light'?'light':'dark');
    }
    loadSettings();
  }
  new MutationObserver(()=>applyThemeConfig()).observe(root,{attributes:true,attributeFilter:['data-theme']});
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount):mount();
})();