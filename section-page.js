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
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const selector = '.card, .lesson, .faq-item, .contact-card';

  let observer = null;
  if (!reduceMotion && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      });
    }, { threshold:.1, rootMargin:'0px 0px -7% 0px' });
  }

  function arm(root = document) {
    root.querySelectorAll?.(selector).forEach((el, index) => {
      if (el.dataset.depthArmed === '1') return;
      el.dataset.depthArmed = '1';
      el.classList.add('depth-item');
      el.style.transitionDelay = reduceMotion ? '0ms' : Math.min((index % 6) * 45, 180) + 'ms';

      if (reduceMotion || !observer) {
        el.classList.add('in-view');
      } else {
        observer.observe(el);
      }
    });
  }

  arm();

  const mutationObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.matches?.(selector)) arm(node.parentElement || document);
        else arm(node);
      });
    }
  });
  mutationObserver.observe(document.body, { childList:true, subtree:true });

  if (reduceMotion) return;

  let targetX = 0;
  let targetY = 0;
  let smoothX = 0;
  let smoothY = 0;

  function depthLoop() {
    smoothX += (targetX - smoothX) * .07;
    smoothY += (targetY - smoothY) * .07;
    document.documentElement.style.setProperty('--depth-x', smoothX.toFixed(2) + 'px');
    document.documentElement.style.setProperty('--depth-y', smoothY.toFixed(2) + 'px');
    requestAnimationFrame(depthLoop);
  }
  requestAnimationFrame(depthLoop);

  window.addEventListener('pointermove', event => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    targetX = ((event.clientX / window.innerWidth) - .5) * 30;
    targetY = ((event.clientY / window.innerHeight) - .5) * 20;
  }, { passive:true });

  document.addEventListener('pointermove', event => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    const card = event.target.closest('.card, .lesson, .contact-card');
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const tiltY = (px - .5) * 8;
    const tiltX = (.5 - py) * 7;

    card.style.setProperty('--tilt-x', tiltX.toFixed(2) + 'deg');
    card.style.setProperty('--tilt-y', tiltY.toFixed(2) + 'deg');
    card.classList.add('tilt-active');
  }, { passive:true });

  document.addEventListener('pointerout', event => {
    const card = event.target.closest?.('.card, .lesson, .contact-card');
    if (!card) return;
    const next = event.relatedTarget;
    if (next && card.contains(next)) return;
    card.classList.remove('tilt-active');
    card.style.removeProperty('--tilt-x');
    card.style.removeProperty('--tilt-y');
  }, { passive:true });

  let scrollFrame = 0;
  const applyScroll = () => {
    scrollFrame = 0;
    const shift = Math.min(window.scrollY, 900);
    document.documentElement.style.setProperty('--scroll-shift', shift.toFixed(1) + 'px');
  };
  window.addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(applyScroll);
  }, { passive:true });
  applyScroll();
}

document.addEventListener('DOMContentLoaded', () => {
  ensureSectionModals();
  updateEnrollChoices();
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
