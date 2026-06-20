import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { LayoutList, Plus, Search } from "lucide-react";

import {
  bulkDeleteOrderCustomFields,
  deleteOrderCustomField,
  listOrderCustomFields,
  updateOrderCustomField,
  type OrderCustomFieldDto,
  type OrderCustomFieldWritePayload,
} from "../../api/orderCustomFieldsApi";
import { moduleAutomationShellClass } from "../../components/layout/flatSectionTokens";
import { ModuleListBreadcrumb, moduleListEmptyStateClass } from "../../components/listPage/moduleList";
import {
  OrderCustomFieldsTable,
  orderCustomFieldsSortableIds,
} from "../../components/orders/customFields/OrderCustomFieldsTable";
import { oaBtnDanger, oaBtnPri, oaSearchInp } from "../../components/orders/automation/orderAutomationUiTokens";
import { useWarehouse } from "../../context/WarehouseContext";
import { useAuth } from "../../context/AuthContext";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { formatApiErrorMessage } from "../../utils/formatApiErrorMessage";
import {
  mapOrderCustomFieldAdminRow,
  orderCustomFieldCountLabel,
  orderCustomFieldMatchesSearch,
  type OrderCustomFieldAdminRow,
} from "../../utils/orderCustomFieldListPresentation";

function fieldToWritePayload(r: OrderCustomFieldDto, sortOrder: number): OrderCustomFieldWritePayload {
  return {
    name: r.name,
    slug: r.slug,
    type: r.type,
    settings_json: (r.settings_json ?? {}) as Record<string, unknown>,
    icon_file_id: r.icon_file_id ?? null,
    sort_order: sortOrder,
    is_active: r.is_active,
    options: (r.options ?? []).map((o) => ({
      id: o.id,
      label: o.label,
      icon_file_id: o.icon_file_id ?? null,
      sort_order: o.sort_order,
    })),
  };
}

type ListOrderMode = "manual" | "id";

