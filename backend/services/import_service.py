"""
IMPORT SERVICE

Obsługuje:
- import produktów (w tym kolumny o tej samej nazwie, np. trzy "Wymiary opakowań" – rozróżniane po indeksie).
  Domyślne mapowanie indeksów dla "Wymiary opakowań": Index 5 = Długość (L), 6 = Szerokość (W), 7 = Wysokość (H).
  Wartości liczbowe z przecinkiem (np. 4,5) są normalizowane do kropki przed konwersją na float.
- import zamówień z wieloma pozycjami
"""

import csv
import logging
import re
from collections import Counter, defaultdict
from sqlalchemy.orm import Session

from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.product import Product

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

# Domyślna objętość gdy brak wymiarów (dm³) – 1 cm × 1 cm × 1 cm = 0.001 dm³
FALLBACK_VOLUME_DM3 = 0.001
# Domyślna wartość pojedynczego wymiaru gdy brak lub 0 (cm) – 1 cm dla obliczenia objętości
FALLBACK_DIMENSION_CM = 1.0


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


class ImportService:

    def __init__(self, db: Session):
        self.db = db

    # ==========================================================
    # IMPORT PRODUKTÓW
    # ==========================================================

    def import_products(self, file, column_map: dict, tenant_id: int):
        decoded = file.file.read().decode("utf-8")
        sniffer = csv.Sniffer()
        dialect = sniffer.sniff(decoded[:1000])
        lines = decoded.splitlines()
        reader = csv.reader(lines, dialect=dialect)
        rows_list = list(reader)
        if not rows_list:
            return {"created_products": 0}

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

        created = 0
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

            name_col = column_map.get("title") or column_map.get("name") or column_map.get("identifier")
            name_idx = _column_value_to_index(headers, name_col)
            name = (row[name_idx] if name_idx is not None and name_idx < len(row) else None) or None
            name = (name or "").strip() or None

            ean_idx = _column_value_to_index(headers, column_map.get("ean"))
            symbol_idx = _column_value_to_index(headers, column_map.get("symbol"))
            weight_idx = _column_value_to_index(headers, column_map.get("weight"))
            purchase_price_idx = _column_value_to_index(headers, column_map.get("purchase_price"))
            image_url_idx = _column_value_to_index(headers, column_map.get("image_url") or column_map.get("images"))

            product = Product(
                tenant_id=tenant_id,
                name=name,
                ean=row[ean_idx] if ean_idx is not None and ean_idx < len(row) else None,
                symbol=row[symbol_idx] if symbol_idx is not None and symbol_idx < len(row) else None,
                length=length,
                width=width,
                height=height,
                weight=safe_float(row[weight_idx] if weight_idx is not None and weight_idx < len(row) else None),
                volume=volume,
                purchase_price=safe_float(row[purchase_price_idx] if purchase_price_idx is not None and purchase_price_idx < len(row) else None),
                image_url=(row[image_url_idx] if image_url_idx is not None and image_url_idx < len(row) else None) or None,
            )
            self.db.add(product)
            created += 1

        self.db.commit()
        logger.info("import_products: rows_read=%s, created_products=%s, committed=1", len(rows_list) - 1, created)
        return {"created_products": created}

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

        # Normalizacja nagłówków: usuń cudzysłowy (id ilosc ean(2).csv i podobne)
        headers = [_strip_quotes(h) for h in rows_list[0]]
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

        # Mapowanie kolumn z fallbackami dla pliku id ilosc ean(2).csv
        order_id_col = _resolve_order_column(
            column_names,
            column_map.get("order_id") or column_map.get("order_number"),
            "Identyfikator (ID)",
        )
        ean_col = _resolve_order_column(column_names, column_map.get("ean"), "Kod EAN")
        quantity_col = _resolve_order_column(column_names, column_map.get("quantity"), "Ilość")
        city_col = _resolve_order_column(column_names, column_map.get("city"), None)
        country_col = _resolve_order_column(column_names, column_map.get("country"), None)

        # order_number -> (ean -> summed quantity); first row per order (for city/country)
        grouped_by_order: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
        first_row_by_order: dict[str, dict] = {}

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

        created_orders = []
        items_added = 0

        for order_number, ean_to_qty in grouped_by_order.items():
            if not ean_to_qty:
                continue

            first_row = first_row_by_order.get(order_number) or {}
            order = Order(
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                number=str(order_number),
                city=first_row.get(city_col) if city_col else None,
                country=first_row.get(country_col) if country_col else None,
                status="NEW",
            )
            self.db.add(order)
            self.db.flush()

            for ean, quantity in ean_to_qty.items():
                product = self.db.query(Product).filter(
                    Product.ean == ean,
                    Product.tenant_id == tenant_id,
                ).first()
                if not product:
                    product = placeholder
                qty_int = max(1, int(round(quantity)))
                item = OrderItem(
                    order_id=order.id,
                    product_id=product.id,
                    quantity=qty_int,
                )
                self.db.add(item)
                items_added += 1

            created_orders.append(order)

        self.db.commit()
        rows_read = len(rows_list) - 1
        logger.info(
            "import_orders: rows_read=%s, orders_created=%s, items_added=%s, committed=1",
            rows_read, len(created_orders), items_added,
        )
        return {"created_orders": len(created_orders), "items_added": items_added}

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