import { Check } from "lucide-react";

import type { ProductionTerminalDisplaySettings } from "@/api/wmsProductionSettingsApi";
import type { UnifiedExecutionLine } from "@/modules/production/productionExecutionTypes";
import { WmsProductTaskCard } from "@/components/wms/WmsProductTaskCard";
import { WMS_TERMINAL_LABEL } from "@/components/wms/execution/wmsLayoutTokens";

type Props = {
  index: number;
  line: UnifiedExecutionLine;
  display: ProductionTerminalDisplaySettings;
  expanded: boolean;
  done: boolean;
  busy: boolean;
  onToggle: () => void;
  onAddQty: (add: number) => void;
};

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function WmsProductionExecuteTaskCard({
  index,
  line,
  display,
  expanded,
  done,
  busy,
  onToggle,
  onAddQty,
}: Props) {
  const remaining = Math.max(0, line.plannedQuantity - line.completedQuantity);

  const summary = (
    <>
      {fmtQty(line.completedQuantity)} / {fmtQty(line.plannedQuantity)}
      {display.show_sku && line.productSku ? ` · ${line.productSku}` : ""}
    </>
  );

  const metaBody = (
    <>
      {display.show_sku && line.productSku ? (
        <p className="mt-1 font-mono text-sm text-slate-500">{line.productSku}</p>
      ) : null}
      <div className="mt-4">
        <p className={WMS_TERMINAL_LABEL}>Postęp</p>
        <p className="mt-1 text-3xl font-black tabular-nums text-slate-900">
          {fmtQty(line.completedQuantity)}
          <span className="text-xl font-bold text-slate-400"> / {fmtQty(line.plannedQuantity)}</span>
        </p>
      </div>
    </>
  );

  const actionFooter =
    !done && expanded ? (
      <div className="mt-4 border-t border-slate-100 pt-4">
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            disabled={busy || remaining <= 0}
            data-wms-card-no-nav=""
            onClick={() => onAddQty(1)}
            className="rounded-xl bg-slate-900 py-4 text-xl font-black text-white hover:bg-slate-800 disabled:opacity-40"
          >
            +1
          </button>
          <button
            type="button"
            disabled={busy || remaining <= 0}
            data-wms-card-no-nav=""
            onClick={() => onAddQty(5)}
            className="rounded-xl bg-slate-700 py-4 text-xl font-black text-white hover:bg-slate-600 disabled:opacity-40"
          >
            +5
          </button>
          <button
            type="button"
            disabled={busy || remaining <= 0}
            data-wms-card-no-nav=""
            onClick={() => onAddQty(remaining)}
            className="rounded-xl border border-emerald-300 bg-emerald-50 py-3 text-sm font-bold text-emerald-900 hover:bg-emerald-100 disabled:opacity-40"
          >
            Zakończ krok
          </button>
        </div>
      </div>
    ) : done ? (
      <p className="mt-4 inline-flex items-center gap-2 border-t border-slate-100 pt-4 text-sm font-bold text-emerald-700">
        <Check className="h-4 w-4" aria-hidden />
        Wyprodukowano {fmtQty(line.plannedQuantity)}
      </p>
    ) : null;

  return (
    <WmsProductTaskCard
      index={index}
      imageUrl={line.productImageUrl}
      title={line.productName}
      summary={summary}
      body={metaBody}
      footer={actionFooter}
      expanded={expanded}
      done={done}
      busy={busy}
      accent={done ? "emerald" : "amber"}
      onToggle={onToggle}
    />
  );
}
