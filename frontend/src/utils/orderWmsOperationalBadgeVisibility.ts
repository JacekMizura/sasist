import { normalizeWmsWorkflowPhase } from "./wmsWorkflowPhasePresentation";

/**
 * Badge WMS na liście / w nagłówku tylko przy realnych sygnałach operacyjnych.
 * Backend nie zwraca już sztucznego TO_PICK dla zamówień poza przepływem — ta funkcja to dodatkowa ochrona (stare cache, brak fazy).
 */
export function shouldShowOrderWmsOperationalBadge(input: {
  workflowPhase?: string | null;
  packedAtIso?: string | null;
  missingLineCount?: number | null;
}): boolean {
  if ((input.packedAtIso ?? "").trim()) return true;
  if ((input.missingLineCount ?? 0) > 0) return true;
  const code = normalizeWmsWorkflowPhase(input.workflowPhase);
  if (!code) return false;
  if (code === "TO_PICK") return false;
  return true;
}
