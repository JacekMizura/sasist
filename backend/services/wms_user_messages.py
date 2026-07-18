"""
WMS user messaging SSOT — business messages for operators (Polish).

HTTP detail shape (always the same):
  code, severity, title, message, details, suggested_action

Frontend displays this payload in WmsMessageModal — never invents copy from HTTP codes.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any

from fastapi import HTTPException


class WmsMessageSeverity(str, Enum):
    SUCCESS = "SUCCESS"
    WARNING = "WARNING"
    ERROR = "ERROR"


@dataclass(frozen=True)
class WmsUserMessage:
    code: str
    severity: WmsMessageSeverity
    title: str
    message: str
    details: str | None = None
    suggested_action: str | None = None
    #: Extra machine fields (capacity numbers, operator id) — not shown as title
    context: dict[str, Any] = field(default_factory=dict)

    def to_detail(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "code": self.code,
            "severity": self.severity.value,
            "title": self.title,
            "message": self.message,
            "details": self.details,
            "suggested_action": self.suggested_action,
        }
        if self.context:
            out["context"] = dict(self.context)
        return out


def http_exception_wms(
    msg: WmsUserMessage,
    *,
    status_code: int = 409,
) -> HTTPException:
    return HTTPException(status_code=int(status_code), detail=msg.to_detail())


# ---------------------------------------------------------------------------
# Catalog — stable codes; Polish copy for operators
# ---------------------------------------------------------------------------

# Cart / picking
WMS_NO_MATCHING_ORDERS = "WMS_NO_MATCHING_ORDERS"
WMS_CART_CAPACITY_REACHED = "WMS_CART_CAPACITY_REACHED"
WMS_BASKETS_FULL = "WMS_BASKETS_FULL"
WMS_NO_FREE_BASKET = "WMS_NO_FREE_BASKET"
WMS_CART_IN_USE = "WMS_CART_IN_USE"
WMS_CART_TAKEN_OVER = "WMS_CART_TAKEN_OVER"
WMS_SESSION_EXPIRED = "WMS_SESSION_EXPIRED"
WMS_NO_PERMISSION = "WMS_NO_PERMISSION"
WMS_CART_NOT_FOUND = "WMS_CART_NOT_FOUND"
WMS_INVALID_CART_STATE = "WMS_INVALID_CART_STATE"
WMS_OPERATOR_REQUIRED = "WMS_OPERATOR_REQUIRED"
WMS_NO_ORDERS_TO_ASSIGN = "WMS_NO_ORDERS_TO_ASSIGN"
WMS_ASSIGN_ORDERS_FAILED = "WMS_ASSIGN_ORDERS_FAILED"
WMS_GENERIC_ERROR = "WMS_GENERIC_ERROR"
WMS_OPERATION_SUCCESS = "WMS_OPERATION_SUCCESS"

# Legacy aliases mapped in from_exception
CART_CAPACITY_EXCEEDED = "CART_CAPACITY_EXCEEDED"
CART_ALREADY_CLAIMED = "CartAlreadyClaimed"


def msg_no_matching_orders() -> WmsUserMessage:
    return WmsUserMessage(
        code=WMS_NO_MATCHING_ORDERS,
        severity=WmsMessageSeverity.ERROR,
        title="Nie znaleziono zamówień",
        message="Nie znaleziono zamówień pasujących do tego wózka.",
        details="Żadne oczekujące zamówienie nie mieści się w dostępnej pojemności.",
        suggested_action=(
            "Użyj większego wózka, zmień strategię pojemności albo poczekaj na nowe zamówienia."
        ),
    )


def msg_cart_capacity_reached(
    *,
    strategy: str = "",
    assigned_orders: int | None = None,
    capacity_orders: int | None = None,
    assigned_volume: float | None = None,
    capacity_volume: float | None = None,
    reason: str = "",
) -> WmsUserMessage:
    details_parts: list[str] = []
    if capacity_volume is not None and assigned_volume is not None:
        details_parts.append(
            f"Objętość: {assigned_volume:g} l / {capacity_volume:g} l"
        )
    if capacity_orders is not None and assigned_orders is not None:
        details_parts.append(
            f"Zamówienia: {assigned_orders} / {capacity_orders}"
        )
    if reason == "no_basket" or strategy == "BASKETS":
        return msg_baskets_full()
    details = "\n".join(details_parts) if details_parts else "Pozostałe zamówienia nie mieszczą się."
    return WmsUserMessage(
        code=WMS_CART_CAPACITY_REACHED,
        severity=WmsMessageSeverity.WARNING,
        title="Brak wolnej pojemności",
        message="Wózek osiągnął maksymalną pojemność.",
        details=details,
        suggested_action="Pozostałe zamówienia nie mieszczą się. Użyj innego wózka lub zakończ zbieranie.",
        context={
            "strategy": strategy,
            "assigned_orders": assigned_orders,
            "capacity_orders": capacity_orders,
            "assigned_volume": assigned_volume,
            "capacity_volume": capacity_volume,
            "reason": reason,
        },
    )


def msg_baskets_full() -> WmsUserMessage:
    return WmsUserMessage(
        code=WMS_BASKETS_FULL,
        severity=WmsMessageSeverity.ERROR,
        title="Nie udało się przypisać zamówień",
        message="Nie udało się przypisać zamówień do wózka.",
        details=(
            "Wszystkie koszyki są już zajęte albo pozostałe zamówienia "
            "nie mieszczą się w żadnym wolnym koszyku."
        ),
        suggested_action="Użyj wózka z wolnymi koszykami albo poczekaj na zwolnienie koszyków.",
    )


def msg_no_free_basket() -> WmsUserMessage:
    return WmsUserMessage(
        code=WMS_NO_FREE_BASKET,
        severity=WmsMessageSeverity.WARNING,
        title="Brak wolnego koszyka",
        message="Nie znaleziono wolnego koszyka.",
        details="Wszystkie koszyki są zajęte.",
        suggested_action="Wybierz inny wózek sekcyjny albo zwolnij zajęty koszyk.",
    )


def _lifecycle_label_pl(state: str | None) -> str | None:
    if not state:
        return None
    u = str(state).strip().upper()
    return {
        "AVAILABLE": "Dostępny",
        "ASSIGNED": "Przypisany",
        "PICKING": "Zbieranie",
        "READY_FOR_PACKING": "Gotowy do pakowania",
        "PACKING": "Pakowanie",
    }.get(u, state)


def msg_cart_in_use(
    *,
    operator_name: str | None = None,
    started_at: str | None = None,
    lifecycle_state: str | None = None,
) -> WmsUserMessage:
    details_parts: list[str] = []
    if operator_name:
        details_parts.append(f"Aktualnie korzysta z niego:\n{operator_name}")
    if started_at:
        details_parts.append(f"Rozpoczęto:\n{started_at}")
    label = _lifecycle_label_pl(lifecycle_state)
    if label:
        details_parts.append(f"Stan:\n{label}")
    return WmsUserMessage(
        code=WMS_CART_IN_USE,
        severity=WmsMessageSeverity.WARNING,
        title="Wózek zajęty",
        message="Ten wózek jest obecnie używany.",
        details="\n\n".join(details_parts) if details_parts else None,
        suggested_action="Spróbuj ponownie później albo wybierz inny wózek.",
        context={
            "operator_name": operator_name,
            "started_at": started_at,
            "lifecycle_state": lifecycle_state,
        },
    )


def msg_cart_taken_over() -> WmsUserMessage:
    return WmsUserMessage(
        code=WMS_CART_TAKEN_OVER,
        severity=WmsMessageSeverity.WARNING,
        title="Wózek przejęty",
        message="Wózek został przejęty przez innego magazyniera.",
        details=None,
        suggested_action="Odśwież listę wózków.",
    )


def msg_session_expired() -> WmsUserMessage:
    return WmsUserMessage(
        code=WMS_SESSION_EXPIRED,
        severity=WmsMessageSeverity.WARNING,
        title="Sesja zakończona",
        message="Sesja kompletacji została zakończona.",
        details="Wózek został zwolniony z powodu braku aktywności.",
        suggested_action="Zeskanuj wózek ponownie, aby rozpocząć nową sesję.",
    )


def msg_no_permission() -> WmsUserMessage:
    return WmsUserMessage(
        code=WMS_NO_PERMISSION,
        severity=WmsMessageSeverity.ERROR,
        title="Brak uprawnień",
        message="Nie możesz rozpocząć kompletacji.",
        details="Nie masz wymaganych uprawnień.",
        suggested_action="Skontaktuj się z przełożonym w sprawie dostępu do zbierania.",
    )


def msg_cart_not_found() -> WmsUserMessage:
    return WmsUserMessage(
        code=WMS_CART_NOT_FOUND,
        severity=WmsMessageSeverity.ERROR,
        title="Nie znaleziono wózka",
        message="Nie znaleziono wózka.",
        details="Kod wózka jest nieprawidłowy albo wózek nie należy do tego magazynu.",
        suggested_action="Sprawdź etykietę wózka i zeskanuj ponownie.",
    )


def msg_invalid_cart_state(*, action: str = "", current: str = "") -> WmsUserMessage:
    details = None
    if action or current:
        details = f"Operacja: {action or '—'}\nAktualny stan: {current or '—'}"
    return WmsUserMessage(
        code=WMS_INVALID_CART_STATE,
        severity=WmsMessageSeverity.WARNING,
        title="Nieprawidłowy stan wózka",
        message="Tej operacji nie można wykonać w obecnym stanie wózka.",
        details=details,
        suggested_action="Odśwież widok albo wybierz inną akcję zgodną ze stanem wózka.",
        context={"action": action, "current": current},
    )


def msg_operator_required() -> WmsUserMessage:
    return WmsUserMessage(
        code=WMS_OPERATOR_REQUIRED,
        severity=WmsMessageSeverity.ERROR,
        title="Wymagany operator",
        message="Do tej operacji wymagane jest zalogowanie operatora.",
        details=None,
        suggested_action="Zaloguj się ponownie i spróbuj jeszcze raz.",
    )


def msg_no_orders_to_assign() -> WmsUserMessage:
    return msg_no_matching_orders()


def msg_generic_error(*, detail: str | None = None) -> WmsUserMessage:
    return WmsUserMessage(
        code=WMS_GENERIC_ERROR,
        severity=WmsMessageSeverity.ERROR,
        title="Operacja nie powiodła się",
        message="Nie udało się wykonać operacji magazynowej.",
        details=detail,
        suggested_action="Spróbuj ponownie. Jeśli problem się powtórzy, zgłoś to przełożonemu.",
    )


def msg_success(*, title: str, message: str, details: str | None = None) -> WmsUserMessage:
    return WmsUserMessage(
        code=WMS_OPERATION_SUCCESS,
        severity=WmsMessageSeverity.SUCCESS,
        title=title,
        message=message,
        details=details,
        suggested_action=None,
    )


def from_cart_capacity_exceeded(exc: Any) -> WmsUserMessage:
    strategy = str(getattr(exc, "strategy", None) or "")
    reason = str(getattr(exc, "reason", None) or "")
    if reason in ("no_basket",) or strategy == "BASKETS":
        return msg_baskets_full()
    return msg_cart_capacity_reached(
        strategy=strategy,
        assigned_orders=getattr(exc, "current_orders", None),
        capacity_orders=getattr(exc, "capacity_orders", None) or getattr(exc, "max_orders", None),
        reason=reason,
    )


def from_cart_lifecycle_error(exc: Any, *, extra: dict[str, Any] | None = None) -> WmsUserMessage:
    code = str(getattr(exc, "code", None) or "")
    extra = extra or {}
    if code in ("CartAlreadyClaimed", "cart_already_claimed"):
        return msg_cart_in_use(
            operator_name=extra.get("operator_name"),
            started_at=extra.get("started_at"),
            lifecycle_state=extra.get("lifecycle_state") or "Zbieranie",
        )
    if code in ("operator_required",):
        return msg_operator_required()
    if code in ("cart_not_found",):
        return msg_cart_not_found()
    if code in ("no_orders_to_assign", "no_orders"):
        return msg_no_matching_orders()
    if code in ("CART_CAPACITY_EXCEEDED",):
        return msg_cart_capacity_reached()
    if code in ("invalid_state", "InvalidCartState", "invalid_transition"):
        return msg_invalid_cart_state(
            action=str(extra.get("action") or ""),
            current=str(extra.get("current") or ""),
        )
    if code in ("session_not_found", "SessionNotFound"):
        return msg_session_expired()
    raw = str(getattr(exc, "message", None) or exc or "").strip()
    if raw and any(ord(ch) > 127 for ch in raw):
        return WmsUserMessage(
            code=code or WMS_GENERIC_ERROR,
            severity=WmsMessageSeverity.WARNING,
            title="Operacja niedozwolona",
            message=raw,
            details=None,
            suggested_action="Sprawdź stan wózka i spróbuj ponownie.",
        )
    return msg_generic_error(detail=raw or None)


def parse_detail_as_wms_message(detail: Any) -> WmsUserMessage | None:
    """Recognize an already-shaped WmsUserMessage HTTP detail."""
    if not isinstance(detail, dict):
        return None
    if not all(k in detail for k in ("code", "severity", "title", "message")):
        return None
    try:
        sev = WmsMessageSeverity(str(detail["severity"]).upper())
    except ValueError:
        sev = WmsMessageSeverity.ERROR
    return WmsUserMessage(
        code=str(detail["code"]),
        severity=sev,
        title=str(detail["title"]),
        message=str(detail["message"]),
        details=(str(detail["details"]) if detail.get("details") is not None else None),
        suggested_action=(
            str(detail["suggested_action"]) if detail.get("suggested_action") is not None else None
        ),
        context=dict(detail.get("context") or {}) if isinstance(detail.get("context"), dict) else {},
    )
