"""
IMPORT SERVICE

Obsługuje:
- import produktów (w tym kolumny o tej samej nazwie, np. trzy "Wymiary opakowań" – rozróżniane po indeksie).
  Domyślne mapowanie indeksów dla "Wymiary opakowań": Index 5 = Długość (L), 6 = Szerokość (W), 7 = Wysokość (H).
  Wartości liczbowe z przecinkiem (np. 4,5) są normalizowane do kropki przed konwersją na float.
- import zamówień z wieloma pozycjami
"""

import csv
import json
import logging
import re
from collections import Counter, defaultdict
from typing import Any
from datetime import datetime
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.bundle import Bundle, BundleItem
from ..models.product import Product
from ..models.inventory import Inventory
from ..models.inventory_unit import InventoryUnit
from ..models.location import Location
from ..models.import_log import ImportLog
from ..models.manufacturer import Manufacturer
from ..config import product_refactor_flags as pr_flags
from ..services.shipping_method_service import get_or_create_shipping_method_for_label
from ..services.order_default_new_panel_status import assign_default_new_panel_status_to_order
from ..services.bundle_explosion import BundleExplosionError, explode_bundle_line, merge_resolved_lines
from ..services.stock_disposition import DEFAULT_STOCK_DISPOSITION

logger = logging.getLogger(__name__)


def _normalize_ean(value) -> str | None:
    """
    GTIN/EAN: tylko cyfry; długości 8/12/13/14 bez usuwania wiodących zer.
    Inne liczbowe identyfikatory: cyfry po usunięciu separatorów, potem ltrim zer.
    """
    if value is None:
        return None
    s = str(value).strip().strip('"').strip("'").strip()
    if not s:
        return None
    digits = re.sub(r"\D", "", s)
    if not digits:
        return None
    if len(digits) in (8, 12, 13, 14):
        return digits
    return digits.lstrip("0") or "0"


def _strip_quotes(s) -> str:
    """Usuwa cudzysłowy i białe znaki z nagłówków i wartości CSV."""
    if s is None:
        return ""
    return str(s).strip().strip('"').strip("'").strip()


def _resolve_order_column(column_names: list, from_map: str | None, default_name: str) -> str | None:
    """
    Zwraca nazwę kolumny do użycia: z mapowania (po normalizacji) lub domyślną,
    jeśli pasuje do którejkolwiek kolumny w column_names (id ilosc ean(2).csv).
    """
    candidate = _strip_quotes(from_map) if from_map else ""
    if candidate and candidate in column_names:
        return candidate
    if default_name and default_name in column_names:
        return default_name
    # Dopasowanie po znormalizowanej nazwie
    default_norm = _strip_quotes(default_name)
    for cn in column_names:
        if _strip_quotes(cn) == default_norm:
            return cn
    if candidate:
        for cn in column_names:
            if _strip_quotes(cn) == candidate:
                return cn
    return candidate if candidate else (default_name if default_name in column_names else None)


# Obsługiwane formaty daty dla importu zamówień (kolejność ma znaczenie – bardziej szczegółowe pierwsze)
_ORDER_DATE_FMT = [
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%d.%m.%Y %H:%M:%S",
    "%d.%m.%Y %H:%M",
    "%Y-%m-%d",
    "%d.%m.%Y",
    "%d/%m/%Y %H:%M:%S",
    "%d/%m/%Y %H:%M",
    "%d/%m/%Y",
    "%Y/%m/%d %H:%M:%S",
    "%Y/%m/%d",
]


def _parse_order_date(value: str) -> datetime | None:
    """
    Parsuje datę zamówienia z CSV. Obsługuje m.in.:
    2024-10-23 19:05:12, 23.10.2024 19:05, 23.10.2024, 2024-10-23.
    Zwraca None jeśli wartość pusta lub parsing się nie uda.
    """
    if not value:
        return None
    raw = str(value).strip().strip('"').strip("'").strip()
    if not raw:
        return None
    # Normalize: remove trailing .0 from Excel/numeric export (e.g. "2024-10-23 19:05:12.0")
    if raw.endswith(".0"):
        raw = raw[:-2].strip()
    for fmt in _ORDER_DATE_FMT:
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    logger.warning("Could not parse order date: %s", raw[:80] if len(raw) > 80 else raw)
    return None


def _resolve_order_date_column(column_names: list, column_map: dict) -> str | None:
    """
    Zwraca nazwę kolumny z datą zamówienia: z mapowania lub jedna z domyślnych
    (Data dodania, Data zamówienia, order_date, date). Kolumna może być w column_names z sufiksem (n).
    """
    from_map = (
        _strip_quotes(
            column_map.get("order_date")
            or column_map.get("date")
            or column_map.get("Data dodania")
            or column_map.get("Data zamówienia")
        )
        or ""
    )
    if from_map and from_map in column_names:
        return from_map
    def _norm(s: str) -> str:
        return _strip_quotes(str(s).lstrip("\ufeff").strip())

    for default in ("Data dodania", "Data zamówienia", "order_date", "date"):
        if default in column_names:
            return default
        default_norm = _norm(default)
        for cn in column_names:
            if _norm(cn) == default_norm:
                return cn
            base = _norm(cn).split(" (")[0]
            if base == default_norm or (cn.startswith(default) and " (" in cn):
                return cn
    if from_map:
        for cn in column_names:
            if _strip_quotes(cn) == _strip_quotes(from_map):
                return cn
    return None


# Domyślna objętość gdy brak wymiarów (dm³) – 1 cm × 1 cm × 1 cm = 0.001 dm³
FALLBACK_VOLUME_DM3 = 0.001
# Domyślna wartość pojedynczego wymiaru gdy brak lub 0 (cm) – 1 cm dla obliczenia objętości
FALLBACK_DIMENSION_CM = 1.0

def _parse_price(value) -> float | None:
    """Parse price from CSV; handles Polish comma decimal (e.g. 1,21 or 4,9)."""
    if not value and value != 0:
        return None
    raw = str(value).strip().replace(",", ".")
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        logger.warning("Invalid price: %s", value)
        return None


# Polish and common CSV header aliases → model field key (for auto-mapping when column_map omits them)
PRODUCT_FIELD_ALIASES = {
    "purchase_price": ["Cena zakupu brutto", "Cena zakupu"],
    # Pierwsza kolumna „Cena” w pliku → sale_price; kolejne trafiają do metadata_json
    "sale_price": ["Cena", "Cena sprzedaży", "Cena sprzedaży brutto"],
    "manufacturer": ["Producent"],
    "unit": ["Jednostka"],
    "length": ["Długość"],
    "width": ["Szerokość"],
    "height": ["Wysokość"],
    "volume": ["Objętość"],
    "weight": ["Waga"],
    "ean": ["Kod EAN", "EAN"],
    "extra_ean": ["Dodatkowe kody EAN", "Dodatkowe EAN"],
    "catalog_number": ["Numer katalogowy"],
    "sku": ["SKU", "Symbol"],
    "symbol": ["Symbol"],
    "name": ["Nazwa", "Tytuł", "Nazwa produktu"],
    "title": ["Nazwa", "Tytuł"],
    "image_url": ["Zdjęcia", "URL zdjęcia", "Obraz"],
    "images": ["Zdjęcia", "URL zdjęcia", "Obraz"],
    "stock_quantity": ["Stan magazynowy", "Stan", "Stock", "Ilość magazynowa"],
    "location": ["Lokalizacja", "Location", "Lokalizacja magazynowa"],
}

SET_FIELD_ALIASES = {
    "set_sku": ["set_sku", "sku zestawu", "kod zestawu", "bundle sku", "sku setu"],
    "set_name": ["set_name", "nazwa zestawu", "bundle name", "nazwa setu"],
    "child_sku": ["child_sku", "sku skladowej", "sku produktu", "ean", "symbol"],
    "child_id": ["child_id", "id skladnika", "id produktu", "product id"],
    "child_ean": ["child_ean", "ean skladnika"],
    "child_symbol": ["child_symbol", "symbol skladnika"],
    "child_catalog_number": ["child_catalog", "numer katalogowy skladnika"],
    "child_images": ["child_images", "zdjecia", "zdjęcia skladnika"],
    "qty": ["qty", "ilosc", "ilość", "quantity", "sztuki"],
}

ORDER_FIELD_ALIASES = {
    "order_id": ["Identyfikator (ID)", "Numer zamówienia"],
    "order_number": ["Identyfikator (ID)", "Numer zamówienia"],
    "order_date": ["Data dodania", "Data zamówienia"],
    "date": ["Data dodania", "Data zamówienia"],
    "order_value": ["Kwota do zapłaty", "Wartość zamówienia", "Wartość"],
    "value": ["Kwota do zapłaty", "Wartość zamówienia", "Wartość"],
    "unit_price": ["Cena", "Cena jednostkowa"],
    "quantity": ["Ilość"],
    "ean": ["EAN", "Kod EAN"],
    "product_ean": ["EAN", "Kod EAN"],
    "product_name": ["Nazwa produktu"],
    "purchase_price": ["Cena zakupu"],
    "unit": ["Jednostka"],
    "city": ["Miasto"],
    "country": ["Kraj"],
    "delivery_cost": ["Koszt dostawy", "shipping_cost", "delivery_cost", "delivery_price", "courier_price"],
    "shipping_cost": ["Koszt dostawy", "shipping_cost", "delivery_cost", "delivery_price", "courier_price"],
    "courier_price": ["courier_price", "Courier price", "Koszt dostawy"],
    "delivery_price": ["delivery_price", "delivery_cost", "Koszt dostawy", "shipping_cost"],
}


def _parse_csv_bytes_to_rows(decoded: str) -> list:
    try:
        dialect = csv.Sniffer().sniff(decoded[:1000])
    except Exception:
        dialect = csv.excel
        dialect.delimiter = ";"
    lines = decoded.splitlines()
    return list(csv.reader(lines, dialect=dialect))


_PREVIEW_FALLBACK_DELIMITERS = (";", ",", "\t", "|")
_PREVIEW_SNIFF_SAMPLE_CHARS = 8000
_PREVIEW_MAX_LINES_FOR_SCORING = 50


def _decode_preview_csv_bytes(raw: bytes) -> str | None:
    """Decode upload bytes for CSV preview: UTF-8 BOM (utf-8-sig) then strict UTF-8."""
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            return None
    # utf-8-sig usually strips BOM; strip any remaining U+FEFF (e.g. duplicate BOM in source bytes).
    return text.lstrip("\ufeff")


def _preview_nonempty_rows(rows: list[list[str]]) -> list[list[str]]:
    return [r for r in rows if len(r) > 0]


def _preview_delimiter_quality(rows: list[list[str]]) -> tuple[int, int, int]:
    """
    Higher tuple (lexicographic) = better delimiter fit.
    Tier 2: every nonempty row has the same column count; tier 1: best-effort by majority width.
    """
    rows = _preview_nonempty_rows(rows)
    if not rows:
        return (-1, 0, 0)
    first_len = len(rows[0])
    if first_len <= 0:
        return (-1, 0, 0)
    lengths = [len(r) for r in rows]
    if all(n == first_len for n in lengths):
        return (2, first_len, len(rows))
    mode_len, cnt = Counter(lengths).most_common(1)[0]
    return (1, mode_len, cnt)


def _detect_preview_csv_delimiter(lines: list[str]) -> tuple[str, str]:
    """
    Pick CSV delimiter: try Sniffer (csv.Error-safe), then ; , tab | ordered fallbacks.
    Returns (delimiter, source) where source is 'sniff' or 'fallback'.
    """
    sample_lines = lines[:_PREVIEW_MAX_LINES_FOR_SCORING]
    sample_text = "\n".join(sample_lines)

    sniff_delim: str | None = None
    try:
        dialect = csv.Sniffer().sniff(
            sample_text[:_PREVIEW_SNIFF_SAMPLE_CHARS],
            delimiters="".join(_PREVIEW_FALLBACK_DELIMITERS),
        )
        d = dialect.delimiter
        if d in _PREVIEW_FALLBACK_DELIMITERS:
            sniff_delim = d
            logger.info("CSV preview: sniffer detected delimiter %r", sniff_delim)
    except csv.Error as exc:
        logger.info(
            "CSV preview: sniffer could not determine delimiter (%s); using fallbacks",
            exc,
        )

    candidates: list[tuple[str, str]] = []
    if sniff_delim:
        candidates.append((sniff_delim, "sniff"))
    for d in _PREVIEW_FALLBACK_DELIMITERS:
        if sniff_delim == d:
            continue
        candidates.append((d, "fallback"))

    if not candidates:
        candidates = [(d, "fallback") for d in _PREVIEW_FALLBACK_DELIMITERS]

    order_rank = {d: i for i, d in enumerate(_PREVIEW_FALLBACK_DELIMITERS)}

    best_q: tuple[int, int, int] | None = None
    best_delim = ","
    best_src = "fallback"

    for delim, src in candidates:
        rows = list(csv.reader(sample_lines, delimiter=delim, quotechar='"'))
        q = _preview_delimiter_quality(rows)
        if best_q is None or q > best_q:
            best_q, best_delim, best_src = q, delim, src
        elif q == best_q and best_q is not None:
            if best_src != "sniff" and src == "sniff":
                best_delim, best_src = delim, src
            elif best_src == "sniff" and src != "sniff":
                continue
            elif order_rank.get(delim, 99) < order_rank.get(best_delim, 99):
                best_delim, best_src = delim, src

    if best_src == "fallback":
        logger.info(
            "CSV preview: fallback delimiter selected %r (quality=%s)",
            best_delim,
            best_q,
        )
    return best_delim, best_src


