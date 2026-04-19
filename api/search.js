module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing q' });

  // Strategy 1: Scrape YouTube search results directly
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });

    const html = await response.text();
    
    // Extract videoId from YouTube response
    // YouTube embeds initial data as JSON in the page
    const match = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    
    if (match && match[1]) {
      const videoId = match[1];
      // Get title too
      const titleMatch = html.match(/"title":{"runs":\[{"text":"([^"]+)"/);
      const title = titleMatch ? titleMatch[1] : q;
      
      console.log('[Search] Found via YouTube scrape:', videoId);
      return res.status(200).json({ videoId, title });
    }
  } catch(e) {
    console.log('[YouTube scrape] Error:', e.message);
  }

  // Strategy 2: Try Invidious instances
  const INVIDIOUS = [
    'https://inv.nadeko.net',
    'https://yewtu.be',
    'https://invidious.privacydev.net',
    'https://invidious.tiekoetter.com',
    'https://invidious.flokinet.to',
    'https://invidious.projectsegfau.lt',
    'https://yt.oelrichsgarcia.de',
    'https://iv.melmac.space'
  ];

  for (const instance of INVIDIOUS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const url = `${instance}/api/v1/search?q=${encodeURIComponent(q)}&type=video&fields=videoId,title&page=1`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!response.ok) continue;
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0 && data[0].videoId) {
        console.log('[Search] Found via Invidious:', data[0].videoId);
        return res.status(200).json({ videoId: data[0].videoId, title: data[0].title });
      }
    } catch(e) { continue; }
  }

  return res.status(404).json({ error: 'Not found', query: q });
};
