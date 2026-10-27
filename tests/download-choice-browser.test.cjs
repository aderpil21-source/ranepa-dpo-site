const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const google='https://drive.google.com/file/d/abcdefghijklmno12345/view';
const yandex='https://storage.yandexcloud.net/ranepa-dpo-materials-20261026/test-file.pdf';
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 try{res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_CHANNEL?{channel:process.env.TEST_BROWSER_CHANNEL}:{})});
 try{
  for(const state of ['healthy','quota','offline','slow']){
   const context=await browser.newContext({viewport:{width:390,height:844}});
   await context.route('**/*',async route=>{
    const u=new URL(route.request().url());if(u.origin===base)return route.continue();
    if(route.request().isNavigationRequest()&&(u.hostname==='drive.google.com'||u.hostname==='storage.yandexcloud.net'))return route.fulfill({status:200,contentType:'text/html',body:'<h1>Download ready</h1>'});
    const headers={'Access-Control-Allow-Origin':'*'};
    if(u.searchParams.has('download')){
     if(state==='offline')return route.abort();
     if(state==='slow')await new Promise(r=>setTimeout(r,4100));
     try{return await route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify({ok:true,provider:state==='healthy'?'yandex':'google',url:state==='healthy'?yandex:google})});}catch{return;}
    }
    if(u.searchParams.has('code'))return route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify({ok:true,item:{title:'Lecture',isPublished:true,url:google,googleUrl:google,yandexUrl:yandex}})});
    return route.abort();
   });
   const page=await context.newPage();await page.goto(base+'/students.html',{waitUntil:'domcontentloaded'});
   await page.locator('#materialCode').fill('ЛК-1234');await page.locator('#materialLookupForm button[type="submit"]').click();
   await page.waitForSelector('#materialResult.success [data-download-provider="yandex"]');
   assert.equal(await page.locator('#materialResult a').first().getAttribute('href'),google);
   assert.match(await page.locator('#materialResult a').first().textContent(),/Google/);
   const popupPromise=page.waitForEvent('popup');await page.locator('#materialResult [data-download-provider="yandex"]').click();
   const popup=await popupPromise;await popup.waitForURL(state==='healthy'?yandex:google,{timeout:8000});
   if(state!=='healthy')assert.match(await page.locator('.download-source-status').textContent(),/Открываем Google/);
   console.log('Google primary and Yandex choice: '+state+' passed');await context.close();
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
