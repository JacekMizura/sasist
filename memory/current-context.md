# current-context

## Active

Fix **„Oznacz jako czeka”** (waiting_for_stock):

- `compute_line_missing_qty` nie odejmuje już waiting — brak operacyjny zostaje
- `picked_quantity_final` nie dopycha do „Zebrano” przy fladze czeka
- Log aktywności: actor = operator (nie System), komunikat z nazwą produktu
- UI: badge CZEKA / OCZEKUJE na karcie produktu i w Braki WMS

## Constraints

- Bez zmiany API request/response i bez nowego modelu zbierania
- SSOT lifecycle nadal `RecoveryWorkflowService`
