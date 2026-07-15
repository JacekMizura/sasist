import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { LabelTemplate } from "../../../types/labelSystem";
import { LabelPreviewCard } from "../LabelPreviewCard";
import { buildLabelRecordsFromCsvRows, polishLabelCsvFieldForUi } from "../labelCsvImport";

const PRIORITY_FIELD_ORDER = [
  "rack_name",
  "floor",
  "row",
  "loc_name",
  "location_code",
  "location_name",
  "barcode_data",
];

type ViewMode = "single" | "grid";

type Props = {
  template: LabelTemplate | null;
  csvRows: Record<string, string>[];
  draftMapping: Record<string, string>;
  usedFields: string[];
  mappedTargets: Set<string>;
};

/**
 * Live label preview inside CSV mapping modal — client-side only, no PDF/backend.
 */
export default function CsvMappingPreviewPanel({
  template,
  csvRows,
  draftMapping,
  usedFields,
  mappedTargets,
}: Props) {
  const [recordIndex, setRecordIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("single");

  const records = useMemo(
    () => buildLabelRecordsFromCsvRows(csvRows, draftMapping),
    [csvRows, draftMapping],
  );

  const total = records.length;

  useEffect(() => {
    setRecordIndex((i) => Math.min(i, Math.max(0, total - 1)));
  }, [total]);

  const currentRecord = total > 0 ? records[Math.min(recordIndex, total - 1)] : null;
  const gridRecords = records.slice(0, 6);
  const valuesRecord = viewMode === "single" ? currentRecord : (records[0] ?? null);

  const fieldsToShow = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const f of PRIORITY_FIELD_ORDER) {
      if (usedFields.includes(f) && !seen.has(f)) {
        seen.add(f);
        ordered.push(f);
      }
    }
    for (const f of usedFields) {
      if (!seen.has(f)) {
        seen.add(f);
        ordered.push(f);
      }
    }
    return ordered;
  }, [usedFields]);

  const toggleBtn = (mode: ViewMode, label: string) => {
    const active = viewMode === mode;
    return (
      <button
        type="button"
        onClick={() => setViewMode(mode)}
        className={[
          "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition",
          active
            ? "border-orange-400 bg-orange-50 text-orange-900"
            : "border-gray-200 bg-white text-slate-600 hover:border-orange-200",
        ].join(" ")}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-gray-200 px-4 py-4">
        <h3 className="text-sm font-semibold text-slate-900">Podgląd etykiety</h3>
        <p className="mt-0.5 text-xs text-slate-500">Na żywo z aktualnego mapowania — bez generowania PDF.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {toggleBtn("single", "Jedna etykieta")}
          {toggleBtn("grid", "Siatka (6)")}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-width:thin]">
        {!template ? (
          <p className="text-sm text-slate-500">Wybierz szablon etykiety, aby zobaczyć podgląd.</p>
        ) : total === 0 ? (
          <p className="text-sm text-slate-500">Brak rekordów CSV — wgraj plik, aby zobaczyć podgląd.</p>
        ) : (
          <>
            {viewMode === "single" ? (
              <div className="mb-4 flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={recordIndex <= 0}
                  onClick={() => setRecordIndex((i) => Math.max(0, i - 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Poprzedni rekord"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-semibold tabular-nums text-slate-700">
                  {recordIndex + 1} / {total}
                </span>
                <button
                  type="button"
                  disabled={recordIndex >= total - 1}
                  onClick={() => setRecordIndex((i) => Math.min(total - 1, i + 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Następny rekord"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            {viewMode === "single" ? (
              <div className="flex justify-center rounded-xl border border-gray-200 bg-slate-50/80 p-4">
                <div className="origin-top" style={{ transform: "scale(1.35)" }}>
                  <LabelPreviewCard template={template} record={currentRecord!} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {gridRecords.map((record, i) => (
                  <div
                    key={i}
                    className="flex flex-col items-center rounded-lg border border-gray-200 bg-slate-50/80 p-2"
                  >
                    <LabelPreviewCard template={template} record={record} />
                    <span className="mt-1 text-[10px] font-medium tabular-nums text-slate-500">{i + 1}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {template && fieldsToShow.length > 0 ? (
          <section className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Wartości w etykiecie
            </p>
            <ul className="space-y-1.5">
              {fieldsToShow.map((field) => {
                const mapped = mappedTargets.has(field);
                const raw = valuesRecord?.[field];
                const hasValue = raw != null && String(raw).trim() !== "";
                const display = !mapped
                  ? "Brak mapowania"
                  : hasValue
                    ? String(raw)
                    : "—";
                const warn = !mapped;
                return (
                  <li
                    key={field}
                    className={[
                      "rounded-lg border px-2.5 py-2 text-xs",
                      warn
                        ? "border-orange-300 bg-orange-50 text-orange-950"
                        : "border-gray-200 bg-white text-slate-800",
                    ].join(" ")}
                  >
                    <span className="font-semibold text-slate-600">{polishLabelCsvFieldForUi(field)}</span>
                    <span className="mx-1 text-slate-400">→</span>
                    <span className={warn ? "font-medium" : "font-mono"}>{display}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
