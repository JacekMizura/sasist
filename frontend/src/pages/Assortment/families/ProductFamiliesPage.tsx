import { useCallback, useEffect, useMemo, useState } from "react";
import { Network, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { fetchTenantsList } from "../../../api/tenantsApi";
import {
  deleteProductFamily,
  listProductFamilies,
  type ProductFamilyListItem,
} from "../../../api/productFamiliesApi";
import { extractApiErrorMessage } from "../../../api/authApi";
import { ListPageHeader } from "../../../components/listPage/ListPageHeader";
import PageLayout from "../../../components/layout/PageLayout";
import { EmptyState, GhostButton, PrimaryButton, SearchInput } from "../../../design-system";
import { UI_STRINGS } from "../../../constants/uiStrings";

/**
 * Asortyment → Rodziny — opcjonalne grupowanie pełnych produktów + cechy rodziny.
 */
export default function ProductFamiliesPage() {
  const navigate = useNavigate();
  const [tenantId, setTenantId] = useState<number | null>(null);
  const [rows, setRows] = useState<ProductFamilyListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void fetchTenantsList()
      .then((list) => setTenantId(list[0]?.id ?? null))
      .catch(() => setTenantId(null));
  }, []);

  const reload = useCallback(async () => {
    if (tenantId == null) return;
    setLoading(true);
    try {
      setRows(await listProductFamilies(tenantId));
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się wczytać rodzin produktów."));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, query]);

  const onDelete = async (row: ProductFamilyListItem) => {
    if (tenantId == null) return;
    if (!window.confirm(`Usunąć rodzinę „${row.name}”? Produkty pozostaną bez rodziny.`)) return;
    try {
      await deleteProductFamily(tenantId, row.id);
      toast.success("Usunięto rodzinę produktów.");
      await reload();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się usunąć rodziny."));
    }
  };

  const empty = !loading && filtered.length === 0;

  return (
    <PageLayout>
      <ListPageHeader
        title="Rodziny produktów"
        description="Opcjonalne grupy pełnych produktów. Cechy rodziny służą do opisu i kreatora — bez dziedziczenia po utworzeniu."
        breadcrumbs={[
          { label: UI_STRINGS.navigation.assortment },
          { label: UI_STRINGS.navigation.productFamilies },
        ]}
        actions={
          <PrimaryButton type="button" density="compact" onClick={() => navigate("/product-families/new")}>
            <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} aria-hidden />
            Nowa rodzina
          </PrimaryButton>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="min-w-[220px] max-w-md flex-1">
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj rodziny…"
            aria-label="Szukaj rodziny"
          />
        </div>
        <span className="text-sm text-slate-500">
          {filtered.length} {filtered.length === 1 ? "rodzina" : "rodzin"}
          {!loading && rows.length > 0
            ? ` · ${rows.reduce((s, r) => s + (r.product_count || 0), 0)} produktów`
            : ""}
        </span>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-slate-500">Ładowanie…</p>
      ) : empty ? (
        <div className="mt-8">
          <EmptyState
            title={query.trim() ? "Brak wyników" : "Brak rodzin produktów"}
            description={
              query.trim()
                ? "Zmień frazę wyszukiwania."
                : "Rodzina jest opcjonalna. Utwórz ją, gdy chcesz pogrupować produkty (np. Sznurowadła CAT) i zdefiniować cechy."
            }
            action={
              !query.trim() ? (
                <PrimaryButton type="button" density="compact" onClick={() => navigate("/product-families/new")}>
                  <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} aria-hidden />
                  Utwórz pierwszą rodzinę
                </PrimaryButton>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((row) => (
            <li key={row.id}>
              <article className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <Network className="h-5 w-5" strokeWidth={2} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/product-families/${row.id}/edit`}
                      className="block truncate text-base font-semibold text-slate-900 hover:text-blue-700"
                    >
                      {row.name}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.attribute_count} {row.attribute_count === 1 ? "cecha" : "cech"} · {row.value_count} wartości ·{" "}
                      {row.combination_count} kombinacji
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {row.product_count} {row.product_count === 1 ? "produkt" : "produktów"}
                      {!row.is_active ? " · nieaktywna" : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                  <PrimaryButton
                    type="button"
                    density="compact"
                    className="flex-1"
                    onClick={() => navigate(`/product-families/${row.id}/edit`)}
                  >
                    Edytuj
                  </PrimaryButton>
                  <GhostButton type="button" density="compact" onClick={() => void onDelete(row)}>
                    Usuń
                  </GhostButton>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </PageLayout>
  );
}
