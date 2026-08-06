import { useState } from "react";

import { Checkbox } from "../../../design-system";
import { pimHintClass, pimPanelClass } from "../../Assortment/pimUi";

const INHERIT_KEYS = [
  { key: "manufacturer", label: "Producent" },
  { key: "categories", label: "Kategorie" },
  { key: "images", label: "Zdjęcia" },
  { key: "descriptions", label: "Opisy" },
  { key: "gpsr", label: "GPSR" },
  { key: "labels", label: "Etykiety" },
  { key: "production", label: "Produkcja" },
  { key: "parameters", label: "Parametry" },
  { key: "offers", label: "Oferty" },
  { key: "custom_fields", label: "Pola własne" },
] as const;

type Props = {
  familyId: number;
};

/**
 * Inheritance preferences UI only — no sync / no persist in v1.
 */
export function FamilyInheritanceCard({ familyId }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(INHERIT_KEYS.map((k) => [k.key, false])),
  );

  return (
    <section className={pimPanelClass}>
      <h2 className="text-sm font-semibold text-slate-900">Dziedziczenie z produktu bazowego</h2>
      <p className={pimHintClass}>
        Architektura pod przyszłą synchronizację rodziny (#{familyId}). Na razie tylko UI — bez zapisu i
        bez sync.
      </p>
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {INHERIT_KEYS.map((item) => (
          <li key={item.key}>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50">
              <Checkbox
                checked={Boolean(checked[item.key])}
                onChange={(e) =>
                  setChecked((prev) => ({ ...prev, [item.key]: e.target.checked }))
                }
              />
              {item.label}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
