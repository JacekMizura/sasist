import { useEffect, useMemo, useState } from "react";

import {
  fetchCategoryTree,
  type ProductCategoryTreeNode,
} from "../../../../api/productCategoriesApi";
import type { ModuleCardProps, ProductMultiModuleDef } from "../types";
import { PmaFieldRow } from "../PmaFieldRow";
import { pmaFieldRowClass, pmaInp } from "../uiTokens";

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
    <div className="space-y-0.5">
      <PmaFieldRow
        label="Kategoria główna"
        disabled={disabled}
        control={
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
        }
      />

      <p className="mb-1 mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        Kategorie dodatkowe
      </p>
      <div className="max-h-36 space-y-0.5 overflow-y-auto">
        {options.length === 0 ? (
          <p className="px-1 text-xs text-slate-500">Brak kategorii.</p>
        ) : (
          options.map((o) => (
            <div key={o.id} className={pmaFieldRowClass}>
              <input
                type="checkbox"
                className="justify-self-center rounded border-slate-300"
                disabled={disabled || o.id === config.primaryCategoryId}
                checked={additionalSet.has(o.id)}
                aria-label={o.label}
                onChange={(e) => {
                  const next = new Set(additionalSet);
                  if (e.target.checked) next.add(o.id);
                  else next.delete(o.id);
                  onChange({ ...config, additionalCategoryIds: [...next] });
                }}
              />
              <span className="min-w-0 truncate text-sm font-medium text-slate-800">{o.label}</span>
              <span className="block h-8" aria-hidden />
            </div>
          ))
        )}
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
