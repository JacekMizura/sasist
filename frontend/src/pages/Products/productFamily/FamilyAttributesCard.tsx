import type { ProductFamily } from "../../../api/productFamiliesApi";
import { pimHintClass, pimPanelClass } from "../../Assortment/pimUi";

type Props = {
  family: ProductFamily;
};

/**
 * Read-only preview of family attributes and values.
 */
export function FamilyAttributesCard({ family }: Props) {
  const attrs = family.attributes ?? [];

  return (
    <section className={pimPanelClass}>
      <h2 className="text-sm font-semibold text-slate-900">Cechy rodziny</h2>
      <p className={pimHintClass}>
        Tylko podgląd. Edycja: Asortyment → Rodziny → „Otwórz rodzinę”.
      </p>

      {attrs.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Brak zdefiniowanych cech.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {attrs.map((attr) => (
            <li key={attr.id}>
              <p className="text-sm font-semibold text-slate-900">{attr.name}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(attr.values || []).length === 0 ? (
                  <span className="text-xs text-slate-400">brak wartości</span>
                ) : (
                  (attr.values || []).map((v) => (
                    <span
                      key={v.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                    >
                      {attr.display_type === "color" && v.color_hex ? (
                        <span
                          className="h-3 w-3 rounded-full border border-slate-200"
                          style={{ backgroundColor: v.color_hex }}
                          aria-hidden
                        />
                      ) : null}
                      {v.name}
                    </span>
                  ))
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
