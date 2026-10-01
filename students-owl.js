(function(){
  'use strict';

  function mount(){
    if(document.getElementById('studentsOwlLauncher')) return;

    const style=document.createElement('style');
    style.textContent=`
      .students-owl-launcher{position:fixed;right:22px;bottom:22px;z-index:14500;width:94px;height:94px;border:0;background:transparent;padding:0;cursor:pointer;filter:drop-shadow(0 14px 22px rgba(2,6,23,.34));transition:transform .2s ease}
      .students-owl-launcher:hover{transform:translateY(-4px) scale(1.03)}
      .students-owl-launcher img{display:block;width:100%;height:100%;object-fit:contain}
      .students-owl-launcher span{position:absolute;right:70px;bottom:34px;white-space:nowrap;padding:8px 11px;border-radius:11px;background:var(--card,#111827);color:var(--text,#fff);border:1px solid var(--border);font:800 .76rem Manrope,Arial,sans-serif;box-shadow:0 10px 28px rgba(2,6,23,.18)}
      .students-owl-shell{position:fixed;right:10px;bottom:8px;z-index:16000;width:min(650px,calc(100vw - 20px));height:min(820px,calc(100vh - 16px));display:none;overflow:hidden;border-radius:24px;background:transparent;box-shadow:0 30px 80px rgba(2,6,23,.26)}
      .students-owl-shell.active{display:block}
      .students-owl-frame{width:100%;height:100%;border:0;background:transparent}
      .students-owl-close{position:absolute;right:12px;top:10px;z-index:3;width:38px;height:38px;border-radius:12px;border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.9);color:#fff;font-size:20px;cursor:pointer}
      @media(max-width:680px){
        .students-owl-launcher{right:10px;bottom:10px;width:78px;height:78px}
        .students-owl-launcher span{display:none}
        .students-owl-shell{inset:0;width:100vw;height:100vh;border-radius:0}
      }
    `;
    document.head.appendChild(style);

    const launcher=document.createElement('button');
    launcher.id='studentsOwlLauncher';
    launcher.className='students-owl-launcher';
    launcher.type='button';
    launcher.setAttribute('aria-label','Открыть цифрового ассистента Сову');
    launcher.innerHTML='<span>Спросить Сову</span><img src="./img/owl-v2-open.webp" alt="">';

    const shell=document.createElement('div');
    shell.id='studentsOwlShell';
    shell.className='students-owl-shell';
    shell.innerHTML='<button class="students-owl-close" type="button" aria-label="Закрыть Сову">×</button><iframe class="students-owl-frame" title="Цифровой ассистент Сова" loading="lazy"></iframe>';

    const frame=shell.querySelector('iframe');
    const open=()=>{
      if(!frame.src){
        frame.src='./index.html?owlEmbed=1';
        frame.addEventListener('load',()=>{
          setTimeout(()=>{
            try{
              const w=frame.contentWindow;
              const chat=w.document.getElementById('owlChat');
              if(chat && !chat.classList.contains('active') && typeof w.toggleChat==='function') w.toggleChat();
            }catch(_){}
          },700);
        },{once:true});
      }
      shell.classList.add('active');
      launcher.style.display='none';
    };
    const close=()=>{
      shell.classList.remove('active');
      launcher.style.display='';
    };

    launcher.addEventListener('click',open);
    shell.querySelector('.students-owl-close').addEventListener('click',close);
    document.body.append(launcher,shell);
  }

  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount):mount();
})();