import { ScanLine, User } from "lucide-react";
import type { ExecutionActiveContext } from "../../../context/WarehouseExecutionContext";
import { BrakiWorkstreamPill } from "../../../pages/wms/brakiWorkstreamUi";
import { WMS_UI, relocationTargetRowLabel } from "../../../pages/wms/wmsTerminology";
import { normalizeOperationContext } from "./activeOperationContext";
import { WMS_OPERATIONAL_CONTAINER, WMS_WORKFLOW_BAR_SHELL } from "./wmsLayoutTokens";

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

type Props = {
  context: ExecutionActiveContext | null | undefined;
  className?: string;
  /** Gdy true — karta w normalnym flow strony (Braki, hub), nie pasek w shellu. */
  inline?: boolean;
};

/**
 * Compact operational context for all WMS execution screens.
 * Light surfaces — same visual system as ScanExecutionShell / operational pages.
 */
export function ActiveOperationContextBar({ context, className = "", inline = false }: Props) {
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
  if (ctx.brakiStageLabel) {
    rows.push({ label: "Etap braków", value: ctx.brakiStageLabel });
  }

  const ws = ctx.brakiWorkstreams;
  const isBraki = (ctx.operationType ?? "").toUpperCase().includes("BRAKI");

  const shellClass = inline
    ? "rounded-xl border border-slate-200 bg-slate-50/80"
    : WMS_WORKFLOW_BAR_SHELL;

  return (
    <div className={`${shellClass} ${className}`} data-wms-active-operation-context>
      <div className={inline ? "px-4 py-3" : `${WMS_OPERATIONAL_CONTAINER} py-2.5`}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {ctx.operationType}
          </p>
          {ctx.priorityLabel ? (
            <span className="rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-800">
              {ctx.priorityLabel}
            </span>
          ) : null}
        </div>

        {rows.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {rows.map((row) => (
              <p key={row.label} className="text-sm leading-snug text-slate-700">
                <span className="font-medium text-slate-500">{row.label}:</span>{" "}
                <span className="font-semibold text-slate-900">{row.value}</span>
              </p>
            ))}
          </div>
        ) : null}

        {isBraki && ws ? (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
            <BrakiWorkstreamPill label="Zebrane" count={ws.collected_line_count ?? 0} tone="emerald" />
            <BrakiWorkstreamPill label="Dogrywka" count={ws.pick_line_count ?? 0} tone="amber" />
            <BrakiWorkstreamPill
              label="Rozlokowanie"
              count={ws.relocation_line_count ?? 0}
              tone="indigo"
            />
            <BrakiWorkstreamPill
              label="Do pakowania"
              count={ws.packing_ready_line_count ?? 0}
              tone="blue"
            />
          </div>
        ) : null}

        {isBraki && ws?.has_oms_pending ? (
          <div className="mt-2">
            <BrakiWorkstreamPill
              label="Decyzja OMS"
              count={ws.oms_line_count ?? 0}
              tone="red"
            />
          </div>
        ) : null}

        {(ctx.currentStep || ctx.operatorName) && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
            {ctx.currentStep ? (
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-800">
                {isBraki ? ctx.currentStep : `Krok: ${ctx.currentStep}`}
              </span>
            ) : null}
            {ctx.operatorName ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                <User size={12} />
                {ctx.operatorName}
              </span>
            ) : null}
          </div>
        )}

        {ctx.scanHint ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <ScanLine size={14} className="shrink-0 text-slate-400" />
            {ctx.scanHint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
