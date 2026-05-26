"""Shipping methods: import resolution, OTHER fallback, alias helpers."""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from typing import FrozenSet, Iterable, List, Optional, Tuple

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from ..models.shipping_method import ShippingMethod

OTHER_CODE = "OTHER"
OTHER_NAME = "Inne"
DEFAULT_OTHER_ALIASES = ("inne", "other", "pozostałe", "pozostale", "unknown", "misc")

# Fixed carrier rows per warehouse (+ OTHER). Import must never create arbitrary methods.
CANONICAL_CARRIER_CODES: Tuple[str, ...] = (
    "INPOST",
    "DPD",
    "DHL",
    "ORLEN_PACZKA",
    "ALLEGRO_ONE",
    "TEMU",
)
# (code, display_name, import aliases — lowercase phrases, ``phrase in normalized_label``)
CANONICAL_CARRIERS: Tuple[Tuple[str, str, Tuple[str, ...]], ...] = (
    (
        "INPOST",
        "InPost",
        (
            "inpost",
            "inpost kurier",
            "kurier inpost",
            "e-nadawca",
            "paczkomat inpost",
            "przesyłka inpost",
            "przesylka inpost",
        ),
    ),
    ("DPD", "DPD", ("dpd", "kurier dpd", "dpd kurier", "dpd pick up", "dpd pickup", "pickup dpd")),
    ("DHL", "DHL", ("dhl", "dhl express", "kurier dhl")),
    ("ORLEN_PACZKA", "Orlen Paczka", ("orlen paczka", "orlenpaczka", "kurier orlen", "orlen pickup")),
    (
        "ALLEGRO_ONE",
        "Allegro One",
        ("allegro one", "allegro_one", "allegro smart", "smart!", "onet fulfillment"),
    ),
    ("TEMU", "TEMU", ("temu", "kurier temu","TEMU","Temu Kurier")),
)

CANONICAL_DISPLAY_NAME_BY_CODE: dict[str, str] = {c: n for c, n, _ in CANONICAL_CARRIERS}

# Stable list order in UI (canonical carriers, then OTHER / Inne).
SHIPPING_METHOD_LIST_SORT_INDEX: dict[str, int] = {
    code: idx for idx, code in enumerate([*CANONICAL_CARRIER_CODES, OTHER_CODE])
}


def allowed_shipping_method_codes() -> FrozenSet[str]:
    return frozenset({OTHER_CODE, *CANONICAL_CARRIER_CODES})


# Heuristic: pickup-point / address rows mistakenly stored as ShippingMethod.name
_JUNK_POSTAL_RE = re.compile(r"\b\d{2}-\d{3}\b")
# InPost / locker machine ids (e.g. BYD118M, KRA01A)
_PACZKOMAT_MACHINE = re.compile(r"\b[A-Z]{2,4}\d{2,5}[A-Z]?\b", re.IGNORECASE)


def normalize_import_label(label: Optional[str]) -> str:
    return (label or "").strip().lower()


def parse_aliases_json(raw: Optional[str]) -> List[str]:
    if not raw or not str(raw).strip():
        return []
    try:
        data = json.loads(raw)
        if not isinstance(data, list):
            return []
        out: List[str] = []
        for x in data:
            s = str(x).strip().lower()
            if s:
                out.append(s)
        return out
    except (json.JSONDecodeError, TypeError, ValueError):
        return []


def dump_aliases_json(aliases: Iterable[str]) -> Optional[str]:
    seen: set[str] = set()
    out: List[str] = []
    for a in aliases:
        s = str(a).strip().lower()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    if not out:
        return None
    return json.dumps(out, ensure_ascii=False)


