(function(){
  const KEY='ranepa-theme';
  const root=document.documentElement;
  let saved=null;
  try{saved=localStorage.getItem(KEY);}catch(e){}
  const theme=saved==='light'?'light':'dark';
  root.setAttribute('data-theme',theme);
  function apply(next){
    root.setAttribute('data-theme',next);
    try{localStorage.setItem(KEY,next);}catch(e){}
    document.querySelectorAll('[data-theme-toggle]').forEach(b=>{
      b.setAttribute('aria-label',next==='dark'?'Включить светлую тему':'Включить тёмную тему');
      b.setAttribute('title',next==='dark'?'Светлая тема':'Тёмная тема');
      b.textContent=next==='dark'?'☀':'☾';
    });
  }
  function mount(){
    if(document.querySelector('[data-theme-toggle]')){apply(root.getAttribute('data-theme'));return;}
    const b=document.createElement('button');
    b.type='button'; b.className='site-theme-toggle'; b.setAttribute('data-theme-toggle','');
    b.addEventListener('click',()=>apply(root.getAttribute('data-theme')==='light'?'dark':'light'));
    document.body.appendChild(b); apply(root.getAttribute('data-theme'));
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount):mount();
})();