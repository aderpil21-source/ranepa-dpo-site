(function(){
  const API='https://script.google.com/macros/s/AKfycbxCqcmGgAhHU3dG7ClzCjJZpELqpF-ic9H_Qg49BysA30Ybl4khxnwPOS7Pj9gE3g9I/exec';
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  async function loadSettings(){
    try{
      const res=await fetch(API+'?type=news&_contacts='+Date.now(),{cache:'no-store'});
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data=await res.json();
      const item=(data.items||[]).find(x=>x&&x.id==='__site_admin_settings__');
      const parsed=item?JSON.parse(item.lead||'{}'):{};
      return {
        visibility:parsed?.visibility&&typeof parsed.visibility==='object'?parsed.visibility:{},
        contacts:Array.isArray(parsed?.customContacts)?parsed.customContacts:[]
      };
    }catch(_){
      try{
        const res=await fetch('./site-settings.json?v='+Math.floor(Date.now()/60000),{cache:'no-store'});
        const data=await res.json(), s=data?.settings||{};
        return {visibility:s.visibility||{},contacts:Array.isArray(s.customContacts)?s.customContacts:[]};
      }catch(_){ return {visibility:{},contacts:[]}; }
    }
  }
  function cardHtml(c){
    const office=esc(c.office||''), phone=esc(c.phone||''), ext=esc(c.extension||''), email=esc(c.email||'');
    let lines='';
    if(office) lines+='<p>Каб. '+office+'</p>';
    if(phone){
      const href=String(c.phone||'').replace(/[^+\d]/g,'');
      lines+='<p>Тел: <a href="tel:'+esc(href)+'">'+phone+'</a>'+(ext?' (доб. '+ext+')':'')+'</p>';
    }
    if(email) lines+='<p>E-mail: <a href="mailto:'+email+'">'+email+'</a></p>';
    return '<article class="panel contact-card site-custom-contact" data-site-contact-id="'+esc(c.id)+'">'+
      '<h3>'+esc(c.name||'Контакт')+'</h3>'+
      '<div class="position">'+esc(c.position||'')+'</div>'+lines+'</article>';
  }

  async function init(){
    const target=document.querySelector('.contact-list');
    if(!target) return;
    const settings=await loadSettings();
    target.querySelectorAll('.contact-card:not(.site-custom-contact)').forEach(card=>{
      const name=(card.querySelector('h3')?.textContent||'').trim().toLowerCase();
      const key='contact-static:'+encodeURIComponent(name);
      if(settings.visibility[key]===false) card.style.display='none';
    });
    const html=settings.contacts.filter(c=>c&&c.id&&c.active!==false&&settings.visibility['contact:'+encodeURIComponent(c.id)]!==false).map(cardHtml).join('');
    if(html) target.insertAdjacentHTML('beforeend',html);
  }

  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
