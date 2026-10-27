const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('approved November 3 correction supersedes the full Word programme name offline', async () => {
  const root = path.resolve(__dirname, '..');
  const context = {
    window: {}, fetch: async () => { throw Error('offline'); },
    DecompressionStream, Blob, Response, Uint8Array, atob, console, Date
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'schedule-word-loader.js'), 'utf8'), context);
  const imported = await context.window.SiteWordSchedule.load();
  const base = JSON.parse(fs.readFileSync(path.join(root, 'schedule-data.json'), 'utf8')).schedules;
  const merged = context.window.SiteWordSchedule.merge(base);
  const correction = merged.filter(row => row.date === '03.11.2026' && row.program.startsWith('Эффективные письменные коммуникации'));
  assert.equal(correction.length, 1);
  assert.equal(correction[0].time, '14:00');
  assert.equal(correction[0].teacher, '');
  for (const row of imported) {
    if (row.date === '03.11.2026' && row.program.startsWith('Эффективные письменные коммуникации')) continue;
    assert(merged.some(item => item.program === row.program && item.date === row.date && item.time === row.time),
      `Word supplement retained: ${row.id}`);
  }
  const stress = merged.filter(row => row.program.startsWith('Управление эмоциями'));
  assert.match(stress.find(row => row.date === '29.10.2026').subject, /^Осознание и управление собственными эмоциями/);
  assert.match(stress.find(row => row.date === '30.10.2026').subject, /^Структура стрессовой ситуации/);
});
