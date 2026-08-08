"""
Etykieta zastępcza (WMS packing) — awaryjna etykieta przy braku listu kurierskiego.

Zapamiętuje wybory pakowania (opakowanie, paczki, metoda dostawy) i pozwala po skanie
kodu ponowić generowanie właściwej etykiety kurierskiej bez ponownego wyboru paczki.
"""

from __future__ import annotations

import base64
import json
import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from ..domain.label_templates.constants import (
    LABEL_TEMPLATE_TYPE_ORDER_REPLACEMENT,
    is_order_replacement_template_type,
)
from ..models.label_template import SavedLabelTemplate
from ..models.order import Order
from ..models.wms_packing_replacement_label import (
    REPLACEMENT_STATUS_AWAITING_COURIER,
    REPLACEMENT_STATUS_COURIER_GENERATED,
    REPLACEMENT_STATUS_CREATED,
    REPLACEMENT_STATUS_REGENERATE_FAILED,
    WmsPackingReplacementLabel,
)
from ..models.wms_packing_settings import WmsPackingSettings
from ..schemas.wms_packing_settings import WmsPackingFallbackLabel

logger = logging.getLogger(__name__)

BARCODE_PREFIX = "RPL-"


class ReplacementLabelError(ValueError):
    """Domain error with stable ``code`` for API mapping."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _loads(raw: object, default: Any) -> Any:
    if raw is None or raw == "":
        return default
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(str(raw))
    except Exception:
        return default


def _json_settings_merge(model_cls, raw_json: object, default):
    data = _loads(raw_json, {})
    if not isinstance(data, dict):
        data = {}
    return model_cls.model_validate({**default.model_dump(), **data})


def build_packing_snapshot(order: Order) -> dict[str, Any]:
    """Capture packing choices needed to regenerate a courier label later."""
    consumables = _loads(getattr(order, "packing_consumables_json", None), None)
    carton_ids: list[str] = []
    if isinstance(consumables, dict):
        raw_ids = consumables.get("packaging_carton_ids") or consumables.get("carton_ids")
        if isinstance(raw_ids, list):
            carton_ids = [str(x).strip() for x in raw_ids if str(x).strip()]
    selected = getattr(order, "selected_carton_id", None)
    selected_s = str(selected).strip() if selected is not None else ""
    if selected_s and selected_s not in carton_ids:
        carton_ids = [selected_s, *carton_ids]

    meta = _loads(getattr(order, "metadata_json", None), {})
    if not isinstance(meta, dict):
        meta = {}
    waybill_count = 1
    for key in ("waybill_count", "listy_przewozowe", "labels_count"):
        if key in meta:
            try:
                waybill_count = max(1, int(meta[key]))
                break
            except Exception:
                pass

    ship_id = getattr(order, "shipping_method_id", None)
    return {
        "order_id": int(order.id),
        "order_number": str(getattr(order, "number", "") or ""),
        "warehouse_id": int(getattr(order, "warehouse_id", 0) or 0),
        "selected_carton_id": selected_s or None,
        "packaging_carton_ids": carton_ids,
        "packing_consumables": consumables if isinstance(consumables, (dict, list)) else None,
        "shipping_method_id": int(ship_id) if ship_id is not None and int(ship_id) > 0 else None,
        "shipping_method": str(getattr(order, "shipping_method", "") or "") or None,
        "waybill_count": waybill_count,
        "parcel_count": max(len(carton_ids), waybill_count, 1),
    }


def apply_packing_snapshot(order: Order, snapshot: dict[str, Any]) -> None:
    """Restore packing choices onto the order before courier retry."""
    if not isinstance(snapshot, dict):
        return
    carton_id = snapshot.get("selected_carton_id")
    if carton_id:
        order.selected_carton_id = str(carton_id).strip() or order.selected_carton_id
    ids = snapshot.get("packaging_carton_ids")
    consumables = snapshot.get("packing_consumables")
    if isinstance(ids, list) and ids:
        payload = consumables if isinstance(consumables, dict) else {}
        payload = {**payload, "packaging_carton_ids": [str(x) for x in ids if str(x).strip()]}
        order.packing_consumables_json = json.dumps(payload, ensure_ascii=False)
    elif isinstance(consumables, (dict, list)):
        order.packing_consumables_json = json.dumps(consumables, ensure_ascii=False)
    sm_id = snapshot.get("shipping_method_id")
    if sm_id is not None:
        try:
            order.shipping_method_id = int(sm_id)
        except Exception:
            pass
    sm_name = snapshot.get("shipping_method")
    if sm_name:
        order.shipping_method = str(sm_name)[:255]


def format_replacement_barcode(row_id: int) -> str:
    return f"{BARCODE_PREFIX}{int(row_id):06d}"


def parse_replacement_barcode(raw: str) -> Optional[str]:
    s = str(raw or "").strip().upper()
    if not s.startswith(BARCODE_PREFIX):
        return None
    return s


def get_fallback_label_settings(
    db: Session, *, tenant_id: int, warehouse_id: int
) -> WmsPackingFallbackLabel:
    row = (
        db.query(WmsPackingSettings)
        .filter(
            WmsPackingSettings.tenant_id == int(tenant_id),
            WmsPackingSettings.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if row is None:
        return WmsPackingFallbackLabel()
    return _json_settings_merge(WmsPackingFallbackLabel, row.fallback_label_json, WmsPackingFallbackLabel())


def require_order_replacement_template(
    db: Session, *, tenant_id: int, template_id: int
) -> SavedLabelTemplate:
    tpl = (
        db.query(SavedLabelTemplate)
        .filter(
            SavedLabelTemplate.id == int(template_id),
            SavedLabelTemplate.tenant_id == int(tenant_id),
        )
        .first()
    )
    if tpl is None:
        raise ReplacementLabelError("template_not_found", "Nie znaleziono szablonu etykiety zastępczej.")
    if not is_order_replacement_template_type(getattr(tpl, "template_type", None)):
        raise ReplacementLabelError(
            "invalid_template_type",
            "Szablon musi mieć typ „Etykieta zastępcza” (rodzina Zamówienia).",
        )
    return tpl


def _label_data_for_order(order: Order, *, barcode: str) -> dict[str, Any]:
    return {
        "order_id": int(order.id),
        "order_number": str(getattr(order, "number", "") or ""),
        "number": str(getattr(order, "number", "") or ""),
        "client": str(getattr(order, "client_name", None) or getattr(order, "customer_name", None) or ""),
        "order_barcode": barcode,
        "barcode_data": barcode,
        "barcode": barcode,
        "replacement_label": True,
        "label_title": "ETYKIETA ZASTĘPCZA",
    }


def create_replacement_label(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    courier_error: Optional[str] = None,
) -> tuple[WmsPackingReplacementLabel, bytes]:
    """
    Create persisted replacement-label state + render PDF bytes.

    Raises ``ReplacementLabelError`` when template is missing / wrong type.
    """
    fb = get_fallback_label_settings(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if fb.template_id is None:
        raise ReplacementLabelError(
            "replacement_template_not_configured",
            "Nie skonfigurowano szablonu etykiety zastępczej w ustawieniach WMS.",
        )
    tpl = require_order_replacement_template(db, tenant_id=tenant_id, template_id=int(fb.template_id))
    snapshot = build_packing_snapshot(order)

    row = WmsPackingReplacementLabel(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order.id),
        barcode="PENDING",
        status=REPLACEMENT_STATUS_CREATED,
        template_id=int(tpl.id),
        snapshot_json=json.dumps(snapshot, ensure_ascii=False),
        last_error=(str(courier_error)[:2000] if courier_error else None),
    )
    db.add(row)
    db.flush()
    barcode = format_replacement_barcode(int(row.id))
    row.barcode = barcode
    row.status = REPLACEMENT_STATUS_AWAITING_COURIER
    db.flush()

    from .label_render_service import render_label_template

    pdf = render_label_template(
        db,
        template_id=int(tpl.id),
        data=_label_data_for_order(order, barcode=barcode),
        tenant_id=int(tenant_id),
        print_mode=True,
    )
    logger.info(
        "wms_packing replacement_label created order_id=%s barcode=%s template_id=%s",
        order.id,
        barcode,
        tpl.id,
    )
    return row, pdf


def get_by_barcode(
    db: Session, *, tenant_id: int, barcode: str
) -> Optional[WmsPackingReplacementLabel]:
    normalized = parse_replacement_barcode(barcode)
    if not normalized:
        return None
    return (
        db.query(WmsPackingReplacementLabel)
        .filter(
            WmsPackingReplacementLabel.tenant_id == int(tenant_id),
            WmsPackingReplacementLabel.barcode == normalized,
        )
        .first()
    )


def get_active_for_order(
    db: Session, *, tenant_id: int, order_id: int
) -> Optional[WmsPackingReplacementLabel]:
    return (
        db.query(WmsPackingReplacementLabel)
        .filter(
            WmsPackingReplacementLabel.tenant_id == int(tenant_id),
            WmsPackingReplacementLabel.order_id == int(order_id),
            WmsPackingReplacementLabel.status.in_(
                [
                    REPLACEMENT_STATUS_CREATED,
                    REPLACEMENT_STATUS_AWAITING_COURIER,
                    REPLACEMENT_STATUS_REGENERATE_FAILED,
                ]
            ),
        )
        .order_by(WmsPackingReplacementLabel.id.desc())
        .first()
    )


def retry_courier_label_from_replacement(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    row: WmsPackingReplacementLabel,
) -> dict[str, Any]:
    """
    Restore snapshot and attempt courier waybill resolution again.

    Returns dict with ``ok``, ``status``, ``message``, optional ``waybill_message``.
    """
    from .wms_packing_service import _packing_step_generate_shipment, _packing_step_print_label

    order = db.query(Order).filter(Order.id == int(row.order_id), Order.tenant_id == int(tenant_id)).first()
    if order is None:
        raise ReplacementLabelError("order_not_found", "Nie znaleziono zamówienia dla etykiety zastępczej.")

    snapshot = _loads(row.snapshot_json, {})
    apply_packing_snapshot(order, snapshot if isinstance(snapshot, dict) else {})
    db.flush()

    gen = _packing_step_generate_shipment(db, order)
    fb = get_fallback_label_settings(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    # On retry we only care about an existing courier waybill — do not re-offer replacement.
    print_step = _packing_step_print_label(
        db,
        tenant_id=tenant_id,
        order=order,
        fb=fb,
        offer_replacement_on_missing=False,
    )

    waybill_ok = bool(gen.ok and not gen.skipped) or bool(print_step.ok and not print_step.skipped)
    if waybill_ok:
        row.status = REPLACEMENT_STATUS_COURIER_GENERATED
        row.resolved_at = datetime.utcnow()
        row.last_error = None
        db.flush()
        return {
            "ok": True,
            "status": row.status,
            "message": print_step.message or gen.message or "courier_label_generated",
            "waybill_message": print_step.message or gen.message,
            "order_id": int(order.id),
            "replacement_label_id": int(row.id),
            "barcode": row.barcode,
        }

    err = print_step.message or gen.message or "courier_label_unavailable"
    row.status = REPLACEMENT_STATUS_REGENERATE_FAILED
    row.last_error = str(err)[:2000]
    db.flush()
    return {
        "ok": False,
        "status": row.status,
        "message": err,
        "order_id": int(order.id),
        "replacement_label_id": int(row.id),
        "barcode": row.barcode,
    }


def pdf_to_base64(pdf: bytes) -> str:
    return base64.b64encode(pdf).decode("ascii")


def serialize_replacement_row(row: WmsPackingReplacementLabel) -> dict[str, Any]:
    return {
        "id": int(row.id),
        "tenant_id": int(row.tenant_id),
        "warehouse_id": int(row.warehouse_id),
        "order_id": int(row.order_id),
        "barcode": str(row.barcode),
        "status": str(row.status),
        "template_id": int(row.template_id) if row.template_id is not None else None,
        "snapshot": _loads(row.snapshot_json, {}),
        "last_error": row.last_error,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
    }


# Re-export type constant for callers / tests
ORDER_REPLACEMENT_TEMPLATE_TYPE = LABEL_TEMPLATE_TYPE_ORDER_REPLACEMENT
