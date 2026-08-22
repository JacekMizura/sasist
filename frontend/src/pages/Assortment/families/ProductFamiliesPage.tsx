import { useCallback, useEffect, useMemo, useState } from "react";
import { Network, Pencil, Plus, Trash2 } from "lucide-react";
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
import {
  Card,
  EmptyState,
  IconButton,
  PrimaryButton,
  SearchInput,
  typography,
} from "../../../design-system";
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

  const totalProducts = useMemo(
    () => rows.reduce((s, r) => s + (r.product_count || 0), 0),
    [rows],
  );

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
        breadcrumbs={[
          { label: UI_STRINGS.navigation.assortment },
          { label: UI_STRINGS.navigation.productFamilies },
        ]}
        actions={
          <PrimaryButton type="button" onClick={() => navigate("/product-families/new")}>
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            Nowa rodzina
          </PrimaryButton>
        }
      />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="min-w-[240px] max-w-md flex-1">
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj rodziny…"
            aria-label="Szukaj rodziny"
          />
        </div>
        <p className={typography.bodyMuted}>
          {filtered.length} {filtered.length === 1 ? "rodzina" : "rodzin"}
          {!loading && rows.length > 0 ? ` · ${totalProducts} produktów` : ""}
        </p>
      </div>

      {loading ? (
        <p className={`mt-8 ${typography.bodyMuted}`}>Ładowanie…</p>
      ) : empty ? (
        <div className="mt-8">
          <EmptyState
            title={query.trim() ? "Brak wyników" : "Brak rodzin produktów"}
            description={
              query.trim()
                ? "Zmień frazę wyszukiwania."
                : "Utwórz rodzinę, gdy chcesz pogrupować produkty i zdefiniować cechy."
            }
            action={
              !query.trim() ? (
                <PrimaryButton type="button" onClick={() => navigate("/product-families/new")}>
                  <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                  Utwórz pierwszą rodzinę
                </PrimaryButton>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((row) => (
            <li key={row.id}>
              <Card variant="listTile" density="comfortable" className="flex h-full flex-col">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <Network className="h-5 w-5" strokeWidth={2} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/product-families/${row.id}/edit`}
                      className={`block truncate ${typography.h2} hover:text-orange-600`}
                    >
                      {row.name}
                    </Link>
                    <p className={`mt-1.5 ${typography.caption}`}>
                      {row.attribute_count} {row.attribute_count === 1 ? "cecha" : "cech"} · {row.value_count}{" "}
                      wartości · {row.combination_count} kombinacji
                    </p>
                    <p className={`mt-1 ${typography.bodyMuted}`}>
                      {row.product_count} {row.product_count === 1 ? "produkt" : "produktów"}
                      {!row.is_active ? " · nieaktywna" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <IconButton
                      type="button"
                      density="default"
                      title="Edytuj"
                      aria-label={`Edytuj ${row.name}`}
                      onClick={() => navigate(`/product-families/${row.id}/edit`)}
                    >
                      <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </IconButton>
                    <IconButton
                      type="button"
                      density="default"
                      tone="danger"
                      title="Usuń"
                      aria-label={`Usuń ${row.name}`}
                      onClick={() => void onDelete(row)}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </IconButton>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageLayout>
  );
}
