/**
 * @deprecated Prefer CarrierLabelPrintModal + POST /labels/carrier.
 * Kept as a no-op shim so accidental imports fail loudly in console.
 */
import type { WarehouseCarrierRead } from "../api/wmsCarrierApi";

export function openCarrierLabelPrint(
  _carrier: Pick<
    WarehouseCarrierRead,
    "code" | "barcode" | "name" | "is_mixed" | "current_location_code" | "sku_count" | "total_qty"
  >,
): void {
  console.warn(
    "[carrierLabelPrint] Deprecated HTML print stub. Use CarrierLabelPrintModal (template_type=carrier).",
  );
}
