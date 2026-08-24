# Current context

## Active: inventory_management_mode MODEL B phase 1 (2026-08-24)

- **Decision:** Controlled WMS Exception — terminal WMS never blocked by policy.
- **Modes:** `DOCUMENTS_ONLY` | `DIRECT_OPERATIONS` (UI); `HYBRID` → runtime alias DIRECT_OPERATIONS.
- **SSOT:** `backend/services/inventory_management_policy_service.py`
- **Toggle:** `allow_manual_warehouse_document_execution` column added; UI inactive until FSW phase 2 (`FULL_MANUAL_WAREHOUSE_DOCUMENT_FSW_READY=False`).
- **Default new warehouse:** DIRECT_OPERATIONS.
- OWR/RZ independent of this policy.

## Next

- Phase 2 FSW: WZ/PZ-first ↔ WMS resolver; then enable toggle in UI.
