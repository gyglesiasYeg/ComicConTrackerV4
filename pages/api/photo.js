// Comic Con Tracker V9 - Stable Known Person Photo API
// Important: this endpoint DOES NOT scrape convention pages for photos.
// It only uses verified known URLs and Wikidata human entity P18 images.

const KNOWN_PHOTOS = {
  'christopher judge': 'https://imagedelivery.net/VTBDqFF18S3r8M9B-TFWuA/c6be3e1c-a4ad-4d3f-ecdf-6557a359ac00/public',
  'karl urban': 'https://knect365.imgix.net/uploads/KARL-URBAN-BOYS-400x400-5c27173a10f70749384ecabf2b9e7b40.png?auto=format&fit=max&w=462&h=462&dpr=1',
  'ron perlman': 'https://imagedelivery.net/VTBDqFF18S3r8M9B-TFWuA/e04eda41-97d8-496d-0f19-e1dc1d0afa00/public',
  'nicolas cage': 'https://commons.wikimedia.org/wiki/Special:FilePath/Nicolas%20Cage%20Deauville%202013%202.jpg?width=500',
  'nicholas cage': 'https://commons.wikimedia.org/wiki/Special:FilePath/Nicolas%20Cage%20Deauville%202013%202.jpg?width=500',
  'john cena': 'https://commons.wikimedia.org/wiki/Special:FilePath/John%20Cena%20by%20Gage%20Skidmore.jpg?width=500'
};

function norm(s = '') {
  let n = String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (n === 'nicholas cage') n = 'nicolas cage';
  return n;
}
function rawNorm(s = '') {
  return String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function badImageUrl(url = '') {
  const u = String(url || '').toLowerCase();
  if (!u) return true;
  return ['logo','favicon','icon','badge','banner','header','wordmark','sprite','placeholder','poster','cover','character','share-image','og-image','default','no-image'].some(x => u.includes(x));
}
async function getJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'ComicConTracker/9.0 stable-known-person-photo', 'accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
function commons(fileName) {
  return fileName ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=500` : '';
}
function isHuman(entity) {
  return (entity?.claims?.P31 || []).some(c => c.mainsnak?.datavalue?.value?.id === 'Q5');
}
function p18(entity) {
  return entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value || '';
}
function nameMatches(label, requested) {
  const a = norm(label);
  const b = norm(requested);
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const ar = rawNorm(label).replace(/nicholas/g, 'nicolas');
  const br = rawNorm(requested).replace(/nicholas/g, 'nicolas');
  return ar === br || ar.includes(br) || br.includes(ar);
}
async function wikidataPhoto(name) {
  const searchName = norm(name) === 'nicolas cage' ? 'Nicolas Cage' : name;
  const search = await getJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(searchName)}&language=en&format=json&limit=8&origin=*`);
  const ids = (search.search || []).map(x => x.id).filter(Boolean);
  if (!ids.length) return null;
  const data = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&languages=en&props=claims|labels|descriptions&format=json&origin=*`);
  for (const id of ids) {
    const e = data.entities?.[id];
    if (!e || !isHuman(e)) continue;
    const label = e.labels?.en?.value || '';
    if (!nameMatches(label, name)) continue;
    const imageFile = p18(e);
    if (!imageFile) continue;
    const photoUrl = commons(imageFile);
    if (!badImageUrl(photoUrl)) {
      return { photoUrl, source: `wikidata:${id}`, confidence: 'high', label, description: e.descriptions?.en?.value || '' };
    }
  }
  return null;
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { guest, cache } = req.body || {};
  const name = guest?.name || '';
  if (!name) return res.status(400).json({ error: 'Missing guest name' });

  const key = norm(name);
  const cached = cache?.[key] || cache?.[rawNorm(name)] || '';
  if (cached && !badImageUrl(cached)) return res.status(200).json({ photoUrl: cached, source: 'cache', confidence: 'cached' });

  const known = KNOWN_PHOTOS[key] || KNOWN_PHOTOS[rawNorm(name)] || '';
  if (known && !badImageUrl(known)) return res.status(200).json({ photoUrl: known, source: 'known-photo-library', confidence: 'high' });

  try {
    const found = await wikidataPhoto(name);
    if (found?.photoUrl) return res.status(200).json(found);
    return res.status(200).json({ photoUrl: '', source: 'wikidata', confidence: 'not-found' });
  } catch (e) {
    return res.status(200).json({ photoUrl: '', source: 'wikidata-error', confidence: 'error', error: e.message });
  }
}
