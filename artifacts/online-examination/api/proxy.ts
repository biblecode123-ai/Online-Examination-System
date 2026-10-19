// Vercel serverless function to proxy API requests to production backend
// This solves CORS issues when deployed on Vercel

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  // In Edge Runtime, we can't use process.env directly
  // We'll use the default production backend URL
  const PROXY_TARGET = 'https://2019api.ofijan.com';

  // Get the path from the request URL
  const url = new URL(request.url);
  const targetUrl = `${PROXY_TARGET}${url.pathname}${url.search}`;

  // Clone the request headers
  const headers = new Headers(request.headers);
  
  // Ensure Content-Type is set if there's a body
  if (request.method !== 'GET' && request.method !== 'HEAD' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    // Forward the request to the production backend
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });

    // Clone the response headers
    const responseHeaders = new Headers(response.headers);

    // Add CORS headers
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: responseHeaders,
      });
    }

    // Return the proxied response
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Proxy error',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
