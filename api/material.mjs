import {createMaterialServer} from '../public-api-proxy/material-server.mjs';

// The Apps Script origin is already used by the site's CMS; no secret is embedded here.
const source = process.env.PORTAL_UPSTREAM || 'https://script.google.com/macros/s/AKfycbxCqcmGgAhHU3dG7ClzCjJZpELqpF-ic9H_Qg49BysA30Ybl4khxnwPOS7Pj9gE3g9I/exec';
const server = createMaterialServer(source);
export default function handler(req,res){
  req.url = '/material' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
  server.emit('request',req,res);
}
