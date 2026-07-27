# Sasist Agent — Device Registry (Edge Device Management)

Universal device abstraction for all local hardware. **Printing is the first module — not a separate product.**

Related: [ARCHITECTURE.md](./ARCHITECTURE.md), [openapi-v1.yaml](./openapi-v1.yaml), [ADR-006](./adr/ADR-006-device-manager-and-capability-engine.md)

---

## 1. Hierarchy

```
Agent (machine / Host)
 └── Devices[]   (DeviceManager registry)
      └── CapabilityDescriptor[]
```

Core owns **DeviceManager**. Modules register **IDeviceProvider** implementations. Adding scanner/scale does **not** change Core.

---

## 2. Device identity & fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Stable local id (Windows printer name, COM path hash, …) |
| `type` | yes | See types below |
| `display_name` | yes | Operator-facing name |
| `manufacturer` | no | |
| `model` | no | |
| `serial_number` | no | |
| `driver` | no | Driver / bridge id |
| `firmware` | no | |
| `status` | yes | Monitoring status (see §5) |
| `capabilities` | yes | Structured descriptors (see §4) — **not** a bare string list |
| `last_seen` | yes | Last heartbeat / discovery stamp |
| `metadata` | no | Free-form; Core must not interpret type-specific keys |
| `module_id` | yes | Owning module (`printing`, `scanner`, …) |

Uniqueness: (`agent_id`, `module_id`, `id`).

Legacy wire field names `local_id` / `device_kind` remain valid as aliases during migration (`DeviceSnapshot` projection).

---

## 3. Device types

| `type` | Typical module | Examples |
|--------|----------------|----------|
| `printer` | `printing` | A4, Zebra ZPL, Brother, Epson, ESC/POS |
| `scanner` | `scanner` | USB HID, keyboard wedge, serial barcode |
| `scale` | `scale` | Serial / USB scales |
| `camera` | `camera` | USB / RTSP |
| `rfid` | `rfid` | Fixed / handheld |
| `usb` | `usb` | Generic USB bridge |
| `serial` | `serial` | RS-232/COM bridge |
| `custom` | any | Tenant adapters |

**Backend rule:** handlers and DeviceManager must not contain `switch(type)` business logic. Filtering by `type` query param is allowed; domain behavior lives in modules.

---

## 4. Capability Engine

Each device publishes **CapabilityDescriptor**:

```json
{
  "name": "Printer",
  "version": "1",
  "supported_operations": [
    "print_pdf",
    "print_zpl",
    "print_raw",
    "copies",
    "duplex",
    "color",
    "PaperStatus",
    "QueueStatus",
    "Offline"
  ],
  "limits": {
    "max_copies": 99,
    "duplex": false,
    "color": false
  }
}
```

### Future device examples

| Capability `name` | Operations (examples) |
|-------------------|------------------------|
| `Scanner` | `scan_barcode`, `scan_qr`, `wedge_keyboard` |
| `Scale` | `read_weight`, `tare`, `continuous` |
| `Camera` | `capture_still`, `stream_preview` |
| `Rfid` | `read_epc`, `inventory` |

String-token flattening (`print.zpl`, `print_zpl`) is only for **compat** heartbeats / legacy ERP columns.

---

## 5. Monitoring status

| Status | Meaning |
|--------|---------|
| `online` | Reachable / reporting |
| `offline` | Not seen / disconnected |
| `error` | Fault |
| `warning` | Degraded but usable |
| `busy` | Actively executing |
| `idle` | Ready, no work |
| `unknown` | Not yet classified |

Every device reports **status** + **last_seen** (heartbeat / discovery).

Legacy `DeviceHealth.online` + `status: ok` is derived from the operational status set.

---

## 6. DeviceManager (Core)

Responsibilities:

- Register `IDeviceProvider` from modules
- Discover / refresh inventory
- Upsert / remove / list / get
- Opaque device configuration + `OnConfigurationChangedAsync`
- Differential sync (`BuildSyncDelta` / `MarkSynced`)
- Emit device events on `IDeviceEventBus`
- Emit `module.device.changed` on ModuleBus

Printing discovers via DeviceManager; EventBus carries change notifications.

---

## 7. Persistence & sync

| Table | Role |
|-------|------|
| `edge_devices` | Authoritative device registry |
| `edge_device_events` | DeviceConnected / Changed / … |
| `edge_device_actions` | ERP → Agent remote action queue |

`POST /api/agent/devices/sync` — delta upserts/removes + events; returns pending actions.

---

## 8. Remote action contracts

| Action | Status |
|--------|--------|
| `RefreshDevices` | implemented |
| `RunDiagnostics` | implemented |
| `DownloadLogs` | implemented |
| `UpdateDeviceConfiguration` | implemented |
| `RestartModule` / `RestartAgent` / `ReloadConfiguration` / `CheckUpdates` | contract only |

ERP enqueues via `POST /api/agent/actions`; agent pulls on sync.

---

## 9. Persistence mapping

| Logical | Primary | Compat (until Cleanup) |
|---------|---------|------------------------|
| Device registry | `edge_devices` | `agent_printers` (fallback read) |
| Events | `edge_device_events` | — |
| Remote actions | `edge_device_actions` | — |
| Agent identity | `printer_agents` | rename in Etap 5 |

Other types appear when their modules ship — no fake rows.

---

## 10. Events (protocol)

- Inventory change → WS `DEVICE_CHANGED`
- Status-only → WS `DEVICE_STATUS`
- Full replace → HTTPS devices sync (protocol v1)
