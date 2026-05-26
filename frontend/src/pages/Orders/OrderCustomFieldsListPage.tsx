import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardList, Plus } from "lucide-react";

import {
  bulkDeleteOrderCustomFields,
  deleteOrderCustomField,
  listOrderCustomFields,
  type OrderCustomFieldDto,
} from "../../api/orderCustomFieldsApi";
import { PageHeader } from "../../components/layout/PageHeader";
import { pageContainerWidthAlignClass } from "../../components/layout/PageLayout";
import OrderCustomFieldGlyph from "../../components/orders/OrderCustomFieldGlyph";
import { useWarehouse } from "../../context/WarehouseContext";
import { useAuth } from "../../context/AuthContext";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { formatApiErrorMessage } from "../../utils/formatApiErrorMessage";

function typeLabelPl(t: string): string {
  const m: Record<string, string> = {
    TEXT: "Pole tekstowe",
    NUMBER: "Pole liczbowe",
    FILES: "Pliki",
    SELECT_SINGLE: "Lista · jedna opcja",
    SELECT_MULTI: "Lista · wiele opcji",
    SALES_DOCUMENT: "Dokument sprzedaży",
    SHIPPING_LABEL: "List przewozowy",
  };
  return m[t] ?? t;
}

export default function OrderCustomFieldsListPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const tenantId = DAMAGE_TENANT_ID;

  const [rows, setRows] = useState<OrderCustomFieldDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [sort, setSort] = useState<"sort_order" | "name" | "-name">("sort_order");

  const load = useCallback(async () => {
    if (warehouseId == null) {
      setRows([]);
      setErr(null);
      return;
    }
    if (authLoading) return;
    if (!user) {
      setRows([]);
      setErr(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const list = await listOrderCustomFields({
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        sort,
      });
      setRows(list);
      setSelected(new Set());
    } catch (e: unknown) {
      setErr(formatApiErrorMessage(e, "Nie udało się wczytać dodatkowych pól."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId, sort, authLoading, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRows = rows;

  const allSelected = useMemo(
    () => visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.id)),
    [visibleRows, selected],
  );

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(visibleRows.map((r) => r.id)));
  };

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const onBulkDelete = async () => {
    if (warehouseId == null || selected.size === 0) return;
    if (!window.confirm(`Usunąć ${selected.size} pól? Powiązane wartości na zamówieniach zostaną usunięte kaskadowo.`)) return;
    setBulkBusy(true);
    setErr(null);
    try {
      await bulkDeleteOrderCustomFields(
        { tenant_id: tenantId, warehouse_id: warehouseId },
        Array.from(selected),
      );
      await load();
    } catch (e: unknown) {
      setErr(formatApiErrorMessage(e, "Nie udało się usunąć zaznaczonych pól."));
    } finally {
      setBulkBusy(false);
    }
  };

  const onDeleteOne = async (row: OrderCustomFieldDto) => {
    if (warehouseId == null) return;
    if (!window.confirm(`Usunąć pole „${row.name}”?`)) return;
    setErr(null);
    try {
      await deleteOrderCustomField(row.id, { tenant_id: tenantId, warehouse_id: warehouseId });
      await load();
    } catch (e: unknown) {
      setErr(formatApiErrorMessage(e, "Nie udało się usunąć pola."));
    }
  };

  const listShell = `mx-auto w-full max-w-5xl ${pageContainerWidthAlignClass}`;

  if (warehouseId == null) {
    return (
      <div className={`${listShell} py-6`}>
        <p className="text-sm text-slate-600">Wybierz magazyn w nagłówku aplikacji.</p>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className={`${listShell} py-6 text-sm text-slate-600`}>
        Wczytywanie sesji…
      </div>
    );
  }

  if (!user) {
    return (
      <div className={`${listShell} py-6`}>
        <p className="text-sm text-slate-600">
          <Link to="/login" className="font-medium text-blue-700 hover:underline">
            Zaloguj się
          </Link>{" "}
          — wymagana aktywna sesja, aby wczytać listę pól.
        </p>
      </div>
    );
  }

  return (
    <div className={`${listShell} min-h-full pb-6 pt-4`}>
      <PageHeader
        breadcrumbs={[
          { label: "Zamówienia", to: "/orders/list" },
          { label: "Dodatkowe pola" },
        ]}
        title="Dodatkowe pola zamówień"
        actions={
          <button
            type="button"
            onClick={() => navigate("/orders/custom-fields/new")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Dodaj pole
          </button>
        }
      />

      {err ? (
        <div
          className="mb-2 mt-2 max-w-xl rounded-md border border-red-200/90 bg-red-50/90 px-2.5 py-1.5 text-[11px] leading-snug text-red-900"
          role="alert"
        >
          {err}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-slate-200/80">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/90 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {visibleRows.length > 0 ? (
              <>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  Wszystkie
                </label>
                <button
                  type="button"
                  disabled={selected.size === 0 || bulkBusy}
                  onClick={() => void onBulkDelete()}
                  className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50"
                >
                  {bulkBusy ? "…" : `Usuń (${selected.size})`}
                </button>
              </>
            ) : (
              <span className="text-[11px] text-slate-500">{loading ? "Ładowanie…" : "Brak pozycji"}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {loading && visibleRows.length > 0 ? <span className="text-[11px] text-slate-500">Odświeżanie…</span> : null}
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <span className="hidden sm:inline">Sortuj:</span>
              <select
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800"
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
              >
                <option value="sort_order">Kolejność</option>
                <option value="name">Nazwa A–Z</option>
                <option value="-name">Nazwa Z–A</option>
              </select>
            </label>
          </div>
        </div>

        {loading && visibleRows.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500">Ładowanie listy…</div>
        ) : visibleRows.length === 0 ? (
          <div className="flex max-h-[160px] items-center gap-3 border-t border-slate-100 px-3 py-4">
            <ClipboardList className="h-5 w-5 shrink-0 text-slate-300" strokeWidth={1.5} aria-hidden />
            <div className="min-w-0 text-left">
              <p className="text-xs font-medium text-slate-800">Brak zdefiniowanych pól</p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                Użyj „Dodaj pole” powyżej — wartości uzupełnisz na kartach zamówień.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-2 py-1.5" />
                  <th className="w-12 px-2 py-1.5">Ikona</th>
                  <th className="px-2 py-1.5">ID</th>
                  <th className="px-2 py-1.5">Nazwa</th>
                  <th className="px-2 py-1.5">Typ pola</th>
                  <th className="w-40 px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 text-xs hover:bg-slate-50/80">
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        aria-label={`Zaznacz ${r.name}`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <OrderCustomFieldGlyph
                        type={r.type}
                        settings={(r.settings_json ?? {}) as Record<string, unknown>}
                        boxClassName="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-slate-600"
                        lucideClassName="h-3.5 w-3.5"
                      />
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[11px] text-slate-700">{r.id}</td>
                    <td className="px-2 py-1.5 font-medium text-slate-900">{r.name}</td>
                    <td className="px-2 py-1.5 text-[11px] text-slate-600">{typeLabelPl(r.type)}</td>
                    <td className="px-2 py-1.5 text-right text-[11px]">
                      <Link to={`/orders/custom-fields/${r.id}/edit`} className="mr-2 text-blue-700 hover:underline">
                        Edytuj
                      </Link>
                      <button type="button" onClick={() => void onDeleteOne(r)} className="text-red-700 hover:underline">
                        Usuń
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
