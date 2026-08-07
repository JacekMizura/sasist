import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, X, Zap } from "lucide-react";

import { brandPrimaryButtonClass } from "../../../design-system/brandUi";
import { AppOverlayPortal } from "../../overlay";
import { getProductMultiModule, listPickerGroups } from "./registry";
import type {
  ProductMultiActionRow,
  ProductMultiConfigBag,
  ProductMultiModuleId,
} from "./types";
import { pmaInp, pmaLab } from "./uiTokens";

function newRow(moduleId: ProductMultiModuleId): ProductMultiActionRow {
  return {
    id: `${moduleId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    moduleId,
    expanded: true,
  };
}

export type ProductMultiActionsModalProps = {
  open: boolean;
  onClose: () => void;
  tenantId: number;
  productCount: number;
  busy?: boolean;
  onExecute: (payload: {
    rows: ProductMultiActionRow[];
    config: ProductMultiConfigBag;
  }) => Promise<void> | void;
};

export function ProductMultiActionsModal({
  open,
  onClose,
  tenantId,
  productCount,
  busy,
  onExecute,
}: ProductMultiActionsModalProps) {
  const [rows, setRows] = useState<ProductMultiActionRow[]>([]);
  const [config, setConfig] = useState<ProductMultiConfigBag>({});
  const [addSelect, setAddSelect] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const groups = useMemo(() => listPickerGroups(), []);

  const reset = useCallback(() => {
    setRows([]);
    setConfig({});
    setAddSelect("");
    setConfirmed(false);
    setLocalError(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const addModule = useCallback((moduleId: ProductMultiModuleId) => {
    const mod = getProductMultiModule(moduleId);
    if (!mod) return;
    setRows((prev) => {
      if (prev.some((r) => r.moduleId === moduleId)) {
        return prev.map((r) => (r.moduleId === moduleId ? { ...r, expanded: true } : r));
      }
      setConfig((c) => ({ ...c, [moduleId]: mod.defaultConfig() }));
      return [...prev, newRow(moduleId)];
    });
  }, []);

  const removeRow = (id: string) => {
    setRows((prev) => {
      const row = prev.find((r) => r.id === id);
      const next = prev.filter((r) => r.id !== id);
      if (row && !next.some((r) => r.moduleId === row.moduleId)) {
        setConfig((c) => {
          const copy = { ...c };
          delete copy[row.moduleId];
          return copy;
        });
      }
      return next;
    });
  };

  const moveRow = (id: string, dir: -1 | 1) => {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const cp = [...prev];
      const t = cp[i]!;
      cp[i] = cp[j]!;
      cp[j] = t;
      return cp;
    });
  };

  const toggleExpand = (id: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, expanded: !r.expanded } : r)));
  };

  const canRun = rows.length > 0 && productCount > 0 && confirmed && !busy;

  const run = async () => {
    if (!canRun) return;
    setLocalError(null);
    for (const row of rows) {
      const mod = getProductMultiModule(row.moduleId);
      if (!mod) continue;
      const cfg = config[row.moduleId] ?? mod.defaultConfig();
      const err = mod.validate(cfg);
      if (err) {
        setLocalError(`${mod.label}: ${err}`);
        return;
      }
    }
    await onExecute({ rows, config });
  };

  if (!open) return null;

  return (
    <AppOverlayPortal>
      <div
        className="fixed inset-0 z-[280] flex items-center justify-center bg-black/45 p-4"
        role="presentation"
        onClick={() => {
          if (!busy) onClose();
        }}
      >
        <div
          className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-multi-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 id="product-multi-title" className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Zap className="h-5 w-5 text-amber-500" strokeWidth={2} aria-hidden />
                Multiakcje
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Produktów: {productCount}. Zmiany wykonywane są po kolei na całym zaznaczeniu.
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
              onClick={onClose}
              aria-label="Zamknij"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {rows.length === 0 ? (
              <p className="text-sm text-slate-600">Dodaj co najmniej jedną zmianę z listy poniżej.</p>
            ) : (
              <ul className="space-y-2">
                {rows.map((row, idx) => {
                  const mod = getProductMultiModule(row.moduleId);
                  if (!mod) return null;
                  const cfg = config[row.moduleId] ?? mod.defaultConfig();
                  const Card = mod.Card;
                  return (
                    <li key={row.id} className="rounded-lg border border-slate-200 bg-slate-50/80">
                      <div className="flex items-center gap-1 px-2 py-1.5">
                        <button
                          type="button"
                          className="rounded p-1.5 text-slate-600 hover:bg-white"
                          onClick={() => toggleExpand(row.id)}
                          aria-expanded={row.expanded}
                          title={row.expanded ? "Zwiń" : "Rozwiń"}
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${row.expanded ? "rotate-180" : ""}`}
                            aria-hidden
                          />
                        </button>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                          {mod.label}
                        </span>
                        <button
                          type="button"
                          disabled={busy || idx === 0}
                          className="rounded p-1.5 text-slate-600 hover:bg-white disabled:opacity-30"
                          title="Wyżej"
                          onClick={() => moveRow(row.id, -1)}
                        >
                          <ArrowUp className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={busy || idx >= rows.length - 1}
                          className="rounded p-1.5 text-slate-600 hover:bg-white disabled:opacity-30"
                          title="Niżej"
                          onClick={() => moveRow(row.id, 1)}
                        >
                          <ArrowDown className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40"
                          title="Usuń zmianę"
                          onClick={() => removeRow(row.id)}
                        >
                          <X className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                      {row.expanded ? (
                        <div className="border-t border-slate-200 bg-white px-3 py-3">
                          <Card
                            config={cfg}
                            tenantId={tenantId}
                            disabled={busy}
                            onChange={(next) =>
                              setConfig((c) => ({
                                ...c,
                                [row.moduleId]: next,
                              }))
                            }
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-4 border-t border-slate-100 pt-4">
              <label className={pmaLab}>
                + Dodaj zmianę
                <select
                  className={pmaInp}
                  value={addSelect}
                  disabled={busy}
                  onChange={(e) => {
                    const v = e.target.value as ProductMultiModuleId | "";
                    setAddSelect("");
                    if (v) addModule(v);
                  }}
                >
                  <option value="">— wybierz moduł —</option>
                  {groups.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.modules.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            </div>

            {localError ? (
              <p className="mt-3 text-sm text-red-700" role="alert">
                {localError}
              </p>
            ) : null}

            <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                className="mt-1 rounded border-slate-300"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                Potwierdzam wykonanie wybranych zmian na {productCount}{" "}
                {productCount === 1 ? "produkcie" : "produktach"}.
              </span>
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              onClick={onClose}
            >
              Anuluj
            </button>
            <button
              type="button"
              disabled={!canRun}
              className={brandPrimaryButtonClass}
              onClick={() => void run()}
            >
              {busy ? "Wykonywanie…" : "Wykonaj multiakcję"}
            </button>
          </div>
        </div>
      </div>
    </AppOverlayPortal>
  );
}
