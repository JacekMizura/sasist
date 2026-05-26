"""Walidacja i normalizacja wartości dodatkowych pól zamówienia."""

from __future__ import annotations

import json
import math
import re
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from ..models.order_custom_field import OrderCustomField
from ..models.order_document import OrderDocument
from ..schemas.order_custom_field import OrderCustomFieldOptionRead, OrderCustomFieldRead, OrderCustomFieldValueStore

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_URL_RE = re.compile(r"^https?://", re.I)


def parse_settings(raw: Optional[str]) -> Dict[str, Any]:
    if not raw or not str(raw).strip():
        return {}
    try:
        d = json.loads(raw)
        return d if isinstance(d, dict) else {}
    except json.JSONDecodeError:
        return {}


def default_settings_for_type(field_type: str) -> Dict[str, Any]:
    if field_type == "TEXT":
        return {"text": {"subtype": "any", "multiline": False}, "future": {}}
    if field_type == "NUMBER":
        return {"number": {"min": None, "max": None, "decimals": 2}, "future": {}}
    if field_type == "FILES":
        return {"files": {"mode": "documents"}, "future": {}}
    if field_type in ("SELECT_SINGLE", "SELECT_MULTI"):
        return {"select": {"multi": field_type == "SELECT_MULTI"}, "future": {}}
    if field_type in ("SALES_DOCUMENT", "SHIPPING_LABEL"):
        return {"files": {"mode": "documents"}, "future": {}}
    return {"future": {}}


def slugify_name(name: str) -> str:
    s = (name or "").strip().lower()
    s = re.sub(r"[^a-z0-9ąćęłńóśźż]+", "-", s, flags=re.I)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:120] if s else "field"


def validate_text(subtype: str, val: str) -> Tuple[bool, Optional[str]]:
    st = (subtype or "any").lower()
    if st == "email":
        if not _EMAIL_RE.match(val.strip()):
            return False, "Nieprawidłowy adres e-mail."
    elif st == "url":
        if not _URL_RE.match(val.strip()):
            return False, "URL musi zaczynać się od http:// lub https://"
    return True, None


def validate_number(settings: Dict[str, Any], val: float) -> Tuple[bool, Optional[str]]:
    num_s = settings.get("number") or {}
    mn = num_s.get("min")
    mx = num_s.get("max")
    if mn is not None and val < float(mn):
        return False, f"Wartość musi być ≥ {mn}"
    if mx is not None and val > float(mx):
        return False, f"Wartość musi być ≤ {mx}"
    if math.isnan(val) or math.isinf(val):
        return False, "Nieprawidłowa liczba"
    return True, None


def _allowed_ext_for_files_mode(mode: str) -> Tuple[set, set]:
    m = (mode or "documents").lower()
    images = {".png", ".svg", ".gif", ".jpg", ".jpeg", ".webp"}
    docs = {".doc", ".docx", ".pdf", ".xlsx", ".txt"}
    if m == "images":
        return images, set()
    if m == "documents":
        return set(), docs
    return images, docs


def validate_files_json(settings: Dict[str, Any], data: Any) -> Tuple[bool, Optional[str]]:
    if not isinstance(data, list):
        return False, "Oczekiwano listy plików."
    mode = ((settings.get("files") or {}).get("mode") or "documents")
    allow_img, allow_doc = _allowed_ext_for_files_mode(mode)
    allow = allow_img | allow_doc
    for item in data:
        if not isinstance(item, dict):
            return False, "Nieprawidłowy wpis pliku."
        name = (item.get("original_filename") or item.get("name") or "").lower()
        ext = ""
        if "." in name:
            ext = "." + name.rsplit(".", 1)[-1]
        if ext and allow and ext not in allow:
            return False, f"Niedozwolone rozszerzenie: {ext}"
    return True, None


