# CORS Proxy Setup for Production Backend

## Problem
The production backend at `https://2019api.ofijan.com` does not allow CORS requests from your Vercel deployment (`https://online-examination-system-olive.vercel.app`), causing login failures.

## Solution
A Vercel Edge Function proxy has been implemented to forward API requests to the production backend while handling CORS headers. This is the recommended solution for production deployment.

## Architecture

```
Frontend (Vercel) → Vercel Edge Function Proxy → Production Backend (2019api.ofijan.com)
```

The proxy:
1. Receives requests from the frontend at `/api/proxy`
2. Forwards them to the production backend
3. Adds CORS headers to responses
4. Returns responses to the frontend

## Setup Instructions

### Production (Vercel Deployment)

The proxy is already configured as a Vercel Edge Function at `api/proxy.ts`. It will automatically be deployed with your Vercel deployment.

**No additional setup needed** - the frontend automatically uses the proxy in production environment.

### Development (Local)

For local development, you have two options:

#### Option 1: Use Local Laravel Backend (Recommended)
1. Start the Laravel backend on port 3000:
```bash
cd ../ofijan-backend
php artisan serve --port=3000
```

2. Start the frontend:
```bash
cd artifacts/online-examination
pnpm run dev
```

The frontend will automatically use `http://localhost:3000` for API requests.

#### Option 2: Use Local Proxy Server
If you want to use the local proxy server that forwards to production:

1. Install dependencies:
```bash
cd artifacts/api-server
pnpm install
```

2. Start the proxy server:
```bash
cd artifacts/api-server
pnpm run dev
```

The proxy will start on `http://localhost:3000`

3. Start the frontend:
```bash
cd artifacts/online-examination
pnpm run dev
```

## Environment Variables

### Frontend (`artifacts/online-examination`)
- `VITE_API_BASE_URL`: API base URL (optional)
  - Development: defaults to `http://localhost:3000`
  - Production: automatically uses `/api/proxy` (Vercel Edge Function)

### Proxy (Vercel Edge Function)
- `PROXY_TARGET`: The production backend URL (default: `https://2019api.ofijan.com`)
  - Set this in Vercel project settings if you need to change the target

## Testing

### Local Development
1. Start the Laravel backend: `cd ../ofijan-backend && php artisan serve --port=3000`
2. Start the frontend: `cd artifacts/online-examination && pnpm run dev`
3. Open the frontend in your browser
4. Try to login with valid student credentials

### Production
1. Deploy to Vercel (the Edge Function proxy will be deployed automatically)
2. Test the login functionality on the deployed site

## Backend Login Logic

The backend enforces **student-only login**:

From `ofijan-backend/app/Http/Controllers/Api/V1/Auth/AuthController.php` (lines 140-149):
```php
// This endpoint backs the online examination portal, a student-facing
// surface: privileged roles (admin, teacher, encoder) must authenticate
// through their own entry points.
$roleSlug = $user->role?->slug;
if ($roleSlug && $roleSlug !== 'student') {
    return $this->forbiddenResponse('The online examination portal is available to student accounts only.');
}
```

Only users with `role.slug === 'student'` can login through this portal. Other roles (admin, teacher, encoder) are blocked.

## Files Modified

- `artifacts/online-examination/api/proxy.ts` - Vercel Edge Function proxy (new)
- `artifacts/online-examination/src/lib/api.ts` - Updated to use proxy in production
- `artifacts/online-examination/vercel.json` - Added API route rewrite rule

## Troubleshooting

### CORS Still Failing in Production
- Verify the Edge Function is deployed (check Vercel dashboard)
- Check that `PROXY_TARGET` environment variable is set correctly in Vercel
- Check browser console for specific error messages
- Ensure the frontend is using the proxy URL (check Network tab in DevTools)

### Local Development Issues
- Ensure Laravel backend is running on port 3000
- Check if port 3000 is already in use
- Verify database connection in Laravel `.env` file

### Production Backend Errors
- The proxy forwards all errors from the production backend
- Check Vercel function logs for detailed error information
- Verify production backend is accessible and credentials are valid

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
