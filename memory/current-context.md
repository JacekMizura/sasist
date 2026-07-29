# current-context

## Active

**Sasist Agent ↔ ERP pairing blocker — FIXED (root cause proven)**

Tray saved single-use pairing code as DPAPI `agent_api_key`. Host on start re-POSTed it to `/api/printing/agents/register` → 401 „kod nieprawidłowy/wygasł” → crash before heartbeat → ERP never „Połączono”.

## Fix

- Tray: never persist pairing code as ApiKey; clear ApiKey after successful pair
- Host: strip pairing-shaped `agent_api_key`, skip register when token present → heartbeat
- Verified: heartbeat HTTP 200, `status.json` online=true, device_count=4
- Installer: `sasist-agent/dist/SasistAgentSetup.exe` (rebuild done; reinstall as admin)

## TEMP diagnostics

- Agent: `ProgramData\Sasist\Agent\logs\pairing-diag.log`
- Backend: `printing.agents.register|heartbeat`, `workstation.pairing_*`
- FE: `console.info [wms-pairing]`
