from __future__ import annotations

import pytest

from backend.models.product import Product
from backend.services.production_execution.production_traceability_policy import (
    resolve_effective_production_traceability,
    validate_product_production_trace_modes,
)


def _product(
    *,
    batch: bool = False,
    serial: bool = False,
    expiry: bool = False,
    batch_mode: str = "INHERIT",
    serial_mode: str = "INHERIT",
    expiry_mode: str = "INHERIT",
) -> Product:
    return Product(
        track_batch=batch,
        track_serial=serial,
        track_expiry=expiry,
        production_trace_batch_mode=batch_mode,
        production_trace_serial_mode=serial_mode,
        production_trace_expiry_mode=expiry_mode,
    )


@pytest.mark.parametrize(
    ("case", "product", "settings", "expected"),
    [
        ("A", _product(), {"mode": "OFF"}, (False, False, False)),
        ("B", _product(batch=True), {"mode": "CONFIGURED", "require_batch": True}, (True, False, False)),
        ("C", _product(batch=False), {"mode": "CONFIGURED", "require_batch": True}, (False, False, False)),
        ("D", _product(serial=True, serial_mode="REQUIRE"), {"mode": "CONFIGURED"}, (False, True, False)),
        ("E", _product(expiry=True, expiry_mode="OFF"), {"mode": "CONFIGURED", "require_expiry": True}, (False, False, False)),
        (
            "F",
            _product(batch=True, serial=True, expiry=True),
            {
                "mode": "CONFIGURED",
                "require_batch": True,
                "require_serial": True,
                "require_expiry": True,
            },
            (True, True, True),
        ),
        (
            "G",
            _product(batch=True, serial=True, expiry=True, batch_mode="OFF", serial_mode="REQUIRE"),
            {"mode": "CONFIGURED", "require_batch": True, "require_expiry": True},
            (False, True, True),
        ),
    ],
)
def test_independent_policy_cases_a_to_g(case, product, settings, expected):
    del case
    out = resolve_effective_production_traceability(product, settings)
    assert (out.require_batch, out.require_serial, out.require_expiry) == expected


def test_global_off_ignores_require_override():
    product = _product(batch=True, batch_mode="REQUIRE")
    out = resolve_effective_production_traceability(product, {"mode": "OFF", "require_batch": True})
    assert out.require_batch is False


@pytest.mark.parametrize(
    ("field", "capability"),
    [
        ("production_trace_batch_mode", "track_batch"),
        ("production_trace_serial_mode", "track_serial"),
        ("production_trace_expiry_mode", "track_expiry"),
    ],
)
def test_require_rejected_without_capability(field, capability):
    product = _product()
    setattr(product, field, "REQUIRE")
    setattr(product, capability, False)
    with pytest.raises(ValueError):
        validate_product_production_trace_modes(product)


@pytest.mark.parametrize("override,global_required,expected", [
    ("INHERIT", False, False),
    ("INHERIT", True, True),
    ("REQUIRE", False, True),
    ("REQUIRE", True, True),
    ("OFF", False, False),
    ("OFF", True, False),
])
def test_resolution_matrix(override, global_required, expected):
    product = _product(batch=True, batch_mode=override)
    out = resolve_effective_production_traceability(
        product,
        {"mode": "CONFIGURED", "require_batch": global_required},
    )
    assert out.require_batch is expected


def test_policy_does_not_import_receiving_resolver():
    import backend.services.production_execution.production_traceability_policy as module

    assert "product_validation_policy" not in module.__dict__


class _UnitOfWork:
    def add(self, _entity):
        pass

    def flush(self):
        pass


def test_fg_snapshot_locks_identity_and_progressive_serials(monkeypatch):
    from backend.models.production import ProductionOrder
    from backend.services.production_execution import production_fg_traceability as fg
    from backend.services.production_execution.production_traceability_policy import (
        ProductionTraceabilityPolicy,
    )

    monkeypatch.setattr(
        fg,
        "resolve_effective_production_traceability_for_product",
        lambda *args, **kwargs: ProductionTraceabilityPolicy(
            require_batch=True, require_serial=True, require_expiry=True
        ),
    )
    monkeypatch.setattr(fg, "_assert_serials_unused", lambda *args, **kwargs: None)
    order = ProductionOrder(product_id=10, tenant_id=1, warehouse_id=1)
    db = _UnitOfWork()
    snap = fg.lock_fg_traceability_snapshot(
        db,
        entity=order,
        tenant_id=1,
        warehouse_id=1,
        product=_product(batch=True, serial=True, expiry=True),
        batch_number="FG-01",
        expiry_date="2027-01-31",
    )
    assert snap["batch_number"] == "FG-01"
    fg.append_fg_serials(
        db,
        entity=order,
        tenant_id=1,
        product_id=10,
        delta_quantity=2,
        serial_numbers=["SN-1", "SN-2"],
    )
    with pytest.raises(ValueError):
        fg.append_fg_serials(
            db,
            entity=order,
            tenant_id=1,
            product_id=10,
            delta_quantity=1,
            serial_numbers=["SN-2"],
        )
    assert fg.assert_fg_traceability_ready(order, expected_quantity=2)["serial_numbers"] == [
        "SN-1",
        "SN-2",
    ]


def test_serial_traceability_requires_integer_delta(monkeypatch):
    from backend.models.production import ProductionOrder
    from backend.services.production_execution import production_fg_traceability as fg
    from backend.services.production_execution.production_traceability_policy import (
        ProductionTraceabilityPolicy,
    )

    monkeypatch.setattr(
        fg,
        "resolve_effective_production_traceability_for_product",
        lambda *args, **kwargs: ProductionTraceabilityPolicy(require_serial=True),
    )
    order = ProductionOrder(product_id=10, tenant_id=1, warehouse_id=1)
    db = _UnitOfWork()
    fg.lock_fg_traceability_snapshot(
        db,
        entity=order,
        tenant_id=1,
        warehouse_id=1,
        product=_product(serial=True),
    )
    with pytest.raises(ValueError, match="całkowita"):
        fg.append_fg_serials(
            db,
            entity=order,
            tenant_id=1,
            product_id=10,
            delta_quantity=1.5,
            serial_numbers=["SN-1"],
        )
