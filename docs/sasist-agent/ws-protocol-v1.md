# Sasist Agent — WebSocket Protocol v1

> **Status: Planned** — not implemented in RC runtime. RC uses HTTPS poll (`CompatPrintingTransport`).  
> This document freezes the **future** WSS contract.

**Endpoint (Planned):** `wss://{host}/api/agent/v1/ws`  
**Protocol version field:** `v: 1` (envelope) + agent `protocol_version: 1`  
**Transport:** TLS required. Text frames, JSON UTF-8.

Related: [openapi-v1.yaml](./openapi-v1.yaml), [security.md](./security.md), [RC-1.0.md](./RC-1.0.md)

---

## 1. Connection

1. Agent opens WSS.
2. Within 10s agent sends `CONNECTED` (auth inside payload) **or** presents `Authorization: Bearer <access_token>` header if the stack allows.
3. Server replies with `CONNECTED` ack (`ok: true`) or `ERROR`.
4. Heartbeats run over WS (`HEARTBEAT`) in addition to optional HTTPS fallback.

### Envelope (all messages)

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `v` | yes | int | Wire schema version (`1`) |
| `type` | yes | string | Message type (UPPER_SNAKE) |
| `id` | yes | string (uuid) | Message id (ack / dedupe) |
| `ts` | yes | string (ISO-8601) | Client or server timestamp |
| `module` | no | string \| null | Owning module (`printing`, …); null for core |
| `correlation_id` | no | string | Ties request/response or job flow |
| `payload` | yes | object | Type-specific body |

```json
{
  "v": 1,
  "type": "HEARTBEAT",
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "ts": "2026-07-27T07:00:00.000Z",
  "module": null,
  "correlation_id": null,
  "payload": {}
}
```

### Direction legend

- **A→E** Agent → ERP  
- **E→A** ERP → Agent  

---

## 2. Message catalog

### CONNECTED

**Directions:** A→E (auth hello), E→A (welcome / reject)

#### A→E payload

| Field | Required | Type |
|-------|----------|------|
| `access_token` | yes* | string |
| `protocol_version` | yes | int |
| `agent_version` | yes | string |
| `machine_id` | yes | string |
| `agent_id` | no | int |

\*Required if not authenticated via HTTP header.

```json
{
  "v": 1,
  "type": "CONNECTED",
  "id": "11111111-1111-1111-1111-111111111111",
  "ts": "2026-07-27T07:00:00.000Z",
  "module": null,
  "payload": {
    "access_token": "sat_…",
    "protocol_version": 1,
    "agent_version": "1.0.0",
    "machine_id": "WIN-DESKTOP-A1B2",
    "agent_id": 42
  }
}
```

#### E→A payload

| Field | Required | Type |
|-------|----------|------|
| `ok` | yes | bool |
| `agent_id` | if ok | int |
| `protocol_version` | yes | int |
| `server_time` | yes | string |
| `session_id` | if ok | string |
| `features` | no | string[] |
| `error_code` | if !ok | string |
| `error_message` | if !ok | string |

```json
{
  "v": 1,
  "type": "CONNECTED",
  "id": "22222222-2222-2222-2222-222222222222",
  "ts": "2026-07-27T07:00:00.050Z",
  "module": null,
  "correlation_id": "11111111-1111-1111-1111-111111111111",
  "payload": {
    "ok": true,
    "agent_id": 42,
    "protocol_version": 1,
    "server_time": "2026-07-27T07:00:00.050Z",
    "session_id": "ws_9f3a",
    "features": ["jobs.push", "diagnostics.remote", "updates.signal"]
  }
}
```

---

### HEARTBEAT

**Directions:** A→E (status), E→A (optional pong / config hint)

#### A→E payload

| Field | Required | Type |
|-------|----------|------|
| `protocol_version` | yes | int |
| `agent_version` | yes | string |
| `connection_mode` | yes | `ws` \| `poll` \| `mixed` |
| `modules` | no | ModuleInfo[] |
| `device_count` | no | int |
| `last_error` | no | string \| null |

