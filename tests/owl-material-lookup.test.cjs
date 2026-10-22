const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const owl = fs.readFileSync('owl-engine.js','utf8');
const home = fs.readFileSync('index.html','utf8');
const resilience = fs.readFileSync('public-data-resilience.js','utf8');

const first = owl.indexOf('function owlCanonicalLectureCode(value) {');
const last = owl.indexOf('let owlLastSubmit = { text:', first);
assert(first >= 0 && last > first, 'Material handler must be available in owl engine');
const earlyCall = owl.indexOf('await owlHandleLectureMaterialCode(originalText)');
const programmeGate = owl.indexOf("if (!Array.isArray(globalPrograms) || !globalPrograms.length)");
const faqRanking = owl.indexOf('owlResolveSiteFaq(originalText)');
assert(first < earlyCall && earlyCall < programmeGate && earlyCall < faqRanking,
  'Lecture codes must be handled before programme loading or learned responses');
assert(!owl.includes('globalOwlFiles.find(f => String(f.code'),
  'Public browser material catalogue must never bypass protected code lookup');

let messages = [];
let result = null;
let throws = false;
const context = {
  window: {lookupOwlMaterialByCode:async() => {if(throws)throw Error('network down');return result;}},
  currentLang:'ru',
  translationsHTML: {ru: {
    owlMaterialsFound:'Материалы по теме «{title}» найдены',
    owlMaterialsOpen:'Скачать / открыть материалы',
    owlTeacherComment:'Комментарий преподавателя',
    owlMaterialsUpdated:'Обновлено'
  }},
  addBotMsg:msg=>messages.push(msg),
  loadOwlI18n:async()=>{},
  localizedOwlField:(file,key)=>String(file[key]||''),
  escapeOwlText:value=>String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
  safeOwlHttpUrl:value=>/^https:\/\//.test(String(value||''))?String(value):'',
  formatI18n:(template,args)=>template.replace('{title}', args.title)
};
vm.runInNewContext(owl.slice(first,last) +
  '\nthis.material={canonical:owlCanonicalLectureCode,handle:owlHandleLectureMaterialCode};',context);
const {canonical,handle}=context.material;
assert.equal(canonical('ЛК-1234'),'ЛК-1234');
assert.equal(canonical('LK-1234'),'ЛК-1234','Latin keyboard must be accepted');
assert.equal(canonical('Код: ЛК—1234.'),'ЛК-1234','Text and typographic dash must be accepted');
assert.equal(canonical('ЛК-ABCDEF01'),'ЛК-ABCDEF01');
assert.equal(canonical('Вопрос без кода'),'');
assert.equal(canonical('ЛК-1234 и ЛК-1235'),'','ambiguous two codes must not be guessed');

(async()=>{
  const sample = {title:'Пример лекции',isPublished:true,
    url:'https://example.org/material.pdf',comment:'Учебный материал',date:'20.10.2026'};
  result=sample;
  assert.equal(await handle('LK-1234'),true);
  assert.match(messages.pop(),/href="https:\/\/example\.org\/material\.pdf"/,
    'Valid instructor code must return usable material link');

  result={...sample,isPublished:false};
  assert.equal(await handle('ЛК-1234'),true);
  const hidden=messages.pop();
  assert.match(hidden,/недоступны/);
  assert.doesNotMatch(hidden,/material\.pdf|Пример лекции/,'Revoked material details must stay private');

  result=null;
  assert.equal(await handle('ЛК-1234'),true);
  assert.match(messages.pop(),/не найдены/,'404 must not launch generic programme search');

  throws=true;
  assert.equal(await handle('ЛК-1234'),true);
  const offline=messages.pop();
  assert.match(offline,/временно не отвечает/);
  assert.doesNotMatch(offline,/не найдены/,'Server outage is not a revoked code');
  assert.equal(await handle('Привет'),false,'Ordinary user queries must be untouched');

  const lookupStart=home.indexOf('async function lookupOwlMaterialByCode(code) {');
  const lookupEnd=home.indexOf('window.lookupOwlMaterialByCode = lookupOwlMaterialByCode;',lookupStart);
  assert(lookupStart>=0&&lookupEnd>lookupStart);
  const ctx={window:{},encodeURIComponent,fetchPublicData:async()=>({ok:true,item:sample})};
  vm.runInNewContext(home.slice(lookupStart,lookupEnd) +
    '\nthis.lookup=lookupOwlMaterialByCode;',ctx);
  assert.equal((await ctx.lookup('ЛК-1234')).url,sample.url);
  ctx.fetchPublicData=async()=>{throw Error('Public API HTTP 404')};
  assert.equal(await ctx.lookup('ЛК-1234'),null,'404 is not found');
  ctx.fetchPublicData=async()=>{throw Error('Public API HTTP 503')};
  await assert.rejects(ctx.lookup('ЛК-1234'),/503/,'Outages must not be silently swallowed');


  const wrapperStart=home.indexOf('async function fetchPublicData(path, fallbackUrl, timeoutMs) {');
  const wrapperEnd=home.indexOf('// Общая обезличенная память Совы',wrapperStart);
  assert(wrapperStart>=0 && wrapperEnd>wrapperStart);
  let requestedUrl='';
  const wrapperContext={
    INDEX_PUBLIC_DATA_API:'https://ranepa-dpo-public-api.onrender.com',
    window:{dpoPublicFetch:async(url)=>{requestedUrl=url;return {ok:true,json:async()=>({ok:true,item:sample})};}},
    AbortController,setTimeout,clearTimeout,Date
  };
  vm.runInNewContext(home.slice(wrapperStart,wrapperEnd)+'\nthis.load=fetchPublicData;',wrapperContext);
  await wrapperContext.load('/material?code='+encodeURIComponent('ЛК-1234'),null,1000);
  const parsed=new URL(requestedUrl);
  assert.equal(parsed.searchParams.get('code'),'ЛК-1234',
    'Cache busting must NEVER mutate the material access code');
  assert(parsed.searchParams.has('_'),'Cache buster must use its own query parameter');

  assert(resilience.includes("const materialPrimary = 'https://ranepa-dpo-site.vercel.app/api"),
    'Protected service must be called, not obsolete suspended Render');
  assert.deepEqual(JSON.parse(fs.readFileSync('owl-files.json','utf8')).owlFiles,[],
    'Never publish teacher codes in static files');
  console.log('Lecture material lookup: valid, Latin keyboard, hidden, absent, offline and independent of programmes — OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
