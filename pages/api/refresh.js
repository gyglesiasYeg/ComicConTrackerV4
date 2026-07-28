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
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(x => x[0])
    .join('')
    .toUpperCase() || '?';
}

function safeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now();
}

function uniqByName(items) {
  const map = new Map();
  for (const item of items) {
    const name = String(item.name || '').trim();
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!key || key.length < 3) continue;
    if (/^(all guests|celebrities|comic creators|featured guests|special guests|also appearing|main events|cosplay|anime|gaming|photo ops|autograph sessions)$/i.test(name)) continue;
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

async function fetchDirect(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 ComicConTracker/4.1',
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
  return [json.data?.markdown, json.data?.html, Array.isArray(json.data?.links) ? json.data.links.join('\n') : '']
    .filter(Boolean)
    .join('\n');
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

function wordsLookLikeName(line) {
  const s = line.trim();
  if (s.length < 4 || s.length > 70) return false;
  if (/\d{3,}|\$|http|tickets|newsletter|learn more|buy now|privacy|cookie|sitemap|copyright|show hours|countdown|policies|facebook|instagram/i.test(s)) return false;
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 5) return false;
  return parts.every(p => /^[A-ZÀ-ÿ][A-Za-zÀ-ÿ'.-]+$/.test(p));
}

function parsePriceNear(block, label) {
  const re = new RegExp(label + '\\s*:?\\s*\\$([0-9]+(?:\\.[0-9]{1,2})?)', 'i');
  const m = block.match(re);
  return m ? Number(m[1]) : 0;
}

function parseDaysFromText(text) {
  const m = text.match(/Appearing\s*:?\s*([^\n]+)/i);
  if (!m) return ['TBD'];
  const raw = m[1].replace(/Pricing.*$/i, '').replace(/Prices subject.*$/i, '').trim();
  const days = raw.split(/,| and |\//).map(x => x.trim()).filter(Boolean);
  return days.length ? days : ['TBD'];
}

function parseFanExpoGuests(text, sourceUrl) {
  const clean = normalizeText(text);
  const lines = clean.split('\n').map(x => x.trim()).filter(Boolean);
  const items = [];

  // Strategy 1: block parser around "Appearing:" because FAN EXPO pages often render as stacked text.
  for (let i = 0; i < lines.length; i++) {
    if (!/^Appearing\s*:/i.test(lines[i])) continue;
    let name = '';
    let fandom = 'Guest';

    for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
      if (!name && wordsLookLikeName(lines[j])) {
        name = lines[j];
        const between = lines.slice(j + 1, i).filter(x => !/^Pricing$/i.test(x));
        fandom = between.join(' / ') || 'Guest';
        break;
      }
    }

    if (name) {
      const block = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 12)).join('\n');
      items.push({
        name,
        fandom,
        days: parseDaysFromText(lines[i]),
        auto: parsePriceNear(block, 'Autograph'),
        photo: parsePriceNear(block, 'Photo Op'),
        photoUrl: extractFirstImageNear(text, name),
        sourceUrl
      });
    }
  }

  // Strategy 2: single-line parser for snippets/markdown with Name FANDOM Appearing: Fri, Sat, Sun.
  const compact = clean.replace(/\n+/g, ' ');
  const re = /([A-ZÀ-ÿ][A-Za-zÀ-ÿ'.-]+(?:\s+[A-ZÀ-ÿ][A-Za-zÀ-ÿ'.-]+){1,4})\s+([^\n]{2,100}?)\s+Appearing\s*:\s*(Fri|Sat|Sun|Thu|Friday|Saturday|Sunday|Thursday|TBD)(?:,?\s*(Fri|Sat|Sun|Thu|Friday|Saturday|Sunday|Thursday))*[^A-Z]{0,30}/gi;
  let m;
  while ((m = re.exec(compact))) {
    const full = m[0];
    const name = m[1].trim();
    if (!wordsLookLikeName(name)) continue;
    const fandom = (m[2] || 'Guest').replace(/Pricing.*$/i, '').trim();
    items.push({
      name,
      fandom,
      days: parseDaysFromText(full),
      auto: parsePriceNear(full, 'Autograph'),
      photo: parsePriceNear(full, 'Photo Op'),
      photoUrl: extractFirstImageNear(text, name),
      sourceUrl
    });
  }

  // Strategy 3: fallback for all-guests pages where each card appears as Name / fandom / Appearing.
  for (let i = 0; i < lines.length - 1; i++) {
    if (!wordsLookLikeName(lines[i])) continue;
    const windowText = lines.slice(i, i + 5).join('\n');
    if (!/Appearing\s*:/i.test(windowText)) continue;
    items.push({
      name: lines[i],
      fandom: lines[i + 1] && !/^Appearing/i.test(lines[i + 1]) ? lines[i + 1] : 'Guest',
      days: parseDaysFromText(windowText),
      auto: parsePriceNear(windowText, 'Autograph'),
      photo: parsePriceNear(windowText, 'Photo Op'),
      photoUrl: extractFirstImageNear(text, lines[i]),
      sourceUrl
    });
  }

  return uniqByName(items);
}

function extractFirstImageNear(raw, name) {
  if (!raw || !name) return '';
  const idx = raw.toLowerCase().indexOf(name.toLowerCase());
  const start = idx >= 0 ? Math.max(0, idx - 2000) : 0;
  const end = idx >= 0 ? Math.min(raw.length, idx + 2000) : Math.min(raw.length, 3000);
  const chunk = raw.slice(start, end);
  const urls = [...chunk.matchAll(/https?:\/\/[^\s"')]+\.(?:png|jpg|jpeg|webp)(?:\?[^\s"')]+)?/gi)].map(m => m[0]);
  return urls.find(u => /knect365|imagedelivery|fanexpo|imgix|uploads/i.test(u)) || urls[0] || '';
}

function parseGenericGuests(text, sourceUrl) {
  const clean = normalizeText(text);
  const lines = clean.split('\n').map(x => x.trim()).filter(Boolean);
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/^#+\s*/, '').trim();
    if (wordsLookLikeName(line)) {
      const next = lines[i + 1] && !wordsLookLikeName(lines[i + 1]) ? lines[i + 1] : 'Guest';
      items.push({ name: line, fandom: next, days: ['TBD'], auto: 0, photo: 0, photoUrl: extractFirstImageNear(text, line), sourceUrl });
    }
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
      map.set(key, {
        id: safeId(),
        must: false,
        hidden: false,
        img: initials(g.name),
        schedule: 'TBD',
        source: 'Refresh import',
        ...g
      });
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
    if (g.auto && g.auto !== old.auto) {
      patch.auto = g.auto;
      changes.push({ type: 'autoChanged', name: g.name, from: old.auto || 'TBD', to: g.auto });
    }
    if (g.photo && g.photo !== old.photo) {
      patch.photo = g.photo;
      changes.push({ type: 'photoChanged', name: g.name, from: old.photo || 'TBD', to: g.photo });
    }
    if (g.photoUrl && !old.photoUrl) {
      patch.photoUrl = g.photoUrl;
      changes.push({ type: 'photoAdded', name: g.name });
    }
    map.set(key, patch);
  }
  return { guests: Array.from(map.values()), changes };
}

function debugSample(text) {
  const needle = ['Christopher Judge', 'Karl Urban', 'Ron Perlman', 'Appearing:', 'All Guests'];
  for (const n of needle) {
    const idx = text.toLowerCase().indexOf(n.toLowerCase());
    if (idx >= 0) return text.slice(Math.max(0, idx - 300), Math.min(text.length, idx + 900));
  }
  return text.slice(0, 1200);
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
