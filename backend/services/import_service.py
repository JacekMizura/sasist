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
from datetime import datetime
from sqlalchemy.orm import Session

from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.product import Product
from ..models.inventory import Inventory
from ..models.inventory_unit import InventoryUnit
from ..models.stock import Stock
from ..models.location import Location
from ..models.import_log import ImportLog

logger = logging.getLogger(__name__)


def _normalize_ean(value) -> str | None:
    """
    Normalizuje EAN do dopasowania z tabelą Products: trim, usuwa cudzysłowy, usuwa wiodące zera.
    Zwraca None jeśli po normalizacji wartość jest pusta.
    """
    if value is None:
        return None
    s = str(value).strip().strip('"').strip("'").strip()
    if not s:
        return None
    # Usuń wiodące zera; jeśli zostanie tylko pusty string (np. "000"), zwróć "0"
    normalized = s.lstrip("0") or "0"
    return normalized


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
    "sale_price": ["Cena sprzedaży", "Cena sprzedaży brutto"],
    "manufacturer": ["Producent"],
    "unit": ["Jednostka"],
    "length": ["Długość"],
    "width": ["Szerokość"],
    "height": ["Wysokość"],
    "volume": ["Objętość"],
    "weight": ["Waga"],
    "ean": ["Kod EAN"],
    "sku": ["SKU", "Symbol"],
    "symbol": ["Symbol"],
    "name": ["Nazwa", "Tytuł", "Nazwa produktu"],
    "title": ["Nazwa", "Tytuł"],
    "image_url": ["URL zdjęcia", "Obraz"],
    "images": ["URL zdjęcia", "Obraz"],
    "stock_quantity": ["Stan magazynowy", "Stan", "Stock", "Ilość magazynowa"],
    "location": ["Lokalizacja", "Location", "Lokalizacja magazynowa"],
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
}


def _get_or_create_location(db: Session, warehouse_id: int, name: str | None) -> Location | None:
    """
    Find or create a location in the given warehouse.
    If name is empty/None, use default 'Import'. Returns None only on error.
    """
    loc_name = (name or "").strip() or "Import"
    loc = db.query(Location).filter(
        Location.warehouse_id == warehouse_id,
        Location.name == loc_name,
    ).first()
    if loc:
        return loc
    loc = Location(warehouse_id=warehouse_id, name=loc_name, type="pick")
    db.add(loc)
    db.flush()
    return loc


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
    update inventory (and InventoryUnit, Stock) to the first assigned storage location.
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
            for st in db.query(Stock).filter(
                Stock.tenant_id == tenant_id,
                Stock.product_id == inv.product_id,
                Stock.warehouse_id == warehouse_id,
                Stock.location_id == import_loc_id,
            ):
                existing_stock = (
                    db.query(Stock)
                    .filter(
                        Stock.tenant_id == tenant_id,
                        Stock.product_id == inv.product_id,
                        Stock.warehouse_id == warehouse_id,
                        Stock.location_id == assigned_loc_id,
                    )
                    .first()
                )
                if existing_stock:
                    existing_stock.quantity = (existing_stock.quantity or 0) + (st.quantity or 0)
                    db.delete(st)
                else:
                    st.location_id = assigned_loc_id
        else:
            inv.location_id = assigned_loc_id
            db.query(InventoryUnit).filter(
                InventoryUnit.tenant_id == tenant_id,
                InventoryUnit.product_id == inv.product_id,
                InventoryUnit.warehouse_id == warehouse_id,
                InventoryUnit.location_id == import_loc_id,
            ).update({InventoryUnit.location_id: assigned_loc_id})
            db.query(Stock).filter(
                Stock.tenant_id == tenant_id,
                Stock.product_id == inv.product_id,
                Stock.warehouse_id == warehouse_id,
                Stock.location_id == import_loc_id,
            ).update({Stock.location_id: assigned_loc_id})
    db.flush()


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


