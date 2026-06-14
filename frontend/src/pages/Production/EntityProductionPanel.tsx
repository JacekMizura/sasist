import { ProductLikeSection, productLikeFieldLabelClass, productLikeInputClass } from "../../components/catalog";
import type { BundleComponentRow, ProductSummary } from "../Assortment/bundleEditTypes";
import { ProductManufacturingPanel } from "./ProductManufacturingPanel";
import { AssemblyComponentsTable } from "./components/AssemblyComponentsTable";
import {
  BUNDLE_FULFILLMENT_LABEL,
  BUNDLE_STOCK_MODE_LABEL,
  type BundleFulfillmentMode,
  type BundleStockMode,
} from "./bundleOperationalTypes";

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
  fulfillmentMode: BundleFulfillmentMode;
  stockMode: BundleStockMode;
  linkedProductId: number | null;
  onFulfillmentModeChange: (mode: BundleFulfillmentMode) => void;
  onStockModeChange: (mode: BundleStockMode) => void;
  onLinkedProductIdChange: (id: number | null) => void;
  rows: BundleComponentRow[];
  productCache: Record<number, ProductSummary>;
  bundleAvailability: number | null;
};

export type EntityProductionPanelProps = ProductProps | BundleProps;

function RadioOption<T extends string>({
  name,
  value,
  current,
  label,
  description,
  onChange,
}: {
  name: string;
  value: T;
  current: T;
  label: string;
  description?: string;
  onChange: (v: T) => void;
}) {
  const checked = current === value;
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-lg border px-4 py-3 transition-colors ${
        checked ? "border-blue-300 bg-blue-50/60" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <input
        type="radio"
        name={name}
        className="mt-0.5 h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
        checked={checked}
        onChange={() => onChange(value)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-slate-600">{description}</span> : null}
      </span>
    </label>
  );
}

/**
 * Wspólny panel Produkcja — produkt (receptura) lub zestaw (kompletacja / produkcja).
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

  const {
    tenantId,
    isNew,
    bundleName,
    fulfillmentMode,
    stockMode,
    linkedProductId,
    onFulfillmentModeChange,
    onStockModeChange,
    onLinkedProductIdChange,
    rows,
    productCache,
    bundleAvailability,
  } = props;

  const fieldLabel = productLikeFieldLabelClass;
  const inputClass = productLikeInputClass;

  if (isNew) {
    return (
      <p className="text-sm text-slate-500">
        Zapisz zestaw, aby skonfigurować sposób realizacji i recepturę produkcyjną.
      </p>
    );
  }

  return (
    <div className="w-full max-w-5xl space-y-10">
      <ProductLikeSection title="Sposób realizacji">
        <div className="grid gap-3 sm:grid-cols-2">
          <RadioOption
            name="bundle-fulfillment"
            value="assembly"
            current={fulfillmentMode}
            label={BUNDLE_FULFILLMENT_LABEL.assembly}
            description="Złożenie istniejących produktów ze składników zestawu."
            onChange={onFulfillmentModeChange}
          />
          <RadioOption
            name="bundle-fulfillment"
            value="manufacturing"
            current={fulfillmentMode}
            label={BUNDLE_FULFILLMENT_LABEL.manufacturing}
            description="Powstaje na produkcji jak zwykły wyrób (receptura BOM)."
            onChange={onFulfillmentModeChange}
          />
        </div>
      </ProductLikeSection>

      <ProductLikeSection title="Zarządzanie stanem">
        <div className="grid gap-3 sm:grid-cols-2">
          <RadioOption
            name="bundle-stock"
            value="virtual"
            current={stockMode}
            label={BUNDLE_STOCK_MODE_LABEL.virtual}
            description="Stan wyliczany ze składników — bez własnych pozycji magazynowych."
            onChange={onStockModeChange}
          />
          <RadioOption
            name="bundle-stock"
            value="physical"
            current={stockMode}
            label={BUNDLE_STOCK_MODE_LABEL.physical}
            description="Stan przechowywany w magazynie (PZ/WZ/MM jak produkt)."
            onChange={onStockModeChange}
          />
        </div>
        {stockMode === "physical" ? (
          <div className="mt-4 max-w-xs">
            <label className={fieldLabel}>Powiązany produkt magazynowy (ID)</label>
            <input
              type="text"
              inputMode="numeric"
              className={inputClass}
              placeholder="ID produktu SKU w magazynie"
              value={linkedProductId ?? ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                onLinkedProductIdChange(digits ? parseInt(digits, 10) : null);
              }}
            />
            <p className="mt-1 text-xs text-slate-500">
              Produkt reprezentujący gotowy zestaw w magazynie (wymagany dla stanu fizycznego i produkcji).
            </p>
          </div>
        ) : null}
      </ProductLikeSection>

      {fulfillmentMode === "assembly" ? (
        <ProductLikeSection title="Składniki zestawu — kompletacja">
          <p className="mb-4 text-sm text-slate-600">
            Dostępność kompletacji = minimum z ilorazów: stan składnika ÷ ilość w zestawie.
          </p>
          <AssemblyComponentsTable
            rows={rows}
            productCache={productCache}
            maxBundles={bundleAvailability}
          />
        </ProductLikeSection>
      ) : linkedProductId != null && linkedProductId > 0 ? (
        <ProductManufacturingPanel
          tenantId={tenantId}
          productId={linkedProductId}
          productName={bundleName.trim() || `Zestaw`}
        />
      ) : (
        <ProductLikeSection title="Receptura produkcyjna">
          <p className="text-sm text-slate-600">
            Tryb produkcji wymaga powiązanego produktu magazynowego. Ustaw ID produktu w sekcji „Zarządzanie stanem”
            (zestaw fizyczny), aby korzystać z tej samej receptury co produkt.
          </p>
        </ProductLikeSection>
      )}
    </div>
  );
}
