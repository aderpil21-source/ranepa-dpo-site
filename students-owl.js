(function(){
  'use strict';

  const HOME_OWL_URL='./index.html?owlEmbed=1';

  function mount(){
    if(document.getElementById('studentsOwlSystem')) return;

    const style=document.createElement('style');
    style.textContent=`
      .students-owl-system{
        position:fixed;right:-6px;bottom:0;z-index:14500;width:350px;height:270px;
        pointer-events:none;transform-origin:bottom right;
        transition:transform .4s cubic-bezier(.2,.8,.2,1),right .25s ease,bottom .25s ease;
      }
      .students-owl-system.scroll-mini{transform:scale(.82)}
      .students-owl-branch{
        position:absolute;bottom:5px;right:-18px;width:365px;height:auto;
        filter:drop-shadow(0 18px 24px rgba(0,0,0,.7));pointer-events:none;
      }
      .students-owl-hit{
        position:absolute;bottom:34px;left:0;width:100%;height:170px;border:0;padding:0;
        background:transparent;cursor:pointer;pointer-events:auto;z-index:2;overflow:visible;
      }
      .students-owl-media-stage{
        position:absolute;left:var(--owl-start-left,4px);bottom:-4px;width:260px;height:180px;
        pointer-events:none;overflow:visible;transform-origin:50% 100%;
        animation:studentsOwlBranchGlide 11s cubic-bezier(.42,0,.58,1) infinite;
        will-change:transform;
      }
      @keyframes studentsOwlBranchGlide{
        0%,6%{transform:translate3d(0,0,0)}
        46%,54%{transform:translate3d(var(--owl-travel-x,98px),0,0)}
        94%,100%{transform:translate3d(0,0,0)}
      }
      .students-owl-media-stage::after{
        content:"";position:absolute;left:50%;bottom:4px;width:92px;height:12px;
        transform:translateX(-50%) scaleX(.96);border-radius:50%;
        background:radial-gradient(ellipse at center,rgba(0,0,0,.34) 0%,rgba(0,0,0,.18) 42%,rgba(0,0,0,.06) 62%,rgba(0,0,0,0) 78%);
        filter:blur(5px);opacity:.62;pointer-events:none;
        animation:studentsOwlShadowGlide 11s cubic-bezier(.22,.61,.36,1) infinite,studentsOwlShadowBreath 8.9s ease-in-out infinite;
      }
      @keyframes studentsOwlShadowGlide{
        0%,6%,94%,100%{transform:translateX(-50%) scaleX(.92)}
        46%,54%{transform:translateX(-50%) scaleX(1.08)}
      }
      @keyframes studentsOwlShadowBreath{
        0%,100%{opacity:.60;filter:blur(5px)}
        33%{opacity:.52;filter:blur(6px)}
        68%{opacity:.66;filter:blur(4.5px)}
      }
      .students-owl-frame{
        position:absolute;left:50%;bottom:0;width:118px;height:158px;object-fit:contain;
        transform:translateX(-50%);pointer-events:none;user-select:none;-webkit-user-drag:none;
        filter:drop-shadow(0 22px 26px rgba(0,0,0,.48)) drop-shadow(0 8px 10px rgba(0,0,0,.30)) drop-shadow(0 2px 2px rgba(255,255,255,.08));
        animation:studentsOwlBreath 7.3s ease-in-out infinite,studentsOwlDepth 11.7s ease-in-out infinite;
        transform-origin:50% 100%;will-change:transform,filter;
      }
      @keyframes studentsOwlBreath{
        0%,100%{transform:translateX(-50%) translateY(0) scale(1)}
        28%{transform:translateX(-50%) translateY(-1.04px) scale(1.0052)}
        52%{transform:translateX(-50%) translateY(-2.47px) scale(1.013)}
        74%{transform:translateX(-50%) translateY(-.65px) scale(1.0039)}
      }
      @keyframes studentsOwlDepth{
        0%,100%{filter:drop-shadow(0 22px 26px rgba(0,0,0,.48)) drop-shadow(0 8px 10px rgba(0,0,0,.30)) drop-shadow(0 2px 2px rgba(255,255,255,.08))}
        37%{filter:drop-shadow(2px 24px 28px rgba(0,0,0,.44)) drop-shadow(-1px 9px 11px rgba(0,0,0,.28)) drop-shadow(0 2px 2px rgba(255,255,255,.10))}
        71%{filter:drop-shadow(-2px 21px 24px rgba(0,0,0,.50)) drop-shadow(1px 7px 9px rgba(0,0,0,.32)) drop-shadow(0 2px 2px rgba(255,255,255,.07))}
      }
      .students-owl-bubble{
        position:absolute;bottom:92%;left:50%;transform:translateX(-50%) scale(.5);
        background:var(--glass,var(--card,rgba(17,24,39,.86)));backdrop-filter:blur(15px);
        color:var(--text,#f8fafc);padding:9px 13px;border-radius:16px 16px 16px 0;
        font:800 .76rem Montserrat,Arial,sans-serif;box-shadow:0 15px 30px rgba(0,0,0,.36);
        opacity:0;transition:all .4s cubic-bezier(.34,1.56,.64,1);pointer-events:none;
        border:1px solid #CA0F3E;white-space:nowrap;
      }
      .students-owl-bubble.show{opacity:1;transform:translateX(-50%) scale(1)}
      .students-owl-mobile-icon{display:none;width:30px;height:30px;fill:#fff;filter:drop-shadow(0 2px 4px rgba(0,0,0,.3))}

      .students-owl-visibility-toggle{
        position:absolute;right:12px;bottom:92px;z-index:5;width:34px;height:34px;
        display:grid;place-items:center;border-radius:50%;border:1px solid var(--border,rgba(255,255,255,.16));
        background:var(--glass,var(--card,rgba(10,15,28,.88)));color:var(--text,#f8fafc);
        box-shadow:0 8px 22px rgba(2,6,23,.28);backdrop-filter:blur(12px);
        cursor:pointer;pointer-events:auto;font:900 20px/1 system-ui;transition:.2s ease;
      }
      .students-owl-visibility-toggle:hover{transform:translateY(-2px);border-color:rgba(202,15,62,.58)}
      .students-owl-toggle-arrow{display:block;transform:translateX(-1px);transition:transform .2s ease}
      .students-owl-system.owl-user-hidden .students-owl-branch,
      .students-owl-system.owl-user-hidden .students-owl-hit{display:none!important}
      .students-owl-system.owl-user-hidden{
        width:48px;height:48px;right:10px;bottom:10px;transform:none!important;
      }
      .students-owl-system.owl-user-hidden .students-owl-visibility-toggle{
        position:fixed;right:14px;bottom:14px;
      }
      .students-owl-system.owl-user-hidden .students-owl-toggle-arrow{
        transform:rotate(180deg) translateX(-1px);
      }
      .students-owl-shell{
        position:fixed;right:10px;bottom:8px;z-index:16000;width:min(820px,calc(100vw - 20px));
        height:min(860px,calc(100vh - 16px));display:none;overflow:hidden;border-radius:24px;
        background:transparent;box-shadow:0 30px 80px rgba(2,6,23,.26);
      }
      .students-owl-shell.active{display:block}
      .students-owl-frame-shell{display:block;width:100%;height:100%;border:0;background:transparent}
      .students-owl-close{
        position:absolute;right:12px;top:10px;z-index:5;width:38px;height:38px;border-radius:12px;
        border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.9);color:#fff;
        font-size:20px;cursor:pointer;box-shadow:0 8px 22px rgba(2,6,23,.24)
      }
      @media(prefers-reduced-motion:reduce){
        .students-owl-media-stage,.students-owl-frame{animation:none!important}
      }
      @media(max-width:768px){
        .students-owl-system{right:0;bottom:0;width:auto;height:auto;transform:none!important}
        .students-owl-branch,.students-owl-media-stage,.students-owl-bubble{display:none!important}
        .students-owl-visibility-toggle{position:fixed;right:max(31px,calc(env(safe-area-inset-right) + 31px));bottom:max(88px,calc(env(safe-area-inset-bottom) + 88px));width:32px;height:32px;font-size:18px}
        .students-owl-system.owl-user-hidden .students-owl-visibility-toggle{right:14px;bottom:max(14px,env(safe-area-inset-bottom))}
        .students-owl-hit{
          position:fixed;bottom:max(18px,env(safe-area-inset-bottom));right:max(18px,env(safe-area-inset-right));
          left:auto;width:62px;height:62px;border-radius:50%;overflow:hidden;
          background:linear-gradient(135deg,#f43f5e,#CA0F3E);
          box-shadow:0 10px 25px rgba(202,15,62,.5),inset 0 2px 4px rgba(255,255,255,.3);
          display:flex;align-items:center;justify-content:center;
        }
        .students-owl-mobile-icon{display:block}
        .students-owl-shell{inset:0;width:100vw;height:100vh;border-radius:0}
      }
    `;
    document.head.appendChild(style);

    const system=document.createElement('div');
    system.id='studentsOwlSystem';
    system.className='students-owl-system';
    system.dataset.systemUi='owl';
    system.setAttribute('data-site-admin-protected','true');
    system.setAttribute('aria-label','Цифровой ассистент Сова');
    system.innerHTML=`
      <svg class="students-owl-branch" viewBox="0 0 520 110" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="studentsBarkGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5c4028"/><stop offset="55%" stop-color="#3c2a18"/><stop offset="100%" stop-color="#241708"/></linearGradient></defs>
        <ellipse cx="260" cy="98" rx="230" ry="10" fill="#000" opacity=".45"/>
        <path d="M0 56 Q 100 28 205 43 T 405 35 T 520 47 L520 88 Q 405 76 205 85 T 0 96 Z" fill="url(#studentsBarkGrad)"/>
        <path d="M0 56 Q 100 28 205 43 T 405 35 T 520 47" stroke="#2a1c0e" stroke-width="2.4" fill="none" opacity=".78"/>
        <path d="M10 74 Q 110 50 210 62 T 410 56" stroke="#6b4a2c" stroke-width="1.5" fill="none" opacity=".5"/>
        <path d="M15 80 Q 120 58 230 68 T 430 64" stroke="#2a1c0e" stroke-width="1.5" fill="none" opacity=".5"/>
        <ellipse cx="140" cy="66" rx="6" ry="4" fill="#241708" opacity=".6"/>
        <ellipse cx="360" cy="52" rx="5" ry="3.5" fill="#241708" opacity=".6"/>
        <path d="M135 55 q 8 -26 24 -36 q -4 20 -10 40 Z" fill="url(#studentsBarkGrad)"/>
        <path d="M345 46 q -8 -22 -22 -30 q 4 18 10 34 Z" fill="url(#studentsBarkGrad)"/>
      </svg>
      <button class="students-owl-visibility-toggle" type="button" aria-label="Скрыть сову" title="Скрыть сову" aria-pressed="false" data-system-ui="owl" data-site-admin-protected="true"><span class="students-owl-toggle-arrow">‹</span></button>
      <button class="students-owl-hit" type="button" aria-label="Открыть цифрового ассистента Сову">
        <span class="students-owl-bubble">Нужна помощь с выбором программы?</span>
        <span class="students-owl-media-stage" aria-hidden="true">
          <img class="students-owl-frame" src="./img/owl-step-4.webp" alt="" draggable="false" decoding="async">
        </span>
        <svg class="students-owl-mobile-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3 7h2V9H7v2zm4 0h2V9h-2v2zm4 0h2V9h-2v2z"/></svg>
      </button>
    `;

    const shell=document.createElement('div');
    shell.id='studentsOwlShell';
    shell.className='students-owl-shell';
    shell.dataset.systemUi='owl';
    shell.setAttribute('data-site-admin-protected','true');
    shell.innerHTML='<button class="students-owl-close" type="button" aria-label="Закрыть Сову">×</button><iframe class="students-owl-frame-shell" title="Цифровой ассистент Сова" loading="lazy"></iframe>';

    const hit=system.querySelector('.students-owl-hit');
    const visibilityToggle=system.querySelector('.students-owl-visibility-toggle');
    const bubble=system.querySelector('.students-owl-bubble');
    const stage=system.querySelector('.students-owl-media-stage');
    const frame=shell.querySelector('iframe');

    function updateTravel(){
      if(!stage || window.matchMedia('(max-width:768px)').matches) return;
      const distance=Math.max(0,system.clientWidth-stage.offsetWidth-8);
      stage.style.setProperty('--owl-travel-x',Math.round(distance)+'px');
    }

    const OWL_VISIBILITY_KEY='ranepa_owl_hidden_v1';

    function applyVisibilityPreference(){
      let hidden=false;
      try{hidden=localStorage.getItem(OWL_VISIBILITY_KEY)==='1';}catch(_){}
      system.classList.toggle('owl-user-hidden',hidden);
      visibilityToggle.setAttribute('aria-pressed',hidden?'true':'false');
      visibilityToggle.setAttribute('aria-label',hidden?'Показать сову':'Скрыть сову');
      visibilityToggle.setAttribute('title',hidden?'Показать сову':'Скрыть сову');
      if(hidden) bubble.classList.remove('show');
    }

    function toggleVisibility(event){
      if(event){event.preventDefault();event.stopPropagation();}
      const hidden=!system.classList.contains('owl-user-hidden');
      try{localStorage.setItem(OWL_VISIBILITY_KEY,hidden?'1':'0');}catch(_){}
      applyVisibilityPreference();
    }

    function open(){
      bubble.classList.remove('show');
      if(!frame.getAttribute('src')){
        frame.setAttribute('src',HOME_OWL_URL);
        frame.addEventListener('load',()=>{
          const tryOpen=(attempt)=>{
            try{
              const w=frame.contentWindow;
              const chat=w.document.getElementById('owlChat');
              if(chat && !chat.classList.contains('active') && typeof w.toggleChat==='function'){
                w.toggleChat();
                return;
              }
            }catch(_){}
            if(attempt<8) setTimeout(()=>tryOpen(attempt+1),250);
          };
          setTimeout(()=>tryOpen(0),150);
        },{once:true});
      }else{
        try{
          const w=frame.contentWindow;
          const chat=w.document.getElementById('owlChat');
          if(chat && !chat.classList.contains('active') && typeof w.toggleChat==='function') w.toggleChat();
        }catch(_){}
      }
      shell.classList.add('active');
      system.style.display='none';
    }

    function close(){
      shell.classList.remove('active');
      system.style.display='';
    }

    visibilityToggle.addEventListener('click',toggleVisibility);
    hit.addEventListener('click',open);
    shell.querySelector('.students-owl-close').addEventListener('click',close);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&shell.classList.contains('active')) close();});

    let bubbleTimer=setInterval(()=>{
      if(shell.classList.contains('active')||document.hidden||system.classList.contains('owl-user-hidden')) return;
      bubble.classList.toggle('show');
    },5000);

    let scrollTimer=0;
    window.addEventListener('scroll',()=>{
      if(window.matchMedia('(max-width:768px)').matches) return;
      system.classList.add('scroll-mini');
      bubble.classList.remove('show');
      clearTimeout(scrollTimer);
      scrollTimer=setTimeout(()=>system.classList.remove('scroll-mini'),260);
    },{passive:true});

    window.addEventListener('resize',updateTravel,{passive:true});
    applyVisibilityPreference();
    updateTravel();
    document.body.append(system,shell);
  }

  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount):mount();
})();