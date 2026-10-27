import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const upstream = process.env.PORTAL_UPSTREAM;
const origins = new Set(['https://ranepa-dpo39.ru','https://www.ranepa-dpo39.ru','https://aderpil21-source.github.io','https://ranepa-dpo-site.vercel.app']);
const clients = new Map();

export function createMaterialServer(source = upstream) {
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (origins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
      res.statusCode = 204; return res.end();
    }
    if (req.method !== 'GET') return send(405,{ok:false,error:'method_not_allowed'});
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') return send(200,{ok:true,service:'ranepa-materials'});
    if (url.pathname !== '/material') return send(404,{ok:false,error:'not_found'});
    const code = String(url.searchParams.get('code') || '').trim().toUpperCase();
    if (!/^ЛК-(?:\d{4}|[A-F0-9]{8})$/.test(code)) return send(400,{ok:false,error:'bad_code'});
    const now = Date.now();
    for (const [key, record] of clients) if (now - record.at > 60000) clients.delete(key);
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim();
    const record = clients.get(ip) || {at:now,count:0};
    record.count++; clients.set(ip,record);
    if (record.count > 40) return send(429,{ok:false,error:'too_many_requests'});
    try {
      if (!source) throw new Error('missing_upstream');
      const response = await fetch(source,{signal:AbortSignal.timeout(18000),redirect:'follow',cache:'no-store'});
      if (!response.ok) throw new Error('upstream_unavailable');
      const data = await response.json();
      if (!Array.isArray(data.owlFiles)) throw new Error('invalid_upstream');
      const item = data.owlFiles.find(x => String(x?.code || '').trim().toUpperCase() === code);
      if (!item || item.isPublished !== true) return send(404,{ok:false,error:'not_found'});
      const safe = (value, max) => String(value || '').slice(0,max);
      const link = safe(item.url,4000);
      return send(200,{ok:true,item:{title:safe(item.title,2000),url:/^https?:\/\//i.test(link)?link:'',googleUrl:safe(item.googleUrl,4000),yandexUrl:safe(item.yandexUrl,4000),comment:safe(item.comment,5000),date:safe(item.date,300),isPublished:true}});
    } catch {
      return send(503,{ok:false,error:'material_unavailable'});
    }
  });
}
if (process.env.NODE_ENV !== 'test' && process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  createMaterialServer().listen(Number(process.env.PORT || 10000),'0.0.0.0',() => console.log('Material lookup service ready'));
}
