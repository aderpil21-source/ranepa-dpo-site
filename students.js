const STUDENTS_API_URL = 'https://script.google.com/macros/s/AKfycbxCqcmGgAhHU3dG7ClzCjJZpELqpF-ic9H_Qg49BysA30Ybl4khxnwPOS7Pj9gE3g9I/exec';

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
    const separator = STUDENTS_API_URL.includes('?') ? '&' : '?';
    const response = await fetch(STUDENTS_API_URL + separator + '_students=' + Date.now(), {cache:'no-store'});
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    const files = Array.isArray(data.owlFiles) ? data.owlFiles : [];
    const item = files.find(file => String(file.code || '').trim().toUpperCase() === code);
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
});
