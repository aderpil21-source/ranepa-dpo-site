const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const richSource = fs.readFileSync('cms-richtext.js', 'utf8');
const news = fs.readFileSync('news.html', 'utf8');
const home = fs.readFileSync('index.html', 'utf8');
const ctx = { window: {}, URL, location: { href: 'https://ranepa-dpo39.ru/' } };
vm.runInNewContext(richSource, ctx);
const rich = ctx.window.RanepaRichText;

assert.equal(rich.isRich('__RANEPA_RICH_V1__:<strong>Поступление</strong>'), true);
assert.equal(rich.isRich('Обычный текст'), false);
assert.equal(rich.plainToHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
assert.equal(rich.plainToHtml('Первая\nВторая'), 'Первая<br>Вторая');
assert.equal(rich.safeUrl('javascript:alert(1)'), '');
assert.equal(rich.safeUrl('data:text/html,bad'), '');
assert.equal(rich.safeUrl('//attacker.example/'), '');
assert.equal(rich.safeUrl('no-protocol.test'), '');
assert.equal(rich.safeUrl('https://forms.yandex.ru/cloud/6ac66e491f1eb55cd4148bc8/'), 'https://forms.yandex.ru/cloud/6ac66e491f1eb55cd4148bc8/');
assert.ok(rich.toolbarHtml().includes('data-rt-format="bold"'));
assert.ok(rich.toolbarHtml().includes('data-rt-format="link"'));
assert.ok(rich.toolbarHtml().includes('data-rt-size'));

for (const [name, page] of [['home', home], ['news', news]]) {
  assert.ok(page.includes('src="./cms-richtext.js?v=1"'), name + ': rich text library must load');
}
assert.ok(news.includes('b.html ? newsReadingHtml(b.html) : escapeHtml(b.content)') && news.includes('return RanepaRichText.sanitize(html).replace('), 'News must sanitize rich content before display and font scaling');
assert.ok(news.includes("if (el.dataset.field === 'richtext')"), 'News must persist formatted text via editor blocks');
assert.ok(news.includes('draggable="true" title="Перетащить блок"'), 'News drag must work on grip rather than editable body');
assert.ok(home.includes("RanepaRichText.valueOf(el)"), 'PRO editor must save rich values');
assert.ok(home.includes("RanepaRichText.isRich(text)"), 'PRO editor must render marked-up values');
assert.ok(home.includes("siteAdminActiveTextEl"), 'PRO editor must keep the active text region for toolbar actions');

for (const [name, html] of [['home',home], ['news',news]]) {
  const scripts = [...html.matchAll(/<script(?![^>]*\btype="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/ig)]
    .map(x => x[1]).filter(x => x.trim());
  for (const script of scripts) {
    // Parse inline scripts without executing network calls or touching the DOM.
    new vm.Script(script, { filename: name + '.html:inline-script' });
  }
}
console.log('Rich text editor regression checks passed.');