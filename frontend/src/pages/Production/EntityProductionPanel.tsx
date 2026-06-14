import { ProductLikeSection } from "../../components/catalog";
import type { BundleComponentRow, ProductSummary } from "../Assortment/bundleEditTypes";
import { isStockProduction, type BundleOperationalMode } from "./bundleOperationalTypes";
import { ProductManufacturingPanel } from "./ProductManufacturingPanel";

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
};

export type EntityProductionPanelProps = ProductProps | BundleProps;

/**
 * Wspólny panel Produkcja — produkt (receptura) lub zestaw produkowany na magazyn.
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

  const { tenantId, isNew, bundleName, operationalMode, linkedProductId } = props;

  if (isNew) {
    return (
      <p className="text-sm text-slate-500">
        Zapisz zestaw, aby skonfigurować produkcję i recepturę.
      </p>
    );
  }

  if (!isStockProduction(operationalMode)) {
    return (
      <ProductLikeSection title="Produkcja">
        <p className="text-sm text-slate-600">
          Zakładka Produkcja dotyczy zestawów typu „Produkowany / konfekcjonowany na magazyn”. Zestawy kompletowane na
          zamówienie nie wymagają zleceń produkcyjnych — składniki pobierane są przy kompletacji.
        </p>
      </ProductLikeSection>
    );
  }

  if (linkedProductId != null && linkedProductId > 0) {
    return (
      <div className="w-full max-w-5xl space-y-6">
        <p className="text-sm text-slate-600">
          Zlecenia produkcyjne, receptura BOM, zużycie składników i historia produkcji — jak dla powiązanego produktu
          magazynowego.
        </p>
        <ProductManufacturingPanel
          tenantId={tenantId}
          productId={linkedProductId}
          productName={bundleName.trim() || "Zestaw"}
        />
      </div>
    );
  }

  return (
    <ProductLikeSection title="Produkcja">
      <p className="text-sm text-slate-600">
        Ustaw powiązany produkt magazynowy w sekcji „Typ realizacji zestawu”, aby korzystać z modułu produkcji (zlecenia,
        receptura, historia).
      </p>
    </ProductLikeSection>
  );
}
