// Comic Con Tracker V15.6 - safe appearance-day updater
// Updates only guest.days. Does not modify guest names, guest filters, photos, locked lists, or refresh behavior.
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';

const MANUAL_OVERRIDES = {
  nycc: {
    'nicolas cage': ['Saturday', 'Sunday'],
    'nicholas cage': ['Saturday', 'Sunday']
  }
};

const DAY_MAP = [
  ['Thursday', /\b(thursday|thu|thur|thurs)\b/i],
  ['Friday', /\b(friday|fri)\b/i],
  ['Saturday', /\b(saturday|sat)\b/i],
  ['Sunday', /\b(sunday|sun)\b/i]
];

const DATE_DAY_MAP = {
  nycc: {
    'oct 8': 'Thursday', 'october 8': 'Thursday', '10/8': 'Thursday', '10-8': 'Thursday',
    'oct 9': 'Friday', 'october 9': 'Friday', '10/9': 'Friday', '10-9': 'Friday',
    'oct 10': 'Saturday', 'october 10': 'Saturday', '10/10': 'Saturday', '10-10': 'Saturday',
    'oct 11': 'Sunday', 'october 11': 'Sunday', '10/11': 'Sunday', '10-11': 'Sunday'
  },
  edmonton: {
    'sep 18': 'Friday', 'sept 18': 'Friday', 'september 18': 'Friday', '9/18': 'Friday', '9-18': 'Friday',
    'sep 19': 'Saturday', 'sept 19': 'Saturday', 'september 19': 'Saturday', '9/19': 'Saturday', '9-19': 'Saturday',
    'sep 20': 'Sunday', 'sept 20': 'Sunday', 'september 20': 'Sunday', '9/20': 'Sunday', '9-20': 'Sunday'
  },
  calgary: {
    'apr 22': 'Thursday', 'april 22': 'Thursday', '4/22': 'Thursday', '4-22': 'Thursday',
    'apr 23': 'Friday', 'april 23': 'Friday', '4/23': 'Friday', '4-23': 'Friday',
    'apr 24': 'Saturday', 'april 24': 'Saturday', '4/24': 'Saturday', '4-24': 'Saturday',
    'apr 25': 'Sunday', 'april 25': 'Sunday', '4/25': 'Sunday', '4-25': 'Sunday'
  }
};

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^nicholas cage$/, 'nicolas cage');
function clean(s='') {
  return String(s).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, '\n').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
async function scrape(url) {
  if (!url) return { raw: '', method: 'none' };
  if (FIRECRAWL_API_KEY) {
    try {
      const r = await fetch('https://api.firecrawl.dev/v2/scrape', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${FIRECRAWL_API_KEY}` },
        body: JSON.stringify({ url, formats: ['markdown','html','links'], onlyMainContent: false, waitFor: 3500, timeout: 60000, removeBase64Images: true })
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.success) return { raw: [j.data?.markdown, j.data?.html, Array.isArray(j.data?.links) ? j.data.links.join('\n') : ''].filter(Boolean).join('\n'), method: 'firecrawl' };
    } catch {}
  }
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'ComicConTracker/15.6 days-updater' } });
    if (!r.ok) throw new Error(String(r.status));
    return { raw: await r.text(), method: 'direct' };
  } catch (e) {
    return { raw: '', method: 'failed', error: e.message };
  }
}
function dayOrder(days) {
  const order = { Thursday: 1, Friday: 2, Saturday: 3, Sunday: 4 };
  return [...new Set(days)].sort((a,b) => (order[a] || 99) - (order[b] || 99));
}
function extractDaysFromText(text, guestName, conventionId) {
  const cleaned = clean(text);
  const low = cleaned.toLowerCase();
  const names = [guestName, guestName.replace(/\./g, ''), guestName.replace(/\s+/g, ' ')].map(x => x.toLowerCase()).filter(Boolean);
  let windows = [];
  for (const n of names) {
    let i = low.indexOf(n);
    while (i >= 0) {
      windows.push(cleaned.slice(Math.max(0, i - 1200), Math.min(cleaned.length, i + 1600)));
      i = low.indexOf(n, i + Math.max(3, n.length));
    }
  }
  if (!windows.length) return [];
  const found = [];
  for (const w of windows) {
    for (const [day, rx] of DAY_MAP) if (rx.test(w)) found.push(day);
    const dateMap = DATE_DAY_MAP[conventionId] || {};
    const wl = w.toLowerCase();
    for (const [needle, day] of Object.entries(dateMap)) if (wl.includes(needle)) found.push(day);
  }
  return dayOrder(found);
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { convention, guest } = req.body || {};
  const conventionId = convention?.id || '';
  const name = guest?.name || '';
  if (!conventionId || !name) return res.status(400).json({ error: 'Missing convention or guest' });

  const override = MANUAL_OVERRIDES[conventionId]?.[norm(name)];
  if (override) return res.status(200).json({ days: override, source: 'safe-override' });

  const urls = [...new Set([guest?.sourceUrl, convention?.guestUrl, convention?.website].filter(Boolean))];
  let methods = [];
  for (const url of urls.slice(0, 3)) {
    const page = await scrape(url);
    methods.push(`${page.method}:${url}`);
    const days = extractDaysFromText(page.raw, name, conventionId);
    if (days.length) return res.status(200).json({ days, source: url, methods });
  }
  return res.status(200).json({ days: ['TBD'], source: 'not-found', methods });
}
