"""
Ładowanie i zapis konfiguracji modułu zwrotów + domyślne wartości zgodne z istniejącymi kodami RMZ (prefiks b_/c_).
"""

from __future__ import annotations

import json
import logging
from typing import Dict, Iterable, List, Set, Tuple

from sqlalchemy.orm import Session

from ..models.return_module_config import (
    ReturnCustomerReturnType,
    ReturnDamageClass,
    ReturnDamageReason,
    ReturnDetailLayout,
    ReturnOrderSource,
    ReturnProductDecision,
)
from ..schemas.return_module_config import (
    ReturnCustomerReturnTypeRW,
    ReturnDamageClassRW,
    ReturnDamageReasonRW,
    ReturnDetailLayoutRW,
    ReturnModuleConfigRead,
    ReturnModuleConfigWrite,
    ReturnOrderSourceRW,
    ReturnProductDecisionRW,
    WmsReturnModuleConfigRead,
)

logger = logging.getLogger(__name__)

DETAIL_SECTION_IDS: Tuple[str, ...] = (
    "return_status",
    "progress_bar",
    "returned_products",
    "wms_view",
    "customer_data",
    "notes",
    "decision_history",
    "correspondence",
    "attachments",
    "payment_data",
    "refund",
    "damage_photos",
    "customer_stats",
    "prior_returns_history",
)


def _default_layout() -> ReturnDetailLayoutRW:
    return ReturnDetailLayoutRW(left_column=list(DETAIL_SECTION_IDS), right_column=[])


def _default_damage_classes() -> List[ReturnDamageClassRW]:
    return [
        ReturnDamageClassRW(
            code="B",
            label="Klasa B",
            color_hex="#ca8a04",
            description="Produkt nadaje się do outletu — kosmetyczne lub drobne ubytki.",
            warehouse_behavior="quarantine_light",
            resale_allowed=True,
            visible_wms=True,
            sort_order=10,
            is_active=True,
        ),
        ReturnDamageClassRW(
            code="C",
            label="Klasa C",
            color_hex="#b91c1c",
            description="Poważne uszkodzenie lub brak kluczowej części.",
            warehouse_behavior="quarantine_heavy",
            resale_allowed=False,
            visible_wms=True,
            sort_order=20,
            is_active=True,
        ),
    ]


def _default_damage_reasons() -> List[ReturnDamageReasonRW]:
    """Kody zgodne z frontend `rmzDamageTypes` — nie zmieniaj bez migracji payloadów RMZ."""
    return [
        ReturnDamageReasonRW(class_code="B", code="b_scratches", label="Rysy / zadrapania", visible_wms=True, sort_order=10),
        ReturnDamageReasonRW(class_code="B", code="b_soiling", label="Zabrudzenia", visible_wms=True, sort_order=20),
        ReturnDamageReasonRW(class_code="B", code="b_no_packaging", label="Brak opakowania", visible_wms=True, sort_order=30),
        ReturnDamageReasonRW(class_code="B", code="b_no_label", label="Brak metki", visible_wms=True, sort_order=40),
        ReturnDamageReasonRW(class_code="B", code="b_missing_small", label="Brak drobnego elementu", visible_wms=True, sort_order=50),
        ReturnDamageReasonRW(class_code="C", code="c_damaged", label="Produkt uszkodzony", visible_wms=True, sort_order=10),
        ReturnDamageReasonRW(class_code="C", code="c_destroyed", label="Produkt zniszczony", visible_wms=True, sort_order=20),
        ReturnDamageReasonRW(class_code="C", code="c_flood_stain", label="Zalany / trwałe zabrudzenie", visible_wms=True, sort_order=30),
        ReturnDamageReasonRW(class_code="C", code="c_incomplete_main", label="Niekompletny (brak głównego elementu)", visible_wms=True, sort_order=40),
        ReturnDamageReasonRW(class_code="C", code="c_odor_hygiene", label="Zapach / higiena", visible_wms=True, sort_order=50),
    ]


