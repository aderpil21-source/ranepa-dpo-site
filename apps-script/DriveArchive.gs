// Resumable server-side copying keeps large PRO uploads out of browser memory.
function russiaHeader_(headers,name){const key=Object.keys(headers).find(k=>k.toLowerCase()===name.toLowerCase());return key?String(headers[key]):'';}
function russiaArchiveKey_(url){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,url).map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');}
function russiaQueuePublishedArchive_(url){
 if(!/^https:\/\/storage\.yandexcloud\.net\/[a-z0-9.-]+\/[^?#]+$/.test(url))return;
 const props=PropertiesService.getScriptProperties(),key=russiaArchiveKey_(url);
 if(props.getProperty('RU_ARCHIVE_'+key)||props.getProperty('RU_ARCHIVE_JOB_'+key))return;
 let name=url.split('/').pop();try{name=decodeURIComponent(name);}catch(ignore){}
 props.setProperty('RU_ARCHIVE_JOB_'+key,JSON.stringify({url:url,name:('Медиа сайта - '+name).slice(0,160),offset:0,created:Date.now()}));
}
function publishExistingDriveArchives(){
 const props=PropertiesService.getScriptProperties(),all=props.getProperties();let count=0;
 Object.keys(all).filter(k=>/^RU_ARCHIVE_[a-f0-9]{64}$/.test(k)).forEach(function(k){const key=k.slice('RU_ARCHIVE_'.length);if(props.getProperty('RU_ARCHIVE_PUBLIC_'+key)==='1')return;const file=DriveApp.getFileById(all[k]);if(file.isTrashed())return;file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);props.setProperty('RU_ARCHIVE_PUBLIC_'+key,'1');count++;});
 console.log('Download-ready Drive archives: '+count);
}
function russiaArchiveChunk_(key,job){
 const props=PropertiesService.getScriptProperties(),token=ScriptApp.getOAuthToken();
 if(job.uploadUri){
  const status=UrlFetchApp.fetch(job.uploadUri,{method:'put',headers:{Authorization:'Bearer '+token,'Content-Range':'bytes */'+job.total},payload:'',muteHttpExceptions:true});
  if(status.getResponseCode()===200||status.getResponseCode()===201){const id=JSON.parse(status.getContentText()).id;DriveApp.getFileById(id).setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);props.setProperty('RU_ARCHIVE_'+key,id);props.setProperty('RU_ARCHIVE_PUBLIC_'+key,'1');props.deleteProperty('RU_ARCHIVE_JOB_'+key);return true;}
  if(status.getResponseCode()===308){const range=russiaHeader_(status.getAllHeaders(),'Range');job.offset=range?Number(range.split('-').pop())+1:0;}
  else if([404,410].includes(status.getResponseCode())){delete job.uploadUri;job.offset=0;}
  else throw new Error('Не удалось проверить загрузку на Google Диск');
 }
 const start=job.offset||0,end=Math.min(start+8*1024*1024-1,(job.total||Infinity)-1);
 const source=UrlFetchApp.fetch(job.url,{headers:{Range:'bytes='+start+'-'+end},muteHttpExceptions:true});
 if(![200,206].includes(source.getResponseCode()))throw new Error('Копия в Яндексе недоступна');
 const blob=source.getBlob(),bytes=blob.getBytes(),range=russiaHeader_(source.getAllHeaders(),'Content-Range');
 if(start&&source.getResponseCode()!==206)throw new Error('Хранилище не поддерживает продолжение скачивания');
 const total=range?Number(range.split('/').pop()):bytes.length;
 if(!total||total>500*1024*1024)throw new Error('Максимальный размер автоматического архива — 500 МБ');
 if(!job.uploadUri){
  job.total=total;
  const created=UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+token,'X-Upload-Content-Length':String(total),'X-Upload-Content-Type':blob.getContentType()},payload:JSON.stringify({name:job.name,parents:['1eZSv1e3C8H_EXoLMzvfYgdBE9FWIJMHn']}),muteHttpExceptions:true});
  if(![200,201].includes(created.getResponseCode()))throw new Error('Не удалось начать сохранение на Google Диск');
  job.uploadUri=russiaHeader_(created.getAllHeaders(),'Location');
  if(!/^https:\/\/www\.googleapis\.com\/upload\/drive\//.test(job.uploadUri))throw new Error('Некорректная сессия Google Диска');
  props.setProperty('RU_ARCHIVE_JOB_'+key,JSON.stringify(job));
 }
 const upload=UrlFetchApp.fetch(job.uploadUri,{method:'put',contentType:blob.getContentType(),headers:{Authorization:'Bearer '+token,'Content-Range':'bytes '+start+'-'+(start+bytes.length-1)+'/'+total},payload:bytes,muteHttpExceptions:true});
 if([200,201].includes(upload.getResponseCode())){const id=JSON.parse(upload.getContentText()).id;DriveApp.getFileById(id).setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);props.setProperty('RU_ARCHIVE_'+key,id);props.setProperty('RU_ARCHIVE_PUBLIC_'+key,'1');props.deleteProperty('RU_ARCHIVE_JOB_'+key);return true;}
 if(upload.getResponseCode()!==308)throw new Error('Google Диск не принял часть файла');
 job.offset=start+bytes.length;props.setProperty('RU_ARCHIVE_JOB_'+key,JSON.stringify(job));return false;
}
function syncRussianDriveArchives(){
 const lock=LockService.getUserLock();if(!lock.tryLock(1000))return;
 try{const props=PropertiesService.getScriptProperties(),all=props.getProperties(),started=Date.now();
  for(const name of Object.keys(all).filter(k=>k.indexOf('RU_ARCHIVE_JOB_')===0)){
   if(Date.now()-started>45000)break;
   const job=JSON.parse(all[name]);if((job.nextAttemptAt||0)>Date.now())continue;
   try{russiaArchiveChunk_(name.slice('RU_ARCHIVE_JOB_'.length),job);}catch(error){job.failures=(job.failures||0)+1;job.error=String(error.message||error);job.nextAttemptAt=Date.now()+Math.min(3600000,60000*Math.pow(2,Math.min(job.failures,6)));props.setProperty(name,JSON.stringify(job));}
  }
 }finally{lock.releaseLock();}
}
function russiaHandlePost_(e){
 let data;try{data=JSON.parse(e.postData.contents);}catch(ignore){return null;}
 if(data.action!=='siteArchiveMedia')return null;
 if(!newsCheckToken_(data.token))return ContentService.createTextOutput(JSON.stringify({ok:false,code:'SESSION_EXPIRED'})).setMimeType(ContentService.MimeType.JSON);
 let result;
 try{const url=String(data.url||'');if(!/^https:\/\/storage\.yandexcloud\.net\/[a-z0-9.-]+\/[^?#]+$/.test(url))throw new Error('Недопустимый источник файла');
  const key=russiaArchiveKey_(url),props=PropertiesService.getScriptProperties(),id=props.getProperty('RU_ARCHIVE_'+key);
  if(id)result={ok:true,driveUrl:'https://drive.google.com/file/d/'+id+'/view'};
  else{const name=String(data.name||'Файл').replace(/[\\/:*?"<>|]/g,'_').slice(0,160);if(!props.getProperty('RU_ARCHIVE_JOB_'+key))props.setProperty('RU_ARCHIVE_JOB_'+key,JSON.stringify({url:url,name:name,offset:0,created:Date.now()}));result={ok:true,archivePending:true};}
 }catch(error){result={ok:false,error:String(error.message||error)};}
 return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
