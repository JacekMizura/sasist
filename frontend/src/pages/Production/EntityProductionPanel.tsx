import type { BundleComponentRow, ProductSummary } from "../Assortment/bundleEditTypes";
import { isStockProduction, type BundleOperationalMode } from "./bundleOperationalTypes";
import { ProductManufacturingPanel } from "./ProductManufacturingPanel";
import { BundleProductionPanel } from "../Assortment/components/BundleProductionPanel";

type ProductProps = {
  entityType: "product";
  tenantId: number;
  productId: number;
  productName: string;
  onChanged?: () => void;
};

type BundleProps = {
  entityType: "bundle";
  tenantId: number;
  isNew: boolean;
  bundleName: string;
  operationalMode: BundleOperationalMode;
  linkedProductId: number | null;
  rows: BundleComponentRow[];
  productCache: Record<number, ProductSummary>;
};

export type EntityProductionPanelProps = ProductProps | BundleProps;

/**
 * Wspólny panel Produkcja — produkt (pełny BOM ERP) lub zestaw produkowany na magazyn.
 */
export function EntityProductionPanel(props: EntityProductionPanelProps) {
  if (props.entityType === "product") {
    return (
      <ProductManufacturingPanel
        tenantId={props.tenantId}
        productId={props.productId}
        productName={props.productName}
        onChanged={props.onChanged}
      />
    );
  }

  const { tenantId, isNew, bundleName, operationalMode, linkedProductId, rows, productCache } = props;

  if (isNew) {
    return (
      <p className="text-sm text-slate-500">Zapisz zestaw, aby skonfigurować produkcję.</p>
    );
  }

  if (!isStockProduction(operationalMode)) {
    return null;
  }

  return (
    <BundleProductionPanel
      tenantId={tenantId}
      bundleName={bundleName}
      linkedProductId={linkedProductId}
      rows={rows}
      productCache={productCache}
    />
  );
}
