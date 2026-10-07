const STUDENTS_PUBLIC_API_URL = 'https://ranepa-dpo-public-api.onrender.com';

function safeStudentUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.href;
  } catch (_) {
    return '';
  }
}

function setMaterialState(message, type) {
  const box = document.getElementById('materialResult');
  box.className = 'material-result' + (type ? ' ' + type : '');
  box.textContent = message;
}

async function lookupStudentMaterial(event) {
  event.preventDefault();
  const input = document.getElementById('materialCode');
  const code = String(input.value || '').trim().toUpperCase();
  const box = document.getElementById('materialResult');
  if (!code) {
    setMaterialState('Введите код доступа.', 'error');
    input.focus();
    return;
  }
  box.className = 'material-result loading';
  box.textContent = 'Проверяем код…';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(
        STUDENTS_PUBLIC_API_URL + '/material?code=' + encodeURIComponent(code) + '&_=' + Date.now(),
        {cache:'no-store', signal:controller.signal, referrerPolicy:'no-referrer'}
      );
    } finally {
      clearTimeout(timeout);
    }
    if (response.status === 404) {
      setMaterialState('Материал с таким кодом не найден. Проверьте код и попробуйте ещё раз.', 'error');
      return;
    }
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    const item = data && data.item ? data.item : null;
    if (!item) {
      setMaterialState('Материал с таким кодом не найден. Проверьте код и попробуйте ещё раз.', 'error');
      return;
    }
    if (!item.isPublished) {
      setMaterialState('Этот материал сейчас недоступен. Уточните у преподавателя актуальный код.', 'error');
      return;
    }
    const url = safeStudentUrl(item.url);
    box.className = 'material-result success';
    box.textContent = '';
    const title = document.createElement('strong');
    title.textContent = item.title || 'Материал найден';
    box.appendChild(title);

    if (item.comment) {
      const comment = document.createElement('p');
      comment.textContent = String(item.comment);
      box.appendChild(comment);
    }

    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'material-open-link';
      link.textContent = 'Открыть материал';
      box.appendChild(link);
    } else {
      const note = document.createElement('p');
      note.textContent = 'Материал найден, но ссылка недоступна.';
      box.appendChild(note);
    }

    if (item.date) {
      const meta = document.createElement('small');
      meta.textContent = 'Обновлено: ' + item.date;
      box.appendChild(meta);
    }
  } catch (error) {
    console.error('Student material lookup failed:', error);
    setMaterialState('Не удалось проверить код. Попробуйте ещё раз немного позже.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('materialLookupForm');
  if (form) form.addEventListener('submit', lookupStudentMaterial);

  const modal = document.getElementById('requisitesModal');
  const openBtn = document.querySelector('.requisites-open');
  const closeBtn = modal?.querySelector('.requisites-close');

  const openRequisites = () => {
    if (!modal) return;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('requisites-opened');
    closeBtn?.focus();
  };

  const closeRequisites = () => {
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('requisites-opened');
    openBtn?.focus();
  };

  openBtn?.addEventListener('click', openRequisites);
  closeBtn?.addEventListener('click', closeRequisites);
  modal?.addEventListener('click', event => {
    if (event.target === modal) closeRequisites();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal?.classList.contains('active')) closeRequisites();
  });

  const toast = document.getElementById('paymentCopyToast');
  let toastTimer = 0;
  const showToast = message => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
  };

  const copyText = async value => {
    const text = String(value || '');
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
  };

  modal?.addEventListener('click', async event => {
    const copyBtn = event.target.closest('[data-copy]');
    if (copyBtn) {
      await copyText(copyBtn.dataset.copy || '');
      const old = copyBtn.textContent;
      copyBtn.textContent = 'Скопировано';
      showToast('Скопировано в буфер обмена');
      setTimeout(() => { copyBtn.textContent = old; }, 1200);
      return;
    }

    const copyAll = event.target.closest('[data-copy-all]');
    if (copyAll) {
      const all = [
        'Получатель: УФК по Нижегородской области (Западный филиал РАНХиГС л/с 20356У92670)',
        'ИНН: 7729050901',
        'КПП: 390602001',
        'Казначейский счёт: 03214643000000013240',
        'БИК банка получателя: 012202102',
        'Единый казначейский счёт: 40102810745370000024',
        'Банк: ОКЦ № 1 ВВГУ Банка России // УФК по Нижегородской области, г. Нижний Новгород',
        'Лицевой счёт: 20356У92670'
      ].join('\n');
      await copyText(all);
      showToast('Все реквизиты скопированы');
      return;
    }

    const collapseBtn = event.target.closest('[data-collapse-all]');
    if (collapseBtn) {
      const details = [...modal.querySelectorAll('.payment-section, .payment-situations details')];
      const shouldOpen = details.every(item => !item.open);
      details.forEach(item => { item.open = shouldOpen; });
      collapseBtn.textContent = shouldOpen ? 'Свернуть всё' : 'Развернуть всё';
      return;
    }

    const hideBtn = event.target.closest('[data-hide-block]');
    if (hideBtn) {
      const block = hideBtn.closest('[data-hideable]');
      if (block) {
        block.classList.add('is-hidden');
        const restore = modal.querySelector('[data-restore-hidden]');
        if (restore) restore.hidden = false;
      }
      return;
    }

    const restoreBtn = event.target.closest('[data-restore-hidden]');
    if (restoreBtn) {
      modal.querySelectorAll('[data-hideable].is-hidden').forEach(block => block.classList.remove('is-hidden'));
      restoreBtn.hidden = true;
    }
  });
});