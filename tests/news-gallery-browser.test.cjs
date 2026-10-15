const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req,res) => {
    const file = path.resolve(root, '.' + new URL(req.url,'http://localhost').pathname);
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    try { res.setHeader('Content-Type', ({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
    catch { res.writeHead(404).end(); }
});
(async () => {
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch({headless:true, ...(process.env.TEST_BROWSER_CHANNEL ? {channel:process.env.TEST_BROWSER_CHANNEL} : {})});
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(10000);
        await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
        await page.goto(base + '/news.html', {waitUntil:'domcontentloaded'});
        await page.waitForFunction(() => typeof openDetail === 'function');
        for (const width of [1280,390]){
            await page.setViewportSize({width,height:850});
            await page.evaluate(() => {
                const image = (caption,presentation) => ({type:'image',url:'img/logo.png',caption,presentation});
                newsItems = [{id:'gallery-test',title:'Фотографии события',blocks:[image('Отдельное фото'),image('Первое','carousel'),image('Второе','carousel'),{type:'text',content:'Текст между галереями'},image('Третье','carousel')]}];
                openDetail('gallery-test');
            });
            assert.equal(await page.locator('.news-gallery').count(),2);
            assert.equal(await page.locator('.news-media-figure').count(),1,'legacy images stay separate');
            const first = page.locator('.news-gallery').first();
            assert.equal(await first.locator('.news-gallery-slide').count(),2);
            await first.getByRole('button',{name:'Следующее фото',exact:true}).click();
            await page.waitForFunction(() => document.querySelector('.news-gallery output').textContent === '2 / 2');
            await first.getByRole('button',{name:'Открыть фото 2 на весь экран'}).click();
            assert.equal(await page.locator('#mediaLightbox').isVisible(),true);
            assert.equal(await page.locator('#lightboxContent img').getAttribute('alt'),'Второе');
            await page.keyboard.press('ArrowLeft');
            assert.equal(await page.locator('#lightboxContent img').getAttribute('alt'),'Первое');
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('#mediaLightbox').isVisible(),false);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
        }
        if (process.env.GALLERY_SCREENSHOT){
            await page.setViewportSize({width:1100,height:1000});
            await page.evaluate(() => openDetail('gallery-test'));
            await page.locator('.news-gallery').first().scrollIntoViewIfNeeded();
            await page.screenshot({path:process.env.GALLERY_SCREENSHOT});
        }
        await page.evaluate(() => { $('newsEditorModal').classList.add('active'); editorBlocks = [{type:'image',url:'img/logo.png',caption:''}]; renderEditorBlocks(); });
        await page.locator('[data-field="presentation"]').selectOption('carousel');
        assert.equal(await page.evaluate(() => editorBlocks[0].presentation),'carousel');
        const roundtrip = await page.evaluate(() => JSON.parse(JSON.stringify(blocksWithVkPreference(editorBlocks,false)))[0].presentation);
        assert.equal(roundtrip,'carousel','save payload preserves the preference');
        await page.evaluate(() => { editorBlocks = []; $('newsEditorCover').value = ''; attachMedia('img/logo.png','image/png','carousel'); });
        assert.equal(await page.evaluate(() => editorBlocks.length),1,'first carousel photo remains in the article even when it becomes the cover');
        console.log('Gallery desktop/mobile, navigation, full-screen view, editor and save payload checks passed.');
    } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