def _find_product_for_order_item(
    db: Session,
    tenant_id: int,
    normalized_ean: str,
    product_name: str | None,
    placeholder: Product,
) -> Product:
    """
    Match product for order line: 1) EAN 2) SKU/symbol 3) product_name (fallback).
    Returns placeholder if no match.
    """
    # 1) By EAN
    product = db.query(Product).filter(Product.tenant_id == tenant_id, Product.ean == normalized_ean).first()
    if product:
        return product
    # 2) By SKU or symbol (identifier column may contain SKU in some CSVs)
    product = (
        db.query(Product)
        .filter(
            Product.tenant_id == tenant_id,
            (Product.sku == normalized_ean) | (Product.symbol == normalized_ean),
        )
        .first()
    )
    if product:
        return product
    # 3) By product_name (fallback)
    if product_name and product_name.strip():
        name_clean = product_name.strip()
        product = (
            db.query(Product)
            .filter(Product.tenant_id == tenant_id, Product.name == name_clean)
            .first()
        )
        if product:
            return product
    return placeholder


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
        sniffer = csv.Sniffer()
        dialect = sniffer.sniff(decoded[:1000])
        lines = decoded.splitlines()
        reader = csv.reader(lines, dialect=dialect)
        rows_list = list(reader)
        if not rows_list:
            return {"created_products": 0, "updated_products": 0}

        headers = rows_list[0]
        counts = Counter(headers)
        column_names = [
            f"{h} ({i})" if counts[h] > 1 else h
            for i, h in enumerate(headers)
        ]

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
            return str(v).strip() if v else None

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

        # Resolve all product column indices (existing + optional new fields with aliases)
        name_col = column_map.get("title") or column_map.get("name") or column_map.get("identifier")
        name_idx = _column_value_to_index(headers, name_col)
        ean_idx = _column_value_to_index(headers, column_map.get("ean"))
        symbol_idx = _column_value_to_index(headers, column_map.get("symbol"))
        weight_idx = _column_value_to_index(headers, column_map.get("weight"))
        purchase_price_idx = _resolve_column_index(headers, column_names, column_map, "purchase_price", PRODUCT_FIELD_ALIASES.get("purchase_price", []))
        image_url_idx = _column_value_to_index(headers, column_map.get("image_url") or column_map.get("images"))
        sale_price_idx = _resolve_column_index(headers, column_names, column_map, "sale_price", PRODUCT_FIELD_ALIASES.get("sale_price", []))
        manufacturer_idx = _resolve_column_index(headers, column_names, column_map, "manufacturer", PRODUCT_FIELD_ALIASES.get("manufacturer", []))
        unit_idx = _resolve_column_index(headers, column_names, column_map, "unit", PRODUCT_FIELD_ALIASES.get("unit", []))
        sku_idx = _resolve_column_index(headers, column_names, column_map, "sku", PRODUCT_FIELD_ALIASES.get("sku", []))
        stock_quantity_idx = _resolve_column_index(headers, column_names, column_map, "stock_quantity", PRODUCT_FIELD_ALIASES.get("stock_quantity", []))
        if stock_quantity_idx is None:
            stock_quantity_idx = _resolve_column_index(headers, column_names, column_map, "stock", PRODUCT_FIELD_ALIASES.get("stock_quantity", []))
        location_idx = _resolve_column_index(headers, column_names, column_map, "location", PRODUCT_FIELD_ALIASES.get("location", []))

        # Build used mappings for debug logging
        product_used_mappings: list[tuple[str, str]] = []
        for idx, field in [
            (name_idx, "name"),
            (ean_idx, "ean"),
            (symbol_idx, "symbol"),
            (weight_idx, "weight"),
            (purchase_price_idx, "purchase_price"),
            (image_url_idx, "image_url"),
            (sale_price_idx, "sale_price"),
            (manufacturer_idx, "manufacturer"),
            (unit_idx, "unit"),
            (sku_idx, "sku"),
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
                volume = (l_cm * w_cm * h_cm) / 1000.0  # cm³ -> dm³

            name = (row[name_idx] if name_idx is not None and name_idx < len(row) else None) or None
            name = (name or "").strip() or None

            ean_raw = row[ean_idx] if ean_idx is not None and ean_idx < len(row) else None
            ean_val = (ean_raw or "").strip() or None
            normalized_ean = _normalize_ean(ean_val) if ean_val else None

            # Optional: purchase_price, sale_price (use parse_price for comma decimals), manufacturer, unit, sku
            purchase_price_val = _parse_price(row[purchase_price_idx]) if purchase_price_idx is not None and purchase_price_idx < len(row) else None
            sale_price_val = _parse_price(row[sale_price_idx]) if sale_price_idx is not None and sale_price_idx < len(row) else None
            if sale_price_val is None and sale_price_idx is not None and sale_price_idx < len(row):
                sale_price_val = safe_float(row[sale_price_idx])
            manufacturer_val = (row[manufacturer_idx] or "").strip() or None if manufacturer_idx is not None and manufacturer_idx < len(row) else None
            unit_val = (row[unit_idx] or "").strip() or None if unit_idx is not None and unit_idx < len(row) else None
            sku_val = (row[sku_idx] or "").strip() or None if sku_idx is not None and sku_idx < len(row) else None
            symbol_val = row[symbol_idx] if symbol_idx is not None and symbol_idx < len(row) else None
            symbol_val = (symbol_val or "").strip() or None
            if symbol_val is None and sku_val is not None:
                symbol_val = sku_val
            sku_or_symbol = sku_val or symbol_val

            # Warnings: missing EAN/SKU, missing price
            if not normalized_ean and not sku_or_symbol:
                warning_count += 1
            if purchase_price_val is None and sale_price_val is None:
                warning_count += 1

            # UPSERT: find existing by EAN (primary) or SKU/symbol (fallback)
            existing = None
            if normalized_ean:
                existing = (
                    self.db.query(Product)
                    .filter(Product.tenant_id == tenant_id, Product.ean == normalized_ean)
                    .first()
                )
                if not existing and ean_val:
                    existing = (
                        self.db.query(Product)
                        .filter(Product.tenant_id == tenant_id, Product.ean == ean_val)
                        .first()
                    )
            if not existing and sku_or_symbol:
                existing = (
                    self.db.query(Product)
                    .filter(
                        Product.tenant_id == tenant_id,
                        (Product.sku == sku_or_symbol) | (Product.symbol == sku_or_symbol),
                    )
                    .first()
                )

            if existing:
                logger.info("Updating product EAN=%s", normalized_ean or sku_or_symbol or existing.ean or "")
                # Do not overwrite with NULL if CSV field is empty
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
                if image_url_idx is not None and image_url_idx < len(row) and row[image_url_idx]:
                    img = (row[image_url_idx] or "").strip() or None
                    if img is not None:
                        existing.image_url = img
                product = existing
                self.db.flush()
                updated += 1
            else:
                product = Product(
                    tenant_id=tenant_id,
                    name=name,
                    ean=normalized_ean or ean_val,
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
                    image_url=(row[image_url_idx] if image_url_idx is not None and image_url_idx < len(row) else None) or None,
                )
                self.db.add(product)
                self.db.flush()
                from ..services.barcode_generation import next_product_barcode
                product.barcode = next_product_barcode(self.db, tenant_id)
                created += 1

            # Warehouse stock: only when creating new product (avoid duplicate inventory on re-import)
            stock_qty = 0.0
            if stock_quantity_idx is not None and stock_quantity_idx < len(row):
                stock_qty = safe_float(row[stock_quantity_idx]) or 0.0
            if stock_qty > 0 and not existing:
                loc_name = (row[location_idx] if location_idx is not None and location_idx < len(row) else None) or None
                loc_name = (loc_name or "").strip() or None
                loc = _get_or_create_location(self.db, warehouse_id, loc_name)
                if loc:
                    qty = float(stock_qty)
                    inv = Inventory(
                        tenant_id=tenant_id,
                        product_id=product.id,
                        warehouse_id=warehouse_id,
                        location_id=loc.id,
                        quantity=qty,
                    )
                    self.db.add(inv)
                    # Keep inventory_units and stock in sync so analytics (inventory value, /inventory list) have data
                    unit = InventoryUnit(
                        tenant_id=tenant_id,
                        product_id=product.id,
                        warehouse_id=warehouse_id,
                        location_id=loc.id,
                        quantity=qty,
                        reserved_quantity=0,
                    )
                    self.db.add(unit)
                    st = Stock(
                        tenant_id=tenant_id,
                        product_id=product.id,
                        warehouse_id=warehouse_id,
                        location_id=loc.id,
                        quantity=qty,
                    )
                    self.db.add(st)

        # If inventory was placed at Import and product has assigned_locations, move to assigned storage
        _move_inventory_from_import_to_assigned(self.db, warehouse_id, tenant_id)

        self.db.commit()

        # Save import log for UI history
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

        logger.info("import_products: rows_read=%s, created_products=%s, updated_products=%s, warnings=%s, committed=1", total_rows, created, updated, warning_count)
        return {"created_products": created, "updated_products": updated, "total_rows": total_rows, "warnings": warning_count, "errors": error_count}

    # ==========================================================
    # IMPORT ZAMÓWIEŃ
    # ==========================================================

    def import_orders(self, file, column_map: dict, tenant_id: int, warehouse_id: int):
        decoded = file.file.read().decode("utf-8")
        sniffer = csv.Sniffer()
        dialect = sniffer.sniff(decoded[:1000])
        lines = decoded.splitlines()
        reader = csv.reader(lines, dialect=dialect)
        rows_list = list(reader)
        if not rows_list:
            return {"created_orders": 0, "items_added": 0}

        # Normalizacja nagłówków: usuń cudzysłowy i BOM (id ilosc ean(2).csv i podobne)
        headers = [_strip_quotes(str(h).lstrip("\ufeff").strip()) for h in rows_list[0]]
        counts = Counter(headers)
        column_names = [
            f"{h} ({i})" if counts[h] > 1 else h
            for i, h in enumerate(headers)
        ]

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

        # Mapowanie kolumn z fallbackami (id ilosc ean(2).csv + Sellasist: Nazwa produktu, EAN, Cena, Jednostka, Cena zakupu, Kwota do zapłaty)
        order_id_col = _resolve_order_column(
            column_names,
            column_map.get("order_id") or column_map.get("order_number"),
            "Identyfikator (ID)",
        )
        ean_col = _resolve_order_column(column_names, column_map.get("ean") or column_map.get("product_ean"), "Kod EAN") or _resolve_order_column(column_names, None, "EAN")
        quantity_col = _resolve_order_column(column_names, column_map.get("quantity"), "Ilość")
        city_col = _resolve_order_column(column_names, column_map.get("city"), None)
        country_col = _resolve_order_column(column_names, column_map.get("country"), None)
        order_date_col = _resolve_order_date_column(column_names, column_map)
        order_value_col = (
            _resolve_order_column(column_names, column_map.get("order_value") or column_map.get("value"), "Kwota do zapłaty")
            or _resolve_order_column(column_names, None, "Wartość zamówienia")
            or _resolve_order_column(column_names, None, "Wartość")
        )
        unit_price_col = _resolve_order_column(column_names, column_map.get("unit_price"), "Cena") or _resolve_order_column(column_names, None, "Cena jednostkowa")
        product_name_col = _resolve_order_column(column_names, column_map.get("product_name"), "Nazwa produktu")
        purchase_price_col = _resolve_order_column(column_names, column_map.get("purchase_price"), "Cena zakupu")
        unit_col = _resolve_order_column(column_names, column_map.get("unit"), "Jednostka")

        # Debug logging: mapped and unmapped columns
        order_used_mappings: list[tuple[str, str]] = []
        for col, field in [
            (order_id_col, "order_id"),
            (ean_col, "product_ean"),
            (quantity_col, "quantity"),
            (city_col, "city"),
            (country_col, "country"),
            (order_date_col, "order_date"),
            (order_value_col, "order_value"),
            (unit_price_col, "unit_price"),
            (product_name_col, "product_name"),
            (purchase_price_col, "purchase_price"),
            (unit_col, "unit"),
        ]:
            if col:
                order_used_mappings.append((col, field))
        _log_mappings_and_unmapped(column_names, order_used_mappings)

        # order_number -> (ean -> summed quantity); first row per order (for city/country)
        grouped_by_order: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
        first_row_by_order: dict[str, dict] = {}
        line_unit_price: dict[tuple[str, str], float | None] = {}  # (order_number, ean) -> unit_price from CSV
        line_purchase_price: dict[tuple[str, str], float | None] = {}
        line_unit: dict[tuple[str, str], str | None] = {}
        line_product_name: dict[tuple[str, str], str | None] = {}

        for row in rows_list[1:]:
            if len(row) < len(column_names):
                row = list(row) + [""] * (len(column_names) - len(row))
            row_dict = row_to_dict(row)

            order_number = (row_dict.get(order_id_col) or "").strip() if order_id_col else ""
            if not order_number:
                continue

            ean_raw = (row_dict.get(ean_col) or "").strip() if ean_col else ""
            quantity_raw = row_dict.get(quantity_col) if quantity_col else ""

            # Skip separator rows: empty EAN or empty quantity
            if not ean_raw or (quantity_raw is not None and str(quantity_raw).strip() == ""):
                if order_number not in first_row_by_order:
                    first_row_by_order[order_number] = row_dict
                continue

            qty = safe_float(quantity_raw, None)
            if qty is None or qty <= 0:
                if order_number not in first_row_by_order:
                    first_row_by_order[order_number] = row_dict
                continue

            normalized_ean = _normalize_ean(ean_raw)
            if not normalized_ean:
                continue

            if order_number not in first_row_by_order:
                first_row_by_order[order_number] = row_dict
            grouped_by_order[order_number][normalized_ean] += qty
            key = (order_number, normalized_ean)
            if key not in line_unit_price:
                line_unit_price[key] = safe_float(row_dict.get(unit_price_col), None) if unit_price_col else None
                if purchase_price_col:
                    line_purchase_price[key] = safe_float(row_dict.get(purchase_price_col), None)
                if unit_col:
                    line_unit[key] = (row_dict.get(unit_col) or "").strip() or None
                if product_name_col:
                    line_product_name[key] = (row_dict.get(product_name_col) or "").strip() or None

        # Placeholder dla nieznalezionych EAN: "Unknown Product" 1 dm³, żeby zamówienie nie było puste
        placeholder = (
            self.db.query(Product)
            .filter(Product.tenant_id == tenant_id, Product.name == "Unknown Product")
            .first()
        )
        if not placeholder:
            placeholder = Product(
                tenant_id=tenant_id,
                name="Unknown Product",
                volume=1.0,
            )
            self.db.add(placeholder)
            self.db.flush()
            from ..services.barcode_generation import next_product_barcode
            placeholder.barcode = next_product_barcode(self.db, tenant_id)

        created_orders = []
        updated_orders_count = 0
        order_skipped_count = 0
        order_warning_count = 0
        items_added = 0
        FINAL_STATUSES = ("SHIPPED", "COMPLETED")

        for order_number, ean_to_qty in grouped_by_order.items():
            if not ean_to_qty:
                continue

            first_row = first_row_by_order.get(order_number) or {}
            # Date from CSV: try mapped column, then "Data zamówienia" / "Data dodania"
            date_value = (
                (first_row.get(order_date_col) if order_date_col else None)
                or first_row.get("Data zamówienia")
                or first_row.get("Data dodania")
            )
            if date_value is not None:
                date_value = str(date_value).strip()
            else:
                date_value = ""
            parsed_date = _parse_order_date(date_value) if date_value else None
            # order_date = CSV date; use parsed or fallback to now for display
            order_date = parsed_date if parsed_date is not None else datetime.utcnow()
            if date_value and parsed_date is None:
                order_warning_count += 1
                logger.warning(
                    "import_orders: order_date parse failed for order_number=%r value=%r, using current time",
                    order_number,
                    date_value[:50],
                )
            logger.info(
                "Order import: number=%s, csv_date=%s, parsed=%s",
                order_number,
                date_value or "(empty)",
                parsed_date,
            )

            order_value = None
            if order_value_col:
                order_value = safe_float(first_row.get(order_value_col), None)

            # UPSERT: find existing by tenant_id, warehouse_id, number
            existing_order = (
                self.db.query(Order)
                .filter(
                    Order.tenant_id == tenant_id,
                    Order.warehouse_id == warehouse_id,
                    Order.number == str(order_number),
                )
                .first()
            )
            if existing_order and existing_order.status in FINAL_STATUSES:
                # Safety: do not overwrite shipped/completed orders
                order_skipped_count += 1
                continue

            if existing_order:
                logger.info("Updating order %s", order_number)
                if city_col and first_row.get(city_col) is not None:
                    existing_order.city = first_row.get(city_col)
                if country_col and first_row.get(country_col) is not None:
                    existing_order.country = first_row.get(country_col)
                existing_order.order_date = order_date
                # Do not overwrite created_at when updating (keep original DB creation time)
                if order_value is not None:
                    existing_order.value = order_value
                existing_order.warehouse_id = warehouse_id
                self.db.query(OrderItem).filter(OrderItem.order_id == existing_order.id).delete()
                self.db.flush()
                order = existing_order
                updated_orders_count += 1
            else:
                order = Order(
                    tenant_id=tenant_id,
                    warehouse_id=warehouse_id,
                    number=str(order_number),
                    city=first_row.get(city_col) if city_col else None,
                    country=first_row.get(country_col) if country_col else None,
                    status="NEW",
                    order_date=order_date,
                    created_at=datetime.utcnow(),
                    value=order_value,
                )
                self.db.add(order)
                self.db.flush()
                from ..services.barcode_generation import next_order_barcode
                order.barcode = next_order_barcode(self.db, tenant_id)
                created_orders.append(order)

            for ean, quantity in ean_to_qty.items():
                product_name_val = line_product_name.get((order_number, ean))
                product = _find_product_for_order_item(
                    self.db, tenant_id, ean, product_name_val, placeholder
                )
                qty_int = max(1, int(round(quantity)))
                unit_price = line_unit_price.get((order_number, ean))
                if unit_price is None:
                    unit_price = getattr(product, "sale_price", None) or getattr(product, "purchase_price", None)
                if unit_price is not None:
                    unit_price = float(unit_price)
                line_value = (unit_price * qty_int) if unit_price is not None else None
                purchase_price_val = line_purchase_price.get((order_number, ean))
                if purchase_price_val is not None:
                    purchase_price_val = float(purchase_price_val)
                unit_val = line_unit.get((order_number, ean))
                item = OrderItem(
                    order_id=order.id,
                    product_id=product.id,
                    quantity=qty_int,
                    unit_price=unit_price,
                    total_price=line_value,
                    unit=unit_val,
                )
                self.db.add(item)
                items_added += 1

        self.db.commit()

        # Save import log for UI history
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
            "import_orders: rows_read=%s, orders_created=%s, orders_updated=%s, skipped=%s, warnings=%s, items_added=%s, committed=1",
            order_total_rows, len(created_orders), updated_orders_count, order_skipped_count, order_warning_count, items_added,
        )
        return {
            "created_orders": len(created_orders),
            "updated_orders": updated_orders_count,
            "items_added": items_added,
            "total_rows": order_total_rows,
            "skipped": order_skipped_count,
            "warnings": order_warning_count,
            "errors": 0,
        }

    # ==========================================================
    # PREVIEW
    # ==========================================================

    def preview_csv(self, file):
        decoded = file.file.read().decode("utf-8")
        sniffer = csv.Sniffer()
        dialect = sniffer.sniff(decoded[:1000])
        lines = decoded.splitlines()
        reader = csv.reader(lines, dialect=dialect)
        rows_list = list(reader)
        if not rows_list:
            return {"columns": [], "preview": []}

        headers = [_strip_quotes(h) for h in rows_list[0]]
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