def normalize_code(raw: Optional[str]) -> str:
    s = (raw or "").strip().upper()
    s = re.sub(r"[^A-Z0-9_]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s[:64]


def slug_code_from_name(name: str, suffix: str = "") -> str:
    base = normalize_code(re.sub(r"\s+", "_", (name or "").strip()) or "METHOD")
    if not base:
        base = "METHOD"
    if suffix:
        suf = normalize_code(suffix)[:12]
        base = f"{base[: max(1, 64 - len(suf) - 1)]}_{suf}"
    return base[:64]


def _allocate_unique_code(db: Session, *, tenant_id: int, warehouse_id: int, base: str, exclude_id: Optional[str]) -> str:
    c = base[:64] or "METHOD"
    n = 2
    while True:
        q = db.query(ShippingMethod).filter(
            ShippingMethod.tenant_id == int(tenant_id),
            ShippingMethod.warehouse_id == int(warehouse_id),
            ShippingMethod.code == c,
        )
        if exclude_id:
            q = q.filter(ShippingMethod.id != exclude_id)
        if q.first() is None:
            return c
        tail = f"_{n}"
        c = (base[: 64 - len(tail)] + tail)[:64]
        n += 1
        if n > 9999:
            c = f"M_{uuid.uuid4().hex[:12].upper()}"
            return c[:64]


def is_junk_pickup_or_address_shipping_method(*, name: str, code: str) -> bool:
    """
    Rows that look like a full pickup-point / address line, not a reusable carrier row.
    Never treat allowed dictionary codes (OTHER + canonical carriers) as junk.
    """
    code_u = (code or "").strip().upper()
    if code_u in allowed_shipping_method_codes():
        return False
    n = (name or "").strip()
    if not n:
        return False
    nl = n.lower()
    compact = re.sub(r"\s+", "", n)
    if _PACZKOMAT_MACHINE.fullmatch(compact):
        return True
    if _PACZKOMAT_MACHINE.search(n) and len(n) <= 14:
        return True
    if len(n) > 42:
        return True
    if "http://" in nl or "https://" in nl:
        return True
    if "\n" in n or "\r" in n:
        return True
    if _JUNK_POSTAL_RE.search(n):
        return True
    if n.count(",") >= 3 and len(n) > 32:
        return True
    # Pickup / kiosk style blobs (often short but never a reusable carrier row)
    if "24/7" in nl and len(n) > 16:
        return True
    if "allegro" in nl and len(n) > 20:
        return True
    if "paczkomat" in nl:
        return True
    if "punkt odbioru" in nl or "odbiór osobisty" in nl or "odbior osobisty" in nl:
        return True
    if re.search(r"\bul\.\s*\S", nl) and len(n) > 24:
        return True
    return False


def _rewire_carton_shipping_links(db: Session, old_sm_id: str, new_sm_id: str) -> None:
    """Move carton M2M links from a removed method to the replacement (keeps carton rules)."""
    if str(old_sm_id) == str(new_sm_id):
        return
    chk = db.execute(
        text(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='carton_shipping_method_links' LIMIT 1"
        )
    ).fetchone()
    if not chk:
        return
    rows = db.execute(
        text("SELECT carton_id FROM carton_shipping_method_links WHERE shipping_method_id = :o"),
        {"o": str(old_sm_id)},
    ).fetchall()
    for (carton_id,) in rows:
        db.execute(
            text(
                "DELETE FROM carton_shipping_method_links WHERE carton_id = :c AND shipping_method_id = :o"
            ),
            {"c": str(carton_id), "o": str(old_sm_id)},
        )
        db.execute(
            text(
                "INSERT OR IGNORE INTO carton_shipping_method_links (carton_id, shipping_method_id) "
                "VALUES (:c, :n)"
            ),
            {"c": str(carton_id), "n": str(new_sm_id)},
        )


def cleanup_junk_shipping_methods(db: Session) -> int:
    """
    Remove shipping-method rows that are clearly pickup points / addresses.
    Re-point ``orders.shipping_method_id`` to **OTHER** and delete the junk row.
    Caller should ``commit`` the session. Returns number of rows deleted.
    """
    from ..models.order import Order

    deleted = 0
    for m in db.query(ShippingMethod).order_by(ShippingMethod.id).all():
        nm = str(m.name or "")
        cd = str(getattr(m, "code", None) or "")
        if not is_junk_pickup_or_address_shipping_method(name=nm, code=cd):
            continue
        other = get_or_create_other_method(db, tenant_id=int(m.tenant_id), warehouse_id=int(m.warehouse_id))
        oid = str(other.id)
        oname = str(other.name)
        db.query(Order).filter(Order.shipping_method_id == str(m.id)).update(
            {Order.shipping_method_id: oid, Order.shipping_method: oname},
            synchronize_session=False,
        )
        _rewire_carton_shipping_links(db, str(m.id), oid)
        db.delete(m)
        deleted += 1
    return deleted


def get_or_create_other_method(db: Session, *, tenant_id: int, warehouse_id: int) -> ShippingMethod:
    row = (
        db.query(ShippingMethod)
        .filter(
            ShippingMethod.tenant_id == int(tenant_id),
            ShippingMethod.warehouse_id == int(warehouse_id),
            ShippingMethod.code == OTHER_CODE,
        )
        .first()
    )
    if row is not None:
        return row
    legacy = (
        db.query(ShippingMethod)
        .filter(
            ShippingMethod.tenant_id == int(tenant_id),
            ShippingMethod.warehouse_id == int(warehouse_id),
            ShippingMethod.name == OTHER_NAME,
        )
        .first()
    )
    if legacy is not None:
        prev_code = (getattr(legacy, "code", None) or "").strip().upper()
        if prev_code in ("", "MIGR"):
            legacy.code = OTHER_CODE
            if not parse_aliases_json(getattr(legacy, "aliases_json", None)):
                legacy.aliases_json = dump_aliases_json(DEFAULT_OTHER_ALIASES)
            legacy.updated_at = datetime.utcnow()
            db.flush()
        return legacy
    now = datetime.utcnow()
    row = ShippingMethod(
        id=str(uuid.uuid4()),
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        code=OTHER_CODE,
        name=OTHER_NAME,
        aliases_json=dump_aliases_json(DEFAULT_OTHER_ALIASES),
        logo_url=None,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.flush()
    return row


def resolve_shipping_method_for_import_label(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    label: Optional[str],
    method_pool: Optional[List[ShippingMethod]] = None,
) -> Tuple[str, str]:
    """
    Match normalized ``label`` against **aliases** and short **code** only (substring ``phrase in norm``).
    Does **not** match the full display ``name`` — avoids treating pickup-point blobs as carriers.
    Returns ``(shipping_method_id, display_name)``. Falls back to **OTHER** / „Inne”.

    If ``method_pool`` is set, only those rows are considered (used when purging stray methods so
    resolution does not match another junk row).
    """
    other = get_or_create_other_method(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    norm = normalize_import_label(label)
    if not norm:
        return str(other.id), str(other.name)

    if method_pool is not None:
        methods = [m for m in method_pool if bool(getattr(m, "is_active", True))]
    else:
        methods = (
            db.query(ShippingMethod)
            .filter(
                ShippingMethod.tenant_id == int(tenant_id),
                ShippingMethod.warehouse_id == int(warehouse_id),
                ShippingMethod.is_active.is_(True),
            )
            .all()
        )

    best_score = -1
    best: Optional[ShippingMethod] = None

    for m in methods:
        phrases: List[str] = []
        phrases.extend(parse_aliases_json(getattr(m, "aliases_json", None)))
        # Match **aliases + short code only** — never the full display ``name`` (avoids treating a
        # pickup-point line saved as name as a substring of itself; keeps carriers reusable).
        cc = (getattr(m, "code", None) or "").strip().lower()
        if cc:
            phrases.append(cc)
        seen: set[str] = set()
        for ph in phrases:
            if not ph or ph in seen:
                continue
            seen.add(ph)
            if ph in norm:
                score = len(ph)
                if score > best_score:
                    best_score = score
                    best = m

    if best is not None:
        return str(best.id), str(best.name)

    return str(other.id), str(other.name)


def ensure_canonical_carriers_for_warehouse(db: Session, *, tenant_id: int, warehouse_id: int) -> None:
    """
    Upsert the fixed carrier rows (+ OTHER via ``get_or_create_other_method``).
    Idempotent; safe to call on each list request for a warehouse.
    """
    get_or_create_other_method(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    now = datetime.utcnow()
    allowed = allowed_shipping_method_codes()
    for code, display_name, alias_tuple in CANONICAL_CARRIERS:
        row = (
            db.query(ShippingMethod)
            .filter(
                ShippingMethod.tenant_id == int(tenant_id),
                ShippingMethod.warehouse_id == int(warehouse_id),
                ShippingMethod.code == code,
            )
            .first()
        )
        base_aliases = list(alias_tuple) + [str(code).lower()]
        if row is not None:
            row.name = display_name[:256]
            merged = list(dict.fromkeys(parse_aliases_json(getattr(row, "aliases_json", None)) + base_aliases))
            row.aliases_json = dump_aliases_json(merged)
            row.is_active = True
            row.updated_at = now
            continue
        legacy = (
            db.query(ShippingMethod)
            .filter(
                ShippingMethod.tenant_id == int(tenant_id),
                ShippingMethod.warehouse_id == int(warehouse_id),
                func.lower(ShippingMethod.name) == display_name.lower(),
            )
            .first()
        )
        if legacy is not None and (getattr(legacy, "code", None) or "").strip().upper() not in allowed:
            legacy.code = code
            legacy.name = display_name[:256]
            merged = list(dict.fromkeys(parse_aliases_json(getattr(legacy, "aliases_json", None)) + base_aliases))
            legacy.aliases_json = dump_aliases_json(merged)
            legacy.is_active = True
            legacy.updated_at = now
            db.flush()
            continue
        db.add(
            ShippingMethod(
                id=str(uuid.uuid4()),
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                code=code,
                name=display_name[:256],
                aliases_json=dump_aliases_json(base_aliases),
                logo_url=None,
                is_active=True,
                created_at=now,
                updated_at=now,
            )
        )
        db.flush()


def purge_non_canonical_shipping_methods(db: Session) -> int:
    """
    Remove any ``ShippingMethod`` whose ``code`` is not OTHER or a canonical carrier code.
    Rewires ``orders`` + carton M2M to the best match from the allowed pool (aliases + code only).
    """
    from ..models.order import Order

    allowed_codes = list(allowed_shipping_method_codes())
    deleted = 0
    for m in list(db.query(ShippingMethod).order_by(ShippingMethod.id).all()):
        cc = (getattr(m, "code", None) or "").strip().upper()
        if cc in allowed_shipping_method_codes():
            continue
        tid, wid = int(m.tenant_id), int(m.warehouse_id)
        pool = (
            db.query(ShippingMethod)
            .filter(
                ShippingMethod.tenant_id == tid,
                ShippingMethod.warehouse_id == wid,
                ShippingMethod.code.in_(allowed_codes),
            )
            .all()
        )
        parts: List[str] = [str(m.name or "")]
        parts.extend(parse_aliases_json(getattr(m, "aliases_json", None)))
        composite = " ".join(p for p in parts if p)
        sid, sname = resolve_shipping_method_for_import_label(
            db,
            tenant_id=tid,
            warehouse_id=wid,
            label=composite or None,
            method_pool=pool,
        )
        if str(sid) == str(m.id):
            other = get_or_create_other_method(db, tenant_id=tid, warehouse_id=wid)
            sid, sname = str(other.id), str(other.name)
        db.query(Order).filter(Order.shipping_method_id == str(m.id)).update(
            {Order.shipping_method_id: sid, Order.shipping_method: sname},
            synchronize_session=False,
        )
        _rewire_carton_shipping_links(db, str(m.id), str(sid))
        db.delete(m)
        deleted += 1
    return deleted


def get_or_create_shipping_method_for_label(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    label: Optional[str],
) -> Tuple[Optional[str], Optional[str]]:
    """
    Resolve ``label`` to an **existing** active method via aliases + short ``code`` only, or **OTHER**.
    Does **not** create new ``ShippingMethod`` rows from import text (only ``OTHER`` may be created
    indirectly via ``get_or_create_other_method``). Empty label → ``(None, None)``.
    """
    if not label or not str(label).strip():
        return None, None
    sid, name = resolve_shipping_method_for_import_label(db, tenant_id=tenant_id, warehouse_id=warehouse_id, label=label)
    return sid, name
