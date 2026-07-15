import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";

import type { LabelTemplate } from "../../../types/labelSystem";
import {
  buildColumnMappingWithPersistence,
  filterDerivedGroupSlotsFromCsvMapping,
  mappedTargetFields,
  polishLabelCsvFieldForUi,
  type CsvFileRowStats,
} from "../labelCsvImport";
import CsvFieldMappingCombobox from "./CsvFieldMappingCombobox";
import CsvMappingPreviewPanel from "./CsvMappingPreviewPanel";
import {
  buildCsvMappingFieldGroups,
  csvColumnMappingStatus,
  resolveTemplateAvailableVariables,
  resolveTemplateUsedVariables,
} from "./labelCsvMappingFields";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Commit mapping and close. */
  onSave: (mapping: Record<string, string>) => void;
  csvHeaders: string[];
  csvRows: Record<string, string>[];
  initialMapping: Record<string, string>;
  csvRowCount: number;
  labelCount: number;
  perFileStats: CsvFileRowStats[];
  template: LabelTemplate | null;
  templateType?: string | null;
  apiAvailableVariables?: string[] | null;
  bindingKeys: Iterable<string>;
};

function sampleCsvValue(rows: Record<string, string>[], header: string): string {
  if (rows.length === 0) return "—";
  const raw = rows[0][header];
  if (raw == null || String(raw).trim() === "") return "—";
  const s = String(raw).trim();
  return s.length > 48 ? `${s.slice(0, 45)}…` : s;
}

/**
 * Full-screen CSV → label field mapping modal (Import CSV UX).
 */
