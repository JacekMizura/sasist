# Sasist Agent — Migration Plan

Related: [ARCHITECTURE.md](./ARCHITECTURE.md), [versioning.md](./versioning.md), [adr/](./adr/)

---

## Overview

```
Python Agent (protocol 0)
        ↓
   Dual Run
        ↓
  .NET Agent (protocol 1)
        ↓
  Feature Flags
        ↓
     Cutover
        ↓
    Cleanup
```

Etap 0 (this documentation set) is a **prerequisite gate** before Dual Run code lands.

---

## Stage map

| Stage | Name | Primary deliverable |
|-------|------|---------------------|
| 0 | Architecture | Docs DoD (this folder) |
| 1 | Agent | .NET Host + Printing module |
| 2 | Backend | `/api/agent/v1` + WS + schema extend + naming |
| 3 | Frontend | Sasist Agent UI, dialogs, diagnostics |
| 4 | Migration | Flags, Dual Run ops, cutover |
| 5 | Cleanup | Remove QZ, Python agent, legacy names |

---

## Stage 0 — Architecture

### Exit criteria (Definition of Done)

- [x] `ARCHITECTURE.md` — Core, modules, Module Bus, lifecycle, dependency rules  
- [x] `openapi-v1.yaml` — register, authenticate, heartbeat, capabilities, diagnostics, jobs, logs, updates, config  
- [x] `ws-protocol-v1.md` — full message catalog with payloads / examples / required / optional  
- [x] `plugin-sdk.md` — `IAgentModule` + lifecycle  
- [x] `device.md` — universal device model  
- [x] `diagnostics.md` — checks, severity INFO/WARNING/ERROR, response format  
- [x] `update.md` — update, rollback, stable/beta  
- [x] `security.md` — auth, refresh, encryption, signing, replay, rate limits  
- [x] `versioning.md` — protocol_version, min supported, deprecation  
- [x] ADR-001 … ADR-005  
- [x] `migration.md` (this file)  
- [x] Stakeholder **freeze** of protocol v1 — recorded **2026-07-27** (user: `freeze v1`)

**Protocol v1 is FROZEN.** Etap 1 (.NET Host) may start. Breaking changes require `protocol_version = 2` + new docs (see [versioning.md](./versioning.md)).

---

## Stage 1 — .NET Agent

### Work

- Scaffold `sasist-agent` Host + Printing  
- Parity: register, heartbeat, PDF print, tray, service, signed update path  
- Then: ZPL/RAW, device health best-effort, diagnostics, WS client  

### Exit criteria

- [x] Solution `sasist-agent/` scaffolds Host + SDK + Printing (2026-07-27)
- [x] Compat path: register / heartbeat / poll / PDF print against `/api/printing`
- [x] Diagnostics CLI (`dotnet run … -- diagnostics`)
- [x] Driver abstraction (`IPrintDriver`: Pdf / Zpl / Raw / Html scaffold)
- [x] ZPL + RAW via Windows RAW spooler
- [x] Heartbeat `supported_formats` + backend capability gate
- [x] Warehouse flag `prefer_sasist_agent` + QZ migration map (TODOs, no rewire)
- [ ] Installer deploys Service `SasistAgent` + autostart (later)
- [ ] Production pilot smoke (PDF + ZPL on real Zebra)
- [ ] FE rewire QZ behind flag (Etap migracji — map only for now)
- [ ] Update check + signature verify (Velopack — later)

---

## Stage 2 — Backend

### Work

- Implement `/api/agent/v1` per OpenAPI  
- WS gateway per `ws-protocol-v1.md`  
- Extend DB (`protocol_version`, modules snapshot, device health, job formats)  
- Rename user-facing Cloud/Sellasist → Sasist Agent  
- Keep `/api/printing/*` as protocol 0  

### Exit criteria