def _product_metadata_merge(existing: str | None, patch: dict) -> str | None:
    if not patch:
        return existing if existing else None
    base: dict = {}
    if existing and str(existing).strip():
        try:
            loaded = json.loads(existing)
            base = loaded if isinstance(loaded, dict) else {"_legacy": loaded}
        except (json.JSONDecodeError, TypeError):
            base = {"_unparsed_previous_metadata": str(existing)}
    for k, v in patch.items():
        if v is None:
            continue
        if isinstance(v, str) and not v.strip():
            continue
        base[k] = v
    return json.dumps(base, ensure_ascii=False) if base else None


def _split_image_urls_for_import(raw) -> tuple[str | None, list[str]]:
    if raw is None or not str(raw).strip():
        return None, []
    chunks = [c.strip() for c in re.split(r"[\n\r;|]+", str(raw)) if c and str(c).strip()]
    cleaned = [_strip_quotes(c) for c in chunks]
    urls: list[str] = []
    for c in cleaned:
        if not c:
            continue
        if c.startswith("http://") or c.startswith("https://"):
            urls.append(c)
        elif c not in urls:
            urls.append(c)
    if not urls:
        return None, []
    return urls[0], urls[1:]


def _find_existing_product_for_import(
    db: Session,
    tenant_id: int,
    *,
    normalized_ean: str | None,
    ean_raw_display: str | None,
    sku_or_symbol: str | None,
    catalog_number: str | None,
    name: str | None,
) -> Product | None:
    if normalized_ean:
        p = (
            db.query(Product)
            .filter(Product.tenant_id == tenant_id, Product.ean == normalized_ean)
            .first()
        )
        if p:
            return p
    if ean_raw_display and ean_raw_display.strip():
        raw = ean_raw_display.strip()
        p = db.query(Product).filter(Product.tenant_id == tenant_id, Product.ean == raw).first()
        if p:
            return p
    if sku_or_symbol and sku_or_symbol.strip():
        key = sku_or_symbol.strip()
        p = (
            db.query(Product)
            .filter(
                Product.tenant_id == tenant_id,
                (Product.sku == key) | (Product.symbol == key),
            )
            .first()
        )
        if p:
            return p
    if catalog_number and str(catalog_number).strip():
        key = str(catalog_number).strip()
        p = (
            db.query(Product)
            .filter(Product.tenant_id == tenant_id, Product.catalog_number == key)
            .first()
        )
        if p:
            return p
    if name and name.strip():
        p = (
            db.query(Product)
            .filter(Product.tenant_id == tenant_id, Product.name == name.strip())
            .first()
        )
        if p:
            return p
    return None


def _parse_assigned_locations(raw) -> list:
    """Parse product.assigned_locations JSON to list of dicts."""
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            out = json.loads(raw)
            return out if isinstance(out, list) else []
        except (json.JSONDecodeError, TypeError):
            return []
    return []


def _resolve_first_assigned_location_id(db: Session, product: Product, warehouse_id: int) -> int | None:
    """
    Resolve product.assigned_locations first entry to Location.id in the given warehouse.
    First entry can have locationUUID, locationAddress, or label; we match Location.name.
    """
    locs = _parse_assigned_locations(getattr(product, "assigned_locations", None))
    if not locs or not isinstance(locs[0], dict):
        return None
    label = (
        (locs[0].get("locationUUID") or locs[0].get("locationAddress") or locs[0].get("label")) or ""
    ).strip()
    if not label:
        return None
    loc = (
        db.query(Location)
        .filter(Location.warehouse_id == warehouse_id, Location.name == label)
        .first()
    )
    return loc.id if loc else None


def _move_inventory_from_import_to_assigned(db: Session, warehouse_id: int, tenant_id: int) -> None:
    """
    For each Inventory at location 'Import' whose product has assigned_locations,
    update inventory (and InventoryUnit) to the first assigned storage location.
    If inventory already exists at the assigned location, merge quantities and remove Import row.
    """
    import_loc = (
        db.query(Location.id).filter(
            Location.warehouse_id == warehouse_id,
            Location.name == "Import",
        ).first()
    )
    if not import_loc:
        return
    import_loc_id = import_loc.id
    # Inventory at Import with product that has assigned_locations
    invs = (
        db.query(Inventory)
        .join(Product, Inventory.product_id == Product.id)
        .filter(
            Inventory.warehouse_id == warehouse_id,
            Inventory.tenant_id == tenant_id,
            Inventory.location_id == import_loc_id,
            Product.assigned_locations.isnot(None),
            Product.assigned_locations != "",
        )
        .all()
    )
    for inv in invs:
        product = inv.product
        assigned_loc_id = _resolve_first_assigned_location_id(db, product, warehouse_id)
        if assigned_loc_id is None or assigned_loc_id == import_loc_id:
            continue
        existing = (
            db.query(Inventory)
            .filter(
                Inventory.tenant_id == tenant_id,
                Inventory.product_id == inv.product_id,
                Inventory.warehouse_id == warehouse_id,
                Inventory.location_id == assigned_loc_id,
            )
            .first()
        )
        if existing:
            existing.quantity = (existing.quantity or 0) + (inv.quantity or 0)
            db.delete(inv)
            for unit in db.query(InventoryUnit).filter(
                InventoryUnit.tenant_id == tenant_id,
                InventoryUnit.product_id == inv.product_id,
                InventoryUnit.warehouse_id == warehouse_id,
                InventoryUnit.location_id == import_loc_id,
            ):
                existing_unit = (
                    db.query(InventoryUnit)
                    .filter(
                        InventoryUnit.tenant_id == tenant_id,
                        InventoryUnit.product_id == inv.product_id,
                        InventoryUnit.warehouse_id == warehouse_id,
                        InventoryUnit.location_id == assigned_loc_id,
                    )
                    .first()
                )
                if existing_unit:
                    existing_unit.quantity = (existing_unit.quantity or 0) + (unit.quantity or 0)
                    existing_unit.reserved_quantity = (existing_unit.reserved_quantity or 0) + (
                        unit.reserved_quantity or 0
                    )
                    db.delete(unit)
                else:
                    unit.location_id = assigned_loc_id
        else:
            inv.location_id = assigned_loc_id
            db.query(InventoryUnit).filter(
                InventoryUnit.tenant_id == tenant_id,
                InventoryUnit.product_id == inv.product_id,
                InventoryUnit.warehouse_id == warehouse_id,
                InventoryUnit.location_id == import_loc_id,
            ).update({InventoryUnit.location_id: assigned_loc_id})
    db.flush()


# Max per-row stock visibility logs per import (avoid huge log volume on bulk files).
_IMPORT_STOCK_VISIBILITY_ROW_CAP = 100


def _log_import_stock_visibility(
    tenant_id: int,
    warehouse_id: int,
    events: list[dict],
    *,
    import_move_from_import_to_assigned_ran: bool,
    ignored_csv_stock_rows: int = 0,
) -> None:
    """One summary + capped per-row info: qty imported and whether the post-import relocation step ran."""
    logger.info(
        "import_products stock visibility summary",
        extra={
            "tenant_id": tenant_id,
            "warehouse_id": warehouse_id,
            "stock_import_row_count": len(events),
            "ignored_csv_stock_rows": ignored_csv_stock_rows,
            "import_move_from_import_to_assigned_ran": import_move_from_import_to_assigned_ran,
            "import_move_from_import_to_assigned_skipped": not import_move_from_import_to_assigned_ran,
        },
    )
    cap = _IMPORT_STOCK_VISIBILITY_ROW_CAP
    for ev in events[:cap]:
        logger.info(
            "import stock row",
            extra={
                "tenant_id": tenant_id,
                "product_id": ev["product_id"],
                "warehouse_id": warehouse_id,
                "qty_imported": ev["qty"],
                "assigned_locations_present": ev["has_assigned_locations"],
                "import_move_from_import_to_assigned_ran": import_move_from_import_to_assigned_ran,
            },
        )
    if len(events) > cap:
        logger.info(
            "import stock row details truncated",
            extra={
                "tenant_id": tenant_id,
                "warehouse_id": warehouse_id,
                "logged_rows": cap,
                "total_rows": len(events),
            },
        )


def _column_value_to_index(headers: list, value) -> int | None:
    """
    Z wartości mapowania zwraca indeks kolumny.
    - Jeśli value to int (np. length_index: 5) – zwraca go.
    - Jeśli value to str kończące się na '(liczba)' (np. 'Wymiary opakowań (5)') – zwraca tę liczbę.
    - W przeciwnym razie szuka pierwszej kolumny o danej nazwie (bez sufiksu (n)).
    """
    if value is None:
        return None
    if isinstance(value, int):
        return value if 0 <= value < 10000 else None
    s = str(value).strip()
    if not s:
        return None
    match = re.match(r"^(.+)\s*\((\d+)\)\s*$", s)
    if match:
        return int(match.group(2))
    try:
        return next(i for i, h in enumerate(headers) if h == s)
    except StopIteration:
        return None


def _resolve_column_index(headers: list, column_names: list, column_map: dict, field_key: str, aliases: list) -> int | None:
    """
    Resolve CSV column index for a field: first from column_map, then from alias list.
    Returns index into headers/column_names or None.
    """
    from_map = column_map.get(field_key)
    idx = _column_value_to_index(headers, from_map)
    if idx is not None:
        return idx
    for alias in aliases:
        for i, cn in enumerate(column_names):
            base = _strip_quotes(cn).split(" (")[0].strip()
            if _strip_quotes(base) == _strip_quotes(alias) or _strip_quotes(cn) == _strip_quotes(alias):
                return i
    return None


def _column_base_name(col_name: str) -> str:
    """Strip duplicate suffix 'Name (12)' -> 'Name'."""
    s = _strip_quotes(col_name)
    if " (" in s and s.endswith(")"):
        return s.rsplit(" (", 1)[0].strip()
    return s


def _is_probable_ean_string(value: str | None) -> bool:
    if value is None:
        return False
    s = str(value).strip().strip('"').strip("'")
    return bool(re.fullmatch(r"\d{8}|\d{12}|\d{13}|\d{14}", s))


def _split_tracking_values(raw: str | None) -> list[str]:
    if not raw or not str(raw).strip():
        return []
    parts = re.split(r"[\s,;|/\n\r]+", str(raw).strip())
    return [p for p in (x.strip() for x in parts) if p]


def _find_product_for_order_line(
    db: Session,
    tenant_id: int,
    *,
    ean_raw: str | None,
    sku_internal: str | None,
    symbol: str | None,
    catalog_no: str | None,
    product_name: str | None,
    placeholder: Product,
) -> Product:
    """
    Match product for one order line. Priority:
    1) EAN (normalized when value looks like EAN)
    2) Wew. numer / internal SKU
    3) Symbol
    4) Numer katalogowy
    5) Exact product name
    """
    if ean_raw and _is_probable_ean_string(ean_raw):
        ne = _normalize_ean(ean_raw)
        if ne:
            product = db.query(Product).filter(Product.tenant_id == tenant_id, Product.ean == ne).first()
            if product:
                return product

    if catalog_no and str(catalog_no).strip():
        key = str(catalog_no).strip()
        product = (
            db.query(Product)
            .filter(Product.tenant_id == tenant_id, Product.catalog_number == key)
            .first()
        )
        if product:
            return product

    for val in (sku_internal, symbol):
        if val and str(val).strip():
            key = str(val).strip()
            product = (
                db.query(Product)
                .filter(
                    Product.tenant_id == tenant_id,
                    (Product.sku == key) | (Product.symbol == key),
                )
                .first()
            )
            if product:
                return product

    if product_name and product_name.strip():
        name_clean = product_name.strip()
        product = (
            db.query(Product)
            .filter(Product.tenant_id == tenant_id, Product.name == name_clean)
            .first()
        )
        if product:
            return product

    # Last resort: non-standard EAN field used as SKU (alphanumeric)
    if ean_raw and str(ean_raw).strip() and not _is_probable_ean_string(ean_raw):
        key = str(ean_raw).strip()
        product = (
            db.query(Product)
            .filter(
                Product.tenant_id == tenant_id,
                (Product.sku == key) | (Product.symbol == key) | (Product.ean == key),
            )
            .first()
        )
        if product:
            return product

    return placeholder


