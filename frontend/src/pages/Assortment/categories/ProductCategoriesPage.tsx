import { useCallback, useMemo, useState, useEffect } from "react";
import { FolderTree, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { fetchTenantsList } from "../../../api/tenantsApi";
import type { ProductCategoryTreeNode } from "../../../api/productCategoriesApi";
import { ListPageHeader } from "../../../components/listPage/ListPageHeader";
import PageLayout from "../../../components/layout/PageLayout";
import { EmptyState, GhostButton, PrimaryButton, SearchInput } from "../../../design-system";
import { UI_STRINGS } from "../../../constants/uiStrings";
import { useCategoryTree } from "../../../modules/productCategories/useCategoryTree";
import { CategoryFormModal } from "./CategoryFormModal";
import { CategoryTree } from "./CategoryTree";

/**
 * Asortyment → Kategorie — hierarchical explorer; edit opens full category card.
 */
export default function ProductCategoriesPage() {
  const navigate = useNavigate();
  const [tenantId, setTenantId] = useState<number | null>(null);

  useEffect(() => {
    void fetchTenantsList()
      .then((list) => setTenantId(list[0]?.id ?? null))
      .catch(() => setTenantId(null));
  }, []);

  const treeState = useCategoryTree(tenantId);
  const [formOpen, setFormOpen] = useState(false);
  const [defaultParentId, setDefaultParentId] = useState<number | null>(null);

  const openCreate = useCallback((parentId: number | null = null) => {
    setDefaultParentId(parentId);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback(
    (node: ProductCategoryTreeNode) => {
      navigate(`/categories/${node.id}/edit`);
    },
    [navigate],
  );

  const onDelete = useCallback(
    async (node: ProductCategoryTreeNode) => {
      if (!window.confirm(`Usunąć kategorię „${node.name}”?`)) return;
      try {
        await treeState.remove(node.id);
      } catch {
        /* error surfaced via treeState.error */
      }
    },
    [treeState],
  );

  const empty = useMemo(
    () => !treeState.loading && treeState.tree.length === 0 && !treeState.query.trim(),
    [treeState.loading, treeState.tree.length, treeState.query],
  );

  return (
    <PageLayout>
      <ListPageHeader
        title="Kategorie"
        description="Eksplorator drzewa — pełna konfiguracja na karcie kategorii."
        breadcrumbs={[
          { label: UI_STRINGS.navigation.assortment },
          { label: UI_STRINGS.navigation.categories },
        ]}
        actions={
          <PrimaryButton type="button" onClick={() => openCreate(null)}>
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            Dodaj kategorię
          </PrimaryButton>
        }
      />

      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[220px] flex-1 sm:max-w-sm">
            <SearchInput
              density="comfortable"
              focusTone="brand"
              value={treeState.query}
              onChange={(e) => treeState.setQuery(e.target.value)}
              placeholder="Szukaj kategorii…"
              aria-label="Szukaj kategorii"
            />
          </div>
          <GhostButton type="button" density="compact" onClick={treeState.expandAll}>
            Rozwiń wszystko
          </GhostButton>
          <GhostButton type="button" density="compact" onClick={treeState.collapseAll}>
            Zwiń wszystko
          </GhostButton>
        </div>

        {treeState.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{treeState.error}</p>
        ) : null}

        {treeState.loading ? (
          <p className="text-sm text-slate-500">Ładowanie drzewa kategorii…</p>
        ) : empty ? (
          <EmptyState
            title="Brak kategorii"
            description="Utwórz pierwszą kategorię główną, a następnie dodawaj podkategorie w drzewie."
            action={
              <PrimaryButton type="button" onClick={() => openCreate(null)}>
                <FolderTree className="h-4 w-4" strokeWidth={2} aria-hidden />
                Dodaj kategorię
              </PrimaryButton>
            }
          />
        ) : treeState.tree.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            Brak wyników dla „{treeState.query.trim()}”.
          </p>
        ) : (
          <CategoryTree
            nodes={treeState.tree}
            expandedIds={treeState.expandedIds}
            onToggle={treeState.toggleExpanded}
            onAddChild={(parentId) => openCreate(parentId)}
            onEdit={openEdit}
            onDelete={(n) => void onDelete(n)}
          />
        )}
      </div>

      <CategoryFormModal
        open={formOpen}
        tree={treeState.rawTree}
        defaultParentId={defaultParentId}
        busy={treeState.busy}
        onClose={() => setFormOpen(false)}
        onSubmit={async (values) => {
          const created = await treeState.create({
            name: values.name,
            parent_id: values.parent_id,
          });
          setFormOpen(false);
          if (created?.id) {
            navigate(`/categories/${created.id}/edit`);
          }
        }}
      />
    </PageLayout>
  );
}
