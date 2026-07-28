// V13 known-person photo lookup. No convention-page image scraping.
const KNOWN={
 'christopher judge':'https://imagedelivery.net/VTBDqFF18S3r8M9B-TFWuA/c6be3e1c-a4ad-4d3f-ecdf-6557a359ac00/public',
 'karl urban':'https://knect365.imgix.net/uploads/KARL-URBAN-BOYS-400x400-5c27173a10f70749384ecabf2b9e7b40.png?auto=format&fit=max&w=462&h=462&dpr=1',
 'ron perlman':'https://imagedelivery.net/VTBDqFF18S3r8M9B-TFWuA/e04eda41-97d8-496d-0f19-e1dc1d0afa00/public',
 'nicolas cage':'https://commons.wikimedia.org/wiki/Special:FilePath/Nicolas%20Cage%20Deauville%202013%202.jpg?width=500',
 'nicholas cage':'https://commons.wikimedia.org/wiki/Special:FilePath/Nicolas%20Cage%20Deauville%202013%202.jpg?width=500',
 'john cena':'https://commons.wikimedia.org/wiki/Special:FilePath/John%20Cena%20by%20Gage%20Skidmore.jpg?width=500',
 'dean norris':'https://commons.wikimedia.org/wiki/Special:FilePath/Dean%20Norris%20by%20Gage%20Skidmore%202.jpg?width=500',
 'hayden christensen':'https://commons.wikimedia.org/wiki/Special:FilePath/Hayden%20Christensen%20by%20Gage%20Skidmore.jpg?width=500',
 'ian mcdiarmid':'https://commons.wikimedia.org/wiki/Special:FilePath/Ian%20McDiarmid%20by%20Gage%20Skidmore.jpg?width=500',
 'lena headey':'https://commons.wikimedia.org/wiki/Special:FilePath/Lena%20Headey%20by%20Gage%20Skidmore%203.jpg?width=500',
 'matthew lillard':'https://commons.wikimedia.org/wiki/Special:FilePath/Matthew%20Lillard%20by%20Gage%20Skidmore.jpg?width=500',
 'tom welling':'https://commons.wikimedia.org/wiki/Special:FilePath/Tom%20Welling%20by%20Gage%20Skidmore.jpg?width=500',
 'wayne knight':'https://commons.wikimedia.org/wiki/Special:FilePath/Wayne%20Knight%20by%20Gage%20Skidmore.jpg?width=500'
};
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim().replace(/^nicholas cage$/,'nicolas cage');
function bad(u=''){u=String(u).toLowerCase();return !u||['logo','favicon','icon','badge','banner','header','wordmark','poster','cover','character','placeholder','share-image','og-image'].some(x=>u.includes(x))}
function proxied(u){return `/api/img?u=${encodeURIComponent(u)}`}
async function j(url){const r=await fetch(url,{headers:{'user-agent':'ComicConTracker/13.0','accept':'application/json'}});if(!r.ok)throw new Error(String(r.status));return r.json()}
const commons=f=>f?`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f)}?width=500`:'';
function human(e){return(e?.claims?.P31||[]).some(c=>c.mainsnak?.datavalue?.value?.id==='Q5')}
function p18(e){return e?.claims?.P18?.[0]?.mainsnak?.datavalue?.value||''}
async function wd(name){const searchName=norm(name)==='nicolas cage'?'Nicolas Cage':name;const search=await j(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(searchName)}&language=en&format=json&limit=8&origin=*`);const ids=(search.search||[]).map(x=>x.id).filter(Boolean);if(!ids.length)return null;const data=await j(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&languages=en&props=claims|labels&format=json&origin=*`);const key=norm(name);for(const id of ids){const e=data.entities?.[id];if(!e||!human(e))continue;const label=e.labels?.en?.value||'';const lk=norm(label);if(!(lk===key||lk.includes(key)||key.includes(lk)))continue;const url=commons(p18(e));if(url&&!bad(url))return{photoUrl:proxied(url),rawPhotoUrl:url,source:'wikidata:'+id,confidence:'high'}}return null}
export default async function handler(req,res){if(req.method!=='POST')return res.status(405).json({error:'POST only'});const {guest,cache}=req.body||{};const name=guest?.name||'';if(!name)return res.status(400).json({error:'Missing guest name'});const key=norm(name);const c=cache?.[key]||'';if(c&&!bad(c))return res.status(200).json({photoUrl:c,source:'cache'});const known=KNOWN[key]||'';if(known&&!bad(known))return res.status(200).json({photoUrl:proxied(known),rawPhotoUrl:known,source:'known',confidence:'high'});try{const x=await wd(name);if(x?.photoUrl)return res.status(200).json(x);return res.status(200).json({photoUrl:'',source:'not-found'})}catch(e){return res.status(200).json({photoUrl:'',source:'error',error:e.message})}}