def _find_bundle_for_order_line(
    db: Session,
    tenant_id: int,
    *,
    ean_raw: str | None,
    sku_internal: str | None,
    symbol: str | None,
    catalog_no: str | None,
    product_name: str | None,
) -> Bundle | None:
    """
    Match an active bundle/set by the same refs as product lines (SKU/EAN/name).
    Used so CSV imports explode bundles into operational components like manual/API orders.
    """
    base_q = db.query(Bundle).filter(
        Bundle.tenant_id == tenant_id,
        Bundle.deleted_at.is_(None),
        Bundle.active.is_(True),
    )
    if ean_raw and _is_probable_ean_string(ean_raw):
        ne = _normalize_ean(ean_raw)
        if ne:
            b = base_q.filter(Bundle.ean == ne).first()
            if b:
                return b

    for val in (sku_internal, symbol, catalog_no):
        if val and str(val).strip():
            key = str(val).strip()
            b = base_q.filter(Bundle.sku == key).first()
            if b:
                return b

    if product_name and product_name.strip():
        name_clean = product_name.strip()
        b = base_q.filter(Bundle.name == name_clean).first()
        if b:
            return b

    if ean_raw and str(ean_raw).strip() and not _is_probable_ean_string(ean_raw):
        key = str(ean_raw).strip()
        b = base_q.filter((Bundle.sku == key) | (Bundle.ean == key)).first()
        if b:
            return b

    return None


def _merge_json_meta(base_json: str | None, extra: dict[str, Any]) -> str | None:
    if not extra:
        return base_json
    try:
        base = json.loads(base_json) if base_json and str(base_json).strip() else {}
        if not isinstance(base, dict):
            base = {}
    except json.JSONDecodeError:
        base = {}
    base.update(extra)
    return json.dumps(base, ensure_ascii=False)


def _find_product_for_order_item(
    db: Session,
    tenant_id: int,
    normalized_ean: str,
    product_name: str | None,
    placeholder: Product,
) -> Product:
    """Backward-compatible wrapper (legacy callers)."""
    return _find_product_for_order_line(
        db,
        tenant_id,
        ean_raw=normalized_ean if normalized_ean else None,
        sku_internal=None,
        symbol=None,
        catalog_no=None,
        product_name=product_name,
        placeholder=placeholder,
    )


# --- Sellasist-style CSV: item-level column bases (not forward-filled into order header) ---
_ITEM_COLUMN_BASES: frozenset[str] = frozenset(
    {
        "Nazwa produktu",
        "Cena",
        "Cena bez obniżek",
        "VAT",
        "Ilość",
        "Jednostka",
        "EAN",
        "Numer katalogowy",
        "Symbol",
        "Kategoria główna",
        "Cena zakupu",
        "Lokalizacja",
        "ID oferty zewnętrznej",
        "Wew. numer (sygnatura/SKU)",
    }
)


def _is_item_column(col_name: str) -> bool:
    return _column_base_name(col_name) in _ITEM_COLUMN_BASES


def _build_addresses_json(column_names: list[str], header: dict[str, str]) -> str | None:
    """Split duplicate address blocks into billing (first occurrence) + shipping (second)."""
    addr_fields = [
        "Nazwa firmy",
        "NIP firmy",
        "Imię",
        "Nazwisko",
        "Ulica",
        "Numer domu",
        "Dodatek do adresu",
        "Kod pocztowy",
        "Miejscowość",
        "Kraj",
        "Region",
        "Telefon",
    ]
    occurrences: dict[str, list[tuple[int, str]]] = {f: [] for f in addr_fields}
    for cn in column_names:
        base = _column_base_name(cn)
        if base not in addr_fields:
            continue
        m = re.search(r"\((\d+)\)\s*$", cn)
        idx = int(m.group(1)) if m else column_names.index(cn)
        occurrences[base].append((idx, cn))
    for f in addr_fields:
        occurrences[f].sort(key=lambda x: x[0])

    def block(which: int) -> dict[str, str]:
        out: dict[str, str] = {}
        for f in addr_fields:
            lst = occurrences.get(f) or []
            if len(lst) > which:
                col = lst[which][1]
                val = (header.get(col) or "").strip()
                if val:
                    out[f] = val
        return out

    billing = block(0)
    shipping = block(1)
    if not billing and not shipping:
        return None
    return json.dumps({"billing": billing, "shipping": shipping}, ensure_ascii=False)


def _mapcol(header: dict[str, str], column_map: dict, *keys: str) -> str:
    """Pierwsza niepusta wartość z nagłówka wg kluczy mapowania (np. payment_name → kolumna CSV)."""
    for k in keys:
        col = column_map.get(k)
        if not col:
            continue
        v = (header.get(col) or "").strip()
        if v:
            return v
    return ""


# Synonimy tej samej wartości w addresses_json — zostawiamy jeden klucz (pierwszy wg kolejności).
_ADDRESS_VALUE_EQUIV_GROUPS: tuple[tuple[str, ...], ...] = (
    ("street", "street_name", "address", "Ulica"),
    ("street2", "address_extra", "Dodatek do adresu"),
    ("postal_code", "postcode", "zip", "Kod pocztowy"),
    ("city", "town", "Miejscowość", "Miasto"),
    ("country", "Kraj"),
    ("phone", "mobile", "tel", "Telefon"),
    ("email", "mail", "Email"),
    ("first_name", "Imię"),
    ("last_name", "Nazwisko"),
    ("company_name", "Firma", "Nazwa firmy"),
    ("tax_id", "nip", "NIP", "NIP firmy"),
)


def _collapse_duplicate_address_values(block: dict) -> None:
    """Usuwa z bloku adresu powielone klucze o identycznej wartości (np. street + Ulica)."""
    if not isinstance(block, dict):
        return
    keys_to_remove: set[str] = set()
    for group in _ADDRESS_VALUE_EQUIV_GROUPS:
        by_norm: dict[str, list[str]] = {}
        for k in group:
            if k not in block:
                continue
            v = str(block[k]).strip()
            if not v:
                keys_to_remove.add(k)
                continue
            nk = v.casefold()
            by_norm.setdefault(nk, []).append(k)
        for keys_same in by_norm.values():
            if len(keys_same) < 2:
                continue
            order = {k: i for i, k in enumerate(group)}
            keeper = min(keys_same, key=lambda kk: order.get(kk, 999))
            for kk in keys_same:
                if kk != keeper:
                    keys_to_remove.add(kk)
    for k in keys_to_remove:
        block.pop(k, None)


def _resolve_shipping_fee_column(column_names: list[str], column_map: dict) -> str | None:
    """Kolumna CSV z kosztem dostawy: mapowanie lub nagłówki (PL/EN)."""
    map_keys = ("delivery_cost", "shipping_cost", "courier_price", "delivery_price")
    for mk in map_keys:
        raw = column_map.get(mk)
        if not raw:
            continue
        c = _resolve_order_column(column_names, str(raw).strip(), "")
        if c:
            return c
        for cn in column_names:
            if _column_base_name(cn).strip().lower() == str(raw).strip().lower():
                return cn
    header_aliases = (
        "Koszt dostawy",
        "Koszt dostawy brutto",
        "shipping_cost",
        "delivery_cost",
        "delivery_price",
        "courier_price",
        "Courier price",
        "Koszt wysyłki",
        "Koszt wysylki",
    )
    for dn in header_aliases:
        for cn in column_names:
            if _column_base_name(cn).strip().lower() == dn.strip().lower():
                return cn
    return None


def _merge_order_addresses_from_map(
    base_json: str | None,
    header: dict[str, str],
    column_map: dict,
) -> str | None:
    """Uzupełnia billing/shipping z mapowania pól adresowych + email (zamówienie) + telefon."""
    data: dict = {}
    if base_json and str(base_json).strip():
        try:
            loaded = json.loads(base_json)
            if isinstance(loaded, dict):
                data = loaded
        except (json.JSONDecodeError, TypeError):
            data = {}
    bill = dict(data.get("billing") or {}) if isinstance(data.get("billing"), dict) else {}
    ship = dict(data.get("shipping") or {}) if isinstance(data.get("shipping"), dict) else {}

    company = _mapcol(header, column_map, "company_name")
    if company:
        bill["company_name"] = company
    nip = _mapcol(header, column_map, "nip")
    if nip:
        bill["tax_id"] = nip
    fn = _mapcol(header, column_map, "first_name")
    ln = _mapcol(header, column_map, "last_name")
    if fn:
        bill["first_name"] = fn
    if ln:
        bill["last_name"] = ln
    phone = _mapcol(header, column_map, "phone")
    if phone:
        bill["phone"] = phone
        ship["phone"] = phone
    email = _mapcol(header, column_map, "email")
    if email:
        bill["email"] = email
        ship["email"] = email

    street = _mapcol(header, column_map, "street")
    bno = _mapcol(header, column_map, "building_number")
    extra = _mapcol(header, column_map, "address_extra")
    line1 = " ".join(x for x in [street, bno] if x).strip()
    line2 = (extra or "").strip()
    if line1:
        ship["street"] = line1
    if line2 and line2.casefold() != line1.casefold():
        ship["street2"] = line2
    pc = _mapcol(header, column_map, "postal_code")
    if pc:
        ship["postal_code"] = pc
    city = _mapcol(header, column_map, "city")
    if city:
        ship["city"] = city
    country = _mapcol(header, column_map, "country")
    if country:
        ship["country"] = country
    region = _mapcol(header, column_map, "region")
    if region:
        ship["Region"] = region

    full_name = " ".join(x for x in [fn, ln] if x).strip()
    if full_name:
        ship["name"] = full_name
    elif company:
        ship["name"] = company

    _collapse_duplicate_address_values(bill)
    _collapse_duplicate_address_values(ship)

    if bill:
        data["billing"] = bill
    if ship:
        data["shipping"] = ship
    if not data:
        return base_json
    return json.dumps(data, ensure_ascii=False)


def _finalize_addresses_json_string(raw: str | None) -> str | None:
    """Końcowa deduplikacja billing/shipping (np. Ulica + street z importu Sellasist)."""
    if not raw or not str(raw).strip():
        return raw
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return raw
    if not isinstance(data, dict):
        return raw
    for key in ("billing", "shipping", "delivery"):
        blk = data.get(key)
        if isinstance(blk, dict):
            _collapse_duplicate_address_values(blk)
    return json.dumps(data, ensure_ascii=False)


def _enrich_order_import_meta(
    import_meta: dict,
    header: dict[str, str],
    column_map: dict,
    *,
    tracking_col: str | None,
    shipping_fee_col: str | None = None,
) -> None:
    """Pola widoczne w panelu / WMS: płatność, opłacono, komentarz, tracking."""
    pm = _mapcol(header, column_map, "payment_name")
    if pm:
        import_meta["panel_payment_method"] = pm[:128]
    ps = _mapcol(header, column_map, "payment_status")
    if ps:
        import_meta["panel_payment_status"] = ps[:128]
    paid = _mapcol(header, column_map, "paid_amount")
    if paid:
        import_meta["panel_amount_paid"] = paid[:128]
    comment = _mapcol(header, column_map, "comment")
    if comment:
        import_meta["customer_comment"] = comment[:4000]
    fee = _mapcol(header, column_map, "delivery_cost", "shipping_cost", "courier_price", "delivery_price")
    if not fee and shipping_fee_col:
        fee = (header.get(shipping_fee_col) or "").strip()
    if fee:
        try:
            import_meta["shipping_cost"] = float(str(fee).replace(",", "."))
        except ValueError:
            import_meta["shipping_cost_display"] = fee[:64]
    if tracking_col:
        raw = (header.get(tracking_col) or "").strip()
        if raw:
            import_meta["panel_tracking_numbers"] = raw[:512]
            tr = _split_tracking_values(raw)
            if tr:
                import_meta["tracking_numbers_parsed"] = tr


