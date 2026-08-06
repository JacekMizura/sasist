import { useCallback, useMemo, useState } from "react";
import { FolderTree, Plus } from "lucide-react";

import { fetchTenantsList } from "../../../api/tenantsApi";
import type { ProductCategoryTreeNode } from "../../../api/productCategoriesApi";
import { ListPageHeader } from "../../../components/listPage/ListPageHeader";
import PageLayout from "../../../components/layout/PageLayout";
import { EmptyState, GhostButton, PrimaryButton, SearchInput } from "../../../design-system";
import { UI_STRINGS } from "../../../constants/uiStrings";
import { useCategoryTree } from "../../../modules/productCategories/useCategoryTree";
import { useEffect } from "react";
import { CategoryFormModal } from "./CategoryFormModal";
import { CategoryTree } from "./CategoryTree";

/**
 * Asortyment → Kategorie — hierarchical tree (not a table).
 */
export default function ProductCategoriesPage() {
  const [tenantId, setTenantId] = useState<number | null>(null);

  useEffect(() => {
    void fetchTenantsList()
      .then((list) => {
        const first = list[0];
        setTenantId(first?.id ?? null);
      })
      .catch(() => setTenantId(null));
  }, []);

  const treeState = useCategoryTree(tenantId);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editing, setEditing] = useState<ProductCategoryTreeNode | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<number | null>(null);

  const openCreate = useCallback((parentId: number | null = null) => {
    setFormMode("create");
    setEditing(null);
    setDefaultParentId(parentId);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((node: ProductCategoryTreeNode) => {
    setFormMode("edit");
    setEditing(node);
    setDefaultParentId(null);
    setFormOpen(true);
  }, []);

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
        description="Hierarchia kategorii z numeracją SKU i katalogu. Import drzewa Allegro — później; struktura jest pod to przygotowana."
        breadcrumbs={[
          { label: UI_STRINGS.navigation.assortment },
          { label: UI_STRINGS.navigation.categories },
        ]}
        actions={
          <PrimaryButton type="button" density="compact" onClick={() => openCreate(null)}>
            <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} aria-hidden />
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
              <PrimaryButton type="button" density="compact" onClick={() => openCreate(null)}>
                <FolderTree className="mr-1.5 h-4 w-4" strokeWidth={2} aria-hidden />
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
        mode={formMode}
        tree={treeState.rawTree}
        initial={editing}
        defaultParentId={defaultParentId}
        busy={treeState.busy}
        onClose={() => setFormOpen(false)}
        onSubmit={async (values) => {
          if (formMode === "create") {
            await treeState.create({
              name: values.name,
              parent_id: values.parent_id,
              description: values.description || null,
              is_active: values.is_active,
              sort_order: values.sort_order,
              sku_code: values.sku_code || null,
              catalog_code: values.catalog_code || null,
              sku_template: values.sku_template || null,
              catalog_template: values.catalog_template || null,
            });
          } else if (editing) {
            await treeState.update(editing.id, {
              name: values.name,
              parent_id: values.parent_id,
              clear_parent: values.clear_parent,
              description: values.description,
              is_active: values.is_active,
              sort_order: values.sort_order,
              sku_code: values.sku_code || null,
              catalog_code: values.catalog_code || null,
              sku_template: values.sku_template || null,
              catalog_template: values.catalog_template || null,
            });
          }
          setFormOpen(false);
        }}
      />
    </PageLayout>
  );
}
