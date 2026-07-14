import type { Printer } from "../../../types/printer";
import type { PrinterProfile } from "../../../types/printerProfiles";
import type { AgentPrinterRead } from "../../../types/printing";
import { resolveSystemPrinterName } from "./labelProfileDisplay";

export type ProfileAgentLinkStatus =
  | { state: "linked"; systemName: string; agentPrinterId: number }
  | { state: "missing_name"; profileName: string }
  | { state: "agent_missing"; systemName: string; profileName: string };

export function resolveProfileAgentLinkStatus(
  printer: Printer | null,
  legacyPrinters: Printer[],
  agentPrinters: AgentPrinterRead[],
  profiles: PrinterProfile[],
): ProfileAgentLinkStatus | null {
  if (!printer) return null;

  const profileId = printer.profile_id ?? printer.profile?.id ?? null;
  const profile = profileId != null ? profiles.find((row) => row.id === profileId) : null;
  const profileName = profile?.name?.trim() || printer.profile?.name?.trim() || printer.name?.trim() || "Profil drukowania";

  if (profile?.agent_printer_id != null) {
    const linked = agentPrinters.find(
      (row) => row.id === profile.agent_printer_id && row.is_active,
    );
    if (linked) {
      return {
        state: "linked",
        systemName: linked.system_name,
        agentPrinterId: linked.id,
      };
    }
  }

  const systemName = resolveSystemPrinterName(printer, legacyPrinters);
  if (!systemName) {
    return { state: "missing_name", profileName };
  }

  const match = agentPrinters.find(
    (row) => row.is_active && row.system_name.trim() === systemName,
  );
  if (match) {
    return {
      state: "linked",
      systemName: match.system_name,
      agentPrinterId: match.id,
    };
  }

  return { state: "agent_missing", systemName, profileName };
}

export function formatProfileAgentLinkMessage(status: ProfileAgentLinkStatus | null): string | null {
  if (!status) return null;
  if (status.state === "linked") {
    return `Fizyczna drukarka: ${status.systemName}`;
  }
  if (status.state === "missing_name") {
    return "Profil nie ma przypisanej drukarki systemowej.";
  }
  return `Profil wskazuje na „${status.systemName}”, ale agent nie zgłasza takiej drukarki.`;
}

export function isProfileAgentLinkBroken(status: ProfileAgentLinkStatus | null): boolean {
  return status?.state === "agent_missing" || status?.state === "missing_name";
}
