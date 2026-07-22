# current-context

## Active

**Sprzedaż bezpośrednia — add-product 500 + 401 features/settings** — naprawione lokalnie, bez push.

- 500: `no such column: stock_document_items.requires_putaway` w `commercial_availability_service._purchase_lines_for_products` (niezależne od 401).
- 401: ten sam `get_current_user` / Bearer co reszta WMS; Network 401 często = pierwszy strzał przed refresh tokenu; FE nie maskuje już 401 jako `DEFAULT_FEATURES` / „moduł OFF”.
- Scanner: Direct Sales → `useWmsPageScanHandler` (Helper/HID → `scan` → ten sam flow co EAN).

## Preferencja commitów (user)

Komunikaty commitów po polsku, krótkie, opisujące co zrobiono.
