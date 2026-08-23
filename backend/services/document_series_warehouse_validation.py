"""Validate and sanitize warehouse document series create/update payloads."""

from __future__ import annotations

from fastapi import HTTPException

from ..schemas.document_series import DocumentSeriesBase
from .warehouse_series_capabilities import (
    physical_effect_for_warehouse_subtype,
    warehouse_capabilities_for,
)


def _clear_sale_only_fields(body: DocumentSeriesBase) -> None:
    body.correction_series_id = None
    body.warehouse_document_series_id = None
    body.vat_source = None
    body.vat_calc_shipping = "DEFAULT"
    body.vat_calc_payment = "DEFAULT"
    body.vat_rate_percent = None
    body.sale_date_source = "ORDER_DATE"
    body.count_shipping_cost_always = False
    body.shipping_cost_name = "Koszt wysyłki"
    body.payment_term_default = ""
    body.currency_source = "ORDER"
    body.auto_currency_conversion = False
    body.disable_customer_validation = False
    body.allow_empty_customer = False
    body.status_on_create_id = None
    body.status_on_delete_id = None
    body.status_on_error_id = None
    body.status_on_update_id = None
    body.company_name = None
    body.company_street = None
    body.company_house_number = None
    body.company_apartment_number = None
    body.company_address = None
    body.company_city = None
    body.company_zip = None
    body.company_country = None
    body.company_nip = None
    body.company_regon = None
    body.company_bank = None
    body.company_iban = None
    body.company_bic = None
    body.company_email = None
    body.additional_fields_template = None


def apply_warehouse_series_rules(body: DocumentSeriesBase) -> None:
    """Enforce warehouse subtype capabilities and strip unsupported configuration."""
    if str(body.type).strip().upper() != "WAREHOUSE":
        return

    cap = warehouse_capabilities_for(str(body.subtype))
    if cap is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported warehouse subtype {body.subtype!r}.",
        )

    _clear_sale_only_fields(body)
    body.warehouse_effect = physical_effect_for_warehouse_subtype(str(body.subtype))

    if not cap.show_collective_return_receipt:
        body.collective_return_receipt = False

    if not cap.show_email_notification:
        body.email_notification_enabled = False

    if not cap.show_print_template_preset:
        body.print_template_id = None
        body.print_template = ""
    elif body.print_template_id is None and not (body.print_template or "").strip():
        if cap.default_print_template_id is not None:
            body.print_template_id = cap.default_print_template_id

    if not cap.show_document_template:
        body.document_template_version_id = None
        body.document_template_variant_code = None