- [ ] Protocol negotiation rejects unsupported versions with 426  
- [ ] Job formats pdf/html/zpl/raw accepted end-to-end for pdf (+ zpl if agent ready)  
- [ ] WS push job to online agent; poll fallback still works  
- [ ] Log upload + diagnostics store APIs work  
- [ ] Update metadata endpoints serve .NET packages  
- [ ] Compatibility tests: Python agent still green on protocol 0  

---

## Stage 3 — Frontend

### Work

- Settings section **Sasist Agent**  
- Print dialog naming + capability gating  
- Agent download / status / diagnostics from ERP  
- Migrate label/return print paths off QZ onto agent jobs where possible  

### Exit criteria

- [ ] No user-visible “Sellasist Cloud Print” / “Cloud Print” in printing flows  
- [ ] Offline agent → dialog still offers browser/PDF  
- [ ] ERP can request diagnostics + fetch logs  
- [ ] QZ paths behind feature flag or removed from primary UX  

---

## Stage 4 — Dual Run → Feature Flags → Cutover

```
Python Agent ──┐
               ├── same tenant / warehouse (different machines OK)
.NET Agent   ──┘
```

### Feature flags (examples)

| Flag | Purpose |
|------|---------|
| `agent.protocol_v1` | Enable `/api/agent/v1` + WS for tenants |
| `agent.prefer_dotnet_download` | UI offers .NET installer first |
| `print.qz_enabled` | Legacy QZ (default off after label migration) |
| `print.require_agent_online` | Existing cloud-capability behavior |

### Dual Run exit criteria

- [ ] ≥1 production pilot warehouse on .NET for 2 weeks  
- [ ] Error rate .NET ≤ Python baseline  
- [ ] Zero data loss on defaults / printer ids  

### Cutover exit criteria

- [ ] All production warehouses instructed to .NET  
- [ ] `prefer_dotnet_download=true` globally  
- [ ] Python agent release marked deprecated; tray shows upgrade CTA  
- [ ] QZ usage metrics ≈ 0  
- [ ] `min_protocol_version` plan set to `1` on date T  

---

## Stage 5 — Cleanup / Final Cutover (Agent product)

**Status (2026-07-27): Agent release cutover DONE for shipping path.**

### Done

- [x] Official installer = `SasistAgentSetup.exe` from `sasist-agent`
- [x] Root `installer/build.ps1` + `release.ps1` + CI `sasist-agent-release.yml` use .NET only
- [x] Backend download resolves `SasistAgentSetup*` (compat fallback: `SasistPrinterAgent-Setup*`)
- [x] Frontend „Pobierz Sasist Agent” uses API download-info → new asset
- [x] Python tree moved to `legacy/sasist-printer-agent` (**LEGACY — DO NOT USE**)

### Remaining (not Agent release; separate cleanup)

- [ ] Remove QZ client + `/qz` API when metrics allow  
- [ ] Physical delete of `legacy/sasist-printer-agent` after one green production release of .NET Setup  
- [ ] Optional rename tables → `edge_*`  
- [ ] `min_protocol_version` raise when fleet migrated  

### Legacy Migration

Older PCs with Python agent (`SasistPrinterAgent`) may still download a historical GitHub asset if the latest release only has the legacy filename — backend keeps a **compatibility prefix**. New releases must publish `SasistAgentSetup.exe`.

---

## Rollback principles (any stage)

- Dual Run allows instant traffic stay on Python machines  
- Feature flags disable WS / v1 without DB downgrade  
- Updater rollback for bad .NET builds ([update.md](./update.md))  
- Never delete `print_jobs` history in Cleanup  

---

## Naming cutover checklist

| Old | New |
|-----|-----|
| Sellasist Cloud Print / Sasist Cloud Print | Sasist Agent |
| Sellasist Print Agent / Sasist Printer Agent | Sasist Agent |
| QZ Tray (primary path) | removed after Stage 5 |
| `%ProgramFiles%\Sasist\PrinterAgent` | `%ProgramFiles%\Sasist\Agent` |
