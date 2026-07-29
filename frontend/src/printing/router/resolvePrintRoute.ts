import { packingSessionWorkstationId } from "../../pages/wms/wmsPackingSession";
import { fetchPrintingAgents, fetchPrintingWarehouseSettings } from "../../api/printingApi";
import { fetchWorkstationPrinters } from "../../api/wmsWorkstationsApi";
import { trackFallbackReason } from "./telemetry";
import type { PrintFormat, PrintRouteDecision, ResolvePrintRouteInput } from "./types";

function normalizeFormats(list: string[] | undefined | null): string[] {
  if (!Array.isArray(list)) return [];
  return list.map((f) => String(f).trim().toLowerCase()).filter(Boolean);
}

function printTypeForKind(kind: "a4" | "label" | "receipt"): string {
  if (kind === "label") return "labels";
  if (kind === "receipt") return "other";
  return "invoice";
}

async function resolveWorkstationMappedPrinterId(
  tenantId: number,
  workstationId: number,
  printerKind: "a4" | "label" | "receipt",
): Promise<number | null> {
  try {
    const config = await fetchWorkstationPrinters(tenantId, workstationId);
    const printType = printTypeForKind(printerKind);
    const mapped = config.mappings.find((m) => m.print_type === printType);
    const id = mapped?.agent_printer_id;
    return id != null && id >= 1 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Resolve Agent print route from packing-session workstation mapping only.
 * No auth/me, PrintingDefaults, QZ, or silent browser repair.
 */
export async function resolvePrintRoute(input: ResolvePrintRouteInput): Promise<PrintRouteDecision> {
  const gateFormat: PrintFormat = input.gateFormat ?? "zpl";
  const jobFormat: PrintFormat = input.jobFormat ?? "pdf";
  const printerKind = input.printerKind ?? "label";
  const warehouseId = input.warehouseId ?? null;
  // Sole SSOT — ignore input.workstationId overrides.
  const workstationId = packingSessionWorkstationId();

  const base = (partial: Partial<PrintRouteDecision>): PrintRouteDecision => ({
    transport: "browser",
    gateFormat,
    jobFormat,
    preferSasistAgent: true,
    agentId: null,
    printerId: null,
    fallbackReason: null,
    supportedFormats: [],
    ...partial,
  });

  if (warehouseId == null || warehouseId <= 0) {
    const decision = base({ fallbackReason: "no_warehouse" });
    trackFallbackReason(decision.fallbackReason);
    return decision;
  }

  if (workstationId == null) {
    const decision = base({ fallbackReason: "no_workstation" });
    trackFallbackReason(decision.fallbackReason);
    return decision;
  }

  try {
    const settings = await fetchPrintingWarehouseSettings(input.tenantId, warehouseId);
    if (!settings.prefer_sasist_agent) {
      const decision = base({ preferSasistAgent: false, fallbackReason: "flag_off" });
      trackFallbackReason("flag_off");
      return decision;
    }
  } catch {
    /* prefer agent by default when settings unavailable */
  }

  let agents: Awaited<ReturnType<typeof fetchPrintingAgents>> = [];
  try {
    agents = await fetchPrintingAgents(input.tenantId, warehouseId);
  } catch {
    agents = [];
  }

  const online = agents.filter((a) => a.is_online);
  if (online.length === 0) {
    const decision = base({ fallbackReason: "no_online_agent" });
    trackFallbackReason(decision.fallbackReason);
    return decision;
  }

  const withGate = online.find((a) => normalizeFormats(a.supported_formats).includes(gateFormat));
  if (!withGate) {
    const decision = base({
      fallbackReason: "unsupported_capability",
      supportedFormats: normalizeFormats(online[0]?.supported_formats),
    });
    trackFallbackReason("unsupported_capability");
    return decision;
  }

  const formats = normalizeFormats(withGate.supported_formats);
  if (!formats.includes(jobFormat)) {
    const decision = base({
      agentId: withGate.id,
      fallbackReason: "unsupported_capability",
      supportedFormats: formats,
    });
    trackFallbackReason("unsupported_capability");
    return decision;
  }

  const printerId = await resolveWorkstationMappedPrinterId(
    input.tenantId,
    workstationId,
    printerKind,
  );
  if (printerId == null) {
    const decision = base({
      agentId: withGate.id,
      fallbackReason: "no_workstation_mapping",
      supportedFormats: formats,
    });
    trackFallbackReason(decision.fallbackReason);
    return decision;
  }

  return base({
    transport: "agent",
    agentId: withGate.id,
    printerId,
    fallbackReason: null,
    supportedFormats: formats,
  });
}
