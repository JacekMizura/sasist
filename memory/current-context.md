# current-context

## Active

**Szablony** = kategoria sidebar (flyout jak Magazyn), nie hub z zakładkami.

- `/templates/labels` — Szablony etykiet
- `/templates/print` — Szablony wydruków
- `/templates/messages` — Szablony wiadomości
- `/templates/exports` — Eksporty

Każdy moduł ma własny PageHeader i własne zakładki wewnętrzne. Brak `TemplatesHubLayout`.

**Szablony wydruków** współdzielą komponenty Label System:

- `ReadyTemplateCard`, `READY_TEMPLATES_GRID_CLASS`, `TemplateListRow`
- Filtry: `ListFilterEmbeddedShell` / `FilterPanelBodyWithActions`