def validate_single_attachment_files_json(settings: Dict[str, Any], data: Any) -> Tuple[bool, Optional[str]]:
    """Jak FILES, ale najwyżej jeden plik (Dokument sprzedaży / list przewozowy jako załącznik)."""
    if not isinstance(data, list):
        return False, "Oczekiwano listy plików."
    if len(data) > 1:
        return False, "Można dodać najwyżej jeden plik."
    ok, err = validate_files_json(settings, data)
    if not ok:
        return ok, err
    for item in data:
        if not isinstance(item, dict):
            return False, "Nieprawidłowy wpis pliku."
        if not str(item.get("file_url") or "").strip():
            return False, "Brak adresu pliku."
    return True, None


def validate_select(
    db: Session,
    field: OrderCustomField,
    field_type: str,
    data: Any,
) -> Tuple[bool, Optional[str]]:
    opt_ids = {o.id for o in field.options}
    if field_type == "SELECT_SINGLE":
        if data is None:
            return True, None
        oid = int(data) if not isinstance(data, dict) else int(data.get("option_id") or data.get("id") or 0)
        if oid and oid not in opt_ids:
            return False, "Nieprawidłowa opcja."
        return True, None
    if field_type == "SELECT_MULTI":
        if data is None:
            return True, None
        ids = data if isinstance(data, list) else []
        for x in ids:
            xi = int(x) if not isinstance(x, dict) else int(x.get("option_id") or x.get("id") or 0)
            if xi and xi not in opt_ids:
                return False, "Nieprawidłowa opcja."
        return True, None
    return True, None


def validate_sales_document_pick(db: Session, tenant_id: int, warehouse_id: int, order_id: int, data: Any) -> Tuple[bool, Optional[str]]:
    if data is None:
        return True, None
    doc_id = int(data.get("order_document_id") or data.get("document_id") or 0) if isinstance(data, dict) else int(data or 0)
    if not doc_id:
        return True, None
    row = (
        db.query(OrderDocument)
        .filter(
            OrderDocument.id == doc_id,
            OrderDocument.order_id == order_id,
            OrderDocument.tenant_id == tenant_id,
            OrderDocument.warehouse_id == warehouse_id,
        )
        .first()
    )
    if not row:
        return False, "Dokument nie należy do tego zamówienia."
    return True, None


def validate_shipping_label_pick(db: Session, tenant_id: int, warehouse_id: int, order_id: int, data: Any) -> Tuple[bool, Optional[str]]:
    """List przewozowy lub numer — ten sam mechanizm co dokument (LIST_PRZEWOZOWY)."""
    return validate_sales_document_pick(db, tenant_id, warehouse_id, order_id, data)


