import { Check } from "lucide-react";

import { inventoryDocumentStatusLabel, inventoryReportStatusLabel } from "../../inventoryCountUiLabels";

type Props = {
  /** Backend document status code or Polish label / report status */
  status: string;
  variant?: "document" | "report";
};

/** Status pill — pixel match uploaded mockup. */
export default function InventoryStatusBadge({ status, variant = "document" }: Props) {
  const label = variant === "report" ? inventoryReportStatusLabel(status) : inventoryDocumentStatusLabel(status);

  if (label === "W trakcie" || status === "in_progress") {
    return (
      <span className="mb-1 inline-flex items-center rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
        W trakcie
      </span>
    );
  }

  if (label === "Gotowy" || status === "ready") {
    return (
      <span className="inline-flex items-center text-xs font-medium text-emerald-600">
        <Check className="mr-1 h-3 w-3" />
        Gotowy
      </span>
    );
  }

  if (label === "Do zatwierdzenia" || status === "awaiting_approval") {
    return (
      <span className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
        Do zatwierdzenia
      </span>
    );
  }

  if (label === "Zatwierdzona" || status === "approved") {
    return (
      <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        Zatwierdzona
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600">
      {label}
    </span>
  );
}
