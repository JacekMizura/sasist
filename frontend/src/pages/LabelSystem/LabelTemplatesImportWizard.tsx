import { useCallback, useState } from "react";
import {
  commitLabelTemplatesImport,
  previewLabelTemplatesImport,
  type LabelImportMode,
  type LabelTemplateImportPreview,
} from "../../api/labelTemplatesPortabilityApi";

const TENANT_ID = 1;

type Step = 1 | 2 | 3 | 4;

export function LabelTemplatesImportWizard({ embedded }: { embedded?: boolean }) {
  const [step, setStep] = useState<Step>(1);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<LabelTemplateImportPreview | null>(null);
  const [mode, setMode] = useState<LabelImportMode>("create_new");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const onPickFile = useCallback(async (file: File | null) => {
    setFileErr(null);
    setPreview(null);
    setSummary(null);
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as object;
      setBusy(true);
      const pv = await previewLabelTemplatesImport(TENANT_ID, payload);
      setPreview(pv);
      setStep(2);
    } catch (e) {
      setFileErr(e instanceof SyntaxError ? "Niepoprawny JSON" : (e as Error)?.message ?? "Błąd odczytu");
    } finally {
      setBusy(false);
    }
  }, []);

  const runImport = useCallback(async () => {
    if (!preview?.normalized_templates?.length) return;
    setBusy(true);
    setSummary(null);
    try {
      const res = await commitLabelTemplatesImport(
        TENANT_ID,
        mode,
        preview.normalized_templates as Record<string, unknown>[]
      );
      const lines = [
        `Utworzono: ${res.created}`,
        `Zaktualizowano: ${res.updated}`,
        `Pominięto: ${res.skipped}`,
      ];
      if (res.validation_errors?.length) {
        lines.push(`Ostrzeżenia walidacji: ${res.validation_errors.length}`);
      }
      setSummary(lines.join("\n"));
      setStep(4);
    } catch (e) {
      setSummary((e as Error)?.message ?? "Import nie powiódł się");
      setStep(4);
    } finally {
      setBusy(false);
    }
  }, [preview, mode]);

  return (
    <div className={embedded ? "w-full px-4 py-6" : "min-h-screen bg-slate-50"}>
      <div className={embedded ? "" : "w-full px-4 py-8"}>
        <h2 className="text-lg font-bold text-slate-800">Import szablonów etykiet (JSON)</h2>
        <p className="mt-1 text-sm text-slate-600">
          Plik z eksportu (schema_version, templates[]). Walidacja układu jak przy zapisie szablonu w edytorze.
        </p>

        <ol className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
          <li className={step >= 1 ? "text-cyan-700" : ""}>1. Plik</li>
          <li>→</li>
          <li className={step >= 2 ? "text-cyan-700" : ""}>2. Podgląd</li>
          <li>→</li>
          <li className={step >= 3 ? "text-cyan-700" : ""}>3. Strategia</li>
          <li>→</li>
          <li className={step >= 4 ? "text-cyan-700" : ""}>4. Wynik</li>
        </ol>

        {step === 1 && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <label className="block text-sm font-medium text-slate-700">Wybierz plik .json</label>
            <input
              type="file"
              accept=".json,application/json"
              disabled={busy}
              className="mt-2 block w-full text-sm"
              onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
            />
            {fileErr && <p className="mt-2 text-sm text-red-600">{fileErr}</p>}
            {busy && <p className="mt-2 text-sm text-slate-500">Wczytywanie…</p>}
          </div>
        )}

        {step >= 2 && preview && (
          <div className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-700">
              Poprawne: <strong>{preview.valid_count}</strong>, błędy: <strong>{preview.error_count}</strong>
            </div>
            {preview.errors.length > 0 && (
              <ul className="max-h-32 list-disc overflow-y-auto pl-5 text-xs text-red-700">
                {preview.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
            <div className="max-h-56 overflow-y-auto rounded border border-slate-100">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="px-2 py-1">#</th>
                    <th className="px-2 py-1">Nazwa</th>
                    <th className="px-2 py-1">Typ</th>
                    <th className="px-2 py-1">OK</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.previews.map((p) => (
                    <tr key={p.index} className={p.valid ? "" : "bg-red-50/80"}>
                      <td className="px-2 py-1">{p.index + 1}</td>
                      <td className="px-2 py-1">{String(p.name ?? "—")}</td>
                      <td className="px-2 py-1">{String(p.template_type ?? "—")}</td>
                      <td className="px-2 py-1">{p.valid ? "tak" : p.error || "nie"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {step === 2 && preview.valid_count > 0 && (
              <button
                type="button"
                className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
                onClick={() => setStep(3)}
              >
                Dalej — wybór strategii
              </button>
            )}
          </div>
        )}

        {step === 3 && preview && preview.valid_count > 0 && (
          <div className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-800">Co zrobić przy kolizji nazwy (i typu)?</p>
            <div className="space-y-2 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input type="radio" name="lim" checked={mode === "create_new"} onChange={() => setMode("create_new")} />
                Zawsze utwórz nowe rekordy
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="lim" checked={mode === "overwrite_by_name"} onChange={() => setMode("overwrite_by_name")} />
                Nadpisz istniejące o tej samej nazwie i typie (brak = utwórz)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="lim" checked={mode === "duplicate_suffix"} onChange={() => setMode("duplicate_suffix")} />
                Duplikuj z unikalną nazwą (dopisek „(import)”, „(import) (2)”…)
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={() => setStep(2)}>
                Wstecz
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={() => void runImport()}
              >
                {busy ? "Import…" : "Importuj"}
              </button>
            </div>
          </div>
        )}

        {step === 4 && summary && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800">Podsumowanie</h3>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{summary}</pre>
            <button
              type="button"
              className="mt-4 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              onClick={() => {
                setStep(1);
                setPreview(null);
                setSummary(null);
              }}
            >
              Import kolejnego pliku
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
