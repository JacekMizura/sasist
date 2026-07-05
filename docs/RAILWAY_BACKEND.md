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
| **Start command** | leave empty to use config, or `python3 run_server.py` |
| **Builder** | **Dockerfile** (`railway.json` → `"builder": "DOCKERFILE"`) — Python + Node 20 + Puppeteer |

Why not `backend/` as root? `requirements.txt` and `run_server.py` live at **repo root**. Root `backend/` alone would miss them.

Why not `frontend/`? Nixpacks detects `package.json` → Node 18 + `npm ci` → no Python at runtime.

## Expected build log (correct)

With **Dockerfile** builder:

```text
node --version
npm --version
...
pip install -r requirements.txt
...
npm ci --omit=dev
puppeteer ok
...
which node
```

Legacy **Nixpacks-only** build (if dashboard overrides builder):

```text
setup │ python3
...
pip install -r requirements.txt
```

Nixpacks **without** Node in the log → HTML→PDF will fail with `[Errno 2] No such file or directory: 'node'`.

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
| `Dockerfile` | **Production build** — Python 3.12, Node 20, `npm ci` in `backend/scripts/structure_report_pdf/`, Puppeteer/Chromium system libs |
| `railway.json` / `railway.toml` | Builder: **DOCKERFILE**, start: `python3 run_server.py`, health: `/healthz` |
| `nixpacks.toml` | Fallback only if Railway dashboard forces Nixpacks (includes Node + apt libs) |
| `requirements.txt` | Python dependencies |
| `run_server.py` | Uvicorn entry (`backend.main:app`) |
| `Procfile` | `web: python3 -m backend` (Heroku-style; Railway uses `railway.toml`) |
| Root `package.json` | Legacy tooling — **not** used by backend Docker/Nixpacks Python deploy |
| `backend/scripts/structure_report_pdf/` | Puppeteer renderer (`render.mjs`) — required for document PDF preview and warehouse PDF reports |

## HTML → PDF (Puppeteer)

Runtime chain:

1. Python `structure_report_pdf_service.html_document_to_pdf_bytes()` → `subprocess.run(["node", "…/render.mjs"])`
2. Node reads HTML from stdin, Puppeteer launches bundled Chromium, writes PDF to stdout.

**Build must provide:**

| Check | How verified in Docker build |
|-------|------------------------------|
| `node` in PATH | `node --version`, `which node` |
| `npm ci` in `backend/scripts/structure_report_pdf/` | layer RUN before `COPY backend` |
| Puppeteer installed | `node_modules/puppeteer` exists |
| Chromium downloaded | Puppeteer postinstall during `npm ci`; system libs via `apt` |
| `render.mjs` present | `test -f backend/scripts/structure_report_pdf/render.mjs` |

If deploy uses **Nixpacks with `providers = ["python"]` only** (old config), Node is **not** installed → HTTP 503 `pdf_engine_missing` / `[Errno 2] No such file or directory: 'node'`.

**Fix:** use Dockerfile builder (repo default) or redeploy with updated `nixpacks.toml` that adds `nodejs_20` + `npm ci`.

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

### Incremental operational rollout (staging / post-recovery)

Enable direct sales first; keep runtime and replenishment OFF until validated:

```env
PLATFORM_RECOVERY_MODE=0
FEATURE_OPERATIONAL_SALES=1
FEATURE_OPERATIONAL_SALES_SESSIONS=1
FEATURE_OPERATIONAL_RUNTIME=0
FEATURE_REPLENISHMENT_ENGINE=0
DEBUG_OPERATIONAL_FEATURES=1
```

- `GET /api/operational/features` — always 200 when authenticated; logs `[feature.resolve]` on each call.
- `GET /api/operational/features/debug` — DEV/STAGING only (`DEBUG_OPERATIONAL_FEATURES=1` or `APP_ENV=staging`).
- Frontend dev/staging builds show `OperationalStatusPanel` on `/wms/direct-sales` and `/wms/operations`.

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
