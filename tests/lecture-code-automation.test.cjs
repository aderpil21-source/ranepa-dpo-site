const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(extra={}){
 const records={};const props={getProperty:k=>records[k],setProperty:(k,v)=>records[k]=v};
 const context={console,PropertiesService:{getScriptProperties:()=>props},...extra};vm.createContext(context);vm.runInContext(fs.readFileSync('apps-script/RussianMirrors.gs','utf8'),context);return {context,records};
}
test('new code generation checks collisions with existing old and new codes',()=>{
 let n=0;const {context}=setup({Utilities:{getUuid:()=>++n===1?'abcdef01-aaaa-bbbb-cccc-dddddddddddd':'12345678-aaaa-bbbb-cccc-dddddddddddd'}});
 const sheet={getLastRow:()=>3,getRange:()=>({getValues:()=>[['ЛК-1234'],['ЛК-ABCDEF01']]})};
 assert.equal(context.generateUniqueLectureCode_(sheet),'ЛК-12345678');assert.equal(n,2);
});
test('mail retries preserve the assigned code and do not send again after success',()=>{
 let attempts=0,reads=0;const {context,records}=setup({normalizeEmailAddress_:s=>s,MailApp:{sendEmail:(to,subject,body)=>{attempts++;assert.match(body,/ЛК-ABCDEF01/);if(attempts===1)throw Error('temporary outage');}}});
 records.RU_MAIL_message=JSON.stringify({code:'ЛК-ABCDEF01',subject:'Lecture',sent:false});const message={getId:()=> 'message',markRead:()=>reads++};
 assert.throws(()=>context.russiaResumeEmail_(message,'teacher@example.org'),/outage/);assert.equal(reads,0);
 assert.equal(context.russiaResumeEmail_(message,'teacher@example.org'),true);assert.equal(context.russiaResumeEmail_(message,'teacher@example.org'),true);
 assert.equal(attempts,2);assert.equal(JSON.parse(records.RU_MAIL_message).sent,true);
});
test('Google stays primary and completed Yandex copies are exposed as alternatives',()=>{
 const {context,records}=setup();records.RU_MIRROR_abcdefghijklmno='https://storage.yandexcloud.net/b/file';
 const input={pdf_link:'https://drive.google.com/file/d/abcdefghijklmno/view',html:'<img src="https://drive.google.com/thumbnail?id=abcdefghijklmno&sz=w1600">'};
 const output=context.russiaRewrite_(input);assert.equal(output.pdf_link,input.pdf_link);assert.equal(output.pdf_linkYandexUrl,'https://storage.yandexcloud.net/b/file');assert.equal(output.html,input.html);assert.match(input.pdf_link,/drive.google/);
});
