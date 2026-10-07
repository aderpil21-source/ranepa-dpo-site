const SECTION_PUBLIC_DATA_API = 'https://ranepa-dpo-public-api.onrender.com';
const ENROLL_TRUD_URL = 'https://trudvsem.ru/?region=3900000000000';
const ENROLL_YANDEX_URL = 'https://forms.yandex.ru';
const RANEPA_PRIVACY_URL = 'https://www.ranepa.ru/local/templates/ranepa_2024/docs/privacy_policy.pdf';
let leavingTargetUrl = '';

function ensureSectionModals() {
  if (document.getElementById('sectionEnrollModal')) return;

  const host = document.createElement('div');
  host.innerHTML = `
    <div class="section-modal" id="sectionEnrollModal" aria-hidden="true">
      <div class="section-modal-box">
        <button class="section-modal-x" type="button" data-close="sectionEnrollModal" aria-label="Закрыть">✕</button>
        <h2>Оформление заявки</h2>
        <p class="section-modal-lead">Выберите удобный способ регистрации на программу обучения:</p>

        <button class="section-enroll-choice section-trud-choice" type="button" data-external="${ENROLL_TRUD_URL}">
          Записаться через «Работа России» (Калининград)
        </button>
        <button class="section-enroll-choice section-yandex-choice" type="button" data-external="${ENROLL_YANDEX_URL}">
          Записаться через Яндекс.Форму
        </button>

        <div class="section-consent-block">
          <label class="section-consent-row">
            <input type="checkbox" id="sectionConsentCheckbox" checked>
            <span>Даю согласие на обработку персональных данных <b>*</b></span>
          </label>

          <button class="section-consent-toggle" id="sectionConsentToggle" type="button">
            Показать текст согласия и политику обработки персональных данных
          </button>

          <div class="section-consent-copy" id="sectionConsentCopy">
            Физическое лицо, заполнив форму и направляя обращение, действуя свободно, своей волей и в своём интересе, предоставляет согласие федеральному государственному бюджетному учреждению высшего образования «Российская академия народного хозяйства и государственной службы при Президенте Российской Федерации» на обработку персональных данных.
            <br><br>
            Согласие даётся на обработку фамилии, имени, отчества, адреса электронной почты, номера телефона и иных сведений, сообщённых пользователем в обращении, в целях рассмотрения обращения и предоставления ответа.
            <br><br>
            <button class="section-policy-link" type="button" data-external="${RANEPA_PRIVACY_URL}">Политика РАНХиГС в отношении обработки персональных данных</button>
          </div>
        </div>

        <button class="section-close-text" type="button" data-close="sectionEnrollModal">Закрыть окно</button>
      </div>
    </div>

    <div class="section-modal" id="sectionLeavingModal" aria-hidden="true">
      <div class="section-modal-box section-leaving-box">
        <button class="section-modal-x" type="button" data-close="sectionLeavingModal" aria-label="Закрыть">✕</button>
        <h2>Вы покидаете ranepa-dpo39.ru</h2>
        <div class="section-leaving-url" id="sectionLeavingUrl"></div>
        <p class="section-modal-lead">Эта ссылка ведёт на сторонний ресурс. Вы действительно хотите туда перейти?</p>
        <div class="section-modal-actions">
          <button class="section-primary-btn" id="sectionLeavingContinue" type="button">Продолжить</button>
          <button class="section-secondary-btn" type="button" data-close="sectionLeavingModal">Отмена</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(host);
}

function openModalById(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('active');
  modal.setAttribute('aria-hidden','false');
  document.body.classList.add('section-modal-open');
}

function closeModalById(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden','true');
  if (!document.querySelector('.section-modal.active')) {
    document.body.classList.remove('section-modal-open');
  }
}

function updateEnrollChoices() {
  const checked = !!document.getElementById('sectionConsentCheckbox')?.checked;
  document.querySelectorAll('.section-enroll-choice').forEach(btn => {
    btn.disabled = !checked;
  });
}

function openLeavingWarning(url) {
  leavingTargetUrl = String(url || '').trim();
  if (!leavingTargetUrl) return;
  const box = document.getElementById('sectionLeavingUrl');
  if (box) box.textContent = leavingTargetUrl;
  openModalById('sectionLeavingModal');
}

function initDepthMotion() {
  // Premium motion is handled by premium-motion.js.
  // Keep this hook only for compatibility with existing page boot logic.
  // No permanent RAF loop, pointer tilt, or duplicate reveal observers here.
  document.documentElement.classList.add('section-motion-lite');
}


async function applyPublicFaqCms(){
  const list=document.querySelector('.faq-list');
  if(!list||!document.querySelector('[data-site-faq-static]')) return;
  try{
    const bucket=Math.floor(Date.now()/60000);
    let data;
    try{
      const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),2000);
      try{
        const response=await fetch(SECTION_PUBLIC_DATA_API+'/settings?_='+Date.now(),{cache:'no-store',signal:ctl.signal,referrerPolicy:'no-referrer'});
        if(!response.ok)throw new Error('HTTP '+response.status);
        data=await response.json();
      }finally{clearTimeout(timer);}
    }catch(_){
      const response=await fetch('./site-settings.json?v='+bucket,{cache:'no-store'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      data=await response.json();
    }
    const settings=data&&data.settings&&typeof data.settings==='object'?data.settings:{};
    const visibility=settings.visibility&&typeof settings.visibility==='object'?settings.visibility:{};
    const faqs=Array.isArray(settings.customFaqs)?settings.customFaqs:[];

    if(visibility.faq===false){
      list.hidden=true;
      return;
    }

    list.querySelectorAll('.faq-item[data-site-faq-static]').forEach(node=>{
      const staticId=String(node.dataset.siteFaqStatic||'').trim();
      const sourceKey='base-faq:'+staticId;
      if(visibility['faq_static_'+staticId]===false){node.hidden=true;return;}
      const override=faqs.find(x=>x&&String(x.sourceKey||'')===sourceKey);
      if(!override)return;
      if(override.active===false||override.archived===true){node.hidden=true;return;}
      const q=node.querySelector('summary'),a=node.querySelector('.faq-answer');
      if(q&&Object.prototype.hasOwnProperty.call(override,'question'))q.textContent=String(override.question||'');
      if(a&&Object.prototype.hasOwnProperty.call(override,'answer'))a.textContent=String(override.answer||'');
    });

    faqs.filter(x=>x&&x.id&&!x.sourceKey&&x.active!==false&&x.archived!==true).forEach(item=>{
      if(visibility['faq:'+item.id]===false)return;
      if(list.querySelector('[data-site-faq-id="'+CSS.escape(String(item.id))+'"]'))return;
      const details=document.createElement('details');
      details.className='faq-item';
      details.dataset.siteFaqId=String(item.id);
      const summary=document.createElement('summary');
      summary.textContent=String(item.question||'Вопрос');
      const answer=document.createElement('div');
      answer.className='faq-answer';
      answer.textContent=String(item.answer||'');
      details.append(summary,answer);
      list.appendChild(details);
    });
  }catch(error){
    console.warn('Не удалось применить публичные FAQ-настройки:',error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  ensureSectionModals();
  updateEnrollChoices();
  applyPublicFaqCms();
  initDepthMotion();

  document.addEventListener('click', event => {
    const enroll = event.target.closest('.enroll-button, .nav-enroll');
    if (enroll) {
      event.preventDefault();
      openModalById('sectionEnrollModal');
      return;
    }

    const close = event.target.closest('[data-close]');
    if (close) {
      closeModalById(close.dataset.close);
      return;
    }

    const external = event.target.closest('[data-external]');
    if (external) {
      event.preventDefault();
      if (external.classList.contains('section-enroll-choice') && external.disabled) return;
      closeModalById('sectionEnrollModal');
      openLeavingWarning(external.dataset.external);
    }
  });

  document.getElementById('sectionConsentCheckbox')?.addEventListener('change', updateEnrollChoices);

  document.getElementById('sectionConsentToggle')?.addEventListener('click', event => {
    const copy = document.getElementById('sectionConsentCopy');
    const isOpen = copy.classList.toggle('show');
    event.currentTarget.textContent = isOpen
      ? 'Скрыть текст согласия'
      : 'Показать текст согласия и политику обработки персональных данных';
  });

  document.getElementById('sectionLeavingContinue')?.addEventListener('click', () => {
    if (!leavingTargetUrl) return;
    const url = leavingTargetUrl;
    leavingTargetUrl = '';
    closeModalById('sectionLeavingModal');
    window.open(url, '_blank', 'noopener,noreferrer');
  });
});
