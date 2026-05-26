"""Synchronizacja listy plików w wartości pola FILES z tabelą ``order_documents``."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from sqlalchemy.orm import Session

from ..models.order_document import OrderDocument
from ..models.order_document_type_enum import OrderDocumentType

_BACKEND_DIR = Path(__file__).resolve().parent.parent
UPLOADS_ROOT = _BACKEND_DIR / "uploads"


def _parse_list(raw: Optional[str]) -> List[Dict[str, Any]]:
    if not raw or not str(raw).strip():
        return []
    try:
        j = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if isinstance(j, list):
        return [x for x in j if isinstance(x, dict)]
    if isinstance(j, dict) and (j.get("file_url") or j.get("order_document_id") is not None):
        return [j]
    return []


def _unlink_upload_file(file_url: str) -> None:
    if not file_url or "/uploads/" not in file_url:
        return
    try:
        rel = file_url.split("/uploads/", 1)[1].lstrip("/")
        path = (UPLOADS_ROOT / rel).resolve()
        root = UPLOADS_ROOT.resolve()
        if root in path.parents and path.is_file():
            path.unlink(missing_ok=True)
    except OSError:
        pass


def ensure_attachment_json_links_order_documents(
    db: Session,
    *,
    order_id: int,
    tenant_id: int,
    warehouse_id: int,
    field_type_upper: str,
    value_json_str: str,
) -> str:
    """Dopisuje ``order_document_id`` do wpisów z ``file_url`` — jeden rekord ``order_documents`` na URL (bez duplikatu pliku)."""
    try:
        parsed: Any = json.loads(value_json_str)
    except (json.JSONDecodeError, TypeError, ValueError):
        return value_json_str

    doc_type_map = {
        "FILES": OrderDocumentType.ZALACZNIK.value,
        "SALES_DOCUMENT": OrderDocumentType.DOKUMENT_SPRZEDAZY.value,
        "SHIPPING_LABEL": OrderDocumentType.LIST_PRZEWOZOWY.value,
    }
    doc_type = doc_type_map.get((field_type_upper or "").strip().upper(), OrderDocumentType.ZALACZNIK.value)

    def link_item(item: Dict[str, Any]) -> bool:
        url = str(item.get("file_url") or "").strip()
        if not url:
            return False
        changed_local = False
        row: Optional[OrderDocument] = None
        oid_raw = item.get("order_document_id")
        if oid_raw is not None:
            try:
                row = (
                    db.query(OrderDocument)
                    .filter(
                        OrderDocument.id == int(oid_raw),
                        OrderDocument.order_id == int(order_id),
                        OrderDocument.tenant_id == int(tenant_id),
                        OrderDocument.warehouse_id == int(warehouse_id),
                    )
                    .first()
                )
            except (TypeError, ValueError):
                row = None
        if row is None:
            row = (
                db.query(OrderDocument)
                .filter(
                    OrderDocument.order_id == int(order_id),
                    OrderDocument.tenant_id == int(tenant_id),
                    OrderDocument.warehouse_id == int(warehouse_id),
                    OrderDocument.file_url == url,
                )
                .first()
            )
        if row is None:
            orig = str(item.get("original_filename") or "file").strip() or "file"
            stored = str(item.get("stored_filename") or "").strip()
            if not stored:
                tail = url.rsplit("/", 1)[-1] if "/" in url else url
                stored = tail[:512]
            row = OrderDocument(
                order_id=int(order_id),
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                document_type=doc_type,
                original_filename=orig[:512],
                stored_filename=stored[:512],
                file_url=url[:512],
            )
            db.add(row)
            db.flush()
            changed_local = True
        new_id = int(row.id)
        try:
            cur_oid = int(item["order_document_id"]) if item.get("order_document_id") is not None else None
        except (TypeError, ValueError):
            cur_oid = None
        if cur_oid != new_id:
            item["order_document_id"] = new_id
            changed_local = True
        return changed_local

    changed = False
    if isinstance(parsed, list):
        for el in parsed:
            if isinstance(el, dict) and link_item(el):
                changed = True
        return json.dumps(parsed, ensure_ascii=False) if changed else value_json_str
    if isinstance(parsed, dict):
        if link_item(parsed):
            return json.dumps(parsed, ensure_ascii=False)
    return value_json_str


def sync_files_value_order_documents(
    db: Session,
    *,
    order_id: int,
    tenant_id: int,
    warehouse_id: int,
    old_json_str: Optional[str],
    new_json_str: Optional[str],
) -> None:
    """Usuwa dokumenty usunięte z JSON; aktualizuje nazwę pliku dla pozostałych."""
    old_list = _parse_list(old_json_str)
    new_list = _parse_list(new_json_str)

    def doc_ids(lst: List[Dict[str, Any]]) -> Set[int]:
        out: Set[int] = set()
        for x in lst:
            if not isinstance(x, dict):
                continue
            oid = x.get("order_document_id")
            if oid is not None:
                try:
                    out.add(int(oid))
                except (TypeError, ValueError):
                    pass
        return out

    old_ids = doc_ids(old_list)
    new_ids = doc_ids(new_list)
    removed = old_ids - new_ids

    for rid in removed:
        row = (
            db.query(OrderDocument)
            .filter(
                OrderDocument.id == int(rid),
                OrderDocument.order_id == int(order_id),
                OrderDocument.tenant_id == int(tenant_id),
                OrderDocument.warehouse_id == int(warehouse_id),
            )
            .first()
        )
        if row is not None:
            _unlink_upload_file(str(row.file_url or ""))
            db.delete(row)

    by_id: Dict[int, Dict[str, Any]] = {}
    for x in new_list:
        if isinstance(x, dict) and x.get("order_document_id") is not None:
            try:
                by_id[int(x["order_document_id"])] = x
            except (TypeError, ValueError):
                pass

    for nid, meta in by_id.items():
        row = (
            db.query(OrderDocument)
            .filter(
                OrderDocument.id == int(nid),
                OrderDocument.order_id == int(order_id),
                OrderDocument.tenant_id == int(tenant_id),
                OrderDocument.warehouse_id == int(warehouse_id),
            )
            .first()
        )
        if row is None:
            continue
        name = (meta.get("original_filename") or "").strip()
        if name and name != (row.original_filename or ""):
            row.original_filename = name[:512]


def _urls_from_attachment_list(lst: List[Dict[str, Any]]) -> Set[str]:
    out: Set[str] = set()
    for x in lst:
        if not isinstance(x, dict):
            continue
        u = str(x.get("file_url") or "").strip()
        if u:
            out.add(u)
    return out


def sync_custom_field_attached_files(
    db: Session,
    *,
    order_id: int,
    tenant_id: int,
    warehouse_id: int,
    old_json_str: Optional[str],
    new_json_str: Optional[str],
) -> None:
    """Usuwa z dysku (i z ``order_documents``) pliki, które zniknęły z listy JSON pola (np. SALES_DOCUMENT / SHIPPING_LABEL)."""
    old_list = _parse_list(old_json_str)
    new_list = _parse_list(new_json_str)

    old_urls = _urls_from_attachment_list(old_list)
    new_urls = _urls_from_attachment_list(new_list)
    removed_urls = old_urls - new_urls

    for url in removed_urls:
        row = (
            db.query(OrderDocument)
            .filter(
                OrderDocument.order_id == int(order_id),
                OrderDocument.tenant_id == int(tenant_id),
                OrderDocument.warehouse_id == int(warehouse_id),
                OrderDocument.file_url == url,
            )
            .first()
        )
        if row is not None:
            _unlink_upload_file(str(row.file_url or ""))
            db.delete(row)
        else:
            _unlink_upload_file(url)

    by_id: Dict[int, Dict[str, Any]] = {}
    for x in new_list:
        if isinstance(x, dict) and x.get("order_document_id") is not None:
            try:
                by_id[int(x["order_document_id"])] = x
            except (TypeError, ValueError):
                pass

    for nid, meta in by_id.items():
        row = (
            db.query(OrderDocument)
            .filter(
                OrderDocument.id == int(nid),
                OrderDocument.order_id == int(order_id),
                OrderDocument.tenant_id == int(tenant_id),
                OrderDocument.warehouse_id == int(warehouse_id),
            )
            .first()
        )
        if row is None:
            continue
        name = (meta.get("original_filename") or "").strip()
        if name and name != (row.original_filename or ""):
            row.original_filename = name[:512]
