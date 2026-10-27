import {test} from 'node:test';
import assert from 'node:assert/strict';
import {driveId,publishedDriveIds,mirrorDrive} from '../public-api-proxy/drive-mirror.mjs';
test('only Google file IDs and published files are eligible',()=>{
 const id='abcdefghijklmno12345';
 assert.equal(driveId('https://evil.test/d/'+id),'');
 assert.equal(driveId('https://drive.google.com/file/d/'+id+'/view'),id);
 const ids=publishedDriveIds({owlFiles:[{isPublished:false,url:'https://drive.google.com/file/d/'+id+'/view'}],programs:[]},{items:[]});
 assert.equal(ids.size,0);
});
test('existing Russian copy does not call Google or obtain credentials',async()=>{
 let count=0;const url=await mirrorDrive('abcdefghijklmno12345',{fetcher:async(u,o)=>{count++;assert.equal(o.method,'HEAD');return new Response(null,{status:200});}});
 assert.equal(count,1);assert.match(url,/storage.yandexcloud.net/);
});
test('Google HTML error pages are never published as files',async()=>{
 let count=0;
 await assert.rejects(mirrorDrive('abcdefghijklmno12346',{fetcher:async()=>++count===1?new Response(null,{status:404}):new Response('<html>login</html>',{headers:{'content-type':'text/html'}})}),/unsupported_drive_response/);
 assert.equal(count,2);
});
test('uploads use server identity and preserve the file bytes',async()=>{
 const calls=[];
 const url=await mirrorDrive('abcdefghijklmno12347',{fetcher:async(u,o={})=>{
   calls.push([u,o]);
   if(o.method==='HEAD')return new Response(null,{status:404});
   if(u.includes('drive.usercontent'))return new Response('file-data',{headers:{'content-type':'application/pdf','content-disposition':'attachment; filename="lecture.pdf"'}});
   if(u.includes('169.254'))return Response.json({access_token:'test-token'});
   assert.equal(o.headers.Authorization,'Bearer test-token');assert.equal(await new Response(o.body).text(),'file-data');return new Response(null,{status:200});
 }});
 assert.equal(calls.length,4);assert.match(url,/\/drive\/[a-f0-9]{64}$/);
});
