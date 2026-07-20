# current-context

## Active

**Pakowanie lista → skan EAN** — bootstrap nie otwiera od razu „Wybierz opakowanie”; najpierw widok zamówienia (+ CTA gdy 1/1).

## Architecture (confirmed)

- List scan: `POST /wms/packing/resolve-ean/scan` (zalicza 1 szt.) → navigate z `packingScanBootstrap`.
- Order page: `applyPackingResult(..., { fromListBootstrap: true })` defer carton; CTA „Wybierz opakowanie”.
- In-order scans: nadal auto-bramka kartonu po `fully_packed`.

## Notes

- No push until asked.
