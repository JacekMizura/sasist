# Sasist UI Kit

Jedyna dozwolona warstwa komponentów UI aplikacji.

Importuj wyłącznie z `frontend/src/design-system` (lub `../design-system`).

Żywa dokumentacja: **`/design-system`**

---

## Zasada

| Dozwolone | Zabronione |
|-----------|------------|
| Komponenty UI Kit | Lokalne buttony / inputy / cardy |
| Tokeny (`colors`, `radius`, `spacing`…) | Magiczne `rounded-xl`, `h-10`, `bg-orange-*` |
| `density="compact\|default\|comfortable"` | Trzy osobne komponenty na gęstość |
| Layoutowe `className` (`w-full`, `mt-2`) | Nowe pliki `*UiTokens.ts` poza DS |

ESLint (`sasist-ui-kit/*`) egzekwuje magiczne klasy i nowe wyspy tokenów.

---

## Kiedy który przycisk

### PrimaryButton — pomarańczowy CTA
Używaj do **jednej głównej akcji** na widoku / dialogu.

Przykłady: Zapisz, Dodaj, Nowy, Utwórz, Potwierdź.

```tsx
<PrimaryButton onClick={onSave}>Zapisz</PrimaryButton>
<PrimaryButton density="compact">Dodaj</PrimaryButton>
```

### SecondaryButton — biały + border
Akcje **pomocnicze** obok Primary, filtry, Anuluj gdy nie Ghost.

```tsx
<SecondaryButton onClick={onFilter}>Filtruj</SecondaryButton>
```

### GhostButton — bez wypełnienia
Anuluj, Reset, akcje niskiego priorytetu, toolbar tekstowy.

```tsx
<GhostButton onClick={onCancel}>Anuluj</GhostButton>
```

### DangerButton — destrukcja
Usuń, Usuń trwale, odrzuć z konsekwencją.

```tsx
<DangerButton onClick={onDelete}>Usuń</DangerButton>
```

### SuccessButton — pozytywne potwierdzenie
Zatwierdź / zakończ pozytywnie (gdy nie jest to główny CTA pomarańczowy).

```tsx
<SuccessButton onClick={onApprove}>Zatwierdź</SuccessButton>
```

### IconButton — tylko ikona
Ikony w toolbarze / wierszu listy. `tone="danger"` dla destrukcji.

```tsx
<IconButton aria-label="Edytuj" onClick={onEdit}><Pencil /></IconButton>
```

### CardButton — karta / segment chrome
Przełączniki i akcje w railach (Generuj układ, Magazyn/Sklep jako karty, Drzwi/Brama).
Dla prostych 2–3 opcji preferuj **SegmentedControl**.

```tsx
<CardButton active={mode === "wh"} onClick={() => setMode("wh")}>Magazyn</CardButton>
```

---

## Density

Jeden komponent, prop `density`:

| Wartość | Użycie |
|---------|--------|
| `compact` | Gęste tabele, sidebary |
| `default` | Filtry, formularze ERP |
| `comfortable` | Primary CTA, page actions |

Nie twórz `PrimaryButtonCompact` itd.

---

## Status

- `StatusText` — tekst bez badge (Zapisano / Nie zapisano)
- `StatusBadge` — chip (canonical ERP/admin)
- Listy operacyjne mogą używać `operationalSemanticBadges` — **ta sama geometria** co StatusBadge (Phase A); nowe UI → `StatusBadge`

Tones: `success` | `warning` | `danger` | `info` | `neutral` | `primary`

---

## List / table facet (nie osobny design system)

| Concern | Canonical |
|---------|-----------|
| Toolbar listy | `ModuleListPageToolbar` |
| Table cells | `moduleListThClass` / `moduleListTdClass` |
| Pagination footer | `moduleTablePaginationFooterClass` |
| Row actions | `OperationalActionButton` / `Link` / `Column` |
| Filter apply | `filterToolbarBtnApply` **===** Primary (orange) |

Nie dodawaj `*PrimaryButton` per moduł. Nie hardcoduj `bg-amber-600` jako CTA.

---

## Layout

```tsx
<PageHeader
  breadcrumbs={…}
  title={<h1>…</h1>}
  tabs={<Tabs>…</Tabs>}
  toolbar={<Toolbar start={…} end={…} />}
  status={<StatusText tone="success">OK</StatusText>}
  actions={<PrimaryButton>Zapisz</PrimaryButton>}
/>
```

---

## Tokeny (dark-mode ready)

Kolory **tylko** z `colors.*`. Komponenty nie hardcodują palety poza tokenami.
Dark mode nie jest zaimplementowany — gdy przyjdzie, zmieniasz tokeny, nie ekrany.

---

## Publiczny API

```ts
import {
  PrimaryButton, SecondaryButton, DangerButton, SuccessButton,
  GhostButton, IconButton, CardButton,
  Card, ListTile, MetricCard,
  SegmentedControl, SegmentedItem, Tabs, TabItem,
  Input, Select, Textarea, SearchInput,
  Checkbox, Switch, Radio,
  StatusText, StatusBadge,
  Toolbar, PageHeader,
  colors, spacing, radius, typography, shadows,
  type UiDensity,
} from "../design-system";
```

---

## Migracja fasad

| Facade | Status |
|--------|--------|
| `WarehouseCardButton` | **usunięty** → `CardButton` |
| `filterUiTokens` | legacy, warn ESLint |
| `listSellasistTokens` | legacy, warn ESLint |
| `wmsOperationalUi` | legacy, warn ESLint |
| `warehouseMaterialsUi` | legacy, warn ESLint |
| `purchasingButtonTokens` | legacy, warn ESLint |
| `panelUiStatusSettingsStyles` | legacy, warn ESLint |
| `warehouseUiSkin` | legacy, warn ESLint |
| `AppButton` | mapuje na kit; preferuj konkretne Button* |

Przy touch pliku — przepnij import i nie wracaj do fasady.

Metryki: `npm run ui-kit:metrics` · raport w `memory/ui-kit-hardening-report.md`.
