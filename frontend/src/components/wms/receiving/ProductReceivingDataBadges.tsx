import type { ProductReceivingValidation } from "../../../utils/validateRequiredProductData";

export function ProductReceivingDataBadges({
  validation,
  labels,
  className = "",
}: {
  validation?: ProductReceivingValidation | null;
  labels?: string[];
  className?: string;
}) {
  const items = labels ?? validation?.badgeLabels ?? [];
  if (!items.length) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {items.map((lb) => (
        <span
          key={lb}
          className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950"
        >
          {lb}
        </span>
      ))}
    </div>
  );
}
