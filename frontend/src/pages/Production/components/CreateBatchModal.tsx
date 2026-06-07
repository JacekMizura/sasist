import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Coins,
  Layers,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  createProductionBatch,
  listRecipeCards,
  previewProductionBatch,
  type ProductionBatchPreviewRead,
  type RecipeCardRead,
} from "../../../api/productionApi";
import { formatDurationMinutes } from "../productionTheme";
import { formatProductionMoney, stockTone, STOCK_TONE_CLASS } from "../productionUi";
import { ProductThumb } from "./ProductThumb";

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

const STEPS = ["Produkty", "Materiały", "Plan"] as const;

export function CreateBatchModal({ open, tenantId, warehouseId, onClose, onCreated }: Props) {
  const [recipes, setRecipes] = useState<RecipeCardRead[]>([]);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [preview, setPreview] = useState<ProductionBatchPreviewRead | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

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

  const filteredRecipes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter(
      (r) =>
        r.product_name.toLowerCase().includes(q) ||
        r.recipe_name.toLowerCase().includes(q) ||
        (r.product_sku ?? "").toLowerCase().includes(q),
    );
  }, [recipes, search]);

  const usedCompositionIds = useMemo(() => new Set(lines.map((l) => l.recipe.composition_id)), [lines]);

  const addLine = (rec: RecipeCardRead) => {
    if (usedCompositionIds.has(rec.composition_id)) return;
    setLines((prev) => [
      ...prev,
      {
        key: `l-${rec.composition_id}-${Date.now()}`,
        recipe: rec,
        quantity: Math.max(1, Math.floor(rec.max_producible) || 1),
      },
    ]);
  };

  const stepIndex = lines.length === 0 ? 0 : preview ? 2 : 1;

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
      setSearch("");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4">
      <div className="flex h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-3xl">
        <div className="shrink-0 border-b border-violet-100 bg-gradient-to-r from-violet-950 to-indigo-900 px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-violet-300">Planowanie produkcji</p>
              <h2 className="mt-1 text-xl font-bold">Nowa partia masowa</h2>
              <p className="mt-1 text-sm text-violet-100/90">
                Wybierz wiele produktów — system zagreguje materiały, koszt i braki.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-violet-200 hover:bg-white/10"
              aria-label="Zamknij"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="mt-4 flex gap-2">
            {STEPS.map((label, i) => (
              <span
                key={label}
                className={[
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  i <= stepIndex ? "bg-white text-violet-900" : "bg-white/10 text-violet-200",
                ].join(" ")}
              >
                {i + 1}. {label}
              </span>
            ))}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-5">
          <div className="flex min-h-0 flex-col border-b border-slate-100 lg:col-span-3 lg:border-b-0 lg:border-r">
            <div className="shrink-0 border-b border-slate-100 p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  type="search"
                  placeholder="Szukaj produktu lub receptury…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {filteredRecipes.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">Brak aktywnych receptur produkcyjnych.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {filteredRecipes.map((r) => {
                    const added = usedCompositionIds.has(r.composition_id);
                    return (
                      <button
                        key={r.composition_id}
                        type="button"
                        disabled={added}
                        onClick={() => addLine(r)}
                        className={[
                          "flex items-start gap-3 rounded-xl border p-3 text-left transition",
                          added
                            ? "border-emerald-200 bg-emerald-50/50 opacity-70"
                            : "border-slate-200 hover:border-violet-300 hover:bg-violet-50/40",
                        ].join(" ")}
                      >
                        <ProductThumb imageUrl={r.product_image_url} name={r.product_name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{r.product_name}</p>
                          <p className="truncate text-xs text-slate-500">{r.recipe_name}</p>
                          <p className="mt-1 text-[10px] text-slate-400">
                            max {Math.floor(r.max_producible)} · {formatProductionMoney(r.unit_cost_net)}/szt.
                          </p>
                        </div>
                        {added ? (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                        ) : (
                          <Plus className="h-5 w-5 shrink-0 text-violet-600" aria-hidden />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {lines.length > 0 ? (
              <div className="shrink-0 border-t border-slate-100 bg-slate-50/80 p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Linie partii ({lines.length})</p>
                <ul className="max-h-40 space-y-2 overflow-y-auto">
                  {lines.map((ln) => (
                    <li
                      key={ln.key}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm"
                    >
                      <ProductThumb imageUrl={ln.recipe.product_image_url} name={ln.recipe.product_name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{ln.recipe.product_name}</p>
                      </div>
                      <input
                        type="number"
                        min={1}
                        aria-label={`Ilość ${ln.recipe.product_name}`}
                        className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-semibold tabular-nums"
                        value={ln.quantity}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x) =>
                              x.key === ln.key ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setLines((prev) => prev.filter((x) => x.key !== ln.key))}
                        className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="Usuń linię"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-col bg-gradient-to-b from-violet-50/50 to-white lg:col-span-2">
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Podsumowanie planu</h3>

              {lines.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-violet-200 bg-white/80 p-6 text-center">
                  <Layers className="mx-auto h-10 w-10 text-violet-300" aria-hidden />
                  <p className="mt-3 text-sm font-medium text-slate-700">Dodaj produkty do partii</p>
                  <p className="mt-1 text-xs text-slate-500">Kliknij kartę produktu po lewej, aby zaplanować ilości.</p>
                </div>
              ) : preview ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-[10px] font-bold uppercase text-slate-400">Produkty</p>
                      <p className="text-xl font-bold text-slate-900">{preview.products_count}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-[10px] font-bold uppercase text-slate-400">Sztuk</p>
                      <p className="text-xl font-bold text-slate-900">{preview.total_planned_units}</p>
                    </div>
                    <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                      <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-violet-600">
                        <Coins className="h-3 w-3" aria-hidden />
                        Koszt szac.
                      </p>
                      <p className="text-lg font-bold text-violet-900">
                        {formatProductionMoney(preview.estimated_cost_net)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                      <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-blue-600">
                        <Clock className="h-3 w-3" aria-hidden />
                        Czas szac.
                      </p>
                      <p className="text-lg font-bold text-blue-900">
                        {formatDurationMinutes(preview.estimated_duration_minutes ?? 0)}
                      </p>
                    </div>
                  </div>

                  {preview.has_shortages ? (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                      <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
                        <AlertTriangle className="h-4 w-4" aria-hidden />
                        Wykryto braki materiałów ({preview.shortages.length})
                      </p>
                      <p className="mt-1 text-xs text-amber-800">
                        Partię można utworzyć, ale start produkcji będzie zablokowany do uzupełnienia stanów.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                      <CheckCircle2 className="mb-1 inline h-4 w-4" aria-hidden /> Materiały wystarczające — gotowe do
                      zbierania po utworzeniu.
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Zagregowane materiały</p>
                    <div className="max-h-52 space-y-1.5 overflow-y-auto">
                      {preview.aggregated_components.map((c) => {
                        const tone = stockTone(c.required, c.available);
                        return (
                          <div
                            key={c.component_product_id}
                            className={`rounded-lg border px-3 py-2 text-xs ${STOCK_TONE_CLASS[tone]}`}
                          >
                            <p className="font-semibold text-slate-800">{c.product_name}</p>
                            <p className="text-slate-600">
                              Wymagane: <strong>{c.required}</strong> · Dostępne: {c.available}
                              {c.missing > 0 ? (
                                <span className="font-bold text-red-700"> · Brak: {c.missing}</span>
                              ) : null}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500">Obliczanie planu materiałowego…</p>
              )}
            </div>

            <div className="shrink-0 flex gap-2 border-t border-slate-200 bg-white p-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={busy || lines.length === 0}
                onClick={() => void submit()}
                className="flex-[2] rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-md hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50"
              >
                {busy ? "Tworzenie partii…" : "Utwórz partię produkcyjną"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
