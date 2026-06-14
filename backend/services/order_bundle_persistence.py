"""Persist exploded bundle lines + component snapshots (P4.13)."""

from __future__ import annotations

import json
from typing import Any, Optional

from sqlalchemy.orm import Session

from ..models.order_item import OrderItem
from .bundle_explosion import ResolvedOrderLine
from .bundle_order_snapshot_service import (
    BundleComponentSnapshotDraft,
    persist_order_line_bundle_snapshots,
)
from .stock_disposition import DEFAULT_STOCK_DISPOSITION


def _merge_json_meta(base_json: str | None, extra: dict[str, Any]) -> str | None:
    base: dict[str, Any] = {}
    if base_json and str(base_json).strip():
        try:
            parsed = json.loads(base_json)
            if isinstance(parsed, dict):
                base = parsed
        except json.JSONDecodeError:
            pass
    base.update(extra)
    return json.dumps(base, ensure_ascii=False)


def persist_resolved_bundle_lines(
    db: Session,
    *,
    order_id: int,
    merged: list[ResolvedOrderLine],
    snapshots_by_instance: dict[str, list[BundleComponentSnapshotDraft]],
    unit_str: Optional[str] = None,
    vat_override: Optional[float] = None,
    import_extra_meta: Optional[dict[str, Any]] = None,
    required_stock_disposition_default: str = DEFAULT_STOCK_DISPOSITION,
) -> int:
    """
    Zapis nagłówka + komponentów zestawu. Zwraca liczbę utworzonych linii.
    ``snapshots_by_instance`` — klucz ``bundle_instance_id`` nagłówka.
    """
    inst_to_parent_item_id: dict[str, int] = {}
    created = 0
    for r in merged:
        vat_final: Optional[float] = float(vat_override) if vat_override is not None else r.vat_percent
        meta_use = r.metadata_json
        if r.is_bundle_parent and import_extra_meta:
            meta_use = _merge_json_meta(meta_use, import_extra_meta)
        if r.is_bundle_parent:
            oi = OrderItem(
                order_id=int(order_id),
                product_id=r.product_id,
                quantity=r.quantity,
                unit_price=r.unit_price,
                total_price=r.total_price,
                list_price=r.list_price,
                total_volume=round(r.line_volume, 4) if r.line_volume else None,
                unit=unit_str,
                vat_percent=vat_final,
                metadata_json=meta_use,
                source_bundle_id=r.source_bundle_id,
                bundle_instance_id=r.bundle_instance_id,
                is_bundle_parent=True,
                parent_bundle_order_item_id=None,
                required_stock_disposition=r.required_stock_disposition or required_stock_disposition_default,
                product_sales_offer_id=r.product_sales_offer_id,
                offer_name_snapshot=r.offer_name,
            )
            db.add(oi)
            db.flush()
            created += 1
            if r.bundle_instance_id:
                inst_key = str(r.bundle_instance_id)
                inst_to_parent_item_id[inst_key] = int(oi.id)
                snaps = snapshots_by_instance.get(inst_key) or []
                if snaps:
                    persist_order_line_bundle_snapshots(
                        db,
                        order_line_id=int(oi.id),
                        order_id=int(order_id),
                        snapshots=snaps,
                    )
            continue
        pb_id = inst_to_parent_item_id.get(str(r.bundle_instance_id)) if r.bundle_instance_id else None
        oi = OrderItem(
            order_id=int(order_id),
            product_id=r.product_id,
            quantity=r.quantity,
            unit_price=r.unit_price,
            total_price=r.total_price,
            list_price=r.list_price,
            total_volume=round(r.line_volume, 4) if r.line_volume else None,
            unit=unit_str,
            vat_percent=vat_final,
            metadata_json=meta_use,
            source_bundle_id=r.source_bundle_id,
            bundle_instance_id=r.bundle_instance_id,
            is_bundle_parent=False,
            parent_bundle_order_item_id=pb_id,
            required_stock_disposition=r.required_stock_disposition or required_stock_disposition_default,
            product_sales_offer_id=r.product_sales_offer_id,
            offer_name_snapshot=r.offer_name,
        )
        db.add(oi)
        created += 1
    return created
