# Stage 5 — Final Cutover Report (2026-07-27)

## Verdict

**Official product path is now exclusively `sasist-agent` → `SasistAgentSetup.exe`.**

Root Python release/build/download wiring is removed. Python tree is archived as:

`legacy/sasist-printer-agent` (**LEGACY — DO NOT USE**)

Next step after one green production GitHub Release with `SasistAgentSetup.exe`: physical delete of `legacy/sasist-printer-agent`.

---

## Pipelines / workflows changed

| Item | Change |
|------|--------|
| `.github/workflows/printer-agent-release.yml` | **Deleted** |
| `.github/workflows/sasist-agent-release.yml` | **Added** (.NET 8 + Inno + `installer/build.ps1`) |
| `installer/build.ps1` | Rewritten — delegates to `sasist-agent/scripts/publish-release.ps1` |
| `installer/installer.iss` | Stub hard-fail (no second installer) |
| `release.ps1` | Targets Sasist Agent / `Output\SasistAgentSetup.exe` |
| `scripts/lib/publish-agent-github-release.ps1` | Uploads `SasistAgentSetup.exe` |
| `scripts/lib/agent-version.ps1` | SSOT = `sasist-agent/VERSION` |
| `scripts/bump-version.ps1` | Bumps `sasist-agent/VERSION` |
| `scripts/verify-release.ps1` | Verifies .NET Setup + no root `sasist-printer-agent/` |
| `scripts/lib/agent-build-verify.ps1` | Minimal .NET helpers |
| `scripts/verify_agent_exe.py` | Checks `SasistAgentSetup.exe` |
| `scripts/verify_agent_ui_smoke.ps1` | Retired stub |

---

## Download / backend

| Item | Change |
|------|--------|
| `backend/services/printing/github_release_service.py` | Default prefix **`SasistAgentSetup`** |
| Compatibility | Still accepts **`SasistPrinterAgent-Setup*`** if present on latest release |
| Env override | `GITHUB_AGENT_ASSET_PREFIX` (also reads legacy `GITHUB_PRINTER_AGENT_ASSET_PREFIX`) |
| Tests | `test_github_release_service.py` updated (16 passed) |

Endpoints unchanged (same URLs):

- `GET /api/printing/agent/download-info`
- `GET /api/printing/agent/download-debug`

---

## Frontend

| Item | Change |
|------|--------|
| `AddComputerModal.tsx` | „Pobierz Sasist Agent”, kod parowania (bez Server URL) |
| `printerAgent.ts` | Clipboard = pairing code only |

Download still goes through `download-info` API → now prefers `SasistAgentSetup*`.

---

## Docs

| Item | Change |
|------|--------|
| `docs/sasist-agent/ARCHITECTURE.md` | Official product = sasist-agent; legacy pointer |
| `docs/sasist-agent/migration.md` | Stage 5 agent cutover marked done + Legacy Migration |
| `RELEASE_NOTES.md` | SasistAgentSetup.exe |
| `installer/README.md` | Single path documented |
| `sasist-agent/INSTALACJA.md` | (already pairing UX) |
| `legacy/README.md` + `legacy/sasist-printer-agent/LEGACY.md` | Archive markers |

---

## Compatibility left intentionally

1. Backend asset fallback: `SasistPrinterAgent-Setup*`  
2. Env alias: `GITHUB_PRINTER_AGENT_ASSET_PREFIX`  
3. DB/API type name `printer_agent` / table `printer_agents` (protocol identity — not the Python folder)  
4. Orphan `installer/install.ps1` (unused Python service helper; not wired by build)

---

## What still blocks physical delete of legacy/

| Blocker | Notes |
|---------|--------|
| Historical GitHub Releases | Old assets may still be `SasistPrinterAgent-Setup*` until a new .NET release is published |
| Fleet migration | PCs still running Python agent need upgrade CTA / window |
| QZ / protocol cleanup | Separate Stage 5 leftovers (not required to delete legacy folder) |
| Docs references | Intentional Legacy Migration section |

**After** publishing GitHub Release `vX.Y.Z` with asset `SasistAgentSetup.exe` and confirming FE download-info returns that URL, **the next step may be only physical removal of `legacy/sasist-printer-agent`.**

---

## Local verification (this session)

- `pytest backend/tests/printing/test_github_release_service.py` → **16 passed**
- `installer\build.ps1` → **Output\SasistAgentSetup.exe** + manifest written
- Root `sasist-printer-agent/` → **absent** (moved to `legacy/`)
