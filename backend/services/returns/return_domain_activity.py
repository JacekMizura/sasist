"""Emit domain Activity Log events for RMZ / returns (one event, multi-link)."""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from ...models.order import Order
from ...models.product import Product
from ...models.stock_document import StockDocument
from ...models.wms_order_return import WmsOrderReturn
from ...models.wms_rmz_line import RMZLine
from ..activity_log.domain_activity import record_domain_activity
from ..activity_log.domain_event_codes import (
    RETURN_COMPONENT_RECOVERY,
    RETURN_CREATED,
    RETURN_FINALIZED,
    RETURN_LINE_DECISION,
    RETURN_PUTAWAY_COMPLETED,
    RETURN_RECEIPT_CREATED,
    RETURN_STOCK_INTAKE_SELECTED,
)


def _order_number(db: Session, order_id: Optional[int]) -> Optional[str]:
    if not order_id:
        return None
    o = db.query(Order).filter(Order.id == int(order_id)).first()
    if o is None:
        return None
    num = getattr(o, "number", None) or getattr(o, "order_number", None)
    return str(num).strip() if num else str(order_id)


def _product_snap(db: Session, product_id: Optional[int]) -> tuple[Optional[str], Optional[str]]:
    if not product_id:
        return None, None
    p = db.query(Product).filter(Product.id == int(product_id)).first()
    if p is None:
        return None, None
    return (getattr(p, "name", None), getattr(p, "sku", None))


def _format_product_label(name: Optional[str], sku: Optional[str]) -> str:
    n = str(name or "").strip()
    s = str(sku or "").strip()
    if n and s:
        return f"{n} ({s})"
    return n or s or "—"


def _qty_txt(n: float | int | None) -> str:
    q = float(n or 0)
    if abs(q - round(q)) < 1e-9:
        return str(int(round(q)))
    return f"{q:g}"


def _decision_label(decision: Optional[str]) -> str:
    d = str(decision or "").strip().upper()
    return {
        "OK": "przyjęty",
        "DAMAGED": "uszkodzony",
        "REJECTED": "odrzucony",
        "SCRAP": "scrap",
    }.get(d, d or "—")


def _line_is_bundle(db: Session, line: RMZLine) -> bool:
    try:
        from ..bundles.bundle_return_service import is_bundle_parent_rmz_line

        return bool(is_bundle_parent_rmz_line(db, line))
    except Exception:
        return False


def _parent_label(db: Session, line: RMZLine, *, is_bundle: bool) -> str:
    """Display name for the returned parent (manufactured FG or bundle)."""
    if is_bundle:
        try:
            from ...models.order_item import OrderItem

            oi = (
                db.query(OrderItem)
                .filter(OrderItem.id == int(getattr(line, "order_item_id", 0) or 0))
                .first()
            )
            bid = int(getattr(oi, "source_bundle_id", 0) or 0) if oi is not None else 0
            if bid > 0:
                from ...models.bundle import Bundle

                b = db.query(Bundle).filter(Bundle.id == bid).first()
                bname = str(getattr(b, "name", None) or "").strip() if b is not None else ""
                if bname:
                    return bname
        except Exception:
            pass
    name, sku = _product_snap(db, int(line.product_id) if getattr(line, "product_id", None) else None)
    return _format_product_label(name, sku)


def _intake_effect(*, parent_label: str, mode: str, fg: int, dq: int, is_bundle: bool) -> str:
    if mode == "DISASSEMBLE":
        if is_bundle:
            return f"{parent_label} — rozmontowano {_qty_txt(dq)} zest."
        return f"{parent_label} — rozmontowano {_qty_txt(dq)} szt."
    if mode == "MIXED":
        if is_bundle:
            return (
                f"{parent_label} — przyjęto jako zestaw: {_qty_txt(fg)} szt. · "
                f"rozmontowano: {_qty_txt(dq)} szt."
            )
        return (
            f"{parent_label} — przyjęto jako gotowy wyrób: {_qty_txt(fg)} szt. · "
            f"rozmontowano: {_qty_txt(dq)} szt."
        )
    # FG-only
    if is_bundle:
        return f"{parent_label} — przyjęto jako zestaw: {_qty_txt(fg)} szt."
    return f"{parent_label} — przyjęto jako gotowy wyrób: {_qty_txt(fg)} szt."


