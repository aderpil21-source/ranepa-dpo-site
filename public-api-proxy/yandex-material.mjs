import {createMaterialServer} from './material-server.mjs';

// Use the same protected lookup and validation on every hosting provider.
const source = process.env.PORTAL_UPSTREAM;
const server = createMaterialServer(source);
export function handler(event) {
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k,v]) => [k.toLowerCase(),v]));
  // Trust the platform identity, never a caller-supplied forwarding header.
  headers['x-forwarded-for'] = event.requestContext?.identity?.sourceIp || 'unknown';
  const query = new URLSearchParams(event.queryStringParameters || {});
  const path = query.get('health') === '1' ? '/health' : '/material';
  return new Promise(resolve => {
    const responseHeaders = {};
    const res = {
      statusCode:200,
      setHeader(name,value) {responseHeaders[name] = value;},
      end(body = '') {resolve({statusCode:this.statusCode,headers:responseHeaders,body,isBase64Encoded:false});}
    };
    server.emit('request', {
      method:event.httpMethod || 'GET', url:path + '?' + query,
      headers, socket:{remoteAddress:headers['x-forwarded-for']}
    }, res);
  });
}