```json
{
  "v": 1,
  "type": "HEARTBEAT",
  "id": "33333333-3333-3333-3333-333333333333",
  "ts": "2026-07-27T07:00:30.000Z",
  "module": null,
  "payload": {
    "protocol_version": 1,
    "agent_version": "1.0.0",
    "connection_mode": "ws",
    "device_count": 3,
    "modules": [
      {
        "module_id": "printing",
        "module_version": "1.0.0",
        "state": "running",
        "capabilities": ["print.pdf", "print.zpl"]
      }
    ],
    "last_error": null
  }
}
```

#### E→A payload (optional ack)

| Field | Required | Type |
|-------|----------|------|
| `server_time` | yes | string |
| `config_version` | no | string |
| `update_available` | no | bool |

```json
{
  "v": 1,
  "type": "HEARTBEAT",
  "id": "44444444-4444-4444-4444-444444444444",
  "ts": "2026-07-27T07:00:30.020Z",
  "module": null,
  "correlation_id": "33333333-3333-3333-3333-333333333333",
  "payload": {
    "server_time": "2026-07-27T07:00:30.020Z",
    "config_version": "cfg-17",
    "update_available": false
  }
}
```

---

### JOB_CREATED

**Direction:** E→A

| Field | Required | Type |
|-------|----------|------|
| `job_id` | yes | int |
| `module_id` | yes | string |
| `job_type` | yes | string |
| `format` | yes | `pdf` \| `html` \| `zpl` \| `raw` |
| `device_local_id` | yes | string |
| `copies` | no | int (default 1) |
| `document_type` | no | string |
| `document_id` | no | int \| null |
| `payload_uri` | no | string |
| `payload_inline` | no | string \| null |
| `options` | no | object |

```json
{
  "v": 1,
  "type": "JOB_CREATED",
  "id": "55555555-5555-5555-5555-555555555555",
  "ts": "2026-07-27T07:01:00.000Z",
  "module": "printing",
  "payload": {
    "job_id": 1001,
    "module_id": "printing",
    "job_type": "pdf",
    "format": "pdf",
    "device_local_id": "Zebra ZD420",
    "copies": 1,
    "document_type": "wz",
    "document_id": 880,
    "payload_uri": "/api/agent/v1/jobs/1001/payload",
    "payload_inline": null,
    "options": {}
  }
}
```

Agent must ACK by claiming via HTTPS `POST /jobs/{id}/claim` or by sending `JOB_STATUS` with `status: "processing"`.

---

### JOB_CANCELLED

**Direction:** E→A

| Field | Required | Type |
|-------|----------|------|
| `job_id` | yes | int |
| `reason` | no | string |

```json
{
  "v": 1,
  "type": "JOB_CANCELLED",
  "id": "66666666-6666-6666-6666-666666666666",
  "ts": "2026-07-27T07:01:10.000Z",
  "module": "printing",
  "payload": {
    "job_id": 1001,
    "reason": "User cancelled from ERP queue"
  }
}
```

---

### JOB_STATUS

**Direction:** A→E (also allowed E→A only for mirrored admin state — optional; v1 primary is A→E)

| Field | Required | Type |
|-------|----------|------|
| `job_id` | yes | int |
| `status` | yes | `processing` \| `printed` \| `failed` \| `cancelled` |
| `error_code` | if failed | string \| null |
| `error_message` | if failed | string \| null |
| `metrics` | no | object |

```json
{
  "v": 1,
  "type": "JOB_STATUS",
  "id": "77777777-7777-7777-7777-777777777777",
  "ts": "2026-07-27T07:01:05.000Z",
  "module": "printing",
  "correlation_id": "55555555-5555-5555-5555-555555555555",
  "payload": {
    "job_id": 1001,
    "status": "printed",
    "error_code": null,
    "error_message": null,
    "metrics": { "duration_ms": 842 }
  }
}
```

HTTPS `POST /jobs/{id}/status` is equivalent; agent should not double-report without idempotency (`id` / server dedupe by job+status+finished).

---

### DEVICE_CHANGED

**Direction:** A→E — inventory add/remove/rename

| Field | Required | Type |
|-------|----------|------|
| `change` | yes | `added` \| `removed` \| `updated` |
| `device` | yes | Device object ([device.md](./device.md)) |