def _order_import_mapped_attr_csv_bases() -> set[str]:
    """Bases with explicit first-class ORM mapping or structured addresses_json (for import log / hints)."""
    addr = {
        "Nazwa firmy",
        "NIP firmy",
        "Imię",
        "Nazwisko",
        "Ulica",
        "Numer domu",
        "Dodatek do adresu",
        "Kod pocztowy",
        "Miejscowość",
        "Kraj",
        "Region",
        "Telefon",
    }
    return {
        "Data dodania",
        "Data zamówienia",
        "Kwota do zapłaty",
        "Waluta",
        "Źródło",
        "Nazwa dostawy",
        "Paczkomat",
        "Punkt odbioru osobistego",
        "Numery listów przewozowych",
        "Zewnętrzny identyfikator",
        "Identyfikator (ID)",
        "Numer dokumentu sprzedaży",
    }.union(_ITEM_COLUMN_BASES).union(addr)


def _log_mappings_and_unmapped(column_names: list, used_mappings: list[tuple[str, str]]) -> None:
    """
    Log each mapped column once: "Mapped CSV column 'X' -> field_name".
    Then warn for any CSV column that was not mapped.
    used_mappings: list of (csv_column_name, model_field_name).
    """
    used_cols = set()
    for csv_col, field_name in used_mappings:
        if csv_col:
            used_cols.add(csv_col)
            logger.debug("Mapped CSV column %r -> %s", csv_col, field_name)
    base_names = {_strip_quotes(cn.split(" (")[0].strip()) for cn in column_names}
    used_bases = {_strip_quotes(c.split(" (")[0].strip()) for c in used_cols if c}
    for base in sorted(base_names):
        if base and base not in used_bases:
            logger.warning("Unmapped CSV column: %s", base)


