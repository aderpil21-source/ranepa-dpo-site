/* Premium motion controller. Uses compositor-friendly transforms and observers. */
(()=>{'use strict';
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
if(reduced)return;
const selectors=['.hero > *','.tabs-nav-wrapper','.filters-bar','.program-card','.section-header','.faq-item','.doc-card','.contacts-section > *'];
const arm=()=>{
 const els=[...document.querySelectorAll(selectors.join(','))].filter(el=>!el.dataset.motionArmed);
 els.forEach((el,i)=>{el.dataset.motionArmed='1';el.classList.add('motion-reveal');el.style.transitionDelay=Math.min(i%6,5)*45+'ms';observer.observe(el)});
};
const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('motion-in');observer.unobserve(e.target)}}),{rootMargin:'0px 0px -8% 0px',threshold:.08});
const mo=new MutationObserver(()=>requestAnimationFrame(arm));
addEventListener('DOMContentLoaded',()=>{arm();mo.observe(document.body,{childList:true,subtree:true})},{once:true});
addEventListener('pagehide',()=>{mo.disconnect();observer.disconnect()},{once:true});
})();