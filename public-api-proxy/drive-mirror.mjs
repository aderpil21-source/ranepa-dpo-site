import {createHash} from 'node:crypto';

export function driveId(value) {
  try {
    const u = new URL(value);
    if (!['drive.google.com','drive.usercontent.google.com','lh3.googleusercontent.com'].includes(u.hostname)) return '';
    const id = u.searchParams.get('id') || u.pathname.match(/\/d\/([\w-]+)/)?.[1];
    return /^[\w-]{15,150}$/.test(id || '') ? id : '';
  } catch { return ''; }
}

export function publishedDriveIds(portal, news, settings) {
  const found = new Set();
  function scan(value) {
    if (typeof value === 'string') { for(const url of value.match(/https:\/\/(?:drive\.google\.com|lh3\.googleusercontent\.com|drive\.usercontent\.google\.com)\/[^\s\"'<>]+/g)||[]) {const id=driveId(url);if(id)found.add(id);} }
    else if (Array.isArray(value)) value.forEach(scan);
    else if (value && typeof value === 'object') Object.values(value).forEach(scan);
  }
  scan((portal.owlFiles || []).filter(x=>x?.isPublished===true).map(x=>x.url));
  scan(portal.programs || []);
  scan(news?.items || []);
  scan(settings?.settings || {});
  return found;
}

const active = new Map();
export async function mirrorDrive(id, options={}) {
  if (!/^[\w-]{15,150}$/.test(id)) throw new Error('invalid_file');
  if (active.has(id)) return active.get(id);
  const task = copy(); active.set(id,task);
  try { return await task; } finally { active.delete(id); }
  async function copy() {
    const fetcher=options.fetcher || fetch;
    const bucket=process.env.MATERIAL_BUCKET || 'ranepa-dpo-materials-20261026';
    const key='drive/'+createHash('sha256').update(id).digest('hex');
    const url='https://storage.yandexcloud.net/'+bucket+'/'+key;
    const existing=await fetcher(url,{method:'HEAD',signal:AbortSignal.timeout(5000)});
    if (existing.ok) return url;
    if(existing.status!==404 && existing.status!==403) throw new Error('storage_unavailable');
    const response=await fetcher('https://drive.usercontent.google.com/download?id='+encodeURIComponent(id)+'&export=download&confirm=t',{headers:{'Accept-Encoding':'identity'},signal:AbortSignal.timeout(60000),redirect:'follow'});
    if(!response.ok) throw new Error('drive_unavailable');
    const type=response.headers.get('content-type') || 'application/octet-stream';
    if(/text\/html|javascript|image\/svg|xml/i.test(type)) throw new Error('unsupported_drive_response');
    const max=500*1024*1024;
    if(Number(response.headers.get('content-length')||0)>max) throw new Error('file_too_large');
    let transferred=0;
    const body=response.body.pipeThrough(new TransformStream({transform(chunk,controller){
      transferred+=chunk.byteLength;if(transferred>max)throw new Error('file_too_large');controller.enqueue(chunk);
    }}));
    const tokenResponse=await fetcher('http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(3000)});
    if(!tokenResponse.ok)throw new Error('service_identity_unavailable');
    const token=await tokenResponse.json();
    const headers={'Authorization':'Bearer '+token.access_token,'Content-Type':type,'Cache-Control':'public, max-age=3600'};
    const disposition=response.headers.get('content-disposition');
    if(disposition)headers['Content-Disposition']=disposition;
    if(response.headers.get('content-length'))headers['Content-Length']=response.headers.get('content-length');
    const uploaded=await fetcher(url,{method:'PUT',headers,body,duplex:'half',signal:AbortSignal.timeout(120000)});
    if(!uploaded.ok)throw new Error('mirror_upload_failed');
    return url;
  }
}
