import type { Printer } from "../../../types/printer";
import type { PrinterProfile } from "../../../types/printerProfiles";
import type { AgentPrinterRead } from "../../../types/printing";
import { resolveProfileAgentLinkStatus } from "./labelProfileAgentLink";

export function resolveLabelQueuePrinterSelection(
  selectedPrinter: Printer | null,
  agentPrinters: AgentPrinterRead[],
  profiles: PrinterProfile[] = [],
  legacyPrinters: Printer[] = [],
): { printer_id: number | null; printer_profile_id: number | null } {
  const printer_profile_id = selectedPrinter?.profile_id ?? selectedPrinter?.profile?.id ?? null;
  const linkStatus = resolveProfileAgentLinkStatus(
    selectedPrinter,
    legacyPrinters,
    agentPrinters,
    profiles,
  );
  if (linkStatus?.state === "linked") {
    return {
      printer_id: linkStatus.agentPrinterId,
      printer_profile_id,
    };
  }

  const systemName = selectedPrinter?.system_printer_name?.trim();
  if (!systemName) {
    return { printer_id: null, printer_profile_id };
  }
  const match = agentPrinters.find(
    (row) => row.is_active && row.system_name.trim() === systemName,
  );
  return {
    printer_id: match?.id ?? null,
    printer_profile_id,
  };
}