class ImportService:

    def __init__(self, db: Session):
        self.db = db

    # ==========================================================
    # IMPORT PRODUKTÓW
    # ==========================================================

    def import_products(self, file, column_map: dict, tenant_id: int, warehouse_id: int = 1):
        decoded = file.file.read().decode("utf-8")
        rows_list = _parse_csv_bytes_to_rows(decoded)
        if not rows_list:
            return {"created_products": 0, "updated_products": 0}

        headers = [_strip_quotes(str(h).lstrip("\ufeff").strip()) for h in rows_list[0]]
        counts = Counter(headers)
        column_names = [f"{h} ({i})" if counts[h] > 1 else h for i, h in enumerate(headers)]

        def _get(row: list, key: str, *, index_key: str | None = None) -> str | None:
            idx = None
            if index_key and column_map.get(index_key) is not None:
                try:
                    idx = int(column_map[index_key])
                except (TypeError, ValueError):
                    pass
            if idx is None:
                idx = _column_value_to_index(headers, column_map.get(key))
            if idx is None or idx >= len(row):
                return None
            v = row[idx]
            return _strip_quotes(v) if v else None

        def safe_float(value):
            try:
                if value is None:
                    return None
                value = str(value).strip().replace(",", ".")
                if value == "":
                    return None
                return float(value)
            except Exception:
                return None

        name_col = column_map.get("title") or column_map.get("name") or column_map.get("identifier")
        name_idx = _column_value_to_index(headers, name_col)
        if name_idx is None:
            name_idx = _resolve_column_index(
                headers, column_names, column_map, "name", PRODUCT_FIELD_ALIASES.get("name", [])
            )
        ean_idx = _resolve_column_index(headers, column_names, column_map, "ean", PRODUCT_FIELD_ALIASES.get("ean", []))
        symbol_idx = _resolve_column_index(headers, column_names, column_map, "symbol", PRODUCT_FIELD_ALIASES.get("symbol", []))
        weight_idx = _column_value_to_index(headers, column_map.get("weight"))
        if weight_idx is None:
            weight_idx = _resolve_column_index(
                headers, column_names, column_map, "weight", PRODUCT_FIELD_ALIASES.get("weight", [])
            )
        purchase_price_idx = _resolve_column_index(
            headers, column_names, column_map, "purchase_price", PRODUCT_FIELD_ALIASES.get("purchase_price", [])
        )
        images_idx = _resolve_column_index(
            headers, column_names, column_map, "image_url", PRODUCT_FIELD_ALIASES.get("image_url", [])
        )
        if images_idx is None:
            images_idx = _resolve_column_index(
                headers, column_names, column_map, "images", PRODUCT_FIELD_ALIASES.get("images", [])
            )
        sale_price_idx = _resolve_column_index(
            headers, column_names, column_map, "sale_price", PRODUCT_FIELD_ALIASES.get("sale_price", [])
        )
        manufacturer_idx = _resolve_column_index(
            headers, column_names, column_map, "manufacturer", PRODUCT_FIELD_ALIASES.get("manufacturer", [])
        )
        unit_idx = _resolve_column_index(headers, column_names, column_map, "unit", PRODUCT_FIELD_ALIASES.get("unit", []))
        sku_idx = _resolve_column_index(headers, column_names, column_map, "sku", PRODUCT_FIELD_ALIASES.get("sku", []))
        stock_quantity_idx = _resolve_column_index(
            headers, column_names, column_map, "stock_quantity", PRODUCT_FIELD_ALIASES.get("stock_quantity", [])
        )
        if stock_quantity_idx is None:
            stock_quantity_idx = _resolve_column_index(
                headers, column_names, column_map, "stock", PRODUCT_FIELD_ALIASES.get("stock_quantity", [])
            )
        location_idx = _resolve_column_index(
            headers, column_names, column_map, "location", PRODUCT_FIELD_ALIASES.get("location", [])
        )
        catalog_number_idx = _resolve_column_index(
            headers, column_names, column_map, "catalog_number", PRODUCT_FIELD_ALIASES.get("catalog_number", [])
        )
        extra_ean_idx = _resolve_column_index(
            headers, column_names, column_map, "extra_ean", PRODUCT_FIELD_ALIASES.get("extra_ean", [])
        )

        canonical_indices: set[int] = set()
        for idx in (
            name_idx,
            ean_idx,
            symbol_idx,
            sku_idx,
            weight_idx,
            purchase_price_idx,
            images_idx,
            sale_price_idx,
            manufacturer_idx,
            unit_idx,
            stock_quantity_idx,
            location_idx,
            catalog_number_idx,
            extra_ean_idx,
        ):
            if idx is not None:
                canonical_indices.add(idx)
        for key in ("length", "width", "height", "volume"):
            idx = _column_value_to_index(headers, column_map.get(key))
            if idx is not None:
                canonical_indices.add(idx)

        product_used_mappings: list[tuple[str, str]] = []
        for idx, field in [
            (name_idx, "name"),
            (ean_idx, "ean"),
            (symbol_idx, "symbol"),
            (weight_idx, "weight"),
            (purchase_price_idx, "purchase_price"),
            (images_idx, "image_url"),
            (sale_price_idx, "sale_price"),
            (manufacturer_idx, "manufacturer"),
            (unit_idx, "unit"),
            (sku_idx, "sku"),
            (catalog_number_idx, "catalog_number"),
            (extra_ean_idx, "extra_ean"),
            (location_idx, "location"),
            (stock_quantity_idx, "stock_quantity"),
        ]:
            if idx is not None and idx < len(column_names):
                product_used_mappings.append((column_names[idx], field))
        for key in ("length", "width", "height", "volume"):
            idx = _column_value_to_index(headers, column_map.get(key))
            if idx is not None and idx < len(column_names):
                product_used_mappings.append((column_names[idx], key))
        _log_mappings_and_unmapped(column_names, product_used_mappings)

        created = 0
        updated = 0
        skipped = 0
        warning_count = 0
        error_count = 0
        total_rows = len(rows_list) - 1
        ignored_csv_stock_rows = 0
        for row in rows_list[1:]:
            if len(row) < len(headers):
                row = row + [""] * (len(headers) - len(row))

            length = safe_float(_get(row, "length", index_key="length_index"))
            width = safe_float(_get(row, "width", index_key="width_index"))
            height = safe_float(_get(row, "height", index_key="height_index"))
            volume = safe_float(_get(row, "volume"))

            if volume is not None and volume > 0:
                pass
            else:
                l_cm = length if (length is not None and length > 0) else FALLBACK_DIMENSION_CM
                w_cm = width if (width is not None and width > 0) else FALLBACK_DIMENSION_CM
                h_cm = height if (height is not None and height > 0) else FALLBACK_DIMENSION_CM
                volume = (l_cm * w_cm * h_cm) / 1000.0

            name = (row[name_idx] if name_idx is not None and name_idx < len(row) else None) or None
            name = _strip_quotes(name) or None

            ean_raw = row[ean_idx] if ean_idx is not None and ean_idx < len(row) else None
            ean_val = _strip_quotes(ean_raw) or None
            normalized_ean = _normalize_ean(ean_val) if ean_val else None
            ean_for_db = normalized_ean or ean_val

            purchase_price_val = (
                _parse_price(row[purchase_price_idx])
                if purchase_price_idx is not None and purchase_price_idx < len(row)
                else None
            )
            sale_price_val = (
                _parse_price(row[sale_price_idx]) if sale_price_idx is not None and sale_price_idx < len(row) else None
            )
            if sale_price_val is None and sale_price_idx is not None and sale_price_idx < len(row):
                sale_price_val = safe_float(row[sale_price_idx])
            manufacturer_val = (
                _strip_quotes(row[manufacturer_idx]) or None
                if manufacturer_idx is not None and manufacturer_idx < len(row)
                else None
            )
            unit_val = _strip_quotes(row[unit_idx]) or None if unit_idx is not None and unit_idx < len(row) else None
            sku_val = _strip_quotes(row[sku_idx]) or None if sku_idx is not None and sku_idx < len(row) else None
            symbol_val = row[symbol_idx] if symbol_idx is not None and symbol_idx < len(row) else None
            symbol_val = _strip_quotes(symbol_val) or None
            if symbol_val is None and sku_val is not None:
                symbol_val = sku_val
            sku_or_symbol = sku_val or symbol_val
            catalog_number_val = (
                _strip_quotes(row[catalog_number_idx]) or None
                if catalog_number_idx is not None and catalog_number_idx < len(row)
                else None
            )
            location_val = (
                _strip_quotes(row[location_idx]) or None
                if location_idx is not None and location_idx < len(row)
                else None
            )

            image_first: str | None = None
            if images_idx is not None and images_idx < len(row):
                image_first, _img_extras = _split_image_urls_for_import(row[images_idx])
            elif images_idx is None:
                pass

            row_meta: dict = {}
            if extra_ean_idx is not None and extra_ean_idx < len(row):
                parts = _split_tracking_values(str(row[extra_ean_idx] or ""))
                extras = []
                for p in parts:
                    n = _normalize_ean(p) or p.strip()
                    if n:
                        extras.append(n)
                if extras:
                    row_meta["dodatkowe_kody_ean"] = extras
            if images_idx is not None and images_idx < len(row):
                _f, zdj_extras = _split_image_urls_for_import(row[images_idx])
                if zdj_extras:
                    row_meta["Zdjęcia_dodatkowe_url"] = zdj_extras

            for i, cn in enumerate(column_names):
                if i in canonical_indices:
                    continue
                cell = row[i] if i < len(row) else ""
                val = _strip_quotes(cell)
                if not val:
                    continue
                row_meta[cn] = val

            if not normalized_ean and not sku_or_symbol:
                warning_count += 1
            if purchase_price_val is None and sale_price_val is None:
                warning_count += 1

            existing = _find_existing_product_for_import(
                self.db,
                tenant_id,
                normalized_ean=normalized_ean,
                ean_raw_display=ean_val,
                sku_or_symbol=sku_or_symbol,
                catalog_number=catalog_number_val,
                name=name,
            )

            merged_meta_str = _product_metadata_merge(
                existing.metadata_json if existing else None,
                row_meta,
            )

            if existing:
                logger.info("Updating product EAN=%s", normalized_ean or sku_or_symbol or existing.ean or "")
                if name is not None:
                    existing.name = name
                if symbol_val is not None:
                    existing.symbol = symbol_val
                if (sku_val or symbol_val) is not None:
                    existing.sku = sku_val or symbol_val
                if length is not None:
                    existing.length = length
                if width is not None:
                    existing.width = width
                if height is not None:
                    existing.height = height
                weight_val = safe_float(row[weight_idx] if weight_idx is not None and weight_idx < len(row) else None)
                if weight_val is not None:
                    existing.weight = weight_val
                if volume is not None:
                    existing.volume = volume
                if purchase_price_val is not None:
                    existing.purchase_price = purchase_price_val
                if sale_price_val is not None:
                    existing.sale_price = sale_price_val
                if manufacturer_val is not None:
                    existing.manufacturer = manufacturer_val
                if unit_val is not None:
                    existing.unit = unit_val
                if catalog_number_val is not None:
                    existing.catalog_number = catalog_number_val
                if location_val is not None:
                    existing.location = location_val
                if image_first is not None:
                    existing.image_url = image_first
                elif images_idx is not None and images_idx < len(row) and row[images_idx]:
                    img = _strip_quotes(row[images_idx]) or None
                    if img is not None:
                        existing.image_url = img
                if ean_for_db is not None:
                    existing.ean = ean_for_db
                if merged_meta_str is not None:
                    existing.metadata_json = merged_meta_str
                product = existing
                self.db.flush()
                updated += 1
            else:
                final_image = image_first
                if final_image is None and images_idx is not None and images_idx < len(row):
                    final_image = _strip_quotes(row[images_idx]) or None
                product = Product(
                    tenant_id=tenant_id,
                    name=name,
                    ean=ean_for_db,
                    symbol=symbol_val,
                    sku=sku_val or symbol_val,
                    length=length,
                    width=width,
                    height=height,
                    weight=safe_float(row[weight_idx] if weight_idx is not None and weight_idx < len(row) else None),
                    volume=volume,
                    purchase_price=purchase_price_val,
                    sale_price=sale_price_val,
                    manufacturer=manufacturer_val,
                    unit=unit_val,
                    location=location_val,
                    catalog_number=catalog_number_val,
                    metadata_json=merged_meta_str,
                    image_url=final_image,
                )
                self.db.add(product)
                self.db.flush()
                from ..services.barcode_generation import next_product_barcode

                product.barcode = next_product_barcode(self.db, tenant_id)
                created += 1

            if stock_quantity_idx is not None and stock_quantity_idx < len(row):
                raw_sq = row[stock_quantity_idx]
                if raw_sq is not None and str(raw_sq).strip() != "":
                    stock_qty = safe_float(raw_sq)
                    if stock_qty is not None and stock_qty != 0:
                        ignored_csv_stock_rows += 1

        # Legacy rows at location name "Import" may still be moved to assigned plan locations when sync is on.
        move_ran = not pr_flags.disable_assigned_locations_inventory_sync
        if move_ran:
            _move_inventory_from_import_to_assigned(self.db, warehouse_id, tenant_id)
        else:
            logger.info(
                "_move_inventory_from_import_to_assigned skipped (DISABLE_ASSIGNED_LOCATIONS_INVENTORY_SYNC)",
                extra={
                    "warehouse_id": warehouse_id,
                    "tenant_id": tenant_id,
                },
            )

        self.db.commit()

        _log_import_stock_visibility(
            tenant_id,
            warehouse_id,
            [],
            import_move_from_import_to_assigned_ran=move_ran,
            ignored_csv_stock_rows=ignored_csv_stock_rows,
        )

        log = ImportLog(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            type="products",
            total_rows=total_rows,
            created=created,
            updated=updated,
            skipped=skipped,
            warnings=warning_count,
            errors=error_count,
            message="Product import completed",
        )
        self.db.add(log)
        self.db.commit()

        logger.info(
            "import_products: rows_read=%s, created_products=%s, updated_products=%s, warnings=%s, committed=1",
            total_rows,
            created,
            updated,
            warning_count,
        )
        return {"created_products": created, "updated_products": updated, "total_rows": total_rows, "warnings": warning_count, "errors": error_count}
    

    # ==========================================================
    # IMPORT ZAMÓWIEŃ
    # ==========================================================

    def import_orders(self, file, column_map: dict, tenant_id: int, warehouse_id: int):
        decoded = file.file.read().decode("utf-8")
        try:
            dialect = csv.Sniffer().sniff(decoded[:1000])
        except Exception:
            dialect = csv.excel
            dialect.delimiter = ";"
        lines = decoded.splitlines()
        reader = csv.reader(lines, dialect=dialect)
        rows_list = list(reader)
        if not rows_list:
            return {
                "created_orders": 0,
                "updated_orders": 0,
                "orders_total": 0,
                "items_added": 0,
                "lines_imported": 0,
                "total_rows": 0,
                "skipped_rows": 0,
                "unmapped_columns": [],
                "skipped": 0,
                "warnings": 0,
                "errors": 0,
            }

        headers = [_strip_quotes(str(h).lstrip("\ufeff").strip()) for h in rows_list[0]]
        counts = Counter(headers)
        column_names = [f"{h} ({i})" if counts[h] > 1 else h for i, h in enumerate(headers)]

        def row_to_dict(row: list) -> dict:
            return {
                column_names[i]: _strip_quotes(row[i] if i < len(row) else "")
                for i in range(len(column_names))
            }

        def safe_float(value, default=None):
            try:
                if value is None:
                    return default
                value = str(value).strip().replace(",", ".")
                if value == "":
                    return default
                return float(value)
            except Exception:
                return default

        external_id_col = _resolve_order_column(
            column_names, column_map.get("external_id"), "Zewnętrzny identyfikator"
        )
        legacy_order_col = _resolve_order_column(
            column_names,
            column_map.get("order_id") or column_map.get("order_number"),
            "Identyfikator (ID)",
        )
        key_col = external_id_col or legacy_order_col

        ean_col = _resolve_order_column(
            column_names, column_map.get("ean") or column_map.get("product_ean"), "Kod EAN"
        ) or _resolve_order_column(column_names, None, "EAN")
        quantity_col = _resolve_order_column(column_names, column_map.get("quantity"), "Ilość")
        city_col = _resolve_order_column(column_names, column_map.get("city"), None)
        country_col = _resolve_order_column(column_names, column_map.get("country"), None)
        order_date_col = _resolve_order_date_column(column_names, column_map)
        order_value_col = (
            _resolve_order_column(column_names, column_map.get("order_value") or column_map.get("value"), "Kwota do zapłaty")
            or _resolve_order_column(column_names, None, "Wartość zamówienia")
            or _resolve_order_column(column_names, None, "Wartość")
        )
        unit_price_col = _resolve_order_column(column_names, column_map.get("unit_price"), "Cena") or _resolve_order_column(
            column_names, None, "Cena jednostkowa"
        )
        product_name_col = _resolve_order_column(column_names, column_map.get("product_name"), "Nazwa produktu")
        purchase_price_col = _resolve_order_column(column_names, column_map.get("purchase_price"), "Cena zakupu")
        unit_col = _resolve_order_column(column_names, column_map.get("unit"), "Jednostka")
        list_price_col = _resolve_order_column(column_names, column_map.get("list_price"), "Cena bez obniżek")
        vat_col = _resolve_order_column(column_names, column_map.get("vat") or column_map.get("vat_percent"), "VAT")
        sku_internal_col = _resolve_order_column(column_names, column_map.get("sku_internal"), "Wew. numer (sygnatura/SKU)")
        symbol_col = _resolve_order_column(column_names, column_map.get("symbol") or column_map.get("product_symbol"), "Symbol")
        catalog_col = _resolve_order_column(column_names, column_map.get("catalog_number"), "Numer katalogowy")
        currency_col = _resolve_order_column(column_names, column_map.get("currency"), "Waluta")
        source_col = _resolve_order_column(column_names, column_map.get("source"), "Źródło")
        shipping_name_col = _resolve_order_column(
            column_names,
            column_map.get("delivery_name") or column_map.get("shipping_name"),
            "Nazwa dostawy",
        )
        paczkomat_col = _resolve_order_column(column_names, column_map.get("paczkomat"), "Paczkomat")
        pickup_col = _resolve_order_column(column_names, column_map.get("pickup_point"), "Punkt odbioru osobistego")
        tracking_col = _resolve_order_column(column_names, column_map.get("tracking_numbers"), "Numery listów przewozowych")
        shipping_fee_col = _resolve_shipping_fee_column(column_names, column_map)
        sales_doc_col = _resolve_order_column(
            column_names,
            column_map.get("sales_document_number") or column_map.get("sales_doc_number"),
            "Numer dokumentu sprzedaży",
        )

        def cols_for_base(base: str) -> list[str]:
            return [cn for cn in column_names if _column_base_name(cn) == base]

        def nth_col(base: str, n: int) -> str | None:
            lst = cols_for_base(base)
            return lst[n] if len(lst) > n else None

        ship_city_col = city_col or nth_col("Miejscowość", 1) or nth_col("Miejscowość", 0)
        ship_country_col = country_col or nth_col("Kraj", 1) or nth_col("Kraj", 0)

        mapped_pairs: list[tuple[str | None, str]] = [
            (external_id_col, "external_id"),
            (legacy_order_col, "legacy_order_id"),
            (ean_col, "lines.ean"),
            (quantity_col, "lines.quantity"),
            (city_col, "order.city"),
            (country_col, "order.country"),
            (ship_city_col, "order.shipping_city"),
            (ship_country_col, "order.shipping_country"),
            (order_date_col, "order.order_date"),
            (order_value_col, "order.value"),
            (unit_price_col, "lines.unit_price"),
            (product_name_col, "lines.product_name"),
            (purchase_price_col, "lines.purchase_price"),
            (unit_col, "lines.unit"),
            (list_price_col, "lines.list_price"),
            (vat_col, "lines.vat_percent"),
            (sku_internal_col, "lines.sku_internal"),
            (symbol_col, "lines.symbol"),
            (catalog_col, "lines.catalog_number"),
            (currency_col, "order.currency"),
            (source_col, "order.source"),
            (shipping_name_col, "order.shipping_method_part"),
            (paczkomat_col, "order.paczkomat"),
            (pickup_col, "order.pickup_point"),
            (tracking_col, "order.tracking"),
            (sales_doc_col, "order.sales_document_number"),
        ]
        order_used_mappings = [(c, f) for c, f in mapped_pairs if c]
        _log_mappings_and_unmapped(column_names, order_used_mappings)

        mapped_bases = _order_import_mapped_attr_csv_bases()
        unmapped_bases = sorted(
            {
                _column_base_name(cn)
                for cn in column_names
                if _column_base_name(cn) and _column_base_name(cn) not in mapped_bases
            }
        )

        order_forward: dict[str, str] = {}
        current_ext: str | None = None
        orders_data: dict[str, dict] = {}
        skipped_rows = 0
        raw_lines_by_order: dict[str, list[dict]] = defaultdict(list)
        line_seq = 0

        for row in rows_list[1:]:
            if len(row) < len(column_names):
                row = list(row) + [""] * (len(column_names) - len(row))
            rd = row_to_dict(row)

            raw_ext = (rd.get(external_id_col) or "").strip() if external_id_col else ""
            raw_legacy = (rd.get(legacy_order_col) or "").strip() if legacy_order_col else ""

            if external_id_col and raw_ext and raw_ext != current_ext:
                current_ext = raw_ext
                order_forward = {}
            elif not external_id_col and legacy_order_col and raw_legacy and raw_legacy != current_ext:
                current_ext = raw_legacy
                order_forward = {}

            for cn in column_names:
                if _is_item_column(cn):
                    continue
                v = (rd.get(cn) or "").strip()
                if v:
                    order_forward[cn] = v

            ext = ""
            if key_col:
                ext = (order_forward.get(key_col) or "").strip() or (rd.get(key_col) or "").strip()
            if not ext:
                ext = raw_ext or raw_legacy
            if not ext:
                skipped_rows += 1
                continue

            header_live = dict(order_forward)
            if ext not in orders_data:
                orders_data[ext] = {"header": header_live, "lines": []}
            else:
                orders_data[ext]["header"] = header_live

            qty_raw = rd.get(quantity_col) if quantity_col else ""
            qty = safe_float(qty_raw, None)
            ean_raw = (rd.get(ean_col) or "").strip() if ean_col else ""
            name_raw = (rd.get(product_name_col) or "").strip() if product_name_col else ""
            sku_i = (rd.get(sku_internal_col) or "").strip() if sku_internal_col else ""
            sym = (rd.get(symbol_col) or "").strip() if symbol_col else ""
            catn = (rd.get(catalog_col) or "").strip() if catalog_col else ""

            is_line = qty is not None and qty > 0 and (
                bool(ean_raw)
                or bool(sku_i)
                or bool(sym)
                or bool(catn)
                or bool(name_raw)
            )
            if not is_line:
                continue

            line_seq += 1
            ovv = safe_float(rd.get(unit_price_col), None) if unit_price_col else None
            lpv = safe_float(rd.get(list_price_col), None) if list_price_col else None
            vv = safe_float(rd.get(vat_col), None) if vat_col else None
            pur = safe_float(rd.get(purchase_price_col), None) if purchase_price_col else None
            unt = (rd.get(unit_col) or "").strip() if unit_col else None

            line_meta: dict[str, str] = {}
            for cn in column_names:
                if not _is_item_column(cn):
                    continue
                base = _column_base_name(cn)
                if base in (
                    "Nazwa produktu",
                    "Cena",
                    "Cena bez obniżek",
                    "VAT",
                    "Ilość",
                    "Jednostka",
                    "EAN",
                    "Numer katalogowy",
                    "Symbol",
                    "Cena zakupu",
                    "Wew. numer (sygnatura/SKU)",
                ):
                    continue
                val = (rd.get(cn) or "").strip()
                if val:
                    line_meta[cn] = val

            raw_lines_by_order[ext].append({
                "qty": float(qty),
                "ean_raw": ean_raw or None,
                "sku_internal": sku_i or None,
                "symbol": sym or None,
                "catalog_no": catn or None,
                "product_name": name_raw or None,
                "unit_price": ovv,
                "list_price": lpv,
                "vat_percent": vv,
                "purchase_price": pur,
                "unit": unt,
                "metadata_json": line_meta,
                "_seq": line_seq,
            })

        def aggregate_key(ln: dict) -> str:
            if ln.get("ean_raw") and _is_probable_ean_string(ln["ean_raw"]):
                return f"ean:{_normalize_ean(ln['ean_raw'])}"
            for label, k in (
                ("sku", ln.get("sku_internal")),
                ("sym", ln.get("symbol")),
                ("cat", ln.get("catalog_no")),
                ("name", (ln.get("product_name") or "").strip().lower() if ln.get("product_name") else ""),
            ):
                if k:
                    return f"{label}:{str(k).strip()}"
            return f"seq:{ln.get('_seq')}"

        aggregated: dict[str, dict[str, dict]] = {e: {} for e in orders_data}
        for ext, orec in orders_data.items():
            for ln in raw_lines_by_order.get(ext, []):
                k = aggregate_key(ln)
                if k not in aggregated[ext]:
                    aggregated[ext][k] = {
                        "qty": 0.0,
                        "ean_raw": ln["ean_raw"],
                        "sku_internal": ln["sku_internal"],
                        "symbol": ln["symbol"],
                        "catalog_no": ln["catalog_no"],
                        "product_name": ln["product_name"],
                        "unit_price": ln["unit_price"],
                        "list_price": ln["list_price"],
                        "vat_percent": ln["vat_percent"],
                        "purchase_price": ln["purchase_price"],
                        "unit": ln["unit"],
                        "metadata_json": dict(ln["metadata_json"]),
                    }
                else:
                    agg = aggregated[ext][k]
                    agg["qty"] += ln["qty"]
                    agg["metadata_json"].update(ln["metadata_json"])

        placeholder = (
            self.db.query(Product).filter(Product.tenant_id == tenant_id, Product.name == "Unknown Product").first()
        )
        if not placeholder:
            placeholder = Product(tenant_id=tenant_id, name="Unknown Product", volume=1.0)
            self.db.add(placeholder)
            self.db.flush()
            from ..services.barcode_generation import next_product_barcode

            placeholder.barcode = next_product_barcode(self.db, tenant_id)

        created_orders: list[Order] = []
        updated_orders_count = 0
        order_skipped_count = 0
        order_warning_count = 0
        items_added = 0
        FINAL_STATUSES = ("SHIPPED", "COMPLETED")

        for ext, orec in orders_data.items():
            header = orec["header"]
            lines_map = aggregated.get(ext) or {}

            date_value = (
                (header.get(order_date_col) if order_date_col else None)
                or header.get("Data zamówienia")
                or header.get("Data dodania")
            )
            date_value = str(date_value).strip() if date_value else ""
            parsed_date = _parse_order_date(date_value) if date_value else None
            order_date = parsed_date if parsed_date is not None else datetime.utcnow()
            if date_value and parsed_date is None:
                order_warning_count += 1

            order_value = safe_float(header.get(order_value_col), None) if order_value_col else None

            import_meta: dict[str, str | list] = {}
            for cn in column_names:
                if _is_item_column(cn):
                    continue
                val = (header.get(cn) or "").strip()
                if val:
                    import_meta[cn] = val

            addresses_json_str = _build_addresses_json(column_names, header)
            addresses_json_str = _merge_order_addresses_from_map(addresses_json_str, header, column_map)
            addresses_json_str = _finalize_addresses_json_string(addresses_json_str)
            _enrich_order_import_meta(
                import_meta,
                header,
                column_map,
                tracking_col=tracking_col,
                shipping_fee_col=shipping_fee_col,
            )

            ship_method_parts: list[str] = []
            for col in (shipping_name_col, paczkomat_col, pickup_col):
                if col:
                    part = (header.get(col) or "").strip()
                    if part:
                        ship_method_parts.append(part)
            shipping_method_val = " · ".join(ship_method_parts) if ship_method_parts else None
            # FK resolution: carrier column only — never concatenate pickup / paczkomat into the
            # match string (those are points / machines, not reusable ShippingMethod rows).
            ship_label_for_fk = (header.get(shipping_name_col) or "").strip() if shipping_name_col else None
            ship_fk_id, ship_canon = get_or_create_shipping_method_for_label(
                self.db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                label=ship_label_for_fk,
            )

            sales_document_number = None
            if sales_doc_col:
                sd = (header.get(sales_doc_col) or "").strip()
                sales_document_number = sd or None

            city_val = (header.get(ship_city_col) or "").strip() if ship_city_col else None
            country_val = (header.get(ship_country_col) or "").strip() if ship_country_col else None
            if not city_val and city_col:
                city_val = (header.get(city_col) or "").strip() or None
            if not country_val and country_col:
                country_val = (header.get(country_col) or "").strip() or None
            mc = _mapcol(header, column_map, "city")
            if mc:
                city_val = mc
            mco = _mapcol(header, column_map, "country")
            if mco:
                country_val = mco

            currency_val = (header.get(currency_col) or "").strip() if currency_col else None
            source_val = (header.get(source_col) or "").strip() if source_col else None

            existing_order = (
                self.db.query(Order)
                .filter(
                    Order.tenant_id == tenant_id,
                    Order.warehouse_id == warehouse_id,
                    Order.external_id == ext,
                )
                .first()
            )

            if existing_order and existing_order.status in FINAL_STATUSES:
                order_skipped_count += 1
                continue

            import_meta_json = json.dumps(import_meta, ensure_ascii=False) if import_meta else None
            from ..services.esp_scan_codes import assign_order_scan_code

            if existing_order:
                logger.info("Updating order external_id=%s", ext)
                existing_order.external_id = ext
                if sales_doc_col:
                    existing_order.sales_document_number = sales_document_number
                existing_order.order_date = order_date
                if order_value is not None:
                    existing_order.value = order_value
                existing_order.currency = currency_val
                existing_order.source = source_val
                existing_order.shipping_method_id = ship_fk_id
                existing_order.shipping_method = ship_canon if ship_fk_id else (shipping_method_val or None)
                existing_order.city = city_val
                existing_order.country = country_val
                existing_order.import_metadata_json = import_meta_json
                existing_order.addresses_json = addresses_json_str
                from ..services.order_fulfillment_lifecycle_service import (
                    maybe_advance_shipped_from_status,
                    maybe_apply_import_warehouse_fields,
                )

                maybe_apply_import_warehouse_fields(existing_order, import_warehouse_id=warehouse_id)
                maybe_advance_shipped_from_status(existing_order)
                self.db.query(OrderItem).filter(OrderItem.order_id == existing_order.id).delete()
                self.db.flush()
                order = existing_order
                if not (getattr(existing_order, "scan_code", None) or "").strip():
                    assign_order_scan_code(existing_order)
                updated_orders_count += 1
            else:
                from ..services.barcode_generation import next_internal_order_number, next_order_barcode

                order = None
                created_new = False
                for _attempt in range(5):
                    internal_no = next_internal_order_number(self.db, tenant_id, warehouse_id)
                    candidate = Order(
                        tenant_id=tenant_id,
                        warehouse_id=warehouse_id,
                        number=internal_no,
                        external_id=ext,
                        sales_document_number=sales_document_number,
                        city=city_val,
                        country=country_val,
                        status="NEW",
                        order_date=order_date,
                        created_at=datetime.utcnow(),
                        value=order_value,
                        currency=currency_val,
                        source=source_val,
                        shipping_method_id=ship_fk_id,
                        shipping_method=ship_canon if ship_fk_id else (shipping_method_val or None),
                        import_metadata_json=import_meta_json,
                        addresses_json=addresses_json_str,
                    )
                    self.db.add(candidate)
                    try:
                        self.db.flush()
                        order = candidate
                        assign_default_new_panel_status_to_order(self.db, order)
                        created_new = True
                        break
                    except IntegrityError:
                        self.db.rollback()
                        order = (
                            self.db.query(Order)
                            .filter(
                                Order.tenant_id == tenant_id,
                                Order.warehouse_id == warehouse_id,
                                Order.external_id == ext,
                            )
                            .first()
                        )
                        if order:
                            break
                if order is None:
                    raise RuntimeError("Unable to allocate unique internal order number")

                if created_new:
                    order.barcode = next_order_barcode(self.db, tenant_id)
                    assign_order_scan_code(order)
                    from ..services.order_fulfillment_lifecycle_service import apply_initial_fulfillment_assignment

                    apply_initial_fulfillment_assignment(self.db, order)
                    created_orders.append(order)
                else:
                    order_warning_count += 1
                if order is not None and not (getattr(order, "scan_code", None) or "").strip():
                    assign_order_scan_code(order)

            if not lines_map:
                continue

            for _lk, agg in lines_map.items():
                qty_int = max(1, int(round(agg["qty"])))
                unit_price = agg.get("unit_price")
                if unit_price is not None:
                    unit_price = float(unit_price)

                meta_line = agg.get("metadata_json") or {}
                if agg.get("purchase_price") is not None:
                    meta_line = {**meta_line, "_import_purchase_price": str(agg["purchase_price"])}

                bundle_row = _find_bundle_for_order_line(
                    self.db,
                    tenant_id,
                    ean_raw=agg.get("ean_raw"),
                    sku_internal=agg.get("sku_internal"),
                    symbol=agg.get("symbol"),
                    catalog_no=agg.get("catalog_no"),
                    product_name=agg.get("product_name"),
                )
                merged_bundle = None
                if bundle_row is not None:
                    try:
                        raw_bl = explode_bundle_line(
                            self.db,
                            tenant_id=tenant_id,
                            bundle_id=int(bundle_row.id),
                            bundle_order_qty=qty_int,
                            line_unit_price_override=unit_price,
                        )
                        merged_bundle = merge_resolved_lines(raw_bl)
                    except BundleExplosionError as exc:
                        logger.warning(
                            "import_orders: bundle explosion failed bundle_id=%s order_ext=%s: %s",
                            bundle_row.id,
                            ext,
                            exc,
                        )
                        merged_bundle = None

                if merged_bundle:
                    vat_override = agg.get("vat_percent")
                    inst_to_parent_item_id: dict[str, int] = {}
                    unit_str = agg.get("unit")
                    import_extra = dict(meta_line) if meta_line else {}
                    for r in merged_bundle:
                        vat_final = (
                            float(vat_override) if vat_override is not None else r.vat_percent
                        )
                        meta_use = r.metadata_json
                        if r.is_bundle_parent and import_extra:
                            meta_use = _merge_json_meta(meta_use, import_extra)
                        if r.is_bundle_parent:
                            oi = OrderItem(
                                order_id=order.id,
                                product_id=r.product_id,
                                quantity=r.quantity,
                                unit_price=r.unit_price,
                                total_price=r.total_price,
                                list_price=r.list_price,
                                total_volume=round(r.line_volume, 4) if r.line_volume else None,
                                unit=unit_str,
                                vat_percent=vat_final,
                                metadata_json=meta_use,
                                source_bundle_id=r.source_bundle_id,
                                bundle_instance_id=r.bundle_instance_id,
                                is_bundle_parent=True,
                                parent_bundle_order_item_id=None,
                                required_stock_disposition=DEFAULT_STOCK_DISPOSITION,
                            )
                            self.db.add(oi)
                            self.db.flush()
                            if r.bundle_instance_id:
                                inst_to_parent_item_id[str(r.bundle_instance_id)] = int(oi.id)
                        else:
                            pb_id = (
                                inst_to_parent_item_id.get(str(r.bundle_instance_id))
                                if r.bundle_instance_id
                                else None
                            )
                            oi = OrderItem(
                                order_id=order.id,
                                product_id=r.product_id,
                                quantity=r.quantity,
                                unit_price=r.unit_price,
                                total_price=r.total_price,
                                list_price=r.list_price,
                                total_volume=round(r.line_volume, 4) if r.line_volume else None,
                                unit=unit_str,
                                vat_percent=vat_final,
                                metadata_json=meta_use,
                                source_bundle_id=r.source_bundle_id,
                                bundle_instance_id=r.bundle_instance_id,
                                is_bundle_parent=False,
                                parent_bundle_order_item_id=pb_id,
                                required_stock_disposition=DEFAULT_STOCK_DISPOSITION,
                            )
                            self.db.add(oi)
                    items_added += len(merged_bundle)
                    continue

                product = _find_product_for_order_line(
                    self.db,
                    tenant_id,
                    ean_raw=agg.get("ean_raw"),
                    sku_internal=agg.get("sku_internal"),
                    symbol=agg.get("symbol"),
                    catalog_no=agg.get("catalog_no"),
                    product_name=agg.get("product_name"),
                    placeholder=placeholder,
                )
                if unit_price is None:
                    unit_price = getattr(product, "sale_price", None) or getattr(product, "purchase_price", None)
                    if unit_price is not None:
                        unit_price = float(unit_price)
                line_value = (unit_price * qty_int) if unit_price is not None else None
                meta_str = json.dumps(meta_line, ensure_ascii=False) if meta_line else None
                self.db.add(
                    OrderItem(
                        order_id=order.id,
                        product_id=product.id,
                        quantity=qty_int,
                        unit_price=unit_price,
                        total_price=line_value,
                        unit=agg.get("unit"),
                        list_price=agg.get("list_price"),
                        vat_percent=agg.get("vat_percent"),
                        metadata_json=meta_str,
                        required_stock_disposition=DEFAULT_STOCK_DISPOSITION,
                    )
                )
                items_added += 1

            self.db.flush()
            from ..api.order import _recompute_order_value_and_volume

            oo = (
                self.db.query(Order)
                .options(joinedload(Order.items))
                .filter(Order.id == order.id)
                .first()
            )
            if oo is not None:
                _recompute_order_value_and_volume(oo, self.db)

        self.db.commit()

        order_total_rows = len(rows_list) - 1
        log = ImportLog(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            type="orders",
            total_rows=order_total_rows,
            created=len(created_orders),
            updated=updated_orders_count,
            skipped=order_skipped_count,
            warnings=order_warning_count,
            errors=0,
            message="Order import completed",
        )
        self.db.add(log)
        self.db.commit()

        logger.info(
            "import_orders: rows=%s orders_out=%s created=%s updated=%s skipped=%s items=%s",
            order_total_rows,
            len(orders_data),
            len(created_orders),
            updated_orders_count,
            order_skipped_count,
            items_added,
        )
        return {
            "created_orders": len(created_orders),
            "updated_orders": updated_orders_count,
            "orders_total": len(orders_data),
            "items_added": items_added,
            "lines_imported": items_added,
            "total_rows": order_total_rows,
            "skipped_rows": skipped_rows,
            "unmapped_columns": unmapped_bases,
            "skipped": order_skipped_count,
            "warnings": order_warning_count,
            "errors": 0,
        }

    # ==========================================================
    # IMPORT ZESTAWÓW (BUNDLE / SETS)
    # ==========================================================

    def _find_product_by_child_ref(self, tenant_id: int, ref: str) -> Product | None:
        ref = (ref or "").strip()
        if not ref:
            return None
        p = (
            self.db.query(Product)
            .filter(Product.tenant_id == tenant_id)
            .filter((Product.sku == ref) | (Product.symbol == ref) | (Product.ean == ref))
            .first()
        )
        return p

    def _find_product_for_bundle_import_line(
        self,
        tenant_id: int,
        *,
        child_sku: str | None,
        child_id: str | None,
        child_ean: str | None,
        child_symbol: str | None,
        child_catalog: str | None,
    ) -> Product | None:
        if child_id and str(child_id).strip().isdigit():
            pid = int(str(child_id).strip())
            p = (
                self.db.query(Product)
                .filter(Product.id == pid, Product.tenant_id == tenant_id)
                .first()
            )
            if p:
                return p
        if child_catalog and str(child_catalog).strip():
            key = str(child_catalog).strip()
            p = (
                self.db.query(Product)
                .filter(Product.tenant_id == tenant_id, Product.catalog_number == key)
                .first()
            )
            if p:
                return p
        for val in (child_symbol, child_sku):
            if val and str(val).strip():
                key = str(val).strip()
                p = (
                    self.db.query(Product)
                    .filter(
                        Product.tenant_id == tenant_id,
                        (Product.sku == key) | (Product.symbol == key),
                    )
                    .first()
                )
                if p:
                    return p
        if child_ean and str(child_ean).strip():
            raw = str(child_ean).strip()
            if _is_probable_ean_string(raw):
                ne = _normalize_ean(raw)
                if ne:
                    p = (
                        self.db.query(Product)
                        .filter(Product.tenant_id == tenant_id, Product.ean == ne)
                        .first()
                    )
                    if p:
                        return p
            else:
                p = (
                    self.db.query(Product)
                    .filter(
                        Product.tenant_id == tenant_id,
                        (Product.sku == raw) | (Product.symbol == raw) | (Product.ean == raw),
                    )
                    .first()
                )
                if p:
                    return p
        ref = (child_sku or child_ean or child_symbol or child_catalog or "").strip()
        return self._find_product_by_child_ref(tenant_id, ref) if ref else None

    def import_sets(self, file, column_map: dict, tenant_id: int):
        decoded = file.file.read().decode("utf-8")
        rows_list = _parse_csv_bytes_to_rows(decoded)
        if not rows_list:
            return {"created_bundles": 0, "updated_bundles": 0, "lines": 0, "total_rows": 0, "skipped": 0}

        headers = [_strip_quotes(str(h).lstrip("\ufeff").strip()) for h in rows_list[0]]
        counts = Counter(headers)
        column_names = [f"{h} ({i})" if counts[h] > 1 else h for i, h in enumerate(headers)]

        set_sku_idx = _resolve_column_index(
            headers, column_names, column_map, "set_sku", SET_FIELD_ALIASES.get("set_sku", [])
        )
        set_name_idx = _resolve_column_index(
            headers, column_names, column_map, "set_name", SET_FIELD_ALIASES.get("set_name", [])
        )
        child_idx = _resolve_column_index(
            headers, column_names, column_map, "child_sku", SET_FIELD_ALIASES.get("child_sku", [])
        )
        child_id_idx = _resolve_column_index(
            headers, column_names, column_map, "child_id", SET_FIELD_ALIASES.get("child_id", [])
        )
        child_ean_idx = _resolve_column_index(
            headers, column_names, column_map, "child_ean", SET_FIELD_ALIASES.get("child_ean", [])
        )
        child_symbol_idx = _resolve_column_index(
            headers, column_names, column_map, "child_symbol", SET_FIELD_ALIASES.get("child_symbol", [])
        )
        child_cat_idx = _resolve_column_index(
            headers, column_names, column_map, "child_catalog_number", SET_FIELD_ALIASES.get("child_catalog_number", [])
        )
        child_images_idx = _resolve_column_index(
            headers, column_names, column_map, "child_images", SET_FIELD_ALIASES.get("child_images", [])
        )
        qty_idx = _resolve_column_index(headers, column_names, column_map, "qty", SET_FIELD_ALIASES.get("qty", []))

        has_child_ref = any(
            x is not None for x in (child_idx, child_id_idx, child_ean_idx, child_symbol_idx, child_cat_idx)
        )
        if set_sku_idx is None or not has_child_ref:
            return {
                "error": "Wymagane mapowanie: set_sku oraz co najmniej jedno pole składnika (SKU/EAN/ID/symbol/katalog).",
                "created_bundles": 0,
                "updated_bundles": 0,
                "lines": 0,
                "total_rows": 0,
                "skipped": 0,
            }

        grouped: dict[str, list[dict]] = defaultdict(list)
        skipped = 0
        data_rows = 0

        def _cell(row: list, idx: int | None) -> str:
            if idx is None or idx >= len(row):
                return ""
            return _strip_quotes(row[idx])

        for row in rows_list[1:]:
            data_rows += 1
            if set_sku_idx >= len(row):
                skipped += 1
                continue
            set_sku = _strip_quotes(row[set_sku_idx])
            if not set_sku:
                skipped += 1
                continue
            child_sku = _cell(row, child_idx)
            child_id = _cell(row, child_id_idx)
            child_ean = _cell(row, child_ean_idx)
            child_symbol = _cell(row, child_symbol_idx)
            child_cat = _cell(row, child_cat_idx)
            child_images = _cell(row, child_images_idx)
            if not any([child_sku, child_id, child_ean, child_symbol, child_cat]):
                skipped += 1
                continue
            name_cell = ""
            if set_name_idx is not None and set_name_idx < len(row):
                name_cell = _strip_quotes(row[set_name_idx])
            qty = 1
            if qty_idx is not None and qty_idx < len(row):
                raw_q = _strip_quotes(row[qty_idx])
                if raw_q:
                    try:
                        qty = max(1, int(round(float(str(raw_q).replace(",", ".")))))
                    except ValueError:
                        qty = 1
            grouped[set_sku].append(
                {
                    "set_name": name_cell,
                    "child_sku": child_sku or None,
                    "child_id": child_id or None,
                    "child_ean": child_ean or None,
                    "child_symbol": child_symbol or None,
                    "child_catalog": child_cat or None,
                    "child_images": child_images or None,
                    "qty": qty,
                }
            )

        created_bundles = 0
        updated_bundles = 0
        lines_written = 0

        for set_sku, lines in grouped.items():
            set_name = next((ln["set_name"] for ln in lines if ln.get("set_name")), set_sku)
            bundle = (
                self.db.query(Bundle)
                .filter(Bundle.tenant_id == tenant_id, Bundle.sku == set_sku)
                .first()
            )
            if bundle:
                updated_bundles += 1
                bundle.name = set_name or bundle.name
            else:
                bundle = Bundle(tenant_id=tenant_id, name=set_name or set_sku, sku=set_sku, active=True)
                self.db.add(bundle)
                self.db.flush()
                created_bundles += 1

            self.db.query(BundleItem).filter(BundleItem.bundle_id == bundle.id).delete(synchronize_session=False)
            sort_order = 0
            for ln in lines:
                prod = self._find_product_for_bundle_import_line(
                    tenant_id,
                    child_sku=ln.get("child_sku"),
                    child_id=ln.get("child_id"),
                    child_ean=ln.get("child_ean"),
                    child_symbol=ln.get("child_symbol"),
                    child_catalog=ln.get("child_catalog"),
                )
                if not prod:
                    skipped += 1
                    continue
                meta_patch = {
                    k: v
                    for k, v in (
                        ("import_child_id", ln.get("child_id")),
                        ("import_child_ean", ln.get("child_ean")),
                        ("import_child_symbol", ln.get("child_symbol")),
                        ("import_child_catalog_number", ln.get("child_catalog")),
                        ("import_child_images", ln.get("child_images")),
                    )
                    if v
                }
                meta_str = json.dumps(meta_patch, ensure_ascii=False) if meta_patch else None
                self.db.add(
                    BundleItem(
                        bundle_id=bundle.id,
                        product_id=prod.id,
                        quantity=int(ln["qty"]),
                        sort_order=sort_order,
                        metadata_json=meta_str,
                    )
                )
                sort_order += 1
                lines_written += 1

        self.db.commit()

        log = ImportLog(
            tenant_id=tenant_id,
            warehouse_id=None,
            type="sets",
            total_rows=data_rows,
            created=created_bundles,
            updated=updated_bundles,
            skipped=skipped,
            warnings=0,
            errors=0,
            message=f"Sets import: {lines_written} pozycji zestawów",
        )
        self.db.add(log)
        self.db.commit()

        return {
            "created_bundles": created_bundles,
            "updated_bundles": updated_bundles,
            "lines": lines_written,
            "total_rows": data_rows,
            "skipped": skipped,
        }

    def import_manufacturers(self, file, column_map, tenant_id: int):
        import csv
        import io

        decoded = file.file.read().decode("utf-8")

        sniffer = csv.Sniffer()
        dialect = sniffer.sniff(decoded[:1000])

        reader = csv.DictReader(io.StringIO(decoded), dialect=dialect)
        rows = list(reader)
        created = 0
        updated = 0
        warnings = 0

        for row in rows:
            name = ""

            mapped_col = column_map.get("name")
            if mapped_col:
                name = str(row.get(mapped_col, "")).strip()

            # fallback: pierwsza kolumna z CSV
            if not name:
                values = list(row.values())
                if values:
                    name = str(values[0]).strip()

            if not name:
                warnings += 1
                continue

            existing = (
                self.db.query(Manufacturer)
                .filter(
                    Manufacturer.tenant_id == tenant_id,
                    Manufacturer.name == name,
                )
                .first()
            )

            payload = {
                "company_name": row.get(column_map.get("full_company_name", "")),
                "tax_id": row.get(column_map.get("tax_id", "")),
                "website": row.get(column_map.get("website", "")),
                "email": row.get(column_map.get("email", "")),
                "phone": row.get(column_map.get("phone", "")),
                "logo_url": row.get(column_map.get("logo", "")),
                "street": row.get(column_map.get("address", "")),
            }

            if existing:
                for k, v in payload.items():
                    setattr(existing, k, v)
                updated += 1
            else:
                obj = Manufacturer(
                    tenant_id=tenant_id,
                    name=name,
                    **payload,
                )
                self.db.add(obj)
                created += 1

        self.db.commit()

        return {
            "created_manufacturers": created,
            "updated_manufacturers": updated,
            "total_rows": len(rows),
            "warnings": warnings,
            "errors": 0,
        }

    def import_suppliers(self, file, column_map, tenant_id: int):
        import csv
        import io
        from ..models.supplier import Supplier

        decoded = file.file.read().decode("utf-8")

        sniffer = csv.Sniffer()
        dialect = sniffer.sniff(decoded[:1000])

        reader = csv.DictReader(io.StringIO(decoded), dialect=dialect)
        rows = list(reader)

        created = 0
        updated = 0
        warnings = 0

        for row in rows:
            name = ""

            mapped_col = column_map.get("name")
            if mapped_col:
                name = str(row.get(mapped_col, "")).strip()

            if not name:
                values = list(row.values())
                if values:
                    name = str(values[0]).strip()

            if not name:
                warnings += 1
                continue

            existing = (
                self.db.query(Supplier)
                .filter(
                    Supplier.tenant_id == tenant_id,
                    Supplier.name == name,
                )
                .first()
            )

            payload = {
                "company_name": row.get(column_map.get("full_company_name", "")),
                "tax_id": row.get(column_map.get("tax_id", "")),
                "website": row.get(column_map.get("website", "")),
                "email": row.get(column_map.get("email", "")),
                "phone": row.get(column_map.get("phone", "")),
                "street": row.get(column_map.get("address", "")),
            }

            if existing:
                for k, v in payload.items():
                    setattr(existing, k, v)
                updated += 1
            else:
                obj = Supplier(
                    tenant_id=tenant_id,
                    name=name,
                    **payload,
                )
                self.db.add(obj)
                created += 1

        self.db.commit()

        return {
            "created_suppliers": created,
            "updated_suppliers": updated,
            "total_rows": len(rows),
            "warnings": warnings,
            "errors": 0,
        }

    def import_cartons(self, file, column_map, tenant_id: int):
        import csv
        import io
        from ..models.carton import Carton

        decoded = file.file.read().decode("utf-8")

        sniffer = csv.Sniffer()
        dialect = sniffer.sniff(decoded[:1000])

        reader = csv.DictReader(io.StringIO(decoded), dialect=dialect)
        rows = list(reader)

        created = 0
        updated = 0
        warnings = 0

        for row in rows:
            name = ""

            mapped_col = column_map.get("name")
            if mapped_col:
                name = str(row.get(mapped_col, "")).strip()

            if not name:
                values = list(row.values())
                if values:
                    name = str(values[0]).strip()

            if not name:
                warnings += 1
                continue

            def f(key: str, default: float = 0.0):
                try:
                    raw = str(row.get(column_map.get(key, ""), "")).replace(",", ".").strip()
                    return float(raw) if raw else default
                except:
                    return default

            sku = str(row.get(column_map.get("sku", ""), "")).strip() or None
            ean = str(row.get(column_map.get("ean", ""), "")).strip() or None

            existing = (
                self.db.query(Carton)
                .filter(
                    Carton.tenant_id == tenant_id,
                    Carton.name == name,
                )
                .first()
            )

            payload = {
                "sku": sku,
                "ean": ean,
                "length_cm": f("length_cm"),
                "width_cm": f("width_cm"),
                "height_cm": f("height_cm"),
                "weight_kg": f("weight_kg"),
                "stock": f("stock"),
                "purchase_price": f("purchase_price", None),
                "location_label": str(row.get(column_map.get("location_label", ""), "")).strip() or None,
                "notes": str(row.get(column_map.get("notes", ""), "")).strip() or None,
                "is_active": True,
            }

            if existing:
                for k, v in payload.items():
                    setattr(existing, k, v)
                updated += 1
            else:
                obj = Carton(
                    tenant_id=tenant_id,
                    warehouse_id=1,
                    name=name,
                    **payload,
                )
                self.db.add(obj)
                created += 1

        self.db.commit()

        return {
            "created_cartons": created,
            "updated_cartons": updated,
            "total_rows": len(rows),
            "warnings": warnings,
            "errors": 0,
        }

    def import_customers(self, file, column_map: dict, tenant_id: int):
        import csv
        import io
        from datetime import datetime as dt

        from ..models.customer import Customer, CustomerAddress

        decoded = file.file.read().decode("utf-8")
        try:
            dialect = csv.Sniffer().sniff(decoded[:1000])
        except Exception:
            dialect = csv.excel
            dialect.delimiter = ";"

        reader = csv.DictReader(io.StringIO(decoded), dialect=dialect)
        rows = list(reader)

        def cell(key: str, row: dict) -> str:
            mk = column_map.get(key)
            if not mk:
                return ""
            v = row.get(mk)
            return str(v).strip() if v is not None else ""

        created = 0
        updated = 0
        skipped = 0
        warnings = 0

        for row in rows:
            rid = cell("id", row)
            first = cell("first_name", row)
            last = cell("last_name", row)
            email = cell("email", row)
            company = cell("company_name", row)

            if not any([rid, first, last, email, company, cell("phone", row), cell("nip", row)]):
                skipped += 1
                continue

            cust = None
            if rid.isdigit():
                cust = (
                    self.db.query(Customer)
                    .filter(Customer.tenant_id == tenant_id, Customer.id == int(rid))
                    .first()
                )
            if not cust and email:
                cust = (
                    self.db.query(Customer)
                    .filter(Customer.tenant_id == tenant_id, Customer.email.isnot(None))
                    .filter(Customer.email.ilike(email.strip()))
                    .first()
                )

            phone = cell("phone", row)
            nip = cell("nip", row)
            status_raw = cell("status", row)
            city = cell("city", row)
            postal = cell("postal_code", row)
            country = (cell("country", row) or "").strip() or "PL"
            if len(country) > 8:
                country = country[:8]
            street = cell("street", row)
            house = (cell("building_number", row) or "").strip() or "-"

            deleted_at_val = None
            apply_status = bool(status_raw)
            if apply_status:
                sl = status_raw.lower()
                if "zarchiw" in sl:
                    deleted_at_val = dt.utcnow()
                elif "aktyw" in sl or sl in ("1", "true", "tak", "y", "active"):
                    deleted_at_val = None
                elif sl in ("0", "nie", "false", "n", "inactive") or "nieaktyw" in sl:
                    deleted_at_val = dt.utcnow()
                else:
                    warnings += 1

            if cust:
                if first:
                    cust.first_name = first
                if last:
                    cust.last_name = last
                if email:
                    cust.email = email
                if phone:
                    cust.phone = phone or None
                if company:
                    cust.company_name = company or None
                if nip:
                    cust.nip = nip or None
                cust.country_code = country
                if apply_status:
                    cust.deleted_at = deleted_at_val
                if any([city, postal, street]):
                    addr = (
                        self.db.query(CustomerAddress)
                        .filter(
                            CustomerAddress.customer_id == cust.id,
                            CustomerAddress.is_default.is_(True),
                        )
                        .first()
                    )
                    if not addr:
                        addr = CustomerAddress(
                            customer_id=cust.id,
                            first_name=first or cust.first_name,
                            last_name=last or cust.last_name,
                            is_default=True,
                        )
                        self.db.add(addr)
                        self.db.flush()
                    if city:
                        addr.city = city
                    if postal:
                        addr.postal_code = postal
                    if street:
                        addr.street = street
                    addr.house_number = house
                    addr.country_code = country
                updated += 1
            else:
                if not email and not company and not (first or last):
                    warnings += 1
                    skipped += 1
                    continue
                cust = Customer(
                    tenant_id=tenant_id,
                    first_name=first or "",
                    last_name=last or "",
                    email=email or None,
                    phone=phone or None,
                    company_name=company or None,
                    nip=nip or None,
                    country_code=country,
                    deleted_at=deleted_at_val if apply_status else None,
                )
                self.db.add(cust)
                self.db.flush()
                if any([city, postal, street]):
                    self.db.add(
                        CustomerAddress(
                            customer_id=cust.id,
                            first_name=first or "",
                            last_name=last or "",
                            street=street or "",
                            house_number=house,
                            postal_code=postal or "",
                            city=city or "",
                            country_code=country,
                            is_default=True,
                        )
                    )
                created += 1

        self.db.commit()

        log = ImportLog(
            tenant_id=tenant_id,
            warehouse_id=None,
            type="customers",
            total_rows=len(rows),
            created=created,
            updated=updated,
            skipped=skipped,
            warnings=warnings,
            errors=0,
            message=f"Klienci: utworzono {created}, zaktualizowano {updated}, pominięto {skipped}",
        )
        self.db.add(log)
        self.db.commit()

        return {
            "created_customers": created,
            "updated_customers": updated,
            "total_rows": len(rows),
            "warnings": warnings,
            "skipped": skipped,
            "errors": 0,
        }

    # ==========================================================
    # PREVIEW
    # ==========================================================

    def preview_csv(self, file):
        raw = file.file.read()
        try:
            file.file.seek(0)
        except (OSError, AttributeError, ValueError):
            pass

        decoded = _decode_preview_csv_bytes(raw)
        if decoded is None:
            logger.warning("CSV preview: file is not valid UTF-8")
            return {
                "columns": [],
                "preview": [],
                "error": "encoding",
                "message": (
                    "Nie można odczytać pliku jako UTF-8. "
                    "Zapisz plik CSV w kodowaniu UTF-8 (np. w Excel: Zapisz jako → CSV UTF-8 (rozdzielany przecinkami))."
                ),
            }

        lines = decoded.splitlines()
        if not lines or all(not ln.strip() for ln in lines):
            return {"columns": [], "preview": []}

        delim, detection_src = _detect_preview_csv_delimiter(lines)
        logger.info(
            "CSV preview: using delimiter %r (detection=%s)",
            delim,
            detection_src,
        )
        rows_list = list(csv.reader(lines, delimiter=delim, quotechar='"'))
        if not rows_list:
            return {"columns": [], "preview": []}

        headers = [_strip_quotes(h) for h in rows_list[0]]
        if headers:
            headers[0] = str(headers[0]).lstrip("\ufeff").strip()
        counts = Counter(headers)
        columns = [
            f"{h} ({i})" if counts[h] > 1 else h
            for i, h in enumerate(headers)
        ]

        preview_rows = []
        for row in rows_list[1:6]:
            if len(row) < len(columns):
                row = list(row) + [""] * (len(columns) - len(row))
            preview_rows.append({
                col: _strip_quotes(row[i] if i < len(row) else "")
                for i, col in enumerate(columns)
            })

        return {
            "columns": columns,
            "preview": preview_rows,
        }
