"""SSOT for warehouse document series subtype capabilities (Phase 1)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

WarehouseSubtype = Literal[
    "WZ",
    "PZ",
    "Z_PZ",
    "RW",
    "PW",
    "MM",
    "RESERVATION",
]

# Legacy subtypes — may exist in DB but are not part of the standard warehouse form catalog.
LEGACY_WAREHOUSE_SUBTYPES: frozenset[str] = frozenset({"ZW", "ZD", "PZ_RT", "ZWZ", "INW", "RK"})

SUPPORTED_WAREHOUSE_SUBTYPES: tuple[str, ...] = (
    "WZ",
    "PZ",
    "Z_PZ",
    "RW",
    "PW",
    "MM",
    "RESERVATION",
)


@dataclass(frozen=True, slots=True)
class WarehouseSeriesCapabilities:
    subtype: str
    label_pl: str
    operational_code: str
    physical_effect: bool
    show_collective_return_receipt: bool = False
    show_delete_mode: bool = True
    show_email_notification: bool = False
    show_print_template_preset: bool = True
    show_document_template: bool = True
    show_order_status_hooks: bool = False
    show_company_block: bool = False
    default_print_template_id: int | None = None
    document_template_kind: str | None = None


WAREHOUSE_SERIES_CAPABILITIES: dict[str, WarehouseSeriesCapabilities] = {
    "WZ": WarehouseSeriesCapabilities(
        subtype="WZ",
        label_pl="WZ — Wydanie zewnętrzne",
        operational_code="WZ",
        physical_effect=True,
        default_print_template_id=3,
        document_template_kind="wz",
    ),
    "PZ": WarehouseSeriesCapabilities(
        subtype="PZ",
        label_pl="PZ — Przyjęcie zewnętrzne",
        operational_code="PZ",
        physical_effect=True,
        show_print_template_preset=False,
        document_template_kind="pz",
    ),
    "Z_PZ": WarehouseSeriesCapabilities(
        subtype="Z_PZ",
        label_pl="Z_PZ — Przyjęcie zwrotne",
        operational_code="Z-PZ",
        physical_effect=True,
        show_collective_return_receipt=True,
        show_print_template_preset=False,
        document_template_kind="pz",
    ),
    "RW": WarehouseSeriesCapabilities(
        subtype="RW",
        label_pl="RW — Rozchód wewnętrzny",
        operational_code="RW",
        physical_effect=True,
        show_print_template_preset=False,
        document_template_kind="rw",
    ),
    "PW": WarehouseSeriesCapabilities(
        subtype="PW",
        label_pl="PW — Przyjęcie wewnętrzne",
        operational_code="PW",
        physical_effect=True,
        show_print_template_preset=False,
        document_template_kind="pw",
    ),
    "MM": WarehouseSeriesCapabilities(
        subtype="MM",
        label_pl="MM — Przesunięcie magazynowe",
        operational_code="MM",
        physical_effect=True,
        show_print_template_preset=False,
        document_template_kind="mm",
    ),
    "RESERVATION": WarehouseSeriesCapabilities(
        subtype="RESERVATION",
        label_pl="RZ — Rezerwacja",
        operational_code="RZ",
        physical_effect=False,
        show_print_template_preset=False,
        show_document_template=False,
        document_template_kind=None,
    ),
}


def is_supported_warehouse_subtype(subtype: str) -> bool:
    return str(subtype or "").strip().upper() in WAREHOUSE_SERIES_CAPABILITIES


def warehouse_capabilities_for(subtype: str) -> WarehouseSeriesCapabilities | None:
    return WAREHOUSE_SERIES_CAPABILITIES.get(str(subtype or "").strip().upper())


def physical_effect_for_warehouse_subtype(subtype: str) -> bool:
    cap = warehouse_capabilities_for(subtype)
    if cap is not None:
        return cap.physical_effect
    sub = str(subtype or "").strip().upper()
    if sub in LEGACY_WAREHOUSE_SUBTYPES:
        return True
    return True


def allowed_warehouse_subtypes() -> list[str]:
    return list(SUPPORTED_WAREHOUSE_SUBTYPES)


def capabilities_public_dict() -> list[dict]:
    """API/FE projection — no business logic duplication."""
    out: list[dict] = []
    for sub in SUPPORTED_WAREHOUSE_SUBTYPES:
        cap = WAREHOUSE_SERIES_CAPABILITIES[sub]
        out.append(
            {
                "subtype": cap.subtype,
                "label_pl": cap.label_pl,
                "operational_code": cap.operational_code,
                "physical_effect": cap.physical_effect,
                "show_collective_return_receipt": cap.show_collective_return_receipt,
                "show_delete_mode": cap.show_delete_mode,
                "show_email_notification": cap.show_email_notification,
                "show_print_template_preset": cap.show_print_template_preset,
                "show_document_template": cap.show_document_template,
                "show_order_status_hooks": cap.show_order_status_hooks,
                "show_company_block": cap.show_company_block,
                "default_print_template_id": cap.default_print_template_id,
                "document_template_kind": cap.document_template_kind,
            }
        )
    return out
