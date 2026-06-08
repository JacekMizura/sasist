"""Difference analysis, thresholds, and classification."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.constants import (
    DEFAULT_DIFF_THRESHOLDS,
    DIFF_CLASS_AUTO,
    DIFF_CLASS_NONE,
    DIFF_CLASS_REVIEW,
    DIFF_CLASS_VARIANCE,
)
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.product import Product


def _thresholds(doc: InventoryDocument) -> dict[str, float]:
    base = dict(DEFAULT_DIFF_THRESHOLDS)
    if doc.strategy_json:
        try:
            strat = json.loads(doc.strategy_json)
            th = strat.get("difference_thresholds") or strat
            for k in base:
                if k in th:
                    base[k] = float(th[k])
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
    return base


def difference_percent(expected: float, counted: float | None) -> float:
    exp = float(expected or 0)
    cnt = float(counted or 0)
    if abs(exp) < 1e-9:
        return 100.0 if abs(cnt) > 1e-9 else 0.0
    return abs((cnt - exp) / exp) * 100.0


def classify_line_difference(
    *,
    expected: float,
    counted: float | None,
    thresholds: dict[str, float],
) -> str:
    """Classify inventory variance for supervisor review — never triggers mandatory recount."""
    if counted is None:
        return DIFF_CLASS_NONE
    diff_pct = difference_percent(expected, counted)
    if diff_pct <= thresholds["auto_approve_percent"]:
        return DIFF_CLASS_AUTO
    return DIFF_CLASS_REVIEW


def analyze_document_differences(
    db: Session,
    *,
    document: InventoryDocument,
) -> dict[str, Any]:
    thresholds = _thresholds(document)
    lines = (
        db.query(InventoryDocumentLine, Product)
        .outerjoin(Product, Product.id == InventoryDocumentLine.product_id)
        .filter(InventoryDocumentLine.inventory_document_id == int(document.id))
        .all()
    )
    rows: list[dict[str, Any]] = []
    counts = {DIFF_CLASS_NONE: 0, DIFF_CLASS_AUTO: 0, DIFF_CLASS_REVIEW: 0, DIFF_CLASS_VARIANCE: 0}
    total_value_impact = 0.0

    for line, product in lines:
        line.recompute_difference()
        cls = classify_line_difference(
            expected=float(line.expected_quantity or 0),
            counted=line.counted_quantity,
            thresholds=thresholds,
        )
        counts[cls] = counts.get(cls, 0) + 1
        diff_qty = float(line.difference_quantity or 0)
        unit_cost = float(getattr(product, "purchase_price_net", 0) or 0) if product else 0.0
        value_impact = diff_qty * unit_cost
        total_value_impact += value_impact
        if line.metadata_json:
            try:
                meta = json.loads(line.metadata_json)
            except json.JSONDecodeError:
                meta = {}
        else:
            meta = {}
        meta["difference_class"] = cls
        line.metadata_json = json.dumps(meta, ensure_ascii=False)
        rows.append(
            {
                "line_id": line.id,
                "location_id": line.location_id,
                "product_id": line.product_id,
                "sku": getattr(product, "sku", None) if product else None,
                "expected_quantity": line.expected_quantity,
                "counted_quantity": line.counted_quantity,
                "difference_quantity": line.difference_quantity,
                "difference_percent": difference_percent(
                    float(line.expected_quantity or 0), line.counted_quantity
                ),
                "difference_class": cls,
                "value_impact_net": round(value_impact, 2),
                "status": line.status,
            }
        )

    return {
        "document_id": document.id,
        "thresholds": thresholds,
        "summary": counts,
        "total_value_impact_net": round(total_value_impact, 2),
        "lines": rows,
    }
