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
test('materials use new service and preserve revocation without fallback',async()=>{let n=0;const f=setup(async u=>{n++;assert.match(u,/ranepa-dpo-materials-api/);assert.equal(new URL(u).searchParams.get('code'),'ЛК-9535');return Response.json({error:'not found'},{status:404})});assert.equal((await f(legacy+'/material?code='+encodeURIComponent('ЛК-9535'))).status,404);assert.equal(n,1)});
test('writes are not retried or rerouted',async()=>{let n=0;const options={method:'POST',body:'private'};const f=setup(async(u,o)=>{n++;assert.equal(u,legacy+'/settings');assert.equal(o,options);return new Response('ok')});await f(legacy+'/settings',options);assert.equal(n,1)});
