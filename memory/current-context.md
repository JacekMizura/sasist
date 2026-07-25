# current-context

## Active

**Service Face Provenance** — committed lokalnie (na `9292c0d2`), **bez push**, bez PROD, bez Etapu 3.

### Enum
- BE: `backend/models/service_face_origin.py` → `ServiceFaceOrigin`
- FE: `ServiceFaceOrigin` w `frontend/src/types/warehouse.ts`
- Wartości: LEGACY_DEFAULT | AUTO_REPAIR | EXPLICIT

### Gates
- EXPLICIT: never repair / never reinterpret on save_layout
- AUTO_REPAIR: may recompute
- LEGACY_DEFAULT: FRONT+0 mismatch + narrow diagonal-EAST fingerprint → AUTO

### Next (tylko po OK usera)
1. Push
2. Deploy
3. Kontrolowany save WH1 (nie one-shot UUID)
