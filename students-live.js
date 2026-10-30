(function(root){
  'use strict';
  const zone='Europe/Kaliningrad';
  const clock=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const key=x=>'schedule:'+[x?.id,x?.date,x?.time,x?.subject].map(v=>encodeURIComponent(String(v||'').trim())).join('|');
  function merge(base,settings={}){
    const overrides=new Map(),added=[];
    (settings.customSchedules||[]).forEach(x=>{if(x?.sourceKey)overrides.set(x.sourceKey,x);else if(x)added.push(x)});
    const rows=(base||[]).map(x=>{const k=key(x),ov=overrides.get(k);overrides.delete(k);return {...x,...ov}}).concat([...overrides.values()],added);
    return rows.filter(x=>x.active!==false&&!x.archived&&!x.cancelled&&settings.visibility?.[x.sourceKey||key(x)]!==false);
  }
  function dateKey(day,month,year){
    const d=new Date(Date.UTC(year,month-1,day));
    return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day?year*10000+month*100+day:null;
  }
  function interval(row){
    const dates=Array.from(String(row.date||'').matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{4})/g));
    const times=String(row.time||'').trim().match(/^(\d{1,2})[:.](\d{2})\s*[-–—−]\s*(\d{1,2})[:.](\d{2})$/);
    if(!dates.length||dates.length>2||!times)return null;
    const days=dates.map(d=>dateKey(+d[1],+d[2],+d[3]));
    const [h,m,eh,em]=times.slice(1).map(Number);
    if(days.some(d=>!d)||days.at(-1)<days[0]||h>23||eh>23||m>59||em>59)return null;
    const start=(h*60+m)*60,end=(eh*60+em)*60;
    if(end<=start)return null; // An explicit end is required; never guess the duration.
    return {first:days[0],last:days.at(-1),start,end};
  }
  function state(rows,now=new Date()){
    const p=Object.fromEntries(clock.formatToParts(now).map(x=>[x.type,x.value]));
    const today=+p.year*10000+(+p.month)*100+(+p.day),seconds=(+p.hour)*3600+(+p.minute)*60+(+p.second);
    let next=30;const active=[];
    rows.forEach(row=>{
      const range=interval(row);if(!range||today<range.first||today>range.last)return;
      if(seconds>=range.start&&seconds<range.end)active.push({row,progress:(seconds-range.start)/(range.end-range.start)});
      for(const boundary of [range.start,range.end])if(boundary>seconds)next=Math.min(next,boundary-seconds);
    });
    return {active,delay:Math.max(20,next*1000-now.getMilliseconds())};
  }
  root.StudentLiveLecture={merge,interval,state};
  if(typeof document==='undefined')return;
  const host=document.getElementById('studentsLiveLecture');if(!host)return;
  let rows=[],settings={},timer=0,inFlight=null,fingerprint='';
  function element(tag,className,text){const n=document.createElement(tag);n.className=className;if(text)n.textContent=text;return n}
  function render(){
    clearTimeout(timer);
    const source=root.SiteWordSchedule?root.SiteWordSchedule.merge(rows):rows;
    const current=state(merge(source,settings));
    const signature=JSON.stringify(current.active.map(x=>x.row));
    if(signature!==fingerprint){
      fingerprint=signature;host.replaceChildren();
      current.active.forEach(({row})=>{
        const card=element('article','live-lecture-card');
        const heading=element('div','live-lecture-heading');
        const badge=element('span','live-lecture-badge');badge.append(element('span','live-lecture-dot'),document.createTextNode('Сейчас идёт лекция'));
        heading.append(badge,element('span','live-lecture-time',row.time+' · Калининград'));
        card.append(heading,element('h2','live-lecture-subject',row.subject),element('p','live-lecture-program',row.program));
        const meta=[row.teacher,row.room].filter(Boolean).join(' · ');if(meta)card.append(element('p','live-lecture-meta',meta));
        if(row.replacement)card.append(element('span','live-lecture-replacement','Замена'));
        const track=element('div','live-lecture-track');track.setAttribute('aria-hidden','true');track.append(element('div','live-lecture-progress'));card.append(track);host.append(card);
      });
    }
    host.hidden=!current.active.length;
    host.querySelectorAll('.live-lecture-progress').forEach((bar,i)=>bar.style.width=(current.active[i].progress*100)+'%');
    timer=setTimeout(render,current.delay);
  }
  async function read(path,fallback){
    const fetcher=root.dpoPublicFetch||fetch;
    try{
      const r=await fetcher('https://ranepa-dpo-public-api.onrender.com/'+path+'?_='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!r.ok)throw Error(r.status);return await r.json();
    }catch(_){const r=await fetcher('./'+fallback+'?v='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error(r.status);return r.json()}
  }
  function refresh(){
    if(inFlight)return inFlight;
    inFlight=(async()=>{
      const results=await Promise.allSettled([read('schedule','schedule-data.json'),read('settings','site-settings.json'),root.SiteWordSchedule?.load(true)]);
      if(results[0].status==='fulfilled'&&Array.isArray(results[0].value?.schedules))rows=results[0].value.schedules;
      if(results[1].status==='fulfilled'&&results[1].value?.settings)settings=results[1].value.settings;
      render();
    })().finally(()=>inFlight=null);
    return inFlight;
  }
  refresh();setInterval(refresh,60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();refresh()}});
  root.addEventListener('focus',()=>{render();refresh()});
})(typeof window==='undefined'?globalThis:window);
