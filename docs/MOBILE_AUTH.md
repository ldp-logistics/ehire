# Mobile authentication (React Native / Expo)

The API supports **both** the web session cookie and a **Bearer JWT** for native clients.

## Login

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "user@company.com", "password": "your-password" }
```

**200 response:**

```json
{
  "message": "Login successful",
  "token": "<jwt — store in SecureStore>",
  "user": {
    "id": "uuid",
    "email": "user@company.com",
    "role": "employee",
    "effectiveRole": "employee",
    "roles": ["employee"],
    "employeeId": "uuid-or-null",
    "allowedModules": []
  }
}
```

Store `token` in **Expo SecureStore** (or Keychain). The server also sets an `auth_token` httpOnly cookie for browsers; mobile should ignore cookies and use Bearer only.

## Authenticated requests

```http
GET /api/auth/me
Authorization: Bearer <token>
```

All protected routes accept the same header. Cookie is optional when Bearer is present.

## Session refresh

There is **no** refresh endpoint. JWT lifetime is **7 days** (`JWT_EXPIRES_IN`). On **401**, clear stored token and show login.

## Current user

Prefer `GET /api/auth/me` after app launch (returns branch `timeZone`, `dateFormat`, `allowedModules`, etc.).

## Logout

```http
POST /api/auth/logout
Authorization: Bearer <token>
```

Clears server-side cookie if present; client must delete local token.

## Microsoft SSO

Not ready for native apps yet (browser redirect + cookie). Use email/password until a PKCE mobile flow is added.

## TypeScript helper

```typescript
const API_BASE = process.env.EXPO_PUBLIC_API_URL!;

export async function apiFetch(path: string, init: RequestInit = {}, token?: string | null) {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg =
      typeof data?.error === "string"
        ? data.error
        : data?.error?.message ?? res.statusText;
    throw new Error(msg);
  }
  return data;
}
```

See `docs/MOBILE_API_OPENAPI.yaml` for full endpoint contracts.
