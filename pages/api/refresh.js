const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';

const knownSources = {
  edmonton: {
    name: 'Edmonton Expo',
    mainUrl: 'https://fanexpohq.com/edmontonexpo/',
    guestUrl: 'https://fanexpohq.com/edmontonexpo/all-guests/',
    accessUrl: 'https://fanexpohq.com/edmontonexpo/accessibility/',
    parser: 'fanexpo'
  },
  calgary: {
    name: 'Calgary Expo',
    mainUrl: 'https://fanexpohq.com/calgaryexpo/',
    guestUrl: 'https://fanexpohq.com/calgaryexpo/celebrities/',
    accessUrl: 'https://fanexpohq.com/calgaryexpo/accessibility/',
    parser: 'fanexpo'
  },
  nycc: {
    name: 'New York Comic Con',
    mainUrl: 'https://www.newyorkcomiccon.com/',
    guestUrl: 'https://www.newyorkcomiccon.com/en-us/guests.html',
    accessUrl: 'https://www.newyorkcomiccon.com/en-us/about/ada-assistance-program.html',
    parser: 'generic'
  }
};

const franchiseTitleWords = [
  'the mandalorian','battlestar galactica','star wars','star trek','game of thrones','lord of the rings','the lord of the rings','the boys','god of war','fallout','hellboy','sons of anarchy','five nights at freddy','five nights at freddy\'s','borderlands','street fighter','ghost of tsushima','he-man','masters of the universe','teenage mutant ninja turtles','marvel','dc','archie','godzilla','ahsoka','dceased','zombie king','handmaid','handmaid\'s tale','modern asian family','rhymes with comics','guest info','pricing','photo ops','autograph sessions','buy tickets','learn more','main events','comic creators','featured guests','special guests','also appearing','animation voices','anime guests','gaming stars','celebrities','cosplay','newsletter','accessibility','privacy policy','cookie policy','show hours'
];

function normalizeText(s = '') {
  return String(s)
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n[ ]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || '?';
}

function safeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now();
}

