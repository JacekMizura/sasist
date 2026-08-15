import { StatusBadge, type StatusTone } from "@/design-system";

import {
  productionSourceBadgeLabel,
  productionSourceTypeTone,
} from "../productionUi";

type Props = {
  kind?: "batch" | "order";
  sourceType?: string | null;
  className?: string;
};

function badgeTone(kind: "batch" | "order" | undefined, sourceType?: string | null): StatusTone {
  if (kind === "batch") return "neutral";
  return productionSourceTypeTone(sourceType);
}

/**
 * Compact source/type badge — labels from productionUi SSOT (PARTIA / ORDERS / PLANNING / MANUAL).
 * Do not invent parallel status enums here.
 */
export function ProductionSourceTypeBadge({ kind, sourceType, className = "" }: Props) {
  const label = productionSourceBadgeLabel({ kind, sourceType });
  return (
    <StatusBadge tone={badgeTone(kind, sourceType)} density="compact" className={className}>
      {label}
    </StatusBadge>
  );
}
