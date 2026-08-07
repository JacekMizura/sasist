import { Checkbox, Input } from "../../../design-system";
import { FamilyProductSearchField } from "./FamilyProductSearchField";
import type { ProductSearchHit } from "../../../api/productsSearchApi";
import { pimFieldLabelClass, pimPanelClass, pimStatTileClass } from "../pimUi";

type Props = {
  name: string;
  setName: (v: string) => void;
  isActive: boolean;
  setIsActive: (v: boolean) => void;
  tenantId: number | null;
  baseProductId: number | null;
  baseProductName: string | null;
  onBaseSelect: (hit: ProductSearchHit | null) => void;
  saving: boolean;
  productCount: number;
  attributeCount: number;
  combinationCount: number;
  missingCount: number;
};

/**
 * Family dashboard — Informacje (form + KPI tiles).
 */
export function FamilyEditInfoCard({
  name,
  setName,
  isActive,
  setIsActive,
  tenantId,
  baseProductId,
  baseProductName,
  onBaseSelect,
  saving,
  productCount,
  attributeCount,
  combinationCount,
  missingCount,
}: Props) {
  return (
    <section className={pimPanelClass}>
      <h2 className="text-sm font-semibold text-slate-900">Informacje</h2>
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <label className="block">
            <span className={pimFieldLabelClass}>Nazwa rodziny</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Sznurowadła CAT"
              density="comfortable"
              focusTone="brand"
            />
          </label>
          <div>
            <span className={pimFieldLabelClass}>Produkt bazowy</span>
            {tenantId != null ? (
              <FamilyProductSearchField
                tenantId={tenantId}
                selectedId={baseProductId}
                selectedLabel={baseProductName}
                disabled={saving}
                onSelect={onBaseSelect}
              />
            ) : (
              <p className="text-sm text-slate-400">Ładowanie…</p>
            )}
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Rodzina aktywna
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 content-start lg:col-span-5">
          <div className={pimStatTileClass}>
            <p className="text-xs font-medium text-slate-500">Produkty</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{productCount}</p>
          </div>
          <div className={pimStatTileClass}>
            <p className="text-xs font-medium text-slate-500">Cechy</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{attributeCount}</p>
          </div>
          <div className={pimStatTileClass}>
            <p className="text-xs font-medium text-slate-500">Kombinacje</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{combinationCount}</p>
          </div>
          <div className={pimStatTileClass}>
            <p className="text-xs font-medium text-slate-500">Brakujące</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-700">{missingCount}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
