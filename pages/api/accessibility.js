// Comic Con Tracker V16.5 - generic accessibility information lookup with filtering fixes
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';
const EXTRA_SOURCES = {};
const NOT_FOUND = 'Not found on official convention website';

const TOPICS = [
  ['Wheelchair / mobility access', /wheelchair|mobility|accessible route|accessibility|ada|barrier free/i],
  ['Accessible entrances', /accessible entrance|accessible entrances|entrance|entry|elevator|ramp/i],
  ['Accessible washrooms', /accessible washroom|accessible washrooms|accessible restroom|accessible restrooms|restroom|washroom|bathroom/i],
  ['Accessible seating', /accessible seating|reserved seating|ada seating/i],
  ['Companion / caregiver policy', /companion|caregiver|support person|personal attendant|aide/i],
  ['Service animals', /service animal|service animals|service dog|guide dog/i],
  ['Sensory / quiet room', /sensory|quiet room|calm room|low sensory/i],
  ['ASL / interpretation', /asl|american sign language|interpreter|interpretation/i],
  ['Captioning', /caption|closed caption|live caption/i],
  ['Accessible parking', /accessible parking|ada parking|parking/i],
  ['Medical assistance', /medical|first aid|medic|health/i],
  ['Scooter / wheelchair rentals', /scooter|wheelchair rental|wheelchair rentals|mobility rental|mobility rentals/i],
  ['Accessibility contact', /accessibility@|ada@|contact.*accessibility|accessibility.*contact|phone|email/i],
  ['Venue accessibility', /venue accessibility|facility accessibility|building accessibility/i],
  ['Public transit accessibility', /transit|subway|bus|train|lrt|public transportation/i]
];

const BAD_URL_WORDS = /mobile-app|floor-plan|show-guides|volunteer|professional-creators|creator|cosplay|exhibitor|artist-alley|photo-gallery|newsletter|tickets|ticket|merch|sponsor|hotel|travel|press|media|privacy|terms/i;
const BAD_TEXT_WORDS = /mobile app|floor plan|show guides|volunteer|professional creators|creator application|cosplay activations|anime activations|artist alley|newsletter|buy tickets|ticket information|photo gallery|official merch|main events|apply|application|exhibitor|sponsor|menu|navigation/i;
const REAL_ACCESS_WORDS = /wheelchair|mobility|accessible entrance|accessible entrances|accessible restroom|accessible restrooms|accessible washroom|accessible washrooms|accessible seating|service animal|service animals|service dog|support person|caregiver|companion|sensory|quiet room|asl|american sign language|interpreter|caption|accessible parking|first aid|medical|scooter|accessibility services|accommodation|accommodations|ada/i;

function clean(s = '') {
  return String(s)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function scrape(url) {
  if (!url) return { raw: '', method: 'none' };

  if (FIRECRAWL_API_KEY) {
    try {
      const r = await fetch('https://api.firecrawl.dev/v2/scrape', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${FIRECRAWL_API_KEY}` },
        body: JSON.stringify({
          url,
          formats: ['markdown', 'html', 'links'],
          onlyMainContent: false,
          waitFor: 3500,
          timeout: 60000,
          removeBase64Images: true
        })
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.success) {
        return {
          raw: [j.data?.markdown, j.data?.html, Array.isArray(j.data?.links) ? j.data.links.join('\n') : ''].filter(Boolean).join('\n'),
          method: 'firecrawl'
        };
      }
    } catch {}
  }

  try {
    const r = await fetch(url, { headers: { 'user-agent': 'ComicConTracker/16.5 accessibility' } });
    if (!r.ok) throw new Error(String(r.status));
    return { raw: await r.text(), method: 'direct' };
  } catch (e) {
    return { raw: '', method: 'failed', error: e.message };
  }
}

function links(raw, base) {
  const out = new Set();
  const hrefs = [...String(raw || '').matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1]);

  for (let u of hrefs) {
    try { if (u.startsWith('/')) u = new URL(u, base).href; } catch {}
    const l = String(u).toLowerCase();
    if (BAD_URL_WORDS.test(l)) continue;
    if (/accessib|ada|faq|help|attend|visit|venue|guide|plan|info/.test(l) && !/facebook|instagram|google|mailto:/.test(l)) {
      out.add(u.split('#')[0]);
    }
  }
  return [...out].slice(0, 8);
}

function splitSentences(text) {
  return clean(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map(x => x.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function isBadSnippet(s) {
  const text = String(s || '').trim();
  const lower = text.toLowerCase();

  if (!text || text.length < 45) return true;
  if (BAD_TEXT_WORDS.test(lower)) return true;

  const urlCount = (text.match(/https?:\/\//g) || []).length;
  const markdownLinkCount = (text.match(/\[[^\]]+\]\(/g) || []).length;
  if (urlCount >= 2 || markdownLinkCount >= 2) return true;

  const slashCount = (text.match(/\//g) || []).length;
  if (slashCount > 8) return true;

  if (!REAL_ACCESS_WORDS.test(text)) return true;

  return false;
}

function snippet(text, rx) {
  const sentences = splitSentences(text);
  const matches = [];

  for (let i = 0; i < sentences.length; i++) {
    const line = sentences[i];
    rx.lastIndex = 0;
    if (!rx.test(line)) continue;

    const context = [sentences[i - 1], line, sentences[i + 1]].filter(Boolean).join(' ');
    if (!isBadSnippet(context)) matches.push(context);
    if (!isBadSnippet(line)) matches.push(line);
  }

  if (matches.length) {
    return matches.sort((a, b) => a.length - b.length)[0].slice(0, 700);
  }

  const t = clean(text);
  rx.lastIndex = 0;
  const m = rx.exec(t);
  if (!m) return '';

  const raw = t
    .slice(Math.max(0, m.index - 180), Math.min(t.length, m.index + 520))
    .replace(/\s+/g, ' ')
    .trim();

  return isBadSnippet(raw) ? '' : raw.slice(0, 700);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { convention } = req.body || {};
  if (!convention) return res.status(400).json({ error: 'Missing convention' });

  const base = [convention.accessibilityUrl, convention.website, convention.guestUrl, ...(EXTRA_SOURCES[convention.id] || [])].filter(Boolean);
  const queue = [...new Set(base)];
  const checked = [];
  let bestSource = '';
  let bestMethod = 'none';
  const found = new Map(TOPICS.map(([name]) => [name, NOT_FOUND]));

  for (const url of queue.slice(0, 12)) {
    const pg = await scrape(url);
    checked.push(`${pg.method}:${url}`);
    if (pg.raw && !bestSource) {
      bestSource = url;
      bestMethod = pg.method;
    }

    for (const [name, rx] of TOPICS) {
      if (found.get(name) !== NOT_FOUND) continue;
      const sn = snippet(pg.raw, rx);
      if (sn) found.set(name, sn);
    }

    if (queue.length < 16) {
      for (const l of links(pg.raw, url)) {
        if (!queue.includes(l)) queue.push(l);
      }
    }
  }

  const items = [...found.entries()].map(([name, value]) => ({ name, value }));
  const hitCount = items.filter(x => x.value !== NOT_FOUND).length;

  return res.status(200).json({
    status: hitCount ? `Found ${hitCount} useful accessibility item(s)` : 'No useful accessibility information found',
    lastChecked: new Date().toISOString(),
    source: bestSource,
    method: bestMethod,
    items,
    notes: hitCount
      ? 'Filtered out navigation menus and link lists. Review the source for official details before relying on accommodations.'
      : 'No useful accessibility statements were found after filtering navigation menus and link lists.',
    checked
  });
}