def emit_return_created(
    db: Session,
    *,
    rmz: WmsOrderReturn,
    actor_user_id: Optional[int] = None,
) -> None:
    rid = int(rmz.id)
    oid = int(rmz.order_id) if getattr(rmz, "order_id", None) else None
    rmz_no = str(getattr(rmz, "rmz_number", None) or f"RMZ-{rid}")
    order_no = _order_number(db, oid)
    record_domain_activity(
        db,
        tenant_id=int(rmz.tenant_id),
        warehouse_id=int(rmz.warehouse_id) if getattr(rmz, "warehouse_id", None) else None,
        event_type=RETURN_CREATED,
        description=f"Utworzono zwrot {rmz_no}",
        actor_user_id=actor_user_id,
        order_id=oid,
        rmz_id=rid,
        correlation_id=f"return:{rid}:created",
        source_module="returns",
        category="status",
        severity="SUCCESS",
        rmz_label=rmz_no,
        order_label=f"#{order_no}" if order_no else None,
        metadata={
            "rmz_number": rmz_no,
            "order_number": order_no,
            "return_type": getattr(rmz, "return_type", None),
        },
    )


def emit_return_line_decision(
    db: Session,
    *,
    rmz: WmsOrderReturn,
    line: RMZLine,
    actor_user_id: Optional[int] = None,
) -> None:
    rid = int(rmz.id)
    lid = int(line.id)
    pid = int(line.product_id) if getattr(line, "product_id", None) else None
    name, sku = _product_snap(db, pid)
    rmz_no = str(getattr(rmz, "rmz_number", None) or f"RMZ-{rid}")
    order_no = _order_number(db, int(rmz.order_id) if rmz.order_id else None)
    decision = getattr(line, "decision", None)
    label = _format_product_label(name, sku) if pid else ""
    desc = f"Decyzja pozycji: {_decision_label(decision)}" + (f" — {label}" if label else "")
    record_domain_activity(
        db,
        tenant_id=int(rmz.tenant_id),
        warehouse_id=int(rmz.warehouse_id) if getattr(rmz, "warehouse_id", None) else None,
        event_type=RETURN_LINE_DECISION,
        description=desc,
        actor_user_id=actor_user_id,
        order_id=int(rmz.order_id) if rmz.order_id else None,
        rmz_id=rid,
        product_id=pid,
        correlation_id=f"return:{rid}:line:{lid}:decision",
        source_module="returns",
        category="status",
        rmz_label=rmz_no,
        order_label=f"#{order_no}" if order_no else None,
        product_label=sku or name,
        metadata={
            "rmz_number": rmz_no,
            "order_number": order_no,
            "product_name": name,
            "product_sku": sku,
            "decision": decision,
            "accepted_qty": int(getattr(line, "accepted_qty", 0) or 0),
            "rejected_qty": int(getattr(line, "rejected_qty", 0) or 0),
            "damaged_b_qty": int(getattr(line, "damaged_b_qty", 0) or 0),
            "damaged_c_qty": int(getattr(line, "damaged_c_qty", 0) or 0),
        },
    )


def emit_return_stock_intake_selected(
    db: Session,
    *,
    rmz: WmsOrderReturn,
    line: RMZLine,
    actor_user_id: Optional[int] = None,
) -> None:
    mode = (str(getattr(line, "stock_intake_mode", None) or "").strip().upper() or None)
    if not mode:
        return
    rid = int(rmz.id)
    lid = int(line.id)
    fg = int(getattr(line, "fg_intake_qty", None) or 0)
    dq = int(getattr(line, "disassembly_qty", None) or 0)
    is_bundle = _line_is_bundle(db, line)
    parent_label = _parent_label(db, line, is_bundle=is_bundle)
    effect = _intake_effect(parent_label=parent_label, mode=mode, fg=fg, dq=dq, is_bundle=is_bundle)
    rmz_no = str(getattr(rmz, "rmz_number", None) or f"RMZ-{rid}")
    order_no = _order_number(db, int(rmz.order_id) if rmz.order_id else None)
    record_domain_activity(
        db,
        tenant_id=int(rmz.tenant_id),
        warehouse_id=int(rmz.warehouse_id) if getattr(rmz, "warehouse_id", None) else None,
        event_type=RETURN_STOCK_INTAKE_SELECTED,
        description=effect,
        actor_user_id=actor_user_id,
        order_id=int(rmz.order_id) if rmz.order_id else None,
        rmz_id=rid,
        product_id=int(line.product_id) if line.product_id else None,
        correlation_id=f"return:{rid}:line:{lid}:intake:{mode}:{fg}:{dq}",
        source_module="returns",
        category="status",
        rmz_label=rmz_no,
        order_label=f"#{order_no}" if order_no else None,
        metadata={
            "rmz_number": rmz_no,
            "order_number": order_no,
            "stock_intake_mode": mode,
            "fg_intake_qty": fg,
            "disassembly_qty": dq,
            "is_bundle": is_bundle,
            "source": "bundle" if is_bundle else "manufacturing",
            "parent_name": parent_label,
            "product_name": parent_label,
        },
    )


