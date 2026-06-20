import { IMMEDIATE_ISSUE_LABEL, STATIONARY_SALE_TITLE } from "../components/directSales/directSalesTerminology";
import { shouldShowOrderWmsOperationalBadge } from "./orderWmsOperationalBadgeVisibility";
import { formatWmsPackedTooltip, normalizeWmsWorkflowPhase, wmsWorkflowPhasePresentation } from "./wmsWorkflowPhasePresentation";

/** Tekst pomocniczy do tooltipa — nie jest statusem procesu. */
export function buildOrderListDocumentContextTitle(input: {
  orderNumber?: string | number | null;
  orderId: number;
  orderChannel?: string | null;
  fulfillmentMode?: string | null;
  workflowPhase?: string | null;
  packedAtIso?: string | null;
  packedByLabel?: string | null;
  missingLineCount?: number | null;
}): string {
  const parts: string[] = [`Zamówienie #${input.orderNumber ?? input.orderId}`];
  const ch = String(input.orderChannel ?? "").toUpperCase();
  const fm = String(input.fulfillmentMode ?? "").toUpperCase();
  if (ch === "DIRECT_SALE") parts.push(STATIONARY_SALE_TITLE);
  if (fm === "IMMEDIATE") parts.push(IMMEDIATE_ISSUE_LABEL);

  if (
    shouldShowOrderWmsOperationalBadge({
      workflowPhase: input.workflowPhase,
      packedAtIso: input.packedAtIso,
      missingLineCount: input.missingLineCount,
    })
  ) {
    const pres = wmsWorkflowPhasePresentation(input.workflowPhase);
    if (pres) {
      const phase = normalizeWmsWorkflowPhase(input.workflowPhase);
      const packedExtra =
        phase === "PACKED" && input.packedAtIso
          ? formatWmsPackedTooltip(input.packedAtIso, input.packedByLabel)
          : null;
      parts.push(packedExtra ? `${pres.label} (${packedExtra})` : pres.label);
    }
  }

  return parts.join(" · ");
}
