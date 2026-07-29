// Comic Con Tracker V16.7 - accessibility lookup with page-following and strict result filtering
// Fixes: URL-only results, guest/appearance false positives, navigation/link lists, and overly empty outputs.
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';
const EXTRA_SOURCES = {};
const NOT_FOUND = 'Not found on official convention website';

const TOPICS = [
  ['Wheelchair / mobility access', /wheelchair|mobility|accessible route|barrier free|barrier-free|mobility device|mobility devices/i],
  ['Accessible entrances', /accessible entrance|accessible entrances|ramp|ramps|elevator|elevators|step-free|step free/i],
  ['Accessible washrooms', /accessible washroom|accessible washrooms|accessible restroom|accessible restrooms|bathroom|washroom|restroom|toilet/i],
  ['Accessible seating', /accessible seating|reserved seating|ada seating|wheelchair seating/i],
  ['Companion / caregiver policy', /companion|caregiver|support person|personal attendant|aide|carer/i],
  ['Service animals', /service animal|service animals|service dog|guide dog/i],
  ['Sensory / quiet room', /sensory|quiet room|calm room|low sensory|sensory room|sensory rooms/i],
  ['ASL / interpretation', /asl|american sign language|interpreter|interpreters|interpretation/i],
  ['Captioning', /caption|captions|captioning|closed caption|live caption/i],
  ['Accessible parking', /accessible parking|ada parking|disabled parking|parking.*accessible/i],
  ['Medical assistance', /medical|first aid|medic|health services|nursing|care room/i],
  ['Scooter / wheelchair rentals', /scooter|scooters|wheelchair rental|wheelchair rentals|mobility rental|mobility rentals/i],
  ['Accessibility contact', /accessibility@|ada@|contact.*accessibility|accessibility.*contact|accessibility team|ada team/i],
  ['Venue accessibility', /venue accessibility|facility accessibility|building accessibility|accessibility services/i],
  ['Public transit accessibility', /accessible transit|transit accessibility|public transportation accessibility|accessible transportation/i]
];

const BAD_URL_WORDS = /mobile-app|floor-plan|show-guides|volunteer|professional-creators|creator|cosplay|exhibitor|artist-alley|photo-gallery|newsletter|tickets|ticket|merch|sponsor|hotel|travel|press|media|privacy|terms|login|account|shop/i;
const GOOD_URL_WORDS = /accessib|ada|assistance|accommodation|faq|help|attend|visit|venue|guide|info/i;
const BAD_TEXT_WORDS = /mobile app|floor plan|show guides|volunteer|professional creators|creator application|cosplay activations|anime activations|artist alley|newsletter|buy tickets|ticket information|photo gallery|official merch|main events|apply|application|exhibitor|sponsor|menu|navigation|appearing|guest|guests|autograph|photo op|badassical|comic creator|voice actor|actor|celebrities/i;
const REAL_ACCESS_WORDS = /wheelchair|mobility|accessible|accessibility|ada|barrier free|barrier-free|ramp|elevator|restroom|washroom|bathroom|seating|service animal|service dog|support person|caregiver|companion|sensory|quiet room|asl|american sign language|interpreter|caption|parking|first aid|medical|scooter|accommodation|accommodations/i;

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
        body: JSON.stringify({ url, formats: ['markdown', 'html', 'links'], onlyMainContent: false, waitFor: 3500, timeout: 60000, removeBase64Images: true })
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.success) return { raw: [j.data?.markdown, j.data?.html, Array.isArray(j.data?.links) ? j.data.links.join('\n') : ''].filter(Boolean).join('\n'), method: 'firecrawl' };
    } catch {}
  }
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'ComicConTracker/16.7 accessibility' } });
    if (!r.ok) throw new Error(String(r.status));
    return { raw: await r.text(), method: 'direct' };
  } catch (e) {
    return { raw: '', method: 'failed', error: e.message };
  }
}

function normalizeUrl(u, base) {
  try {
    if (!u) return '';
    if (u.startsWith('/')) return new URL(u, base).href;
    return new URL(u, base).href;
  } catch { return ''; }
}

