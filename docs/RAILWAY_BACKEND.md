# Railway — backend API (Python)

Frontend is deployed separately (e.g. Vercel). The **backend** Railway service must build and run **Python**, not Node.

## Symptoms of wrong configuration

Build log shows:

```text
setup │ nodejs_18, npm-9_x
```

Runtime:

```text
python: command not found
```

That means the service is building a **Node** app (usually Root Directory = `frontend`).

## Required service settings (Railway dashboard)

| Setting | Backend service value |
|--------|------------------------|
| **Root Directory** | `/` (empty / repo root) — **not** `frontend`, **not** `backend` alone |
| **Config file** | `/railway.toml` (path is from repo root; it does **not** follow Root Directory) |
| **Start command** | leave empty to use config, or `python run_server.py` |
| **Builder** | Nixpacks (uses repo `nixpacks.toml`) |

Why not `backend/` as root? `requirements.txt` and `run_server.py` live at **repo root**. Root `backend/` alone would miss them.

Why not `frontend/`? Nixpacks detects `package.json` → Node 18 + `npm ci` → no Python at runtime.

## Expected build log (correct)

```text
setup │ python3
...
pip install -r requirements.txt
```

## Expected runtime log

```text
IMPORTING WMS RETURNS ROUTER
IMPORTING WMS RETURNS ROUTER done routes=18
[routes] wms_returns router_routes=18 app_paths=18
[routes] /api/wms/returns/orders/lookup
...
[startup] app ready routes=...
Backend started OK
```

If `IMPORTING WMS RETURNS ROUTER` is missing, `backend/api/wms_returns.py` was not deployed or import failed before that line.

If `router_routes=0` or `CRITICAL: no /api/wms/returns/*`, the router did not register — check import errors in deploy logs.

## Files in this repo

| File | Role |
|------|------|
| `nixpacks.toml` | `providers = ["python"]` — ignores root `package.json` |
| `railway.toml` / `railway.json` | Start: `python run_server.py`, health: `/healthz` |
| `requirements.txt` | Python dependencies |
| `run_server.py` | Uvicorn entry (`backend.main:app`) |
| `Procfile` | `web: python3 -m backend` (Heroku-style; Railway uses `railway.toml`) |
| `Dockerfile` | Optional: set builder to Dockerfile if Nixpacks mis-detects |

## Watch paths (optional)

So frontend-only commits do not redeploy the API:

```text
backend/**
requirements.txt
run_server.py
nixpacks.toml
railway.toml
railway.json
Procfile
```

## Verify deploy (not just route dump)

After a successful backend deploy, **Deploy logs → Runtime / startup** must include:

```text
[startup] wms_returns_lookup_build=2026-06-04-returns-lookup-router-v13
[routes] returns dynamic routes moved under /id
[routes] early-mount /api/wms/returns/orders/lookup
[routes] early-mount /api/wms/returns/lookup
```

On each lookup request, **HTTP logs**:

```text
[returns.lookup] q= ...
[returns.lookup] results= ...
[HTTP] GET /api/wms/returns/orders/lookup 200
```

If you see `[routes] /api/wms/returns/orders/lookup` in a manual route list but **no** lines above, the running container is still an **older image** (stale deployment).

### Git (local)

```bash
git log -1 --oneline
# must include commit with: returns.lookup, early-mount, /id/{return_id}

git status
# main should match origin/main after git push
```

### Railway dashboard checklist

| Check | Expected |
|-------|----------|
| Service | **Backend API** (not `frontend`) |
| Root Directory | **empty** / repo root (not `frontend`) |
| Branch | `main` |
| Latest deployment | **Success**, commit `3621a93` or newer |
| `RAILWAY_GIT_COMMIT_SHA` in startup log | matches GitHub commit |
| Build log | `setup │ python3`, not `nodejs_18` |

Trigger **Redeploy** on the backend service after `git push` if the active deployment is older.

## Verify HTTP after deploy

```bash
curl -sS "https://YOUR-BACKEND.up.railway.app/healthz"
curl -sS "https://YOUR-BACKEND.up.railway.app/readyz"
curl -sS "https://YOUR-BACKEND.up.railway.app/api/wms/returns/orders/lookup?tenant_id=1&q=999999&warehouse_id=1"
```

- `/healthz` — liveness (process up).
- `/readyz` — readiness (Tier 0 schema validated; must be `{"ok":true,"tier0":true}` before trusting API).
- Lookup call must return `[]` with HTTP **200**, not `{"detail":"Not Found"}`.

## Production recovery (500/503 on core APIs)

### 1. Full restart (not hot reload)

Railway dashboard → backend service → **Restart** (or redeploy latest commit).
Stale workers may still run old code without Tier 0 bootstrap.

### 2. Env for recovery window

```env
PLATFORM_DEBUG=1
PLATFORM_RECOVERY_MODE=1
FEATURE_OPERATIONAL_RUNTIME=0
FEATURE_REPLENISHMENT_ENGINE=0
FEATURE_OPERATIONAL_SALES=0
FEATURE_OPERATIONAL_SALES_SESSIONS=0
FEATURE_IMMEDIATE_WMS_EXCLUSION=0
```

`PLATFORM_RECOVERY_MODE=1` forces operational features OFF even if DB scope rows exist.

### 3. Startup logs to confirm

```text
[startup.schema]
[startup.validation]
[schema.tier0]
[startup] tier0 ready phase=import dialect=postgresql
```

If import crashes with `CoreSchemaValidationError`, the service must **not** serve broken API — fix DB or deploy newer code with `sync_tier0_orm_columns_from_models`.

### 4. Direct DB verification (production)

```bash
python -m backend.scripts.verify_tier0_schema
```

Requires `DATABASE_URL` pointing at production Postgres.

### 5. Core endpoint smoke test (all must be 200)

```text
/api/orders?tenant_id=1&limit=5
/api/purchasing/dashboard?tenant_id=1
/api/warehouse/layout?tenant_id=1&warehouse_id=1
/api/warehouse/occupancy-metrics?tenant_id=1&warehouse_id=1
/api/warehouses/1/inventory-value
```

### PostgreSQL note

Legacy `ensure_*` helpers in `schema_upgrade.py` use SQLite `PRAGMA` and are **no-ops on Postgres**.
Tier 0 column sync runs via dialect-agnostic `sync_tier0_orm_columns_from_models()` at import.
