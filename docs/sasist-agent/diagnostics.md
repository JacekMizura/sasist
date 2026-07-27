# Sasist Agent — Diagnostics Specification

Related: [ws-protocol-v1.md](./ws-protocol-v1.md), [plugin-sdk.md](./plugin-sdk.md), [openapi-v1.yaml](./openapi-v1.yaml)

---

## 1. Goals

Operator (tray **Diagnostyka**) or ERP can run a structured self-test.

- Non-destructive by default  
- Optional destructive checks (test page) only when explicitly requested  
- Results visible locally and uploadable to ERP  

---

## 2. Severity levels

| Level | Meaning | Effect on `overall_status` |
|-------|---------|----------------------------|
| `INFO` | Informational / success detail | fail only if `status=fail` |
| `WARNING` | Degraded but usable | does **not** force overall fail |
| `ERROR` | Blocking problem | any `status=fail` with ERROR → overall `fail` |

Each check has:

- `severity` — how serious a **failure** of this check is  
- `status` — `pass` \| `fail` \| `skip`

Overall:

- `pass` if no check with `severity=ERROR` has `status=fail`
- else `fail`

---

## 3. Standard checks (v1)

| id | Owner | Title (PL) | Severity if fail | Destructive |
|----|-------|------------|------------------|-------------|
| `api.https` | Core | Połączenie z API | ERROR | no |
| `api.ws` | Core | WebSocket | ERROR | no |
| `api.auth` | Core | Autoryzacja / token | ERROR | no |
| `agent.version` | Core | Wersja agenta | WARNING | no |
| `agent.permissions` | Core | Uprawnienia (service, ProgramData) | ERROR | no |
| `agent.warehouse` | Core | Połączenie z magazynem (binding) | ERROR | no |
| `agent.config` | Core | Konfiguracja lokalna | WARNING | no |
| `printing.devices` | Printing | Wykryte drukarki | WARNING if 0; ERROR if spooler dead | no |
| `printing.spooler` | Printing | Spooler Windows | ERROR | no |
| `printing.test_page` | Printing | Test wydruku | ERROR | **yes** |

Future modules add `scanner.*`, `scale.*`, etc. via `CollectDiagnosticsAsync`.

---

## 4. Response format

```json
{
  "run_id": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
  "started_at": "2026-07-27T07:04:00.100Z",
  "finished_at": "2026-07-27T07:04:07.900Z",
  "overall_status": "pass",
  "agent_version": "1.0.0",
  "protocol_version": 1,
  "checks": [
    {
      "id": "api.https",
      "title": "Połączenie z API",
      "severity": "INFO",
      "status": "pass",
      "message": "HTTPS OK (142 ms)",
      "duration_ms": 142
    },
    {
      "id": "api.ws",
      "title": "WebSocket",
      "severity": "INFO",
      "status": "pass",
      "message": "CONNECTED ok",
      "duration_ms": 88
    },
    {
      "id": "printing.devices",
      "title": "Wykryte drukarki",
      "severity": "WARNING",
      "status": "pass",
      "message": "3 urządzenia",
      "duration_ms": 40
    },
    {
      "id": "printing.test_page",
      "title": "Test wydruku",
      "severity": "ERROR",
      "status": "skip",
      "message": "Pominięto (brak zgody na test destrukcyjny)",
      "duration_ms": 0
    }
  ]
}
```

### Check object

| Field | Required | Type |
|-------|----------|------|
| `id` | yes | string |
| `title` | yes | string |
| `severity` | yes | `INFO` \| `WARNING` \| `ERROR` |
| `status` | yes | `pass` \| `fail` \| `skip` |
| `message` | no | string |
| `duration_ms` | no | int |

Note: successful checks often use `severity: INFO` (informational). The severity column in the catalog is the severity **assigned to the check definition** when evaluating failures; implementations may set `severity` on the result to the check’s catalog severity always (recommended for ERP filtering).

**Recommended rule:** always emit the catalog severity on the result row; UI maps icons from `status` + `severity`.

---

## 5. Triggers

| Trigger | Flow |
|---------|------|
| Tray button | Local run → show UI → optional `POST /agents/diagnostics/run` |
| ERP button | WS `DIAGNOSTICS_REQUEST` → agent runs → `DIAGNOSTICS_RESULT` + optional HTTPS store |

---

## 6. Privacy

- Diagnostics must not include secrets (tokens, API keys).  
- Log upload is separate ([security.md](./security.md)); diagnostics messages stay short.  
