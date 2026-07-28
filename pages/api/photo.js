// Comic Con Tracker V9.3 - Stable Known Person Photo API
const KNOWN={
 'christopher judge':'https://imagedelivery.net/VTBDqFF18S3r8M9B-TFWuA/c6be3e1c-a4ad-4d3f-ecdf-6557a359ac00/public',
 'karl urban':'https://knect365.imgix.net/uploads/KARL-URBAN-BOYS-400x400-5c27173a10f70749384ecabf2b9e7b40.png?auto=format&fit=max&w=462&h=462&dpr=1',
 'ron perlman':'https://imagedelivery.net/VTBDqFF18S3r8M9B-TFWuA/e04eda41-97d8-496d-0f19-e1dc1d0afa00/public',
 'nicolas cage':'https://commons.wikimedia.org/wiki/Special:FilePath/Nicolas%20Cage%20Deauville%202013%202.jpg?width=500',
 'nicholas cage':'https://commons.wikimedia.org/wiki/Special:FilePath/Nicolas%20Cage%20Deauville%202013%202.jpg?width=500',
 'john cena':'https://commons.wikimedia.org/wiki/Special:FilePath/John%20Cena%20by%20Gage%20Skidmore.jpg?width=500',
 'dean norris':'https://commons.wikimedia.org/wiki/Special:FilePath/Dean%20Norris%20by%20Gage%20Skidmore%202.jpg?width=500'
};
function norm(s=''){let n=String(s).toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();if(n==='nicholas cage')n='nicolas cage';return n}
function raw(s=''){return String(s).toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}
function bad(url=''){const u=String(url||'').toLowerCase();return !u||['logo','favicon','icon','badge','banner','header','wordmark','sprite','placeholder','poster','cover','character','share-image','og-image','default','no-image'].some(x=>u.includes(x))}
async function json(url){const r=await fetch(url,{headers:{'user-agent':'ComicConTracker/9.3','accept':'application/json'}});if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}
const commons=f=>f?`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f)}?width=500`:'';
function human(e){return(e?.claims?.P31||[]).some(c=>c.mainsnak?.datavalue?.value?.id==='Q5')}
function p18(e){return e?.claims?.P18?.[0]?.mainsnak?.datavalue?.value||''}
function match(label,name){const a=norm(label),b=norm(name);if(a===b||a.includes(b)||b.includes(a))return true;return raw(label).replace(/nicholas/g,'nicolas')===raw(name).replace(/nicholas/g,'nicolas')}
async function wd(name){const q=norm(name)==='nicolas cage'?'Nicolas Cage':name;const s=await json(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=en&format=json&limit=8&origin=*`);const ids=(s.search||[]).map(x=>x.id).filter(Boolean);if(!ids.length)return null;const d=await json(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&languages=en&props=claims|labels|descriptions&format=json&origin=*`);for(const id of ids){const e=d.entities?.[id];if(!e||!human(e))continue;const label=e.labels?.en?.value||'';if(!match(label,name))continue;const file=p18(e);const url=commons(file);if(url&&!bad(url))return{photoUrl:url,source:'wikidata:'+id,confidence:'high',label,description:e.descriptions?.en?.value||''}}return null}
export default async function handler(req,res){if(req.method!=='POST')return res.status(405).json({error:'POST only'});const{guest,cache}=req.body||{};const name=guest?.name||'';if(!name)return res.status(400).json({error:'Missing guest name'});const k=norm(name);const cached=cache?.[k]||cache?.[raw(name)]||'';if(cached&&!bad(cached))return res.status(200).json({photoUrl:cached,source:'cache',confidence:'cached'});const known=KNOWN[k]||KNOWN[raw(name)]||'';if(known&&!bad(known))return res.status(200).json({photoUrl:known,source:'known-photo-library',confidence:'high'});try{const found=await wd(name);if(found?.photoUrl)return res.status(200).json(found);return res.status(200).json({photoUrl:'',source:'wikidata',confidence:'not-found'})}catch(e){return res.status(200).json({photoUrl:'',source:'wikidata-error',confidence:'error',error:e.message})}}
