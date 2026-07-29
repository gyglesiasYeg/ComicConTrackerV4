// Comic Con Tracker V16.3 - isolated pricing API tester
// Safe debug route. Does NOT modify saved guests. Does NOT run from the main tracker page.

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

function eventYear(convention = {}) {
  const s = String(convention.start || convention.dates || convention.year || '');
  const m = s.match(/20\d{2}/);
  return m ? m[0] : String(new Date().getFullYear());
}

function possibleEventSlugs(convention = {}) {
  const id = convention.id || '';
  const out = [...(EVENT_SLUGS[id] || [])];
  if (convention.name) out.push(slug(convention.name));
  try {
    const u = new URL(convention.website || convention.guestUrl || '');
    const firstPath = u.pathname.split('/').filter(Boolean)[0];
    if (firstPath) out.push(slug(firstPath));
  } catch {}
  return [...new Set(out.filter(Boolean))];
}

function buildCandidateUrls(convention = {}, guestName = '') {
  const urls = new Set();
  const gslug = slug(guestName);
  const year = eventYear(convention);

  if (convention.priceUrl) urls.add(convention.priceUrl);
  if (convention.guestUrl) urls.add(convention.guestUrl);
  if (convention.website) urls.add(convention.website);

  for (const eslug of possibleEventSlugs(convention)) {
    if (eslug && gslug) urls.add(`https://store.epic.leapevent.tech/${eslug}/${year}/${gslug}`);
  }
  return [...urls].slice(0, 8);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {...options, signal: controller.signal});
    const text = await r.text();
    return {ok:r.ok,status:r.status,url,body:text,contentType:r.headers.get('content-type') || ''};
  } catch(e) {
    return {ok:false,status:0,url,body:'',error:e.message || String(e),contentType:''};
  } finally {
    clearTimeout(timer);
  }
}

function clean(s='') {
  return String(s)
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,'\n')
    .replace(/&amp;/g,'&')
    .replace(/&nbsp;/g,' ')
    .replace(/&#x27;|&#39;/g,"'")
    .replace(/&quot;/g,'"')
    .replace(/\s+/g,' ')
    .trim();
}

function moneyCandidates(text) {
  const out=[];
  const rx = /(?:CA\$|CAD\$|US\$|USD\$|\$)\s*([0-9]{1,4})(?:\.([0-9]{2}))?/gi;
  let m;
  while ((m = rx.exec(String(text || ''))) !== null) {
    const value = Number(m[1] + (m[2] ? '.' + m[2] : ''));
    if (Number.isFinite(value) && value >= 5 && value <= 2000) {
      out.push({value, index:m.index, match:m[0]});
    }
  }
  return out;
}

function priceNearLabels(text, labels, avoid = []) {
  const source = clean(text);
  const hits=[];
  for (const label of labels) {
    const rx = new RegExp(label, 'ig');
    let m;
    while ((m = rx.exec(source)) !== null) hits.push(m.index);
  }
  for (const idx of hits.sort((a,b)=>a-b)) {
    let win = source.slice(Math.max(0, idx - 250), Math.min(source.length, idx + 1200));
    if (avoid.some(a => new RegExp(a,'i').test(win))) continue;
    win = win
      .replace(/email me a jpeg copy[\s\S]{0,200}/ig,' ')
      .replace(/additional prints?[\s\S]{0,200}/ig,' ')
      .replace(/frame your photo[\s\S]{0,200}/ig,' ')
      .replace(/authentication sticker[\s\S]{0,200}/ig,' ')
      .replace(/quote[\s\S]{0,160}/ig,' ');
    const prices = moneyCandidates(win);
    if (prices.length) return {price:prices[0].value, evidence:win.slice(0, 700)};
  }
  return {price:0,evidence:''};
}

