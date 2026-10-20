const assert = require('node:assert/strict');
const {chromium} = require('playwright');

(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    await page.goto('https://ranepa-dpo39.ru/',{waitUntil:'domcontentloaded',timeout:30000});
    const status = await page.evaluate(async () => {
      // Invalid syntax is deliberate: never use a real lecture code in CI or logs.
      // A readable HTTP 400 proves the protected materials host allows a
      // cross-origin browser request from the real site's origin (CORS).
      const target = 'https://ranepa-dpo-materials-api.rt9b8frtkg.chatgpt.site/material?code=bad';
      try {
        const response = await fetch(target,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
        return {readable:true,status:response.status};
      } catch (e) {
        return {readable:false,error:String(e && e.name || 'network_or_cors_error')};
      }
    });
    assert(status.readable && status.status===400,
      'Materials API must return an accessible HTTP 400 (not a CORS/network error) from the production site: '+JSON.stringify(status));
    await page.close();
    console.log('Protected materials endpoint is readable from production site origin (CORS/network) — OK');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
