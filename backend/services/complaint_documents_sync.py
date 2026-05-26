"""Create / refresh complaint_documents rows and PDF files on triggers and manual regenerate."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Iterable, Optional, Set
from uuid import uuid4

from sqlalchemy.orm import Session

from ..models.complaint import Complaint
from ..models.complaint_document import ComplaintDocument
from ..models.complaint_line import ComplaintLine
from .complaint_document_pdf import (
    build_correction_pdf_bytes,
    build_decision_pdf_bytes,
    build_rma_pdf_bytes,
)
from .complaint_audit import append_complaint_audit_event

logger = logging.getLogger(__name__)

UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads"

DOCUMENT_TYPE_DECISION = "DECISION"
DOCUMENT_TYPE_CORRECTION = "CORRECTION"
DOCUMENT_TYPE_RMA = "RMA"

TITLE_BY_TYPE = {
    DOCUMENT_TYPE_DECISION: "Decyzja reklamacyjna",
    DOCUMENT_TYPE_CORRECTION: "Korekta faktury (informacja)",
    DOCUMENT_TYPE_RMA: "RMA — naprawa",
}


def _save_pdf_file(complaint_id: int, stem: str, pdf_bytes: bytes) -> str:
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in stem)[:48]
    uid = uuid4().hex[:10]
    name = f"{safe}_{uid}.pdf"
    d = UPLOAD_ROOT / "complaints" / str(int(complaint_id)) / "documents"
    d.mkdir(parents=True, exist_ok=True)
    path = d / name
    path.write_bytes(pdf_bytes)
    return f"/uploads/complaints/{int(complaint_id)}/documents/{name}"


def _delete_file_if_under_complaint(url: str, complaint_id: int) -> None:
    u = str(url).strip()
    if not u.startswith("/uploads/"):
        return
    rel = u[len("/uploads/") :].lstrip("/")
    seg = rel.split("/")
    if len(seg) < 2 or seg[0] != "complaints":
        return
    try:
        if int(seg[1]) != int(complaint_id):
            return
    except ValueError:
        return
    p = (UPLOAD_ROOT / rel).resolve()
    try:
        p.relative_to(UPLOAD_ROOT.resolve())
    except ValueError:
        return
    if p.is_file():
        try:
            p.unlink()
        except OSError as e:
            logger.warning("Could not unlink old PDF %s: %s", p, e)


def sync_decision_document(db: Session, c: Complaint) -> Optional[ComplaintDocument]:
    """One DECISION row per complaint — replace file when regenerating."""
    try:
        pdf = build_decision_pdf_bytes(c)
    except Exception:
        logger.exception("decision PDF failed complaint_id=%s", c.id)
        return None

    existing = (
        db.query(ComplaintDocument)
        .filter(
            ComplaintDocument.complaint_id == c.id,
            ComplaintDocument.type == DOCUMENT_TYPE_DECISION,
        )
        .first()
    )
    url = _save_pdf_file(c.id, "decision", pdf)
    now = datetime.utcnow()
    if existing:
        _delete_file_if_under_complaint(existing.file_url, c.id)
        existing.file_url = url
        existing.title = TITLE_BY_TYPE[DOCUMENT_TYPE_DECISION]
        existing.created_at = now
        existing.meta_json = None
        db.add(existing)
        return existing
    row = ComplaintDocument(
        complaint_id=c.id,
        type=DOCUMENT_TYPE_DECISION,
        file_url=url,
        title=TITLE_BY_TYPE[DOCUMENT_TYPE_DECISION],
        meta_json=None,
        created_at=now,
    )
    db.add(row)
    return row


def append_correction_document(db: Session, c: Complaint) -> Optional[ComplaintDocument]:
    try:
        pdf = build_correction_pdf_bytes(c, getattr(c, "order", None))
    except Exception:
        logger.exception("correction PDF failed complaint_id=%s", c.id)
        return None

    order = getattr(c, "order", None)
    meta = {
        "invoice_ref": str(getattr(order, "sales_document_number", None) or "").strip() or None,
        "order_number": str(getattr(order, "number", None) or "").strip() or None,
        "resolution_type": str(getattr(c, "resolution_type", None) or "").strip() or None,
        "amount": getattr(c, "resolution_amount", None),
        "currency": str(getattr(c, "resolution_currency", None) or "").strip() or None,
    }
    url = _save_pdf_file(c.id, "correction", pdf)
    row = ComplaintDocument(
        complaint_id=c.id,
        type=DOCUMENT_TYPE_CORRECTION,
        file_url=url,
        title=TITLE_BY_TYPE[DOCUMENT_TYPE_CORRECTION],
        meta_json=json.dumps(meta, ensure_ascii=False),
        created_at=datetime.utcnow(),
    )
    db.add(row)
    return row


def sync_rma_document(db: Session, c: Complaint) -> Optional[ComplaintDocument]:
    has_repair = any(
        str(getattr(ln, "line_decision", None)).strip().lower() == "repair" for ln in (getattr(c, "lines", None) or [])
    )
    existing = (
        db.query(ComplaintDocument)
        .filter(ComplaintDocument.complaint_id == c.id, ComplaintDocument.type == DOCUMENT_TYPE_RMA)
        .all()
    )

    if not has_repair:
        for ex in existing:
            _delete_file_if_under_complaint(ex.file_url, c.id)
            db.delete(ex)
        return None

    try:
        pdf = build_rma_pdf_bytes(c)
    except Exception:
        logger.exception("RMA PDF failed complaint_id=%s", c.id)
        return None

    for ex in existing:
        _delete_file_if_under_complaint(ex.file_url, c.id)
        db.delete(ex)

    url = _save_pdf_file(c.id, "rma", pdf)
    row = ComplaintDocument(
        complaint_id=c.id,
        type=DOCUMENT_TYPE_RMA,
        file_url=url,
        title=TITLE_BY_TYPE[DOCUMENT_TYPE_RMA],
        meta_json=None,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    return row


def maybe_sync_decision_on_terminal(db: Session, c: Complaint, new_status: str) -> None:
    st = str(new_status or "").strip().upper()
    if st not in ("ZAAKCEPTOWANA", "ODRZUCONA"):
        return
    row = sync_decision_document(db, c)
    if row:
        append_complaint_audit_event(
            db,
            c.id,
            "complaint_document_generated",
            "Wygenerowano PDF decyzji reklamacyjnej.",
            meta={"type": DOCUMENT_TYPE_DECISION, "file_url": row.file_url},
        )


def maybe_sync_correction_on_refund(db: Session, c: Complaint, resolution_type: str) -> None:
    rt = str(resolution_type or "").strip().upper()
    if rt not in ("REFUND", "PARTIAL_REFUND"):
        return
    row = append_correction_document(db, c)
    if row:
        append_complaint_audit_event(
            db,
            c.id,
            "complaint_document_generated",
            "Wygenerowano dokument korekty (informacja).",
            meta={"type": DOCUMENT_TYPE_CORRECTION, "file_url": row.file_url},
        )


def maybe_sync_rma_on_lines(db: Session, c: Complaint) -> None:
    row = sync_rma_document(db, c)
    if row:
        append_complaint_audit_event(
            db,
            c.id,
            "complaint_document_generated",
            "Wygenerowano / zaktualizowano dokument RMA (naprawa).",
            meta={"type": DOCUMENT_TYPE_RMA, "file_url": row.file_url},
        )


def regenerate_complaint_documents(
    db: Session,
    c: Complaint,
    types: Optional[Iterable[str]] = None,
) -> Set[str]:
    """Regenerate applicable documents. Returns set of type codes refreshed."""
    want: Set[str] = {str(x).strip().upper() for x in types} if types else {
        DOCUMENT_TYPE_DECISION,
        DOCUMENT_TYPE_CORRECTION,
        DOCUMENT_TYPE_RMA,
    }
    done: Set[str] = set()

    if DOCUMENT_TYPE_DECISION in want:
        st = str(getattr(c, "status", None) or "").strip().upper()
        if st in ("ZAAKCEPTOWANA", "ODRZUCONA"):
            if sync_decision_document(db, c):
                done.add(DOCUMENT_TYPE_DECISION)

    if DOCUMENT_TYPE_CORRECTION in want:
        rt = str(getattr(c, "resolution_type", None) or "").strip().upper()
        if rt in ("REFUND", "PARTIAL_REFUND"):
            if append_correction_document(db, c):
                done.add(DOCUMENT_TYPE_CORRECTION)

    if DOCUMENT_TYPE_RMA in want:
        if sync_rma_document(db, c):
            done.add(DOCUMENT_TYPE_RMA)

    if done:
        append_complaint_audit_event(
            db,
            c.id,
            "complaint_documents_regenerated",
            "Ręczna regeneracja dokumentów: " + ", ".join(sorted(done)),
            meta={"types": sorted(done)},
        )
    return done
