"""Downloadable inventory audit package — ZIP with reports and audit trail."""

from __future__ import annotations

import io
import json
import zipfile
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.audit_event import InventoryAuditEvent
from ...models.inventory_count.constants import AUDIT_AUDIT_PACKAGE, REPORT_FORMAT_XLSX
from ...models.inventory_count.document import InventoryDocument
from .audit_service import log_inventory_audit
from .errors import InventoryDocumentNotFoundError
from .report_service import REPORT_KINDS, generate_inventory_report


AUDIT_PACKAGE_KINDS = (
    "counting_sheet",
    "differences",
    "missing_stock",
    "excess_stock",
    "adjustments",
    "user_activity",
    "opening_balance",
    "recount",
)


def build_audit_package(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    user_id: int | None = None,
) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Document {document_id} not found")

    zip_buffer = io.BytesIO()
    files_added = 0
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for kind in AUDIT_PACKAGE_KINDS:
            if kind not in REPORT_KINDS:
                continue
            try:
                result = generate_inventory_report(
                    db,
                    tenant_id=tenant_id,
                    document_id=document_id,
                    report_kind=kind,
                    report_format=REPORT_FORMAT_XLSX,
                    user_id=user_id,
                )
                zf.writestr(result["file_name"], result["content"])
                files_added += 1
            except Exception:
                continue

        audit_rows = (
            db.query(InventoryAuditEvent)
            .filter(InventoryAuditEvent.inventory_document_id == int(doc.id))
            .order_by(InventoryAuditEvent.created_at.asc())
            .all()
        )
        audit_json = [
            {
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "action": r.action,
                "user_id": r.user_id,
                "detail": r.detail_json,
            }
            for r in audit_rows
        ]
        zf.writestr("audit_log.json", json.dumps(audit_json, ensure_ascii=False, indent=2))
        files_added += 1

        manifest = {
            "document_number": doc.number,
            "document_id": doc.id,
            "status": doc.status,
            "files": list(AUDIT_PACKAGE_KINDS) + ["audit_log.json"],
        }
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

    content = zip_buffer.getvalue()
    log_inventory_audit(
        db,
        tenant_id=int(tenant_id),
        inventory_document_id=int(doc.id),
        user_id=user_id,
        action=AUDIT_AUDIT_PACKAGE,
        detail={"files": files_added},
    )
    db.commit()
    return {
        "file_name": f"inventory_audit_{doc.number.replace('/', '_')}.zip",
        "content": content,
        "files_added": files_added,
    }
