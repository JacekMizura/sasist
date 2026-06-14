import { ProductLikeSection } from "../../components/catalog";
import {
  BUNDLE_FULFILLMENT_LABEL,
  type BundleFulfillmentMode,
  type BundleStockMode,
} from "../Production/bundleOperationalTypes";
import { AssemblyComponentsTable } from "../Production/components/AssemblyComponentsTable";
import type { BundleComponentRow, ProductSummary } from "./bundleEditTypes";

type Props = {
  rows: BundleComponentRow[];
  productCache: Record<number, ProductSummary>;
  bundleAvailability: number | null;
  fulfillmentMode: BundleFulfillmentMode;
  stockMode: BundleStockMode;
  physicalStock: number | null;
};

export function BundleWarehouseTab({
  rows,
  productCache,
  bundleAvailability,
  fulfillmentMode,
  stockMode,
  physicalStock,
}: Props) {
  const displayStock =
    stockMode === "physical" && physicalStock != null ? physicalStock : bundleAvailability;
  const stockLabel = stockMode === "physical" ? "Stan gotowych zestawów" : "Dostępność (ze składników)";
  const sourceLabel = BUNDLE_FULFILLMENT_LABEL[fulfillmentMode];

  return (
    <div className="w-full max-w-5xl space-y-8">
      <ProductLikeSection title={stockLabel}>
        <div className="flex flex-wrap gap-6 text-sm text-slate-700">
          <div>
            <span className="text-slate-500">Stan:</span>{" "}
            <span className="text-3xl font-bold tabular-nums text-slate-900">
              {displayStock != null ? `${displayStock} szt.` : "—"}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Źródło stanu:</span>{" "}
            <span className="font-semibold text-slate-900">{sourceLabel}</span>
          </div>
          <div>
            <span className="text-slate-500">Typ:</span>{" "}
            <span className="font-semibold text-slate-900">
              {stockMode === "physical" ? "Fizyczny zestaw magazynowy" : "Wirtualny zestaw sprzedażowy"}
            </span>
          </div>
        </div>
        {stockMode === "virtual" ? (
          <p className="mt-4 text-sm text-slate-600">
            Wirtualny zestaw — stan wyliczany ze składników (minimum z ilorazów stan ÷ ilość w zestawie).
          </p>
        ) : (
          <p className="mt-4 text-sm text-slate-600">
            Fizyczny zestaw — stan z powiązanego produktu magazynowego (PZ, WZ, MM, inwentaryzacja jak dla SKU).
          </p>
        )}
      </ProductLikeSection>

      {fulfillmentMode === "assembly" || stockMode === "virtual" ? (
        <ProductLikeSection title="Składniki — stany magazynowe">
          <AssemblyComponentsTable
            rows={rows}
            productCache={productCache}
            maxBundles={bundleAvailability}
            showMaxSummary={stockMode === "virtual"}
          />
        </ProductLikeSection>
      ) : null}
    </div>
  );
}
