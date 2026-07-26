import { fetchPrintingDefaults } from "../../api/printingApi";
import type { PrintMethodKind } from "./printMethodTypes";

/**
 * True when Cloud Print has a configured default printer for the kind.
 * A4 documents / production cards → a4_printer_id.
 */
export async function hasDefaultCloudPrinter(
  tenantId: number,
  warehouseId?: number | null,
  kind: PrintMethodKind = "a4",
): Promise<boolean> {
  try {
    const defaults = await fetchPrintingDefaults(tenantId, warehouseId);
    if (kind === "label") return defaults.label_printer_id != null;
    if (kind === "receipt") return defaults.receipt_printer_id != null;
    return defaults.a4_printer_id != null;
  } catch {
    return false;
  }
}
