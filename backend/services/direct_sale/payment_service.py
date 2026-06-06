"""Payment orchestration — state machine, not boolean flags."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession, Payment, PaymentTransaction
from ...models.order import Order
from .errors import DirectSaleError
from ..operational_observability import log_payment_orchestration
from ..operational_sales_events import emit_operational_sales_event

_PROVIDER_FOR_METHOD = {
    "CASH": "CASH",
    "CARD": "TERMINAL",
    "BLIK": "PAYU",
    "TRANSFER": "BANK",
}


def load_payment_for_session(
    db: Session,
    sess: DirectSaleSession,
    *,
    order_id: int | None = None,
) -> Payment | None:
    """Idempotent — return existing payment for session/order."""
    pay = (
        db.query(Payment)
        .filter(
            Payment.direct_sale_session_id == int(sess.id),
            Payment.tenant_id == int(sess.tenant_id),
        )
        .order_by(Payment.id.desc())
        .first()
    )
    if pay is not None:
        return pay
    if order_id:
        return (
            db.query(Payment)
            .filter(
                Payment.order_id == int(order_id),
                Payment.tenant_id == int(sess.tenant_id),
            )
            .order_by(Payment.id.desc())
            .first()
        )
    return None


def orchestrate_direct_sale_payment(
    db: Session,
    *,
    order: Order,
    sess: DirectSaleSession,
    amount: float,
    method: str = "CASH",
    payment_splits: list[dict] | None = None,
    performed_by_user_id: int | None = None,
) -> Payment:
    existing = load_payment_for_session(db, sess, order_id=int(order.id))
    if existing is not None:
        return existing

    amt = round(float(amount or 0), 2)
    if amt <= 0:
        raise DirectSaleError("Kwota płatności musi być > 0.", code="invalid_payment_amount")
    m = (method or "CASH").strip().upper()

    split_rows: list[tuple[str, float]] = []
    if m == "MIXED" and payment_splits:
        for row in payment_splits:
            sm = str(row.get("method") or "").strip().upper()
            sa = round(float(row.get("amount") or 0), 2)
            if sm and sa > 0:
                split_rows.append((sm, sa))
        split_sum = round(sum(x[1] for x in split_rows), 2)
        if abs(split_sum - amt) > 0.02:
            raise DirectSaleError(
                f"Suma płatności mieszanej ({split_sum}) musi równać się kwocie sprzedaży ({amt}).",
                code="invalid_payment_amount",
            )
    if not split_rows:
        split_rows = [(m, amt)]

    provider = _PROVIDER_FOR_METHOD.get(m if m != "MIXED" else split_rows[0][0], "CASH")
    terminal_id = str(sess.workstation_id) if sess.workstation_id else None
    pay = Payment(
        tenant_id=int(order.tenant_id),
        order_id=int(order.id),
        direct_sale_session_id=int(sess.id),
        status="PENDING",
        method=m,
        amount=amt,
        currency=str(order.currency or "PLN"),
        created_by_user_id=performed_by_user_id,
        performed_by_user_id=performed_by_user_id,
        device_id=int(sess.workstation_id) if sess.workstation_id else None,
        payment_provider=provider,
        terminal_id=terminal_id,
        settlement_state="PENDING",
    )
    db.add(pay)
    db.flush()

    for sm, sa in split_rows:
        txn_auth = PaymentTransaction(
            payment_id=int(pay.id),
            method=sm,
            amount=sa,
            status="AUTHORIZED",
        )
        db.add(txn_auth)
    db.flush()

    emit_operational_sales_event(
        db,
        "payment.authorized",
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        order_id=int(order.id),
        session_id=int(sess.id),
        source="direct_sales",
        performed_by_user_id=performed_by_user_id,
        device_id=int(sess.workstation_id) if sess.workstation_id else None,
        extra={"payment_id": int(pay.id), "amount": amt, "method": m},
    )

    for sm, sa in split_rows:
        txn_settle = PaymentTransaction(
            payment_id=int(pay.id),
            method=sm,
            amount=sa,
            status="PAID",
            external_ref=f"DS-{sess.id}-{pay.id}-{sm}",
        )
        db.add(txn_settle)
    pay.status = "PAID"
    pay.captured_at = datetime.utcnow()
    pay.settlement_state = "SETTLED"
    pay.authorization_reference = f"AUTH-{pay.id}"
    pay.external_transaction_id = f"DS-{sess.id}-{pay.id}"
    db.flush()
    log_payment_orchestration(
        action="completed",
        payment_id=int(pay.id),
        order_id=int(order.id),
        session_id=int(sess.id),
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        amount=amt,
        provider=provider,
        method=m,
        settlement_state="SETTLED",
        operator_id=performed_by_user_id,
        workstation_id=int(sess.workstation_id) if sess.workstation_id else None,
    )

    emit_operational_sales_event(
        db,
        "payment.completed",
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        order_id=int(order.id),
        session_id=int(sess.id),
        source="direct_sales",
        performed_by_user_id=performed_by_user_id,
        device_id=int(sess.workstation_id) if sess.workstation_id else None,
        extra={"payment_id": int(pay.id), "amount": amt},
    )
    return pay
