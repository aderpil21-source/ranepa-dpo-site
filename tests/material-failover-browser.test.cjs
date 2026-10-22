const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
const server = http.createServer((req,res) => {
  const file = path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if (!file.startsWith(root+path.sep)) return res.writeHead(403).end();
  try {res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}
  catch {res.writeHead(404).end();}
});
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = 'http://127.0.0.1:'+server.address().port;
  const browser = await chromium.launch({headless:true,...(process.env.TEST_BROWSER_CHANNEL?{channel:process.env.TEST_BROWSER_CHANNEL}:{})});
  try {
    for (const blocked of ['vercel.app','onrender.com','both']) {
      const page = await browser.newPage({viewport:{width:390,height:844}});
      page.setDefaultTimeout(12000);
      await page.route('**/*',route => {
        const url = new URL(route.request().url());
        if (url.origin === base) return route.continue();
        if (url.pathname.endsWith('/material')){
          if (blocked==='both' || url.hostname.endsWith(blocked)) return route.abort();
          return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({ok:true,item:{title:'Test lecture',url:'https://example.org/file',isPublished:true}})});
        }
        return route.abort();
      });
      await page.goto(base+'/students.html',{waitUntil:'domcontentloaded'});
      await page.locator('#materialCode').fill('ЛК-1234');
      await page.locator('#materialLookupForm button[type="submit"]').click();
      await page.waitForSelector('#materialResult.'+(blocked==='both'?'error':'success'));
      if (blocked!=='both') assert.equal(await page.locator('#materialResult a').getAttribute('href'),'https://example.org/file');
      else assert.match(await page.locator('#materialResult').textContent(),/Не удалось проверить код/);
      await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
      const result = await page.evaluate(async()=>{try{const item=await window.lookupOwlMaterialByCode('ЛК-1234');return {found:!!item};}catch{return {unavailable:true};}});
      assert.equal(blocked==='both'?result.unavailable:result.found,true);
      await page.close();
    }
    console.log('Mobile material form and Owl survive either provider failure; total outage stays an explicit error.');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
