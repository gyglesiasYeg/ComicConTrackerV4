// Comic Con Tracker V15.8 - safer universal appearance-day updater
// Updates ONLY guest.days. Does not change refresh, filtering, locked lists, known-for, or photo lookup.

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';

const EXTRA_SOURCES = {
  nycc: [
    'https://www.newyorkcomiccon.com/en-us/guests.html',
    'https://www.newyorkcomiccon.com/en-us/buy/buy-autographs-and-photo-ops.html',
    'https://www.newyorkcomiccon.com/'
  ],
  edmonton: [
    'https://fanexpohq.com/edmontonexpo/all-guests/',
    'https://fanexpohq.com/edmontonexpo/'
  ],
  calgary: [
    'https://fanexpohq.com/calgaryexpo/celebrities/',
    'https://fanexpohq.com/calgaryexpo/'
  ]
};

const DAY_PATTERNS = [
  ['Thursday', /\b(thursday|thu|thur|thurs)\b/i],
  ['Friday', /\b(friday|fri)\b/i],
  ['Saturday', /\b(saturday|sat)\b/i],
  ['Sunday', /\b(sunday|sun)\b/i]
];

const DATE_DAY_MAP = {
  nycc: {
    'oct 8':'Thursday','october 8':'Thursday','10/8':'Thursday','10-8':'Thursday','2026-10-08':'Thursday',
    'oct 9':'Friday','october 9':'Friday','10/9':'Friday','10-9':'Friday','2026-10-09':'Friday',
    'oct 10':'Saturday','october 10':'Saturday','10/10':'Saturday','10-10':'Saturday','2026-10-10':'Saturday',
    'oct 11':'Sunday','october 11':'Sunday','10/11':'Sunday','10-11':'Sunday','2026-10-11':'Sunday'
  },
  edmonton: {
    'sep 18':'Friday','sept 18':'Friday','september 18':'Friday','9/18':'Friday','9-18':'Friday','2026-09-18':'Friday',
    'sep 19':'Saturday','sept 19':'Saturday','september 19':'Saturday','9/19':'Saturday','9-19':'Saturday','2026-09-19':'Saturday',
    'sep 20':'Sunday','sept 20':'Sunday','september 20':'Sunday','9/20':'Sunday','9-20':'Sunday','2026-09-20':'Sunday'
  },
  calgary: {
    'apr 22':'Thursday','april 22':'Thursday','4/22':'Thursday','4-22':'Thursday','2027-04-22':'Thursday',
    'apr 23':'Friday','april 23':'Friday','4/23':'Friday','4-23':'Friday','2027-04-23':'Friday',
    'apr 24':'Saturday','april 24':'Saturday','4/24':'Saturday','4-24':'Saturday','2027-04-24':'Saturday',
    'apr 25':'Sunday','april 25':'Sunday','4/25':'Sunday','4-25':'Sunday','2027-04-25':'Sunday'
  }
};

const norm = s => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/&amp;/g, '&')
  .replace(/\band\b/g, '&')
  .replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/^nicholas cage$/, 'nicolas cage');

const compact = s => norm(s).replace(/ /g, '');
const slug = s => norm(s).replace(/ /g, '-');