function canonical(s = '') {
  return String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function isFranchiseOrUiText(line = '') {
  const c = canonical(line);
  if (!c) return true;
  if (franchiseTitleWords.some(w => c === canonical(w) || c.includes(canonical(w)))) return true;
  if (/\b(tickets|newsletter|privacy|cookie|accessibility|appearing|pricing|autograph|photo op|buy now|learn more|show hours|all guests|guests|events|cosplay|anime|gaming|comics|policies)\b/i.test(c)) return true;
  return false;
}

function looksLikePersonName(line = '') {
  const s = String(line).trim().replace(/^#+\s*/, '').replace(/[|•]/g, ' ').trim();
  if (isFranchiseOrUiText(s)) return false;
  if (s.length < 5 || s.length > 55) return false;
  if (/\d|\$|https?:|@|\(|\)|:|\/|\\/.test(s)) return false;
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;
  const smallWords = new Set(['de','da','del','di','du','van','von','la','le','the']);
  let capCount = 0;
  for (const p of parts) {
    if (smallWords.has(p.toLowerCase())) continue;
    if (!/^[A-ZÀ-ÿ][A-Za-zÀ-ÿ'.-]+$/.test(p)) return false;
    capCount++;
  }
  return capCount >= 2;
}

function uniqByName(items) {
  const map = new Map();
  for (const item of items) {
    const name = String(item.name || '').trim();
    if (!looksLikePersonName(name)) continue;
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!key || key.length < 4) continue;
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

async function fetchDirect(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 ComicConTracker/4.2',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
  if (!res.ok) throw new Error(`Direct fetch failed ${res.status}`);
  return await res.text();
}

async function fetchWithFirecrawl(url) {
  if (!FIRECRAWL_API_KEY) throw new Error('FIRECRAWL_API_KEY is not configured');
  const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${FIRECRAWL_API_KEY}`
    },
    body: JSON.stringify({
      url,
      formats: ['markdown', 'html', 'links'],
      onlyMainContent: false,
      waitFor: 3500,
      timeout: 60000,
      blockAds: true,
      removeBase64Images: true
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || `Firecrawl failed ${res.status}`);
  return [json.data?.markdown, json.data?.html, Array.isArray(json.data?.links) ? json.data.links.join('\n') : ''].filter(Boolean).join('\n');
}

async function fetchPage(url) {
  try {
    const raw = await fetchWithFirecrawl(url);
    return { raw, text: normalizeText(raw), method: 'firecrawl' };
  } catch (fireError) {
    try {
      const raw = await fetchDirect(url);
      return { raw, text: normalizeText(raw), method: 'direct', warning: fireError.message };
    } catch (directError) {
      return { raw: '', text: '', method: 'failed', warning: `${fireError.message}; ${directError.message}` };
    }
  }
}

function parsePriceNear(block, label) {
  const re = new RegExp(label + '\\s*:?\\s*\\$([0-9]+(?:\\.[0-9]{1,2})?)', 'i');
  const m = block.match(re);
  return m ? Number(m[1]) : 0;
}

function parseDaysFromText(text) {
  const m = String(text).match(/Appearing\s*:?\s*([^\n]+)/i);
  if (!m) return ['TBD'];
  const raw = m[1].replace(/Pricing.*$/i, '').replace(/Prices subject.*$/i, '').trim();
  const days = raw.split(/,| and |\//).map(x => x.trim()).filter(Boolean);
  return days.length ? days : ['TBD'];
}

function extractFirstImageNear(raw, name) {
  if (!raw || !name) return '';
  const idx = raw.toLowerCase().indexOf(name.toLowerCase());
  const start = idx >= 0 ? Math.max(0, idx - 2500) : 0;
  const end = idx >= 0 ? Math.min(raw.length, idx + 2500) : Math.min(raw.length, 3000);
  const chunk = raw.slice(start, end);
  const urls = [...chunk.matchAll(/https?:\/\/[^\s"')]+\.(?:png|jpg|jpeg|webp)(?:\?[^\s"')]+)?/gi)].map(m => m[0]);
  return urls.find(u => /knect365|imagedelivery|fanexpo|imgix|uploads/i.test(u)) || urls[0] || '';
}

function parseFanExpoGuests(text, sourceUrl) {
  const raw = String(text || '');
  const clean = normalizeText(raw);
  const lines = clean.split('\n').map(x => x.trim()).filter(Boolean);
  const items = [];

  // Strict parser: only build a guest from a nearby person-name line before an Appearing line.
  for (let i = 0; i < lines.length; i++) {
    if (!/^Appearing\s*:/i.test(lines[i])) continue;

    let name = '';
    let nameIndex = -1;
    for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
      if (looksLikePersonName(lines[j])) {
        name = lines[j];
        nameIndex = j;
        break;
      }
    }
    if (!name) continue;

    const between = lines.slice(nameIndex + 1, i).filter(x => !isFranchiseOrUiText(x) || /^[A-Z0-9 '&.-]{3,80}$/.test(x));
    let fandom = between.find(x => x && !looksLikePersonName(x) && !/^Pricing$/i.test(x)) || 'Guest';
    if (isFranchiseOrUiText(fandom) && fandom.length < 4) fandom = 'Guest';
    const block = lines.slice(Math.max(0, nameIndex), Math.min(lines.length, i + 18)).join('\n');
    items.push({
      name,
      fandom,
      days: parseDaysFromText(lines[i]),
      auto: parsePriceNear(block, 'Autograph'),
      photo: parsePriceNear(block, 'Photo Op'),
      photoUrl: extractFirstImageNear(raw, name),
      sourceUrl
    });
  }

  // Compact fallback: only for a Name + title + Appearing pattern, with strong filtering.
  const compact = clean.replace(/\n+/g, ' ');
  const re = /([A-ZÀ-ÿ][A-Za-zÀ-ÿ'.-]+\s+[A-ZÀ-ÿ][A-Za-zÀ-ÿ'.-]+(?:\s+[A-ZÀ-ÿ][A-Za-zÀ-ÿ'.-]+){0,2})\s+(.{3,90}?)\s+Appearing\s*:\s*(Fri|Sat|Sun|Thu|Friday|Saturday|Sunday|Thursday|TBD)(?:,?\s*(Fri|Sat|Sun|Thu|Friday|Saturday|Sunday|Thursday))*[^.]{0,80}/gi;
  let m;
  while ((m = re.exec(compact))) {
    const name = m[1].trim();
    if (!looksLikePersonName(name)) continue;
    const full = m[0];
    const fandom = (m[2] || 'Guest').replace(/Pricing.*$/i, '').trim();
    items.push({
      name,
      fandom: isFranchiseOrUiText(fandom) ? fandom : fandom || 'Guest',
      days: parseDaysFromText(full),
      auto: parsePriceNear(full, 'Autograph'),
      photo: parsePriceNear(full, 'Photo Op'),
      photoUrl: extractFirstImageNear(raw, name),
      sourceUrl
    });
  }

  return uniqByName(items);
}

function parseGenericGuests(text, sourceUrl) {
  const raw = String(text || '');
  const clean = normalizeText(raw);
  const lines = clean.split('\n').map(x => x.trim()).filter(Boolean);
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/^#+\s*/, '').trim();
    if (!looksLikePersonName(line)) continue;
    const next = lines[i + 1] && !looksLikePersonName(lines[i + 1]) && !isFranchiseOrUiText(lines[i + 1]) ? lines[i + 1] : 'Guest';
    items.push({ name: line, fandom: next, days: ['TBD'], auto: 0, photo: 0, photoUrl: extractFirstImageNear(raw, line), sourceUrl });
  }
  return uniqByName(items);
}

function parseDatesVenue(text, fallback) {
  const clean = normalizeText(text);
  const dates = (clean.match(/(?:April|Apr|September|Sept|Sep|October|Oct|November|Nov|May|June|July|August|Aug)\s+\d{1,2}\s*(?:-|–|to)\s*\d{1,2},?\s*\d{4}/i) || [])[0] || fallback.dates || 'TBD';
  const venue = (clean.match(/(?:Edmonton EXPO Centre|Stampede Park|Javits Center|Jacob K\. Javits Convention Center)/i) || [])[0] || fallback.venue || 'TBD';
  return { dates, venue };
}

function shouldDropExistingImportedGuest(g) {
  const source = String(g.source || '').toLowerCase();
  const imported = source.includes('refresh') || source.includes('import');
  if (!imported) return false;
  return !looksLikePersonName(g.name);
}

function mergeGuests(existing = [], fresh = []) {
  const map = new Map();
  const changes = [];

  for (const g of existing) {
    if (shouldDropExistingImportedGuest(g)) {
      changes.push({ type: 'removedJunk', name: g.name });
      continue;
    }
    const key = String(g.name || '').toLowerCase();
    map.set(key, { ...g });
  }

  for (const g of fresh) {
    const key = String(g.name || '').toLowerCase();
    if (!map.has(key)) {
      map.set(key, { id: safeId(), must: false, hidden: false, img: initials(g.name), schedule: 'TBD', source: 'Refresh import', ...g });
      changes.push({ type: 'newGuest', name: g.name });
      continue;
    }
    const old = map.get(key);
    const patch = { ...old };
    if (g.fandom && g.fandom !== 'Guest' && g.fandom !== old.fandom) patch.fandom = g.fandom;
    if (Array.isArray(g.days) && g.days.length && JSON.stringify(g.days) !== JSON.stringify(old.days)) {
      patch.days = g.days;
      changes.push({ type: 'daysChanged', name: g.name, from: old.days, to: g.days });
    }
    if (g.auto && g.auto !== old.auto) { patch.auto = g.auto; changes.push({ type: 'autoChanged', name: g.name, from: old.auto || 'TBD', to: g.auto }); }
    if (g.photo && g.photo !== old.photo) { patch.photo = g.photo; changes.push({ type: 'photoChanged', name: g.name, from: old.photo || 'TBD', to: g.photo }); }
    if (g.photoUrl && !old.photoUrl) { patch.photoUrl = g.photoUrl; changes.push({ type: 'photoAdded', name: g.name }); }
    map.set(key, patch);
  }
  return { guests: Array.from(map.values()), changes };
}

function debugSample(text) {
  const needles = ['Christopher Judge', 'Karl Urban', 'Ron Perlman', 'Appearing:', 'All Guests'];
  for (const n of needles) {
    const idx = String(text).toLowerCase().indexOf(n.toLowerCase());
    if (idx >= 0) return String(text).slice(Math.max(0, idx - 300), Math.min(String(text).length, idx + 900));
  }
  return String(text || '').slice(0, 1200);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { convention } = req.body || {};
  if (!convention) return res.status(400).json({ error: 'Missing convention' });

  const source = knownSources[convention.id] || {
    name: convention.name,
    mainUrl: convention.website || convention.guestUrl || '',
    guestUrl: convention.guestUrl || convention.website || '',
    accessUrl: convention.accessUrl || '',
    parser: 'generic'
  };
  if (!source.guestUrl && !source.mainUrl) return res.status(400).json({ error: 'Convention needs a website or guest URL' });

  const guestPage = await fetchPage(source.guestUrl || source.mainUrl);
  const mainPage = source.mainUrl ? await fetchPage(source.mainUrl) : { raw: '', text: '', method: 'none' };
  const parser = source.parser === 'fanexpo' ? parseFanExpoGuests : parseGenericGuests;
  const freshGuests = parser(guestPage.text || guestPage.raw, source.guestUrl || source.mainUrl);
  const { guests, changes } = mergeGuests(convention.guests || [], freshGuests);
  const info = parseDatesVenue(mainPage.text || guestPage.text, convention);

  const updated = {
    ...convention,
    dates: info.dates,
    venue: info.venue,
    guests,
    lastChecked: new Date().toISOString(),
    refreshStatus: freshGuests.length ? 'updated' : 'no-guests-parsed',
    guestUrl: source.guestUrl,
    website: source.mainUrl,
    accessUrl: source.accessUrl
  };

  res.status(200).json({
    convention: updated,
    changes,
    parsedGuestCount: freshGuests.length,
    methods: { guestPage: guestPage.method, mainPage: mainPage.method },
    warnings: [guestPage.warning, mainPage.warning].filter(Boolean),
    hasFirecrawlKey: Boolean(FIRECRAWL_API_KEY),
    debugSample: freshGuests.length ? '' : debugSample(guestPage.text || guestPage.raw || '')
  });
}
