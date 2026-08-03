"""Soft CTA / next_action from operational phase → existing WMS modules (no new screens)."""

from __future__ import annotations

from .constants import (
    SUPPLY_FLOW_PHASE_AWIZOWANA,
    SUPPLY_FLOW_PHASE_NA_RAMPIE,
    SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
    SUPPLY_FLOW_PHASE_ROZLADUNEK,
    SUPPLY_FLOW_PHASE_ROZLOKOWANIE,
    SUPPLY_FLOW_PHASE_W_DRODZE,
    SUPPLY_FLOW_PHASE_ZAKONCZONA,
)
from .plan_models import SupplyFlowCta, SupplyFlowNextAction


# Paths mirror frontend WMS_ROUTES — soft hints only.
_PATH_GOODS_ORDERS = "/goods-orders"
_PATH_RECEIVING = "/wms/receiving"
_PATH_PUTAWAY = "/wms/putaway"


def cta_for_phase(
    phase: str | None,
    *,
    delivery_id: int | None = None,
    pz_id: int | None = None,
) -> SupplyFlowCta | None:
    p = (phase or "").strip().upper()
    if p in (SUPPLY_FLOW_PHASE_AWIZOWANA, SUPPLY_FLOW_PHASE_W_DRODZE):
        path = f"{_PATH_GOODS_ORDERS}/{delivery_id}" if delivery_id else _PATH_GOODS_ORDERS
        return SupplyFlowCta(
            module="inbound_delivery",
            path=path,
            label="Otwórz dostawę",
            delivery_id=delivery_id,
        )
    if p in (SUPPLY_FLOW_PHASE_NA_RAMPIE, SUPPLY_FLOW_PHASE_ROZLADUNEK):
        path = f"{_PATH_RECEIVING}/pz/{pz_id}" if pz_id else _PATH_RECEIVING
        return SupplyFlowCta(
            module="receiving",
            path=path,
            label="Przejdź do przyjęcia",
            delivery_id=delivery_id,
            extras={"pz_id": pz_id} if pz_id else {},
        )
    if p in (SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA, SUPPLY_FLOW_PHASE_ROZLOKOWANIE):
        path = f"{_PATH_PUTAWAY}/{pz_id}" if pz_id else _PATH_PUTAWAY
        return SupplyFlowCta(
            module="putaway",
            path=path,
            label="Przejdź do rozlokowania",
            delivery_id=delivery_id,
            extras={"pz_id": pz_id} if pz_id else {},
        )
    if p == SUPPLY_FLOW_PHASE_ZAKONCZONA:
        return SupplyFlowCta(
            module="supply_flow",
            path=_PATH_GOODS_ORDERS,
            label="Dostawa zakończona",
            delivery_id=delivery_id,
        )
    return None


def next_action_for_phase(
    phase: str | None,
    *,
    delivery_id: int | None = None,
    pz_id: int | None = None,
    plan_version: int | None = None,
) -> SupplyFlowNextAction | None:
    cta = cta_for_phase(phase, delivery_id=delivery_id, pz_id=pz_id)
    if cta is None:
        return None
    return SupplyFlowNextAction(
        kind=cta.module,
        delivery_id=delivery_id,
        path=cta.path,
        label=cta.label,
        plan_version=plan_version,
        extras=dict(cta.extras or {}),
    )
