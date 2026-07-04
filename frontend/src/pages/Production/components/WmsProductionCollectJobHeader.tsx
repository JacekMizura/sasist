import type { CollectionJobHeaderRead } from "@/api/productionApi";
import {
  PRODUCTION_KIND_LABEL,
  type ProductionExecutionKind,
} from "@/modules/production/productionExecutionTypes";
import { WMS_TERMINAL_LABEL } from "@/components/wms/execution/wmsLayoutTokens";
import { ProductThumb } from "./ProductThumb";
import { ProgressBar } from "./ProgressBar";

type Props = {
  kind: ProductionExecutionKind;
  header: CollectionJobHeaderRead;
  collectedCount: number;
  totalCount: number;
};

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Finished-good context for single-screen raw-material collecting. */
export function WmsProductionCollectJobHeader({ kind, header, collectedCount, totalCount }: Props) {
  const primary = header.outputs[0];

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="absolute bottom-0 left-0 top-0 w-1 bg-amber-400" aria-hidden />
      <div className="space-y-4 pl-3">
        <div className="flex flex-wrap items-start gap-2">
          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
            {PRODUCTION_KIND_LABEL[kind]}
          </span>
          <p className={WMS_TERMINAL_LABEL}>Zbieranie surowców</p>
        </div>
        <p className="font-mono text-2xl font-black text-slate-900">{header.job_number}</p>

        <div className="space-y-3">
          {header.outputs.map((out) => (
            <div key={out.product_id} className="flex gap-4">
              <ProductThumb imageUrl={out.product_image_url} name={out.product_name} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Produkt końcowy</p>
                <p className="mt-1 text-xl font-bold leading-snug text-slate-900">{out.product_name}</p>
                {out.product_sku ? (
                  <p className="mt-1 font-mono text-sm text-slate-500">{out.product_sku}</p>
                ) : null}
                <p className="mt-2 text-3xl font-black tabular-nums text-slate-900">
                  {fmtQty(out.planned_quantity)}
                  <span className="ml-1 text-sm font-semibold text-slate-500">szt. do wyprodukowania</span>
                </p>
              </div>
            </div>
          ))}
        </div>

        {totalCount > 0 ? (
          <ProgressBar
            value={collectedCount}
            max={totalCount}
            label={`Pobrano składniki ${collectedCount} / ${totalCount}`}
            tone="amber"
          />
        ) : null}

        {!primary && header.outputs.length === 0 ? (
          <p className="text-sm text-slate-500">Brak danych produktu końcowego.</p>
        ) : null}
      </div>
    </div>
  );
}