```json
{
  "v": 1,
  "type": "DEVICE_CHANGED",
  "id": "88888888-8888-8888-8888-888888888888",
  "ts": "2026-07-27T07:02:00.000Z",
  "module": "printing",
  "payload": {
    "change": "added",
    "device": {
      "local_id": "Brother QL-820NWB",
      "display_name": "Brother biurko",
      "device_kind": "printer",
      "module_id": "printing",
      "is_active": true,
      "is_default": false,
      "capabilities": ["label", "network"],
      "health": { "online": true, "status": "ok" }
    }
  }
}
```

---

### DEVICE_STATUS

**Direction:** A→E — health-only update

| Field | Required | Type |
|-------|----------|------|
| `local_id` | yes | string |
| `module_id` | yes | string |
| `health` | yes | DeviceHealth |

```json
{
  "v": 1,
  "type": "DEVICE_STATUS",
  "id": "99999999-9999-9999-9999-999999999999",
  "ts": "2026-07-27T07:02:30.000Z",
  "module": "printing",
  "payload": {
    "local_id": "Zebra ZD420",
    "module_id": "printing",
    "health": {
      "online": false,
      "status": "error",
      "paper": "empty",
      "toner": "unknown",
      "queue_depth": 2,
      "message": "Out of paper",
      "checked_at": "2026-07-27T07:02:29.000Z"
    }
  }
}
```

---

### LOG_UPLOAD

**Directions:** E→A (request), A→E (result / progress)

#### E→A — request

| Field | Required | Type |
|-------|----------|------|
| `request_id` | yes | string (uuid) |
| `reason` | no | string |
| `max_bytes` | no | int |

```json
{
  "v": 1,
  "type": "LOG_UPLOAD",
  "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "ts": "2026-07-27T07:03:00.000Z",
  "module": null,
  "payload": {
    "request_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "reason": "Support ticket #1821",
    "max_bytes": 5242880
  }
}
```

#### A→E — completed notice (bytes via HTTPS multipart)

| Field | Required | Type |
|-------|----------|------|
| `request_id` | yes | string |
| `ok` | yes | bool |
| `artifact_id` | if ok | string |
| `error_message` | if !ok | string |

```json
{
  "v": 1,
  "type": "LOG_UPLOAD",
  "id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
  "ts": "2026-07-27T07:03:12.000Z",
  "module": null,
  "correlation_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "payload": {
    "request_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "ok": true,
    "artifact_id": "log_01H…"
  }
}
```

---

### DIAGNOSTICS_REQUEST

**Direction:** E→A

| Field | Required | Type |
|-------|----------|------|
| `run_id` | yes | string (uuid) |
| `include_modules` | no | string[] |
| `run_print_test` | no | bool (default false) |

```json
{
  "v": 1,
  "type": "DIAGNOSTICS_REQUEST",
  "id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
  "ts": "2026-07-27T07:04:00.000Z",
  "module": null,
  "payload": {
    "run_id": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
    "include_modules": ["printing"],
    "run_print_test": false
  }
}
```

---

### DIAGNOSTICS_RESULT

**Direction:** A→E

| Field | Required | Type |
|-------|----------|------|
| `run_id` | yes | string |
| `overall_status` | yes | `pass` \| `fail` |
| `checks` | yes | DiagnosticsCheck[] |
| `started_at` | yes | string |
| `finished_at` | yes | string |

See [diagnostics.md](./diagnostics.md) for check ids and severity (`INFO` / `WARNING` / `ERROR`).

```json
{
  "v": 1,
  "type": "DIAGNOSTICS_RESULT",
  "id": "ffffffff-ffff-ffff-ffff-ffffffffffff",
  "ts": "2026-07-27T07:04:08.000Z",
  "module": null,
  "correlation_id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
  "payload": {
    "run_id": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
    "overall_status": "pass",
    "started_at": "2026-07-27T07:04:00.100Z",
    "finished_at": "2026-07-27T07:04:07.900Z",
    "checks": [
      {
        "id": "api.https",
        "title": "Połączenie z API",
        "severity": "INFO",
        "status": "pass",
        "message": "HTTP 200",
        "duration_ms": 120
      }
    ]
  }
}
```

---

### UPDATE_AVAILABLE

**Direction:** E→A

| Field | Required | Type |
|-------|----------|------|
| `channel` | yes | `stable` \| `beta` |
| `version` | yes | string |
| `mandatory` | yes | bool |
| `release_notes_url` | no | string |
| `package` | no | object (`url`, `sha256`, `signature`, `size_bytes`) |

