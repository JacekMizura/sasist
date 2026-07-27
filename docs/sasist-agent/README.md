# Sasist Agent — Etap 0 documentation

**Status:** Protocol **v1 FROZEN** (2026-07-27). Etap 0 complete. Etap 1 (.NET Host) unlocked.

## Index

| # | Document | Description |
|---|----------|-------------|
| 1 | [ARCHITECTURE.md](./ARCHITECTURE.md) | Core, modules, Module Bus, lifecycle, dependency rules |
| 2 | [openapi-v1.yaml](./openapi-v1.yaml) | HTTPS API v1 |
| 3 | [ws-protocol-v1.md](./ws-protocol-v1.md) | WebSocket message catalog |
| 4 | [plugin-sdk.md](./plugin-sdk.md) | `IAgentModule` + lifecycle |
| 5 | [device.md](./device.md) | Universal device model |
| 6 | [diagnostics.md](./diagnostics.md) | Diagnostics checks & severity |
| 7 | [update.md](./update.md) | Auto-update, rollback, channels |
| 8 | [security.md](./security.md) | Auth, tokens, signing, replay, rate limits |
| 9 | [versioning.md](./versioning.md) | `protocol_version`, compatibility, deprecation |
| 10 | [adr/](./adr/) | Architecture Decision Records |
| 11 | [migration.md](./migration.md) | Python → Dual Run → .NET → flags → cutover → cleanup |
| 12 | [qz-migration-map.md](./qz-migration-map.md) | QZ call sites + first cutover status |
| 13 | [smoke-cutover-labels.md](./smoke-cutover-labels.md) | Pilot smoke checklist |
| — | [FREEZE-v1.md](./FREEZE-v1.md) | Protocol freeze record |

### ADRs

- [ADR-001 Why .NET](./adr/ADR-001-why-dotnet.md)
- [ADR-002 Why WebSocket](./adr/ADR-002-why-websocket.md)
- [ADR-003 Why Module Bus](./adr/ADR-003-why-module-bus.md)
- [ADR-004 Why Device abstraction](./adr/ADR-004-why-device-abstraction.md)
- [ADR-005 Why Plugin architecture](./adr/ADR-005-why-plugin-architecture.md)

## Implementation

| Stage | Location |
|-------|----------|
| Etap 1 Host | [`../../sasist-agent/`](../../sasist-agent/) |

## Freeze gate

- **Frozen:** 2026-07-27 — decision `freeze v1`
- Wire contracts: `openapi-v1.yaml`, `ws-protocol-v1.md`, `plugin-sdk.md`, `device.md`, ADRs
- Non-breaking extensions allowed; breaking changes → `protocol_version = 2`
