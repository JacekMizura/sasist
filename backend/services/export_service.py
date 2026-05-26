"""Generowanie CSV wg szablonów eksportu."""

from __future__ import annotations

import csv
import io
import json
import re
import unicodedata
from datetime import datetime
from typing import Any, Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..models.bundle import Bundle, BundleItem
from ..models.carton import Carton
from ..models.customer import Customer, CustomerAddress
from ..models.export_template import ExportTemplate
from ..models.label_template import SavedLabelTemplate
from ..models.inventory import Inventory
from ..models.manufacturer import Manufacturer
from ..models.order import Order
from ..models.product import Product
from ..models.supplier import Supplier

ALLOWED_FIELDS: dict[str, tuple[str, ...]] = {
    "products": ("id", "name", "sku", "ean", "price", "stock", "location", "category", "brand", "supplier", "created_at"),
    "orders": (
        "id",
        "external_id",
        "customer",
        "email",
        "phone",
        "address",
        "status",
        "payment",
        "delivery",
        "created_at",
        "total",
    ),
    "sets": ("set_sku", "set_name", "child_sku", "qty"),
    "suppliers": (
        "id",
        "name",
        "code",
        "full_company_name",
        "tax_id",
        "email",
        "phone",
        "website",
        "logo",
        "description",
        "address_country",
        "address_city",
        "address_postal_code",
        "address_street",
        "address_building_number",
        "products_count",
        "products_list",
        "products_ids",
        "created_at",
        "updated_at",
        "address",
    ),
    "manufacturers": (
        "id",
        "name",
        "code",
        "full_company_name",
        "tax_id",
        "email",
        "phone",
        "website",
        "logo",
        "description",
        "address_country",
        "address_city",
        "address_postal_code",
        "address_street",
        "address_building_number",
        "products_count",
        "products_list",
        "products_ids",
        "created_at",
        "updated_at",
    ),
    "cartons": ("name", "width", "height", "depth", "weight"),
    "customers": (
        "id",
        "first_name",
        "last_name",
        "email",
        "phone",
        "company_name",
        "nip",
        "city",
        "postal_code",
        "country",
        "created_at",
        "orders_count",
        "orders_total",
        "status",
    ),
    "label_templates": (),  # pola = lista id szablonów SavedLabelTemplate (stringi cyfr)
}

