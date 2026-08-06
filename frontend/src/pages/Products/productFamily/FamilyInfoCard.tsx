import { Link } from "react-router-dom";
import type { ProductFamily } from "../../../api/productFamiliesApi";
import { pimHintClass, pimPanelClass, pimStatTileClass } from "../../Assortment/pimUi";

type Props = {
  family: ProductFamily;
};

/**
 * Family summary stats + open family module.
 */
export function FamilyInfoCard({ family }: Props) {
  return (
    <section className={pimPanelClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Informacje o rodzinie</h2>
          <p className={pimHintClass}>Podgląd — edycja cech i generatora w module Rodzin.</p>
        </div>
        <Link
          to={`/product-families/${family.id}/edit`}
          className="inline-flex h-8 items-center rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Otwórz rodzinę
        </Link>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <div className={pimStatTileClass}>
          <dt className="text-xs text-slate-500">Rodzina</dt>
          <dd className="truncate font-semibold text-slate-900" title={family.name}>
            {family.name}
          </dd>
        </div>
        <div className={pimStatTileClass}>
          <dt className="text-xs text-slate-500">Produkt bazowy</dt>
          <dd className="truncate font-semibold text-slate-900" title={family.base_product_name ?? undefined}>
            {family.base_product_name?.trim() || (family.base_product_id != null ? `#${family.base_product_id}` : "—")}
          </dd>
        </div>
        <div className={pimStatTileClass}>
          <dt className="text-xs text-slate-500">Status</dt>
          <dd className="font-semibold text-slate-900">{family.is_active ? "Aktywna" : "Nieaktywna"}</dd>
        </div>
        <div className={pimStatTileClass}>
          <dt className="text-xs text-slate-500">Produkty</dt>
          <dd className="font-semibold text-slate-900">{family.product_count}</dd>
        </div>
        <div className={pimStatTileClass}>
          <dt className="text-xs text-slate-500">Kombinacje</dt>
          <dd className="font-semibold text-slate-900">{family.combination_count}</dd>
        </div>
        <div className={pimStatTileClass}>
          <dt className="text-xs text-slate-500">Cechy</dt>
          <dd className="font-semibold text-slate-900">{family.attribute_count}</dd>
        </div>
      </dl>
    </section>
  );
}
