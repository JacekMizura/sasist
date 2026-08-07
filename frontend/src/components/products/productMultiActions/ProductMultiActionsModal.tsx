import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Plus, X, Zap } from "lucide-react";

import { GhostButton } from "../../../design-system";
import { brandPrimaryButtonClass } from "../../../design-system/brandUi";
import { AppOverlayPortal } from "../../overlay";
import { ProductMultiModulePicker } from "./ProductMultiModulePicker";
import { getProductMultiModule } from "./registry";
import type {
  ProductMultiActionRow,
  ProductMultiConfigBag,
  ProductMultiModuleId,
} from "./types";

function newRow(moduleId: ProductMultiModuleId): ProductMultiActionRow {
  return {
    id: `${moduleId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    moduleId,
    expanded: true,
  };
}

function productCountLabel(n: number): string {
  if (n === 1) return "1 produkt";
  if (n >= 2 && n <= 4) return `${n} produkty`;
  return `${n} produktów`;
}

function moduleCountLabel(n: number): string {
  if (n === 1) return "1 moduł";
  if (n >= 2 && n <= 4) return `${n} moduły`;
  return `${n} modułów`;
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setRows([]);
    setConfig({});
    setPickerOpen(false);
    setConfirmed(false);
    setLocalError(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const usedIds = useMemo(() => new Set(rows.map((r) => r.moduleId)), [rows]);

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
            <div className="min-w-0">
              <h2 id="product-multi-title" className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Zap className="h-5 w-5 text-amber-500" strokeWidth={2} aria-hidden />
                Multiakcje
              </h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {productCountLabel(productCount)}
                </span>
                <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {moduleCountLabel(rows.length)}
                </span>
              </div>
            </div>
            <GhostButton
              type="button"
              density="compact"
              disabled={busy}
              onClick={onClose}
              aria-label="Zamknij"
            >
              <X className="h-5 w-5" aria-hidden />
            </GhostButton>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {rows.length === 0 ? (
              <p className="text-sm text-slate-600">Dodaj co najmniej jedną zmianę.</p>
            ) : (
              <ul className="space-y-2">
                {rows.map((row, idx) => {
                  const mod = getProductMultiModule(row.moduleId);
                  if (!mod) return null;
                  const cfg = config[row.moduleId] ?? mod.defaultConfig();
                  const Card = mod.Card;
                  return (
                    <li key={row.id} className="rounded-lg border border-slate-200 bg-white">
                      <div className="flex items-center gap-0.5 px-2 py-1">
                        <GhostButton
                          type="button"
                          density="compact"
                          onClick={() => toggleExpand(row.id)}
                          aria-expanded={row.expanded}
                          title={row.expanded ? "Zwiń" : "Rozwiń"}
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${row.expanded ? "rotate-180" : ""}`}
                            aria-hidden
                          />
                        </GhostButton>
                        <span className="min-w-0 flex-1 truncate px-1 text-sm font-semibold text-slate-800">
                          {mod.label}
                        </span>
                        <GhostButton
                          type="button"
                          density="compact"
                          disabled={busy || idx === 0}
                          title="Wyżej"
                          aria-label="Przenieś wyżej"
                          onClick={() => moveRow(row.id, -1)}
                        >
                          <ArrowUp className="h-4 w-4" aria-hidden />
                        </GhostButton>
                        <GhostButton
                          type="button"
                          density="compact"
                          disabled={busy || idx >= rows.length - 1}
                          title="Niżej"
                          aria-label="Przenieś niżej"
                          onClick={() => moveRow(row.id, 1)}
                        >
                          <ArrowDown className="h-4 w-4" aria-hidden />
                        </GhostButton>
                        <GhostButton
                          type="button"
                          density="compact"
                          disabled={busy}
                          title="Usuń zmianę"
                          aria-label="Usuń zmianę"
                          onClick={() => removeRow(row.id)}
                        >
                          <X className="h-4 w-4 text-red-600" aria-hidden />
                        </GhostButton>
                      </div>
                      {row.expanded ? (
                        <div className="border-t border-slate-100 px-3 py-2.5">
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

            <div className="mt-4">
              <GhostButton
                type="button"
                density="compact"
                disabled={busy}
                onClick={() => setPickerOpen(true)}
              >
                <Plus className="mr-1 h-4 w-4" strokeWidth={2} aria-hidden />
                Dodaj zmianę
              </GhostButton>
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
                Potwierdzam wykonanie na {productCountLabel(productCount)}.
              </span>
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
            <GhostButton type="button" density="compact" disabled={busy} onClick={onClose}>
              Anuluj
            </GhostButton>
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

      <ProductMultiModulePicker
        open={pickerOpen}
        disabledIds={usedIds}
        onClose={() => setPickerOpen(false)}
        onPick={addModule}
      />
    </AppOverlayPortal>
  );
}
