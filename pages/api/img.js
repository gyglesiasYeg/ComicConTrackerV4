// V13 image proxy: allows mobile Safari and desktop to load known person photos consistently.
export default async function handler(req, res) {
  const url = req.query.u;
  if (!url || typeof url !== 'string') return res.status(400).send('Missing image URL');
  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).send('Bad image URL'); }
  const allowed = ['commons.wikimedia.org', 'upload.wikimedia.org', 'knect365.imgix.net', 'imagedelivery.net'];
  if (!allowed.some(host => parsed.hostname === host || parsed.hostname.endsWith('.' + host))) return res.status(403).send('Image host not allowed');
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'ComicConTracker/13.0 image-proxy' } });
    if (!r.ok) return res.status(r.status).send('Image fetch failed');
    const type = r.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(500).send('Image proxy error');
  }
}
