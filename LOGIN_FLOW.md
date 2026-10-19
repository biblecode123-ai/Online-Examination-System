# Student Login Flow - Production Backend

## Overview
The Online Examination System uses the production backend at `https://2019api.ofijan.com` for all authentication and data operations.

## API Configuration

### Production (Vercel Deployment)
- **Proxy URL**: `/api/proxy` (Vercel Edge Function)
- **Target Backend**: `https://2019api.ofijan.com`
- **Environment Variable**: `PROXY_TARGET` (defaults to `https://2019api.ofijan.com`)

### Development (Local)
- **Base URL**: `http://localhost:3000` (Laravel backend)
- **API Root**: `http://localhost:3000/api`
- **Environment Variable**: `VITE_API_BASE_URL` (optional, defaults to `http://localhost:3000`)

## CORS Proxy

The production backend does not allow CORS requests from Vercel. To solve this, a Vercel serverless function proxy is used:

- **Location**: `artifacts/online-examination/api/proxy.js`
- **Path**: `/api/proxy`
- **Function**: Forwards requests to production backend with CORS headers

See `PROXY_SETUP.md` for detailed setup instructions.

## Login Flow

### 1. User Login (`POST /api/v1/login`)
**Location**: `artifacts/online-examination/src/lib/endpoints.ts` (authApi.login)

**Request**:
```json
{
  "email": "student@example.com",
  "password": "password123"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 1,
      "name": "Student Name",
      "email": "student@example.com",
      "role": "Student",
      "role_slug": "student",
      "is_active": true,
      "is_premium": false,
      "email_verified": true,
      "profile_completion_percentage": 100
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "Bearer"
  }
}
```

### 2. Profile Verification (`GET /api/v1/profile`)
**Location**: `artifacts/online-examination/src/lib/endpoints.ts` (authApi.profile)

After successful login, the frontend automatically fetches the user's profile to:
- Verify the user's role
- Ensure the user is a student (role_slug === 'student')
- Get complete user details

**Request Headers**:
```
Authorization: Bearer {token}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "name": "Student Name",
      "email": "student@example.com",
      "role": "Student",
      "role_slug": "student",
      "is_active": true,
      "is_premium": false,
      "email_verified": true,
      "profile_completion_percentage": 100,
      "department_id": 1,
      "department": {
        "id": 1,
        "name": "Computer Science"
      }
    }
  }
}
```

### 3. Student Role Enforcement
**Location**: `artifacts/online-examination/src/lib/auth.tsx` (isStudent function)

The frontend enforces that only students can access the examination portal:
- If `user.role_slug !== 'student'`, the user is logged out with an error message
- This happens both on initial login and on session validation

### 4. Token Storage
**Location**: `artifacts/online-examination/src/lib/api.ts`

- Token is stored in localStorage with key: `ofijan.student.token.v1`
- User data is cached with key: `ofijan.student.user.v1`
- Token is automatically attached to all subsequent API requests via `Authorization: Bearer {token}` header

### 5. Logout (`POST /api/v1/logout`)
**Location**: `artifacts/online-examination/src/lib/endpoints.ts` (authApi.logout)

**Request Headers**:
```
Authorization: Bearer {token}
```

**Response**:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

The frontend also:
- Clears the token from localStorage
- Clears cached user data
- Sets status to 'anonymous'

## Key Files

### Frontend Authentication Logic
- `artifacts/online-examination/src/lib/auth.tsx` - AuthProvider, login/logout logic
- `artifacts/online-examination/src/lib/api.ts` - API transport, token management
- `artifacts/online-examination/src/lib/endpoints.ts` - API endpoint definitions
- `artifacts/online-examination/src/lib/types.ts` - TypeScript types for API responses
- `artifacts/online-examination/src/pages/login.tsx` - Login UI

### Backend (Production)
- The production backend at `https://2019api.ofijan.com` handles:
  - User authentication
  - Password verification
  - Token generation (Sanctum/Laravel)
  - Role-based access control
  - Student-only enforcement

## Security Features

1. **Rate Limiting**: Login endpoint is throttled (5 attempts per minute)
2. **Role Enforcement**: Only users with `role_slug === 'student'` can access the portal
3. **Token Validation**: All authenticated requests validate the token
4. **Session Expiry**: 401 responses automatically clear the session
5. **HTTPS**: All communication uses HTTPS

## Error Handling

Common login errors:
- **401**: Invalid email or password
- **403**: Account inactive or not a student
- **429**: Too many login attempts (rate limited)
- **Network**: Connection issues to production backend

## Testing

To test student login, you need valid credentials from the production backend:
1. Email: Must be a registered student email in the production system
2. Password: Must match the production system's password
3. Role: User must have `role_slug === 'student'` in the production database

The production backend at `https://2019api.ofijan.com` manages all user accounts and authentication.
