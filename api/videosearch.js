// Vercel endpoint - busca videos en YouTube via Piped/Invidious
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing q' });

  const PIPED = [
    'https://pipedapi.kavin.rocks',
    'https://piped-api.garudalinux.org',
    'https://api.piped.projectsegfau.lt',
    'https://pipedapi.tokhmi.xyz',
    'https://pipedapi.moomoo.me'
  ];

  // Try Piped instances
  for (const instance of PIPED) {
    try {
      const r = await fetch(`${instance}/search?q=${encodeURIComponent(q)}&filter=videos`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(6000)
      });
      if (!r.ok) continue;
      const data = await r.json();
      const items = (data.items || [])
        .filter(v => v.url && v.url.includes('watch'))
        .slice(0, 24)
        .map(v => ({
          videoId: v.url.split('watch?v=')[1]?.split('&')[0] || '',
          title: v.title || '',
          channel: v.uploaderName || '',
          duration: v.duration || 0,
          views: v.views || 0,
          thumb: v.thumbnail || ''
        }));
      if (items.length > 0) {
        return res.status(200).json({ items, source: instance });
      }
    } catch(e) { continue; }
  }

  // Fallback: try YouTube scraping
  try {
    const r = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%3D%3D`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const html = await r.text();
    
    // Extract video data from YouTube's initial data
    const match = html.match(/var ytInitialData = ({.+?});<\/script>/s);
    if (match) {
      const data = JSON.parse(match[1]);
      const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
      
      const items = contents
        .filter(c => c.videoRenderer)
        .slice(0, 24)
        .map(c => {
          const v = c.videoRenderer;
          return {
            videoId: v.videoId || '',
            title: v.title?.runs?.[0]?.text || '',
            channel: v.ownerText?.runs?.[0]?.text || '',
            duration: 0,
            views: 0,
            thumb: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`
          };
        })
        .filter(v => v.videoId);

      if (items.length > 0) {
        return res.status(200).json({ items, source: 'youtube' });
      }
    }
  } catch(e) {
    console.error('YouTube scrape error:', e.message);
  }

  return res.status(404).json({ error: 'No results found', query: q });
};
