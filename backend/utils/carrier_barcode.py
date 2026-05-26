"""Generowanie kodów kreskowych / etykiet dla nośników magazynowych WMS."""

from __future__ import annotations

import re
from typing import Literal

CARRIER_BARCODE_PREFIXES = ("PAL-", "BOX-", "BIN-", "CRT-", "MIX-")
CarrierPrefix = Literal["PAL", "BOX", "BIN", "CRT", "MIX"]


def normalize_carrier_prefix(prefix: str) -> CarrierPrefix:
    p = (prefix or "").strip().upper().rstrip("-")
    if p in ("PAL", "BOX", "BIN", "CRT", "MIX"):
        return p  # type: ignore[return-value]
    raise ValueError("prefix must be PAL, BOX, BIN, CRT or MIX")


def next_carrier_numeric_suffix(db, tenant_id: int, *, prefix: CarrierPrefix) -> int:
    """Kolejny numer dla ``{prefix}-{n:06d}`` w ramach tenanta (na podstawie istniejących ``warehouse_carriers.barcode``)."""
    from sqlalchemy.orm import Session

    from ..models.warehouse_carrier import WarehouseCarrier

    if not isinstance(db, Session):
        raise TypeError("db must be Session")
    pat = f"{prefix}-%"
    rows = (
        db.query(WarehouseCarrier.barcode)
        .filter(WarehouseCarrier.tenant_id == int(tenant_id), WarehouseCarrier.barcode.like(pat))
        .all()
    )
    max_n = 0
    rx = re.compile(rf"^{re.escape(prefix)}-(\d{{1,12}})$", re.I)
    for (bc,) in rows:
        s = (bc or "").strip().upper()
        m = rx.match(s)
        if m:
            try:
                max_n = max(max_n, int(m.group(1)))
            except ValueError:
                continue
    return max_n + 1


def generate_carrier_barcode(db, tenant_id: int, *, prefix: str = "PAL") -> str:
    p = normalize_carrier_prefix(prefix)
    n = next_carrier_numeric_suffix(db, tenant_id, prefix=p)
    return f"{p}-{n:06d}"


def infer_prefix_from_barcode(barcode: str) -> CarrierPrefix | None:
    b = (barcode or "").strip().upper()
    for pref in ("PAL", "BOX", "BIN", "CRT", "MIX"):
        if b.startswith(pref + "-"):
            return pref  # type: ignore[return-value]
    return None
