import { WMS_TERMINAL_LABEL } from "@/components/wms/execution/wmsLayoutTokens";
import {
  PRODUCTION_KIND_LABEL,
  type ProductionExecutionKind,
} from "@/modules/production/productionExecutionTypes";
import { operationalBadgeBase, operationalBadgeNeutralClass } from "@/components/operational/operationalSemanticBadges";

type Accent = "amber" | "blue" | "emerald";

const ACCENT_STRIP: Record<Accent, string> = {
  amber: "bg-amber-400",
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
};

type Props = {
  kind?: ProductionExecutionKind;
  label: string;
  number: string;
  productLine?: string;
  quantity?: number | string;
  quantitySuffix?: string;
  accent?: Accent;
};

/** Active job context bar — batch or MO. */
export function WmsProductionActiveBatchBar({
  kind,
  label,
  number,
  productLine,
  quantity,
  quantitySuffix = "szt.",
  accent = "amber",
}: Props) {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`absolute bottom-0 left-0 top-0 w-1 ${ACCENT_STRIP[accent]}`} aria-hidden />
      <div className="pl-3">
        {kind ? (
          <span className={`${operationalBadgeBase} ${operationalBadgeNeutralClass} mb-2 inline-flex text-[10px] uppercase tracking-wide`}>
            {PRODUCTION_KIND_LABEL[kind]}
          </span>
        ) : null}
        <p className={WMS_TERMINAL_LABEL}>{label}</p>
        <p className="mt-1 font-mono text-2xl font-black text-slate-900">{number}</p>
        {productLine ? <p className="mt-2 text-base font-semibold text-slate-800">{productLine}</p> : null}
        {quantity != null ? (
          <p className="mt-1 text-3xl font-black tabular-nums text-slate-900">
            {quantity}
            <span className="ml-1.5 text-sm font-semibold text-slate-500">{quantitySuffix}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
