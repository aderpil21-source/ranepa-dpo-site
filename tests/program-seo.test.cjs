const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

// Minimal DOM seam; execute the production helper, including its initial URL handling.
function page(search) {
  const nodes = [];
  const document = {
    title: '', documentElement: {},
    createElement(tag) { return {tag, setAttribute(k, v) { this[k] = v; }, remove() { nodes.splice(nodes.indexOf(this), 1); }}; },
    getElementById(id) { return nodes.find(n => n.id === id); },
    head: {
      appendChild(node) { nodes.push(node); },
      querySelector(selector) {
        const [, attribute, key] = selector.match(/meta\[(\w+)="([^"]+)"\]/);
        return nodes.find(n => n.tag === 'meta' && n[attribute] === key);
      }
    }
  };
  const window = {};
  vm.runInNewContext(fs.readFileSync('program-seo.js', 'utf8'), {document, window, location: {search}, URLSearchParams});
  return {document, window, nodes, meta: key => nodes.find(n => n.name === key || n.property === key)?.content};
}

test('canonical preserves program identity, strips tracking/language and escapes IDs', () => {
  const p = page('?id=c14&utm_source=test&lang=en');
  assert.equal(p.nodes.find(n => n.rel === 'canonical').href, 'https://ranepa-dpo39.ru/program.html?id=c14');
  assert.equal(page('?id=x%26y').meta('og:url'), 'https://ranepa-dpo39.ru/program.html?id=x%26y');
});
test('metadata follows loaded content and language without accumulating duplicate tags', () => {
  const p = page('?id=c14');
  p.window.updateProgramSeo({id: 'c14'}, 'ru', 'Управление', 'Описание программы');
  p.window.updateProgramSeo({id: 'c14'}, 'en', 'Management', 'Course description');
  assert.equal(p.document.title, 'Management | RANEPA Western Branch');
  assert.equal(p.meta('description'), 'Course description');
  assert.equal(p.meta('og:locale'), 'en_US');
  assert.equal(p.meta('twitter:title'), p.document.title);
  assert.equal(p.document.documentElement.lang, 'en');
  assert.equal(p.nodes.filter(n => n.name === 'description').length, 1);
  const schema = JSON.parse(p.document.getElementById('program-schema').textContent);
  assert.equal(schema['@type'], 'Course');
  assert.equal(schema.name, 'Management');
  assert.equal(schema.url, p.meta('og:url'));
});
test('missing or hidden programs are excluded and stale structured data removed', () => {
  assert.equal(page('').meta('robots'), 'noindex, follow');
  const p = page('?id=hidden');
  p.window.updateProgramSeo({id: 'hidden'}, 'ru', 'Название', 'Описание');
  p.window.updateProgramSeo(null, 'ru');
  assert.equal(p.meta('robots'), 'noindex, follow');
  assert.equal(p.document.getElementById('program-schema'), undefined);
});
