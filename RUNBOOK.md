# CircuitMentor — Production Operations & Runbook

This document describes how to deploy, monitor, maintain, and troubleshoot the CircuitMentor production stack.

---

## 1. System Overview & Health Probes

CircuitMentor consists of two primary runtime services and a managed database:
- **Web Frontend**: React 19 SPA served via CDN (Vercel, Cloudflare Pages) or Nginx container.
- **API Backend**: FastAPI application running on Python 3.12 with async workers.
- **Database**: PostgreSQL hosted on Supabase (with transaction pooler).
- **AI Gateway**: OpenRouter / Anthropic SSE streaming.

### Health Endpoints
- **Liveness Probe**: `GET /health`
  - Returns: `{"status": "ok", "service": "circuitmentor-api"}` (200 OK)
  - Indicates the process is alive and responding to HTTP traffic.
- **Readiness Probe**: `GET /ready`
  - Returns: `{"status": "ready", "database": "connected"}` (200 OK)
  - Runs `SELECT 1` against PostgreSQL. Returns `503 Service Unavailable` if database connectivity is broken.

---

## 2. Deployment Procedures

### A. Database (Supabase)
1. Ensure connection string uses IPv6 / transaction pooler port `6543` for high concurrency, or port `5432` for direct connection.
2. Run database migrations:
   ```bash
   cd apps/api
   alembic upgrade head
   ```
3. To seed initial parts catalog:
   ```bash
   python -m app.seed
   ```

### B. Backend API (Render / Fly.io / Railway / Docker)
- **Container Build**:
  ```bash
  docker build -t circuitmentor-api -f apps/api/Dockerfile apps/api
  ```
- **Environment Variables**:
  - `DATABASE_URL`: `postgresql+asyncpg://...` (URL-encoded password for special characters)
  - `JWT_SECRET`: 64+ char random hex string (`openssl rand -hex 32`)
  - `COOKIE_SECURE`: `true`
  - `CORS_ORIGINS`: `https://app.circuitmentor.com,https://circuitmentor.vercel.app`
  - `WEB_URL`: Production web domain
  - `GOOGLE_CLIENT_ID`: Google OAuth production client ID
  - `GOOGLE_CLIENT_SECRET`: Google OAuth production secret
  - `GOOGLE_REDIRECT_URI`: `https://api.circuitmentor.com/v1/auth/google/callback`
  - `OPENROUTER_API_KEY`: OpenRouter API key

### C. Web Frontend (Vercel / Cloudflare Pages)
- **Framework Preset**: Vite
- **Root Directory**: `apps/web`
- **Build Command**: `pnpm build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_API_URL`: `https://api.circuitmentor.com` (leave blank if proxied)

---

## 3. Incident Response & Troubleshooting

### Scenario 1: `Save failed: Failed to fetch` or `Network error`
1. Check `/ready` and `/health` on API URL.
2. Check CORS headers:
   ```bash
   curl -i -X OPTIONS "https://api.circuitmentor.com/v1/projects" \
     -H "Origin: https://app.circuitmentor.com" \
     -H "Access-Control-Request-Method: PATCH"
   ```
   Verify `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials: true`.
3. Check cookie settings: in production, `SameSite=Lax; Secure; HttpOnly` is required. If running over plain HTTP without HTTPS, `COOKIE_SECURE` must be `false`.

### Scenario 2: 429 Too Many Requests
1. The built-in rate limiter restricts `/v1/mentor/stream` to 30 req/min and `/v1/auth/login` to 15 req/min per IP.
2. If traffic comes from behind an institutional proxy/NAT, configure reverse proxy headers (`X-Forwarded-For`).
3. To adjust limits, tune `_RATE_LIMITS` in `apps/api/app/main.py` or set `RATE_LIMIT_ENABLED=false` in `.env`.

### Scenario 3: Database Connection Refused / Pool Exhausted
1. Switch connection string to Supabase transaction pooler (port 6543) with `NullPool` or small connection pool size.
2. Verify Supabase IPv6 DNS resolution.

---

## 4. Secrets Rotation

### Rotating JWT_SECRET
1. Generate new secret: `openssl rand -hex 32`.
2. Update `JWT_SECRET` in production environment settings.
3. Redeploy API. Active student sessions will gracefully expire and prompt re-login.

### Rotating Database Password
1. Reset database password in Supabase dashboard.
2. URL-encode any special characters (e.g. `?` -> `%3F`, `@` -> `%40`).
3. Update `DATABASE_URL` in API environment variables and restart API.

---

## 5. Rollback Procedure

### Reverting Application Code
```bash
git checkout <previous-stable-tag-or-commit>
git push origin main --force-with-lease
```

### Reverting Alembic Migrations
```bash
cd apps/api
# Downgrade 1 revision
alembic downgrade -1

# Or downgrade to specific revision
alembic downgrade 0002_add_project_task_id_and_progress
```
