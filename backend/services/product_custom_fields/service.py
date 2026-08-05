"""CRUD + values for product custom fields."""

from __future__ import annotations

import json
import math
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session, joinedload

from ...models.product import Product
from ...models.product_custom_field import (
    ProductCustomField,
    ProductCustomFieldOption,
    ProductCustomFieldValue,
)
from ...schemas.product_custom_field import PRODUCT_CUSTOM_FIELD_TYPES, PRODUCT_ATTACHMENT_KINDS


class ProductCustomFieldError(Exception):
    def __init__(self, message: str, *, code: str = "pcf_error"):
        super().__init__(message)
        self.message = message
        self.code = code


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


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
        return {"text": {"subtype": "any", "multiline": False}}
    if field_type == "NUMBER":
        return {"number": {"min": None, "max": None, "decimals": 2}}
    if field_type == "FILES":
        return {"files": {"mode": "both"}}
    if field_type in ("SELECT_SINGLE", "SELECT_MULTI"):
        return {"select": {"multi": field_type == "SELECT_MULTI"}}
    if field_type == "GPSR_ATTACHMENTS":
        return {"files": {"mode": "documents"}, "gpsr": True}
    if field_type == "ATTACHMENTS":
        return {"files": {"mode": "documents"}, "attachments": {"kind": "poradnik"}}
    return {}


def slugify_name(name: str) -> str:
    s = (name or "").strip().lower()
    s = re.sub(r"[^a-z0-9ąćęłńóśźż]+", "-", s, flags=re.I)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:120] if s else "field"


def serialize_field(field: ProductCustomField) -> dict:
    opts = sorted(list(field.options or []), key=lambda o: (int(o.sort_order or 0), int(o.id or 0)))
    return {
        "id": int(field.id),
        "tenant_id": int(field.tenant_id),
        "name": field.name,
        "slug": field.slug,
        "type": field.type,
        "settings_json": parse_settings(field.settings_json),
        "sort_order": int(field.sort_order or 0),
        "is_active": bool(field.is_active),
        "options": [
            {"id": int(o.id), "label": o.label, "sort_order": int(o.sort_order or 0)} for o in opts
        ],
    }


def list_fields(db: Session, tenant_id: int, *, include_inactive: bool = True) -> List[ProductCustomField]:
    q = (
        db.query(ProductCustomField)
        .options(joinedload(ProductCustomField.options))
        .filter(ProductCustomField.tenant_id == tenant_id)
    )
    if not include_inactive:
        q = q.filter(ProductCustomField.is_active.is_(True))
    return q.order_by(ProductCustomField.sort_order.asc(), ProductCustomField.id.asc()).all()


def get_field(db: Session, tenant_id: int, field_id: int) -> ProductCustomField:
    row = (
        db.query(ProductCustomField)
        .options(joinedload(ProductCustomField.options))
        .filter(ProductCustomField.id == field_id, ProductCustomField.tenant_id == tenant_id)
        .first()
    )
    if row is None:
        raise ProductCustomFieldError("Nie znaleziono pola.", code="field_not_found")
    return row


def _unique_slug(db: Session, tenant_id: int, base: str, *, exclude_id: Optional[int] = None) -> str:
    slug = slugify_name(base) or "field"
    candidate = slug
    n = 2
    while True:
        q = db.query(ProductCustomField.id).filter(
            ProductCustomField.tenant_id == tenant_id,
            ProductCustomField.slug == candidate,
        )
        if exclude_id is not None:
            q = q.filter(ProductCustomField.id != exclude_id)
        if q.first() is None:
            return candidate
        candidate = f"{slug}-{n}"[:128]
        n += 1


def _replace_options(db: Session, field: ProductCustomField, options: List[dict]) -> None:
    existing = {int(o.id): o for o in (field.options or [])}
    keep: set[int] = set()
    for idx, raw in enumerate(options):
        label = str(raw.get("label") or "").strip()
        if not label:
            continue
        oid = raw.get("id")
        if oid is not None and int(oid) in existing:
            opt = existing[int(oid)]
            keep.add(int(oid))
        else:
            opt = ProductCustomFieldOption(field_id=int(field.id))
            db.add(opt)
            field.options.append(opt)
        opt.label = label
        opt.sort_order = int(raw.get("sort_order") if raw.get("sort_order") is not None else idx)
    for oid, opt in existing.items():
        if oid not in keep:
            db.delete(opt)


def _normalize_type(raw: str) -> str:
    t = (raw or "").strip().upper()
    if t not in PRODUCT_CUSTOM_FIELD_TYPES:
        raise ProductCustomFieldError(f"Nieobsługiwany rodzaj pola: {raw}", code="invalid_type")
    return t


