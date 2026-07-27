import {
  fetchPrintingAgents,
  fetchPrintingDefaults,
  fetchPrintingWarehouseSettings,
} from "../../api/printingApi";
import { isQzAvailable } from "../qzService";
import { trackFallbackReason } from "./telemetry";
import type { PrintFormat, PrintRouteDecision, ResolvePrintRouteInput } from "./types";

function normalizeFormats(list: string[] | undefined | null): string[] {
  if (!Array.isArray(list)) return [];
  return list.map((f) => String(f).trim().toLowerCase()).filter(Boolean);
}

/**
 * Fresh resolve on every call — disabling prefer_sasist_agent rolls back immediately.
 */
export async function resolvePrintRoute(input: ResolvePrintRouteInput): Promise<PrintRouteDecision> {
  const gateFormat: PrintFormat = input.gateFormat ?? "zpl";
  const jobFormat: PrintFormat = input.jobFormat ?? "pdf";
  const printerKind = input.printerKind ?? "label";
  const warehouseId = input.warehouseId ?? null;

  const base = (partial: Partial<PrintRouteDecision>): PrintRouteDecision => ({
    transport: "browser",
    gateFormat,
    jobFormat,
    preferSasistAgent: false,
    agentId: null,
    printerId: null,
    fallbackReason: null,
    supportedFormats: [],
    ...partial,
  });

  if (warehouseId == null || warehouseId <= 0) {
    const decision = base({
      transport: isQzAvailable() ? "qz" : "browser",
      fallbackReason: "no_warehouse",
    });
    trackFallbackReason(decision.fallbackReason);
    return decision;
  }

  let preferSasistAgent = false;
  try {
    const settings = await fetchPrintingWarehouseSettings(input.tenantId, warehouseId);
    preferSasistAgent = Boolean(settings.prefer_sasist_agent);
  } catch {
    preferSasistAgent = false;
  }

  if (!preferSasistAgent) {
    const decision = base({
      transport: isQzAvailable() ? "qz" : "browser",
      preferSasistAgent: false,
      fallbackReason: "flag_off",
    });
    trackFallbackReason("flag_off");
    return decision;
  }

  let agents: Awaited<ReturnType<typeof fetchPrintingAgents>> = [];
  try {
    agents = await fetchPrintingAgents(input.tenantId, warehouseId);
  } catch {
    agents = [];
  }

  const online = agents.filter((a) => a.is_online);
  if (online.length === 0) {
    const decision = base({
      transport: isQzAvailable() ? "qz" : "browser",
      preferSasistAgent: true,
      fallbackReason: "no_online_agent",
    });
    trackFallbackReason(decision.fallbackReason);
    return decision;
  }

  const withGate = online.find((a) => normalizeFormats(a.supported_formats).includes(gateFormat));
  if (!withGate) {
    const decision = base({
      transport: isQzAvailable() ? "qz" : "browser",
      preferSasistAgent: true,
      fallbackReason: "unsupported_capability",
      supportedFormats: normalizeFormats(online[0]?.supported_formats),
    });
    trackFallbackReason("unsupported_capability");
    return decision;
  }

  const formats = normalizeFormats(withGate.supported_formats);
  if (!formats.includes(jobFormat)) {
    const decision = base({
      transport: isQzAvailable() ? "qz" : "browser",
      preferSasistAgent: true,
      agentId: withGate.id,
      fallbackReason: "unsupported_capability",
      supportedFormats: formats,
    });
    trackFallbackReason("unsupported_capability");
    return decision;
  }

  let printerId: number | null = null;
  try {
    const defaults = await fetchPrintingDefaults(input.tenantId, warehouseId);
    if (printerKind === "label") printerId = defaults.label_printer_id;
    else if (printerKind === "receipt") printerId = defaults.receipt_printer_id;
    else printerId = defaults.a4_printer_id;
  } catch {
    printerId = null;
  }

  if (printerId == null) {
    const decision = base({
      transport: isQzAvailable() ? "qz" : "browser",
      preferSasistAgent: true,
      agentId: withGate.id,
      fallbackReason: "no_default_printer",
      supportedFormats: formats,
    });
    trackFallbackReason(decision.fallbackReason);
    return decision;
  }

  return base({
    transport: "agent",
    preferSasistAgent: true,
    agentId: withGate.id,
    printerId,
    fallbackReason: null,
    supportedFormats: formats,
  });
}
