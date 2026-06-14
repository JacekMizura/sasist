import { ProductLikeSection } from "../../components/catalog";
import { isOnDemandAssembly, isStockProduction, type BundleOperationalMode } from "../Production/bundleOperationalTypes";
import { AssemblyComponentsTable } from "../Production/components/AssemblyComponentsTable";
import type { BundleComponentRow, ProductSummary } from "./bundleEditTypes";
import { BundleStockProductionWarehousePanel } from "./components/BundleStockProductionWarehousePanel";

type Props = {
  tenantId: number;
  rows: BundleComponentRow[];
  productCache: Record<number, ProductSummary>;
  bundleAvailability: number | null;
  operationalMode: BundleOperationalMode;
  linkedProductId: number | null;
};

export function BundleWarehouseTab({
  tenantId,
  rows,
  productCache,
  bundleAvailability,
  operationalMode,
  linkedProductId,
}: Props) {
  if (isStockProduction(operationalMode)) {
    return (
      <div className="w-full max-w-5xl space-y-8">
        <BundleStockProductionWarehousePanel tenantId={tenantId} linkedProductId={linkedProductId} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl space-y-8">
      <ProductLikeSection title="Dostępność kompletacji">
        <p className="mb-4 text-sm text-slate-600">
          Stan wyliczany ze składników. Towar nie ma własnych lokalizacji magazynowych — kompletacja następuje przy
          realizacji zamówienia.
        </p>
        {bundleAvailability != null ? (
          <p className="text-sm text-slate-800">
            Maksymalnie można skompletować:{" "}
            <span className="text-2xl font-bold tabular-nums text-slate-900">{bundleAvailability} zestawów</span>
          </p>
        ) : (
          <p className="text-sm text-slate-500">Dodaj składniki w zakładce Produkty, aby wyliczyć dostępność.</p>
        )}
      </ProductLikeSection>

      {isOnDemandAssembly(operationalMode) ? (
        <ProductLikeSection title="Składniki — dostępność">
          <AssemblyComponentsTable
            rows={rows}
            productCache={productCache}
            maxBundles={bundleAvailability}
            showMaxSummary={false}
          />
        </ProductLikeSection>
      ) : null}
    </div>
  );
}
