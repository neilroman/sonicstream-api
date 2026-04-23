module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, type } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing video id' });

  const ytUrl = 'https://www.youtube.com/watch?v=' + id;
  const fmt   = type || 'mp3';
  const isVideo = fmt === 'mp4' || fmt === 'webm';

  // Get working instances from cobalt instances list
  let instances = [];
  try {
    const r = await fetch('https://instances.cobalt.best/api/instances.json', {
      headers: { 'User-Agent': 'sonicstream/1.0 (+https://github.com/neilroman/sonicstream-radio)' },
      signal: AbortSignal.timeout(5000)
    });
    if (r.ok) {
      const data = await r.json();
      // Filter: online, no auth, cors enabled, supports youtube
      instances = data
        .filter(i => i.online && !i.info?.auth && i.info?.cors && i.services?.youtube === true)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 5)
        .map(i => 'https://' + i.api);
      console.log('[Cobalt] Found', instances.length, 'instances');
    }
  } catch(e) {
    console.warn('[Cobalt] Could not fetch instance list:', e.message);
  }

  // Fallback hardcoded instances
  if (!instances.length) {
    instances = [
      'https://cobalt.zyber.gg',
      'https://cob.freetube.cc',
      'https://cobalt.api.onrender.com'
    ];
  }

  const buildBody = (fmt) => {
    if (fmt === 'mp4') return { url: ytUrl, videoQuality: '720', isAudioOnly: false, filenameStyle: 'basic' };
    if (fmt === 'webm') return { url: ytUrl, videoQuality: '1080', isAudioOnly: false, filenameStyle: 'basic' };
    const aFmt = ['mp3','ogg','opus','wav'].includes(fmt) ? fmt : 'mp3';
    return { url: ytUrl, isAudioOnly: true, audioFormat: aFmt, filenameStyle: 'basic' };
  };

  for (const instance of instances) {
    try {
      const endpoint = instance.endsWith('/') ? instance + 'api/json' : instance + '/api/json';
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'sonicstream/1.0 (+https://github.com/neilroman/sonicstream-radio)'
        },
        body: JSON.stringify(buildBody(fmt)),
        signal: AbortSignal.timeout(10000)
      });
      if (!r.ok) { console.log('[Cobalt]', instance, 'HTTP', r.status); continue; }
      const data = await r.json();
      console.log('[Cobalt]', instance, '->', data.status);
      if (data.status === 'stream' || data.status === 'redirect' || data.status === 'tunnel') {
        return res.status(200).json({ url: data.url, filename: data.filename });
      }
      if (data.status === 'picker' && data.picker?.[0]) {
        return res.status(200).json({ url: data.picker[0].url });
      }
    } catch(e) {
      console.warn('[Cobalt]', instance, 'failed:', e.message);
      continue;
    }
  }

  // Fallback: Vevioz for audio
  if (!isVideo) {
    try {
      const vr = await fetch(`https://api.vevioz.com/@api/json/mp3/${id}`, {
        headers: { 'Referer': 'https://www.vevioz.com/', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000)
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

  return res.status(404).json({ error: 'Could not get download URL' });
};
