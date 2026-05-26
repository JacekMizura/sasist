"""Metadane nadpisań wyboru kartonu względem propozycji silnika."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ...models.order import Order
    from .suggestions import PackagingSuggestionDraft


def annotate_override_flags(drafts: list[PackagingSuggestionDraft], order: Order) -> None:
    """Ustawia ``overridden_by_user`` / ``auto_assigned`` na podstawie ``orders.selected_carton_id``."""
    sel_raw = getattr(order, "selected_carton_id", None)
    sel = str(sel_raw).strip() if sel_raw else ""
    if not drafts:
        return
    top_id = str(drafts[0].suggested_package_id)

    for d in drafts:
        cid = str(d.suggested_package_id)
        d.overridden_by_user = bool(sel and cid == sel and sel != top_id)
        d.auto_assigned = cid == top_id and (not sel or sel == top_id)
