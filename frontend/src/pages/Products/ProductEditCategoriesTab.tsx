import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchCategoryTree,
  getProductCategoryAssignment,
  putProductCategoryAssignment,
  type ProductCategoryTreeNode,
} from "../../api/productCategoriesApi";
import { extractApiErrorMessage } from "../../api/apiErrorMessage";
import { GhostButton, PrimaryButton, SearchInput } from "../../design-system";
import { filterCategoryTree, formatCategoryPath } from "../../modules/productCategories/categoryTreeUtils";
import { CategoryTree } from "../Assortment/categories/CategoryTree";

type Props = {
  tenantId: number;
  productId: number;
  onAssignmentChange?: (primaryCategoryId: number | null) => void;
};

/**
 * Product edit — Kategorie tab.
 * Left: live-searchable category tree. Right: primary + additional summary.
 */
export function ProductEditCategoriesTab({ tenantId, productId, onAssignmentChange }: Props) {
  const [rawTree, setRawTree] = useState<ProductCategoryTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const [primaryId, setPrimaryId] = useState<number | null>(null);
  const [additionalIds, setAdditionalIds] = useState<number[]>([]);
  const [primaryPath, setPrimaryPath] = useState<string[]>([]);
  const [additionalPaths, setAdditionalPaths] = useState<{ id: number; names: string[] }[]>([]);
  const [dirty, setDirty] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tree, assignment] = await Promise.all([
        fetchCategoryTree({ tenantId, includeInactive: false }),
        getProductCategoryAssignment({ tenantId, productId }),
      ]);
      setRawTree(tree);
      setPrimaryId(assignment.primary_category_id);
      setAdditionalIds(assignment.additional_category_ids);
      setPrimaryPath(assignment.primary_path_names);
      setAdditionalPaths(
        assignment.additional.map((a) => ({ id: a.id, names: a.path_names })),
      );
      setDirty(false);
      onAssignmentChange?.(assignment.primary_category_id);
      if (assignment.primary_path_ids.length) {
        setExpandedIds(new Set(assignment.primary_path_ids.slice(0, -1)));
      }
    } catch (e) {
      setError(extractApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [tenantId, productId, onAssignmentChange]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const { tree, autoExpandIds } = useMemo(() => filterCategoryTree(rawTree, query), [rawTree, query]);

  useEffect(() => {
    if (!query.trim()) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const id of autoExpandIds) next.add(id);
      return next;
    });
  }, [query, autoExpandIds]);

  const additionalSet = useMemo(() => new Set(additionalIds), [additionalIds]);

  const refreshSummaryPaths = useCallback(
    (nextPrimary: number | null, nextAdditional: number[]) => {
      const flat: ProductCategoryTreeNode[] = [];
      const walk = (nodes: ProductCategoryTreeNode[]) => {
        for (const n of nodes) {
          flat.push(n);
          if (n.children?.length) walk(n.children);
        }
      };
      walk(rawTree);
      const byId = new Map(flat.map((n) => [n.id, n]));
      setPrimaryPath(nextPrimary != null ? byId.get(nextPrimary)?.path_names ?? [] : []);
      setAdditionalPaths(
        nextAdditional.map((id) => ({
          id,
          names: byId.get(id)?.path_names ?? [],
        })),
      );
    },
    [rawTree],
  );

  const onSelectPrimary = (id: number) => {
    setPrimaryId(id);
    const nextAdd = additionalIds.filter((x) => x !== id);
    setAdditionalIds(nextAdd);
    refreshSummaryPaths(id, nextAdd);
    setDirty(true);
  };

  const onToggleAdditional = (id: number) => {
    if (primaryId === id) return;
    const next = additionalSet.has(id)
      ? additionalIds.filter((x) => x !== id)
      : [...additionalIds, id];
    setAdditionalIds(next);
    refreshSummaryPaths(primaryId, next);
    setDirty(true);
  };

  const clearPrimary = () => {
    setPrimaryId(null);
    refreshSummaryPaths(null, additionalIds);
    setDirty(true);
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const assignment = await putProductCategoryAssignment({
        tenantId,
        productId,
        primaryCategoryId: primaryId,
        additionalCategoryIds: additionalIds,
      });
      setPrimaryId(assignment.primary_category_id);
      setAdditionalIds(assignment.additional_category_ids);
      setPrimaryPath(assignment.primary_path_names);
      setAdditionalPaths(assignment.additional.map((a) => ({ id: a.id, names: a.path_names })));
      setDirty(false);
      onAssignmentChange?.(assignment.primary_category_id);
    } catch (e) {
      setError(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Ładowanie kategorii…</p>;
  }

  return (
    <div className="w-full max-w-none">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-gray-900">Kategorie</h2>
        <PrimaryButton type="button" density="compact" disabled={!dirty || saving} onClick={() => void onSave()}>
          {saving ? "Zapisywanie…" : "Zapisz kategorie"}
        </PrimaryButton>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <SearchInput
            density="comfortable"
            focusTone="brand"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj w drzewie kategorii…"
            aria-label="Szukaj kategorii"
          />
          {tree.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
              {rawTree.length === 0
                ? "Brak aktywnych kategorii. Utwórz je w Asortyment → Kategorie."
                : `Brak wyników dla „${query.trim()}”.`}
            </p>
          ) : (
            <CategoryTree
              nodes={tree}
              expandedIds={expandedIds}
              onToggle={toggleExpanded}
              onAddChild={() => undefined}
              onEdit={() => undefined}
              onDelete={() => undefined}
              selectable
              selectedPrimaryId={primaryId}
              selectedAdditionalIds={additionalSet}
              onSelectPrimary={onSelectPrimary}
              onToggleAdditional={onToggleAdditional}
            />
          )}
        </div>

        <div className="space-y-5 lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 text-sm font-bold text-slate-900">Kategoria główna</h3>
            <p className="text-sm text-slate-800">{formatCategoryPath(primaryPath)}</p>
            {primaryId != null ? (
              <GhostButton type="button" density="compact" className="mt-3 !px-0" onClick={clearPrimary}>
                Wyczyść
              </GhostButton>
            ) : (
              <p className="mt-2 text-xs text-slate-400">Kliknij nazwę kategorii w drzewie, aby ustawić główną.</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-900">Kategorie dodatkowe</h3>
            {additionalPaths.length === 0 ? (
              <p className="text-sm text-slate-500">Brak — użyj „+ Dodatkowa” przy kategorii w drzewie.</p>
            ) : (
              <ul className="space-y-2">
                {additionalPaths.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 text-sm text-slate-800">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden />
                    <span>{formatCategoryPath(a.names)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
