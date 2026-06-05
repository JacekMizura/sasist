"""Series resolution rule engine — context-aware, no hardcoded document codes."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy.orm import Session

from ...models.document_series import DocumentSeries
from ...models.document_series_resolution_rule import DocumentSeriesResolutionRule
from ...models.order import Order
from ..document_number_service import resolve_default_document_series
from ..order_operational_mode import resolve_order_operational_mode

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SeriesResolutionContext:
    tenant_id: int
    warehouse_id: int
    document_type: str
    document_subtype: str | None = None
    organization_id: int | None = None
    country_id: int | None = None
    order_channel: str | None = None
    fulfillment_mode: str | None = None
    fiscal_profile: str | None = None
    operational_zone: str | None = None


def _norm(val: str | None) -> str | None:
    if val is None:
        return None
    s = str(val).strip().upper()
    return s or None


def _rule_score(rule: DocumentSeriesResolutionRule, ctx: SeriesResolutionContext) -> int:
    score = int(rule.priority or 100)
    checks = (
        (rule.warehouse_id, ctx.warehouse_id, 50),
        (rule.organization_id, ctx.organization_id, 30),
        (rule.country_id, ctx.country_id, 20),
        (_norm(rule.document_subtype), _norm(ctx.document_subtype), 40),
        (_norm(rule.order_channel), _norm(ctx.order_channel), 35),
        (_norm(rule.fulfillment_mode), _norm(ctx.fulfillment_mode), 35),
        (_norm(rule.fiscal_profile), _norm(ctx.fiscal_profile), 15),
        (_norm(rule.operational_zone), _norm(ctx.operational_zone), 15),
    )
    for rule_val, ctx_val, weight in checks:
        if rule_val is None:
            continue
        if ctx_val is None or rule_val != ctx_val:
            return -1
        score -= weight
    return score


def resolve_document_series(
    db: Session,
    ctx: SeriesResolutionContext,
) -> DocumentSeries | None:
    """Resolve series by rules engine, fallback to default lookup."""
    doc_type = _norm(ctx.document_type) or "SALE"
    sub = _norm(ctx.document_subtype)

    rules = (
        db.query(DocumentSeriesResolutionRule)
        .filter(
            DocumentSeriesResolutionRule.tenant_id == int(ctx.tenant_id),
            DocumentSeriesResolutionRule.is_active != 0,
            DocumentSeriesResolutionRule.document_type == doc_type,
        )
        .all()
    )
    best: DocumentSeriesResolutionRule | None = None
    best_score = -1
    for rule in rules:
        if rule.warehouse_id is not None and int(rule.warehouse_id) != int(ctx.warehouse_id):
            continue
        sc = _rule_score(rule, ctx)
        if sc >= 0 and (best is None or sc < best_score):
            best = rule
            best_score = sc

    if best is not None:
        series = db.query(DocumentSeries).filter(DocumentSeries.id == str(best.series_id)).first()
        if series is not None:
            logger.debug(
                "[document.pipeline] series resolved via rule rule_id=%s series_id=%s score=%s",
                best.id,
                series.id,
                best_score,
            )
            return series

    if sub:
        return resolve_default_document_series(
            db,
            tenant_id=int(ctx.tenant_id),
            warehouse_id=int(ctx.warehouse_id),
            series_type=doc_type,
            subtype=sub,
        )
    return None


def series_context_from_order(
    db: Session,
    order: Order,
    *,
    document_type: str,
    document_subtype: str,
    fiscal_profile: str | None = None,
    operational_zone: str | None = None,
) -> SeriesResolutionContext:
    mode = resolve_order_operational_mode(order)
    return SeriesResolutionContext(
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        document_type=document_type,
        document_subtype=document_subtype,
        order_channel=mode.order_channel,
        fulfillment_mode=mode.fulfillment_mode,
        fiscal_profile=fiscal_profile,
        operational_zone=operational_zone,
    )
