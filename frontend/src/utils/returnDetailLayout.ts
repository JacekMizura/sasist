import { RETURN_DETAIL_SECTION_IDS } from "../constants/returnModuleDetailSections";
import type { ReturnDetailLayoutDto, ReturnDetailSectionWidth } from "../types/returnModuleConfig";

/** Domyślny układ — bez Terminala WMS; prawa kolumna: etykieta → notatki → postęp → dziennik → dokumenty. */
export const DEFAULT_RETURN_DETAIL_LAYOUT: ReturnDetailLayoutDto = {
  left_column: [
    "returned_products",
    "damage_photos",
    "refund",
    "customer_data",
    "payment_data",
    "correspondence",
    "customer_stats",
    "prior_returns_history",
  ],
  right_column: [
    "return_status",
    "notes",
    "progress_bar",
    "decision_history",
    "attachments",
  ],
  section_widths: {},
};

const WIDTH_OK = new Set<string>(["full", "sidebar", "compact"]);

/**
 * Spójnie z edytorem konfiguratora: tylko znane id, bez duplikatów, brakujące dokładane na końcu lewej kolumny.
 */
export function normalizeReturnDetailLayout(layout: ReturnDetailLayoutDto | null | undefined): {
  left: string[];
  right: string[];
  sectionWidths: Partial<Record<string, ReturnDetailSectionWidth>>;
} {
  const allowed = new Set<string>(RETURN_DETAIL_SECTION_IDS as unknown as string[]);
  const seen = new Set<string>();
  const left: string[] = [];
  const right: string[] = [];
  const raw = layout ?? DEFAULT_RETURN_DETAIL_LAYOUT;
  for (const id of raw.left_column ?? []) {
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    left.push(id);
  }
  for (const id of raw.right_column ?? []) {
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    right.push(id);
  }
  for (const id of RETURN_DETAIL_SECTION_IDS) {
    if (!seen.has(id)) left.push(id);
  }
  const sectionWidths: Partial<Record<string, ReturnDetailSectionWidth>> = {};
  const rawSw = raw.section_widths ?? {};
  for (const sid of allowed) {
    const v = rawSw[sid];
    if (typeof v === "string" && WIDTH_OK.has(v)) {
      sectionWidths[sid] = v as ReturnDetailSectionWidth;
    }
  }
  return { left, right, sectionWidths };
}
