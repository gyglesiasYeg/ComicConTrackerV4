// Comic Con Tracker V16.0 - universal autograph/photo-op price updater
// Updates only guest.auto and guest.photo. It does not change guests, photos, days, filtering, locked lists, or Known For.

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';

const EVENT_SLUGS = {
  edmonton: ['edmonton-expo'],
  calgary: ['calgary-expo'],
  nycc: ['new-york-comic-con','nycc']
};

const norm = s => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/&amp;/g, '&')
  .replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/^nicholas cage$/, 'nicolas cage');

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
  if (!url) return { raw:'', method:'none' };

  if (FIRECRAWL_API_KEY) {
    try {
      const r = await fetch('https://api.firecrawl.dev/v2/scrape', {
        method:'POST',
        headers:{ 'content-type':'application/json', authorization:`Bearer ${FIRECRAWL_API_KEY}` },
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
    const r = await fetch(url,{headers:{'user-agent':'ComicConTracker/16.0 price-updater'}});
    if(!r.ok) throw new Error(String(r.status));
    return { raw: await r.text(), method:'direct' };
  } catch(e) {
    return { raw:'', method:'failed', error:e.message };
  }
}

function moneyCandidates(text) {
  const out=[];
  const rx = /(?:CA\$|CAD\$|US\$|USD\$|\$)\s*([0-9]{1,4})(?:\.([0-9]{2}))?/gi;
  let m;
  while ((m = rx.exec(String(text||''))) !== null) {
    const n = Number(m[1] + (m[2] ? '.' + m[2] : ''));
    if (Number.isFinite(n) && n >= 5 && n <= 1000) out.push(n);
  }
  return out;
}

function pickPriceNear(text, labelRegexes, rejectRegexes=[]) {
  const source = clean(text);
  const lower = source.toLowerCase();
  const hits=[];

  for (const rx of labelRegexes) {
    let m;
    const flags = rx.flags.includes('g') ? rx.flags : rx.flags + 'g';
    const grx = new RegExp(rx.source, flags);
    while ((m = grx.exec(source)) !== null) hits.push(m.index);
  }

  for (const idx of hits.sort((a,b)=>a-b)) {
    const win = source.slice(Math.max(0, idx - 250), Math.min(source.length, idx + 900));
    if (rejectRegexes.some(r => r.test(win))) continue;

    // Avoid selecting extras like JPEG copy, extra prints, frame, authentication sticker, quote, etc.
    const cleanedWindow = win
      .replace(/email me a jpeg copy[\s\S]{0,160}/ig,' ')
      .replace(/additional prints?[\s\S]{0,160}/ig,' ')
      .replace(/frame your photo[\s\S]{0,160}/ig,' ')
      .replace(/authentication sticker[\s\S]{0,160}/ig,' ')
      .replace(/quote[\s\S]{0,120}/ig,' ');

    const prices = moneyCandidates(cleanedWindow);
    if (prices.length) return prices[0];
  }

  // fallback for pages where labels and prices are separated but still on the guest page
  const whole = lower;
  const hasAnyLabel = labelRegexes.some(rx => new RegExp(rx.source, rx.flags.replace('g','')).test(whole));
  if (hasAnyLabel) {
    const prices = moneyCandidates(source);
    if (prices.length) return prices[0];
  }

  return 0;
}

function extractPrices(raw) {
  const text = clean(raw);

  const photo = pickPriceNear(text, [
    /\bphoto\s*op\b/i,
    /\bphoto\s*ops\b/i,
    /\bphoto\s*opportunity\b/i
  ], [
    /team\s*up/i,
    /group\s*photo/i,
    /cast\s*photo/i
  ]);

  const auto = pickPriceNear(text, [
    /\bautograph\b/i,
    /\b8x10\s*autograph\b/i,
    /\bpremium\s*autograph\b/i,
    /\bsignature\b/i
  ], [
    /autograph\s*\+\s*selfie/i,
    /combo/i,
    /authentication\s*sticker/i
  ]);

  return { auto, photo };
}

function eventYear(convention) {
  const s = String(convention?.start || convention?.dates || '');
  const m = s.match(/20\d{2}/);
  return m ? m[0] : String(new Date().getFullYear());
}

function possibleEventSlugs(convention) {
  const id = convention?.id || '';
  const fromMap = EVENT_SLUGS[id] || [];
  const fromName = slug(convention?.name || '').replace(/comic-con/g,'comic-con').replace(/comics-entertainment/g,'');
  const fromUrl = (() => {
    try {
      const u = new URL(convention?.website || convention?.guestUrl || '');
      const host = u.hostname.replace(/^www\./,'').split('.')[0];
      const firstPath = u.pathname.split('/').filter(Boolean)[0] || '';
      return [slug(firstPath), slug(host)].filter(Boolean);
    } catch { return []; }
  })();
  return [...new Set([...fromMap, fromName, ...fromUrl].filter(Boolean))];
}

function likelyUrls(convention, guest) {
  const urls = new Set();
  const gslug = slug(guest?.name || '');
  const year = eventYear(convention);

  if (guest?.priceUrl) urls.add(guest.priceUrl);
  if (guest?.sourceUrl) urls.add(guest.sourceUrl);
  if (convention?.guestUrl) urls.add(convention.guestUrl);
  if (convention?.website) urls.add(convention.website);

  for (const eslug of possibleEventSlugs(convention)) {
    if (!eslug || !gslug) continue;
    urls.add(`https://store.epic.leapevent.tech/${eslug}/${year}/${gslug}`);
  }

  return [...urls];
}

function extractLinks(raw, baseUrl, guest) {
  const out = new Set();
  const gs = slug(guest?.name || '');
  const gc = norm(guest?.name || '').replace(/ /g,'');
  const hrefs = [
    ...(String(raw||'').match(/https?:\/\/[^\s"'<>]+/gi) || []),
    ...[...String(raw||'').matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1])
  ];

  for (let u of hrefs) {
    try { if (u.startsWith('/')) u = new URL(u, baseUrl).href; } catch {}
    const lu = String(u).toLowerCase();
    const flat = lu.replace(/[^a-z0-9]/g,'');
    if (
      (lu.includes(gs) || flat.includes(gc)) &&
      (lu.includes('epic') || lu.includes('leapevent') || lu.includes('photo') || lu.includes('autograph')) &&
      !lu.includes('facebook') && !lu.includes('instagram') && !lu.includes('google')
    ) out.add(u.split('#')[0]);
  }
  return [...out].slice(0, 10);
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});

  const {convention, guest}=req.body||{};
  if(!convention || !guest?.name)return res.status(400).json({error:'Missing convention or guest'});

  const methods=[];
  const checked = new Set();
  let best={auto:0,photo:0,source:'not-found'};

  for (const url of likelyUrls(convention, guest).slice(0, 12)) {
    if (!url || checked.has(url)) continue;
    checked.add(url);

    const pg = await scrape(url);
    methods.push(`${pg.method}:${url}`);
    const p = extractPrices(pg.raw);
    if (p.auto || p.photo) return res.status(200).json({...p,source:url,methods});

    for (const link of extractLinks(pg.raw, url, guest)) {
      if (checked.has(link)) continue;
      checked.add(link);
      const detail = await scrape(link);
      methods.push(`${detail.method}:${link}`);
      const dp = extractPrices(detail.raw);
      if (dp.auto || dp.photo) return res.status(200).json({...dp,source:link,methods});
    }
  }

  return res.status(200).json({...best,methods});
}
