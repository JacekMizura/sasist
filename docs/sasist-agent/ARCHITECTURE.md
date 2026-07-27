# Sasist Agent — Architecture

**Status:** Architecture **v1.0 Release Candidate** + **Stage 5 product cutover** (2026-07-27)  
**Official Windows product:** `sasist-agent` → installer `SasistAgentSetup.exe`  
**Runtime protocol:** Compat HTTPS poll (`/api/printing` jobs + `/api/agent` device sync)  
**Tech:** .NET 8 Host (Windows Service) + Tray  

> Legacy Python agent lives under `legacy/sasist-printer-agent` (DO NOT USE). See [migration.md](./migration.md) § Legacy Migration.

Related: [device.md](./device.md) · [openapi-v1.yaml](./openapi-v1.yaml) · [ADR-007](./adr/ADR-007-edge-device-registry-sync.md) · [RC-1.0.md](./RC-1.0.md)

---

## 1. Purpose

Windows edge runtime connecting a PC to Sasist ERP/WMS. Printing is a **plugin module**, not part of Core.

---

## 2. Core architecture

```
┌──────────────────────────────────────────────────────────┐
│                 Host (composition root)                  │
│  Plugin loader │ Transport selection │ Windows Service   │
├──────────────────────────────────────────────────────────┤
│                      AgentRuntime (Core)                 │
│  ConfigStore (DPAPI secrets) │ ModuleRegistry            │
│  DeviceManager │ DeviceEventBus │ ModuleBus              │
│  IAgentTransport (injected)  │ RemoteActions             │
├──────────────────────────────────────────────────────────┤
│              Modules (Sdk only) — auto-discovered        │
├────────────┬────────────┬────────────┬───────────────────┤
│  Printing  │  Scanner*  │  Scale*    │  … plugins/       │
└────────────┴────────────┴────────────┴───────────────────┘
  * scaffold / Planned
```

### Core owns

| Area | Notes |
|------|-------|
| DeviceManager | Type-agnostic registry + delta sync fingerprint |
| ModuleRegistry | Route by ModuleId / Capability — **no hardcoded module names** |
| EventBus / ModuleBus | In-process |
| IAgentTransport | Interface only — Host injects implementation |
| Secrets | DPAPI (`agent_token`, `agent_api_key`, `refresh_token`) |

### Core does **not** own

- Printing HTTP client / GuessPrinter / job format logic
- Any `module_id == "…"` branch
- WebSocket (Planned)

---

## 3. Transport (Host)

| Implementation | Status |
|----------------|--------|
| `CompatPrintingTransport` | **RC default** — edge sync + printing jobs/register adapter |
| `FutureAgentTransport` | Planned |
| `WebSocketTransport` | Planned |

Single heartbeat entry: `IAgentTransport.HeartbeatAsync` (device sync is source of truth; printing heartbeat is adapter-only inside Compat).

---

## 4. Plugin loading

Host discovers `Sasist.Agent.Modules.*.dll` from:

1. Application base directory  
2. `plugins/` next to Host  
3. `%ProgramData%\Sasist\Agent\plugins`

No `new PrintingModule()` in Host code. Adding a module: ship DLL into `plugins/` (or ProjectReference so build copies it).

---

## 5. ERP HTTP surface (actual)

| Prefix | Role |
|--------|------|
| `/api/agent/*` | Device registry, sync, actions, events, modules |
| `/api/printing/*` | Compat register / jobs / heartbeat adapter |

There is **no** `/api/agent/v1` mount and **no** WebSocket gateway in RC.

---

## 6. Security (RC baseline)

- DPAPI local secrets  
- Replay headers `X-Sasist-Timestamp` + `X-Sasist-Nonce` on agent calls  
- Rate limit on agent sync/actions  
- Remote action ACL (`settings.users` / `settings.company`) + allowlist  
- DownloadLogs size cap (5 MiB)  
- Register requires API key (legacy tenant_id register **removed**)  
- Update `.sig` file presence check (full crypto Planned)

---

## 7. Planned (not claimed as shipped)

- WebSocket primary channel  
- Short-lived `sat_` access + refresh rotation  
- Native `/api/agent/v1` without printing compat  
- Full update package signing (Ed25519/Authenticode)  
- Rename `printer_agents` → `edge_agents`
