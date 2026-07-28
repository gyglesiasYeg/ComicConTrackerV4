const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';

const knownPhotos = {
  'christopher judge': 'https://imagedelivery.net/VTBDqFF18S3r8M9B-TFWuA/c6be3e1c-a4ad-4d3f-ecdf-6557a359ac00/public',
  'karl urban': 'https://knect365.imgix.net/uploads/KARL-URBAN-BOYS-400x400-5c27173a10f70749384ecabf2b9e7b40.png?auto=format&fit=max&w=462&h=462&dpr=1',
  'ron perlman': 'https://imagedelivery.net/VTBDqFF18S3r8M9B-TFWuA/e04eda41-97d8-496d-0f19-e1dc1d0afa00/public'
};
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function badImageUrl(url = '') {
  const u = String(url).toLowerCase();
  if (!u) return true;
  return ['logo','favicon','icon','badge','banner','header','wordmark','sprite','avatar-default','placeholder','share-image','og-image'].some(x => u.includes(x));
}
function clean(s='') {
  return String(s).replace(/\r/g,'\n').replace(/\t/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#039;/g,"'").replace(/&quot;/g,'"').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,'\n').replace(/[ ]{2,}/g,' ').replace(/\n[ ]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
async function scrape(url) {
  if (!url) return { raw:'', text:'', method:'none' };
  if (FIRECRAWL_API_KEY) {
    try {
      const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${FIRECRAWL_API_KEY}` },
        body: JSON.stringify({ url, formats:['markdown','html','links'], onlyMainContent:false, waitFor:3500, timeout:60000, blockAds:true, removeBase64Images:true })
      });
      const json = await res.json().catch(()=>({}));
      if (res.ok && json.success) {
        const raw = [json.data?.markdown, json.data?.html, Array.isArray(json.data?.links)?json.data.links.join('\n'):''].filter(Boolean).join('\n');
        return { raw, text: clean(raw), method:'firecrawl' };
      }
    } catch {}
  }
  try {
    const res = await fetch(url, { headers: { 'user-agent':'Mozilla/5.0 ComicConTracker/7.0' } });
    if (!res.ok) throw new Error(String(res.status));
    const raw = await res.text();
    return { raw, text: clean(raw), method:'direct' };
  } catch {
    return { raw:'', text:'', method:'failed' };
  }
}
function imageCandidates(raw) {
  const html = String(raw || '');
  const urls = new Set();
  for (const m of html.matchAll(/https?:\/\/[^\s"')<>]+(?:png|jpg|jpeg|webp)(?:\?[^\s"')<>]+)?/gi)) urls.add(m[0]);
  for (const m of html.matchAll(/(?:src|data-src|data-lazy-src|srcset)=["']([^"']+)["']/gi)) {
    const pieces = String(m[1]).split(',').map(x => x.trim().split(/\s+/)[0]);
    for (let u of pieces) {
      if (u.startsWith('//')) u = 'https:' + u;
      if (/^https?:\/\//i.test(u) && /\.(png|jpg|jpeg|webp)(\?|$)/i.test(u)) urls.add(u);
    }
  }
  return [...urls].filter(u => !badImageUrl(u));
}
function scoreImage(raw, name, url) {
  const n = norm(name);
  const lowerRaw = String(raw || '').toLowerCase();
  const lowerUrl = String(url || '').toLowerCase();
  let score = 0;
  if (!url || badImageUrl(url)) return -100;
  if (/imagedelivery|knect365|imgix|uploads|cloudfront|wp-content|reedpop|rxglobal|newyorkcomiccon/i.test(url)) score += 2;
  const nameIdx = lowerRaw.indexOf(String(name).toLowerCase());
  const urlIdx = lowerRaw.indexOf(url.toLowerCase());
  if (nameIdx >= 0 && urlIdx >= 0) {
    const dist = Math.abs(urlIdx - nameIdx);
    if (dist < 800) score += 8;
    else if (dist < 1800) score += 5;
    else if (dist < 3500) score += 2;
  }
  const slug = n.replace(/ /g, '-');
  if (lowerUrl.includes(slug)) score += 8;
  const parts = n.split(' ').filter(Boolean);
  if (parts.every(p => lowerUrl.includes(p))) score += 4;
  if (/logo|banner|header|footer|sponsor|default|placeholder/i.test(lowerUrl)) score -= 8;
  return score;
}
function bestPhotoFromPage(raw, name) {
  const candidates = imageCandidates(raw);
  let best = { url:'', score:-999 };
  for (const url of candidates) {
    const score = scoreImage(raw, name, url);
    if (score > best.score) best = { url, score };
  }
  return best.score >= 5 ? best.url : '';
}
function candidateProfileLinks(raw, name) {
  const html = String(raw || '');
  const n = norm(name);
  const links = new Set();
  for (const m of html.matchAll(/https?:\/\/[^\s"')<>]+/gi)) {
    const u = m[0].replace(/[#?].*$/, '').replace(/\/$/, '/');
    const lu = u.toLowerCase();
    if ((lu.includes('/guests') || lu.includes('/our-guests') || lu.includes('/guest') || lu.includes('/en-us/guests')) && n.split(' ').some(p => lu.includes(p))) links.add(u);
  }
  return [...links].slice(0,5);
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'POST only' });
  const { guest, convention, cache } = req.body || {};
  const name = guest?.name || '';
  if (!name) return res.status(400).json({ error:'Missing guest name' });
  const cached = cache?.[norm(name)] || '';
  if (cached && !badImageUrl(cached)) return res.status(200).json({ photoUrl: cached, source:'cache', confidence:'cached' });
  const known = knownPhotos[norm(name)] || '';
  if (known) return res.status(200).json({ photoUrl: known, source:'known', confidence:'high' });

  const pages = [];
  if (guest?.sourceUrl) pages.push(guest.sourceUrl);
  if (convention?.guestUrl) pages.push(convention.guestUrl);
  if (convention?.website && convention.website !== convention.guestUrl) pages.push(convention.website);
  let methods = [];
  for (const url of [...new Set(pages)].filter(Boolean).slice(0,3)) {
    const page = await scrape(url); methods.push(`${url}:${page.method}`);
    if (!page.raw) continue;
    // First try the exact page.
    if (page.text.toLowerCase().includes(name.toLowerCase())) {
      const direct = bestPhotoFromPage(page.raw, name);
      if (direct) return res.status(200).json({ photoUrl: direct, source:url, confidence:'matched-near-name', methods });
    }
    // Then try profile links found on this page.
    const links = candidateProfileLinks(page.raw, name);
    for (const link of links) {
      const detail = await scrape(link); methods.push(`${link}:${detail.method}`);
      if (!detail.raw) continue;
      if (!detail.text.toLowerCase().includes(name.toLowerCase())) continue;
      const found = bestPhotoFromPage(detail.raw, name);
      if (found) return res.status(200).json({ photoUrl: found, source:link, confidence:'profile-name-match', methods });
    }
  }
  res.status(200).json({ photoUrl:'', source:'none', confidence:'not-found', methods });
}
