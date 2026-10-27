import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {driveId, publishedDriveIds, mirrorDrive, probeDownload} from './drive-mirror.mjs';
import {createMaterialServer} from './material-server.mjs';

// Use the same protected lookup and validation on every hosting provider.
const source = process.env.PORTAL_UPSTREAM;
const server = createMaterialServer(source);
let mirrors = {};
try { mirrors = JSON.parse(readFileSync(new URL('./material-mirrors.json', import.meta.url), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
export function mirrorMaterialBody(body, mapping = mirrors) {
  const data = JSON.parse(body);
  if (data.ok === true && data.item?.isPublished === true && data.item.url) {
    const google=data.item.googleUrl || (driveId(data.item.url)?data.item.url:'');
    const key = createHash('sha256').update(google || data.item.url).digest('hex');
    const replacement = data.item.yandexUrl || mapping[key];
    if (typeof replacement === 'string' && replacement.startsWith('https://storage.yandexcloud.net/')) data.item.yandexUrl = replacement;
    if(google){data.item.googleUrl=google;data.item.url=google;}

  }
  return JSON.stringify(data);
}
export async function handler(event) {
  const download=event.queryStringParameters?.download;
  if(download){
    const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Type':'application/json; charset=utf-8'};
    const origin=event.headers?.origin || event.headers?.Origin;
    if(['https://ranepa-dpo39.ru','https://www.ranepa-dpo39.ru','https://ranepa-dpo-site.vercel.app'].includes(origin))headers['Access-Control-Allow-Origin']=origin;
    if(!/^[\w-]{15,150}$/.test(download))return {statusCode:400,headers,body:JSON.stringify({ok:false,error:'invalid_file'})};
    const selected=await probeDownload(download,event.queryStringParameters?.yandex);
    if(event.queryStringParameters?.format==='json')return {statusCode:200,headers,body:JSON.stringify({ok:true,...selected})};
    return {statusCode:302,headers:{...headers,Location:selected.url},body:''};
  }
  const asset = event.queryStringParameters?.asset;
  if (asset) {
    const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
    const origin = event.headers?.origin || event.headers?.Origin;
    if (['https://ranepa-dpo39.ru','https://www.ranepa-dpo39.ru','https://ranepa-dpo-site.vercel.app'].includes(origin)) headers['Access-Control-Allow-Origin']=origin;
    const result=(statusCode,body)=>({statusCode,headers,body:JSON.stringify(body)});
    if ((event.httpMethod || 'GET') !== 'GET') return result(405,{ok:false,error:'method_not_allowed'});
    if (!/^[\w-]{15,150}$/.test(asset)) return result(400,{ok:false,error:'invalid_file'});
    try {
      const raw=new URL(source); raw.searchParams.set('mirrorSource','1');
      const get=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(18000)});if(!r.ok)throw Error();return r.json();};
      const portal=await get(raw.href);
      if(!publishedDriveIds(portal).has(asset)) {
        const extra=await Promise.allSettled([raw.href+'&type=news',raw.href+'&type=siteSettings'].map(get));
        const news=extra[0].status==='fulfilled'?extra[0].value:null;
        const settings=extra[1].status==='fulfilled'?extra[1].value:null;
        if(!publishedDriveIds(portal,news,settings).has(asset))return result(extra.some(x=>x.status==='rejected')?503:404,{ok:false,error:'not_found'});
      }
      return result(200,{ok:true,url:await mirrorDrive(asset)});
    } catch { return result(503,{ok:false,error:'mirror_unavailable'}); }
  }
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
      async end(body = '') {
        if (this.statusCode === 200 && body) {
          body = mirrorMaterialBody(body);

        }
        resolve({statusCode:this.statusCode,headers:responseHeaders,body,isBase64Encoded:false});
      }
    };
    server.emit('request', {
      method:event.httpMethod || 'GET', url:path + '?' + query,
      headers, socket:{remoteAddress:headers['x-forwarded-for']}
    }, res);
  });
}
