import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  listOrderCustomFields,
  putOrderCustomFieldValues,
  uploadOrderCustomFieldFile,
  type OrderCustomFieldDto,
  type OrderCustomFieldValueStorePayload,
} from "../../../api/orderCustomFieldsApi";
import { DAMAGE_TENANT_ID } from "../../../pages/damage/damageShared";

const inp =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300";
const lab = "block text-xs font-medium text-slate-600";

function buildPayload(field: OrderCustomFieldDto, draft: unknown): OrderCustomFieldValueStorePayload {
  const id = field.id;
  const ft = field.type;
  if (ft === "TEXT") {
    const s = typeof draft === "string" ? draft.trim() : "";
    return { field_id: id, string_value: s || null };
  }
  if (ft === "NUMBER") {
    const raw = typeof draft === "string" ? draft.trim().replace(",", ".") : "";
    if (!raw) return { field_id: id, number_value: null };
    const n = Number(raw);
    if (!Number.isFinite(n)) return { field_id: id, number_value: null };
    return { field_id: id, number_value: n };
  }
  if (ft === "FILES" || ft === "SALES_DOCUMENT" || ft === "SHIPPING_LABEL") {
    const arr = Array.isArray(draft) ? draft : [];
    return { field_id: id, json_value: arr.length ? arr : null };
  }
  if (ft === "SELECT_SINGLE") {
    const raw = draft === "" || draft == null ? "" : String(draft);
    if (!raw) return { field_id: id, json_value: null };
    return { field_id: id, json_value: Number(raw) };
  }
  if (ft === "SELECT_MULTI") {
    const arr = Array.isArray(draft) ? draft.map((x) => Number(x)).filter((x) => Number.isFinite(x)) : [];
    return { field_id: id, json_value: arr.length ? arr : null };
  }
  return { field_id: id };
}

export type OrderBulkCustomFieldModalProps = {
  open: boolean;
  warehouseId: number;
  orderIds: number[];
  onClose: () => void;
  onApplied: () => void;
  onError: (msg: string) => void;
};

