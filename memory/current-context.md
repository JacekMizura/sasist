# current-context

## Active

**Fix GET `/api/wms/order-issue-tasks` 500** — missing `orders.picking_handoff_mode` on request-path ensure. Commit local; **do not push**.

## Exact failure

`sqlalchemy.exc.OperationalError` — `no such column: orders.picking_handoff_mode` in `_fetch_orders_by_id`.

## Not a regression from

MULTI basket `2de7345a` / `f5e881be` / `dc35db74`.

## Related

Packing handoff ORM column from `afc6843a`; startup ensure can be skipped if earlier mega-try fails — request-path now mirrors order-list pattern.
