import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import ImportPage from "../Import/ImportPage";
import ImportHistoryPage from "../Import/ImportHistoryPage";
import { LabelTemplatesImportWizard } from "../LabelSystem/LabelTemplatesImportWizard";
import {
  SETTINGS_IMPORT_KIND_OPTIONS,
  isLabelTemplatesSettingsImportKind,
  isSettingsImportCsvKind,
  type SettingsImportKindOption,
} from "../../utils/exportImportLabelsPl";
import PageContainer from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";

export default function SettingsImportPage() {
  const [sp, setSp] = useSearchParams();
  const panel = sp.get("panel") === "history" ? "history" : "import";
  const kindRaw = sp.get("kind");
  const kind: SettingsImportKindOption = useMemo(
    () => (SETTINGS_IMPORT_KIND_OPTIONS.some((o) => o.id === kindRaw) ? (kindRaw as SettingsImportKindOption) : "products"),
    [kindRaw]
  );

  const setPanel = useCallback(
    (p: "import" | "history") => {
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          if (p === "history") n.set("panel", "history");
          else n.delete("panel");
          return n;
        },
        { replace: true }
      );
    },
    [setSp]
  );

  const breadcrumbs =
    panel === "history"
      ? [
          { label: "Ustawienia", to: "/settings/wms" },
          { label: "Import", to: "/settings/import" },
          { label: "Historia" },
        ]
      : [
          { label: "Ustawienia", to: "/settings/wms" },
          { label: "Import" },
        ];

  return (
    <PageContainer>
      <PageHeader
        title={panel === "history" ? "Historia importów" : "Import CSV"}
        subtitle={
          panel === "history"
            ? "Ostatnie operacje importu — typ, liczniki i komunikaty systemowe."
            : "Wgraj plik CSV, dopasuj kolumny i załaduj dane do magazynu. Moduł spójny z eksportem i listami asortymentu."
        }
        breadcrumbs={breadcrumbs}
        tabs={
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 shadow-inner">
            <button
              type="button"
              onClick={() => setPanel("import")}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                panel === "import"
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Kreator importu
            </button>
            <button
              type="button"
              onClick={() => setPanel("history")}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                panel === "history"
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Historia
            </button>
          </div>
        }
      />

      <div className="min-w-0 pt-1">
        {panel === "import" && (
          <>
            {isLabelTemplatesSettingsImportKind(kind) ? (
              <LabelTemplatesImportWizard embedded />
            ) : isSettingsImportCsvKind(kind) ? (
              <ImportPage key={kind} settingsKind={kind} embedded />
            ) : null}
          </>
        )}

        {panel === "history" && (
          <ImportHistoryPage embedded backTo="/settings/import" backLabel="← Wróć do kreatora importu" />
        )}
      </div>
    </PageContainer>
  );
}