def _default_product_decisions() -> List[ReturnProductDecisionRW]:
    return [
        ReturnProductDecisionRW(category="ACCEPTED", code="accepted", label="Zaakceptowany", visible_wms=True, sort_order=10),
        ReturnProductDecisionRW(category="ACCEPTED", code="exchange", label="Wymiana produktu", visible_wms=True, sort_order=20),
        ReturnProductDecisionRW(category="ACCEPTED", code="refund_money", label="Zwrot środków", visible_wms=True, sort_order=30),
        ReturnProductDecisionRW(category="ACCEPTED", code="conditional", label="Przyjęty warunkowo", visible_wms=True, sort_order=40),
        ReturnProductDecisionRW(
            category="REJECTED",
            code="rej_product_damaged",
            label="Produkt uszkodzony",
            visible_wms=True,
            sort_order=10,
            creates_stock_document=True,
        ),
        ReturnProductDecisionRW(
            category="REJECTED",
            code="rej_incomplete",
            label="Niekompletny",
            visible_wms=True,
            sort_order=20,
            creates_stock_document=False,
        ),
        ReturnProductDecisionRW(
            category="REJECTED",
            code="rej_no_packaging",
            label="Brak opakowania",
            visible_wms=True,
            sort_order=30,
            creates_stock_document=False,
        ),
        ReturnProductDecisionRW(
            category="REJECTED",
            code="rej_used_marks",
            label="Ślady użytkowania",
            visible_wms=True,
            sort_order=40,
            creates_stock_document=False,
        ),
        ReturnProductDecisionRW(
            category="REJECTED",
            code="rej_wrong_return",
            label="Niezgodny zwrot",
            visible_wms=True,
            sort_order=50,
            creates_stock_document=True,
        ),
    ]


def _default_customer_return_types() -> List[ReturnCustomerReturnTypeRW]:
    return [
        ReturnCustomerReturnTypeRW(code="withdrawal", label="Odstąpienie od umowy", sort_order=10),
        ReturnCustomerReturnTypeRW(code="complaint", label="Reklamacja", sort_order=20),
        ReturnCustomerReturnTypeRW(code="exchange", label="Wymiana", sort_order=30),
        ReturnCustomerReturnTypeRW(code="partial_return", label="Zwrot części zamówienia", sort_order=40),
    ]


def _default_order_sources() -> List[ReturnOrderSourceRW]:
    return [
        ReturnOrderSourceRW(code="allegro", label="Allegro", sort_order=10),
        ReturnOrderSourceRW(code="shop", label="Sklep", sort_order=20),
        ReturnOrderSourceRW(code="amazon", label="Amazon", sort_order=30),
        ReturnOrderSourceRW(code="erli", label="Erli", sort_order=40),
    ]


def _validate_unique_codes(rows: Iterable[str]) -> None:
    seen: Set[str] = set()
    for c in rows:
        key = c.strip().lower()
        if key in seen:
            raise ValueError(f"Zduplikowany kod: {c}")
        seen.add(key)


_WIDTH_OK = frozenset({"full", "sidebar", "compact"})


def _normalize_layout(layout: ReturnDetailLayoutRW) -> ReturnDetailLayoutRW:
    allowed = set(DETAIL_SECTION_IDS)
    left = [x for x in layout.left_column if x in allowed]
    right = [x for x in layout.right_column if x in allowed]
    seen: Set[str] = set()
    out_l: List[str] = []
    out_r: List[str] = []
    for col in (left, right):
        target = out_l if col is left else out_r
        for sid in col:
            if sid not in seen:
                seen.add(sid)
                target.append(sid)
    missing = [s for s in DETAIL_SECTION_IDS if s not in seen]
    out_l.extend(missing)
    sw: Dict[str, str] = {}
    raw_sw = getattr(layout, "section_widths", None) or {}
    if isinstance(raw_sw, dict):
        for k, v in raw_sw.items():
            if k not in allowed:
                continue
            vs = str(v).strip().lower() if v is not None else ""
            if vs in _WIDTH_OK:
                sw[str(k)] = vs
    return ReturnDetailLayoutRW(left_column=out_l, right_column=out_r, section_widths=sw)


