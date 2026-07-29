/** Print profiles — FE mirror of backend.printing_profiles (how we print, not WMS modules). */

export type PrintProfile = "LABELS" | "DOCUMENTS" | "SHIPPING_LABELS" | "REPORTS";

export const PRINT_PROFILES: readonly PrintProfile[] = [
  "LABELS",
  "DOCUMENTS",
  "SHIPPING_LABELS",
  "REPORTS",
] as const;

export const PRINT_PROFILE_LABELS_PL: Record<PrintProfile, string> = {
  LABELS: "Etykiety",
  DOCUMENTS: "Dokumenty",
  SHIPPING_LABELS: "Listy przewozowe",
  REPORTS: "Raporty",
};

export const PRINT_PROFILE_ICONS: Record<PrintProfile, string> = {
  LABELS: "🏷️",
  DOCUMENTS: "📄",
  SHIPPING_LABELS: "🚚",
  REPORTS: "📊",
};

/** PrintMethodDialog kind → candidate profiles (first mapped wins). */
export function profilesForPrinterKind(kind: "a4" | "label" | "receipt"): PrintProfile[] {
  if (kind === "label") return ["LABELS", "SHIPPING_LABELS"];
  if (kind === "receipt") return ["DOCUMENTS"];
  return ["DOCUMENTS", "REPORTS"];
}

export function mappingProfileKey(m: {
  print_profile?: string | null;
  print_type?: string | null;
}): string {
  return String(m.print_profile || m.print_type || "").trim();
}
