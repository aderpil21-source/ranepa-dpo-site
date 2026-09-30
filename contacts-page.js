(function(){
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  async function loadSettings(){
    try{
      const res=await fetch('./site-settings.json?v='+Math.floor(Date.now()/60000),{cache:'no-store'});
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data=await res.json(), s=data?.settings||{};
      return {visibility:s.visibility||{},contacts:Array.isArray(s.customContacts)?s.customContacts:[]};
    }catch(_){ return {visibility:{},contacts:[]}; }
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

  function appendDetail(card,label,value,href){
    if(!value) return;
    const p=document.createElement('p');
    if(label) p.append(document.createTextNode(label));
    if(href){
      const a=document.createElement('a');
      a.href=href;a.textContent=value;p.appendChild(a);
    }else{
      p.append(document.createTextNode(value));
    }
    card.appendChild(p);
    return p;
  }

  function applyBaseContactOverride(card,override){
    if(!card||!override) return;
    if(override.active===false||override.archived===true){card.style.display='none';return;}
    const h=card.querySelector('h3'),pos=card.querySelector('.position');
    if(h&&override.name!=null) h.textContent=String(override.name);
    if(pos&&override.position!=null) pos.textContent=String(override.position);
    const hasDetails=['office','phone','extension','email'].some(k=>Object.prototype.hasOwnProperty.call(override,k));
    if(hasDetails){
      [...card.children].filter(x=>x.tagName==='P').forEach(x=>x.remove());
      const office=String(override.office||'').trim();
      const phone=String(override.phone||'').trim();
      const ext=String(override.extension||'').trim();
      const email=String(override.email||'').trim();
      if(office) appendDetail(card,'Каб. ',office,'');
      if(phone){
        const clean=phone.replace(/[^+\d]/g,'');
        const p=appendDetail(card,'Тел: ',phone,'tel:'+clean);
        if(p&&ext) p.append(document.createTextNode(' (доб. '+ext+')'));
      }
      if(email) appendDetail(card,'E-mail: ',email,'mailto:'+email);
    }
  }

  async function init(){
    const target=document.querySelector('.contact-list');
    if(!target) return;
    const settings=await loadSettings();
    target.querySelectorAll('.contact-card:not(.site-custom-contact)').forEach(card=>{
      const name=(card.querySelector('h3')?.textContent||'').trim().toLowerCase();
      const visibilityKey='contact-static:'+encodeURIComponent(name);
      if(settings.visibility[visibilityKey]===false){card.style.display='none';return;}
      const stable=String(card.dataset.siteContactKey||'').trim();
      const sourceKey=stable?'base-contact:'+stable:'';
      const override=sourceKey?settings.contacts.find(c=>c&&String(c.sourceKey||'')===sourceKey):null;
      if(override) applyBaseContactOverride(card,override);
    });
    const html=settings.contacts
      .filter(c=>c&&c.id&&!c.sourceKey&&c.active!==false&&c.archived!==true&&settings.visibility['contact:'+encodeURIComponent(c.id)]!==false)
      .map(cardHtml).join('');
    if(html) target.insertAdjacentHTML('beforeend',html);
  }

  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
