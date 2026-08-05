import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { fetchTenantsList } from "../../../api/tenantsApi";
import {
  deleteProductCustomField,
  listProductCustomFields,
  type ProductCustomFieldDto,
} from "../../../api/productCustomFieldsApi";
import { extractApiErrorMessage } from "../../../api/authApi";
import { ListPageHeader } from "../../../components/listPage/ListPageHeader";
import PageLayout from "../../../components/layout/PageLayout";
import { EmptyState, GhostButton, PrimaryButton, SearchInput } from "../../../design-system";
import { UI_STRINGS } from "../../../constants/uiStrings";

const TYPE_LABEL: Record<string, string> = {
  TEXT: "Pole tekstowe",
  NUMBER: "Pole liczbowe",
  FILES: "Pliki",
  SELECT_SINGLE: "Lista (jedna opcja)",
  SELECT_MULTI: "Lista (wiele opcji)",
  GPSR_ATTACHMENTS: "Instrukcja bezpieczeństwa (GPSR)",
  ATTACHMENTS: "Załączniki",
};

export default function ProductCustomFieldsPage() {
  const navigate = useNavigate();
  const [tenantId, setTenantId] = useState<number | null>(null);
  const [rows, setRows] = useState<ProductCustomFieldDto[]>([]);
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
      setRows(await listProductCustomFields(tenantId));
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się wczytać pól."));
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
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q));
  }, [rows, query]);

  const onDelete = async (row: ProductCustomFieldDto) => {
    if (tenantId == null) return;
    if (!window.confirm(`Usunąć pole „${row.name}”?`)) return;
    try {
      await deleteProductCustomField(tenantId, row.id);
      toast.success("Usunięto pole.");
      await reload();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Usuwanie nie powiodło się."));
    }
  };

  return (
    <PageLayout>
      <ListPageHeader
        title="Pola dodatkowe produktów"
        description="Definicje pól widocznych na karcie produktu (zakładka Podstawowe, nad historią)."
        breadcrumbs={[
          { label: UI_STRINGS.navigation.assortment },
          { label: UI_STRINGS.navigation.productCustomFields },
        ]}
        actions={
          <PrimaryButton type="button" density="compact" onClick={() => navigate("/product-custom-fields/new")}>
            <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} aria-hidden />
            Dodaj pole
          </PrimaryButton>
        }
      />

      <div className="mt-4 max-w-md">
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Szukaj pola…"
          aria-label="Szukaj pola"
        />
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-slate-500">Ładowanie…</p>
      ) : filtered.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={query.trim() ? "Brak wyników" : "Brak pól dodatkowych"}
            description="Dodaj pole tekstowe, listę, pliki, GPSR lub załączniki — jak w Sellasist, pod produkty."
            action={
              !query.trim() ? (
                <PrimaryButton type="button" density="compact" onClick={() => navigate("/product-custom-fields/new")}>
                  <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} aria-hidden />
                  Dodaj pierwsze pole
                </PrimaryButton>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Nazwa</th>
                <th className="px-4 py-2 font-semibold">Rodzaj</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-slate-400" aria-hidden />
                      <div>
                        <div className="font-medium text-slate-900">{row.name}</div>
                        <div className="text-xs text-slate-400">{row.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{TYPE_LABEL[row.type] ?? row.type}</td>
                  <td className="px-4 py-3">
                    {row.is_active ? (
                      <span className="text-emerald-700">Aktywne</span>
                    ) : (
                      <span className="text-slate-400">Wyłączone</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <PrimaryButton
                        type="button"
                        density="compact"
                        onClick={() => navigate(`/product-custom-fields/${row.id}/edit`)}
                      >
                        Edytuj
                      </PrimaryButton>
                      <GhostButton type="button" density="compact" onClick={() => void onDelete(row)}>
                        Usuń
                      </GhostButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageLayout>
  );
}
