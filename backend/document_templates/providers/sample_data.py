"""Shared sample print context fragments for preview / starter testing."""

from __future__ import annotations

from ..dto.print_context import (
    OrderLinePrintContext,
    OrderPrintContext,
    ProductionComponentRow,
    ProductionPrintContext,
    ProductPrintContext,
    ReportPrintContext,
    WarehouseDocumentLinePrintContext,
    WarehousePrintContext,
)


def sample_products() -> list[dict]:
    return [
        {
            "name": "Przykładowy produkt A",
            "sku": "SKU-001",
            "ean": "5901234123457",
            "catalog_number": "CAT-001",
            "barcode": "5901234123457",
            "quantity": "2",
            "unit": "szt.",
            "price": "49.99",
            "value": "99.98",
            "vat": "23%",
            "locations": "A-01-01",
            "manufacturer": "Demo Sp. z o.o.",
        },
        {
            "name": "Przykładowy produkt B",
            "sku": "SKU-002",
            "ean": "5901234123458",
            "catalog_number": "CAT-002",
            "barcode": "5901234123458",
            "quantity": "1",
            "unit": "szt.",
            "price": "19.99",
            "value": "19.99",
            "vat": "23%",
            "locations": "B-02-03",
            "manufacturer": "Demo Sp. z o.o.",
        },
    ]


def sample_document(*, title: str, doc_type: str = "WZ") -> dict:
    return {
        "number": f"{doc_type}/2026/0001",
        "created_at": "2026-06-08T10:00:00",
        "status": "Zatwierdzony",
        "title": title,
        "type": doc_type,
        "notes": "Przykładowe uwagi do dokumentu.",
        "barcode_value": f"{doc_type}20260001",
        "qr_value": f"https://example.local/doc/{doc_type.lower()}/1",
    }


def sample_warehouse_context(*, title: str, doc_type: str = "WZ") -> WarehousePrintContext:
    lines = [
        WarehouseDocumentLinePrintContext(
            product={"name": p["name"], "sku": p["sku"], "ean": p["ean"]},
            quantity=p["quantity"],
            unit=p["unit"],
            location=p["locations"],
        )
        for p in sample_products()
    ]
    return WarehousePrintContext(
        document_number=sample_document(title=title, doc_type=doc_type)["number"],
        document_type=doc_type,
        document_date="08.06.2026",
        status="Zatwierdzony",
        title=title,
        document=sample_document(title=title, doc_type=doc_type),
        products=sample_products(),
        lines=lines,
        partner={"name": "Kontrahent Demo Sp. z o.o.", "nip": "1234567890"},
        notes="Przykładowe uwagi do dokumentu.",
        totals={"net": "97.54", "vat": "22.43", "gross": "119.97"},
    )


def sample_order_context(*, title: str = "Potwierdzenie zamówienia") -> OrderPrintContext:
    items = [
        OrderLinePrintContext(
            product={"name": p["name"], "sku": p["sku"], "ean": p["ean"]},
            quantity=p["quantity"],
            unit=p["unit"],
            unit_price_net=p["price"],
            line_total_net=p["value"],
        )
        for p in sample_products()
    ]
    doc = sample_document(title=title, doc_type="ORD")
    return OrderPrintContext(
        order_number=doc["number"],
        order_date="08.06.2026",
        status="Nowe",
        title=title,
        document=doc,
        customer={"name": "Jan Kowalski", "email": "jan@example.com", "phone": "+48123456789"},
        delivery={"street": "ul. Testowa 1", "city": "Warszawa", "postal_code": "00-001"},
        payment={"method": "Przelew", "status": "Oczekuje"},
        shipping={"carrier": "DPD", "tracking_number": "TRK123456"},
        items=items,
        totals={"net": "97.54", "vat": "22.43", "gross": "119.97"},
    )


def sample_production_context() -> ProductionPrintContext:
    return ProductionPrintContext(
        job_number="PO-2026/0042",
        job_kind_label="Zlecenie produkcyjne",
        printed_at="08.06.2026 10:00",
        header_product_line="Produkt gotowy Demo",
        header_sku="FG-001",
        header_ean="5901234999999",
        header_planned_qty="100",
        header_date="08.06.2026",
        operator_name="Anna Operator",
        warehouse_name="Magazyn główny",
        recipe_version="v3",
        header_barcode_value="FG001",
        components=[
            ProductionComponentRow(
                name="Składnik A",
                sku="RM-001",
                required_qty="10",
                unit="kg",
                suggested_location="RAW-01",
                batch_number="LOT-2026-01",
            )
        ],
    )


def sample_product_context() -> ProductPrintContext:
    return ProductPrintContext(
        product={
            "name": "Produkt Demo",
            "sku": "SKU-DEMO",
            "ean": "5901234123457",
            "barcode_value": "5901234123457",
            "catalog_number": "CAT-DEMO",
        },
        manufacturer={"name": "Producent Demo"},
        stock={"available": "128", "reserved": "4"},
        prices={"net": "49.99", "gross": "61.49"},
        images=["/static/demo-product.png"],
    )


def sample_report_context(*, title: str = "Raport") -> ReportPrintContext:
    return ReportPrintContext(
        title=title,
        subtitle="Okres: 01.06.2026 – 08.06.2026",
        generated_at="08.06.2026 10:00",
        rows=[
            {"label": "Wykonane zlecenia", "value": "42"},
            {"label": "Braki", "value": "3"},
        ],
        summary={"total": "42"},
    )
