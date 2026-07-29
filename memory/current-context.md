# current-context

## Active

**Stanowisko SSOT + Pakowanie (final)** — hardware config only under Ustawienia WMS → Stanowiska; packing session holds active `workstationId`; print queue/capability require session workstation + mapping (no PrintingDefault / silent QZ/browser).

Admin assigns stations via Administrator → WMS i magazyny → Stanowiska (`user_wms_workstation_access`). Operator picks station only on `/wms/packing/*` gate.