def _normalize_settings(field_type: str, settings: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    base = default_settings_for_type(field_type)
    if not settings:
        return base
    merged = {**base, **settings}
    if field_type == "ATTACHMENTS":
        kind = ((settings.get("attachments") or {}).get("kind") if isinstance(settings.get("attachments"), dict) else None) or (
            (base.get("attachments") or {}).get("kind")
        )
        allowed = {k for k, _ in PRODUCT_ATTACHMENT_KINDS}
        if kind not in allowed:
            kind = "poradnik"
        merged["attachments"] = {"kind": kind}
        merged["files"] = settings.get("files") or base.get("files") or {"mode": "documents"}
    return merged


def create_field(
    db: Session,
    tenant_id: int,
    *,
    name: str,
    type: str,
    slug: Optional[str] = None,
    settings_json: Optional[Dict[str, Any]] = None,
    sort_order: int = 0,
    is_active: bool = True,
    options: Optional[List[dict]] = None,
) -> ProductCustomField:
    cleaned = (name or "").strip()
    if not cleaned:
        raise ProductCustomFieldError("Nazwa pola jest wymagana.", code="name_required")
    ft = _normalize_type(type)
    if ft in ("SELECT_SINGLE", "SELECT_MULTI") and not (options or []):
        raise ProductCustomFieldError("Lista wymaga co najmniej jednej opcji.", code="options_required")
    settings = _normalize_settings(ft, settings_json)
    row = ProductCustomField(
        tenant_id=tenant_id,
        name=cleaned,
        slug=_unique_slug(db, tenant_id, slug or cleaned),
        type=ft,
        settings_json=json.dumps(settings, ensure_ascii=False),
        sort_order=int(sort_order or 0),
        is_active=bool(is_active),
    )
    db.add(row)
    db.flush()
    if ft in ("SELECT_SINGLE", "SELECT_MULTI"):
        _replace_options(db, row, options or [])
    db.flush()
    return get_field(db, tenant_id, int(row.id))


def update_field(
    db: Session,
    tenant_id: int,
    field_id: int,
    *,
    name: str,
    type: str,
    slug: Optional[str] = None,
    settings_json: Optional[Dict[str, Any]] = None,
    sort_order: int = 0,
    is_active: bool = True,
    options: Optional[List[dict]] = None,
) -> ProductCustomField:
    row = get_field(db, tenant_id, field_id)
    cleaned = (name or "").strip()
    if not cleaned:
        raise ProductCustomFieldError("Nazwa pola jest wymagana.", code="name_required")
    ft = _normalize_type(type)
    if ft in ("SELECT_SINGLE", "SELECT_MULTI") and not (options or []):
        raise ProductCustomFieldError("Lista wymaga co najmniej jednej opcji.", code="options_required")
    row.name = cleaned
    row.slug = _unique_slug(db, tenant_id, slug or cleaned, exclude_id=int(row.id))
    row.type = ft
    row.settings_json = json.dumps(_normalize_settings(ft, settings_json), ensure_ascii=False)
    row.sort_order = int(sort_order or 0)
    row.is_active = bool(is_active)
    row.updated_at = _now()
    if ft in ("SELECT_SINGLE", "SELECT_MULTI"):
        _replace_options(db, row, options or [])
    else:
        for opt in list(row.options or []):
            db.delete(opt)
    db.flush()
    return get_field(db, tenant_id, field_id)


def delete_field(db: Session, tenant_id: int, field_id: int) -> None:
    row = get_field(db, tenant_id, field_id)
    db.delete(row)
    db.flush()


def bulk_delete_fields(db: Session, tenant_id: int, ids: List[int]) -> int:
    n = 0
    for fid in ids:
        try:
            delete_field(db, tenant_id, int(fid))
            n += 1
        except ProductCustomFieldError:
            continue
    return n


def _validate_files(data: Any) -> Tuple[bool, Optional[str]]:
    if data is None:
        return True, None
    if not isinstance(data, list):
        return False, "Oczekiwano listy plików."
    for item in data:
        if not isinstance(item, dict):
            return False, "Nieprawidłowy wpis pliku."
        if not str(item.get("file_url") or "").strip():
            return False, "Brak adresu pliku."
    return True, None


def _validate_select(field: ProductCustomField, field_type: str, data: Any) -> Tuple[bool, Optional[str]]:
    opt_ids = {int(o.id) for o in (field.options or [])}
    if field_type == "SELECT_SINGLE":
        if data is None or data == "":
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


def _apply_value(row: ProductCustomFieldValue, field: ProductCustomField, store: dict) -> None:
    ft = field.type
    settings = parse_settings(field.settings_json)
    if ft == "TEXT":
        row.value_string = (store.get("string_value") or None)
        row.value_number = None
        row.value_json = None
        return
    if ft == "NUMBER":
        nv = store.get("number_value")
        if nv is not None:
            try:
                val = float(nv)
            except (TypeError, ValueError) as e:
                raise ProductCustomFieldError("Nieprawidłowa liczba.", code="invalid_number") from e
            if math.isnan(val) or math.isinf(val):
                raise ProductCustomFieldError("Nieprawidłowa liczba.", code="invalid_number")
            num_s = settings.get("number") or {}
            if num_s.get("min") is not None and val < float(num_s["min"]):
                raise ProductCustomFieldError(f"Wartość musi być ≥ {num_s['min']}", code="number_min")
            if num_s.get("max") is not None and val > float(num_s["max"]):
                raise ProductCustomFieldError(f"Wartość musi być ≤ {num_s['max']}", code="number_max")
            row.value_number = val
        else:
            row.value_number = None
        row.value_string = None
        row.value_json = None
        return
    if ft in ("FILES", "GPSR_ATTACHMENTS", "ATTACHMENTS"):
        data = store.get("json_value")
        ok, err = _validate_files(data)
        if not ok:
            raise ProductCustomFieldError(err or "Nieprawidłowe pliki.", code="invalid_files")
        row.value_json = json.dumps(data or [], ensure_ascii=False)
        row.value_string = None
        row.value_number = None
        return
    if ft == "SELECT_SINGLE":
        data = store.get("json_value")
        if data is None and store.get("string_value"):
            data = store.get("string_value")
        ok, err = _validate_select(field, ft, data)
        if not ok:
            raise ProductCustomFieldError(err or "Nieprawidłowa opcja.", code="invalid_option")
        oid = None
        if data is not None and data != "":
            oid = int(data) if not isinstance(data, dict) else int(data.get("option_id") or data.get("id") or 0)
        row.value_string = str(oid) if oid else None
        row.value_json = None
        row.value_number = None
        return
    if ft == "SELECT_MULTI":
        data = store.get("json_value")
        ok, err = _validate_select(field, ft, data)
        if not ok:
            raise ProductCustomFieldError(err or "Nieprawidłowa opcja.", code="invalid_option")
        ids = []
        if isinstance(data, list):
            for x in data:
                xi = int(x) if not isinstance(x, dict) else int(x.get("option_id") or x.get("id") or 0)
                if xi:
                    ids.append(xi)
        row.value_json = json.dumps(ids, ensure_ascii=False)
        row.value_string = None
        row.value_number = None
        return
    raise ProductCustomFieldError("Nieobsługiwany typ.", code="invalid_type")


def _value_state(row: Optional[ProductCustomFieldValue], field_id: int) -> dict:
    if row is None:
        return {"field_id": field_id, "string_value": None, "number_value": None, "json_value": None}
    j = None
    if row.value_json:
        try:
            j = json.loads(row.value_json)
        except json.JSONDecodeError:
            j = None
    return {
        "field_id": field_id,
        "string_value": row.value_string,
        "number_value": float(row.value_number) if row.value_number is not None else None,
        "json_value": j,
    }


def get_product_fields_with_values(db: Session, tenant_id: int, product_id: int) -> List[dict]:
    product = (
        db.query(Product)
        .filter(Product.id == product_id, Product.tenant_id == tenant_id, Product.deleted_at.is_(None))
        .first()
    )
    if product is None:
        raise ProductCustomFieldError("Nie znaleziono produktu.", code="product_not_found")

    fields = list_fields(db, tenant_id, include_inactive=False)
    value_rows = (
        db.query(ProductCustomFieldValue)
        .filter(
            ProductCustomFieldValue.product_id == product_id,
            ProductCustomFieldValue.tenant_id == tenant_id,
        )
        .all()
    )
    by_field = {int(v.field_id): v for v in value_rows}
    return [
        {"field": serialize_field(f), "value": _value_state(by_field.get(int(f.id)), int(f.id))}
        for f in fields
    ]


def put_product_field_values(
    db: Session,
    tenant_id: int,
    product_id: int,
    values: List[dict],
) -> List[dict]:
    product = (
        db.query(Product)
        .filter(Product.id == product_id, Product.tenant_id == tenant_id, Product.deleted_at.is_(None))
        .first()
    )
    if product is None:
        raise ProductCustomFieldError("Nie znaleziono produktu.", code="product_not_found")

    fields = {int(f.id): f for f in list_fields(db, tenant_id, include_inactive=False)}
    existing = {
        int(v.field_id): v
        for v in db.query(ProductCustomFieldValue)
        .filter(ProductCustomFieldValue.product_id == product_id, ProductCustomFieldValue.tenant_id == tenant_id)
        .all()
    }

    for store in values:
        fid = int(store.get("field_id") or 0)
        field = fields.get(fid)
        if field is None:
            continue
        row = existing.get(fid)
        if row is None:
            row = ProductCustomFieldValue(
                product_id=product_id,
                field_id=fid,
                tenant_id=tenant_id,
            )
            db.add(row)
            existing[fid] = row
        _apply_value(row, field, store)
        row.updated_at = _now()

    db.flush()
    return get_product_fields_with_values(db, tenant_id, product_id)
