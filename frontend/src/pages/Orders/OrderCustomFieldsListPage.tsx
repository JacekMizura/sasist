import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardList, Plus } from "lucide-react";

import {
  bulkDeleteOrderCustomFields,
  deleteOrderCustomField,
  listOrderCustomFields,
  type OrderCustomFieldDto,
} from "../../api/orderCustomFieldsApi";
import { flatListTableSectionClass, flatSectionDividerClass, moduleSettingsPageShellClass } from "../../components/layout/flatSectionTokens";
import {
  ModuleListBreadcrumb,
  moduleBulkBarClass,
  moduleListEmptyStateClass,
  moduleListRowClass,
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListTdClass,
  moduleListThClass,
  moduleListTheadClass,
} from "../../components/listPage/moduleList";
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
      await bulkDeleteOrderCustomFields({ tenant_id: tenantId, warehouse_id: warehouseId }, Array.from(selected));
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

  const shell = moduleSettingsPageShellClass;

  if (warehouseId == null) {
    return (
      <div className={shell}>
        <p className="text-sm text-slate-600">Wybierz magazyn w nagłówku aplikacji.</p>
      </div>
    );
  }

  if (authLoading) {
    return <div className={`${shell} text-sm text-slate-600`}>Wczytywanie sesji…</div>;
  }

  if (!user) {
    return (
      <div className={shell}>
        <p className="text-sm text-slate-600">
          <Link to="/login" className="font-medium text-slate-900 hover:underline">
            Zaloguj się
          </Link>{" "}
          — wymagana aktywna sesja, aby wczytać listę pól.
        </p>
      </div>
    );
  }

  return (
    <div className={`${shell} pb-6`}>
      <ModuleListBreadcrumb items={[{ label: "Zamówienia", to: "/orders/list" }, { label: "Dodatkowe pola" }]} />

      <div className="mb-6 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-slate-900">Dodatkowe pola zamówień</h1>
            {!loading ? (
              <p className="mt-1 text-sm text-slate-500">
                {visibleRows.length} {visibleRows.length === 1 ? "pole" : visibleRows.length < 5 ? "pola" : "pól"}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => navigate("/orders/custom-fields/new")}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            Dodaj pole
          </button>
        </div>
        <div className={flatSectionDividerClass} aria-hidden />
      </div>

      {err ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {err}
        </div>
      ) : null}

      <div className={flatListTableSectionClass}>
        {visibleRows.length > 0 ? (
          <div className={moduleBulkBarClass}>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              Wszystkie
            </label>
            <button
              type="button"
              disabled={selected.size === 0 || bulkBusy}
              onClick={() => void onBulkDelete()}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-45"
            >
              {bulkBusy ? "Usuwanie…" : `Usuń (${selected.size})`}
            </button>
            <div className="ml-auto flex items-center gap-2">
              {loading ? <span className="text-xs text-slate-500">Odświeżanie…</span> : null}
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Sortuj
                <select
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
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
        ) : null}

        {loading && visibleRows.length === 0 ? (
          <div className={moduleListEmptyStateClass}>Ładowanie listy…</div>
        ) : visibleRows.length === 0 ? (
          <div className="flex items-start gap-3 py-10">
            <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" strokeWidth={1.5} aria-hidden />
            <div>
              <p className="text-sm font-medium text-slate-800">Brak zdefiniowanych pól</p>
              <p className="mt-1 text-sm text-slate-500">Użyj „Dodaj pole” — wartości uzupełnisz na kartach zamówień.</p>
            </div>
          </div>
        ) : (
          <div className={moduleListTableScrollClass}>
            <table className={moduleListTableClass}>
              <thead className={moduleListTheadClass}>
                <tr>
                  <th className={`${moduleListThClass} w-10`} />
                  <th className={`${moduleListThClass} w-14`}>Ikona</th>
                  <th className={moduleListThClass}>ID</th>
                  <th className={moduleListThClass}>Nazwa</th>
                  <th className={moduleListThClass}>Typ pola</th>
                  <th className={`${moduleListThClass} w-36 text-right`}>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.id} className={moduleListRowClass}>
                    <td className={moduleListTdClass}>
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        aria-label={`Zaznacz ${r.name}`}
                      />
                    </td>
                    <td className={moduleListTdClass}>
                      <OrderCustomFieldGlyph
                        type={r.type}
                        settings={(r.settings_json ?? {}) as Record<string, unknown>}
                        boxClassName="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-600"
                        lucideClassName="h-4 w-4"
                      />
                    </td>
                    <td className={`${moduleListTdClass} font-mono text-xs text-slate-600`}>{r.id}</td>
                    <td className={`${moduleListTdClass} font-medium text-slate-900`}>{r.name}</td>
                    <td className={`${moduleListTdClass} text-slate-600`}>{typeLabelPl(r.type)}</td>
                    <td className={`${moduleListTdClass} text-right text-sm`}>
                      <Link to={`/orders/custom-fields/${r.id}/edit`} className="mr-3 font-medium text-slate-700 hover:text-slate-900">
                        Edytuj
                      </Link>
                      <button type="button" onClick={() => void onDeleteOne(r)} className="font-medium text-red-600 hover:text-red-800">
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
