const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const page = fs.readFileSync('news.html', 'utf8');
const scripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/ig)]
  .map(x => x[1]).filter(x => x.trim());
scripts.forEach((code, index) => new vm.Script(code, {filename: 'news.html:inline-' + index}));

assert.match(page, /class="news-reader-controls"/, 'reader controls should be present in a full article');
assert.match(page, /\.news-detail-lead\{[^\n}]*max-width:100%/, 'article lead must span the image width');
assert.match(page, /\.news-body-text\{[^\n}]*max-width:100%/, 'article paragraphs must span the image width');
assert.doesNotMatch(page, /max-width:\s*68ch/, 'old narrow article width must not remain');
assert.match(page, /data-reader-step="-1"/);
assert.match(page, /data-reader-step="1"/);
assert.match(page, /aria-live="polite"/);
assert.match(page, /html\[data-theme="light"\] \.news-body-text\{color:#334155\}/);
assert.match(page, /html\[data-theme="light"\] \.chat-text-input,/);
assert.match(page, /html\[data-theme="light"\] \.back-btn,/);
assert.match(page, /html\[data-theme="light"\] \.news-tag-pill/);
assert.match(page, /newsReadingHtml\(b\.html\)/, 'inline styled spans must scale as well as plain text');
assert.match(page, /#newsReaderScaleValue/);

const begin = page.indexOf('const NEWS_READER_SCALES = ');
const end = page.indexOf('function openDetail(id){', begin);
assert.ok(begin >= 0 && end > begin, 'reader functions should be defined before opening articles');
const helper = page.slice(begin, end) +
  '\nthis.reader={applyNewsReaderScale,stepNewsReaderScale,newsReadingHtml};';
const stored = new Map();
const context = {
  localStorage: {
    getItem: k => stored.get(k) ?? null,
    setItem: (k,v) => stored.set(k,String(v))
  },
  RanepaRichText: {sanitize: v => String(v)}
};
vm.runInNewContext(helper, context);
const smaller = { disabled: false };
const larger = { disabled: false };
const value = { textContent: '' };
const style = {vars: {},setProperty(k,v){this.vars[k] = v;}};
const view = {
  style,
  querySelector(s) {
    if (s === '#newsReaderScaleValue') return value;
    if (s === '[data-reader-step="-1"]') return smaller;
    if (s === '[data-reader-step="1"]') return larger;
    throw new Error('Unexpected selector: ' + s);
  }
};

context.reader.applyNewsReaderScale(view);
assert.equal(value.textContent, '100%');
assert.equal(smaller.disabled, true);
assert.equal(larger.disabled, false);
for (const expected of [112,125,140,155]) {
  context.reader.stepNewsReaderScale(1,view);
  assert.equal(value.textContent, expected + '%');
}
assert.equal(larger.disabled, true);
context.reader.stepNewsReaderScale(1,view);
assert.equal(value.textContent, '155%', 'upper bound must be clamped');
context.reader.stepNewsReaderScale(-1,view);
assert.equal(value.textContent, '140%');
assert.equal(stored.get('ranepa-news-reader-scale-v1'), '140');
assert.equal(style.vars['--news-reader-scale'], '1.4');

const rich = context.reader.newsReadingHtml('<span style="font-size:20px">test</span>');
assert.match(rich, /font-size:calc\(20px \* var\(--news-reader-scale,1\)\)/);
const freshContext = {localStorage: context.localStorage, RanepaRichText: context.RanepaRichText};
vm.runInNewContext(helper, freshContext);
freshContext.reader.applyNewsReaderScale(view);
assert.equal(value.textContent, '140%', 'size preference must be restored across article visits');

console.log('News reader zoom, rich text scale, contrast and syntax checks passed.');
