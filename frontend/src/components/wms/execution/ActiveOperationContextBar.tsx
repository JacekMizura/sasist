import { ScanLine, User } from "lucide-react";
import type { ExecutionActiveContext } from "../../../context/WarehouseExecutionContext";
import { WMS_UI, relocationTargetRowLabel } from "../../../pages/wms/wmsTerminology";
import { normalizeOperationContext } from "./activeOperationContext";

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

type Props = {
  context: ExecutionActiveContext | null | undefined;
  className?: string;
};

/**
 * Unified sticky context for all WMS operational execution screens.
 * Separates picking tools (cart/basket) from logistics carriers (nośniki).
 */
export function ActiveOperationContextBar({ context, className = "" }: Props) {
  const ctx = normalizeOperationContext(context);
  if (!ctx) return null;

  const rows: { label: string; value: string }[] = [];

  if (ctx.orderNumber) {
    rows.push({ label: "Zamówienie", value: ctx.orderNumber });
  }
  if (ctx.pickingToolLabel) {
    rows.push({ label: WMS_UI.pickingTool, value: ctx.pickingToolLabel });
  }
  if (ctx.sourceLocation) {
    rows.push({ label: "Źródło", value: ctx.sourceLocation });
  }
  if (ctx.relocationTargetLabel && ctx.relocationTargetType) {
    rows.push({
      label: `Cel — ${relocationTargetRowLabel(ctx.relocationTargetType)}`,
      value: ctx.relocationTargetLabel,
    });
  }
  if (ctx.packagingLabel) {
    rows.push({ label: "Karton pakowy", value: ctx.packagingLabel });
  }
  if (ctx.remainingQty != null && Number.isFinite(ctx.remainingQty)) {
    rows.push({ label: "Pozostało", value: `${fmtQty(ctx.remainingQty)} szt.` });
  }

  return (
    <div
      className={`sticky top-0 z-[45] border-b border-indigo-300 bg-indigo-950 text-white shadow-lg ${className}`}
      data-wms-active-operation-context
    >
      <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-indigo-300">
          {ctx.operationType}
        </p>

        <div className="mt-2 space-y-1">
          {rows.map((row) => (
            <p key={row.label} className="text-sm leading-snug text-indigo-50">
              <span className="font-semibold text-indigo-200/90">{row.label}:</span>{" "}
              <span className="font-bold text-white">{row.value}</span>
            </p>
          ))}
        </div>

        {(ctx.currentStep || ctx.operatorName) && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-indigo-800/80 pt-2">
            {ctx.currentStep ? (
              <span className="rounded-lg bg-indigo-800 px-2.5 py-1 text-xs font-bold text-indigo-100">
                Krok: {ctx.currentStep}
              </span>
            ) : null}
            {ctx.operatorName ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-100">
                <User size={12} />
                {ctx.operatorName}
              </span>
            ) : null}
          </div>
        )}

        {ctx.scanHint ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-indigo-200">
            <ScanLine size={14} className="shrink-0" />
            {ctx.scanHint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
