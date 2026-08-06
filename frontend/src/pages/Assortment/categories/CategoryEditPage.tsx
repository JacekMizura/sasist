import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { fetchTenantsList } from "../../../api/tenantsApi";
import { getProductCategory, type ProductCategoryRead } from "../../../api/productCategoriesApi";
import { extractApiErrorMessage } from "../../../api/authApi";
import { ListPageHeader } from "../../../components/listPage/ListPageHeader";
import PageLayout from "../../../components/layout/PageLayout";
import { GhostButton } from "../../../design-system";
import { UI_STRINGS } from "../../../constants/uiStrings";
import { pimPanelIdentityClass, pimStatTileClass } from "../pimUi";
import { CategoryEditTabPlaceholder } from "./CategoryEditTabPlaceholder";
import { CategoryEditBasicTab } from "./CategoryEditBasicTab";
import { CategoryEditNumberingTab } from "./CategoryEditNumberingTab";
import { CategoryEditProductsTab } from "./CategoryEditProductsTab";
import { CategoryEditAttributesTab } from "./CategoryEditAttributesTab";
import { CategoryEditMarketplaceTab } from "./CategoryEditMarketplaceTab";

export type CategoryEditTabId =
  | "basic"
  | "products"
  | "numbering"
  | "attributes"
  | "marketplace"
  | "history";

const TABS: { id: CategoryEditTabId; label: string }[] = [
  { id: "basic", label: "Podstawowe" },
  { id: "products", label: "Produkty" },
  { id: "numbering", label: "Numeracja" },
  { id: "attributes", label: "Atrybuty" },
  { id: "marketplace", label: "Marketplace" },
  { id: "history", label: "Historia" },
];

export default function CategoryEditPage() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const numericId = Number(categoryId);
  const [tenantId, setTenantId] = useState<number | null>(null);
  const [category, setCategory] = useState<ProductCategoryRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<CategoryEditTabId>("basic");

  useEffect(() => {
    void fetchTenantsList()
      .then((list) => setTenantId(list[0]?.id ?? null))
      .catch(() => setTenantId(null));
  }, []);

  const reload = useCallback(async () => {
    if (tenantId == null || !Number.isFinite(numericId) || numericId < 1) return;
    setLoading(true);
    try {
      setCategory(await getProductCategory({ tenantId, categoryId: numericId }));
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się wczytać kategorii."));
      navigate("/categories");
    } finally {
      setLoading(false);
    }
  }, [tenantId, numericId, navigate]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onSaved = (next: ProductCategoryRead) => {
    setCategory(next);
  };

  if (loading || !category) {
    return (
      <PageLayout>
        <p className="text-sm text-slate-500">Ładowanie kategorii…</p>
      </PageLayout>
    );
  }

  const pathLabel = (category.path_names || []).join(" › ") || category.name;
  const parentLabel =
    category.parent_id != null && (category.path_names?.length ?? 0) > 1
      ? category.path_names![category.path_names!.length - 2]
      : "— (korzeń)";

  return (
    <PageLayout>
      <ListPageHeader
        title={category.name}
        description="Karta kategorii — struktura asortymentu, numeracja i ustawienia produktów."
        breadcrumbs={[
          { label: UI_STRINGS.navigation.assortment },
          { label: UI_STRINGS.navigation.categories, to: "/categories" },
          { label: category.name },
        ]}
        actions={
          <GhostButton type="button" density="compact" onClick={() => navigate("/categories")}>
            Wróć do drzewa
          </GhostButton>
        }
      />

      <section className={`mt-4 ${pimPanelIdentityClass}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-900">{category.name}</h2>
            <p className="mt-1 text-sm text-slate-500">
              Ścieżka: <span className="font-medium text-slate-700">{pathLabel}</span>
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              Rodzic: <span className="font-medium text-slate-700">{parentLabel}</span>
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              category.is_active ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-600"
            }`}
          >
            {category.is_active ? "Aktywna" : "Nieaktywna"}
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className={pimStatTileClass}>
            <dt className="text-xs text-slate-500">Produkty</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{category.product_count}</dd>
          </div>
          <div className={pimStatTileClass}>
            <dt className="text-xs text-slate-500">Podkategorie</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{category.child_count}</dd>
          </div>
          <div className={pimStatTileClass}>
            <dt className="text-xs text-slate-500">Kolejność</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{category.sort_order}</dd>
          </div>
          <div className={pimStatTileClass}>
            <dt className="text-xs text-slate-500">ID</dt>
            <dd className="font-semibold tabular-nums text-slate-900">#{category.id}</dd>
          </div>
        </dl>
      </section>

      <nav className="mt-4 flex flex-wrap gap-1 border-b border-slate-200" aria-label="Zakładki kategorii">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`-mb-px rounded-t-lg border px-3 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? "border-slate-200 border-b-white bg-white text-slate-900"
                : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="mt-4">
        {activeTab === "basic" && tenantId != null ? (
          <CategoryEditBasicTab tenantId={tenantId} category={category} onSaved={onSaved} />
        ) : null}
        {activeTab === "numbering" && tenantId != null ? (
          <CategoryEditNumberingTab tenantId={tenantId} category={category} onSaved={onSaved} />
        ) : null}
        {activeTab === "products" && tenantId != null ? (
          <CategoryEditProductsTab tenantId={tenantId} categoryId={category.id} />
        ) : null}
        {activeTab === "attributes" && tenantId != null ? (
          <CategoryEditAttributesTab tenantId={tenantId} category={category} onSaved={onSaved} />
        ) : null}
        {activeTab === "marketplace" ? (
          <CategoryEditTabPlaceholder title="Marketplace" description="Mapowanie kanałów." />
        ) : null}
        {activeTab === "history" ? (
          <CategoryEditTabPlaceholder title="Historia" description="Historia zmian." />
        ) : null}
      </div>
    </PageLayout>
  );
}
