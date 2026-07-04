import { AlertTriangle, CheckCircle2 } from "lucide-react";

import type { MaterialProductionStatus } from "@/api/productionPlanningApi";

const CONFIG: Record<
  MaterialProductionStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  OK: {
    label: "Można produkować",
    icon: CheckCircle2,
    className: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  },
  PARTIAL: {
    label: "Produkcja częściowa",
    icon: AlertTriangle,
    className: "bg-amber-50 text-amber-900 ring-amber-200",
  },
  BLOCKED: {
    label: "Brak materiałów",
    icon: AlertTriangle,
    className: "bg-rose-50 text-rose-800 ring-rose-200",
  },
};

type Props = {
  status: MaterialProductionStatus;
  producibleNow?: number;
  waitingQty?: number;
  compact?: boolean;
};

export function MaterialProductionStatusBadge({
  status,
  producibleNow,
  waitingQty,
  compact,
}: Props) {
  const cfg = CONFIG[status] ?? CONFIG.OK;
  const Icon = cfg.icon;

  return (
    <div className="space-y-0.5">
      <span
        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${cfg.className}`}
      >
        <Icon className="h-3 w-3" aria-hidden />
        {cfg.label}
      </span>
      {!compact && status === "PARTIAL" && producibleNow != null && waitingQty != null ? (
        <p className="text-[10px] leading-tight text-amber-800">
          Teraz: {producibleNow} · oczekuje: {waitingQty}
        </p>
      ) : null}
    </div>
  );
}
