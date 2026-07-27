# Protocol v1 — Freeze record

| Field | Value |
|-------|-------|
| Decision | `freeze v1` (wire contracts) |
| Date | 2026-07-27 |
| Architecture RC | **v1.0 Release Candidate** — see [RC-1.0.md](./RC-1.0.md) |
| `protocol_version` | `1` (declared by agent) |

## Runtime vs freeze (important)

Freeze defines **target** contracts. **RC runtime** uses:

- `/api/agent/*` device registry + sync + actions  
- `/api/printing/*` compat jobs/register/heartbeat adapter  
- HTTPS poll (no WebSocket yet)

WebSocket (`ws-protocol-v1.md`) and full `/api/agent/v1` remain **Planned**.

## Frozen artifacts

- [ARCHITECTURE.md](./ARCHITECTURE.md) (aligned to RC)
- [openapi-v1.yaml](./openapi-v1.yaml) (servers note Planned vs actual)
- [ws-protocol-v1.md](./ws-protocol-v1.md) (**Planned**)
- [plugin-sdk.md](./plugin-sdk.md)
- [device.md](./device.md)
- [security.md](./security.md) (RC vs Planned)
- ADRs including ADR-006 / ADR-007

## Change policy

- Optional fields / additive endpoints: allowed on v1  
- Breaking wire changes: new `protocol_version`
