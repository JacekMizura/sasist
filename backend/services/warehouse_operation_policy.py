"""
Central warehouse requirement policy — OMS workflow vs WMS/stock ops.

Keep operation ids in sync with frontend ``warehouseOperationPolicy.ts``.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Dict, Optional


class OperationContext(str, Enum):
    NONE = "NONE"
    ORDER_WORKFLOW = "ORDER_WORKFLOW"
    INVENTORY = "INVENTORY"
    LOCATION = "LOCATION"
    DOCUMENT = "DOCUMENT"
    RESERVATION = "RESERVATION"
    PRODUCTION = "PRODUCTION"


@dataclass(frozen=True)
class OperationPolicy:
    requires_warehouse: bool
    context: OperationContext
    reason: str


_POLICY: Dict[str, OperationPolicy] = {
    # ORDER_WORKFLOW
    "order.change_panel_status": OperationPolicy(
        False, OperationContext.ORDER_WORKFLOW, "Status panelu to workflow OMS, nie operacja na stanach."
    ),
    "order.change_status": OperationPolicy(
        False, OperationContext.ORDER_WORKFLOW, "Status zamówienia to workflow OMS."
    ),
    "order.change_customer": OperationPolicy(
        False, OperationContext.ORDER_WORKFLOW, "Dane klienta nie zależą od magazynu."
    ),
    "order.change_tags": OperationPolicy(
        False, OperationContext.ORDER_WORKFLOW, "Tagi to metadane zamówienia."
    ),
    "order.remove_tags": OperationPolicy(
        False, OperationContext.ORDER_WORKFLOW, "Usuwanie tagów to metadane zamówienia."
    ),
    "order.set_priority": OperationPolicy(
        False, OperationContext.ORDER_WORKFLOW, "Priorytet to atrybut workflow."
    ),
    "order.add_note": OperationPolicy(
        False, OperationContext.ORDER_WORKFLOW, "Notatka nie modyfikuje stanów."
    ),
    "order.delete_note": OperationPolicy(
        False, OperationContext.ORDER_WORKFLOW, "Usuwanie notatki nie modyfikuje stanów."
    ),
    "order.change_payment_status": OperationPolicy(
        False, OperationContext.ORDER_WORKFLOW, "Status płatności to workflow OMS."
    ),
    "order.change_shipping": OperationPolicy(
        False, OperationContext.ORDER_WORKFLOW, "Metoda dostawy to atrybut zamówienia."
    ),
    "order.issue_document_type": OperationPolicy(
        False,
        OperationContext.ORDER_WORKFLOW,
        "Ustawienie typu dokumentu (flaga), nie wystawienie dokumentu magazynowego.",
    ),
    "order.edit": OperationPolicy(
        False, OperationContext.ORDER_WORKFLOW, "Edycja pól OMS bez ruchu towaru."
    ),
    "order.export": OperationPolicy(
        False, OperationContext.ORDER_WORKFLOW, "Eksport danych jest operacją biurową."
    ),
    "order.print_documents": OperationPolicy(
        False,
        OperationContext.ORDER_WORKFLOW,
        "Druk dokumentów handlowych nie wymaga aktywnego magazynu WMS.",
    ),
    "order.custom_field_value": OperationPolicy(
        False, OperationContext.ORDER_WORKFLOW, "Pola dodatkowe to metadane zamówienia."
    ),
    "order.delete_orders": OperationPolicy(
        False,
        OperationContext.ORDER_WORKFLOW,
        "Usuwanie/archiwizacja rekordu zamówienia to operacja administracyjna OMS.",
    ),
    "order.bulk_patch": OperationPolicy(
        False, OperationContext.ORDER_WORKFLOW, "Masowy patch pól OMS (priorytet, notatki, …)."
    ),
    "order.bulk_panel_status": OperationPolicy(
        False, OperationContext.ORDER_WORKFLOW, "Masowa zmiana statusu panelu — workflow OMS."
    ),
    # DOCUMENT
    "document.create_warehouse": OperationPolicy(
        True, OperationContext.DOCUMENT, "Dokument magazynowy jest w kontekście magazynu."
    ),
    "document.delete_warehouse": OperationPolicy(
        True, OperationContext.DOCUMENT, "Usuwanie dokumentu magazynowego wymaga magazynu."
    ),
    # RESERVATION
    "reservation.create": OperationPolicy(
        True, OperationContext.RESERVATION, "Rezerwacja blokuje stany w magazynie."
    ),
    "reservation.release": OperationPolicy(
        True, OperationContext.RESERVATION, "Zwolnienie rezerwacji dotyczy stanów."
    ),
    "reservation.delete": OperationPolicy(
        True, OperationContext.RESERVATION, "Usuwanie rezerwacji dotyczy stanów."
    ),
    # INVENTORY / WMS
    "wms.picking": OperationPolicy(True, OperationContext.INVENTORY, "Zbieranie schodzi ze stanów."),
    "wms.picking_bulk": OperationPolicy(
        True, OperationContext.INVENTORY, "Masowe zbieranie to proces WMS."
    ),
    "wms.packing": OperationPolicy(True, OperationContext.INVENTORY, "Pakowanie operuje na stanach/nośnikach."),
    "wms.receiving": OperationPolicy(True, OperationContext.INVENTORY, "Przyjęcie zwiększa stany."),
    "wms.putaway": OperationPolicy(True, OperationContext.LOCATION, "Rozlokowanie na lokalizacjach."),
    "wms.putaway_bulk": OperationPolicy(
        True, OperationContext.LOCATION, "Masowe rozlokowanie to proces WMS."
    ),
    "wms.mm": OperationPolicy(True, OperationContext.LOCATION, "MM zmienia lokalizacje i stany."),
    "wms.inventory_count": OperationPolicy(True, OperationContext.INVENTORY, "Inwentaryzacja koryguje stany."),
    "wms.relocation": OperationPolicy(True, OperationContext.LOCATION, "Rozlokowanie nośników."),
    "wms.returns_terminal": OperationPolicy(
        True, OperationContext.INVENTORY, "Terminal zwrotów przyjmuje towar na stany."
    ),
    "wms.delete_picking_batch": OperationPolicy(
        True, OperationContext.INVENTORY, "Usuwanie zbioru zbierania to artefakt WMS."
    ),
    # LOCATION
    "location.create": OperationPolicy(True, OperationContext.LOCATION, "Lokalizacja należy do magazynu."),
    "location.update": OperationPolicy(True, OperationContext.LOCATION, "Edycja lokalizacji."),
    "location.delete": OperationPolicy(True, OperationContext.LOCATION, "Usuwanie lokalizacji."),
    "location.move_stock": OperationPolicy(True, OperationContext.LOCATION, "Ruch towaru między lokalizacjami."),
    # PRODUCTION
    "production.execute": OperationPolicy(
        True, OperationContext.PRODUCTION, "Produkcja zużywa/przyjmuje stany."
    ),
    "production.reserve_materials": OperationPolicy(
        True, OperationContext.PRODUCTION, "Rezerwacja surowców na produkcję."
    ),
    "admin.warehouse_settings": OperationPolicy(
        True, OperationContext.NONE, "Konfiguracja jest per magazyn."
    ),
}


def get_operation_policy(operation: str) -> OperationPolicy:
    try:
        return _POLICY[operation]
    except KeyError as exc:
        raise KeyError(f"Unknown warehouse operation: {operation}") from exc


def requires_warehouse(operation: str) -> bool:
    return get_operation_policy(operation).requires_warehouse


def requires_warehouse_for_context(context: OperationContext) -> bool:
    return context in {
        OperationContext.INVENTORY,
        OperationContext.LOCATION,
        OperationContext.DOCUMENT,
        OperationContext.RESERVATION,
        OperationContext.PRODUCTION,
    }


def assert_warehouse_if_required(
    operation: str,
    warehouse_id: Optional[int],
    *,
    detail: Optional[str] = None,
) -> None:
    """Raise HTTPException-friendly ValueError when warehouse is required but missing."""
    policy = get_operation_policy(operation)
    if not policy.requires_warehouse:
        return
    if warehouse_id is None or int(warehouse_id) < 1:
        raise ValueError(detail or f"warehouse_id is required for {operation}: {policy.reason}")


def list_operation_policies() -> list[dict]:
    return [
        {
            "operation": op,
            "requires_warehouse": p.requires_warehouse,
            "context": p.context.value,
            "reason": p.reason,
        }
        for op, p in sorted(_POLICY.items())
    ]
