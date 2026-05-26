"""
Automatyczna ocena replenishment po zmianie ``Inventory``.

Wywoływane po ``commit`` w osobnej sesji — nie zagnieżdżamy flushów w trasie MM.
"""

from __future__ import annotations

import logging
from typing import Any, FrozenSet, Set

from sqlalchemy import event, inspect as sa_inspect
from sqlalchemy.orm import Session as OrmSession

from ..database import SessionLocal

_log = logging.getLogger(__name__)

_INV_TOUCH_KEY = "_repl_inventory_touch_pairs"
_INSTALLED = False


def _touch_key(inv: Any) -> tuple[int, int, int]:
    return (int(inv.tenant_id), int(inv.warehouse_id), int(inv.product_id))


def _inventory_attrs_materially_changed(inv: Any) -> bool:
    ist = sa_inspect(inv)
    for attr_name in ("quantity", "location_id", "warehouse_id", "product_id"):
        hist = getattr(ist.attrs, attr_name).history
        if hist.has_changes():
            return True
    return False


def _before_flush_inventory_touches(session: OrmSession, _flush_context, _instances) -> None:
    from ..models.inventory import Inventory

    s: Set[tuple[int, int, int]] = session.info.setdefault(_INV_TOUCH_KEY, set())

    for obj in list(session.new):
        if isinstance(obj, Inventory):
            s.add(_touch_key(obj))

    for obj in list(session.dirty):
        if isinstance(obj, Inventory) and _inventory_attrs_materially_changed(obj):
            s.add(_touch_key(obj))

    del_attr = getattr(session, "deleted", None)
    if del_attr is not None:
        for obj in list(del_attr):  # type: ignore[arg-type]
            if isinstance(obj, Inventory):
                s.add(_touch_key(obj))


def _after_commit_inventory_replenishment(session: OrmSession) -> None:
    keys: FrozenSet[tuple[int, int, int]] | None = session.info.pop(_INV_TOUCH_KEY, None)
    if not keys:
        return
    pairs = tuple(keys)

    sess = SessionLocal()
    try:
        from .wms_replenishment_service import evaluate_replenishment_for_product as _eval

        for tid, wid, pid in pairs:
            try:
                _eval(sess, tid, wid, pid)
            except Exception:
                _log.exception(
                    "evaluate_replenishment_for_product failed",
                    extra={
                        "tenant_id": tid,
                        "warehouse_id": wid,
                        "product_id": pid,
                    },
                )
        sess.commit()
    except Exception:
        sess.rollback()
        _log.exception("replenishment automation commit failed")
    finally:
        sess.close()


def install_replenishment_listeners() -> None:
    global _INSTALLED
    if _INSTALLED:
        return
    _INSTALLED = True

    event.listen(OrmSession, "before_flush", _before_flush_inventory_touches)
    event.listen(OrmSession, "after_commit", _after_commit_inventory_replenishment)
