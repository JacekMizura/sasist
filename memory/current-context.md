# current-context

## Active

**Etap 4 — UI Modernization: Warehouse Designer** (wzorzec migracji).

### Done (Designer)
- Core chrome → Sasist UI Kit (toolbar, select, modals, routing inspectors, rails, zoom, canvas tools)
- `warehouseUiSkin` usunięty → `design-system/warehouseChrome`
- `PrimaryButton intent="warning"`, Dialog size/rootClassName
- Raport: `memory/ui-kit-designer-migration-report.md`
- Metryki scope: `node scripts/designer-ui-metrics.mjs`

### Residual in Designer scope
- `WarehouseMainView` visual editors, `TemplateCreator`, `InternalLayoutModal`, `GenerateWarehouseLayoutModal`, `RowPrefixModal` — nadal magic Tailwind

### Next (kolejność użytkownika)
1. Dokończyć residual Designera **lub**
2. **Warehouse View** (moduł 2)

### Constraints
Tylko UI; bez commit/push dopóki user nie poprosi.
