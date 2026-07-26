import { ChevronDown } from "lucide-react";
import { useState } from "react";

import type { DocumentTemplateFamilyDto } from "../../../api/documentTemplatesApi";
import { DOC_TEMPLATE_SOURCE_LABELS } from "./constants";
import type { DocumentTemplatesListFilters } from "./DocumentTemplatesListFiltersPanel";

type Props = {
  value: DocumentTemplatesListFilters;
  onChange: (next: DocumentTemplatesListFilters) => void;
  families: DocumentTemplateFamilyDto[];
  kinds: DocumentTemplateFamilyDto["kinds"];
};

const fieldClass =
  "w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-300/40";

/**
 * Lightweight filters — Label System list language (no heavy Sellasist shell).
 */
export function DocumentTemplatesLightFilters({ value, onChange, families, kinds }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);

  const patch = (partial: Partial<DocumentTemplatesListFilters>) => onChange({ ...value, ...partial });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block min-w-0 sm:col-span-2 lg:col-span-1">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Szukaj</span>
          <input
            type="search"
            className={fieldClass}
            value={value.search}
            onChange={(e) => patch({ search: e.target.value })}
            placeholder="Nazwa, typ, powiązanie…"
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Typ</span>
          <select
            className={fieldClass}
            value={value.kindCode}
            onChange={(e) => patch({ kindCode: e.target.value })}
          >
            <option value="">Wszystkie</option>
            {kinds.map((k) => (
              <option key={k.code} value={k.code}>
                {k.name_pl}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Kategoria</span>
          <select
            className={fieldClass}
            value={value.familyCode}
            onChange={(e) =>
              patch({
                familyCode: e.target.value,
                kindCode: e.target.value !== value.familyCode ? "" : value.kindCode,
              })
            }
          >
            <option value="">Wszystkie</option>
            {families.map((f) => (
              <option key={f.code} value={f.code}>
                {f.icon ? `${f.icon} ` : ""}
                {f.name_pl}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Status</span>
          <select
            className={fieldClass}
            value={value.status}
            onChange={(e) => patch({ status: e.target.value })}
          >
            <option value="">Wszystkie</option>
            <option value="draft">Robocza</option>
            <option value="published">Opublikowana</option>
            <option value="archived">Archiwalna</option>
          </select>
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Źródło</span>
          <select
            className={fieldClass}
            value={value.source}
            onChange={(e) => patch({ source: e.target.value })}
          >
            <option value="">Wszystkie</option>
            {Object.entries(DOC_TEMPLATE_SOURCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900"
          aria-expanded={moreOpen}
        >
          Więcej filtrów
          <ChevronDown className={`h-4 w-4 transition-transform ${moreOpen ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {moreOpen ? (
          <div className="mt-3 grid max-w-sm gap-3 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Wariant
              </span>
              <select
                className={fieldClass}
                value={value.variantCode}
                onChange={(e) => patch({ variantCode: e.target.value })}
              >
                <option value="">Wszystkie</option>
                <option value="standard">standard</option>
                <option value="food">food</option>
                <option value="pharma">pharma</option>
                <option value="export">export</option>
              </select>
            </label>
          </div>
        ) : null}
      </div>
    </div>
  );
}
