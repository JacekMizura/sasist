import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PageLayout from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";
import { labelModuleBasePath } from "./labelModuleBasePath";
import {
  LABEL_PRINT_MODULE_TYPE_LABELS,
  LABEL_PRINT_MODULE_TYPE_ORDER,
  type LabelPrintModuleType,
} from "./labelPrintModuleTypes";

/**
 * Wybór modułu przed edytorem — odpowiada trasie `/admin/print-templates/new`.
 */
export function PrintTemplateNewPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const labelBase = labelModuleBasePath(pathname);
  const [selectedType, setSelectedType] = useState<LabelPrintModuleType>(
    LABEL_PRINT_MODULE_TYPE_ORDER[0]
  );

  return (
    <PageLayout>
      <PageHeader
        title="Nowy szablon wydruku"
        subtitle="Wybierz typ szablonu (moduł), następnie przejdź do edytora."
      />
      <div className="mx-auto max-w-2xl space-y-6">
        <fieldset className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
          <legend className="sr-only">Typ szablonu</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {LABEL_PRINT_MODULE_TYPE_ORDER.map((type) => (
              <label
                key={type}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  selectedType === type
                    ? "border-orange-400 bg-orange-50/80 text-slate-900"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="print-template-type"
                  className="text-orange-600 focus:ring-orange-500"
                  checked={selectedType === type}
                  onChange={() => setSelectedType(type)}
                />
                <span className="font-medium">{LABEL_PRINT_MODULE_TYPE_LABELS[type]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-orange-600"
            onClick={() =>
              navigate(`${labelBase}/designer/new`, {
                state: { initialTemplateType: selectedType },
              })
            }
          >
            Dalej do edytora
          </button>
          <Link
            to={`${labelBase}/ready`}
            className="text-sm font-medium text-orange-600 hover:text-orange-700"
          >
            Gotowe szablony wydruków
          </Link>
          <button
            type="button"
            className="text-sm text-slate-600 hover:text-slate-900"
            onClick={() => navigate(labelBase)}
          >
            Anuluj
          </button>
        </div>
      </div>
    </PageLayout>
  );
}
