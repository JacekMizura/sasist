# current-context

## Active

**MULTI shortage presentation fixed** — product-lines `allocations[]` per order_item; UI shows which order/basket has shortage. Shortage write SSOT unchanged.

## Latest (2026-07-20)

- List no longer shows only `BRAK 1/9` without order/basket.
- Counter: `Braki: N szt.` (units). Cart fleet: NIEKOMPLETNE on affected order/basket.
- Prior: legacy Pick undo / location provenance still relevant for cart_id=2 recovery.

## Notes

- Do not FIFO-attribute shortage across order_items.
- No push until asked.
