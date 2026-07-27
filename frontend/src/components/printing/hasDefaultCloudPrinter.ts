import { fetchCloudPrintCapability } from "../../api/printingApi";
import type { CloudPrintCapabilityRead } from "../../types/printing";
import type { PrintMethodKind } from "./printMethodTypes";

export const NO_ACTIVE_AGENT_USER_MESSAGE =
  "Brak aktywnego komputera z agentem drukowania.\nUruchom Sellasist Print Agent na jednym z komputerów.";

export type CloudPrintCapability = CloudPrintCapabilityRead;

/**
 * Cloud Print is usable only when a default printer is configured AND its agent is online.
 * A configured-but-offline default must NOT auto-queue jobs.
 */
export async function getCloudPrintCapability(
  tenantId: number,
  warehouseId?: number | null,
  kind: PrintMethodKind = "a4",
): Promise<CloudPrintCapability> {
  try {
    return await fetchCloudPrintCapability(tenantId, { warehouseId, kind });
  } catch {
    return {
      kind,
      ready: false,
      reason: "NO_ACTIVE_AGENT",
      printer_id: null,
      has_online_agent: false,
      message: NO_ACTIVE_AGENT_USER_MESSAGE,
    };
  }
}

/** @deprecated Prefer getCloudPrintCapability — checks agent online, not only default id. */
export async function hasDefaultCloudPrinter(
  tenantId: number,
  warehouseId?: number | null,
  kind: PrintMethodKind = "a4",
): Promise<boolean> {
  const cap = await getCloudPrintCapability(tenantId, warehouseId, kind);
  return cap.ready;
}

export function cloudPrintUnavailableMessage(cap: CloudPrintCapability): string {
  if (cap.reason === "NO_ACTIVE_AGENT" || (!cap.has_online_agent && !cap.ready)) {
    return NO_ACTIVE_AGENT_USER_MESSAGE;
  }
  if (cap.message?.trim()) return cap.message.trim();
  if (cap.reason === "AGENT_OFFLINE") {
    return "Domyślna drukarka jest przypisana do nieaktywnego agenta.";
  }
  if (cap.reason === "NO_DEFAULT_PRINTER") {
    return "Brak domyślnej drukarki Cloud Print. Ustaw ją w Ustawienia → Drukarki → Domyślne.";
  }
  if (cap.reason === "PRINTER_INACTIVE" || cap.reason === "PRINTER_MISSING") {
    return cap.message || "Domyślna drukarka Cloud Print jest niedostępna.";
  }
  return "Sasist Cloud Print jest teraz niedostępny.";
}
