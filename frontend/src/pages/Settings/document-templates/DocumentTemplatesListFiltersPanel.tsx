import { useState } from "react";
import { ChevronDown } from "lucide-react";

import type { DocumentTemplateFamilyDto } from "../../../api/documentTemplatesApi";
import {
  FilterField,
  FilterGrid,
  FilterPanelBodyWithActions,
  ListFilterEmbeddedShell,
  filterInputClass,
  filterSelectClass,
} from "../../../components/filters";
import { listSellasistFilterGridClass4 } from "../../../components/listPage/listSellasistTokens";
import { DOC_TEMPLATE_SOURCE_LABELS } from "./constants";

export type DocumentTemplatesListFilters = {
  search: string;
  kindCode: string;
  status: string;
  source: string;
  familyCode: string;
  variantCode: string;
};

export const EMPTY_DOC_TEMPLATE_LIST_FILTERS: DocumentTemplatesListFilters = {
  search: "",
  kindCode: "",
  status: "",
  source: "",
  familyCode: "",
  variantCode: "",
};

type Props = {
  expanded: boolean;
  draft: DocumentTemplatesListFilters;
  onChangeDraft: (patch: Partial<DocumentTemplatesListFilters>) => void;
  onApply: () => void;
  onClear: () => void;
  families: DocumentTemplateFamilyDto[];
  kinds: DocumentTemplateFamilyDto["kinds"];
};

export function DocumentTemplatesListFiltersPanel({
  expanded,
  draft,
  onChangeDraft,
  onApply,
  onClear,
  families,
  kinds,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <ListFilterEmbeddedShell expanded={expanded}>
      <FilterPanelBodyWithActions
        onClear={onClear}
        onApply={onApply}
        clearLabel="Wyczyść filtry"
        applyLabel="Filtruj"
        footerMobileOnly={false}
      >
        <div className="space-y-3">
          <FilterGrid columnsClassName={listSellasistFilterGridClass4}>
            <FilterField label="Szukaj">
              <input
                type="text"
                className={filterInputClass}
                value={draft.search}
                onChange={(e) => onChangeDraft({ search: e.target.value })}
                placeholder="Nazwa, typ, powiązanie…"
              />
            </FilterField>
            <FilterField label="Typ dokumentu">
              <select
                className={filterSelectClass}
                value={draft.kindCode}
                onChange={(e) => onChangeDraft({ kindCode: e.target.value })}
              >
                <option value="">Wszystkie</option>
                {kinds.map((k) => (
                  <option key={k.code} value={k.code}>
                    {k.name_pl}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Status">
              <select
                className={filterSelectClass}
                value={draft.status}
                onChange={(e) => onChangeDraft({ status: e.target.value })}
              >
                <option value="">Wszystkie</option>
                <option value="draft">Robocza</option>
                <option value="published">Opublikowana</option>
                <option value="archived">Archiwalna</option>
              </select>
            </FilterField>
            <FilterField label="Źródło">
              <select
                className={filterSelectClass}
                value={draft.source}
                onChange={(e) => onChangeDraft({ source: e.target.value })}
              >
                <option value="">Wszystkie</option>
                {Object.entries(DOC_TEMPLATE_SOURCE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </FilterField>
          </FilterGrid>

          <div>
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
              aria-expanded={moreOpen}
            >
              Więcej filtrów
              <ChevronDown
                className={`h-4 w-4 transition-transform ${moreOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            {moreOpen ? (
              <div className="mt-3">
                <FilterGrid columnsClassName={listSellasistFilterGridClass4}>
                  <FilterField label="Rodzina">
                    <select
                      className={filterSelectClass}
                      value={draft.familyCode}
                      onChange={(e) =>
                        onChangeDraft({
                          familyCode: e.target.value,
                          kindCode: e.target.value !== draft.familyCode ? "" : draft.kindCode,
                        })
                      }
                    >
                      <option value="">Wszystkie</option>
                      {families.map((f) => (
                        <option key={f.code} value={f.code}>
                          {f.icon} {f.name_pl}
                        </option>
                      ))}
                    </select>
                  </FilterField>
                  <FilterField label="Wariant">
                    <select
                      className={filterSelectClass}
                      value={draft.variantCode}
                      onChange={(e) => onChangeDraft({ variantCode: e.target.value })}
                    >
                      <option value="">Wszystkie</option>
                      <option value="standard">standard</option>
                      <option value="food">food</option>
                      <option value="pharma">pharma</option>
                      <option value="export">export</option>
                    </select>
                  </FilterField>
                </FilterGrid>
              </div>
            ) : null}
          </div>
        </div>
      </FilterPanelBodyWithActions>
    </ListFilterEmbeddedShell>
  );
}