def emit_return_component_recovery(
    db: Session,
    *,
    rmz: WmsOrderReturn,
    line: RMZLine,
    component_product_id: int,
    expected_qty: float,
    accepted_qty: float,
    scrap_qty: float,
    source_row_id: Optional[int] = None,
    source: str = "bundle",
    actor_user_id: Optional[int] = None,
) -> None:
    """
    One Activity Log row per component: recovered + rejected in a single effect.

    Does NOT emit RETURN_COMPONENT_SCRAP (avoids UI duplication). Technical scrap
    audit remains in manufactured_component_recovery_service.audit_component_scrap.
    """
    rid = int(rmz.id)
    lid = int(line.id)
    pid = int(component_product_id)
    name, sku = _product_snap(db, pid)
    label = _format_product_label(name, sku)
    rmz_no = str(getattr(rmz, "rmz_number", None) or f"RMZ-{rid}")
    order_no = _order_number(db, int(rmz.order_id) if rmz.order_id else None)
    corr_suffix = str(source_row_id or f"{pid}:{accepted_qty}:{scrap_qty}")
    acc = float(accepted_qty or 0)
    scrap = float(scrap_qty or 0)
    if acc <= 1e-9 and scrap <= 1e-9:
        return
    is_bundle = str(source or "").strip().lower() == "bundle"
    effect = (
        f"{label} — Odzyskano: {_qty_txt(acc)} szt. · Odrzucono: {_qty_txt(scrap)} szt."
    )
    record_domain_activity(
        db,
        tenant_id=int(rmz.tenant_id),
        warehouse_id=int(rmz.warehouse_id) if getattr(rmz, "warehouse_id", None) else None,
        event_type=RETURN_COMPONENT_RECOVERY,
        description=effect,
        actor_user_id=actor_user_id,
        order_id=int(rmz.order_id) if rmz.order_id else None,
        rmz_id=rid,
        product_id=pid,
        correlation_id=f"return:{rid}:line:{lid}:recovery-posted:{corr_suffix}",
        source_module="returns",
        category="status",
        severity="SUCCESS" if acc > 1e-9 else "WARNING",
        rmz_label=rmz_no,
        order_label=f"#{order_no}" if order_no else None,
        product_label=label,
        metadata={
            "rmz_number": rmz_no,
            "order_number": order_no,
            "product_name": name,
            "product_sku": sku,
            "expected_qty": float(expected_qty),
            "accepted_qty": acc,
            "scrap_qty": scrap,
            "source": "bundle" if is_bundle else "manufacturing",
            "is_bundle": is_bundle,
        },
    )


def emit_return_receipt_created(
    db: Session,
    *,
    rmz: WmsOrderReturn,
    doc: StockDocument,
    actor_user_id: Optional[int] = None,
    new_line_count: int = 0,
) -> None:
    rid = int(rmz.id)
    doc_id = int(doc.id)
    doc_no = str(getattr(doc, "document_number", None) or f"Z-PZ#{doc_id}")
    rmz_no = str(getattr(rmz, "rmz_number", None) or f"RMZ-{rid}")
    order_no = _order_number(db, int(rmz.order_id) if rmz.order_id else None)
    record_domain_activity(
        db,
        tenant_id=int(rmz.tenant_id),
        warehouse_id=int(rmz.warehouse_id) if getattr(rmz, "warehouse_id", None) else None,
        event_type=RETURN_RECEIPT_CREATED,
        description=f"Utworzono {doc_no}"
        + (f" ({new_line_count} poz.)" if new_line_count else ""),
        actor_user_id=actor_user_id,
        order_id=int(rmz.order_id) if rmz.order_id else None,
        rmz_id=rid,
        stock_document_id=doc_id,
        correlation_id=f"return:{rid}:zpz:{doc_id}",
        source_module="returns",
        category="status",
        severity="SUCCESS",
        rmz_label=rmz_no,
        order_label=f"#{order_no}" if order_no else None,
        document_label=doc_no,
        metadata={
            "rmz_number": rmz_no,
            "order_number": order_no,
            "document_number": doc_no,
            "document_type": getattr(doc, "document_type", None),
            "new_line_count": int(new_line_count),
        },
    )


