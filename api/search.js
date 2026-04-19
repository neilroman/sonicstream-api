// Vercel Serverless Function - Proxy para Invidious sin CORS
// Ruta: /api/search?q=QUERY

const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://iv.melmac.space',
  'https://invidious.io',
  'https://invidious.privacydev.net',
  'https://vid.puffyan.us'
];

export default async function handler(req, res) {
  // Allow CORS from anywhere
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { q } = req.query;
  if (!q) {
    return res.status(400).json({ error: 'Missing query parameter q' });
  }

  for (const instance of INVIDIOUS) {
    try {
      const url = `${instance}/api/v1/search?q=${encodeURIComponent(q)}&type=video&fields=videoId,title&page=1`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'SonicStream/1.0' },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) continue;

      const data = await response.json();
      if (Array.isArray(data) && data.length > 0 && data[0].videoId) {
        return res.status(200).json({
          videoId: data[0].videoId,
          title: data[0].title,
          instance: instance
        });
      }
    } catch(e) {
      continue;
    }
  }

  return res.status(404).json({ error: 'Video not found' });
}
