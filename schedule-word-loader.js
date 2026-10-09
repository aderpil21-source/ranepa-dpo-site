/* Imported Word schedules supplement (never replace) live Google Sheets data. */
(() => {
  let rows = [];
  let pending = null;
  const url = './schedule-docx-import.json.gz.b64';
  function normalizedProgram(value) {
    return String(value || '').toLocaleLowerCase('ru').replace(/[^0-9a-zа-яё]/gi, '');
  }
  function key(row) {
    const time = String(row?.time || '').match(/\d{1,2}[:.]\d{2}/)?.[0] || '';
    return [normalizedProgram(row?.program), String(row?.date || '').replace(/\D/g,''), time.replace('.',':')].join('|');
  }
  async function load(force = false) {
    if (force) pending = null;
    if (!pending) pending = (async () => {
      const bucket = Math.floor(Date.now() / 60000);
      const response = await fetch(url + '?v=' + bucket, { cache: 'no-store' });
      if (!response.ok) throw Error('Word schedule HTTP ' + response.status);
      if (typeof DecompressionStream !== 'function') throw Error('Browser does not support gzip decompression');
      const encoded = (await response.text()).replace(/\s+/g, '');
      const bytes = Uint8Array.from(atob(encoded), value => value.charCodeAt(0));
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      const imported = await new Response(stream).json();
      if (!imported || !Array.isArray(imported.schedules)) throw Error('Invalid Word schedule');
      rows = imported.schedules.filter(item => item && item.program && item.date && item.time && item.subject);
      return rows;
    })().catch(error => {
      console.warn('Word schedule import unavailable; live schedule remains active:', error);
      return rows;
    });
    return pending;
  }
  function merge(base) {
    const result = Array.isArray(base) ? base.slice() : [];
    const seen = new Set(result.map(key));
    for (const row of rows) {
      const id = key(row);
      if (!id || seen.has(id)) continue; // Live Google Sheets entries take precedence.
      seen.add(id);
      result.push(row);
    }
    return result;
  }
  window.SiteWordSchedule = { load, merge, getRows: () => rows.slice() };
})();
