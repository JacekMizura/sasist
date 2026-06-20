import type { OrderAutomationChangeLogEntry } from "../types/orderAutomation";
import { ORDER_AUTOMATION_CONDITION_FIELDS } from "./orderAutomationCatalog";
import { MULTI_VALUE_CONDITION_FIELD_KEYS } from "./orderAutomationConditionUtils";

const MULTI_VALUE_FIELD_LABELS = new Set(
  ORDER_AUTOMATION_CONDITION_FIELDS.filter((f) => MULTI_VALUE_CONDITION_FIELD_KEYS.has(f.key)).map((f) => f.label),
);

export type ChangeLogDisplayDiff = {
  mode: "single" | "multi";
  added: string[];
  removed: string[];
  unchanged: string[];
};

/** Rozdziela zapis wartości z historii (lista etykiet po przecinku). */
export function parseChangeLogValues(raw: string | null | undefined): string[] {
  if (raw == null) return [];
  const t = raw.trim();
  if (!t || t === "—") return [];
  return t
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isMultiValueChangeField(fieldLabel: string): boolean {
  return MULTI_VALUE_FIELD_LABELS.has(fieldLabel);
}

/** Wylicza diff do prezentacji wpisu historii (added / removed / unchanged). */
export function computeChangeLogDisplayDiff(entry: OrderAutomationChangeLogEntry): ChangeLogDisplayDiff {
  const beforeParts = parseChangeLogValues(entry.before);
  const afterParts = parseChangeLogValues(entry.after);

  const beforeSet = new Set(beforeParts);
  const afterSet = new Set(afterParts);

  const added = afterParts.filter((v) => !beforeSet.has(v));
  const removed = beforeParts.filter((v) => !afterSet.has(v));
  const unchanged = beforeParts.filter((v) => afterSet.has(v));

  /** Zamiana pojedynczej wartości (np. status Nowe → Pakowanie, nazwa reguły). */
  const singleSwap =
    beforeParts.length <= 1 &&
    afterParts.length <= 1 &&
    (beforeParts.length === 0 ||
      afterParts.length === 0 ||
      beforeParts[0] !== afterParts[0]);

  if (singleSwap) {
    return {
      mode: "single",
      removed: beforeParts.length > 0 ? beforeParts : entry.before?.trim() ? [entry.before.trim()] : [],
      added: afterParts.length > 0 ? afterParts : entry.after?.trim() ? [entry.after.trim()] : [],
      unchanged: [],
    };
  }

  return { mode: "multi", added, removed, unchanged };
}
