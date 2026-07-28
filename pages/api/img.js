export default async function handler(req,res){
 const url=req.query.u;if(!url||typeof url!=='string')return res.status(400).send('Missing image URL');
 let u;try{u=new URL(url)}catch{return res.status(400).send('Bad image URL')}
 const ok=['commons.wikimedia.org','upload.wikimedia.org','knect365.imgix.net','imagedelivery.net'];
 if(!ok.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))return res.status(403).send('Image host not allowed');
 try{const r=await fetch(url,{headers:{'user-agent':'ComicConTracker/15 image proxy'}});if(!r.ok)return res.status(r.status).send('Image fetch failed');const b=Buffer.from(await r.arrayBuffer());res.setHeader('Content-Type',r.headers.get('content-type')||'image/jpeg');res.setHeader('Cache-Control','public, max-age=604800, immutable');return res.status(200).send(b)}catch(e){return res.status(500).send('Image proxy error')}
}
