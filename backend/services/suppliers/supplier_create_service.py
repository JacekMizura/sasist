"""Create supplier rows — persistence + schema self-heal + error mapping."""

from __future__ import annotations

from typing import Any

from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError, OperationalError, ProgrammingError
from sqlalchemy.orm import Session

from ...models.supplier import Supplier
from ...schemas.supplier import SupplierCreateBody
from .errors import SupplierCreateError
from .supplier_list_service import _is_missing_column_error, ensure_suppliers_orm_schema


def build_supplier_entity(body: SupplierCreateBody) -> Supplier:
    from .supplier_projection import strip_optional_text

    return Supplier(
        tenant_id=int(body.tenant_id),
        name=body.name.strip(),
        company_name=strip_optional_text(body.company_name),
        tax_id=strip_optional_text(body.tax_id),
        email=strip_optional_text(body.email),
        phone=strip_optional_text(body.phone),
        website=strip_optional_text(body.website),
        country=strip_optional_text(body.country),
        city=strip_optional_text(body.city),
        postal_code=strip_optional_text(body.postal_code),
        street=strip_optional_text(body.street),
        address=strip_optional_text(body.address),
        active=bool(body.active),
        default_lead_time_days=body.default_lead_time_days,
        default_currency=body.default_currency,
        minimum_order_value=(body.minimum_order_value if body.requires_moq else None),
        minimum_order_qty=(body.minimum_order_qty if body.requires_moq else None),
        free_shipping_threshold=(body.free_shipping_threshold if body.offers_free_shipping else None),
        offers_free_shipping=bool(body.offers_free_shipping),
        requires_moq=bool(body.requires_moq),
        notes=strip_optional_text(body.notes),
    )


def _integrity_error(exc: IntegrityError) -> SupplierCreateError:
    detail = str(getattr(exc, "orig", None) or exc)
    lower = detail.lower()
    if "unique" in lower or "duplicate" in lower:
        return SupplierCreateError(
            "Dostawca o podanych danych już istnieje.",
            code="SUPPLIER_CREATE_DUPLICATE",
            details=detail,
            http_status=409,
        )
    if "not-null" in lower or "null value" in lower or "not null" in lower:
        return SupplierCreateError(
            "Brakuje wymaganej wartości w danych dostawcy.",
            code="SUPPLIER_CREATE_NOT_NULL",
            details=detail,
            http_status=400,
        )
    if "foreign key" in lower or "foreignkey" in lower:
        return SupplierCreateError(
            "Nieprawidłowy tenant lub powiązanie danych.",
            code="SUPPLIER_CREATE_FK",
            details=detail,
            http_status=400,
        )
    return SupplierCreateError(
        "Nie udało się zapisać dostawcy (konflikt danych).",
        code="SUPPLIER_CREATE_INTEGRITY",
        details=detail,
        http_status=400,
    )


def map_supplier_create_exception(exc: BaseException) -> SupplierCreateError:
    if isinstance(exc, SupplierCreateError):
        return exc
    if isinstance(exc, IntegrityError):
        return _integrity_error(exc)
    if isinstance(exc, ValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        loc = ".".join(str(part) for part in first.get("loc", ()))
        msg = str(first.get("msg") or "Nieprawidłowe dane wejściowe.")
        return SupplierCreateError(
            f"Nieprawidłowe dane dostawcy{f': {loc}' if loc else ''}.",
            code="SUPPLIER_CREATE_VALIDATION",
            details=msg,
            http_status=422,
        )
    if isinstance(exc, KeyError):
        key = exc.args[0] if exc.args else "unknown"
        return SupplierCreateError(
            f"Brak wymaganego pola: {key}.",
            code="SUPPLIER_CREATE_KEY_ERROR",
            details=str(exc),
            http_status=400,
        )
    if isinstance(exc, AttributeError):
        return SupplierCreateError(
            "Niekompletna struktura danych dostawcy.",
            code="SUPPLIER_CREATE_ATTRIBUTE_ERROR",
            details=str(exc),
            http_status=400,
        )
    if isinstance(exc, (OperationalError, ProgrammingError)):
        detail = str(getattr(exc, "orig", None) or exc)
        if _is_missing_column_error(exc):
            return SupplierCreateError(
                "Schemat tabeli suppliers jest nieaktualny — uruchom migrację bazy lub skontaktuj się z administratorem.",
                code="SUPPLIER_CREATE_SCHEMA",
                details=detail,
                http_status=503,
            )
        return SupplierCreateError(
            "Błąd bazy danych podczas tworzenia dostawcy.",
            code="SUPPLIER_CREATE_DB",
            details=detail,
            http_status=503,
        )
    return SupplierCreateError(
        "Nie udało się utworzyć dostawcy. Spróbuj ponownie za chwilę.",
        code="SUPPLIER_CREATE_FAILED",
        details=str(exc),
        http_status=503,
    )


def _persist_supplier(db: Session, body: SupplierCreateBody) -> Supplier:
    row = build_supplier_entity(body)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def create_supplier_for_tenant(db: Session, body: SupplierCreateBody) -> Supplier:
    try:
        return _persist_supplier(db, body)
    except (OperationalError, ProgrammingError) as exc:
        if not _is_missing_column_error(exc):
            db.rollback()
            raise map_supplier_create_exception(exc) from exc
        db.rollback()
        ensure_suppliers_orm_schema()
        try:
            return _persist_supplier(db, body)
        except Exception as retry_exc:
            db.rollback()
            raise map_supplier_create_exception(retry_exc) from retry_exc
    except IntegrityError as exc:
        db.rollback()
        raise map_supplier_create_exception(exc) from exc
    except (ValidationError, KeyError, AttributeError) as exc:
        db.rollback()
        raise map_supplier_create_exception(exc) from exc
    except Exception as exc:
        db.rollback()
        raise map_supplier_create_exception(exc) from exc


def supplier_create_payload_for_log(body: SupplierCreateBody) -> dict[str, Any]:
    return body.model_dump()
