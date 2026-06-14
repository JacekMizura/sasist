import { productLikeFieldLabelClass, productLikeInputClass, ProductLikeSection } from "../../../components/catalog";
import {
  BUNDLE_OPERATIONAL_MODE_DESCRIPTION,
  BUNDLE_OPERATIONAL_MODE_LABEL,
  type BundleOperationalMode,
} from "../../Production/bundleOperationalTypes";

type Props = {
  mode: BundleOperationalMode;
  onModeChange: (mode: BundleOperationalMode) => void;
  linkedProductId: number | null;
  onLinkedProductIdChange: (id: number | null) => void;
};

function RadioOption({
  name,
  value,
  current,
  label,
  description,
  onChange,
}: {
  name: string;
  value: BundleOperationalMode;
  current: BundleOperationalMode;
  label: string;
  description: string;
  onChange: (v: BundleOperationalMode) => void;
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
        <span className="mt-0.5 block text-xs text-slate-600">{description}</span>
      </span>
    </label>
  );
}

/** Sekcja „Typ realizacji zestawu” — P4.11. */
export function BundleFulfillmentTypeSection({
  mode,
  onModeChange,
  linkedProductId,
  onLinkedProductIdChange,
}: Props) {
  const fieldLabel = productLikeFieldLabelClass;
  const inputClass = productLikeInputClass;

  return (
    <ProductLikeSection title="Typ realizacji zestawu">
      <div className="grid gap-3">
        <RadioOption
          name="bundle-operational-mode"
          value="ON_DEMAND_ASSEMBLY"
          current={mode}
          label={BUNDLE_OPERATIONAL_MODE_LABEL.ON_DEMAND_ASSEMBLY}
          description={BUNDLE_OPERATIONAL_MODE_DESCRIPTION.ON_DEMAND_ASSEMBLY}
          onChange={onModeChange}
        />
        <RadioOption
          name="bundle-operational-mode"
          value="STOCK_PRODUCTION"
          current={mode}
          label={BUNDLE_OPERATIONAL_MODE_LABEL.STOCK_PRODUCTION}
          description={BUNDLE_OPERATIONAL_MODE_DESCRIPTION.STOCK_PRODUCTION}
          onChange={onModeChange}
        />
      </div>
      {mode === "STOCK_PRODUCTION" ? (
        <div className="mt-5 max-w-md">
          <label className={fieldLabel}>Powiązany produkt magazynowy (ID)</label>
          <input
            type="text"
            inputMode="numeric"
            className={inputClass}
            placeholder="SKU gotowego zestawu w magazynie"
            value={linkedProductId ?? ""}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "");
              onLinkedProductIdChange(digits ? parseInt(digits, 10) : null);
            }}
          />
          <p className="mt-1 text-xs text-slate-500">
            Produkt reprezentujący gotowy zestaw — stan, lokalizacje, PZ/WZ i inwentaryzacja jak dla zwykłego SKU.
          </p>
        </div>
      ) : null}
    </ProductLikeSection>
  );
}
