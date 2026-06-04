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
[startup] bind host=:: port=...
[routes] /api/wms/returns/orders/lookup
Backend started OK
```

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

## Verify after deploy

```bash
curl -sS "https://YOUR-BACKEND.up.railway.app/healthz"
curl -sS "https://YOUR-BACKEND.up.railway.app/api/wms/returns/orders/lookup?tenant_id=1&q=1"
```

Second call should return JSON (often `[]`), not `{"detail":"Not Found"}`.
