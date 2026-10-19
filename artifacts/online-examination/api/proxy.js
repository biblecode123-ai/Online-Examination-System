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

  // Get the path from the request URL and strip the /api/proxy prefix
  const path = req.url || '';
  // Remove /api/proxy prefix if present, keep /api for the backend
  // Example: /api/proxy/v1/login -> /api/v1/login
  const cleanPath = path.startsWith('/api/proxy')
    ? '/api' + path.substring('/api/proxy'.length)
    : path;
  const targetUrl = `${PROXY_TARGET}${cleanPath}`;

  // Build headers for the forwarded request
  const headers = {
    'Content-Type': 'application/json',
  };

  // Forward Authorization header if present
  if (req.headers && req.headers.authorization) {
    headers['Authorization'] = req.headers.authorization;
  }

  try {
    // Forward the request to the production backend
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
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
