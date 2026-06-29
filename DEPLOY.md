# How to deploy this HRM system

The app is a **single Node server**: it serves the React frontend (static files) and the API. Database is **Neon PostgreSQL** (cloud).

---

## 1. Prerequisites

- **Neon database**: Create a project at [neon.tech](https://neon.tech) and copy the connection string.
- **Git**: Code in a repo (GitHub/GitLab) so the host can build from it.

---

## 2. Environment variables

Set these on your deployment host (Railway, Render, etc.):

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string (e.g. `postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`) |
| `JWT_SECRET` | Yes | Long random string for signing login tokens (e.g. `openssl rand -base64 32`) |
| `NODE_ENV` | Yes | Set to `production` |
| `PORT` | No | Port the server listens on (default `5000`; host often sets this) |
| `HOST` | No | Set to `0.0.0.0` so the server accepts external connections |

**Optional (for Microsoft SSO):**

- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `MS_TENANT_ID`
- `MS_REDIRECT_URI` — must be `https://your-domain.com/api/auth/microsoft/callback`

---

## 3. Build and run commands

On the deployment host use:

- **Build:** `npm install && npm run build`
- **Start:** `npm start`

This builds the client (Vite) and server (esbuild) and runs `node dist/index.js`, which serves both the API and the static app.

---

## 4. Where to deploy

### Option A: Railway

1. Go to [railway.app](https://railway.app), sign in with GitHub.
2. **New Project** → **Deploy from GitHub repo** → select your repo.
3. **Variables**: Add `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`.
4. **Settings**:
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Root directory: leave default (repo root).
5. Deploy. Railway will assign a URL (e.g. `https://your-app.up.railway.app`).

### Option B: Render

1. Go to [render.com](https://render.com), connect your repo.
2. **New** → **Web Service** → select repo.
3. **Environment**: `Node`.
   - Build: `npm install && npm run build`
   - Start: `npm start`
4. **Environment variables**: Add `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`.
5. Create Web Service. Use the generated URL (e.g. `https://your-app.onrender.com`).

### Option C: Fly.io

1. Install [flyctl](https://fly.io/docs/hands-on/install-flyctl/) and log in.
2. In the project root: `fly launch` (follow prompts, choose a region).
3. Set secrets:  
   `fly secrets set DATABASE_URL="..." JWT_SECRET="..." NODE_ENV=production`
4. Deploy: `fly deploy`.

You may need a `Dockerfile` or ensure the start command is `npm start` and the app listens on `PORT` (Fly sets this).

---

## 5. After first deploy: database setup

The app does **not** run migrations or seed automatically. Do this once against the **production** DB:

1. **Migrations**  
   Run your SQL migrations in order (e.g. all files in `migrations/`) in the Neon SQL Editor, or use your migration runner with production `DATABASE_URL`.

2. **RBAC / “it” role** (if you use it):  
   In Neon SQL Editor run:  
   `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'it';`  
   (Or run `migrations/0013_rbac_harden.sql` or `0013_add_it_role_only.sql`.)

3. **First admin user**  
   - Either run the seed (creates e.g. `ehire@ldplogistics.com` as admin):  
     - Set `DATABASE_URL` to your production URL locally, then:  
     - `npm run db:seed-users`  
     - Then set a real password: `npm run db:set-demo-passwords` (sets `password123` for all; change in app or DB after first login).  
   - Or insert one admin row manually in Neon (table `users`: email, role `admin`, bcrypt password_hash, etc.).

4. **Optional:** Run full seed for demo data:  
   `npm run db:seed` (or `db:seed-sandbox`) with production `DATABASE_URL` if you want sample employees/jobs.

---

## 6. Give the boss access

1. Share the deployed URL (e.g. `https://your-app.up.railway.app`).
2. If you used seed: give them `ehire@ldplogistics.com` / `password123` (or the password you set).
3. They log in → **Settings** → change password if needed, and use **User access** to add more users.

---

## 7. Quick checklist

- [ ] Neon project created; `DATABASE_URL` copied.
- [ ] Env vars set on host: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`.
- [ ] Build = `npm install && npm run build`, Start = `npm start`.
- [ ] Migrations run on production DB.
- [ ] First admin created (seed or manual); boss has login and can use the system.
