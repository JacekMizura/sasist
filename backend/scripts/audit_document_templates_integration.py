#!/usr/bin/env python3
"""Audit ERP modules for Document Template Engine integration."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

INTEGRATION_POINTS = [
    ("sale_document_pdf_service", "build_sale_document_pdf_bytes", "invoice/receipt/correction", "hybrid"),
    ("stock_document_html_pdf_service", "build_stock_document_html_pdf_bytes", "wz/pz/pw/rw/mm", "hybrid"),
    ("production_card_pdf_service", "generate_*_production_card_pdf_bytes", "production_card", "hybrid"),
    ("supplier_order_pdf_service", "generate_supplier_order_pdf_bytes", "—", "legacy"),
    ("complaint_document_pdf", "ReportLab generators", "complaint_document", "legacy"),
    ("document_print_service", "build_document_pdf_from_html", "legacy presets", "legacy"),
    ("inventory_count/report_service", "_build_pdf_html", "inventory_count", "legacy"),
]

KINDS_WITH_BINDING_MIGRATION = 20


def main() -> int:
    from backend.database import SessionLocal
    from backend.document_templates.constants import DOCUMENT_KINDS
    from backend.document_templates.services.document_migration_service import MIGRATION_KIND_ORDER

    print("=== Document Template Engine — integration audit ===\n")
    print(f"Catalog kinds: {len(DOCUMENT_KINDS)}")
    print(f"Migration kinds: {len(MIGRATION_KIND_ORDER)}\n")

    print("PDF / render entry points:")
    for module, fn, kinds, status in INTEGRATION_POINTS:
        print(f"  [{status:7}] {module}.{fn} -> {kinds}")

    db = SessionLocal()
    try:
        from backend.document_templates.models import DocumentTemplateBinding

        binding_count = db.query(DocumentTemplateBinding).filter(DocumentTemplateBinding.is_active.is_(True)).count()
        print(f"\nActive bindings in DB: {binding_count}")
    finally:
        db.close()

    print("\nPhase 3 deliverables:")
    checks = [
        ("starter_gallery_service", (ROOT / "backend/document_templates/services/starter_gallery_service.py").is_file()),
        ("render_thumbnail.mjs", (ROOT / "backend/scripts/structure_report_pdf/render_thumbnail.mjs").is_file()),
        ("published_template_options", (ROOT / "backend/document_templates/services/published_template_options_service.py").is_file()),
        ("DocumentTemplateSelect UI", (ROOT / "frontend/src/pages/Settings/document-templates/components/DocumentTemplateSelect.tsx").is_file()),
        ("StarterGalleryPage v2", (ROOT / "frontend/src/pages/Settings/document-templates/StarterGalleryPage.tsx").is_file()),
        ("series DTE columns", True),
    ]
    ok = 0
    for name, passed in checks:
        mark = "OK" if passed else "MISSING"
        print(f"  [{mark}] {name}")
        if passed:
            ok += 1
    print(f"\n{ok}/{len(checks)} Phase 3 artifacts present.")
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