```json
{
  "v": 1,
  "type": "UPDATE_AVAILABLE",
  "id": "10101010-1010-1010-1010-101010101010",
  "ts": "2026-07-27T08:00:00.000Z",
  "module": null,
  "payload": {
    "channel": "stable",
    "version": "1.1.0",
    "mandatory": false,
    "release_notes_url": "https://…/releases/1.1.0",
    "package": {
      "url": "https://…/SasistAgent-1.1.0-win-x64.nupkg",
      "sha256": "…",
      "signature": "…",
      "size_bytes": 42000000
    }
  }
}
```

---

### UPDATE_START

**Directions:** A→E (agent begins), E→A (optional remote trigger)

#### A→E

| Field | Required | Type |
|-------|----------|------|
| `version` | yes | string |
| `channel` | yes | `stable` \| `beta` |
| `triggered_by` | yes | `user` \| `schedule` \| `remote` \| `mandatory` |

```json
{
  "v": 1,
  "type": "UPDATE_START",
  "id": "12121212-1212-1212-1212-121212121212",
  "ts": "2026-07-27T08:01:00.000Z",
  "module": null,
  "payload": {
    "version": "1.1.0",
    "channel": "stable",
    "triggered_by": "schedule"
  }
}
```

#### E→A (remote start — only if server capability `updates.remote` and policy allows)

| Field | Required | Type |
|-------|----------|------|
| `version` | yes | string |
| `channel` | yes | `stable` \| `beta` |
| `force` | no | bool |

---

### UPDATE_FINISHED

**Direction:** A→E

| Field | Required | Type |
|-------|----------|------|
| `ok` | yes | bool |
| `from_version` | yes | string |
| `to_version` | yes | string |
| `channel` | yes | `stable` \| `beta` |
| `rolled_back` | no | bool |
| `error_message` | if !ok | string |

```json
{
  "v": 1,
  "type": "UPDATE_FINISHED",
  "id": "13131313-1313-1313-1313-131313131313",
  "ts": "2026-07-27T08:03:00.000Z",
  "module": null,
  "correlation_id": "12121212-1212-1212-1212-121212121212",
  "payload": {
    "ok": true,
    "from_version": "1.0.0",
    "to_version": "1.1.0",
    "channel": "stable",
    "rolled_back": false
  }
}
```

---

### ERROR

**Directions:** both

| Field | Required | Type |
|-------|----------|------|
| `code` | yes | string |
| `message` | yes | string |
| `retryable` | no | bool |
| `details` | no | object |

```json
{
  "v": 1,
  "type": "ERROR",
  "id": "14141414-1414-1414-1414-141414141414",
  "ts": "2026-07-27T07:00:01.000Z",
  "module": null,
  "correlation_id": "11111111-1111-1111-1111-111111111111",
  "payload": {
    "code": "AUTH_INVALID",
    "message": "Access token expired",
    "retryable": true,
    "details": { "hint": "refresh_token" }
  }
}
```

Common codes: `AUTH_INVALID`, `PROTOCOL_UNSUPPORTED`, `RATE_LIMITED`, `JOB_NOT_FOUND`, `INTERNAL`.

---

## 3. Reliability

| Rule | Detail |
|------|--------|
| Ack | Use `correlation_id` = peer `id` on responses |
| Dedupe | Receivers ignore duplicate `id` for 10 minutes |
| Reconnect | Exponential backoff 1s…60s + jitter; after CONNECTED, request pending jobs via HTTPS poll once |
| Size | Max frame 1 MiB; large payloads use HTTPS |
| Ordering | Per-job status must be monotonic; out-of-order terminal status rejected |

---

## 4. Mapping to HTTPS

| WS | HTTPS equivalent |
|----|------------------|
| HEARTBEAT | `POST /agents/heartbeat` |
| JOB_CREATED | appears in `GET /jobs/pending` |
| JOB_STATUS | `POST /jobs/{id}/status` |
| DIAGNOSTICS_RESULT | `POST /agents/diagnostics/run` |
| LOG_UPLOAD (bytes) | `POST /agents/logs/upload` |
| UPDATE_AVAILABLE | `GET /agents/updates/check` |
