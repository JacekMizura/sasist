import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createProductCategory,
  deleteProductCategory,
  fetchCategoryTree,
  updateProductCategory,
  type ProductCategoryCreateBody,
  type ProductCategoryTreeNode,
  type ProductCategoryUpdateBody,
} from "../../api/productCategoriesApi";
import { extractApiErrorMessage } from "../../api/apiErrorMessage";
import { filterCategoryTree } from "./categoryTreeUtils";

export function useCategoryTree(tenantId: number | null) {
  const [rawTree, setRawTree] = useState<ProductCategoryTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (tenantId == null || tenantId < 1) {
      setRawTree([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nodes = await fetchCategoryTree({ tenantId, includeInactive: true });
      setRawTree(nodes);
    } catch (e) {
      setError(extractApiErrorMessage(e));
      setRawTree([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

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

  const toggleExpanded = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const all = new Set<number>();
    const walk = (nodes: ProductCategoryTreeNode[]) => {
      for (const n of nodes) {
        if (n.children?.length) {
          all.add(n.id);
          walk(n.children);
        }
      }
    };
    walk(rawTree);
    setExpandedIds(all);
  }, [rawTree]);

  const collapseAll = useCallback(() => setExpandedIds(new Set()), []);

  const create = useCallback(
    async (body: ProductCategoryCreateBody) => {
      if (tenantId == null) return;
      setBusy(true);
      setError(null);
      try {
        const created = await createProductCategory({ tenantId, body });
        await reload();
        if (created.parent_id != null) {
          setExpandedIds((prev) => new Set(prev).add(created.parent_id!));
        }
        return created;
      } catch (e) {
        setError(extractApiErrorMessage(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [tenantId, reload],
  );

  const update = useCallback(
    async (categoryId: number, body: ProductCategoryUpdateBody) => {
      if (tenantId == null) return;
      setBusy(true);
      setError(null);
      try {
        const updated = await updateProductCategory({ tenantId, categoryId, body });
        await reload();
        return updated;
      } catch (e) {
        setError(extractApiErrorMessage(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [tenantId, reload],
  );

  const remove = useCallback(
    async (categoryId: number) => {
      if (tenantId == null) return;
      setBusy(true);
      setError(null);
      try {
        await deleteProductCategory({ tenantId, categoryId });
        await reload();
      } catch (e) {
        setError(extractApiErrorMessage(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [tenantId, reload],
  );

  return {
    rawTree,
    tree,
    loading,
    error,
    setError,
    query,
    setQuery,
    expandedIds,
    toggleExpanded,
    expandAll,
    collapseAll,
    busy,
    reload,
    create,
    update,
    remove,
  };
}
