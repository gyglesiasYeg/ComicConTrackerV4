// Comic Con Tracker V16.4 - generic accessibility information lookup
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';
const EXTRA_SOURCES = {};
const TOPICS = [
  ['Wheelchair / mobility access', /wheelchair|mobility|accessible route|accessibility|ada|barrier free/i],
  ['Accessible entrances', /accessible entrance|entrance|entry|elevator|ramp/i],
  ['Accessible washrooms', /accessible washroom|accessible restroom|restroom|washroom|bathroom/i],
  ['Accessible seating', /accessible seating|reserved seating|ada seating/i],
  ['Companion / caregiver policy', /companion|caregiver|support person|personal attendant|aide/i],
  ['Service animals', /service animal|service dog|guide dog/i],
  ['Sensory / quiet room', /sensory|quiet room|calm room|low sensory/i],
  ['ASL / interpretation', /asl|american sign language|interpreter|interpretation/i],
  ['Captioning', /caption|closed caption|live caption/i],
  ['Accessible parking', /accessible parking|ada parking|parking/i],
  ['Medical assistance', /medical|first aid|medic|health/i],
  ['Scooter / wheelchair rentals', /scooter|wheelchair rental|mobility rental/i],
  ['Accessibility contact', /accessibility@|ada@|contact.*accessibility|accessibility.*contact|phone/i],
  ['Venue accessibility', /venue accessibility|facility accessibility|building accessibility/i],
  ['Public transit accessibility', /transit|subway|bus|train|lrt|public transportation/i]
];
function clean(s=''){return String(s).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,'\n').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\r/g,'\n').replace(/\n{3,}/g,'\n\n').trim()}
async function scrape(url){if(!url)return{raw:'',method:'none'};if(FIRECRAWL_API_KEY){try{const r=await fetch('https://api.firecrawl.dev/v2/scrape',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${FIRECRAWL_API_KEY}`},body:JSON.stringify({url,formats:['markdown','html','links'],onlyMainContent:false,waitFor:3500,timeout:60000,removeBase64Images:true})});const j=await r.json().catch(()=>({}));if(r.ok&&j.success)return{raw:[j.data?.markdown,j.data?.html,Array.isArray(j.data?.links)?j.data.links.join('\n'):''].filter(Boolean).join('\n'),method:'firecrawl'}}catch{}}try{const r=await fetch(url,{headers:{'user-agent':'ComicConTracker/16.4 accessibility'}});if(!r.ok)throw new Error(String(r.status));return{raw:await r.text(),method:'direct'}}catch(e){return{raw:'',method:'failed',error:e.message}}}
function links(raw,base){const out=new Set();const hrefs=[...String(raw||'').matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1]);for(let u of hrefs){try{if(u.startsWith('/'))u=new URL(u,base).href}catch{}const l=String(u).toLowerCase();if(/accessib|ada|faq|help|attend|visit|venue|guide|plan|info/.test(l)&&!/facebook|instagram|google|mailto:/.test(l))out.add(u.split('#')[0])}return[...out].slice(0,8)}
fconst BAD_TEXT =
/mobile app|floor plan|show guides|volunteer|professional creators|creator application|cosplay activations|anime activations|artist alley|newsletter|buy tickets|ticket information|photo gallery|official merch|main events|exhibitor|sponsor/i;

const REAL_ACCESS =
/wheelchair|mobility|accessible entrance|accessible restroom|accessible washroom|accessible seating|service animal|service dog|support person|caregiver|companion|sensory|quiet room|asl|american sign language|interpreter|caption|accessible parking|first aid|medical|scooter|accommodation/i;

function isBadSnippet(text){
  if(!text) return true;

  if(text.length < 50) return true;

  if(BAD_TEXT.test(text)) return true;

  const links =
    (text.match(/https?:\/\//g)||[]).length +
    (text.match(/\]\(/g)||[]).length;

  if(links > 1) return true;

  if(!REAL_ACCESS.test(text)) return true;

  return false;
}

function snippet(text,rx){
  const t = clean(text);

  const parts = t
    .split(/\n+/)
    .map(x => x.trim())
    .filter(Boolean);

  for(const part of parts){
    if(!rx.test(part)) continue;

    if(isBadSnippet(part)) continue;

    return part.slice(0,700);
  }

  const m = rx.exec(t);

  if(!m) return '';

  const raw = t
    .slice(
      Math.max(0,m.index-200),
      Math.min(t.length,m.index+600)
    )
    .replace(/\s+/g,' ')
    .trim();

  if(isBadSnippet(raw)) return '';

  return raw.slice(0,700);
}
export default async function handler(req,res){if(req.method!=='POST')return res.status(405).json({error:'POST only'});const{convention}=req.body||{};if(!convention)return res.status(400).json({error:'Missing convention'});const base=[convention.accessibilityUrl,convention.website,convention.guestUrl,...(EXTRA_SOURCES[convention.id]||[])].filter(Boolean);const queue=[...new Set(base)],checked=[];let bestSource='',bestMethod='none';const found=new Map(
  TOPICS.map(([name])=>[
    name,
    'Not found on official convention website'
  ])
);for(const url of queue.slice(0,12)){const pg=await scrape(url);checked.push(`${pg.method}:${url}`);if(pg.raw&&!bestSource){bestSource=url;bestMethod=pg.method}for(const[name,rx]of TOPICS)if(found.get(name)==='Not found'){const sn=snippet(pg.raw,rx);if(sn)found.set(name,sn)}if(queue.length<16)for(const l of links(pg.raw,url))if(!queue.includes(l))queue.push(l)}const items=[...found.entries()].map(([name,value])=>({name,value}));const hitCount=items.filter(
  x=>x.value!=='Not found on official convention website'
).length;return res.status(200).json({status:hitCount?`Found ${hitCount} accessibility-related item(s)`:'No accessibility information found',lastChecked:new Date().toISOString(),source:bestSource,method:bestMethod,items,notes:hitCount?'Review source text for official details before relying on it for accommodations.':'No matching text was found in the checked sources.',checked})}
