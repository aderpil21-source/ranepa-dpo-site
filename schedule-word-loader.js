/* Imported Word schedules supplement (never replace) live Google Sheets data. */
(() => {
  let rows = [];
  let pending = null;
  const url = './schedule-docx-import.json.gz.b64';
  const bundledSchedule = "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"; // Same-origin fallback if separate file is not served.
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
      if (typeof DecompressionStream !== 'function') throw Error('Browser does not support gzip decompression');
      let encoded = bundledSchedule;
      try {
        const response = await fetch(url + '?v=' + bucket, { cache: 'no-store' });
        if (response.ok) {
          const fetched = (await response.text()).replace(/\s+/g, '');
          if (fetched.startsWith('H4sI') && fetched.length > 1000) encoded = fetched;
        }
      } catch (_) { /* Use the bundled fallback. */ }
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
