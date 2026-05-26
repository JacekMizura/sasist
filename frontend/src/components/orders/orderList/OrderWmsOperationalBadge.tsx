import {
  formatWmsPackedTooltip,
  normalizeWmsWorkflowPhase,
  wmsWorkflowPhasePresentation,
} from "../../../utils/wmsWorkflowPhasePresentation";

export type OrderWmsOperationalBadgeProps = {
  workflowPhase: string | null | undefined;
  packedAtIso?: string | null;
  packedByLabel?: string | null;
  className?: string;
};

/**
 * Stan operacyjny magazynu (nie płatność, nie status panelu OMS).
 */
export function OrderWmsOperationalBadge({
  workflowPhase,
  packedAtIso,
  packedByLabel,
  className,
}: OrderWmsOperationalBadgeProps) {
  const pres = wmsWorkflowPhasePresentation(workflowPhase);
  if (!pres) return null;

  const phase = normalizeWmsWorkflowPhase(workflowPhase);
  const packedExtra =
    phase === "PACKED" && packedAtIso ? formatWmsPackedTooltip(packedAtIso, packedByLabel) : null;
  const title = packedExtra ? `${pres.description}\n${packedExtra}` : pres.description;

  const Icon = pres.Icon;

  const rootClass = [
    "inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-tight",
    pres.pillClass,
    className?.trim(),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      title={title}
      className={rootClass}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={2} aria-hidden />
      <span className="min-w-0">{pres.label}</span>
    </span>
  );
}
