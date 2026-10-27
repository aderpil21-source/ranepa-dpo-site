// Originals stay on Drive; only public responses use Russian download copies.
const RU_MIRROR_ENDPOINT = 'https://functions.yandexcloud.net/d4epn9fj3lub5pa30m7u';
function generateUniqueLectureCode_(sheet){
  const used=new Set();
  if(sheet&&sheet.getLastRow()>1)sheet.getRange(2,1,sheet.getLastRow()-1,1).getValues().forEach(row=>used.add(String(row[0]||'').trim().toUpperCase()));
  for(let i=0;i<100;i++){const code='ЛК-'+Utilities.getUuid().replace(/-/g,'').slice(0,8).toUpperCase();if(!used.has(code))return code;}
  throw new Error('Не удалось создать уникальный код');
}
function russiaDriveId_(value) {
  const s=String(value||'');
  if(!/^https:\/\/(?:drive\.google\.com|drive\.usercontent\.google\.com|lh3\.googleusercontent\.com)\//i.test(s))return '';
  const m=s.match(/[?&]id=([\w-]+)/)||s.match(/\/d\/([\w-]+)/);
  return m?m[1]:'';
}
function russiaRewrite_(value) {
  if(typeof value==='string') {
    return value.replace(/https:\/\/(?:drive\.google\.com|lh3\.googleusercontent\.com|drive\.usercontent\.google\.com)\/[^\s"'<>]+/g,function(url){const id=russiaDriveId_(url);return id?(PropertiesService.getScriptProperties().getProperty('RU_MIRROR_'+id)||url):url;});
  }
  if(Array.isArray(value))return value.map(russiaRewrite_);
  if(value&&typeof value==='object') {const out={};Object.keys(value).forEach(k=>out[k]=russiaRewrite_(value[k]));return out;}
  return value;
}
function doGet(e) {
  const output=portalDoGetOriginal_(e);
  if(e&&e.parameter&&e.parameter.mirrorSource==='1')return output;
  try {output.setContent(JSON.stringify(russiaRewrite_(JSON.parse(output.getContent()))));}catch(ignore){}
  return output;
}
function russiaEnsureMirror_(url) {
  const id=russiaDriveId_(url);if(!id)return url;
  const props=PropertiesService.getScriptProperties(),key='RU_MIRROR_'+id,cached=props.getProperty(key);
  if(cached)return cached;
  const r=UrlFetchApp.fetch(RU_MIRROR_ENDPOINT+'?asset='+encodeURIComponent(id),{muteHttpExceptions:true});
  const data=JSON.parse(r.getContentText());
  if(r.getResponseCode()!==200||!data.ok||!/^https:\/\/storage\.yandexcloud\.net\/ranepa-dpo-materials-20261026\//.test(data.url||''))throw new Error('Копия файла в Яндексе ещё не готова');
  props.setProperty(key,data.url);return data.url;
}
function syncRussianFileMirrors() {
  const lock=LockService.getUserLock();if(!lock.tryLock(1000))return;
  try {
    const started=Date.now(),urls=[],seen={};
    function scan(v){if(typeof v==='string'){(v.match(/https:\/\/(?:drive\.google\.com|lh3\.googleusercontent\.com|drive\.usercontent\.google\.com)\/[^\s"'<>]+/g)||[]).forEach(function(url){const id=russiaDriveId_(url);if(id&&!seen[id]){seen[id]=true;urls.push(url);}});}else if(Array.isArray(v))v.forEach(scan);else if(v&&typeof v==='object')Object.keys(v).forEach(k=>scan(v[k]));}
    const raw=JSON.parse(portalDoGetOriginal_({parameter:{mirrorSource:'1'}}).getContent());
    scan((raw.owlFiles||[]).filter(x=>x.isPublished===true).map(x=>x.url));scan(raw.programs||[]);scan(newsList_(false));try{scan(JSON.parse(adminHandleGet_({parameter:{type:'siteSettings'}}).getContent()));}catch(ignore){}
    let attempted=0,ready=0;
    const props=PropertiesService.getScriptProperties(),cursor=Number(props.getProperty('RU_MIRROR_CURSOR')||0);
    for(let step=0;step<urls.length&&Date.now()-started<210000;step++) {
      const i=(cursor+step)%urls.length;props.setProperty('RU_MIRROR_CURSOR',String(i+1));
      if(PropertiesService.getScriptProperties().getProperty('RU_MIRROR_'+russiaDriveId_(urls[i])))continue;
      if(++attempted>12)break;
      try{russiaEnsureMirror_(urls[i]);ready++;}catch(ignore){}
    }
    console.log('Russian file copies prepared: '+ready+'; attempted: '+Math.min(attempted,12));
  } finally {lock.releaseLock();}
}
function installRussianFileMirrors() {
  if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='syncRussianDriveArchives'))ScriptApp.newTrigger('syncRussianDriveArchives').timeBased().everyMinutes(1).create();
  if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='syncRussianFileMirrors'))ScriptApp.newTrigger('syncRussianFileMirrors').timeBased().everyMinutes(1).create();
  if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='parseIncomingEmails'))ScriptApp.newTrigger('parseIncomingEmails').timeBased().everyMinutes(1).create();
  console.log('Automatic email processing and Russian file copies enabled.');
}
function parseIncomingEmails() {
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  try{return parseIncomingEmailsOriginal_();}finally{lock.releaseLock();}
}
function russiaResumeEmail_(message,sender){const props=PropertiesService.getScriptProperties(),key='RU_MAIL_'+message.getId(),raw=props.getProperty(key);if(!raw)return false;const record=JSON.parse(raw);if(!record.sent){MailApp.sendEmail(normalizeEmailAddress_(sender),'Материалы успешно загружены','Здравствуйте!\n\nВаши материалы («'+record.subject+'») успешно обработаны и доступны для студентов.\nКод доступа: '+record.code+'\n\nС уважением, Цифровой ассистент РАНХиГС.');record.sent=true;props.setProperty(key,JSON.stringify(record));}message.markRead();return true;}
