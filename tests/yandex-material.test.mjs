import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
test('Yandex adapter validates codes, filters private fields and supports CORS',async()=>{
 const origin=http.createServer((req,res)=>res.end(JSON.stringify({owlFiles:[{code:'ЛК-1234',isPublished:true,title:'Lecture',url:'https://example.org/file',private:'secret'}]})));
 await new Promise(r=>origin.listen(0,'127.0.0.1',r));
 process.env.PORTAL_UPSTREAM='http://127.0.0.1:'+origin.address().port;
 const {handler}=await import('../public-api-proxy/yandex-material.mjs');
 const call=(code,method='GET')=>handler({httpMethod:method,headers:{Origin:'https://ranepa-dpo39.ru'},queryStringParameters:{code},requestContext:{identity:{sourceIp:'test'}}});
 try {
  const response=await call('ЛК-1234');
  assert.equal(response.statusCode,200);
  assert.equal(response.headers['Access-Control-Allow-Origin'],'https://ranepa-dpo39.ru');
  assert.equal(JSON.parse(response.body).item.title,'Lecture');
  assert.doesNotMatch(response.body,/secret|ЛК-1234/);
  assert.equal((await call('bad')).statusCode,400);
  assert.equal((await call('ЛК-0000')).statusCode,404);
  assert.equal((await call('ЛК-1234','POST')).statusCode,405);
  assert.equal((await call('','OPTIONS')).statusCode,204);
 } finally {origin.closeAllConnections();origin.close();}
});