# Nagłówki kolumn CSV po polsku (klucz wewnętrzny → etykieta dla użytkownika magazynu).
EXPORT_HEADER_PL: dict[str, dict[str, str]] = {
    "products": {
        "id": "ID",
        "name": "Nazwa",
        "sku": "SKU",
        "ean": "Kod kreskowy (EAN)",
        "price": "Cena",
        "stock": "Stan",
        "location": "Lokalizacja",
        "category": "Kategoria",
        "brand": "Marka",
        "supplier": "Dostawca",
        "created_at": "Data utworzenia",
    },
    "orders": {
        "id": "ID zamówienia",
        "external_id": "ID zewnętrzne",
        "customer": "Klient",
        "email": "E-mail",
        "phone": "Telefon",
        "address": "Adres",
        "status": "Status",
        "payment": "Płatność",
        "delivery": "Dostawa",
        "created_at": "Data utworzenia",
        "total": "Wartość",
    },
    "sets": {
        "set_sku": "SKU zestawu",
        "set_name": "Nazwa zestawu",
        "child_sku": "SKU składnika",
        "qty": "Ilość",
    },
    "suppliers": {
        "id": "ID",
        "name": "Nazwa",
        "code": "Kod",
        "full_company_name": "Pełna nazwa firmy",
        "tax_id": "NIP",
        "email": "E-mail",
        "phone": "Telefon",
        "website": "Strona WWW",
        "logo": "Logo",
        "description": "Opis",
        "address_country": "Kraj",
        "address_city": "Miasto",
        "address_postal_code": "Kod pocztowy",
        "address_street": "Ulica",
        "address_building_number": "Numer budynku",
        "products_count": "Liczba produktów",
        "products_list": "Produkty (lista)",
        "products_ids": "ID produktów",
        "created_at": "Data utworzenia",
        "updated_at": "Data aktualizacji",
        "address": "Adres (jedna linia)",
    },
    "manufacturers": {
        "id": "ID",
        "name": "Nazwa",
        "code": "Kod",
        "full_company_name": "Pełna nazwa firmy",
        "tax_id": "NIP",
        "email": "E-mail",
        "phone": "Telefon",
        "website": "Strona WWW",
        "logo": "Logo",
        "description": "Opis",
        "address_country": "Kraj",
        "address_city": "Miasto",
        "address_postal_code": "Kod pocztowy",
        "address_street": "Ulica",
        "address_building_number": "Numer budynku",
        "products_count": "Liczba produktów",
        "products_list": "Produkty (lista)",
        "products_ids": "ID produktów",
        "created_at": "Data utworzenia",
        "updated_at": "Data aktualizacji",
    },
    "cartons": {
        "name": "Nazwa",
        "width": "Szerokość (cm)",
        "height": "Wysokość (cm)",
        "depth": "Głębokość (cm)",
        "weight": "Waga (kg)",
    },
    "customers": {
        "id": "ID",
        "first_name": "Imię",
        "last_name": "Nazwisko",
        "email": "E-mail",
        "phone": "Telefon",
        "company_name": "Firma",
        "nip": "NIP",
        "city": "Miasto",
        "postal_code": "Kod pocztowy",
        "country": "Kraj",
        "created_at": "Data utworzenia",
        "orders_count": "Liczba zamówień",
        "orders_total": "Łączna wartość zamówień",
        "status": "Status",
    },
}

_ENTITY_FILE_FALLBACK: dict[str, str] = {
    "products": "Produkty",
    "orders": "Zamowienia",
    "sets": "Zestawy",
    "cartons": "Kartony",
    "suppliers": "Dostawcy",
    "manufacturers": "Producenci",
    "customers": "Klienci",
    "label_templates": "Szablony-etykiet",
}


def _ascii_filename_base(raw: str, max_len: int = 72) -> str:
    s = (raw or "").strip()
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^0-9A-Za-z._-]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-._") or "eksport"
    return s[:max_len]


def _export_attachment_basename(template: ExportTemplate, *, ext: str) -> str:
    date_part = datetime.utcnow().strftime("%Y-%m-%d")
    name_part = _ascii_filename_base(template.name)
    if not name_part:
        name_part = _ENTITY_FILE_FALLBACK.get(template.type, template.type or "eksport")
    base = f"{name_part}-{date_part}"
    e = (ext or "csv").lstrip(".")
    return f"{base}.{e}"


def _pl_header(entity_type: str, field_key: str) -> str:
    return EXPORT_HEADER_PL.get(entity_type, {}).get(field_key, field_key)


def _customer_default_address(cust: Customer) -> CustomerAddress | None:
    addrs = list(cust.addresses or [])
    if not addrs:
        return None
    for a in addrs:
        if bool(getattr(a, "is_default", False)):
            return a
    return min(addrs, key=lambda x: x.id or 0)


def _normalize_fields(entity_type: str, fields: list[str]) -> list[str]:
    if entity_type == "label_templates":
        out: list[str] = []
        for x in fields:
            s = str(x).strip()
            if s.isdigit() and s not in out:
                out.append(s)
        return out
    allowed = ALLOWED_FIELDS.get(entity_type, ())
    out = []
    for f in fields:
        if f in allowed and f not in out:
            out.append(f)
    return out if out else list(allowed)


def _product_stock(db: Session, tenant_id: int, product_id: int) -> int:
    q = (
        db.query(func.coalesce(func.sum(Inventory.quantity), 0))
        .filter(Inventory.tenant_id == tenant_id, Inventory.product_id == product_id)
        .scalar()
    )
    try:
        return int(round(float(q or 0)))
    except (TypeError, ValueError):
        return 0


