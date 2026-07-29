import { fetchWorkstationsAvailableForMe } from "../../api/wmsWorkstationsApi";
import { packingSessionWorkstationId } from "../../pages/wms/wmsPackingSession";
import type { WorkstationListItem } from "../../types/wmsWorkstations";

export type PrintWorkstationResolution =
  | { kind: "session" | "auto"; workstationId: number; stations: WorkstationListItem[] }
  | { kind: "picker"; stations: WorkstationListItem[] }
  | { kind: "none"; stations: WorkstationListItem[] };

/**
 * Resolve workstation for Agent print:
 * - packing session (when active) wins
 * - else available-for-me → 1 auto / N picker / 0 none
 */
export async function resolvePrintWorkstation(
  tenantId: number,
  warehouseId?: number | null,
): Promise<PrintWorkstationResolution> {
  const session = packingSessionWorkstationId();
  if (session != null) {
    return { kind: "session", workstationId: session, stations: [] };
  }

  let list = await fetchWorkstationsAvailableForMe(tenantId);
  if (warehouseId != null && warehouseId >= 1) {
    list = list.filter((s) => s.warehouse_id === warehouseId);
  }
  if (list.length === 0) return { kind: "none", stations: [] };
  if (list.length === 1) return { kind: "auto", workstationId: list[0].id, stations: list };
  return { kind: "picker", stations: list };
}
