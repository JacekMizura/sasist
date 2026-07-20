# current-context

## Active

**ANULUJ ZBIERANIE** — full MULTI session operational rollback implemented.

## Architecture (confirmed)

- `Inventory` = **location stock** (product+warehouse+location[+lot]). Global product stock = SUM(Inventory); no document PZ/PW/WZ on cancel.
- Active picking writes **draft** Pick (`picked_at IS NULL`); location stock decremented only at **finalize-cart**.
- Cancel of ASSIGNED/PICKING: delete drafts (Inventory unchanged) + session FE_MISSING by `metadata.cart_id` + cart/basket/status restore.
- Informational `put_back_required` list for physical goods still on trolley (no RETURN_TO_LOCATION subsystem).

## Notes

- Never `inspect(session.bind).has_table()` mid-transaction on SQLite — rolls back connection.
- No push until asked.