def _customer_display(c: Customer | None) -> str:
    if not c:
        return ""
    parts = [c.company_name or "", f"{c.first_name or ''} {c.last_name or ''}".strip()]
    return " ".join(p for p in parts if p).strip()


def _order_primary_address(db: Session, order: Order) -> str:
    if order.customer_id:
        addr = (
            db.query(CustomerAddress)
            .filter(CustomerAddress.customer_id == order.customer_id)
            .order_by(CustomerAddress.id)
            .first()
        )
        if addr:
            line = " ".join(
                x
                for x in (
                    addr.street,
                    addr.building_number,
                    addr.postal_code,
                    addr.city,
                    addr.country,
                )
                if x
            )
            if line.strip():
                return line.strip()
    parts = [order.city or "", order.country or ""]
    return ", ".join(p for p in parts if p)


def _serialize_row(headers: list[str], row: dict[str, Any]) -> list[str]:
    return [str(row.get(h, "") or "") for h in headers]


def _product_export_bundle(db: Session, tenant_id: int, *, manufacturer_id: int | None, supplier_id: int | None) -> tuple[int, str, str]:
    """Liczba produktów, lista (SKU / nazwa), IDs po przecinku — wg relacji ORM."""
    q = db.query(Product).filter(Product.tenant_id == tenant_id)
    if manufacturer_id is not None:
        q = q.filter(Product.manufacturer_id == manufacturer_id)
    elif supplier_id is not None:
        q = q.filter(Product.default_supplier_id == supplier_id)
    else:
        return 0, "", ""
    prods = q.order_by(Product.id).all()
    n = len(prods)
    if not n:
        return 0, "", ""
    parts: list[str] = []
    id_parts: list[str] = []
    for p in prods:
        id_parts.append(str(p.id))
        sku = (p.sku or p.symbol or "").strip()
        nm = (p.name or "").strip()
        if sku and nm:
            parts.append(f"{sku} — {nm}")
        else:
            parts.append(sku or nm or str(p.id))
    return n, ", ".join(parts), ",".join(id_parts)


