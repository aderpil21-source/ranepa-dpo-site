(function(){
'use strict';
const isEmbeddedPreview=new URLSearchParams(location.search).get('cmsPreview')==='drafts';
if(isEmbeddedPreview){
  const style=document.createElement('style');
  style.id='cmsEmbeddedPreviewStyles';
  style.textContent='#siteAdminPanel,#siteAdminReopen,#siteAdminLoginModal{display:none!important}body.site-admin-text-editing .site-admin-editable{outline:none!important;background:transparent!important}.site-admin-preview-hidden{opacity:1!important;filter:none!important;outline:none!important}.cms-preview-draft{outline:2px dashed #f59e0b!important;outline-offset:4px!important;position:relative!important}.cms-preview-draft::before{content:"ЧЕРНОВИК";position:absolute;z-index:9999;top:8px;right:8px;padding:4px 7px;border-radius:999px;background:#f59e0b;color:#111827;font:800 10px/1.2 Montserrat,sans-serif;letter-spacing:.04em}';
  document.head.appendChild(style);
  document.documentElement.classList.add('cms-embedded-preview');
  return;
}
let modal=null,frame=null,device='desktop',theme='dark';
function ensure(){
  if(modal)return modal;
  const style=document.createElement('style');
  style.id='siteAdminPreviewStyles';
  style.textContent=`
.cms-preview-modal{position:fixed;inset:0;z-index:30250;background:rgba(2,6,15,.9);display:none;flex-direction:column;padding:14px;backdrop-filter:blur(12px)}
.cms-preview-modal.active{display:flex}
.cms-preview-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 12px;border:1px solid rgba(255,255,255,.12);border-radius:14px 14px 0 0;background:#0b1220;color:#fff}
.cms-preview-bar>div{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.cms-preview-bar button{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;border-radius:8px;padding:7px 10px;font-size:.72rem;font-weight:850;cursor:pointer}
.cms-preview-bar button.active{border-color:#38bdf8;background:rgba(56,189,248,.16)}
.cms-preview-stage{flex:1;min-height:0;display:grid;place-items:start center;overflow:auto;background:#111827;border:1px solid rgba(255,255,255,.12);border-top:0;border-radius:0 0 14px 14px;padding:14px}
.cms-preview-frame{height:100%;min-height:700px;border:0;background:white;box-shadow:0 20px 60px rgba(0,0,0,.5);transition:width .2s ease;border-radius:10px}
.cms-preview-frame.desktop{width:min(1440px,100%)}.cms-preview-frame.mobile{width:390px;max-width:100%}
@media(max-width:520px){.cms-preview-modal{padding:0}.cms-preview-bar{border-radius:0}.cms-preview-stage{padding:0;border-radius:0}.cms-preview-frame.mobile,.cms-preview-frame.desktop{width:100%;border-radius:0}}
`;
  document.head.appendChild(style);
  modal=document.createElement('div');modal.id='siteAdminPreviewModal';modal.className='cms-preview-modal';
  modal.innerHTML='<div class="cms-preview-bar"><div><b>👁 Предпросмотр PRO</b><button type="button" data-device="desktop" class="active">Desktop</button><button type="button" data-device="mobile">Mobile 390px</button></div><div><button type="button" data-theme="dark" class="active">Тёмная</button><button type="button" data-theme="light">Светлая</button><button type="button" id="cmsPreviewReload">↻ Обновить</button><button type="button" id="cmsPreviewClose">Закрыть</button></div></div><div class="cms-preview-stage"><iframe class="cms-preview-frame desktop" title="Предпросмотр сайта"></iframe></div>';
  document.body.appendChild(modal);frame=modal.querySelector('iframe');
  modal.querySelectorAll('[data-device]').forEach(b=>b.onclick=()=>{device=b.dataset.device;modal.querySelectorAll('[data-device]').forEach(x=>x.classList.toggle('active',x===b));frame.className='cms-preview-frame '+device;});
  modal.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>{theme=b.dataset.theme;modal.querySelectorAll('[data-theme]').forEach(x=>x.classList.toggle('active',x===b));applyTheme();});
  modal.querySelector('#cmsPreviewReload').onclick=load;
  modal.querySelector('#cmsPreviewClose').onclick=()=>window.closeSiteAdminPreview();
  return modal;
}
function previewUrl(){
  const u=new URL(location.href);
  u.searchParams.set('cmsPreview','drafts');
  u.hash='';
  return u.href;
}
function applyTheme(){
  if(!frame||!frame.contentDocument)return;
  try{
    frame.contentDocument.documentElement.setAttribute('data-theme',theme);
    if(typeof frame.contentWindow.applySiteThemeConfig==='function')frame.contentWindow.applySiteThemeConfig();
  }catch(_){}
}
function load(){
  ensure();
  frame.onload=()=>{applyTheme();};
  frame.src=previewUrl();
}
window.openSiteAdminPreview=function(){
  if(!siteAdminMode)return openSiteAdminLogin();
  ensure();modal.classList.add('active');load();
};
window.closeSiteAdminPreview=function(){
  if(!modal)return;modal.classList.remove('active');frame.src='about:blank';
};
function addButton(){
  const tools=document.querySelector('#siteAdminPanel .site-admin-tools');
  if(!tools||document.getElementById('siteAdminPreviewBtn'))return;
  const b=document.createElement('button');b.type='button';b.id='siteAdminPreviewBtn';b.textContent='👁 Предпросмотр';b.onclick=openSiteAdminPreview;tools.appendChild(b);
}
const old=renderSiteAdminPanel;
renderSiteAdminPanel=function(){old();addButton();};
addButton();
})();