def emit_return_putaway_completed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    rmz_id: int,
    order_id: Optional[int],
    doc: StockDocument,
    actor_user_id: Optional[int] = None,
    product_ids: Optional[list[int]] = None,
) -> None:
    rid = int(rmz_id)
    doc_id = int(doc.id)
    doc_no = str(getattr(doc, "document_number", None) or f"Z-PZ#{doc_id}")
    rmz = db.query(WmsOrderReturn).filter(WmsOrderReturn.id == rid).first()
    rmz_no = str(getattr(rmz, "rmz_number", None) or f"RMZ-{rid}") if rmz else f"RMZ-{rid}"
    oid = int(order_id) if order_id else (int(rmz.order_id) if rmz and rmz.order_id else None)
    order_no = _order_number(db, oid)
    first_pid = product_ids[0] if product_ids else None
    record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id) if warehouse_id else None,
        event_type=RETURN_PUTAWAY_COMPLETED,
        description=f"Rozlokowano przyjęcie {doc_no}",
        actor_user_id=actor_user_id,
        order_id=oid,
        rmz_id=rid,
        product_id=first_pid,
        stock_document_id=doc_id,
        correlation_id=f"return:{rid}:zpz:{doc_id}:putaway-done",
        source_module="returns",
        category="status",
        severity="SUCCESS",
        rmz_label=rmz_no,
        order_label=f"#{order_no}" if order_no else None,
        document_label=doc_no,
        metadata={
            "rmz_number": rmz_no,
            "order_number": order_no,
            "document_number": doc_no,
            "product_ids": list(product_ids or []),
        },
    )


def emit_return_finalized(
    db: Session,
    *,
    rmz: WmsOrderReturn,
    actor_user_id: Optional[int] = None,
    transition: Optional[str] = None,
    z_pz_document_id: Optional[int] = None,
) -> None:
    rid = int(rmz.id)
    rmz_no = str(getattr(rmz, "rmz_number", None) or f"RMZ-{rid}")
    order_no = _order_number(db, int(rmz.order_id) if rmz.order_id else None)
    record_domain_activity(
        db,
        tenant_id=int(rmz.tenant_id),
        warehouse_id=int(rmz.warehouse_id) if getattr(rmz, "warehouse_id", None) else None,
        event_type=RETURN_FINALIZED,
        description=f"Zwrot {rmz_no} zakończony",
        actor_user_id=actor_user_id,
        order_id=int(rmz.order_id) if rmz.order_id else None,
        rmz_id=rid,
        stock_document_id=int(z_pz_document_id) if z_pz_document_id else None,
        correlation_id=f"return:{rid}:finalized",
        source_module="returns",
        category="status",
        severity="SUCCESS",
        rmz_label=rmz_no,
        order_label=f"#{order_no}" if order_no else None,
        metadata={
            "rmz_number": rmz_no,
            "order_number": order_no,
            "transition": transition,
            "stock_document_id": int(z_pz_document_id) if z_pz_document_id else None,
        },
    )


def emit_component_recoveries_from_line_state(
    db: Session,
    *,
    rmz: WmsOrderReturn,
    line: RMZLine,
    actor_user_id: Optional[int] = None,
) -> None:
    """Emit recovery from ReturnLineBundleComponent and RmzLineComponentRecovery rows."""
    from ...models.return_line_bundle_component import ReturnLineBundleComponent
    from ...models.rmz_line_component_recovery import RmzLineComponentRecovery

    for cr in (
        db.query(ReturnLineBundleComponent)
        .filter(ReturnLineBundleComponent.return_line_id == int(line.id))
        .all()
    ):
        accepted = float(getattr(cr, "accepted_qty", 0) or 0)
        returned = float(getattr(cr, "returned_qty", 0) or 0)
        scrap = max(0.0, returned - accepted)
        if accepted <= 1e-9 and scrap <= 1e-9:
            continue
        snap = getattr(cr, "order_line_bundle_component_id", None)
        pid = None
        if snap:
            from ...models.order_line_bundle_component import OrderLineBundleComponent

            row = (
                db.query(OrderLineBundleComponent)
                .filter(OrderLineBundleComponent.id == int(snap))
                .first()
            )
            if row is not None:
                pid = int(getattr(row, "component_product_id", 0) or 0) or None
        if not pid:
            continue
        emit_return_component_recovery(
            db,
            rmz=rmz,
            line=line,
            component_product_id=pid,
            expected_qty=returned,
            accepted_qty=accepted,
            scrap_qty=scrap,
            source_row_id=int(cr.id) if getattr(cr, "id", None) else None,
            source="bundle",
            actor_user_id=actor_user_id,
        )

    for rec in (
        db.query(RmzLineComponentRecovery)
        .filter(RmzLineComponentRecovery.rmz_line_id == int(line.id))
        .all()
    ):
        accepted = float(getattr(rec, "accepted_qty", 0) or 0)
        expected = float(getattr(rec, "expected_qty", 0) or 0)
        scrap = float(getattr(rec, "scrap_qty", 0) or 0)
        if accepted <= 1e-9 and scrap <= 1e-9:
            continue
        pid = int(getattr(rec, "component_product_id", 0) or 0)
        if pid <= 0:
            continue
        emit_return_component_recovery(
            db,
            rmz=rmz,
            line=line,
            component_product_id=pid,
            expected_qty=expected,
            accepted_qty=accepted,
            scrap_qty=scrap,
            source_row_id=int(rec.id) if getattr(rec, "id", None) else None,
            source="manufacturing",
            actor_user_id=actor_user_id,
        )
