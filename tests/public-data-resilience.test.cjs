const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync('public-data-resilience.js','utf8');
function setup(fetch){const window={location:{href:'https://ranepa-dpo39.ru/index.html'}};vm.runInNewContext(code,{window,URL,AbortController,fetch,setTimeout:(fn)=>setTimeout(fn,15),clearTimeout});return window.dpoPublicFetch;}
const legacy='https://ranepa-dpo-public-api.onrender.com';
test('local snapshot first, including authoritative empty list',async()=>{const calls=[];const f=setup(async u=>{calls.push(u);return Response.json({schedules:[]})});const r=await f(legacy+'/schedule');assert.deepEqual(await r.json(),{schedules:[]});assert.equal(calls.length,1);assert.match(calls[0],/^https:\/\/ranepa-dpo39.ru\/schedule-data.json/)});
test('invalid JSON, HTTP failure and hung connection use independent mirror',async()=>{for(const first of [()=>Response.json({}, {status:503}),()=>new Response('<html>'),()=>new Promise(()=>{})]){let n=0;const f=setup(async u=>{if(++n===1)return first();assert.match(u,/raw.githubusercontent.com/);return Response.json({items:[]})});assert.deepEqual(await (await f(legacy+'/news')).json(),{items:[]})}});
test('both providers failing terminates',async()=>{await assert.rejects(setup(()=>new Promise(()=>{}))(legacy+'/portal'),/timeout/)});
test('material lookup survives regional blocking of ChatGPT host',async()=>{
  const calls=[];
  const f=setup(async u=>{calls.push(u);if(u.includes('chatgpt.site'))throw Error('blocked');return Response.json({ok:true,item:{title:'Lecture',isPublished:true,url:'https://example.org/file'}})});
  const result=await f(legacy+'/material?code='+encodeURIComponent('ЛК-1234'));
  assert.equal((await result.json()).item.title,'Lecture');assert.equal(calls.length,2);
});
test('render outage uses independent service, revoked codes are never read from snapshots',async()=>{
  const f=setup(async u=>{if(u.includes('onrender.com'))throw Error('offline');return Response.json({ok:false,error:'not_found'},{status:404})});
  assert.equal((await f(legacy+'/material?code='+encodeURIComponent('ЛК-1234'))).status,404);
});
test('materials terminate even if both connections hang',async()=>{
  await assert.rejects(setup(()=>new Promise(()=>{}))(legacy+'/material?code='+encodeURIComponent('ЛК-1234')),/Material services unavailable/);
});
test('invalid HTML response does not hide the working independent service',async()=>{
  const f=setup(async u=>u.includes('chatgpt.site')?new Response('<html>proxy error</html>'):Response.json({ok:true,item:{title:'Lecture',isPublished:true}}));
  assert.equal((await (await f(legacy+'/material?code='+encodeURIComponent('ЛК-1234'))).json()).ok,true);
});

test('writes are not retried or rerouted',async()=>{let n=0;const options={method:'POST',body:'private'};const f=setup(async(u,o)=>{n++;assert.equal(u,legacy+'/settings');assert.equal(o,options);return new Response('ok')});await f(legacy+'/settings',options);assert.equal(n,1)});
