import type { Printer } from "../../../types/printer";

export type ProfileOptionDisplay = {
  title: string;
  subtitle: string | null;
};

export function resolveSystemPrinterName(printer: Printer, legacyPrinters: Printer[]): string | null {
  const direct = printer.system_printer_name?.trim();
  if (direct) return direct;

  const profileId = printer.profile_id ?? printer.profile?.id;
  if (profileId == null) return null;

  const linked = legacyPrinters.find((row) => row.profile_id === profileId);
  return linked?.system_printer_name?.trim() || null;
}

export function formatProfileOptionDisplay(printer: Printer, legacyPrinters: Printer[]): ProfileOptionDisplay {
  const title = printer.profile?.name?.trim() || printer.name?.trim() || "Profil drukowania";
  const subtitle = resolveSystemPrinterName(printer, legacyPrinters);
  return { title, subtitle };
}

export function formatProfileSummaryLabel(printer: Printer | null | undefined, legacyPrinters: Printer[]): string {
  if (!printer) return "—";
  const { title, subtitle } = formatProfileOptionDisplay(printer, legacyPrinters);
  return subtitle ? `${title} (${subtitle})` : title;
}
