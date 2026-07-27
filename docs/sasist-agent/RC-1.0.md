# Sasist Agent Architecture v1.0 — Release Candidate

**Date:** 2026-07-27  
**Designation:** `SASIST AGENT ARCHITECTURE v1.0 RELEASE CANDIDATE`

## Exit criteria checklist

| Criterion | Status |
|-----------|--------|
| Core does not know any module | ✅ |
| Core has no Printing-specific code | ✅ (`PrintingCompat*` removed from Core) |
| No Core hardcode of module name `"printing"` | ✅ |
| Transport fully abstract (`IAgentTransport`) | ✅ |
| Modules auto-loaded | ✅ (`ModulePluginLoader`) |
| Tokens protected by DPAPI | ✅ |
| Remote Actions ACL | ✅ |
| Docs match code (Planned labeled) | ✅ |
| Compat layers are conscious / isolated | ✅ (Host `CompatPrintingTransport`, `/api/printing`) |

## Conscious compatibility layers

1. Host `CompatPrintingTransport` → `/api/printing` register/jobs + edge sync  
2. Physical table `printer_agents` aliased as `EdgeAgent`  
3. FE `/settings/printers/*` for queue/defaults/QZ  
4. Legacy `agent_printers` read fallback when `edge_devices` empty  

## Not in RC (Planned)

- WebSocket, `/api/agent/v1`, sat_/refresh rotation, full crypto update signing  
