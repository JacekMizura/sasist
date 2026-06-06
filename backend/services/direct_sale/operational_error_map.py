"""Map pipeline exceptions → structured operational error codes for operators."""

from __future__ import annotations

from sqlalchemy.exc import OperationalError as SaOperationalError

from .errors import DirectSaleError

OPERATIONAL_CODES = frozenset(
    {
        "OUT_OF_STOCK",
        "ALLOCATION_FAILED",
        "ISSUE_FAILED",
        "PAYMENT_FAILED",
        "DOCUMENT_GENERATION_FAILED",
        "SESSION_INVALID",
    }
)


def _msg_lower(exc: Exception) -> str:
    return str(exc).lower()


def map_complete_exception(exc: Exception, *, step: str) -> DirectSaleError:
    if isinstance(exc, DirectSaleError):
        code = _normalize_direct_sale_code(exc.code, step=step)
        return DirectSaleError(
            _operator_message(code, exc.message),
            code=code,
            http_status=_http_for_code(code),
            step=getattr(exc, "step", None) or step,
        )

    msg = _msg_lower(exc)
    if isinstance(exc, SaOperationalError) or "no such table" in msg or "no column named" in msg:
        if step in ("create_wz", "reserve_stock", "issue_stock"):
            return DirectSaleError(
                "Nie udało się zdjąć towaru z magazynu.",
                code="ISSUE_FAILED",
                http_status=409,
                step=step,
            )
        if step == "create_order":
            return DirectSaleError(
                "Nie udało się utworzyć zamówienia sprzedaży.",
                code="SESSION_INVALID",
                http_status=422,
                step=step,
            )
    if isinstance(exc, (TypeError, ValueError)) or "brak stanu" in msg or "insufficient" in msg:
        return DirectSaleError(
            "Brak wystarczającego stanu do wydania towaru.",
            code="OUT_OF_STOCK",
            http_status=409,
            step=step,
        )
    if "payment" in msg or step == "create_payment":
        return DirectSaleError(
            "Nie udało się zaksięgować płatności.",
            code="PAYMENT_FAILED",
            http_status=422,
            step=step,
        )
    if "document" in msg or "series" in msg or step == "generate_documents":
        return DirectSaleError(
            "Sprzedaż nie została zakończona — błąd generowania dokumentu.",
            code="DOCUMENT_GENERATION_FAILED",
            http_status=422,
            step=step,
        )
    if step == "plan_allocations":
        return DirectSaleError(
            "Nie udało się zaplanować wydania towaru z magazynu.",
            code="ALLOCATION_FAILED",
            http_status=409,
            step=step,
        )
    if step in ("create_wz", "reserve_stock", "issue_stock"):
        return DirectSaleError(
            "Nie udało się zdjąć towaru z magazynu.",
            code="ISSUE_FAILED",
            http_status=409,
            step=step,
        )
    if step == "create_order":
        return DirectSaleError(
            "Nie udało się utworzyć zamówienia sprzedaży.",
            code="SESSION_INVALID",
            http_status=422,
            step=step,
        )
    return DirectSaleError(
        "Nie udało się zakończyć sprzedaży.",
        code="SESSION_INVALID",
        http_status=422,
        step=step,
    )


def _normalize_direct_sale_code(code: str, *, step: str) -> str:
    raw = (code or "").strip().lower()
    if raw in ("insufficient_stock", "single_location_unavailable", "missing_source_location"):
        return "OUT_OF_STOCK"
    if raw in ("reservation_missing", "order_item_missing"):
        return "ISSUE_FAILED"
    if raw in ("invalid_status", "already_completed", "empty_session"):
        return "SESSION_INVALID"
    if raw.startswith("job_") or "document" in raw:
        return "DOCUMENT_GENERATION_FAILED"
    if "payment" in raw:
        return "PAYMENT_FAILED"
    if step == "plan_allocations":
        return "ALLOCATION_FAILED"
    if step in ("create_wz", "reserve_stock", "issue_stock"):
        return "ISSUE_FAILED"
    return "SESSION_INVALID"


def _http_for_code(code: str) -> int:
    if code == "OUT_OF_STOCK":
        return 409
    if code in ("ALLOCATION_FAILED", "ISSUE_FAILED"):
        return 409
    return 422


def _operator_message(code: str, fallback: str) -> str:
    messages = {
        "OUT_OF_STOCK": "Brak wystarczającego stanu do wydania towaru.",
        "ALLOCATION_FAILED": "Nie udało się zaplanować wydania z magazynu.",
        "ISSUE_FAILED": "Nie udało się zdjąć towaru z magazynu.",
        "PAYMENT_FAILED": "Nie udało się zaksięgować płatności.",
        "DOCUMENT_GENERATION_FAILED": "Błąd generowania dokumentu sprzedaży.",
        "SESSION_INVALID": "Sesja sprzedaży jest w nieprawidłowym stanie.",
    }
    return messages.get(code, fallback)
