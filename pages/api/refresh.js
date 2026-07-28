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

function normalizeText(s = '') {
  return String(s).replace(/\r/g, '\n').replace(/\t/g, ' ').replace(/[ ]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function uniqByName(items) {
  const map = new Map();
  for (const item of items) {
    const key = String(item.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!key || key.length < 3) continue;
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase() || '?';
}

async function fetchDirect(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 ComicConTracker/4.0',
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
      waitFor: 2500,
      mobile: false,
      timeout: 60000,
      blockAds: true
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || `Firecrawl failed ${res.status}`);
  return [json.data?.markdown, json.data?.html, Array.isArray(json.data?.links) ? json.data.links.join('\n') : ''].filter(Boolean).join('\n');
}

async function fetchPage(url) {
  try {
    const text = await fetchWithFirecrawl(url);
    return { text: normalizeText(text), method: 'firecrawl' };
  } catch (fireError) {
    try {
      const text = await fetchDirect(url);
      return { text: normalizeText(text), method: 'direct', warning: fireError.message };
    } catch (directError) {
      return { text: '', method: 'failed', warning: `${fireError.message}; ${directError.message}` };
    }
  }
}

function parseFanExpoGuests(text, sourceUrl) {
  const items = [];
  const clean = normalizeText(text).replace(/\*/g, '');

  // Pattern often seen in FAN EXPO rendered text: Name FANDOM Appearing: Fri, Sat, Sun
  const re = /([A-ZÀ-ÿ][A-Za-zÀ-ÿ'.-]+(?:\s+[A-ZÀ-ÿ][A-Za-zÀ-ÿ'.-]+){0,4})\s+([^\n]{2,90}?)\s+Appearing:\s*(Fri|Sat|Sun|Thu|TBD|Friday|Saturday|Sunday|Thursday)(?:,?\s*(Fri|Sat|Sun|Thu|Friday|Saturday|Sunday|Thursday))*[^\n]*/gi;
  let m;
  while ((m = re.exec(clean))) {
    const full = m[0];
    const name = m[1].trim();
    if (/All Guests|Celebrities|Animation|Comic Creators|Special Guests|Featured Guests|Also Appearing/i.test(name)) continue;
    const fandom = (m[2] || 'Guest').replace(/Pricing.*$/i, '').trim();
    const daysMatch = full.match(/Appearing:\s*([^\n]+)/i);
    const days = daysMatch ? daysMatch[1].replace(/Pricing.*$/i, '').split(/,| and /).map(x => x.trim()).filter(Boolean) : ['TBD'];
    const auto = ((full.match(/Autograph:\s*\$([0-9.]+)/i) || [])[1]) || '';
    const photo = ((full.match(/Photo Op:\s*\$([0-9.]+)/i) || [])[1]) || '';
    items.push({ name, fandom, days, auto: auto ? Number(auto) : 0, photo: photo ? Number(photo) : 0, photoUrl: '', sourceUrl });
  }
  return uniqByName(items);
}

function parseGenericGuests(text, sourceUrl) {
  const items = [];
  const clean = normalizeText(text);
  const lines = clean.split('\n').map(x => x.trim()).filter(Boolean);
  const bad = /privacy|cookie|tickets|newsletter|contact|sitemap|copyright|countdown|policies|accessibility|terms|buy tickets|sign up|show info/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/^#+\s*/, '').trim();
    if (bad.test(line)) continue;
    if (line.length < 4 || line.length > 60) continue;
    if (!/^[A-ZÀ-ÿ][A-Za-zÀ-ÿ'.-]+(?:\s+[A-ZÀ-ÿ][A-Za-zÀ-ÿ'.-]+){1,4}$/.test(line)) continue;
    items.push({ name: line, fandom: 'Guest', days: ['TBD'], auto: 0, photo: 0, photoUrl: '', sourceUrl });
  }
  return uniqByName(items);
}

function parseDatesVenue(text, fallback) {
  const clean = normalizeText(text);
  const dates = (clean.match(/(?:April|Apr|September|Sept|Sep|October|Oct|November|Nov|May|June|July|August|Aug)\s+\d{1,2}\s*(?:-|–|to)\s*\d{1,2},?\s*\d{4}/i) || [])[0] || fallback.dates || 'TBD';
  const venue = (clean.match(/(?:Edmonton EXPO Centre|Stampede Park|Javits Center|Jacob K\. Javits Convention Center)/i) || [])[0] || fallback.venue || 'TBD';
  return { dates, venue };
}

function mergeGuests(existing = [], fresh = []) {
  const map = new Map();
  for (const g of existing) {
    const key = String(g.name || '').toLowerCase();
    map.set(key, { ...g });
  }
  const changes = [];
  for (const g of fresh) {
    const key = String(g.name || '').toLowerCase();
    if (!map.has(key)) {
      map.set(key, { id: crypto.randomUUID(), must: false, hidden: false, img: initials(g.name), schedule: 'TBD', source: 'Refresh import', ...g });
      changes.push({ type: 'newGuest', name: g.name });
    } else {
      const old = map.get(key);
      const patch = { ...old };
      if (g.days?.length && JSON.stringify(g.days) !== JSON.stringify(old.days)) { patch.days = g.days; changes.push({ type: 'daysChanged', name: g.name, from: old.days, to: g.days }); }
      if (g.auto && g.auto !== old.auto) { changes.push({ type: 'autoChanged', name: g.name, from: old.auto || 'TBD', to: g.auto }); patch.auto = g.auto; }
      if (g.photo && g.photo !== old.photo) { changes.push({ type: 'photoChanged', name: g.name, from: old.photo || 'TBD', to: g.photo }); patch.photo = g.photo; }
      if (g.photoUrl && !old.photoUrl) { patch.photoUrl = g.photoUrl; changes.push({ type: 'photoAdded', name: g.name }); }
      map.set(key, patch);
    }
  }
  return { guests: Array.from(map.values()), changes };
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
  const mainPage = source.mainUrl ? await fetchPage(source.mainUrl) : { text: '', method: 'none' };

  const parser = source.parser === 'fanexpo' ? parseFanExpoGuests : parseGenericGuests;
  const freshGuests = parser(guestPage.text, source.guestUrl || source.mainUrl);
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
    hasFirecrawlKey: Boolean(FIRECRAWL_API_KEY)
  });
}
