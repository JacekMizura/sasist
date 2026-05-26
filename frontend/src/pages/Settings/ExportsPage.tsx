import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cloneExportTemplate, deleteExportTemplate, listExportTemplates, type ExportTemplateDto } from "../../api/exportsApi";
import { entityTypeLabelPl } from "../../utils/exportImportLabelsPl";
import PageLayout from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";

const TENANT_ID = 1;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function ExportsPage() {
  const [rows, setRows] = useState<ExportTemplateDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    listExportTemplates(TENANT_ID)
      .then(setRows)
      .catch((e) => setErr(e?.message ?? "Błąd"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageLayout>
        <PageHeader
          title="Eksport"
          actions={
            <Link
              to="/settings/exports/new"
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-cyan-700"
            >
              Nowy szablon eksportu
            </Link>
          }
        />
        <p className="text-sm text-slate-500">Szablony eksportu CSV (tenant #{TENANT_ID})</p>

        {loading && <div className="py-8 text-center text-slate-500">Ładowanie…</div>}
        {err && <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">{err}</div>}

        {!loading && !err && (
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-700">Nazwa</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Typ encji</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Utworzono</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Aktywny</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                      Brak szablonów. Kliknij „Nowy szablon eksportu”.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                      <td className="px-4 py-3 text-slate-600">{entityTypeLabelPl(r.type)}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(r.created_at)}</td>
                      <td className="px-4 py-3">{r.is_active ? "Tak" : "Nie"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Link to={`/settings/exports/${r.id}`} className="font-medium text-cyan-700 hover:underline">
                            Edytuj
                          </Link>
                          <button
                            type="button"
                            className="text-slate-600 hover:text-slate-900"
                            onClick={async () => {
                              await cloneExportTemplate(TENANT_ID, r.id);
                              load();
                            }}
                          >
                            Klonuj
                          </button>
                          <button
                            type="button"
                            className="text-red-600 hover:underline"
                            onClick={async () => {
                              if (!confirm(`Usunąć szablon „${r.name}”?`)) return;
                              await deleteExportTemplate(TENANT_ID, r.id);
                              load();
                            }}
                          >
                            Usuń
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
    </PageLayout>
  );
}