def _layout_from_db(raw: str | None) -> ReturnDetailLayoutRW:
    if not raw or not str(raw).strip():
        return _default_layout()
    try:
        data = json.loads(raw)
        raw_sw = data.get("section_widths")
        section_widths: Dict[str, str] = {}
        if isinstance(raw_sw, dict):
            for k, v in raw_sw.items():
                if isinstance(k, str) and isinstance(v, str):
                    section_widths[k] = v.strip().lower()
        lr = ReturnDetailLayoutRW(
            left_column=list(data.get("left_column") or []),
            right_column=list(data.get("right_column") or []),
            section_widths=section_widths,
        )
        return _normalize_layout(lr)
    except Exception:
        logger.warning("return_module_config: invalid layout_json, using defaults")
        return _default_layout()


def _serialize_layout(layout: ReturnDetailLayoutRW) -> str:
    norm = _normalize_layout(layout)
    sw = dict(norm.section_widths) if getattr(norm, "section_widths", None) else {}
    return json.dumps(
        {"left_column": norm.left_column, "right_column": norm.right_column, "section_widths": sw},
        ensure_ascii=False,
    )


def has_any_config(db: Session, tenant_id: int, warehouse_id: int) -> bool:
    return (
        db.query(ReturnDamageClass.id)
        .filter(ReturnDamageClass.tenant_id == tenant_id, ReturnDamageClass.warehouse_id == warehouse_id)
        .first()
        is not None
    )


def seed_defaults_session(db: Session, tenant_id: int, warehouse_id: int) -> None:
    """Wstaw domyślne rekordy jeśli magazyn nie ma jeszcze konfiguracji."""
    if has_any_config(db, tenant_id, warehouse_id):
        return
    for dc in _default_damage_classes():
        db.add(
            ReturnDamageClass(
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                code=dc.code,
                label=dc.label,
                color_hex=dc.color_hex,
                description=dc.description,
                warehouse_behavior=dc.warehouse_behavior,
                resale_allowed=dc.resale_allowed,
                visible_wms=dc.visible_wms,
                sort_order=dc.sort_order,
                is_active=dc.is_active,
            )
        )
    for dr in _default_damage_reasons():
        db.add(
            ReturnDamageReason(
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                class_code=dr.class_code,
                code=dr.code,
                label=dr.label,
                visible_wms=dr.visible_wms,
                sort_order=dr.sort_order,
                is_active=dr.is_active,
            )
        )
    for pd in _default_product_decisions():
        db.add(
            ReturnProductDecision(
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                category=pd.category,
                code=pd.code,
                label=pd.label,
                visible_wms=pd.visible_wms,
                sort_order=pd.sort_order,
                is_active=pd.is_active,
                creates_stock_document=bool(getattr(pd, "creates_stock_document", False)),
            )
        )
    for ct in _default_customer_return_types():
        db.add(
            ReturnCustomerReturnType(
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                code=ct.code,
                label=ct.label,
                sort_order=ct.sort_order,
                is_active=ct.is_active,
            )
        )
    for os in _default_order_sources():
        db.add(
            ReturnOrderSource(
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                code=os.code,
                label=os.label,
                logo_url=(os.logo_url.strip()[:512] if getattr(os, "logo_url", None) and str(os.logo_url).strip() else None),
                sort_order=os.sort_order,
                is_active=os.is_active,
            )
        )
    db.add(
        ReturnDetailLayout(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            layout_json=_serialize_layout(_default_layout()),
        )
    )
    db.flush()


