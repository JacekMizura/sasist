# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.

## Latest (2026-07-19)

- **MULTI DEFAULT QUANTITY MODE:** EAN/CLICK = select product; basket scan → quantity modal; confirm → Pick +qty (live revalidate). No auto Pick on basket. Foreign series cleared on product context.
- **Packing BASKET ghost count:** active queue requires live basket custody (`a8c6ee39`).

## Notes

- Legacy unit-scan pending/series paths remain for non-context confirms; default detail path is quantity mode.
- `picking_handoff_mode` = provenance; packing queue = live custody.
