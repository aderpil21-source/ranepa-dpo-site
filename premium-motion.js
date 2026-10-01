(()=>{'use strict';
if(window.__premiumMotion)return;window.__premiumMotion=1;
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine=matchMedia('(hover:hover) and (pointer:fine)').matches;
const seen=new WeakSet(), observed=new WeakSet();
const selectors=[
  '.page-kicker','.page-title','.page-lead','.schedule-header',
  '.toolbar','.panel','.contact-card','.faq-item',
  '.audience-hero','.audience-card','.material-card','.payment-card',
  '.hero .eyebrow','.hero h1','.hero .lead','.meta-card','.section','.side-card',
  '.related-section','.news-card','.news-tags-bar',
  '.grid > *','.schedule-list > *'
].join(',');
let observer=null;
function variant(el,i){
  if(el.matches('.page-kicker,.page-title,.page-lead,.schedule-header,.audience-hero,.hero h1,.hero .lead'))return '';
  if(el.matches('.faq-item') && i%2)return ' pm-from-right';
  if(el.matches('.section,.panel') && i%3===1)return ' pm-scale';
  return i%4===2?' pm-from-left':'';
}
function reveal(el,i=0){
  if(!el||observed.has(el)||el.closest('[hidden]'))return;
  observed.add(el);el.classList.add('pm-reveal');
  const v=variant(el,i).trim();if(v)el.classList.add(v);
  el.style.transitionDelay=Math.min((i%6)*45,225)+'ms';
  if(reduce){el.classList.add('pm-in','pm-done');return}
  observer.observe(el);
}
function enhanceLift(el){
  if(!el||seen.has(el))return;seen.add(el);el.classList.add('pm-lift');
  if(!fine)return;
  if(getComputedStyle(el).position==='static')el.style.position='relative';
  if(!el.querySelector(':scope > .pm-sheen')){const s=document.createElement('i');s.className='pm-sheen';s.setAttribute('aria-hidden','true');el.prepend(s)}
  el.addEventListener('pointermove',e=>{const r=el.getBoundingClientRect();el.style.setProperty('--pm-x',((e.clientX-r.left)/r.width*100).toFixed(1)+'%');el.style.setProperty('--pm-y',((e.clientY-r.top)/r.height*100).toFixed(1)+'%')},{passive:true});
}
function titleLine(){
  const title=document.querySelector('.page-title,.schedule-title,.audience-hero h1,.hero h1');
  if(!title||title.nextElementSibling?.classList?.contains('pm-title-line'))return;
  const l=document.createElement('i');l.className='pm-title-line';l.setAttribute('aria-hidden','true');title.insertAdjacentElement('afterend',l);
  requestAnimationFrame(()=>requestAnimationFrame(()=>l.classList.add('pm-in')));
}
function scan(root=document){
  [...root.querySelectorAll?.(selectors)||[]].forEach((el,i)=>reveal(el,i));
  [...root.querySelectorAll?.('.contact-card,.audience-card,.material-card,.payment-card,.meta-card,.side-card,.news-card,.grid > *,.schedule-list > *')||[]].forEach(enhanceLift);
}
observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(!e.isIntersecting)return;e.target.classList.add('pm-in');observer.unobserve(e.target);setTimeout(()=>e.target.classList.add('pm-done'),850)}),{threshold:.08,rootMargin:'0px 0px -5% 0px'});
function boot(){
  document.documentElement.classList.add('pm-ready');
  document.querySelectorAll('.page-nav a,.audience-nav a,.topbar a,.back-btn').forEach((el,i)=>{el.classList.add('pm-nav-in');el.style.animationDelay=Math.min(i*32,224)+'ms'});
  titleLine();scan();
  let raf=0;const mo=new MutationObserver(ms=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;for(const m of ms){if(m.type==='attributes'){if(!m.target.hidden)scan(m.target);continue}for(const n of m.addedNodes)if(n.nodeType===1){if(n.matches?.(selectors))reveal(n,0);if(n.matches?.('.contact-card,.audience-card,.material-card,.payment-card,.meta-card,.side-card,.news-card,.grid > *,.schedule-list > *'))enhanceLift(n);scan(n)}}})});mo.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();