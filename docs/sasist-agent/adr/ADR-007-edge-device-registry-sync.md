# ADR-007: Edge Device Registry persistence + delta sync

**Status:** Accepted  
**Date:** 2026-07-27  
**Extends:** [ADR-006](./ADR-006-device-manager-and-capability-engine.md)

## Context

DeviceManager was in-memory only. ERP needs authoritative inventory, remote configuration, diagnostics, and logs without full re-upload each heartbeat.

## Decision

1. Persist universal rows in `edge_devices` (+ `edge_device_events`, `edge_device_actions`).
2. Agent ↔ ERP sync via `POST /api/agent/devices/sync` with **differential** upserts/removes (fingerprint/`sync_revision`).
3. Opaque `DeviceConfiguration` (JSON + `configuration_version`); Core notifies `IDeviceProvider.OnConfigurationChangedAsync`.
4. Typed `IDeviceEventBus` for DeviceConnected/Changed/… (distinct from ModuleBus).
5. Implement remote actions: RefreshDevices, RunDiagnostics, DownloadLogs; queue others via `edge_device_actions`.
6. Keep `/api/printing/*` as compat; agent still heartbeats printing for job poll until Cleanup.

## Consequences

- `printer_count` is derived from device registry count on sync (legacy column).
- UI primary path: `/settings/devices`; `/settings/printers` remains for print queue/defaults.
- Scanner/Scale/Camera/RFID scaffolds exist but are not Host-registered.
