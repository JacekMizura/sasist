import { useEffect, useMemo, useState } from "react";
import {
  createDefaultDocumentSeriesWrite,
  createDocumentSeries,
  subtypesForDocumentSeriesType,
  type DocumentSeriesSubtype,
  type DocumentSeriesType,
} from "../../api/documentSeriesApi";
import { rememberDocumentsSeriesListContext } from "../../pages/documents/documentSeriesContext";
import { documentSeriesSubtypeLabelPl, documentSeriesTypeLabelPl } from "../../pages/documents/documentSeriesUiLabels";

const inp = "mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900";

type Props = {
  open: boolean;
  onClose: () => void;
  tenantId: number;
  warehouseId: number;
  /** Prefill subtype from order panel doc type (PARAGON → RECEIPT, else INVOICE). */
  panelDocType: string;
  onCreated: (seriesId: string) => void;
};

export default function DocumentSeriesQuickCreateModal({
  open,
  onClose,
  tenantId,
  warehouseId,
  panelDocType,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<DocumentSeriesType>("SALE");
  const [subtype, setSubtype] = useState<DocumentSeriesSubtype>("INVOICE");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const allowed = useMemo(() => subtypesForDocumentSeriesType(type), [type]);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setSaving(false);
    setName("");
    setType("SALE");
    const st: DocumentSeriesSubtype =
      panelDocType === "PARAGON" ? "RECEIPT" : panelDocType === "INVOICE" ? "INVOICE" : "INVOICE";
    setSubtype(st);
  }, [open, panelDocType]);

  useEffect(() => {
    if (!allowed.includes(subtype)) {
      setSubtype(allowed[0]);
    }
  }, [allowed, subtype]);

  const save = async () => {
    const nm = name.trim();
    if (!nm) {
      setErr("Podaj nazwę serii.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const base = createDefaultDocumentSeriesWrite();
      const created = await createDocumentSeries(tenantId, warehouseId, {
        ...base,
        name: nm,
        type,
        subtype,
      });
      rememberDocumentsSeriesListContext({ type, subtype });
      onCreated(created.id);
      onClose();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? "")
          : "";
      setErr(msg || "Nie udało się utworzyć serii.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">Nowa seria dokumentów</h2>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose}>
            Zamknij
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Uzupełnij podstawowe pola — pełną konfigurację uzupełnisz w sekcji{" "}
          <span className="font-semibold text-slate-700">Dokumenty, Serie dokumentów</span>.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block text-xs font-medium text-slate-600">
            Nazwa
            <input className={inp} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Typ
            <select
              className={inp}
              value={type}
              onChange={(e) => setType(e.target.value as DocumentSeriesType)}
            >
              <option value="SALE">{documentSeriesTypeLabelPl("SALE")}</option>
              <option value="WAREHOUSE">{documentSeriesTypeLabelPl("WAREHOUSE")}</option>
              <option value="CORRECTION">{documentSeriesTypeLabelPl("CORRECTION")}</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Podtyp
            <select
              className={inp}
              value={subtype}
              onChange={(e) => setSubtype(e.target.value as DocumentSeriesSubtype)}
            >
              {allowed.map((s) => (
                <option key={s} value={s}>
                  {documentSeriesSubtypeLabelPl(s)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            onClick={onClose}
          >
            Anuluj
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "…" : "Utwórz serię"}
          </button>
        </div>
      </div>
    </div>
  );
}
