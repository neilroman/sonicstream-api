module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, type } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing video id' });

  const ytUrl = 'https://www.youtube.com/watch?v=' + id;
  const isAudio = type === 'mp3';

  // Public Cobalt instances that allow API access
  const COBALT_INSTANCES = [
    'https://cobalt.zyber.gg/api/json',
    'https://cob.freetube.cc/api/json',
    'https://cobalt.api.onrender.com/api/json',
    'https://cobalt-api.zyber.gg/api/json',
    'https://api.cobalt.tools/api/json'
  ];

  const body = isAudio
    ? { url: ytUrl, isAudioOnly: true, aFormat: 'mp3', filenamePattern: 'basic' }
    : { url: ytUrl, vCodec: 'h264', vQuality: '720', isAudioOnly: false, filenamePattern: 'basic' };

  for (const instance of COBALT_INSTANCES) {
    try {
      const r = await fetch(instance, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; SonicStream/1.0)'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000)
      });

      if (!r.ok) {
        console.log('[Cobalt] HTTP error from', instance, r.status);
        continue;
      }

      const data = await r.json();
      console.log('[Cobalt]', instance, '-> status:', data.status);

      if (data.status === 'stream' || data.status === 'redirect' || data.status === 'tunnel') {
        return res.status(200).json({ url: data.url, filename: data.filename });
      }
      if (data.status === 'picker' && data.picker && data.picker[0]) {
        return res.status(200).json({ url: data.picker[0].url });
      }
    } catch(e) {
      console.warn('[Cobalt] Failed:', instance, e.message);
      continue;
    }
  }

  // Fallback: yt-dlp via alternative API
  try {
    const r2 = await fetch(`https://api.vevioz.com/@api/json/mp3/${id}`, {
      headers: { 'Referer': 'https://www.vevioz.com/', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000)
    });
    const d2 = await r2.json();
    const findUrl = (obj) => {
      if (!obj || typeof obj !== 'object') return null;
      if (typeof obj === 'string' && obj.startsWith('http')) return obj;
      for (const v of Object.values(obj)) { const f = findUrl(v); if (f) return f; }
      return null;
    };
    const url = findUrl(d2);
    if (url) return res.status(200).json({ url, source: 'vevioz' });
  } catch(e) {}

  return res.status(404).json({ error: 'Could not get download URL' });
};
