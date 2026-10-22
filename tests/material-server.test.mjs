import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
process.env.NODE_ENV = 'test';
const {createMaterialServer} = await import('../public-api-proxy/material-server.mjs');
test('protected lookup only returns a matching published material and allows site CORS',async () => {
  let unavailable = false;
  const upstream = http.createServer((req,res) => {
    if (unavailable) {res.statusCode=503;return res.end('offline');}
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({owlFiles:[
      {code:'ЛК-1234',title:'Lecture',url:'https://example.org/lecture',isPublished:true},
      {code:'ЛК-5678',title:'Hidden',url:'https://example.org/private',isPublished:false}
    ]}));
  });
  await new Promise(resolve => upstream.listen(0,'127.0.0.1',resolve));
  const server = createMaterialServer('http://127.0.0.1:'+upstream.address().port);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = 'http://127.0.0.1:'+server.address().port;
  try {
    const get = code => fetch(base+'/material?code='+encodeURIComponent(code),{headers:{Origin:'https://ranepa-dpo39.ru'}});
    const response = await get('ЛК-1234');
    assert.equal(response.status,200);
    assert.equal(response.headers.get('access-control-allow-origin'),'https://ranepa-dpo39.ru');
    assert.match(response.headers.get('cache-control'),/no-store/);
    const body = await response.json();
    assert.equal(body.item.title,'Lecture');
    assert.equal('code' in body.item,false);
    for (const code of ['ЛК-5678','ЛК-9999']) {
      const result = await get(code); assert.equal(result.status,404);
      assert.equal((await result.text()).includes('private'),false);
    }
    assert.equal((await get('bad')).status,400);
    assert.equal((await fetch(base+'/portal')).status,404);
    unavailable = true;
    assert.equal((await get('ЛК-1234')).status,503);
  } finally {server.closeAllConnections();upstream.closeAllConnections();server.close();upstream.close();}
});
