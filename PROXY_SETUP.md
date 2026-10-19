# CORS Proxy Setup for Production Backend

## Problem
The production backend at `https://2019api.ofijan.com` does not allow CORS requests from your Vercel deployment (`https://online-examination-system-olive.vercel.app`), causing login failures.

## Solution
A local proxy server has been implemented to forward API requests to the production backend while handling CORS headers.

## Architecture

```
Frontend (Vercel) → Local Proxy Server → Production Backend (2019api.ofijan.com)
```

The proxy server:
1. Receives requests from the frontend
2. Forwards them to the production backend
3. Adds CORS headers to responses
4. Returns responses to the frontend

## Setup Instructions

### 1. Install Dependencies
Navigate to the api-server directory and install dependencies:
```bash
cd artifacts/api-server
pnpm install
```

### 2. Start the Proxy Server
```bash
cd artifacts/api-server
pnpm run dev
```

The proxy will start on `http://localhost:3000`

### 3. Configure Frontend
The frontend is now configured to use the local proxy by default:
- **Default API URL**: `http://localhost:3000`
- **Environment Variable**: `VITE_API_BASE_URL` (can override default)

To use the proxy, no changes are needed - the frontend will automatically use `http://localhost:3000`.

To use the production backend directly (if CORS is resolved):
```bash
VITE_API_BASE_URL=https://2019api.ofijan.com
```

### 4. Deploy the Proxy Server

#### Option A: Deploy to a Cloud Platform
Deploy the proxy server to a platform that supports Node.js (e.g., Railway, Render, Heroku):

1. Push the code to your git repository
2. Connect to your deployment platform
3. Set environment variable `PROXY_TARGET=https://2019api.ofijan.com`
4. Deploy

After deployment, update the frontend's `VITE_API_BASE_URL` to point to your deployed proxy URL.

#### Option B: Use Vercel Serverless Functions
Alternatively, you can create Vercel serverless functions to proxy requests. This would be added to the `api/` directory in the frontend project.

## Proxy Configuration

The proxy is configured in `artifacts/api-server/src/app.ts`:

- **Target**: `https://2019api.ofijan.com` (configurable via `PROXY_TARGET` env var)
- **CORS**: Allows all origins (`*`)
- **Headers**: Forwards Authorization header from frontend to production backend
- **Error Handling**: Returns 500 with error details if proxy fails

## Environment Variables

### Proxy Server (`artifacts/api-server`)
- `PROXY_TARGET`: The production backend URL (default: `https://2019api.ofijan.com`)
- `DATABASE_URL`: Not needed for proxy-only mode
- `PORT`: Server port (default: 3000)

### Frontend (`artifacts/online-examination`)
- `VITE_API_BASE_URL`: API base URL (default: `http://localhost:3000`)

## Testing

1. Start the proxy server: `cd artifacts/api-server && pnpm run dev`
2. Start the frontend: `cd artifacts/online-examination && pnpm run dev`
3. Open the frontend in your browser
4. Try to login with valid production credentials

The proxy will forward the login request to `https://2019api.ofijan.com/api/v1/login` and return the response with proper CORS headers.

## Files Modified

- `artifacts/api-server/package.json` - Added `http-proxy-middleware` dependency
- `artifacts/api-server/src/app.ts` - Implemented proxy middleware
- `artifacts/online-examination/src/lib/api.ts` - Changed default API URL to local proxy

## Alternative Solutions

If you prefer not to use a proxy, consider:

1. **Configure CORS on Production Backend**: Add your Vercel domain to the allowed origins in the production backend's CORS configuration
2. **Use Same-Origin Deployment**: Deploy both frontend and backend to the same domain
3. **Vite Proxy in Development**: Configure Vite's proxy option for local development only

## Troubleshooting

### Proxy Not Starting
- Ensure dependencies are installed: `pnpm install`
- Check if port 3000 is already in use
- Check logs for error messages

### CORS Still Failing
- Verify the proxy server is running
- Check browser console for specific error messages
- Ensure the frontend is using the proxy URL (check Network tab in DevTools)

### Production Backend Errors
- The proxy forwards all errors from the production backend
- Check the proxy server logs for detailed error information
- Verify production backend is accessible and credentials are valid