def normalize_value_for_storage(
    db: Session,
    field: OrderCustomField,
    incoming: OrderCustomFieldValueStore,
    order_id: int,
    tenant_id: int,
    warehouse_id: int,
) -> Tuple[Optional[str], Optional[float], Optional[str], Optional[str]]:
    """Zwraca (value_string, value_number, value_json_str, error_message)."""
    ft = (field.type or "").strip().upper()
    settings = parse_settings(field.settings_json)

    if ft == "TEXT":
        s = (incoming.string_value or "").strip()
        if not s:
            return None, None, None, None
        sub = ((settings.get("text") or {}).get("subtype") or "any").lower()
        ok, err = validate_text(sub, s)
        if not ok:
            return None, None, None, err
        return s, None, None, None

    if ft == "NUMBER":
        if incoming.number_value is None and incoming.string_value is not None:
            try:
                incoming.number_value = float(str(incoming.string_value).replace(",", "."))
            except (TypeError, ValueError):
                return None, None, None, "Nieprawidłowa liczba."
        if incoming.number_value is None:
            return None, None, None, None
        nv = float(incoming.number_value)
        ok, err = validate_number(settings, nv)
        if not ok:
            return None, None, None, err
        dec = (settings.get("number") or {}).get("decimals")
        if dec is not None and int(dec) >= 0:
            nv = round(nv, int(dec))
        return None, nv, None, None

    if ft == "FILES":
        j = incoming.json_value
        if j is None:
            return None, None, None, None
        ok, err = validate_files_json(settings, j)
        if not ok:
            return None, None, None, err
        return None, None, json.dumps(j, ensure_ascii=False), None

    if ft in ("SELECT_SINGLE", "SELECT_MULTI"):
        j = incoming.json_value
        if ft == "SELECT_SINGLE":
            if j is None and incoming.string_value is not None:
                try:
                    j = int(incoming.string_value)
                except ValueError:
                    return None, None, None, "Wybierz opcję."
            ok, err = validate_select(db, field, ft, j)
            if not ok:
                return None, None, None, err
            if j is None:
                return None, None, None, None
            oid = int(j) if not isinstance(j, dict) else int(j.get("option_id") or j.get("id"))
            return str(oid), None, None, None
        if j is None or (isinstance(j, list) and len(j) == 0):
            return None, None, None, None
        ok, err = validate_select(db, field, ft, j)
        if not ok:
            return None, None, None, err
        return None, None, json.dumps(j, ensure_ascii=False), None

    if ft == "SALES_DOCUMENT":
        j = incoming.json_value
        if isinstance(j, list):
            if not j:
                return None, None, None, None
            ok, err = validate_single_attachment_files_json(settings, j)
            if not ok:
                return None, None, None, err
            return None, None, json.dumps(j, ensure_ascii=False), None
        jdict = j if isinstance(j, dict) else {}
        if not jdict and incoming.string_value:
            try:
                jdict = {"order_document_id": int(incoming.string_value)}
            except ValueError:
                jdict = {}
        ok, err = validate_sales_document_pick(db, tenant_id, warehouse_id, order_id, jdict)
        if not ok:
            return None, None, None, err
        if not jdict:
            return None, None, None, None
        return None, None, json.dumps(jdict, ensure_ascii=False), None

    if ft == "SHIPPING_LABEL":
        j = incoming.json_value
        if isinstance(j, list):
            if not j:
                return None, None, None, None
            ok, err = validate_single_attachment_files_json(settings, j)
            if not ok:
                return None, None, None, err
            return None, None, json.dumps(j, ensure_ascii=False), None
        jdict = j if isinstance(j, dict) else {}
        if not jdict and incoming.string_value:
            try:
                jdict = {"order_document_id": int(incoming.string_value)}
            except ValueError:
                jdict = {}
        ok, err = validate_shipping_label_pick(db, tenant_id, warehouse_id, order_id, jdict)
        if not ok:
            return None, None, None, err
        if not jdict:
            return None, None, None, None
        return None, None, json.dumps(jdict, ensure_ascii=False), None

    return None, None, None, f"Nieobsługiwany typ pola: {ft}"


def serialize_field_definition(row: OrderCustomField) -> OrderCustomFieldRead:
    opts = sorted(row.options or [], key=lambda o: (o.sort_order, o.id))
    return OrderCustomFieldRead(
        id=int(row.id),
        tenant_id=int(row.tenant_id),
        warehouse_id=int(row.warehouse_id),
        name=str(row.name),
        slug=str(row.slug),
        type=str(row.type),
        settings_json=parse_settings(row.settings_json),
        icon_file_id=row.icon_file_id,
        sort_order=int(row.sort_order or 0),
        is_active=bool(row.is_active),
        options=[
            OrderCustomFieldOptionRead(
                id=int(o.id),
                label=str(o.label),
                icon_file_id=o.icon_file_id,
                sort_order=int(o.sort_order or 0),
            )
            for o in opts
        ],
    )


def deserialize_value_row(field_type: str, string_v: Optional[str], number_v: Optional[float], json_v: Optional[str]) -> Dict[str, Any]:
    ft = (field_type or "").strip().upper()
    out: Dict[str, Any] = {}
    if json_v:
        try:
            out["json_value"] = json.loads(json_v)
        except json.JSONDecodeError:
            out["json_value"] = None
    else:
        out["json_value"] = None
    if ft == "TEXT":
        out["string_value"] = string_v
    elif ft == "NUMBER":
        out["number_value"] = number_v
    elif ft == "FILES":
        pass
    elif ft == "SELECT_SINGLE":
        out["string_value"] = string_v
        if string_v and string_v.isdigit():
            out["json_value"] = int(string_v)
    elif ft == "SELECT_MULTI":
        pass
    elif ft in ("SALES_DOCUMENT", "SHIPPING_LABEL"):
        pass
    return out
