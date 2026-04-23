module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, type } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing video id' });

  const ytUrl = 'https://www.youtube.com/watch?v=' + id;
  const fmt   = type || 'mp3';
  const isVideo = fmt === 'mp4' || fmt === 'webm';

  const COBALT_INSTANCES = [
    'https://cobalt.zyber.gg/api/json',
    'https://cob.freetube.cc/api/json',
    'https://api.cobalt.tools/api/json'
  ];

  // Build request body based on format
  const buildBody = (fmt) => {
    if (fmt === 'mp4') return { url: ytUrl, vCodec: 'h264', vQuality: '720', isAudioOnly: false, filenamePattern: 'basic' };
    if (fmt === 'webm') return { url: ytUrl, vCodec: 'vp9', vQuality: '1080', isAudioOnly: false, filenamePattern: 'basic' };
    // Audio formats
    const aFmt = ['mp3','ogg','opus','wav','flac'].includes(fmt) ? fmt : 'mp3';
    return { url: ytUrl, isAudioOnly: true, aFormat: aFmt, filenamePattern: 'basic' };
  };

  for (const instance of COBALT_INSTANCES) {
    try {
      const r = await fetch(instance, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body: JSON.stringify(buildBody(fmt)),
        signal: AbortSignal.timeout(10000)
      });
      if (!r.ok) continue;
      const data = await r.json();
      console.log('[Cobalt]', instance, '->', data.status, fmt);
      if (data.status === 'stream' || data.status === 'redirect' || data.status === 'tunnel') {
        return res.status(200).json({ url: data.url, filename: data.filename });
      }
      if (data.status === 'picker' && data.picker && data.picker[0]) {
        return res.status(200).json({ url: data.picker[0].url });
      }
    } catch(e) { continue; }
  }

  // Fallback for audio: Vevioz
  if (!isVideo) {
    try {
      const vr = await fetch(`https://api.vevioz.com/@api/json/mp3/${id}`, {
        headers: { 'Referer': 'https://www.vevioz.com/', 'User-Agent': 'Mozilla/5.0' }
      });
      const vd = await vr.json();
      const findUrl = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        if (typeof obj === 'string' && obj.startsWith('http')) return obj;
        for (const v of Object.values(obj)) { const f = findUrl(v); if (f) return f; }
        return null;
      };
      const url = findUrl(vd);
      if (url) return res.status(200).json({ url, source: 'vevioz' });
    } catch(e) {}
  }

  return res.status(404).json({ error: 'Could not get download URL', fmt });
};
