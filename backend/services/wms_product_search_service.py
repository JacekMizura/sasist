"""WMS product search with warehouse location breakdown."""

from __future__ import annotations

import json
from typing import List, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.location import Location
from ..models.product import Product
from ..models.warehouse_carrier import WarehouseCarrier
from ..schemas.wms_product_search import WmsProductSearchHit, WmsProductSearchLocationRow
from .wms_mm_transfer_service import _assert_warehouse_for_tenant


def _product_created_in_wms(metadata_json: Optional[str]) -> bool:
    if not metadata_json:
        return False
    try:
        data = json.loads(metadata_json)
        if not isinstance(data, dict):
            return False
        src = str(data.get("creation_source") or "").strip().upper()
        return src == "WMS_RECEIVING"
    except json.JSONDecodeError:
        return False


def search_wms_products(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    query: str,
    limit: int = 20,
) -> List[WmsProductSearchHit]:
    q = (query or "").strip()
    if len(q) < 2:
        return []
    _assert_warehouse_for_tenant(db, tenant_id, warehouse_id)
    lim = max(1, min(int(limit), 50))
    pattern = f"%{q}%"
    q_lower = q.lower()

    prod_q = (
        db.query(Product)
        .filter(
            Product.tenant_id == int(tenant_id),
            Product.deleted_at.is_(None),
            or_(
                Product.name.ilike(pattern),
                Product.ean.ilike(pattern),
                Product.bulk_ean.ilike(pattern),
                Product.sku.ilike(pattern),
                Product.symbol.ilike(pattern),
                Product.barcode.ilike(pattern),
            ),
        )
        .order_by(Product.name.asc())
        .limit(lim * 3)
    )
    products = prod_q.all()
    if not products:
        return []

    scored: list[tuple[int, Product]] = []
    for p in products:
        name = (p.name or "").lower()
        ean = (p.ean or "").lower()
        sku = (p.sku or p.symbol or "").lower()
        score = 0
        if name == q_lower or ean == q_lower or sku == q_lower:
            score = 100
        elif name.startswith(q_lower) or ean.startswith(q_lower) or sku.startswith(q_lower):
            score = 80
        elif q_lower in name or q_lower in ean or q_lower in sku:
            score = 50
        else:
            score = 10
        scored.append((score, p))
    scored.sort(key=lambda x: (-x[0], (x[1].name or "").lower()))
    products = [p for _, p in scored[:lim]]
    pids = [int(p.id) for p in products]

    inv_rows = (
        db.query(
            Inventory.product_id,
            Inventory.location_id,
            Inventory.carrier_id,
            func.sum(Inventory.quantity).label("qty"),
        )
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id.in_(pids),
        )
        .group_by(Inventory.product_id, Inventory.location_id, Inventory.carrier_id)
        .having(func.sum(Inventory.quantity) > 1e-9)
        .all()
    )

    loc_ids = {int(r[1]) for r in inv_rows if r[1] is not None}
    loc_by_id: dict[int, Location] = {}
    if loc_ids:
        for loc in db.query(Location).filter(Location.id.in_(loc_ids)).all():
            loc_by_id[int(loc.id)] = loc

    carrier_ids = {int(r[2]) for r in inv_rows if r[2] is not None}
    carrier_by_id: dict[int, WarehouseCarrier] = {}
    if carrier_ids:
        for wc in db.query(WarehouseCarrier).filter(WarehouseCarrier.id.in_(carrier_ids)).all():
            carrier_by_id[int(wc.id)] = wc

    loc_map: dict[int, dict[int, list[tuple[float, str | None]]]] = {}
    for pid, lid, cid, qty in inv_rows:
        pid_i = int(pid)
        lid_i = int(lid)
        qf = float(qty or 0)
        if qf <= 1e-9:
            continue
        ccode = None
        if cid is not None:
            wc = carrier_by_id.get(int(cid))
            ccode = (wc.code or wc.barcode or "").strip() if wc else None
        loc_map.setdefault(pid_i, {}).setdefault(lid_i, []).append((qf, ccode))

    out: List[WmsProductSearchHit] = []
    for p in products:
        pid = int(p.id)
        per_loc = loc_map.get(pid, {})
        loc_rows: list[WmsProductSearchLocationRow] = []
        total = 0.0
        for lid_i, chunks in sorted(per_loc.items(), key=lambda x: (loc_by_id.get(x[0]).name if loc_by_id.get(x[0]) else "")):
            loc = loc_by_id.get(lid_i)
            code = (loc.name or "").strip() if loc else f"#{lid_i}"
            qty_sum = sum(c[0] for c in chunks)
            carriers = sorted({c[1] for c in chunks if c[1]})
            carrier_label = carriers[0] if len(carriers) == 1 else (f"{len(carriers)} nośn." if carriers else None)
            total += qty_sum
            loc_rows.append(
                WmsProductSearchLocationRow(
                    location_id=lid_i,
                    location_code=code,
                    quantity=qty_sum,
                    carrier_code=carrier_label,
                )
            )
        out.append(
            WmsProductSearchHit(
                product_id=pid,
                product_name=(p.name or "").strip() or f"#{pid}",
                product_sku=(p.sku or p.symbol or "").strip() or None,
                product_ean=(p.ean or "").strip() or None,
                product_image_url=(p.image_url or "").strip() or None,
                total_quantity=total,
                locations=loc_rows,
                created_in_wms=_product_created_in_wms(getattr(p, "metadata_json", None)),
            )
        )
    return out
