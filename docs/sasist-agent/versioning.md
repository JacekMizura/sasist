# Sasist Agent — Versioning & Compatibility

Related: [ARCHITECTURE.md](./ARCHITECTURE.md), [openapi-v1.yaml](./openapi-v1.yaml), [ws-protocol-v1.md](./ws-protocol-v1.md), [migration.md](./migration.md)

---

## 1. Version axes

| Axis | Format | Purpose |
|------|--------|---------|
| `agent_version` | SemVer (`1.2.3`) | Binary / installer releases |
| `module_version` | SemVer | Per-module implementation |
| `protocol_version` | **positive integer** | Wire contract (HTTPS + WS) |
| OpenAPI `info.version` | SemVer string | Document revision for same protocol int |

---

## 2. `protocol_version`

### Current

| Value | Meaning | Status |
|-------|---------|--------|
| `0` | Legacy `/api/printing/*` poll agent (Python Printer Agent) — **compat only** | Compat until Cleanup |
| `1` | Sasist Agent `/api/agent/v1` + WS envelope in [ws-protocol-v1.md](./ws-protocol-v1.md) | **FROZEN 2026-07-27** |

### Negotiation

Agent sends `protocol_version` on register, authenticate, heartbeat, WS `CONNECTED`.

Server maintains:

- `min_protocol_version` (currently `0` during Dual Run, later `1`)
- `max_protocol_version` (currently `1`)

If agent version ∉ `[min, max]` → HTTP 426 / WS `ERROR PROTOCOL_UNSUPPORTED` with min/max in details.

---

## 3. Compatibility rules

### Non-breaking (same `protocol_version`)

- Add optional JSON fields
- Add new capability tokens
- Add new WS message types that old agents ignore (server must not require them)
- Add new optional HTTPS endpoints

### Breaking (bump `protocol_version`)

- Remove/rename required fields
- Change status enums semantics
- Change auth scheme incompatibly
- Change WS envelope required keys
- Change job status vocabulary meaning

Clients **must ignore** unknown fields (forward compatible).  
Servers **must not** drop unknown device capability tokens (store opaquely).

---

## 4. Minimum supported versions (policy table)

Maintain in ERP config / release notes:

| Date (example) | `min_protocol_version` | Min `agent_version` stable | Notes |
|----------------|------------------------|----------------------------|-------|
| Dual Run | 0 | Python latest / .NET ≥ 1.0.0 | Both stacks |
| After cutover | 1 | 1.0.0 | Protocol 0 deprecated |
| Cleanup+90d | 1 | 1.x | Protocol 0 removed |

Exact calendar dates live in [migration.md](./migration.md) exit criteria.

---

## 5. Deprecation policy

1. **Announce** — release notes + ERP banner for deprecated protocol/agent  
2. **Deprecate** — still works; metrics tracked; docs marked deprecated  
3. **Block new** — refuse new registrations on deprecated protocol (optional)  
4. **Remove** — `min_protocol_version` raised; old endpoints return 410  

Minimum deprecate window: **90 days** for protocol majors in production, unless critical security issue (then mandatory update path).

Agent binary deprecation: support at least **N-1** stable minor for security fixes during Dual Run; after Cleanup only .NET line.

---

## 6. Document versioning

Etap 0 docs are tagged with protocol 1.  
Changes to frozen protocol 1 docs that are breaking require either:

- a new optional extension section, or  
- `protocol_version = 2` + new files (`openapi-v2.yaml`, `ws-protocol-v2.md`).
