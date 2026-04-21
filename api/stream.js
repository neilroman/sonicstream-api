// Vercel Stream Proxy - reenvía streams de radio HTTP como HTTPS
// Uso: /api/stream?url=http://stream.example.com:8000/live

export const config = {
  runtime: 'edge', // Edge runtime para mejor rendimiento con streams
};

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { searchParams } = new URL(req.url);
  const streamUrl = searchParams.get('url');

  if (!streamUrl) {
    return new Response('Missing url parameter', { status: 400, headers: corsHeaders });
  }

  // Only allow HTTP streams (not HTTPS - those work directly)
  if (!streamUrl.startsWith('http://')) {
    return new Response('Only HTTP streams supported', { status: 400, headers: corsHeaders });
  }

  try {
    const response = await fetch(streamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SonicStream/1.0)',
        'Icy-MetaData': '1',
      },
    });

    // Forward the stream with CORS headers
    const headers = new Headers(corsHeaders);
    
    // Copy important headers from upstream
    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    headers.set('Content-Type', contentType);
    headers.set('Transfer-Encoding', 'chunked');
    headers.set('Cache-Control', 'no-cache');
    
    // Copy ICY headers if present
    ['icy-name', 'icy-genre', 'icy-br', 'icy-sr', 'icy-url'].forEach(h => {
      const val = response.headers.get(h);
      if (val) headers.set(h, val);
    });

    return new Response(response.body, {
      status: 200,
      headers,
    });

  } catch (e) {
    return new Response('Stream error: ' + e.message, { 
      status: 502, 
      headers: corsHeaders 
    });
  }
}