export default function OrderCustomFieldsListPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const tenantId = DAMAGE_TENANT_ID;

  const [rows, setRows] = useState<OrderCustomFieldDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [listOrderMode, setListOrderMode] = useState<ListOrderMode>("manual");
  const [idSort, setIdSort] = useState<"asc" | "desc">("asc");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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
        active_only: false,
        sort: "sort_order",
      });
      setRows(list);
      setSelectedIds(new Set());
    } catch (e: unknown) {
      setErr(formatApiErrorMessage(e, "Nie udało się wczytać dodatkowych pól."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId, authLoading, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const adminRows = useMemo(() => rows.map(mapOrderCustomFieldAdminRow), [rows]);

  const filteredRows = useMemo(() => {
    return adminRows.filter((r) => orderCustomFieldMatchesSearch(r.field, search));
  }, [adminRows, search]);

  const displayRows = useMemo(() => {
    if (listOrderMode !== "id") return filteredRows;
    const copy = [...filteredRows];
    copy.sort((a, b) => (idSort === "asc" ? a.field.id - b.field.id : b.field.id - a.field.id));
    return copy;
  }, [filteredRows, listOrderMode, idSort]);

  const reorderEnabled = listOrderMode === "manual" && search.trim() === "";
  const sortableIds = useMemo(() => orderCustomFieldsSortableIds(displayRows), [displayRows]);

  const visibleIds = useMemo(() => displayRows.map((r) => r.field.id), [displayRows]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));
  const selectedCount = selectedIds.size;

  const handleIdSortChange = (_dir: "asc" | "desc") => {
    if (listOrderMode === "manual") {
      setListOrderMode("id");
      setIdSort("asc");
      return;
    }
    if (idSort === "asc") {
      setIdSort("desc");
      return;
    }
    setListOrderMode("manual");
    setIdSort("asc");
  };

  const handleSelect = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of visibleIds) next.delete(id);
        return next;
      });
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  };

  const persistReorder = async (next: OrderCustomFieldDto[], prev: OrderCustomFieldDto[]) => {
    if (warehouseId == null) return;
    const prevOrder = new Map(prev.map((r) => [r.id, r.sort_order]));
    const changed = next.filter((r) => prevOrder.get(r.id) !== r.sort_order);
    if (changed.length === 0) return;

    setReorderBusy(true);
    setErr(null);
    const params = { tenant_id: tenantId, warehouse_id: warehouseId };
    try {
      await Promise.all(
        changed.map((r) => updateOrderCustomField(r.id, params, fieldToWritePayload(r, r.sort_order))),
      );
    } catch (e: unknown) {
      setErr(formatApiErrorMessage(e, "Nie udało się zapisać kolejności pól."));
      setRows(prev);
    } finally {
      setReorderBusy(false);
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (!reorderEnabled) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = Number(active.id);
    const overId = Number(over.id);
    const oldIndex = rows.findIndex((r) => r.id === activeId);
    const newIndex = rows.findIndex((r) => r.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const prev = rows;
    const moved = arrayMove(rows, oldIndex, newIndex).map((r, i) => ({
      ...r,
      sort_order: (i + 1) * 10,
    }));
    setRows(moved);
    void persistReorder(moved, prev);
  };

  const onDeleteOne = async (row: OrderCustomFieldDto) => {
    if (warehouseId == null) return;
    if (!window.confirm(`Usunąć pole „${row.name}”?`)) return;
    setErr(null);
    try {
      await deleteOrderCustomField(row.id, { tenant_id: tenantId, warehouse_id: warehouseId });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      await load();
    } catch (e: unknown) {
      setErr(formatApiErrorMessage(e, "Nie udało się usunąć pola."));
    }
  };

  const onBulkDelete = async () => {
    if (warehouseId == null || selectedCount === 0) return;
    if (!window.confirm(`Usunąć zaznaczone pola (${selectedCount})?`)) return;
    setBulkBusy(true);
    setErr(null);
    try {
      await bulkDeleteOrderCustomFields(
        { tenant_id: tenantId, warehouse_id: warehouseId },
        [...selectedIds],
      );
      await load();
    } catch (e: unknown) {
      setErr(formatApiErrorMessage(e, "Nie udało się usunąć zaznaczonych pól."));
    } finally {
      setBulkBusy(false);
    }
  };

  const shell = `${moduleAutomationShellClass} w-full max-w-none pb-6`;

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
    <div className={shell}>
      <ModuleListBreadcrumb items={[{ label: "Zamówienia", to: "/orders/list" }, { label: "Dodatkowe pola" }]} />

      <div className="mb-4 mt-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-slate-900">Dodatkowe pola zamówień</h1>
          {!loading ? (
            <p className="mt-1 text-sm text-slate-500">{orderCustomFieldCountLabel(rows.length)}</p>
          ) : null}
        </div>
        <button type="button" onClick={() => navigate("/orders/custom-fields/new")} className={oaBtnPri}>
          <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Dodaj pole
        </button>
      </div>

      <div className="relative mb-4 max-w-xl">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          strokeWidth={2}
          aria-hidden
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj pola…"
          className={oaSearchInp}
          type="search"
          aria-label="Szukaj pola"
        />
      </div>

      {err ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {err}
        </div>
      ) : null}

      {reorderBusy ? <p className="mb-2 text-xs text-slate-500">Zapisywanie kolejności…</p> : null}

      {listOrderMode === "id" ? (
        <p className="mb-2 text-xs text-slate-500">
          Sortowanie po ID — kliknij nagłówek ID ponownie, aby wrócić do kolejności ręcznej i przeciągania.
        </p>
      ) : search.trim() ? (
        <p className="mb-2 text-xs text-slate-500">Wyczyść wyszukiwanie, aby zmienić kolejność pól.</p>
      ) : null}

      {selectedCount > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-sm font-medium text-slate-800">
            Zaznaczono: <span className="tabular-nums">{selectedCount}</span>
          </span>
          <button
            type="button"
            className={oaBtnDanger}
            disabled={bulkBusy}
            onClick={() => void onBulkDelete()}
          >
            Usuń zaznaczone
          </button>
        </div>
      ) : null}

      {loading && rows.length === 0 ? (
        <div className={moduleListEmptyStateClass}>Ładowanie listy…</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-400">
            <LayoutList className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          </div>
          <p className="mt-5 text-base font-semibold text-slate-900">Brak dodatkowych pól</p>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Zdefiniuj pola widoczne na kartach zamówień — tekst, liczby, listy, załączniki i więcej.
          </p>
          <button type="button" className={`${oaBtnPri} mt-6`} onClick={() => navigate("/orders/custom-fields/new")}>
            <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            Dodaj pierwsze pole
          </button>
        </div>
      ) : displayRows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-800">Brak wyników wyszukiwania</p>
          <p className="mt-1 text-sm text-slate-500">Zmień frazę lub wyczyść pole wyszukiwania.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <OrderCustomFieldsTable
                rows={displayRows}
                selectedIds={selectedIds}
                idSort={idSort}
                onIdSortChange={handleIdSortChange}
                onSelect={handleSelect}
                onSelectAll={handleSelectAll}
                onDelete={(row) => void onDeleteOne(row)}
                reorderEnabled={reorderEnabled}
                reorderBusy={reorderBusy || bulkBusy}
                allVisibleSelected={allVisibleSelected}
                someVisibleSelected={someVisibleSelected}
              />
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}