export default function CsvMappingModal({
  open,
  onClose,
  onSave,
  csvHeaders,
  csvRows,
  initialMapping,
  csvRowCount,
  labelCount,
  perFileStats,
  template,
  templateType,
  apiAvailableVariables,
  bindingKeys,
}: Props) {
  const [draft, setDraft] = useState<Record<string, string>>(initialMapping);

  useEffect(() => {
    if (!open) return;
    setDraft({ ...initialMapping });
    // Sync draft only when the modal opens (not on every parent remount of mapping object).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional open-edge sync
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const usedFields = useMemo(
    () =>
      resolveTemplateUsedVariables({
        template,
        apiAvailableVariables,
        bindingKeys,
      }),
    [template, apiAvailableVariables, bindingKeys],
  );

  const availableVariables = useMemo(
    () =>
      resolveTemplateAvailableVariables({
        template,
        apiAvailableVariables,
        bindingKeys,
        templateType,
      }),
    [template, apiAvailableVariables, bindingKeys, templateType],
  );

  const availableSet = useMemo(() => new Set(availableVariables), [availableVariables]);
  const mappedTargets = useMemo(() => mappedTargetFields(draft), [draft]);
  const groups = useMemo(
    () => buildCsvMappingFieldGroups({ availableVariables, templateType }),
    [availableVariables, templateType],
  );

  const requiredBadges = useMemo(() => {
    const fields = usedFields.length > 0 ? usedFields : availableVariables;
    return fields.map((field) => ({
      field,
      label: polishLabelCsvFieldForUi(field),
      covered: mappedTargets.has(field),
    }));
  }, [usedFields, availableVariables, mappedTargets]);

  const missingRequired = requiredBadges.filter((b) => !b.covered);
  const fileLabel =
    perFileStats.length === 0
      ? "—"
      : perFileStats.length === 1
        ? perFileStats[0].filename
        : `${perFileStats.map((s) => s.filename).join(", ")} (${perFileStats.length} plików)`;

  const setMapping = (header: string, field: string) => {
    setDraft((prev) =>
      filterDerivedGroupSlotsFromCsvMapping({
        ...prev,
        [header]: field,
      }),
    );
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        aria-label="Zamknij mapowanie"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-mapping-modal-title"
        className="relative flex max-h-[92vh] w-full max-w-[min(1920px,calc(100vw-1.5rem))] min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="csv-mapping-modal-title" className="text-lg font-semibold text-slate-900">
              Mapowanie kolumn CSV
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Przypisz kolumny pliku do pól wybranego szablonu etykiety. Podgląd aktualizuje się na żywo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-slate-600 hover:bg-slate-50"
            aria-label="Zamknij"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 [scrollbar-width:thin]">
            <section className="mb-5 grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Plik" value={fileLabel} />
              <Stat label="Rekordów" value={String(csvRowCount)} />
              <Stat label="Etykiet (po filtrach)" value={String(labelCount)} />
              <Stat
                label="Brakujące wymagane pola"
                value={
                  missingRequired.length === 0
                    ? "Brak — komplet"
                    : missingRequired.map((m) => m.label).join(", ")
                }
                tone={missingRequired.length === 0 ? "ok" : "warn"}
              />
            </section>

            {requiredBadges.length > 0 ? (
              <section className="mb-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Pola szablonu
                </p>
                <div className="flex flex-wrap gap-2">
                  {requiredBadges.map((b) => (
                    <span
                      key={b.field}
                      className={[
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
                        b.covered
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-red-200 bg-red-50 text-red-800",
                      ].join(" ")}
                    >
                      <span aria-hidden>{b.covered ? "🟢" : "🔴"}</span>
                      {b.label}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
              <div className="max-h-[min(52vh,560px)] overflow-auto [scrollbar-width:thin]">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="sticky top-0 z-10 border-b border-gray-200 bg-white">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-600">Kolumna CSV</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Pole etykiety</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Przykład (1. rekord)</th>
                      <th className="w-16 px-4 py-3 font-semibold text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvHeaders.map((h) => {
                      const mapped = draft[h] ?? "";
                      const status = csvColumnMappingStatus(mapped, availableSet);
                      const ok = status === "required" || (Boolean(mapped) && status === "optional");
                      const sample = sampleCsvValue(csvRows, h);
                      const fieldLabel = mapped ? polishLabelCsvFieldForUi(mapped) : null;
                      return (
                        <tr key={h} className="border-b border-gray-100 last:border-0">
                          <td className="px-4 py-2.5 align-middle font-medium text-slate-900">{h}</td>
                          <td className="px-4 py-2 align-middle">
                            <CsvFieldMappingCombobox
                              value={mapped}
                              groups={groups}
                              templateType={templateType}
                              onChange={(field) => setMapping(h, field)}
                            />
                          </td>
                          <td className="px-4 py-2.5 align-middle">
                            <p className="text-xs leading-relaxed text-slate-600">
                              <span className="font-medium text-slate-800">{h}</span>
                              <span className="mx-1 text-slate-400">→</span>
                              {fieldLabel ? (
                                <>
                                  <span className="font-medium text-slate-700">{fieldLabel}</span>
                                  <span className="mx-1 text-slate-400">→</span>
                                  <span className="font-mono text-slate-900">{sample}</span>
                                </>
                              ) : (
                                <>
                                  <span className="italic text-orange-700">nie wybrano</span>
                                  <span className="mx-1 text-slate-400">→</span>
                                  <span className="font-mono text-slate-500">{sample}</span>
                                </>
                              )}
                            </p>
                          </td>
                          <td className="px-4 py-2.5 align-middle">
                            {ok ? (
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                                <Check className="h-4 w-4" strokeWidth={2.5} aria-label="Zmapowano" />
                              </span>
                            ) : (
                              <span className="text-xs font-medium text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside className="flex min-h-[320px] w-full shrink-0 flex-col border-t border-gray-200 bg-slate-50/50 lg:min-h-0 lg:w-[min(400px,38%)] lg:border-t-0 lg:border-l">
            <CsvMappingPreviewPanel
              template={template}
              csvRows={csvRows}
              draftMapping={draft}
              usedFields={usedFields.length > 0 ? usedFields : availableVariables}
              mappedTargets={mappedTargets}
            />
          </aside>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-5 py-4 sm:px-6">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setDraft(buildColumnMappingWithPersistence(csvHeaders, { forceAuto: true }))
              }
              className="rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:border-orange-300 hover:shadow-md"
            >
              Automatyczne mapowanie
            </button>
            <button
              type="button"
              onClick={() => {
                const empty: Record<string, string> = {};
                for (const h of csvHeaders) empty[h] = "";
                setDraft(empty);
              }}
              className="rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md"
            >
              Wyczyść
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:shadow-md"
            >
              Zamknij
            </button>
            <button
              type="button"
              onClick={() => onSave(draft)}
              className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600"
            >
              Zapisz i przejdź dalej
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={[
          "mt-1 truncate text-sm font-semibold",
          tone === "warn" ? "text-amber-800" : tone === "ok" ? "text-emerald-700" : "text-slate-900",
        ].join(" ")}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}