class ExportService:
    def __init__(self, db: Session):
        self.db = db

    def list_templates(self, tenant_id: int) -> list[ExportTemplate]:
        return (
            self.db.query(ExportTemplate)
            .filter(ExportTemplate.tenant_id == tenant_id)
            .order_by(ExportTemplate.created_at.desc())
            .all()
        )

    def get_template(self, template_id: int, tenant_id: int) -> ExportTemplate | None:
        return (
            self.db.query(ExportTemplate)
            .filter(ExportTemplate.id == template_id, ExportTemplate.tenant_id == tenant_id)
            .first()
        )

    def create_template(
        self,
        *,
        tenant_id: int,
        name: str,
        entity_type: str,
        fields: list[str],
        is_active: bool = True,
    ) -> ExportTemplate:
        fields_norm = _normalize_fields(entity_type, fields)
        row = ExportTemplate(
            tenant_id=tenant_id,
            name=name,
            type=entity_type,
            fields_json=json.dumps(fields_norm, ensure_ascii=False),
            is_active=is_active,
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def update_template(
        self,
        template_id: int,
        tenant_id: int,
        *,
        name: str | None = None,
        entity_type: str | None = None,
        fields: list[str] | None = None,
        is_active: bool | None = None,
    ) -> ExportTemplate | None:
        row = self.get_template(template_id, tenant_id)
        if not row:
            return None
        if name is not None:
            row.name = name
        if entity_type is not None:
            row.type = entity_type
        if fields is not None:
            et = entity_type or row.type
            row.fields_json = json.dumps(_normalize_fields(et, fields), ensure_ascii=False)
        if is_active is not None:
            row.is_active = is_active
        self.db.commit()
        self.db.refresh(row)
        return row

    def delete_template(self, template_id: int, tenant_id: int) -> bool:
        row = self.get_template(template_id, tenant_id)
        if not row:
            return False
        self.db.delete(row)
        self.db.commit()
        return True

    def clone_template(self, template_id: int, tenant_id: int) -> ExportTemplate | None:
        src = self.get_template(template_id, tenant_id)
        if not src:
            return None
        fields = json.loads(src.fields_json or "[]")
        if not isinstance(fields, list):
            fields = []
        copy = ExportTemplate(
            tenant_id=tenant_id,
            name=f"{src.name} (kopia)",
            type=src.type,
            fields_json=json.dumps(_normalize_fields(src.type, [str(x) for x in fields]), ensure_ascii=False),
            is_active=bool(src.is_active),
        )
        self.db.add(copy)
        self.db.commit()
        self.db.refresh(copy)
        return copy

    def build_label_templates_json(
        self, tenant_id: int, template_ids: list[int], *, download_basename: str | None = None
    ) -> tuple[str, str]:
        from ..services.label_template_serializer import build_export_document

        if not template_ids:
            raise ValueError("Brak id szablonów etykiet")
        rows = (
            self.db.query(SavedLabelTemplate)
            .filter(SavedLabelTemplate.tenant_id == tenant_id, SavedLabelTemplate.id.in_(template_ids))
            .order_by(SavedLabelTemplate.id)
            .all()
        )
        found = {r.id for r in rows}
        missing = [i for i in template_ids if i not in found]
        if missing:
            raise ValueError(f"Nie znaleziono szablonów etykiet: {missing}")
        doc = build_export_document(rows)
        name_part = _ascii_filename_base(download_basename or "") or _ENTITY_FILE_FALLBACK["label_templates"]
        filename = f"{name_part}-{datetime.utcnow().strftime('%Y-%m-%d')}.json"
        return filename, json.dumps(doc, ensure_ascii=False, indent=2)

    def build_csv(
        self,
        *,
        tenant_id: int,
        template_id: int,
        ids: list[Any],
    ) -> tuple[str, str]:
        tpl = self.get_template(template_id, tenant_id)
        if not tpl:
            raise ValueError("Szablon nie istnieje")
        if tpl.type != "label_templates" and not tpl.is_active:
            raise ValueError("Szablon nie istnieje lub jest nieaktywny")
        try:
            fields: list[str] = json.loads(tpl.fields_json or "[]")
        except json.JSONDecodeError:
            fields = []
        if not isinstance(fields, list):
            fields = []
        if tpl.type == "label_templates":
            int_ids = [int(x) for x in ids if str(x).strip().isdigit()]
            if not int_ids:
                int_ids = [int(str(x).strip()) for x in fields if str(x).strip().isdigit()]
            if not int_ids:
                raise ValueError("Dla eksportu „System etykiet” wybierz szablony (id) w konfiguracji lub podaj ids w żądaniu")
            return self.build_label_templates_json(tenant_id, int_ids, download_basename=tpl.name)
        fields = _normalize_fields(tpl.type, [str(x) for x in fields])
        field_keys = fields
        header_row = [_pl_header(tpl.type, k) for k in field_keys]

        rows_iter = self._rows_for_type(tpl.type, tenant_id, ids)
        buf = io.StringIO()
        w = csv.writer(buf, delimiter=";", lineterminator="\n")
        w.writerow(header_row)
        for r in rows_iter:
            w.writerow(_serialize_row(field_keys, r))
        filename = _export_attachment_basename(tpl, ext="csv")
        return filename, buf.getvalue()

    def _rows_for_type(self, entity_type: str, tenant_id: int, ids: list[Any]) -> Iterable[dict[str, Any]]:
        if entity_type == "products":
            q = (
                self.db.query(Product)
                .options(joinedload(Product.manufacturer_row), joinedload(Product.default_supplier_row))
                .filter(Product.tenant_id == tenant_id)
            )
            if ids:
                int_ids = [int(x) for x in ids if str(x).isdigit()]
                if int_ids:
                    q = q.filter(Product.id.in_(int_ids))
            for p in q.order_by(Product.id):
                sup_name = ""
                if p.default_supplier_row:
                    sup_name = p.default_supplier_row.name or ""
                price = p.sale_price if p.sale_price is not None else p.purchase_price
                yield {
                    "id": p.id,
                    "name": p.name or "",
                    "sku": p.sku or p.symbol or "",
                    "ean": p.ean or "",
                    "price": str(price) if price is not None else "",
                    "stock": _product_stock(self.db, tenant_id, int(p.id)),
                    "location": p.location or "",
                    "category": "",
                    "brand": p.manufacturer_row.name if p.manufacturer_row else (p.manufacturer or ""),
                    "supplier": sup_name,
                    "created_at": "",
                }
        elif entity_type == "sets":
            q = (
                self.db.query(Bundle)
                .options(joinedload(Bundle.items).joinedload(BundleItem.product))
                .filter(Bundle.tenant_id == tenant_id)
            )
            if ids:
                int_ids = [int(x) for x in ids if str(x).isdigit()]
                if int_ids:
                    q = q.filter(Bundle.id.in_(int_ids))
            for b in q.order_by(Bundle.id):
                items = sorted(b.items or [], key=lambda x: (x.sort_order or 0, x.id or 0))
                for it in items:
                    pr = it.product
                    child_sku = ""
                    if pr:
                        child_sku = pr.sku or pr.symbol or pr.ean or ""
                    yield {
                        "set_sku": b.sku or "",
                        "set_name": b.name or "",
                        "child_sku": child_sku,
                        "qty": it.quantity,
                    }
        elif entity_type == "orders":
            q = (
                self.db.query(Order)
                .options(joinedload(Order.shipping_method_row), joinedload(Order.customer))
                .filter(Order.tenant_id == tenant_id)
            )
            if ids:
                int_ids = [int(x) for x in ids if str(x).isdigit()]
                if int_ids:
                    q = q.filter(Order.id.in_(int_ids))
            for o in q.order_by(Order.id):
                cust = None
                if o.customer_id:
                    cust = self.db.query(Customer).filter(Customer.id == o.customer_id).first()
                pay = ""
                if cust and cust.preferred_payment_method:
                    pay = cust.preferred_payment_method
                delivery = o.shipping_method_row.label if o.shipping_method_row else (o.shipping_method or "")
                yield {
                    "id": o.id,
                    "external_id": o.external_id or "",
                    "customer": _customer_display(cust),
                    "email": (cust.email if cust else "") or "",
                    "phone": (cust.phone if cust else "") or "",
                    "address": _order_primary_address(self.db, o),
                    "status": o.status or "",
                    "payment": pay,
                    "delivery": delivery,
                    "created_at": o.created_at.isoformat() if o.created_at else (o.order_date.isoformat() if o.order_date else ""),
                    "total": o.value if o.value is not None else "",
                }
        elif entity_type == "suppliers":
            q = self.db.query(Supplier).filter(Supplier.tenant_id == tenant_id)
            if ids:
                int_ids = [int(x) for x in ids if str(x).isdigit()]
                if int_ids:
                    q = q.filter(Supplier.id.in_(int_ids))
            for s in q.order_by(Supplier.id):
                addr = " ".join(x for x in (s.street, s.postal_code, s.city, s.country) if x) or (s.address or "")
                pc, pl, pids = _product_export_bundle(self.db, tenant_id, manufacturer_id=None, supplier_id=int(s.id))
                yield {
                    "id": s.id,
                    "name": s.name or "",
                    "code": s.tax_id or "",
                    "full_company_name": s.company_name or "",
                    "tax_id": s.tax_id or "",
                    "email": s.email or "",
                    "phone": s.phone or "",
                    "website": s.website or "",
                    "logo": "",
                    "description": (getattr(s, "notes", None) or "").strip(),
                    "address_country": s.country or "",
                    "address_city": s.city or "",
                    "address_postal_code": s.postal_code or "",
                    "address_street": (s.street or "") if s.street else "",
                    "address_building_number": "",
                    "products_count": pc,
                    "products_list": pl,
                    "products_ids": pids,
                    "created_at": "",
                    "updated_at": "",
                    "address": addr,
                }
        elif entity_type == "manufacturers":
            q = self.db.query(Manufacturer).filter(Manufacturer.tenant_id == tenant_id)
            if ids:
                int_ids = [int(x) for x in ids if str(x).isdigit()]
                if int_ids:
                    q = q.filter(Manufacturer.id.in_(int_ids))
            for m in q.order_by(Manufacturer.id):
                pc, pl, pids = _product_export_bundle(self.db, tenant_id, manufacturer_id=int(m.id), supplier_id=None)
                yield {
                    "id": m.id,
                    "name": m.name or "",
                    "code": m.tax_id or "",
                    "full_company_name": m.company_name or "",
                    "tax_id": m.tax_id or "",
                    "email": m.email or "",
                    "phone": m.phone or "",
                    "website": m.website or "",
                    "logo": m.logo_url or "",
                    "description": "",
                    "address_country": m.country or "",
                    "address_city": m.city or "",
                    "address_postal_code": m.postal_code or "",
                    "address_street": (m.street or "") if m.street else "",
                    "address_building_number": "",
                    "products_count": pc,
                    "products_list": pl,
                    "products_ids": pids,
                    "created_at": "",
                    "updated_at": "",
                }
        elif entity_type == "cartons":
            q = self.db.query(Carton).filter(Carton.tenant_id == tenant_id)
            if ids:
                str_ids = [str(x) for x in ids if x]
                if str_ids:
                    q = q.filter(Carton.id.in_(str_ids))
            for c in q.order_by(Carton.name):
                yield {
                    "name": c.name,
                    "width": c.width_cm,
                    "height": c.height_cm,
                    "depth": c.length_cm,
                    "weight": c.weight_kg,
                }
        elif entity_type == "customers":
            q = (
                self.db.query(Customer)
                .options(joinedload(Customer.addresses))
                .filter(Customer.tenant_id == tenant_id)
            )
            if ids:
                int_ids = [int(x) for x in ids if str(x).isdigit()]
                if int_ids:
                    q = q.filter(Customer.id.in_(int_ids))
            for cust in q.order_by(Customer.id):
                addr = _customer_default_address(cust)
                oc = (
                    self.db.query(func.count(Order.id), func.coalesce(func.sum(Order.value), 0.0))
                    .filter(Order.tenant_id == tenant_id, Order.customer_id == cust.id)
                    .first()
                )
                orders_count = int(oc[0] or 0) if oc else 0
                orders_total = float(oc[1] or 0.0) if oc else 0.0
                st = "Zarchiwizowany" if cust.deleted_at else "Aktywny"
                yield {
                    "id": cust.id,
                    "first_name": cust.first_name or "",
                    "last_name": cust.last_name or "",
                    "email": (cust.email or "").strip(),
                    "phone": (cust.phone or "").strip(),
                    "company_name": (cust.company_name or "").strip(),
                    "nip": (cust.nip or "").strip(),
                    "city": (addr.city if addr else "") or "",
                    "postal_code": (addr.postal_code if addr else "") or "",
                    "country": (addr.country_code if addr else "") or (cust.country_code or ""),
                    "created_at": cust.created_at.isoformat() if cust.created_at else "",
                    "orders_count": orders_count,
                    "orders_total": orders_total,
                    "status": st,
                }
        else:
            return
