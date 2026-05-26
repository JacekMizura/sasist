import { useEffect, useMemo, useState } from "react";
import {
  EXPORT_FIELD_OPTIONS,
  type ExportEntityType,
  listExportTemplates,
  runExportDownload,
  type ExportTemplateDto,
} from "../../api/exportsApi";
import { csvFieldLabelPl, entityTypeLabelPl } from "../../utils/exportImportLabelsPl";

export type ExportModalProps = {
  open: boolean;
  onClose: () => void;
  tenantId: number;
  entityType: ExportEntityType;
  /** Zaznaczone wiersze; puste = eksport wszystkich przekazanych w fallbackIds. */
  selectedIds: unknown[];
  /** Gdy brak zaznaczenia — np. wszystkie ID z aktualnej strony / widoku. */
  fallbackIds: unknown[];
};

export default function ExportModal({ open, onClose, tenantId, entityType, selectedIds, fallbackIds }: ExportModalProps) {
  const [list, setList] = useState<ExportTemplateDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [templateId, setTemplateId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filtered = useMemo(
    () => list.filter((t) => t.type === entityType && t.is_active),
    [list, entityType]
  );

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setLoading(true);
    listExportTemplates(tenantId)
      .then((rows) => {
        setList(rows);
        const first = rows.find((t) => t.type === entityType && t.is_active);
        setTemplateId(first?.id ?? "");
      })
      .catch((e) => setErr(e?.message ?? "Błąd listy szablonów"))
      .finally(() => setLoading(false));
  }, [open, tenantId, entityType]);

  if (!open) return null;

  const ids = selectedIds.length > 0 ? selectedIds : fallbackIds;

  const run = async () => {
    if (templateId === "") return;
    setBusy(true);
    setErr(null);
    try {
      await runExportDownload(tenantId, Number(templateId), ids);
      onClose();
    } catch (e: unknown) {
      const ax = e as { message?: string };
      setErr(ax?.message ?? "Eksport nie powiódł się");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-slate-800">Eksport CSV</h2>
        <p className="mt-1 text-sm text-slate-500">
          Typ: <span className="font-semibold text-slate-700">{entityTypeLabelPl(entityType)}</span>
          {ids.length === 0 ? (
            <span className="block text-amber-700">Brak danych do eksportu (pusta lista).</span>
          ) : (
            <span className="block">Wierszy: {ids.length}</span>
          )}
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Ładowanie szablonów…</p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-sm text-amber-800">
            Brak aktywnych szablonów dla tego typu. Utwórz szablon w{" "}
            <a href="/settings/exports" className="font-semibold text-blue-700 underline">
              Ustawienia → Eksport
            </a>
            .
          </p>
        ) : (
          <label className="mt-4 block text-sm">
            <span className="font-medium text-slate-700">Szablon</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={templateId === "" ? "" : String(templateId)}
              onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : "")}
            >
              {filtered.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {(EXPORT_FIELD_OPTIONS[entityType]?.length ?? 0) > 0 && (
          <p className="mt-2 text-xs text-slate-400">
            Dostępne pola w szablonie:{" "}
            {EXPORT_FIELD_OPTIONS[entityType]!.map((f) => csvFieldLabelPl(entityType, f)).join(", ")}
          </p>
        )}
        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50" onClick={onClose}>
            Anuluj
          </button>
          <button
            type="button"
            disabled={busy || templateId === "" || ids.length === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={run}
          >
            {busy ? "Generowanie…" : "Pobierz CSV"}
          </button>
        </div>
      </div>
    </div>
  );
}
