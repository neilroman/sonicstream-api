module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, type } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing video id' });

  const fmt = type || 'mp3';
  const isVideo = fmt === 'mp4' || fmt === 'webm';

  // For audio: try Vevioz FIRST (most reliable)
  if (!isVideo) {
    try {
      console.log('[Vevioz] Trying for id:', id);
      const vr = await fetch(`https://api.vevioz.com/@api/json/mp3/${id}`, {
        headers: {
          'Referer': 'https://www.vevioz.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(10000)
      });
      const vd = await vr.json();
      console.log('[Vevioz] Response keys:', Object.keys(vd));

      const findUrl = (obj, depth) => {
        if (depth > 5) return null;
        if (!obj) return null;
        if (typeof obj === 'string' && obj.startsWith('http') && (obj.includes('mp3') || obj.includes('audio') || obj.includes('download'))) return obj;
        if (typeof obj === 'object') {
          for (const v of Object.values(obj)) {
            const f = findUrl(v, depth + 1);
            if (f) return f;
          }
        }
        return null;
      };

      // Also check common Vevioz response fields
      const url = vd.link || vd.url || vd.dlink || vd.download || findUrl(vd, 0);
      if (url) {
        console.log('[Vevioz] Found URL:', url.substring(0, 60));
        return res.status(200).json({ url, source: 'vevioz' });
      }
      console.log('[Vevioz] No URL found in response:', JSON.stringify(vd).substring(0, 200));
    } catch(e) {
      console.warn('[Vevioz] Failed:', e.message);
    }
  }

  // Try y2mate API as second option for audio
  if (!isVideo) {
    try {
      console.log('[y2mate] Trying...');
      const ytUrl = 'https://www.youtube.com/watch?v=' + id;
      const r1 = await fetch('https://www.y2mate.com/mates/analyzeV2/ajax', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: 'k_query=' + encodeURIComponent(ytUrl) + '&k_page=home&hl=en&q_auto=0',
        signal: AbortSignal.timeout(8000)
      });
      const d1 = await r1.json();
      if (d1.vid && d1.links && d1.links.mp3) {
        const mp3Links = d1.links.mp3;
        const key = mp3Links['mp3128'] || mp3Links[Object.keys(mp3Links)[0]];
        if (key && key.k) {
          const r2 = await fetch('https://www.y2mate.com/mates/convertV2/index', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
            body: 'vid=' + d1.vid + '&k=' + key.k,
            signal: AbortSignal.timeout(10000)
          });
          const d2 = await r2.json();
          if (d2.dlink) {
            console.log('[y2mate] Found URL');
            return res.status(200).json({ url: d2.dlink, source: 'y2mate' });
          }
        }
      }
    } catch(e) {
      console.warn('[y2mate] Failed:', e.message);
    }
  }

  // Try Cobalt instances as last resort
  const COBALT = [
    'https://cobalt.zyber.gg/api/json',
    'https://cob.freetube.cc/api/json',
    'https://cobalt.api.onrender.com/api/json'
  ];

  const ytUrl = 'https://www.youtube.com/watch?v=' + id;
  const buildBody = (fmt) => {
    if (fmt === 'mp4') return { url: ytUrl, videoQuality: '720', isAudioOnly: false, filenameStyle: 'basic' };
    return { url: ytUrl, isAudioOnly: true, audioFormat: 'mp3', filenameStyle: 'basic' };
  };

  for (const endpoint of COBALT) {
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'sonicstream/1.0' },
        body: JSON.stringify(buildBody(fmt)),
        signal: AbortSignal.timeout(10000)
      });
      if (!r.ok) continue;
      const data = await r.json();
      console.log('[Cobalt]', endpoint, '->', data.status);
      if (['stream','redirect','tunnel'].includes(data.status)) {
        return res.status(200).json({ url: data.url });
      }
    } catch(e) { continue; }
  }

  return res.status(404).json({ error: 'All download methods failed', id });
};
