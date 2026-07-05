import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import type { MaterialProductionStatus } from "@/api/productionPlanningApi";
import { MATERIAL_STATUS_DESCRIPTION } from "@/api/productionShortageApi";

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
    icon: XCircle,
    className: "bg-rose-50 text-rose-800 ring-rose-200",
  },
};

type Props = {
  status: MaterialProductionStatus;
  description?: string | null;
  producibleNow?: number;
  waitingQty?: number;
  limitingComponentName?: string | null;
  compact?: boolean;
};

export function MaterialProductionStatusBadge({
  status,
  description,
  producibleNow,
  waitingQty,
  limitingComponentName,
  compact,
}: Props) {
  const cfg = CONFIG[status] ?? CONFIG.OK;
  const Icon = cfg.icon;
  const desc = description ?? MATERIAL_STATUS_DESCRIPTION[status];

  return (
    <div className="max-w-[180px] space-y-1">
      <span
        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${cfg.className}`}
      >
        <Icon className="h-3 w-3" aria-hidden />
        {cfg.label}
      </span>
      {!compact ? (
        <>
          <p className="text-[10px] leading-snug text-slate-600">{desc}</p>
          {status === "PARTIAL" && producibleNow != null && waitingQty != null ? (
            <p className="text-[10px] font-semibold text-amber-800">
              Teraz: {producibleNow} szt. · oczekuje: {waitingQty} szt.
            </p>
          ) : null}
          {limitingComponentName && status !== "OK" ? (
            <p className="text-[10px] text-slate-500">Ogranicza: {limitingComponentName}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
