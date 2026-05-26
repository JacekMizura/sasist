import { useEffect, useState } from "react";
import { bulkUpdateProducts } from "../../api/productsBulkApi";
import type { ProductBulkModalSelection } from "./ProductBulkActionModal";
import {
  ORIENTATION_OPTIONS,
  PATCH_PRESET_FIELDS,
  PATCH_PRESET_META,
  SHAPE_OPTIONS,
  STACK_BEHAVIOR_OPTIONS,
  type BulkPatchFieldDef,
  type ProductBulkPatchPreset,
} from "./productBulkLogisticsFields";

type FieldState = {
  enabled: boolean;
  value: string;
  boolValue: boolean;
};

type Props = {
  open: boolean;
  preset: ProductBulkPatchPreset;
  tenantId: number;
  selection: ProductBulkModalSelection;
  onClose: () => void;
  onSuccess: () => void;
};

function parseDecimal(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function initialFieldState(def: BulkPatchFieldDef): FieldState {
  if (def.type === "boolean") {
    return { enabled: false, value: "", boolValue: true };
  }
  if (def.type === "orientation") {
    return { enabled: false, value: "any", boolValue: false };
  }
  if (def.type === "shape") {
    return { enabled: false, value: "box", boolValue: false };
  }
  if (def.type === "stack_behavior") {
    return { enabled: false, value: "stackable", boolValue: false };
  }
  return { enabled: false, value: "", boolValue: false };
}

export function ProductBulkPatchModal({ open, preset, tenantId, selection, onClose, onSuccess }: Props) {
  const meta = PATCH_PRESET_META[preset];
  const fields = PATCH_PRESET_FIELDS[preset] ?? [];
  const [fieldState, setFieldState] = useState<Record<string, FieldState>>({});
  const [masterCartonOn, setMasterCartonOn] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const n = selection.mode === "explicit_ids" ? selection.productIds.length : selection.count;

  useEffect(() => {
    if (!open) return;
    setErr(null);
    const init: Record<string, FieldState> = {};
    for (const f of fields) init[f.key] = initialFieldState(f);
    setFieldState(init);
    setMasterCartonOn(true);
  }, [open, preset, fields]);

  const setField = (key: string, patch: Partial<FieldState>) => {
    setFieldState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const buildPayload = (): { action: string; value: unknown } | null => {
    if (preset === "clear_logistics_data") {
      return { action: "clear_logistics_data", value: {} };
    }
    if (preset === "toggle_master_carton_pack") {
      return { action: "toggle_master_carton_pack", value: { enabled: masterCartonOn } };
    }

    const set: Record<string, unknown> = {};
    for (const def of fields) {
      const st = fieldState[def.key];
      if (!st?.enabled) continue;
      if (def.type === "boolean") {
        set[def.key] = st.boolValue;
        continue;
      }
      if (def.type === "orientation" || def.type === "shape" || def.type === "stack_behavior") {
        set[def.key] = st.value;
        continue;
      }
      if (def.type === "text") {
        set[def.key] = st.value.trim();
        continue;
      }
      const num = parseDecimal(st.value);
      if (num == null) {
        setErr(`Podaj wartość dla: ${def.label}`);
        return null;
      }
      if (def.min != null && num < def.min) {
        setErr(`${def.label}: wartość musi być ≥ ${def.min}`);
        return null;
      }
      set[def.key] = num;
    }
    if (Object.keys(set).length === 0) {
      setErr("Zaznacz co najmniej jedno pole do aktualizacji.");
      return null;
    }
    return { action: "patch_logistics_fields", value: { set } };
  };

  const submit = async () => {
    if (n === 0) return;
    setErr(null);
    const built = buildPayload();
    if (!built) return;

    const confirmMsg =
      preset === "clear_logistics_data"
        ? `Wyczyścić dane logistyczne (wymiary, waga, karton) u ${n} produktów?`
        : `Zastosować zmiany do ${n} produktów?`;
    if (!window.confirm(confirmMsg)) return;

    setSubmitting(true);
    try {
      const body =
        selection.mode === "explicit_ids"
          ? {
              selection_mode: "explicit_ids" as const,
              product_ids: selection.productIds,
              action: built.action,
              value: built.value,
            }
          : {
              selection_mode: "filtered_query" as const,
              filters: selection.filters,
              action: built.action,
              value: built.value,
            };
      await bulkUpdateProducts(tenantId, body);
      onSuccess();
      onClose();
    } catch (e: unknown) {
      const d =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
          : null;
      setErr(d != null ? String(d) : "Operacja nie powiodła się.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const inputCls =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-violet-400 focus:ring-2 focus:ring-violet-500";

  return (
    <div
      className="fixed inset-0 z-[270] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(90vh,720px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-black text-slate-900">{meta.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{meta.description}</p>
          <p className="mt-2 text-sm font-semibold text-violet-800">
            Produkty: <span className="tabular-nums">{n}</span>
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {preset === "toggle_master_carton_pack" ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className={`rounded-xl border-2 px-4 py-3 text-sm font-semibold ${
                  masterCartonOn
                    ? "border-violet-600 bg-violet-50 text-violet-950"
                    : "border-slate-200 bg-white text-slate-800"
                }`}
                onClick={() => setMasterCartonOn(true)}
              >
                Włącz wymagania opakowania zbiorczego
              </button>
              <button
                type="button"
                className={`rounded-xl border-2 px-4 py-3 text-sm font-semibold ${
                  !masterCartonOn
                    ? "border-violet-600 bg-violet-50 text-violet-950"
                    : "border-slate-200 bg-white text-slate-800"
                }`}
                onClick={() => setMasterCartonOn(false)}
              >
                Wyłącz wymagania
              </button>
            </div>
          ) : preset === "clear_logistics_data" ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Operacja usuwa wymiary i wagę jednostki oraz pola opakowania zbiorczego. Pozostałe ustawienia WMS (flagi
              wymagań, uzupełnienia, orientacja) pozostają bez zmian.
            </p>
          ) : (
            <ul className="space-y-3">
              {fields.map((def) => {
                const st = fieldState[def.key] ?? initialFieldState(def);
                return (
                  <li
                    key={def.key}
                    className={`rounded-xl border px-3 py-2.5 ${
                      st.enabled ? "border-violet-300 bg-violet-50/40" : "border-slate-200 bg-slate-50/50"
                    }`}
                  >
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-violet-600"
                        checked={st.enabled}
                        onChange={(e) => setField(def.key, { enabled: e.target.checked })}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">{def.label}</span>
                        {def.hint ? (
                          <span className="mt-0.5 block text-xs text-slate-500">{def.hint}</span>
                        ) : null}
                      </span>
                    </label>
                    {st.enabled ? (
                      <div className="mt-2 pl-6">
                        {def.type === "boolean" ? (
                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300"
                              checked={st.boolValue}
                              onChange={(e) => setField(def.key, { boolValue: e.target.checked })}
                            />
                            Włączone
                          </label>
                        ) : def.type === "orientation" ? (
                          <select
                            className={inputCls}
                            value={st.value}
                            onChange={(e) => setField(def.key, { value: e.target.value })}
                          >
                            {ORIENTATION_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : def.type === "shape" ? (
                          <select
                            className={inputCls}
                            value={st.value}
                            onChange={(e) => setField(def.key, { value: e.target.value })}
                          >
                            {SHAPE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : def.type === "stack_behavior" ? (
                          <select
                            className={inputCls}
                            value={st.value}
                            onChange={(e) => setField(def.key, { value: e.target.value })}
                          >
                            {STACK_BEHAVIOR_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : def.type === "text" ? (
                          <input
                            className={inputCls}
                            value={st.value}
                            onChange={(e) => setField(def.key, { value: e.target.value })}
                          />
                        ) : (
                          <input
                            className={inputCls}
                            value={st.value}
                            onChange={(e) => setField(def.key, { value: e.target.value })}
                            inputMode="decimal"
                          />
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Anuluj
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {submitting ? "Zapisywanie…" : `Zastosuj (${n})`}
          </button>
        </div>
      </div>
    </div>
  );
}

