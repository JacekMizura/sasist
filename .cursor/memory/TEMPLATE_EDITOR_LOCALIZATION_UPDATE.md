# Template editor localization update

Changelog for Rack Template editor UI localization to Polish.

## Translated naming strategy labels

- **Z wzorca:** description text updated from "Z wzorca (Row/Section/Bin/Level)" to **"Z wzorca (Rząd/Sekcja/Pozycja/Poziom)"** (option value `pattern` unchanged).
- **Row ID ({Row}):** label changed to **"Rząd ({Row})"**.
- **Start Section ({Section}):** label changed to **"Startowa sekcja ({Section})"**.
- **Kolumna ({Bin}):** label changed to **"Pozycja ({Bin})"** (column/bin position in Polish).

Option values for strategy (`pattern`, `rack-index`, `custom`, `manual`) and all pattern logic are unchanged.

## Translated orientation options

- **Column-first:** display text changed from "Column-first (A-1 B-1 C-1)" to **"Pierwsza kolumna (A-1 B-1 C-1)"** (`value="column-first"` unchanged).
- **Row-first:** display text changed from "Row-first (A-1 A-2 A-3)" to **"Pierwszy rząd (A-1 A-2 A-3)"** (`value="row-first"` unchanged).

## Translated bin/column terminology

- **Numeric:** display text changed from "Numeric (1, 2, 3…)" to **"Liczbowe (1, 2, 3…)"** (`value="numeric"` unchanged).
- **Alpha:** display text changed from "Alpha (A, B, C…)" to **"Alfabetyczne (A, B, C…)"** (`value="alpha"` unchanged).

## Preserved pattern tokens

- Token names in the UI and in the pattern engine are **unchanged**: `{Row}`, `{Section}`, `{Bin}`, `{Level}`.
- `warehouseUtils.expandAddressPattern` and address generation continue to use these tokens exactly as before.
- Pattern placeholder and helper line still show the same token names; only surrounding labels were localized.

## Verification

- Rack naming and address generation still use `{Row}`, `{Section}`, `{Bin}`, `{Level}`.
- Dropdown values sent to the backend remain: `pattern`, `rack-index`, `custom`, `manual`, `column-first`, `row-first`, `numeric`, `alpha`.
- Pattern preview and behaviour are unchanged.
