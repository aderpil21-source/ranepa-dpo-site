/* Safe rich text for RANEPA PRO and News editors.
   Content is stored as a versioned string or (for news) in the optional block.html.
   No untrusted markup is ever used directly for visitor rendering. */
(function(){
  'use strict';
  const PREFIX = '__RANEPA_RICH_V1__:';
  const SIZES = [12,14,16,18,20,24,28,32,36];
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function safeUrl(raw){
    const value = String(raw || '').trim();
    if (!value || /[\u0000-\u0020\u007f]/.test(value)) return '';
    try {
      const url = new URL(value, location.href);
      if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) return '';
      return url.href;
    } catch (_) { return ''; }
  }
  function sanitize(html){
    const root = document.createElement('template');
    root.innerHTML = String(html == null ? '' : html).slice(0,200000);
    function visit(node){
      if (node.nodeType === 3) return escape(node.nodeValue);
      if (node.nodeType !== 1) return '';
      const tag = node.tagName.toLowerCase();
      if (['script','style','svg','math','iframe','object','embed','form','input','textarea','button','img','video','audio'].includes(tag)) return '';
      if (tag === 'br') return '<br>';
      let inner = Array.from(node.childNodes).map(visit).join('');
      if (tag === 'div' || tag === 'p') return inner + '<br>';
      if (tag === 'b' || tag === 'strong') return '<strong>' + inner + '</strong>';
      if (tag === 'i' || tag === 'em') return '<em>' + inner + '</em>';
      if (tag === 'u') return '<u>' + inner + '</u>';
      if (tag === 'a') {
        const href = safeUrl(node.getAttribute('href'));
        return href ? '<a href="' + escape(href) + '" target="_blank" rel="noopener noreferrer">' + inner + '</a>' : inner;
      }
      if (tag === 'font' || tag === 'span') {
        const sizeAttr = tag === 'font' ? Number(node.getAttribute('size')) : 0;
        const fontMap = {1:12,2:14,3:16,4:18,5:24,6:28,7:32};
        const css = node.style && node.style.fontSize ? node.style.fontSize : '';
        const px = /^\s*(\d{1,3})px\s*$/i.test(css) ? Number(css.match(/(\d+)/)[1]) : fontMap[sizeAttr] || 0;
        const weight = node.style && (node.style.fontWeight === 'bold' || Number(node.style.fontWeight) >= 600);
        const italic = node.style && node.style.fontStyle === 'italic';
        if (px >= 12 && px <= 36) inner = '<span style="font-size:' + px + 'px">' + inner + '</span>';
        if (weight) inner = '<strong>' + inner + '</strong>';
        if (italic) inner = '<em>' + inner + '</em>';
        return inner;
      }
      return inner;
    }
    return Array.from(root.content.childNodes).map(visit).join('').replace(/(?:<br>){3,}/g,'<br><br>').replace(/<br>$/,'');
  }
  function plainToHtml(value){ return escape(value).replace(/\r\n?/g,'\n').replace(/\n/g,'<br>'); }
  function isRich(value){ return typeof value === 'string' && value.startsWith(PREFIX); }
  function htmlFor(value){ return isRich(value) ? sanitize(value.slice(PREFIX.length)) : plainToHtml(value); }
  function valueOf(editor){
    const safe = sanitize(editor.innerHTML);
    const plain = String(editor.innerText == null ? editor.textContent || '' : editor.innerText).replace(/\u00a0/g,' ').replace(/\r\n?/g,'\n').replace(/\n+$/,'');
    // Store ordinary edits as plain text; formatted content uses the version marker.
    return /<(strong|em|u|a|span)\b/i.test(safe) ? PREFIX + safe : plain;
  }
  let activeRange = null;
  let activeEditor = null;
  function remember(editor){
    const selection = window.getSelection();
    if (!editor || !selection || !selection.rangeCount) return false;
    const range = selection.getRangeAt(0);
    const common = range.commonAncestorContainer;
    if (!editor.contains(common)) return false;
    activeEditor = editor;
    activeRange = range.cloneRange();
    return true;
  }
  function restore(editor){
    if (activeEditor !== editor || !activeRange || !editor.contains(activeRange.commonAncestorContainer)) return false;
    editor.focus();
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(activeRange);
    return true;
  }
  function format(editor, kind, argument){
    if (!editor || !editor.isContentEditable) return false;
    restore(editor);
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !editor.contains(selection.getRangeAt(0).commonAncestorContainer)) return false;
    if (selection.isCollapsed) { alert('Сначала выделите фрагмент текста.'); return false; }
    if (kind === 'link') {
      const given = prompt('Вставьте адрес ссылки (https://...)');
      if (given === null) return false;
      const href = safeUrl(given);
      if (!href) { alert('Введите корректную ссылку http://, https:// или mailto:.'); return false; }
      restore(editor);
      document.execCommand('createLink',false,href);
    } else if (kind === 'bold') {
      document.execCommand('bold',false,null);
    } else if (kind === 'size') {
      const size = Number(argument);
      if (!SIZES.includes(size)) return false;
      document.execCommand('fontSize',false,'7');
      editor.querySelectorAll('font[size="7"]').forEach(font => {
        font.style.fontSize = size + 'px';
        font.removeAttribute('size');
      });
    } else return false;
    remember(editor);
    editor.dispatchEvent(new Event('input', {bubbles:true}));
    return true;
  }
  function bindToolbar(toolbar, getEditor){
    if (!toolbar) return;
    toolbar.addEventListener('mousedown', e => {
      const editor = getEditor(e.target.closest('[data-rt-idx]'));
      if (editor) remember(editor);
      if (e.target.closest('button')) e.preventDefault();
    });
    toolbar.addEventListener('click', e => {
      const button = e.target.closest('[data-rt-format]');
      if (!button) return;
      const editor = getEditor(button);
      if (editor) format(editor, button.dataset.rtFormat);
    });
    toolbar.addEventListener('change', e => {
      const select = e.target.closest('[data-rt-size]');
      if (!select) return;
      const editor = getEditor(select);
      if (editor) format(editor, 'size', select.value);
      select.selectedIndex = 0;
    });
  }
  function toolbarHtml(){
    return '<div class="ranepa-rich-tools" role="toolbar" aria-label="Форматирование текста">' +
      '<button type="button" data-rt-format="bold" title="Жирный (Ctrl+B)" aria-label="Жирный текст"><strong>B</strong></button>' +
      '<select data-rt-size aria-label="Размер выделенного текста"><option value="">Размер</option>' +
      SIZES.map(n=>'<option value="'+n+'">'+n+' px</option>').join('') + '</select>' +
      '<button type="button" data-rt-format="link" title="Вставить ссылку (Ctrl+K)" aria-label="Добавить ссылку">🔗 Ссылка</button>' +
      '</div>';
  }
  function setupPaste(parent){
    parent.addEventListener('paste',event=>{
      const editor = event.target.closest('[data-ranepa-rich-editor]');
      if (!editor || !parent.contains(editor)) return;
      const text = event.clipboardData && event.clipboardData.getData('text/plain');
      if (text == null) return;
      event.preventDefault();
      document.execCommand('insertText',false,text);
    });
  }
  window.RanepaRichText = {PREFIX,isRich,htmlFor,plainToHtml,sanitize,safeUrl,valueOf,remember,format,bindToolbar,toolbarHtml,setupPaste};
})();