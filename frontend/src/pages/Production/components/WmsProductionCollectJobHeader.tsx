import type { CollectionJobHeaderRead } from "@/api/productionApi";
import type { ProductionTerminalDisplaySettings } from "@/api/wmsProductionSettingsApi";
import {
  PRODUCTION_KIND_LABEL,
  type ProductionExecutionKind,
} from "@/modules/production/productionExecutionTypes";
import { WMS_TERMINAL_LABEL } from "@/components/wms/execution/wmsLayoutTokens";
import { WmsProductionProductIdentity } from "../display/WmsProductionProductIdentity";
import { formatTerminalQuantity } from "../display/productionTerminalDisplay";
import { ProgressBar } from "./ProgressBar";

type Props = {
  kind: ProductionExecutionKind;
  header: CollectionJobHeaderRead;
  display: ProductionTerminalDisplaySettings;
  collectedCount: number;
  totalCount: number;
};

/** Finished-good context for single-screen raw-material collecting. */
export function WmsProductionCollectJobHeader({
  kind,
  header,
  display,
  collectedCount,
  totalCount,
}: Props) {
  const primary = header.outputs[0];

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="absolute bottom-0 left-0 top-0 w-1 bg-amber-400" aria-hidden />
      <div className="space-y-4 pl-3">
        <div className="flex flex-wrap items-start gap-2">
          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-900">
            {PRODUCTION_KIND_LABEL[kind]}
          </span>
          <p className={WMS_TERMINAL_LABEL}>Zbieranie surowców</p>
        </div>
        <p className="font-mono text-2xl font-black text-slate-900">{header.job_number}</p>

        <div className="space-y-3">
          {header.outputs.map((out) => (
            <div key={out.product_id} className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Produkt końcowy</p>
              <WmsProductionProductIdentity
                display={display}
                product={{
                  name: out.product_name,
                  sku: out.product_sku,
                  ean: out.product_ean,
                  catalogNumber: out.product_catalog_number,
                  barcode: out.product_barcode,
                  imageUrl: out.product_image_url,
                  unit: out.product_unit,
                }}
                thumbSize="lg"
                nameClassName="text-xl font-bold leading-snug text-slate-900"
              >
                <p className="mt-2 text-3xl font-black tabular-nums text-slate-900">
                  {formatTerminalQuantity(out.planned_quantity, {
                    unit: out.product_unit,
                    showUnit: display.show_unit,
                  })}
                  <span className="ml-1 text-sm font-semibold text-slate-500">do wyprodukowania</span>
                </p>
              </WmsProductionProductIdentity>
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
