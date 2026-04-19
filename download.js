// Vercel proxy - gets direct MP3 download URL from Vevioz
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing video id' });

  try {
    const ytUrl = 'https://www.youtube.com/watch?v=' + id;
    const apiUrl = 'https://api.vevioz.com/@api/json/mp3/' + id;

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.vevioz.com/',
        'Origin': 'https://www.vevioz.com'
      }
    });

    if (!response.ok) throw new Error('Vevioz error: ' + response.status);

    const data = await response.json();
    console.log('[Download] Vevioz response:', JSON.stringify(data).substring(0, 200));

    // Find MP3 download URL in response
    var mp3Url = null;

    if (data.links && data.links.mp3) {
      var mp3Links = data.links.mp3;
      var keys = Object.keys(mp3Links);
      if (keys.length > 0) {
        var first = mp3Links[keys[0]];
        mp3Url = first.url || first.k || first;
      }
    } else if (data.url) {
      mp3Url = data.url;
    } else if (data.dlink) {
      mp3Url = data.dlink;
    }

    if (mp3Url) {
      return res.status(200).json({ url: mp3Url, title: data.title || id });
    }

    // Return full response so we can debug
    return res.status(200).json({ debug: data });

  } catch(e) {
    console.error('[Download] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
