import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  createProductionBatch,
  listRecipeCards,
  previewProductionBatch,
  type ProductionBatchPreviewRead,
  type RecipeCardRead,
} from "../../../api/productionApi";
import { stockTone, STOCK_TONE_CLASS } from "../productionUi";

type LineDraft = {
  key: string;
  recipe: RecipeCardRead;
  quantity: number;
};

type Props = {
  open: boolean;
  tenantId: number;
  warehouseId: number;
  onClose: () => void;
  onCreated: (batchId: number) => void;
};

export function CreateBatchModal({ open, tenantId, warehouseId, onClose, onCreated }: Props) {
  const [recipes, setRecipes] = useState<RecipeCardRead[]>([]);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [preview, setPreview] = useState<ProductionBatchPreviewRead | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickId, setPickId] = useState<number | "">("");

  const reloadRecipes = useCallback(async () => {
    const rows = await listRecipeCards(tenantId, warehouseId);
    setRecipes(rows.filter((r) => r.is_active));
  }, [tenantId, warehouseId]);

  useEffect(() => {
    if (open) void reloadRecipes();
  }, [open, reloadRecipes]);

  useEffect(() => {
    if (!open || lines.length === 0) {
      setPreview(null);
      return;
    }
    const t = window.setTimeout(() => {
      void previewProductionBatch(tenantId, {
        warehouse_id: warehouseId,
        status: "planned",
        lines: lines.map((l) => ({
          product_id: l.recipe.product_id,
          composition_id: l.recipe.composition_id,
          planned_quantity: l.quantity,
        })),
      })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 300);
    return () => window.clearTimeout(t);
  }, [open, lines, tenantId, warehouseId]);

  const addLine = () => {
    const rec = recipes.find((r) => r.composition_id === Number(pickId));
    if (!rec) return;
    setLines((prev) => [
      ...prev,
      { key: `l-${Date.now()}`, recipe: rec, quantity: Math.max(1, Math.floor(rec.max_producible) || 1) },
    ]);
    setPickId("");
  };

  const submit = async () => {
    if (lines.length === 0) return;
    setBusy(true);
    try {
      const batch = await createProductionBatch(tenantId, {
        warehouse_id: warehouseId,
        status: "planned",
        lines: lines.map((l) => ({
          product_id: l.recipe.product_id,
          composition_id: l.recipe.composition_id,
          planned_quantity: l.quantity,
        })),
      });
      onCreated(batch.id);
      onClose();
      setLines([]);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Nowy batch produkcyjny</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex flex-wrap gap-2">
            <select
              className="flex-1 min-w-[200px] rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              value={pickId}
              onChange={(e) => setPickId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Wybierz produkt z recepturą…</option>
              {recipes.map((r) => (
                <option key={r.composition_id} value={r.composition_id}>
                  {r.product_name} — {r.recipe_name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addLine}
              disabled={pickId === ""}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Dodaj
            </button>
          </div>

          {lines.length === 0 ? (
            <p className="text-sm text-slate-500">Dodaj jeden lub więcej produktów do partii.</p>
          ) : (
            <ul className="space-y-2">
              {lines.map((ln) => (
                <li key={ln.key} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{ln.recipe.product_name}</p>
                    <p className="text-xs text-slate-500">{ln.recipe.recipe_name}</p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    value={ln.quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((x) => (x.key === ln.key ? { ...x, quantity: Number(e.target.value) || 1 } : x)),
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((x) => x.key !== ln.key))}
                    className="p-2 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {preview ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-800">
                Zagregowane materiały · {preview.products_count} prod. · {preview.total_planned_units} szt.
              </p>
              {preview.has_shortages ? (
                <p className="text-sm text-amber-800 font-medium">Wykryto braki składników w magazynie.</p>
              ) : (
                <p className="text-sm text-emerald-700">Wystarczający stan — gotowe do zbierania.</p>
              )}
              <div className="grid gap-2 sm:grid-cols-2 max-h-48 overflow-y-auto">
                {preview.aggregated_components.map((c) => {
                  const tone = stockTone(c.required, c.available);
                  return (
                    <div key={c.component_product_id} className={`rounded-lg border px-3 py-2 text-xs ${STOCK_TONE_CLASS[tone]}`}>
                      <p className="font-medium">{c.product_name}</p>
                      <p>
                        {c.required} / {c.available} dost.
                        {c.missing > 0 ? ` · brak ${c.missing}` : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700">
            Anuluj
          </button>
          <button
            type="button"
            disabled={busy || lines.length === 0}
            onClick={() => void submit()}
            className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {busy ? "Tworzenie…" : "Utwórz batch"}
          </button>
        </div>
      </div>
    </div>
  );
}
