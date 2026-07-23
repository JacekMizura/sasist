import { useEffect, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { Link } from "react-router-dom";

import { getRecipeDetail, type RecipeCardRead, type RecipeDetailRead } from "../../../api/productionApi";
import { getProductDetailsPath } from "../../Products/productPaths";
import { ProductThumb } from "./ProductThumb";

type Props = {
  open: boolean;
  recipe: RecipeCardRead | null;
  tenantId: number;
  warehouseId?: number;
  onClose: () => void;
};

export function RecipeIngredientsDrawer({ open, recipe, tenantId, warehouseId, onClose }: Props) {
  const [detail, setDetail] = useState<RecipeDetailRead | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || recipe == null) {
      setDetail(null);
      setErr(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void getRecipeDetail(tenantId, recipe.composition_id, warehouseId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) {
          setErr("Nie udało się wczytać składników.");
          setDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, recipe, tenantId, warehouseId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || recipe == null) return null;

  const components = detail?.components ?? [];
  const count = detail?.components.length ?? recipe.component_count;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="presentation" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-labelledby="recipe-ingredients-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Składniki receptury</p>
            <h2 id="recipe-ingredients-drawer-title" className="mt-1 text-base font-semibold text-slate-900">
              {recipe.recipe_name}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {recipe.product_name} · Wersja v{recipe.version}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-600">
              Liczba składników: <span className="tabular-nums">{count}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-label="Zamknij panel"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? <p className="text-sm text-slate-500">Wczytywanie składników…</p> : null}
          {err ? <p className="text-sm text-red-600">{err}</p> : null}

          {!loading && !err ? (
            <ul className="space-y-2">
              {components.map((c) => (
                <li key={c.component_product_id}>
                  <Link
                    to={getProductDetailsPath(c.component_product_id)}
                    className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 transition hover:border-slate-200 hover:bg-slate-50/80"
                  >
                    <ProductThumb imageUrl={c.product_image_url} name={c.product_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 group-hover:text-amber-800">
                        {c.product_name}
                      </p>
                      {c.product_sku ? (
                        <p className="mt-0.5 text-xs text-slate-500">SKU: {c.product_sku}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-slate-600">
                        Ilość:{" "}
                        <span className="font-semibold tabular-nums text-slate-800">
                          {c.required_per_unit.toLocaleString("pl-PL", { maximumFractionDigits: 4 })} szt.
                        </span>
                      </p>
                    </div>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-slate-600"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