function extractLinks(raw, base, accessibilityOnly = false) {
  const out = new Set();
  const pieces = [
    ...(String(raw || '').match(/https?:\/\/[^\s"'<>]+/gi) || []),
    ...[...String(raw || '').matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1]),
    ...[...String(raw || '').matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(m => m[1])
  ];
  for (const rawUrl of pieces) {
    const u = normalizeUrl(rawUrl, base);
    if (!u) continue;
    const l = u.toLowerCase();
    if (/facebook|instagram|google|mailto:|javascript:/.test(l)) continue;
    if (BAD_URL_WORDS.test(l) && !/accessib|ada|assistance|accommodation/.test(l)) continue;
    if (accessibilityOnly) {
      if (/accessib|ada|assistance|accommodation/.test(l)) out.add(u.split('#')[0]);
    } else if (GOOD_URL_WORDS.test(l)) {
      out.add(u.split('#')[0]);
    }
  }
  return [...out].slice(0, 12);
}

function topicWords(topicName) {
  const found = TOPICS.find(([name]) => name === topicName);
  return found ? found[1] : REAL_ACCESS_WORDS;
}

function blocks(text) {
  const lines = clean(text).split(/\n+/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    if (lines[i + 1]) out.push(`${lines[i]} ${lines[i + 1]}`);
    if (lines[i + 1] && lines[i + 2]) out.push(`${lines[i]} ${lines[i + 1]} ${lines[i + 2]}`);
  }
  return out;
}

function isUrlOnly(s) {
  const t = String(s || '').trim();
  return /^https?:\/\/\S+$/i.test(t) || /^\[[^\]]+\]\(https?:\/\/[^)]+\)$/i.test(t);
}

function isBadSnippet(text, topicName) {
  const s = String(text || '').trim();
  const lower = s.toLowerCase();
  if (!s || s.length < 35) return true;
  if (isUrlOnly(s)) return true;
  if (BAD_TEXT_WORDS.test(lower)) return true;
  if (!REAL_ACCESS_WORDS.test(s)) return true;
  if (!topicWords(topicName).test(s)) return true;
  const urlCount = (s.match(/https?:\/\//g) || []).length;
  const markdownLinkCount = (s.match(/\[[^\]]+\]\(/g) || []).length;
  if (urlCount >= 1 || markdownLinkCount >= 1) return true;
  const slashCount = (s.match(/\//g) || []).length;
  if (slashCount > 4) return true;
  return false;
}

function snippet(text, rx, topicName) {
  const matches = [];
  for (const block of blocks(text)) {
    rx.lastIndex = 0;
    if (!rx.test(block)) continue;
    if (!isBadSnippet(block, topicName)) matches.push(block);
  }
  if (!matches.length) return '';
  return matches.sort((a, b) => a.length - b.length)[0].slice(0, 800);
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

  for (let qi = 0; qi < queue.length && qi < 18; qi++) {
    const url = queue[qi];
    const pg = await scrape(url);
    checked.push(`${pg.method}:${url}`);
    if (pg.raw && !bestSource) { bestSource = url; bestMethod = pg.method; }

    // Follow accessibility/ADA pages first. This prevents URL-only results and improves real extraction.
    for (const l of extractLinks(pg.raw, url, true)) if (!queue.includes(l)) queue.unshift(l);
    if (queue.length < 24) for (const l of extractLinks(pg.raw, url, false)) if (!queue.includes(l)) queue.push(l);

    for (const [name, rx] of TOPICS) {
      if (found.get(name) !== NOT_FOUND) continue;
      const sn = snippet(pg.raw, rx, name);
      if (sn) found.set(name, sn);
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
    notes: hitCount ? 'Followed accessibility/ADA pages and filtered out URLs, navigation menus, guest listings, appearance text, and link lists. Review the source for official details before relying on accommodations.' : 'No useful accessibility statements were found after following accessibility/ADA pages and filtering URLs, navigation menus, guest listings, appearance text, and link lists.',
    checked
  });
}
