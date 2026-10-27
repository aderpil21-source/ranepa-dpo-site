const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
function setup(fetcher){
 const records={};
 const props={getProperty:k=>records[k]||null,setProperty:(k,v)=>records[k]=v,deleteProperty:k=>delete records[k],getProperties:()=>({...records})};
 const context={Date,console,PropertiesService:{getScriptProperties:()=>props},ScriptApp:{getOAuthToken:()=> 'test-token'},newsCheckToken_:token=>token==='valid',Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()]},ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({getContent:()=>s,setMimeType(){return this;}})},UrlFetchApp:{fetch:fetcher}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('apps-script/DriveArchive.gs','utf8'),context);
 return {context,records};
}
const response=(code,headers={},data={})=>({getResponseCode:()=>code,getAllHeaders:()=>headers,getContentText:()=>JSON.stringify(data)});
test('archive queue requires an editor session and rejects arbitrary download hosts',()=>{
 const {context,records}=setup(()=>{throw Error('must not fetch');});
 const call=body=>JSON.parse(context.russiaHandlePost_({postData:{contents:JSON.stringify(body)}}).getContent());
 assert.equal(call({action:'siteArchiveMedia',url:'https://storage.yandexcloud.net/b/file',token:'wrong'}).code,'SESSION_EXPIRED');
 assert.equal(call({action:'siteArchiveMedia',url:'http://169.254.169.254/secret',token:'valid'}).ok,false);
 assert.equal(Object.keys(records).length,0);
});
test('repeated queue requests create one persistent server job',()=>{
 const {context,records}=setup(()=>{throw Error('must not fetch');});
 const body={action:'siteArchiveMedia',url:'https://storage.yandexcloud.net/b/file',name:'Lecture',token:'valid'};
 for(let i=0;i<2;i++)assert.equal(JSON.parse(context.russiaHandlePost_({postData:{contents:JSON.stringify(body)}}).getContent()).archivePending,true);
 assert.equal(Object.keys(records).length,1);
});
test('an ambiguously completed upload is recovered without creating another file',()=>{
 let calls=0;const {context,records}=setup((url,options)=>{calls++;assert.equal(options.headers['Content-Range'],'bytes */100');return response(200,{}, {id:'completed-file'});});
 assert.equal(context.russiaArchiveChunk_('job',{uploadUri:'https://www.googleapis.com/upload/drive/v3/files?upload_id=test',total:100}),true);
 assert.equal(records.RU_ARCHIVE_job,'completed-file');assert.equal(calls,1);
});
test('resumed uploads start at the offset confirmed by Drive',()=>{
 const blob={getBytes:()=>[1,2,3],getContentType:()=> 'application/pdf'};let calls=0;
 const {context,records}=setup((url,options)=>{
  calls++;
  if(calls===1)return response(308,{Range:'bytes=0-4'});
  if(calls===2){assert.equal(options.headers.Range,'bytes=5-7');return {...response(206,{'Content-Range':'bytes 5-7/8'}),getBlob:()=>blob};}
  assert.equal(options.headers['Content-Range'],'bytes 5-7/8');return response(200,{}, {id:'resumed-file'});
 });
 assert.equal(context.russiaArchiveChunk_('job',{url:'https://storage.yandexcloud.net/b/file',uploadUri:'https://www.googleapis.com/upload/drive/v3/files?upload_id=test',total:8,offset:0}),true);
 assert.equal(records.RU_ARCHIVE_job,'resumed-file');assert.equal(calls,3);
});
