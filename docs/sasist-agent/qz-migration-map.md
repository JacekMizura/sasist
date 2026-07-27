# QZ Tray → Sasist Agent migration map

**Status:** First cutover live behind `prefer_sasist_agent` (PrintingRouter).  
**Gate:** prefer flag + online agent with **`zpl`** capability; job payload for Z-PZ/return is still **PDF**.

---

## Cut over (via PrintingRouter)

| Module | Entry | Behaviour when flag ON + zpl |
|--------|-------|------------------------------|
| Z-PZ | `printZPzLabel` → `executePdfLabelPrint` | Queue PDF to label default printer |
| Return Labels | `printReturnLabel` → `executePdfLabelPrint` | Same |
| LabelPrintQueue | `handlePrint` → `resolvePrintRoute` then queue | Telemetry + agent gate; queue unchanged |

Rollback: `prefer_sasist_agent = false` → next call uses QZ/browser (no restart).

---

## Still using QZ (kept intentionally)

| Location | Role | Stage 5 Cleanup |
|----------|------|-----------------|
| `frontend/src/printing/qzService.ts` | QZ client | Delete module |
| `frontend/src/printing/router/executePdfLabelPrint.ts` | QZ fallback inside router | Remove `printViaQz` |
| `frontend/src/pages/LabelSystem/LabelPrintQueue.tsx` | QZ connect + list printers (UI) | Agent-only printer list |
| `backend/api/qz.py` | `/qz/sign` placeholder | Delete router |
| Settings „QZ (legacy)” tab | Legacy printers | Hide/remove |
| `PrintMethodDialog` QZ tile | Emergency method | Remove option |

---

## Remaining blockers to delete QZ Tray

1. Production pilot metrics (`printed_via_agent` ≫ `printed_via_qz`)
2. All warehouses on prefer flag + .NET agents with zpl
3. LabelPrintQueue printer discovery without QZ
4. Remove qz-tray.js script from HTML if any
5. Etap 5 code deletion

---

## Telemetry keys (`sessionStorage` / `getPrintTelemetry()`)

`printed_via_agent`, `printed_via_qz`, `printed_via_browser`, `printed_via_pdf`, `rollback_count`, `unsupported_capability`, `fallback_reason.*`