def read_config_session(db: Session, tenant_id: int, warehouse_id: int) -> ReturnModuleConfigRead:
    seed_defaults_session(db, tenant_id, warehouse_id)

    classes = (
        db.query(ReturnDamageClass)
        .filter(ReturnDamageClass.tenant_id == tenant_id, ReturnDamageClass.warehouse_id == warehouse_id)
        .order_by(ReturnDamageClass.sort_order, ReturnDamageClass.id)
        .all()
    )
    reasons = (
        db.query(ReturnDamageReason)
        .filter(ReturnDamageReason.tenant_id == tenant_id, ReturnDamageReason.warehouse_id == warehouse_id)
        .order_by(ReturnDamageReason.sort_order, ReturnDamageReason.id)
        .all()
    )
    decisions = (
        db.query(ReturnProductDecision)
        .filter(ReturnProductDecision.tenant_id == tenant_id, ReturnProductDecision.warehouse_id == warehouse_id)
        .order_by(ReturnProductDecision.category, ReturnProductDecision.sort_order, ReturnProductDecision.id)
        .all()
    )
    ctypes = (
        db.query(ReturnCustomerReturnType)
        .filter(ReturnCustomerReturnType.tenant_id == tenant_id, ReturnCustomerReturnType.warehouse_id == warehouse_id)
        .order_by(ReturnCustomerReturnType.sort_order, ReturnCustomerReturnType.id)
        .all()
    )
    sources = (
        db.query(ReturnOrderSource)
        .filter(ReturnOrderSource.tenant_id == tenant_id, ReturnOrderSource.warehouse_id == warehouse_id)
        .order_by(ReturnOrderSource.sort_order, ReturnOrderSource.id)
        .all()
    )
    layout_row = (
        db.query(ReturnDetailLayout)
        .filter(ReturnDetailLayout.tenant_id == tenant_id, ReturnDetailLayout.warehouse_id == warehouse_id)
        .one_or_none()
    )

    layout = _layout_from_db(layout_row.layout_json if layout_row else None)

    return ReturnModuleConfigRead(
        damage_classes=[
            ReturnDamageClassRW(
                code=r.code,
                label=r.label,
                color_hex=r.color_hex,
                description=r.description,
                warehouse_behavior=r.warehouse_behavior,
                resale_allowed=bool(r.resale_allowed),
                visible_wms=bool(r.visible_wms),
                sort_order=r.sort_order,
                is_active=bool(r.is_active),
            )
            for r in classes
        ],
        damage_reasons=[
            ReturnDamageReasonRW(
                class_code=r.class_code,
                code=r.code,
                label=r.label,
                visible_wms=bool(r.visible_wms),
                sort_order=r.sort_order,
                is_active=bool(r.is_active),
            )
            for r in reasons
        ],
        product_decisions=[
            ReturnProductDecisionRW(
                category=r.category,  # type: ignore[arg-type]
                code=r.code,
                label=r.label,
                visible_wms=bool(r.visible_wms),
                sort_order=r.sort_order,
                is_active=bool(r.is_active),
                creates_stock_document=bool(getattr(r, "creates_stock_document", False)),
            )
            for r in decisions
        ],
        customer_return_types=[
            ReturnCustomerReturnTypeRW(
                code=r.code,
                label=r.label,
                sort_order=r.sort_order,
                is_active=bool(r.is_active),
            )
            for r in ctypes
        ],
        order_sources=[
            ReturnOrderSourceRW(
                code=r.code,
                label=r.label,
                logo_url=(r.logo_url.strip() if getattr(r, "logo_url", None) else None) or None,
                sort_order=r.sort_order,
                is_active=bool(r.is_active),
            )
            for r in sources
        ],
        detail_layout=layout,
    )


