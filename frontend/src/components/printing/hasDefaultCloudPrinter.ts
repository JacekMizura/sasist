import { fetchCloudPrintCapability } from "../../api/printingApi";
import type { CloudPrintCapabilityRead } from "../../types/printing";
import type { PrintMethodKind } from "./printMethodTypes";

export const NO_ACTIVE_AGENT_USER_MESSAGE =
  "Brak aktywnego Sasist Agent na stanowisku.\nUruchom Agenta na komputerze przypisanym w Ustawienia WMS → Stanowiska.";

export type CloudPrintCapability = CloudPrintCapabilityRead;

/**
 * Sasist Agent is usable when the assigned workstation has an online agent
 * and a valid printer mapping for the kind. Does not use legacy PrintingDefault.
 */
export async function getCloudPrintCapability(
  tenantId: number,
  warehouseId?: number | null,
  kind: PrintMethodKind = "a4",
  workstationId?: number | null,
): Promise<CloudPrintCapability> {
  try {
    return await fetchCloudPrintCapability(tenantId, { warehouseId, kind, workstationId });
  } catch {
    return {
      kind,
      ready: false,
      reason: "NO_ACTIVE_AGENT",
      printer_id: null,
      has_online_agent: false,
      workstation_id: workstationId ?? null,
      message: NO_ACTIVE_AGENT_USER_MESSAGE,
    };
  }
}

/** @deprecated Prefer getCloudPrintCapability — checks workstation agent + mapping. */
export async function hasDefaultCloudPrinter(
  tenantId: number,
  warehouseId?: number | null,
  kind: PrintMethodKind = "a4",
  workstationId?: number | null,
): Promise<boolean> {
  const cap = await getCloudPrintCapability(tenantId, warehouseId, kind, workstationId);
  return cap.ready;
}

export function cloudPrintUnavailableMessage(cap: CloudPrintCapability): string {
  if (cap.message?.trim()) return cap.message.trim();
  if (cap.reason === "NO_ACTIVE_AGENT" || (!cap.has_online_agent && !cap.ready)) {
    return NO_ACTIVE_AGENT_USER_MESSAGE;
  }
  if (cap.reason === "AGENT_OFFLINE") {
    return "Sasist Agent przypisany do stanowiska jest offline. Uruchom Agenta na komputerze stanowiska.";
  }
  if (cap.reason === "NO_WORKSTATION") {
    return (
      cap.message?.trim() ||
      "Wybierz stanowisko, aby drukować przez Sasist Agent."
    );
  }
  if (cap.reason === "NO_WORKSTATION_AGENT") {
    return "Stanowisko nie ma przypisanego Sasist Agent. Połącz komputer w Ustawienia WMS → Stanowiska.";
  }
  if (cap.reason === "NO_WORKSTATION_MAPPING" || cap.reason === "NO_DEFAULT_PRINTER") {
    return "Brak mapowania drukarki na stanowisku. Ustaw mapowanie w Ustawienia WMS → Stanowiska.";
  }
  if (cap.reason === "PRINTER_INACTIVE" || cap.reason === "PRINTER_MISSING") {
    return cap.message || "Drukarka stanowiska jest niedostępna.";
  }
  return "Sasist Agent jest teraz niedostępny.";
}
