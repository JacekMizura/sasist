import { useEffect, useMemo, useState } from "react";

import {
  fetchCategoryTree,
  type ProductCategoryTreeNode,
} from "../../../../api/productCategoriesApi";
import type { ModuleCardProps, ProductMultiModuleDef } from "../types";
import { pmaInp, pmaLab } from "../uiTokens";

export type CategoriesConfig = {
  primaryCategoryId: number | null;
  additionalCategoryIds: number[];
};

function flattenCategories(
  nodes: ProductCategoryTreeNode[],
  prefix: string[] = [],
): { id: number; label: string }[] {
  const out: { id: number; label: string }[] = [];
  for (const n of nodes) {
    const path = [...prefix, n.name];
    out.push({ id: n.id, label: path.join(" › ") });
    if (n.children?.length) out.push(...flattenCategories(n.children, path));
  }
  return out;
}

function CategoriesCard({ config, onChange, tenantId, disabled }: ModuleCardProps<CategoriesConfig>) {
  const [tree, setTree] = useState<ProductCategoryTreeNode[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchCategoryTree({ tenantId, includeInactive: false })
      .then((t) => {
        if (!cancelled) setTree(t);
      })
      .catch(() => {
        if (!cancelled) setTree([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const options = useMemo(() => flattenCategories(tree), [tree]);
  const additionalSet = useMemo(() => new Set(config.additionalCategoryIds), [config.additionalCategoryIds]);

  return (
    <div className="space-y-2.5">
      <label className={pmaLab}>
        Kategoria główna
        <select
          className={pmaInp}
          disabled={disabled || loading}
          value={config.primaryCategoryId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onChange({
              ...config,
              primaryCategoryId: v === "" ? null : Number(v),
            });
          }}
        >
          <option value="">{loading ? "Ładowanie…" : "— bez kategorii —"}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <div>
        <p className={pmaLab}>Kategorie dodatkowe</p>
        <div className="mt-1 max-h-36 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
          {options.length === 0 ? (
            <p className="text-xs text-slate-500">Brak kategorii.</p>
          ) : (
            options.map((o) => (
              <label key={o.id} className="flex cursor-pointer items-start gap-2 py-0.5 text-sm text-slate-800">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-slate-300"
                  disabled={disabled || o.id === config.primaryCategoryId}
                  checked={additionalSet.has(o.id)}
                  onChange={(e) => {
                    const next = new Set(additionalSet);
                    if (e.target.checked) next.add(o.id);
                    else next.delete(o.id);
                    onChange({ ...config, additionalCategoryIds: [...next] });
                  }}
                />
                <span className="min-w-0 truncate">{o.label}</span>
              </label>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export const categoriesModule: ProductMultiModuleDef<CategoriesConfig> = {
  id: "categories",
  label: "Kategorie",
  group: "Asortyment",
  stage: 1,
  defaultConfig: () => ({ primaryCategoryId: null, additionalCategoryIds: [] }),
  validate: () => null,
  Card: CategoriesCard,
  toOps: (cfg) => [
    {
      action: "set_categories",
      value: {
        primary_category_id: cfg.primaryCategoryId,
        additional_category_ids: cfg.additionalCategoryIds.filter((id) => id !== cfg.primaryCategoryId),
      },
    },
  ],
};
