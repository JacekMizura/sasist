# current-context

## Active

**Unify Magazyn ↔ Projektowanie UI (v1)** — zakończone (bez commit/push).

### Architektura
- `WarehouseMode` = `live` | `designer` (`mainView` magazyn|layout → `mainViewToWarehouseMode`)
- `WarehouseModeProvider` + `WarehouseShell` (PageLayout + SettingsModuleStack)
- Jeden `WarehouseCanvas` + `WarehouseZoomControls` (wspólny chrome: białe tło, `p-0`)
- Thin registry: `FEATURES_BY_MODE` / `featuresForMode` (ID-y; panele nadal w Designerze)
- Routing = designer-internal `layoutWorkspace` (nie top-level mode)

### Residual (świadomie poza v1)
- Product rails Magazyn nie w `Shell.right`
- Prop `isLiveView` zostaje dla hostów poza Providerem (np. ProductLocationMapModal)
- Designer nadal ~4.8k linii

### Constraints
Bez commit/push (dopóki user nie poprosi).