def read_wms_bundle_session(db: Session, tenant_id: int, warehouse_id: int) -> WmsReturnModuleConfigRead:
    full = read_config_session(db, tenant_id, warehouse_id)

    def filt_active(xs):
        return [x for x in xs if x.is_active]

    dc_visible = [x for x in filt_active(full.damage_classes) if x.visible_wms]
    dr_visible = [x for x in filt_active(full.damage_reasons) if x.visible_wms]
    pd_visible = [x for x in filt_active(full.product_decisions) if x.visible_wms]

    return WmsReturnModuleConfigRead(
        damage_classes=dc_visible,
        damage_reasons=dr_visible,
        product_decisions=pd_visible,
        detail_layout=full.detail_layout,
    )


def replace_config_session(db: Session, tenant_id: int, warehouse_id: int, body: ReturnModuleConfigWrite) -> ReturnModuleConfigRead:
    class_codes = {c.code.strip() for c in body.damage_classes if c.code.strip()}
    _validate_unique_codes(class_codes)
    _validate_unique_codes(r.code for r in body.damage_reasons)
    _validate_unique_codes(f"{p.category}:{p.code}" for p in body.product_decisions)
    _validate_unique_codes(c.code for c in body.customer_return_types)
    _validate_unique_codes(s.code for s in body.order_sources)

    for dr in body.damage_reasons:
        cc = dr.class_code.strip()
        if cc not in class_codes:
            raise ValueError(f"Typ uszkodzenia `{dr.code}` — nieznana klasa `{cc}`.")

    layout_norm = _normalize_layout(body.detail_layout)

    for tbl in (
        ReturnDamageReason,
        ReturnDamageClass,
        ReturnProductDecision,
        ReturnCustomerReturnType,
        ReturnOrderSource,
        ReturnDetailLayout,
    ):
        db.query(tbl).filter(tbl.tenant_id == tenant_id, tbl.warehouse_id == warehouse_id).delete(synchronize_session=False)

    for dc in sorted(body.damage_classes, key=lambda x: x.sort_order):
        db.add(
            ReturnDamageClass(
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                code=dc.code.strip(),
                label=dc.label.strip(),
                color_hex=dc.color_hex.strip(),
                description=dc.description,
                warehouse_behavior=dc.warehouse_behavior,
                resale_allowed=dc.resale_allowed,
                visible_wms=dc.visible_wms,
                sort_order=dc.sort_order,
                is_active=dc.is_active,
            )
        )
    for dr in sorted(body.damage_reasons, key=lambda x: (x.class_code, x.sort_order)):
        db.add(
            ReturnDamageReason(
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                class_code=dr.class_code.strip(),
                code=dr.code.strip(),
                label=dr.label.strip(),
                visible_wms=dr.visible_wms,
                sort_order=dr.sort_order,
                is_active=dr.is_active,
            )
        )
    for pd in sorted(body.product_decisions, key=lambda x: (x.category, x.sort_order)):
        db.add(
            ReturnProductDecision(
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                category=pd.category,
                code=pd.code.strip(),
                label=pd.label.strip(),
                visible_wms=pd.visible_wms,
                sort_order=pd.sort_order,
                is_active=pd.is_active,
                creates_stock_document=bool(pd.creates_stock_document) if pd.category == "REJECTED" else False,
            )
        )
    for ct in sorted(body.customer_return_types, key=lambda x: x.sort_order):
        db.add(
            ReturnCustomerReturnType(
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                code=ct.code.strip(),
                label=ct.label.strip(),
                sort_order=ct.sort_order,
                is_active=ct.is_active,
            )
        )
    for os in sorted(body.order_sources, key=lambda x: x.sort_order):
        db.add(
            ReturnOrderSource(
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                code=os.code.strip(),
                label=os.label.strip(),
                logo_url=(os.logo_url.strip()[:512] if os.logo_url and os.logo_url.strip() else None),
                sort_order=os.sort_order,
                is_active=os.is_active,
            )
        )
    db.add(
        ReturnDetailLayout(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            layout_json=_serialize_layout(layout_norm),
        )
    )
    db.flush()
    return read_config_session(db, tenant_id, warehouse_id)
