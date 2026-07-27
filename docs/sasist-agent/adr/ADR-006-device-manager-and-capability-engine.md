# ADR-006: DeviceManager + Capability Engine (Edge Device Management)

**Status:** Accepted  
**Date:** 2026-07-27  
**Supersedes / extends:** [ADR-004](./ADR-004-why-device-abstraction.md)

## Context

First cutover of Printing succeeded. Growing Printing as a standalone product would lock the agent into a printer-only registry. The product goal is an **Edge Device Management** platform: printers, scanners, scales, cameras, RFID, USB/serial.

## Decision

1. **Universal Device model** (`EdgeDevice`) with typed fields (`type`, manufacturer, model, serial, driver, firmware, status, capabilities, lastSeen, metadata).
2. **DeviceManager in Core** aggregates `IDeviceProvider` from modules — Core stays type-agnostic.
3. **CapabilityDescriptor** (`name`, `version`, `supportedOperations`, `limits`) replaces bare string lists as the primary capability model.
4. **Remote action contracts** published now; only `RefreshDevices` implemented initially.
5. **Parallel ERP APIs** `/api/agent/devices|device/{id}|modules` beside `/api/printing/*` for the migration window.
6. Printing remains the **reference module** and must enumerate hardware only through DeviceManager.

## Alternatives considered

| Option | Rejected because |
|--------|------------------|
| Keep printer-only Core | Blocks scanners/scales without Core forks |
| Type switches in backend Core | Violates “new type without Core change” |
| Capability as string[] only | Cannot express versions/limits/operations cleanly |

## Consequences

- `IDeviceRegistry` / `DeviceSnapshot` remain as **compat projections**.
- UI “Drukarki” evolves to “Urządzenia” with type filters; printer CRUD still uses printing patch endpoints.
- Physical table rename to `edge_devices` deferred to Cleanup ([migration.md](../migration.md)).
