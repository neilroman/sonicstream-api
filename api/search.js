const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://iv.melmac.space',
  'https://invidious.privacydev.net',
  'https://vid.puffyan.us',
  'https://invidious.tiekoetter.com',
  'https://invidious.flokinet.to',
  'https://invidious.projectsegfau.lt',
  'https://yt.oelrichsgarcia.de'
];

module.exports = async function handler(req, res) {
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

  console.log('[Search] Query:', q);

  for (const instance of INVIDIOUS) {
    try {
      const url = `${instance}/api/v1/search?q=${encodeURIComponent(q)}&type=video&fields=videoId,title&page=1`;
      console.log('[Search] Trying:', instance);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      
      const response = await fetch(url, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (compatible; SonicStream/1.0)',
          'Accept': 'application/json'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeout);

      if (!response.ok) {
        console.log('[Search] Bad status:', response.status, 'from', instance);
        continue;
      }

      const data = await response.json();
      
      if (Array.isArray(data) && data.length > 0 && data[0].videoId) {
        console.log('[Search] Found:', data[0].videoId, 'via', instance);
        return res.status(200).json({
          videoId: data[0].videoId,
          title: data[0].title,
          instance: instance
        });
      }
    } catch(e) {
      console.log('[Search] Error on', instance, ':', e.message);
      continue;
    }
  }

  // Last resort: return a search URL for manual use
  console.log('[Search] All instances failed for:', q);
  return res.status(404).json({ 
    error: 'Video not found',
    query: q,
    tried: INVIDIOUS.length + ' instances'
  });
};
