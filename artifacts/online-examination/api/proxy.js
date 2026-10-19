// Vercel serverless function to proxy API requests to production backend
// This solves CORS issues when deployed on Vercel

export default async function handler(req, res) {
  const PROXY_TARGET = process.env.PROXY_TARGET || 'https://2019api.ofijan.com';

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Get the path from the request URL
  const path = req.url || '';
  const targetUrl = `${PROXY_TARGET}${path}`;

  try {
    // Forward the request to the production backend
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.authorization && { Authorization: req.headers.authorization }),
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });

    const data = await response.text();

    return res.status(response.status).send(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Proxy error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
