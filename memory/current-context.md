# current-context

## Active

**HOTFIX Railway ImportError (startup)** — `slotting_service` importował usunięte Stage2 symbole z `domain.simulation`. Helpery przeniesione do `domain/layout_geometry.py` (czysta geometria Location, bez legacy grafu). Smoke: `import backend.main` + `run_server` `/healthz` 200. Regression: `test_backend_startup_import.py`. **Lokalny commit; no push. Bez Etapu 3.**

## Preferencja commitów (user)

Komunikaty commitów po polsku. **Bez push / bez commit** dopóki user nie poprosi.