export function OrderBulkCustomFieldModal({
  open,
  warehouseId,
  orderIds,
  onClose,
  onApplied,
  onError,
}: OrderBulkCustomFieldModalProps) {
  const [saving, setSaving] = useState(false);
  const [defs, setDefs] = useState<OrderCustomFieldDto[]>([]);
  const [loadingDefs, setLoadingDefs] = useState(false);
  const [fieldId, setFieldId] = useState<number | "">("");
  const [draft, setDraft] = useState<unknown>("");
  const [filePick, setFilePick] = useState<File | null>(null);

  const selectedField = useMemo(
    () => (fieldId === "" ? null : defs.find((d) => d.id === fieldId) ?? null),
    [defs, fieldId],
  );

  useEffect(() => {
    if (!open || warehouseId == null) return;
    setLoadingDefs(true);
    listOrderCustomFields({
      tenant_id: DAMAGE_TENANT_ID,
      warehouse_id: warehouseId,
      active_only: true,
      sort: "sort_order",
    })
      .then((rows) => {
        setDefs(rows);
        setFieldId("");
        setDraft("");
        setFilePick(null);
      })
      .catch(() => {
        setDefs([]);
        onError("Nie udało się wczytać definicji pól.");
      })
      .finally(() => setLoadingDefs(false));
  }, [open, warehouseId, onError]);

  useEffect(() => {
    if (!selectedField) {
      setDraft("");
      setFilePick(null);
      return;
    }
    const ft = selectedField.type;
    if (ft === "TEXT") setDraft("");
    else if (ft === "NUMBER") setDraft("");
    else if (ft === "FILES") setDraft([]);
    else if (ft === "SELECT_SINGLE") setDraft("");
    else if (ft === "SELECT_MULTI") setDraft([]);
    else if (ft === "SALES_DOCUMENT" || ft === "SHIPPING_LABEL") setDraft([]);
    else setDraft(null);
    setFilePick(null);
  }, [selectedField?.id]);

  if (!open) return null;

  const run = async () => {
    if (!selectedField || orderIds.length < 1) return;
    const ft = selectedField.type;
    setSaving(true);
    try {
      if ((ft === "FILES" || ft === "SALES_DOCUMENT" || ft === "SHIPPING_LABEL") && filePick) {
        for (const oid of orderIds) {
          const meta = await uploadOrderCustomFieldFile(oid, selectedField.id, filePick);
          const payload = buildPayload(selectedField, [meta]);
          await putOrderCustomFieldValues(oid, [payload]);
        }
      } else {
        const payload = buildPayload(selectedField, draft);
        for (const oid of orderIds) {
          await putOrderCustomFieldValues(oid, [payload]);
        }
      }
      onApplied();
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Zapis nie powiódł się.");
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    orderIds.length > 0 &&
    selectedField != null &&
    (!["FILES", "SALES_DOCUMENT", "SHIPPING_LABEL"].includes(selectedField.type) || filePick != null);

  const disableInputs = saving || loadingDefs;

  return (
    <div
      className="fixed inset-0 z-[87] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bcf-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 id="bcf-title" className="text-base font-bold text-slate-900">
              Zmień wartość pola dodatkowego
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Zamówienia: {orderIds.length}. Ta sama wartość zostanie ustawiona dla każdego zaznaczenia.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
            onClick={onClose}
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto px-4 py-3">
          <label className={lab}>
            Pole
            <select
              className={inp}
              disabled={disableInputs}
              value={fieldId === "" ? "" : String(fieldId)}
              onChange={(e) => {
                const v = e.target.value;
                setFieldId(v === "" ? "" : Number(v));
              }}
            >
              <option value="">— wybierz pole —</option>
              {defs.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.name} ({d.type})
                </option>
              ))}
            </select>
          </label>

          {selectedField?.type === "TEXT" ? (
            <label className={lab}>
              Wartość
              <textarea className={`${inp} min-h-[4rem]`} disabled={disableInputs} value={String(draft ?? "")} onChange={(e) => setDraft(e.target.value)} />
            </label>
          ) : null}

          {selectedField?.type === "NUMBER" ? (
            <label className={lab}>
              Wartość
              <input
                type="text"
                inputMode="decimal"
                className={inp}
                disabled={disableInputs}
                value={String(draft ?? "")}
                onChange={(e) => setDraft(e.target.value)}
              />
            </label>
          ) : null}

          {selectedField?.type === "SELECT_SINGLE" ? (
            <label className={lab}>
              Wartość
              <select
                className={inp}
                disabled={disableInputs}
                value={String(draft ?? "")}
                onChange={(e) => setDraft(e.target.value)}
              >
                <option value="">—</option>
                {(selectedField.options ?? []).map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {selectedField?.type === "SELECT_MULTI" ? (
            <fieldset>
              <legend className={lab}>Wartość (wielokrotny wybór)</legend>
              <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {(selectedField.options ?? []).map((o) => {
                  const arr = Array.isArray(draft) ? draft.map(Number) : [];
                  const on = arr.includes(o.id);
                  return (
                    <label key={o.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={disableInputs}
                        onChange={() => {
                          const next = new Set(arr);
                          if (on) next.delete(o.id);
                          else next.add(o.id);
                          setDraft([...next]);
                        }}
                      />
                      {o.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {selectedField?.type === "FILES" ||
          selectedField?.type === "SALES_DOCUMENT" ||
          selectedField?.type === "SHIPPING_LABEL" ? (
            <label className={lab}>
              {selectedField.type === "FILES"
                ? "Plik (ten sam plik zostanie załączony do każdego zamówienia)"
                : "Plik (wgranie do każdego zaznaczonego zamówienia; istniejący plik w polu zostanie zastąpiony)"}
              <input
                type="file"
                className="mt-1 block w-full text-sm text-slate-700"
                disabled={disableInputs}
                onChange={(e) => setFilePick(e.target.files?.[0] ?? null)}
              />
            </label>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            disabled={saving}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            onClick={onClose}
          >
            Anuluj
          </button>
          <button
            type="button"
            disabled={saving || !canSubmit}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            onClick={() => void run()}
          >
            {saving ? "Zapisywanie…" : "Zapisz dla zaznaczonych"}
          </button>
        </div>
      </div>
    </div>
  );
}
