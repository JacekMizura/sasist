# ADR-004: Why Device abstraction

**Status:** Accepted  
**Date:** 2026-07-27  
**Context:** Current model is `agent_printers` only; roadmap includes scanners, scales, cameras, RFID, USB/serial.

## Decision

Adopt a universal **Device** model (`device_kind` + `capabilities[]` + `health`) owned by modules, aggregated by Core, persisted logically as `edge_devices`.

## Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| Keep printer-only tables forever | Less migration | Second registry per device class |
| Separate microservice per device type | Isolation | Operational overhead for edge |

## Rationale

- One inventory in ERP UI (“devices on this agent”)  
- Capabilities collection is forward-compatible  
- Printing becomes `device_kind=printer` without special-casing Core  

## Consequences

- Etap 2 extends existing printer rows toward Device shape  
- WS `DEVICE_CHANGED` / `DEVICE_STATUS` are kind-agnostic  
- Physical table rename deferred to Cleanup ([migration.md](../migration.md))  
