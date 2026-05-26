"""
Picking Orchestrator — centralny punkt wejścia dla trybów zbierania WMS.

- Nie dotyka MM, zakończenia picków ani stanów magazynowych (poza przypisaniem do wózka przez PickingAssignmentService).
- Rozdziela zamówienia jedno- vs wielopozycyjne, rozstrzyga tryb z konfiguracji, wywołuje przypisanie lub zwraca kolejkę MOBILE.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Literal, Optional, Sequence

from sqlalchemy.orm import Session, joinedload

from ..models.cart import Cart
from ..models.order import Order
from ..models.order_item import OrderItem
from ..schemas.picking_orchestration import (
    PickingOrchestrationConfig,
    PickingOrchestratorAssignedEntry,
    PickingOrchestratorMode,
    PickingOrchestratorResult,
    PickingOrchestratorRunSummary,
    PickingOrchestratorUnassignedOrder,
)
from .picking_assignment_service import (
    PickingAssignmentService,
    _is_multi_item_order,
    _is_single_item_order,
    _order_volume_dm3,
)

CartFamily = Literal["bulk", "baskets"]


def _normalize_cart_type(cart: Cart) -> str:
    raw = cart.type.value if hasattr(cart.type, "value") else str(cart.type)
    return str(raw).split(".")[-1].upper()


def _mode_needs_family(mode: PickingOrchestratorMode) -> CartFamily | None:
    if mode in ("BULK", "SCANNED_CART"):
        return "bulk"
    if mode == "BASKETS":
        return "baskets"
    return None


def _cart_family_from_ctype(ctype: str) -> CartFamily | None:
    if ctype == "BULK":
        return "bulk"
    if ctype == "MULTI":
        return "baskets"
    return None


def _orchestrator_mode_for_order(order: Order, config: PickingOrchestrationConfig) -> PickingOrchestratorMode:
    if _is_single_item_order(order):
        return config.mode_single
    if _is_multi_item_order(order):
        return config.mode_multi
    return config.mode_single


class PickingOrchestrator:
    """Łączy konfigurację pickingu z PickingAssignmentService i trybem MOBILE (bez przypisania)."""

    def __init__(self, db: Session):
        self.db = db

    def run(
        self,
        order_ids: Sequence[int],
        config: PickingOrchestrationConfig,
        *,
        cart_id: Optional[int] = None,
        tenant_id: Optional[int] = None,
    ) -> PickingOrchestratorResult:
        """
        :param order_ids: Kandydaci do zbierania (retry bezpieczne: ``cart_id`` już ustawione są pomijane).
        :param cart_id: Wymagany dla trybów BULK / SCANNED_CART / BASKETS (zgodność typu wózka z trybem).
        """
        unassigned: dict[int, list[str]] = defaultdict(list)
        mobile_entries: list[PickingOrchestratorAssignedEntry] = []
        assign_candidate_ids: list[int] = []

        unique_ids: list[int] = []
        for oid in order_ids:
            oi = int(oid)
            if oi not in unique_ids:
                unique_ids.append(oi)

        if not unique_ids:
            return PickingOrchestratorResult(
                mode_single=config.mode_single,
                mode_multi=config.mode_multi,
                assigned_containers=[],
                unassigned_orders=[],
                cart_summaries=[],
                summary=PickingOrchestratorRunSummary(
                    total_input_orders=0,
                    assigned_count=0,
                    unassigned_count=0,
                    mobile_queue_count=0,
                    assignment_service_invoked=False,
                ),
            )

        orders_map: dict[int, Order] = {}
        if unique_ids:
            loaded = (
                self.db.query(Order)
                .options(joinedload(Order.items).joinedload(OrderItem.product))
                .filter(Order.id.in_(unique_ids))
                .all()
            )
            orders_map = {int(o.id): o for o in loaded}

        for oid in unique_ids:
            order = orders_map.get(oid)
            if not order:
                unassigned[oid].append("not_found")
                continue

            if order.cart_id is not None:
                unassigned[oid].append("already_assigned")
                continue

            if len(order.items) == 0:
                unassigned[oid].append("orchestrator_no_order_lines")
                continue

            if not _is_single_item_order(order) and not _is_multi_item_order(order):
                unassigned[oid].append("orchestrator_ambiguous_line_count")
                continue

            orch_mode = _orchestrator_mode_for_order(order, config)
            need = _mode_needs_family(orch_mode)

            if orch_mode == "MOBILE":
                vol = float(_order_volume_dm3(order))
                mobile_entries.append(
                    PickingOrchestratorAssignedEntry(
                        order_id=oid,
                        picking_mode="MOBILE",
                        cart_id=None,
                        basket_id=None,
                        volume_dm3=vol,
                    )
                )
                continue

            if need is None:
                unassigned[oid].append("orchestrator_invalid_mode")
                continue

            if cart_id is None:
                unassigned[oid].append("orchestrator_cart_required")
                continue

            assign_candidate_ids.append(oid)

        if assign_candidate_ids:
            cart = (
                self.db.query(Cart)
                .options(joinedload(Cart.baskets))
                .filter(Cart.id == int(cart_id))
                .first()
            )
            if not cart:
                for oid in assign_candidate_ids:
                    unassigned[oid].append("orchestrator_cart_not_found")
                assign_candidate_ids = []
            else:
                ctype = _normalize_cart_type(cart)
                cart_fam = _cart_family_from_ctype(ctype)

                if tenant_id is not None and int(cart.tenant_id) != int(tenant_id):
                    for oid in list(assign_candidate_ids):
                        unassigned[oid].append("warehouse_mismatch")
                    assign_candidate_ids = []
                elif cart_fam is None:
                    for oid in list(assign_candidate_ids):
                        unassigned[oid].append("orchestrator_unsupported_cart_type")
                    assign_candidate_ids = []
                else:
                    filtered: list[int] = []
                    for oid in assign_candidate_ids:
                        order = orders_map[oid]
                        orch_mode = _orchestrator_mode_for_order(order, config)
                        need = _mode_needs_family(orch_mode)
                        assert need is not None
                        if need != cart_fam:
                            unassigned[oid].append(
                                f"picking_mode_cart_mismatch:tryb={orch_mode},wózek={ctype}",
                            )
                            continue
                        filtered.append(oid)
                    assign_candidate_ids = filtered

        assigned_from_service: list[PickingOrchestratorAssignedEntry] = []
        cart_summaries = []
        service_invoked = False

        if assign_candidate_ids:
            service_invoked = True
            svc = PickingAssignmentService(self.db)
            result = svc.assign_orders_to_cart(
                assign_candidate_ids,
                int(cart_id),
                config.assignment,
                tenant_id=tenant_id,
            )
            cart_summaries = [result.summary]

            for row in result.assigned:
                order = orders_map.get(int(row.order_id))
                mode = (
                    _orchestrator_mode_for_order(order, config)
                    if order
                    else config.mode_single
                )
                assigned_from_service.append(
                    PickingOrchestratorAssignedEntry(
                        order_id=int(row.order_id),
                        picking_mode=mode,
                        cart_id=int(row.cart_id),
                        basket_id=row.basket_id,
                        volume_dm3=float(row.volume_dm3),
                    )
                )

            for rej in result.rejected:
                detail = rej.detail or rej.reason
                unassigned[int(rej.order_id)].append(f"{rej.reason}:{detail}")

        merged_assigned = [*mobile_entries, *assigned_from_service]

        unassigned_list = [
            PickingOrchestratorUnassignedOrder(order_id=oid, reasons=list(reasons))
            for oid, reasons in sorted(unassigned.items())
            if reasons
        ]

        bulk_n = sum(1 for e in merged_assigned if e.picking_mode in ("BULK", "SCANNED_CART"))
        basket_n = sum(1 for e in merged_assigned if e.picking_mode == "BASKETS")

        summary = PickingOrchestratorRunSummary(
            total_input_orders=len(unique_ids),
            assigned_count=len(merged_assigned),
            unassigned_count=len(unassigned_list),
            mobile_queue_count=len(mobile_entries),
            bulk_assigned_count=bulk_n,
            baskets_assigned_count=basket_n,
            assignment_service_invoked=service_invoked,
        )

        return PickingOrchestratorResult(
            mode_single=config.mode_single,
            mode_multi=config.mode_multi,
            assigned_containers=merged_assigned,
            unassigned_orders=unassigned_list,
            cart_summaries=cart_summaries,
            summary=summary,
        )
