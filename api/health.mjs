export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json');
  try {
    if (new URL(req.url,'https://localhost').searchParams.has('upstream')){
      const source = process.env.PORTAL_UPSTREAM || 'https://script.google.com/macros/s/AKfycbxCqcmGgAhHU3dG7ClzCjJZpELqpF-ic9H_Qg49BysA30Ybl4khxnwPOS7Pj9gE3g9I/exec';
      const response = await fetch(source,{signal:AbortSignal.timeout(15000),cache:'no-store'});
      if (!response.ok || !Array.isArray((await response.json()).owlFiles)) throw new Error('source_unavailable');
    }
    res.end(JSON.stringify({ok:true,service:'ranepa-serverless-api'}));
  } catch {
    res.statusCode = 503;
    res.end(JSON.stringify({ok:false,error:'source_unavailable'}));
  }
}
