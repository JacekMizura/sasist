# current-context

## Active

**GLOBAL LAYOUT SYSTEM 2.0** — jeden biały `PageContainer` / `PageLayout` na widok ERP (header + tabs + toolbar + treść). Zagnieżdżone karty list/tabs usuwane. Logika/routing bez zmian.

### Constraints
Bez commit/push (dopóki user nie poprosi).
WMS shortage SSOT / operational boundaries bez zmian.

### SSOT
- `frontend/src/components/layout/PageContainer.tsx` (+ alias `PageLayout`)
- `frontend/src/design-system/pageLayout.ts` (`pageShell*` tokens, `p-6`)
- `TabsContainer` = divider only; `TopTabsNavigation` default `bare`