function clean(s='') {
  return String(s)
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,'\n')
    .replace(/&amp;/g,'&')
    .replace(/&nbsp;/g,' ')
    .replace(/&#x27;|&#39;/g,"'")
    .replace(/&quot;/g,'"')
    .replace(/\r/g,'\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

async function scrape(url) {
  if (!url) return {raw:'',method:'none'};

  if (FIRECRAWL_API_KEY) {
    try {
      const r = await fetch('https://api.firecrawl.dev/v2/scrape', {
        method:'POST',
        headers:{'content-type':'application/json',authorization:`Bearer ${FIRECRAWL_API_KEY}`},
        body:JSON.stringify({
          url,
          formats:['markdown','html','links'],
          onlyMainContent:false,
          waitFor:3500,
          timeout:60000,
          removeBase64Images:true
        })
      });
      const j = await r.json().catch(()=>({}));
      if (r.ok && j.success) {
        return {
          raw:[j.data?.markdown,j.data?.html,Array.isArray(j.data?.links)?j.data.links.join('\n'):''].filter(Boolean).join('\n'),
          method:'firecrawl'
        };
      }
    } catch {}
  }

  try {
    const r = await fetch(url,{headers:{'user-agent':'ComicConTracker/15.8 days-updater'}});
    if(!r.ok) throw new Error(String(r.status));
    return {raw:await r.text(),method:'direct'};
  } catch(e) {
    return {raw:'',method:'failed',error:e.message};
  }
}

function order(days){
  const o={Thursday:1,Friday:2,Saturday:3,Sunday:4};
  return [...new Set(days)].filter(Boolean).sort((a,b)=>(o[a]||99)-(o[b]||99));
}

function nameVariants(name){
  const n=String(name||'').trim();
  return [...new Set([
    n,
    n.replace(/\./g,''),
    n.replace(/[’']/g,"'"),
    norm(n),
    compact(n),
    slug(n)
  ].filter(Boolean).map(x=>String(x).toLowerCase()))];
}

function daysFromText(raw, conventionId) {
  const found=[];
  const snip = clean(raw);
  const sl = snip.toLowerCase();

  for (const [day, rx] of DAY_PATTERNS) {
    if (rx.test(snip)) found.push(day);
  }

  const map = DATE_DAY_MAP[conventionId] || {};
  for (const [needle, day] of Object.entries(map)) {
    if (sl.includes(needle)) found.push(day);
  }

  return order(found);
}

function sx(s){
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractStructuredBlocks(raw, name) {
  const blocks=[];
  const variants = nameVariants(name).filter(v => v.length >= 3).map(sx);
  if (!variants.length) return blocks;
  const nameRx = new RegExp(`(${variants.join('|')})`, 'i');

  const source = String(raw || '');

  // Handles common embedded JSON / Next.js / CMS chunks where guest fields and appearances sit in the same object.
  const jsonish = source.match(/\{[^{}]{0,5000}\}/g) || [];
  for (const obj of jsonish) {
    if (nameRx.test(obj) && /(appearing|appearance|day|date|schedule|photo op|autograph|session|availability)/i.test(obj)) {
      blocks.push(obj);
    }
  }

  // Handles text/markdown/card-like blocks split by headings, cards, or repeated blank lines.
  const text = clean(source);
  const roughBlocks = text.split(/\n\s*\n|(?=\n#{1,6}\s+)|(?=\n[A-Z][^\n]{2,80}\n)/g);
  for (const b of roughBlocks) {
    if (nameRx.test(b)) blocks.push(b);
  }

  return blocks;
}

function extractAroundName(raw, name, conventionId) {
  const text = clean(raw);
  const lower = text.toLowerCase();
  const variants = nameVariants(name);
  const snippets = [];

  for (const v of variants) {
    if (v.length < 3) continue;
    let i = lower.indexOf(v);
    while (i >= 0) {
      snippets.push(text.slice(Math.max(0, i - 900), Math.min(text.length, i + 1400)));
      i = lower.indexOf(v, i + Math.max(4, v.length));
    }
  }

  // Prefer structured/card blocks first. This avoids picking up general convention dates from the full page.
  for (const b of extractStructuredBlocks(raw, name)) snippets.unshift(b);

  for (const snip of snippets) {
    const near = /(appearing|appearance|day|date|schedule|photo op|autograph|session|availability|sat|sun|fri|thu|thurs|thursday|friday|saturday|sunday|oct|sep|sept|april|apr|2026|2027)/i.test(snip);
    if (!near) continue;
    const found = daysFromText(snip, conventionId);
    if (found.length) return found;
  }

  return [];
}

function extractLikelyLinks(raw, baseUrl, name) {
  const out = new Set();
  const nslug = slug(name);
  const nplain = compact(name);
  const pieces = String(raw||'').match(/https?:\/\/[^\s"'<>]+/gi) || [];
  const hrefs = [...String(raw||'').matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1]);

  for (let u of [...pieces, ...hrefs]) {
    try { if (u.startsWith('/')) u = new URL(u, baseUrl).href; } catch {}
    const lu = String(u).toLowerCase();
    const luNorm = lu.replace(/[^a-z0-9]/g,'');
    if (
      (lu.includes(nslug) || luNorm.includes(nplain)) &&
      !lu.includes('google') &&
      !lu.includes('facebook') &&
      !lu.includes('twitter') &&
      !lu.includes('instagram')
    ) out.add(u.split('#')[0]);
  }
  return [...out].slice(0, 10);
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});

  const {convention,guest}=req.body||{};
  const cid=convention?.id||'';
  const name=guest?.name||'';
  if(!cid||!name)return res.status(400).json({error:'Missing convention or guest'});

  const sources=[guest?.sourceUrl, convention?.guestUrl, convention?.website, ...(EXTRA_SOURCES[cid]||[])].filter(Boolean);
  const unique=[...new Set(sources)];
  const methods=[];

  for(const url of unique.slice(0,7)){
    const pg=await scrape(url);
    methods.push(`${pg.method}:${url}`);

    let days=extractAroundName(pg.raw,name,cid);
    if(days.length)return res.status(200).json({days,source:url,methods});

    const links=extractLikelyLinks(pg.raw,url,name);
    for(const link of links){
      const detail=await scrape(link);
      methods.push(`${detail.method}:${link}`);
      days=extractAroundName(detail.raw,name,cid);
      if(days.length)return res.status(200).json({days,source:link,methods});
    }
  }

  return res.status(200).json({days:['TBD'],source:'not-found',methods});
}
