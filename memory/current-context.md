# current-context

## Active

**FINAL PRE-COMMIT AUDIT Etap A+B PASS** — lokalne commity OK, **bez push**, bez Etapu 3.

### Repair safety (naprawione w audycie)
`repair_layout_service_faces` tylko dla legacy **FRONT+0**; jawny SSOT nie jest nadpisywany.
Trigger: `save_layout` (eligibility-gated). Idempotent po pierwszym repair.

### WH1 (lokalna kopia prod geometrii) AFTER
RESOLVED 274 / AMBIGUOUS 0 / BLOCKED 3 (S1) / NO_RACK 2 / wrong-side 0.
Second save+recompute identical.
B4+C4 route: 43.10→32.4762 m (10→8 hops), uses edge 5688e955.

### Preferencja
Bez push. Bez Etapu 3.
