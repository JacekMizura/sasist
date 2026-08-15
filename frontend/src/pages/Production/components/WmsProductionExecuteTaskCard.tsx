import { useState } from "react";
import { Check } from "lucide-react";

import type { FinishedGoodsIdentityBody } from "@/api/productionApi";
import type { ProductionTerminalDisplaySettings } from "@/api/wmsProductionSettingsApi";
import type { UnifiedExecutionLine } from "@/modules/production/productionExecutionTypes";
import { WmsProductTaskCard } from "@/components/wms/WmsProductTaskCard";
import { WMS_TERMINAL_LABEL } from "@/components/wms/execution/wmsLayoutTokens";
import { formatProductionQuantity } from "../productionUi";

type Props = {
  index: number;
  line: UnifiedExecutionLine;
  display: ProductionTerminalDisplaySettings;
  expanded: boolean;
  done: boolean;
  busy: boolean;
  traceabilityEnabled: boolean;
  onToggle: () => void;
  onAddQty: (add: number, identity: FinishedGoodsIdentityBody) => void;
};

function fmtQty(n: number): string {
  return formatProductionQuantity(n);
}

export function WmsProductionExecuteTaskCard({
  index,
  line,
  display,
  expanded,
  done,
  busy,
  traceabilityEnabled,
  onToggle,
  onAddQty,
}: Props) {
  const remaining = Math.max(0, line.plannedQuantity - line.completedQuantity);
  const [fgBatchNumber, setFgBatchNumber] = useState("");
  const [fgExpiryDate, setFgExpiryDate] = useState("");
  const [fgSerials, setFgSerials] = useState("");
  const identity = (): FinishedGoodsIdentityBody => ({
    fg_batch_number: fgBatchNumber.trim() || null,
    fg_expiry_date: fgExpiryDate || null,
    fg_serial_numbers: fgSerials.split(/[\n,;]+/).map((v) => v.trim()).filter(Boolean),
  });

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
        {traceabilityEnabled ? (
          <details className="mb-4 rounded-xl border border-teal-200 bg-teal-50/40 p-3">
            <summary className="cursor-pointer text-sm font-bold text-teal-900">Identyfikowalność wyrobu</summary>
            <div className="mt-3 grid gap-3">
              <label className="text-xs font-semibold text-slate-600">
                Numer partii (LOT)
                <input value={fgBatchNumber} onChange={(e) => setFgBatchNumber(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Data ważności
                <input type="date" value={fgExpiryDate} onChange={(e) => setFgExpiryDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Numery seryjne (SN)
                <textarea value={fgSerials} onChange={(e) => setFgSerials(e.target.value)} rows={3} placeholder="Jeden numer w wierszu" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
              </label>
            </div>
          </details>
        ) : null}
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            disabled={busy || remaining <= 0}
            data-wms-card-no-nav=""
            onClick={() => onAddQty(1, identity())}
            className="rounded-xl bg-slate-900 py-4 text-xl font-black text-white hover:bg-slate-800 disabled:opacity-40"
          >
            +1
          </button>
          <button
            type="button"
            disabled={busy || remaining <= 0}
            data-wms-card-no-nav=""
            onClick={() => onAddQty(Math.min(5, remaining), identity())}
            className="rounded-xl bg-slate-700 py-4 text-xl font-black text-white hover:bg-slate-600 disabled:opacity-40"
          >
            +5
          </button>
          <button
            type="button"
            disabled={busy || remaining <= 0}
            data-wms-card-no-nav=""
            onClick={() => onAddQty(remaining, identity())}
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