function extractPricesFromText(text) {
  const photo = priceNearLabels(text, ['\\bphoto\\s*op\\b','\\bphoto\\s*ops\\b','photo opportunity'], ['team\\s*up','group photo','cast photo']);
  const auto = priceNearLabels(text, ['\\b8x10\\s*autograph\\b','\\bautograph\\b','premium autograph','signature'], ['autograph\\s*\\+\\s*selfie','combo','authentication sticker']);
  return {auto:auto.price, photo:photo.price, autoEvidence:auto.evidence, photoEvidence:photo.evidence};
}

function extractInterestingScriptUrls(html, baseUrl) {
  const urls = new Set();
  const srcs = [...String(html || '').matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>m[1]);
  for (let src of srcs) {
    try { if (src.startsWith('/')) src = new URL(src, baseUrl).href; } catch {}
    const s = String(src).toLowerCase();
    if (s.includes('_next') || s.includes('static') || s.includes('assets') || s.includes('main') || s.includes('app')) urls.add(src);
  }
  return [...urls].slice(0, 8);
}

function extractJsonBlobs(html) {
  const blobs=[];
  const next = String(html || '').match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (next?.[1]) blobs.push(next[1]);
  for (const m of String(html || '').matchAll(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    if (m[1]) blobs.push(m[1]);
  }
  return blobs;
}

async function tryUrl(url, guestName) {
  const checked=[];
  const page = await fetchWithTimeout(url, {headers:{'user-agent':'ComicConTracker/16.3 price-debug'}}, 9000);
  checked.push({url, status:page.status, ok:page.ok, contentType:page.contentType, error:page.error || ''});

  let combined = page.body || '';

  // Try embedded JSON first.
  const blobs = extractJsonBlobs(page.body);
  for (const b of blobs) combined += '\n' + b;

  let prices = extractPricesFromText(combined);
  if (prices.auto || prices.photo) return {prices, checked, source:url, method:'page-or-embedded-json'};

  // Try interesting JS chunks. Some React storefronts hide product data in static bundles or JSON hydration.
  for (const jsUrl of extractInterestingScriptUrls(page.body, url).slice(0, 4)) {
    const js = await fetchWithTimeout(jsUrl, {headers:{'user-agent':'ComicConTracker/16.3 price-debug'}}, 7000);
    checked.push({url:jsUrl, status:js.status, ok:js.ok, contentType:js.contentType, error:js.error || ''});
    const body = js.body || '';
    const g = norm(guestName).replace(/ /g,'');
    if (body.toLowerCase().replace(/[^a-z0-9]/g,'').includes(g) || /price|amount|photo|autograph/i.test(body)) {
      prices = extractPricesFromText(body);
      if (prices.auto || prices.photo) return {prices, checked, source:jsUrl, method:'script-chunk'};
    }
  }

  return {prices:{auto:0,photo:0,autoEvidence:'',photoEvidence:''}, checked, source:url, method:'not-found'};
}

export default async function handler(req,res){
  if(req.method !== 'POST') return res.status(405).json({error:'POST only'});
  const {convention = {}, guestName = '', guest = {}} = req.body || {};
  const name = guestName || guest.name || '';
  if(!name) return res.status(400).json({error:'Missing guestName'});

  const urls = buildCandidateUrls(convention, name);
  const checkedAll=[];

  for (const url of urls) {
    const result = await tryUrl(url, name);
    checkedAll.push(...result.checked);
    if (result.prices.auto || result.prices.photo) {
      return res.status(200).json({
        guestName:name,
        auto:result.prices.auto,
        photo:result.prices.photo,
        source:result.source,
        method:result.method,
        checkedUrls:checkedAll,
        autoEvidence:result.prices.autoEvidence,
        photoEvidence:result.prices.photoEvidence
      });
    }
  }

  return res.status(200).json({
    guestName:name,
    auto:0,
    photo:0,
    source:'not-found',
    method:'not-found',
    checkedUrls:checkedAll,
    note:'No readable price values were found in the tested page, embedded JSON, or script chunks.'
  });
}
