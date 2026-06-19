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
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus } from "lucide-react";

import {
  deleteOrderCustomField,
  listOrderCustomFields,
  updateOrderCustomField,
  type OrderCustomFieldDto,
  type OrderCustomFieldWritePayload,
} from "../../api/orderCustomFieldsApi";
import { flatSectionDividerClass, moduleSettingsPageShellClass } from "../../components/layout/flatSectionTokens";
import { ModuleListBreadcrumb, moduleListEmptyStateClass } from "../../components/listPage/moduleList";
import OrderCustomFieldGlyph from "../../components/orders/OrderCustomFieldGlyph";
import { useWarehouse } from "../../context/WarehouseContext";
import { useAuth } from "../../context/AuthContext";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { formatApiErrorMessage } from "../../utils/formatApiErrorMessage";

const DENSE_TH = "px-3 py-2 text-left text-xs font-medium text-slate-400";
const DENSE_TD = "px-3 py-2 align-middle text-sm text-slate-800";

function typeLabelPl(t: string): string {
  const m: Record<string, string> = {
    TEXT: "Pole tekstowe",
    NUMBER: "Pole liczbowe",
    FILES: "Pliki",
    SELECT_SINGLE: "Lista",
    SELECT_MULTI: "Lista",
    SALES_DOCUMENT: "Dokument sprzedaży",
    SHIPPING_LABEL: "List przewozowy",
  };
  return m[t] ?? t;
}

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

function SortableFieldRow({
  row,
  reorderBusy,
  onDelete,
}: {
  row: OrderCustomFieldDto;
  reorderBusy: boolean;
  onDelete: (row: OrderCustomFieldDto) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="group border-b border-slate-100 transition-colors hover:bg-slate-50/50"
    >
      <td className={`${DENSE_TD} w-10`}>
        <button
          type="button"
          className="cursor-grab touch-none rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
          title="Przeciągnij, aby zmienić kolejność"
          aria-label={`Zmień kolejność: ${row.name}`}
          disabled={reorderBusy}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </td>
      <td className={DENSE_TD}>
        <div className="flex min-w-0 items-center gap-2">
          <OrderCustomFieldGlyph
            type={row.type}
            settings={(row.settings_json ?? {}) as Record<string, unknown>}
            boxClassName="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded text-slate-500"
            lucideClassName="h-3 w-3"
          />
          <span className="truncate font-medium text-slate-900">{row.name}</span>
          {!row.is_active ? (
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-400">Wył.</span>
          ) : null}
        </div>
      </td>
      <td className={`${DENSE_TD} text-slate-600`}>{typeLabelPl(row.type)}</td>
      <td className={`${DENSE_TD} w-36 text-right text-sm`}>
        <Link
          to={`/orders/custom-fields/${row.id}/edit`}
          className="mr-3 font-medium text-slate-700 hover:text-slate-900"
        >
          Edytuj
        </Link>
        <button
          type="button"
          disabled={reorderBusy}
          onClick={() => onDelete(row)}
          className="font-medium text-red-600 hover:text-red-800 disabled:opacity-45"
        >
          Usuń
        </button>
      </td>
    </tr>
  );
}

export default function OrderCustomFieldsListPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const tenantId = DAMAGE_TENANT_ID;

  const [rows, setRows] = useState<OrderCustomFieldDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);

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
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rowIds.indexOf(Number(active.id));
    const newIndex = rowIds.indexOf(Number(over.id));
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
      await load();
    } catch (e: unknown) {
      setErr(formatApiErrorMessage(e, "Nie udało się usunąć pola."));
    }
  };

  const shell = moduleSettingsPageShellClass;
  const countLabel =
    rows.length === 1 ? "1 pole" : rows.length < 5 ? `${rows.length} pola` : `${rows.length} pól`;

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
    <div className={`${shell} w-full pb-6`}>
      <ModuleListBreadcrumb items={[{ label: "Zamówienia", to: "/orders/list" }, { label: "Dodatkowe pola" }]} />

      <div className="mb-4 mt-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-slate-900">Dodatkowe pola zamówień</h1>
          {!loading ? <p className="mt-1 text-sm text-slate-500">{countLabel}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => navigate("/orders/custom-fields/new")}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Dodaj pole
        </button>
      </div>
      <div className={`${flatSectionDividerClass} mb-4`} aria-hidden />

      {err ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {err}
        </div>
      ) : null}

      {reorderBusy ? <p className="mb-2 text-xs text-slate-500">Zapisywanie kolejności…</p> : null}

      {loading && rows.length === 0 ? (
        <div className={moduleListEmptyStateClass}>Ładowanie listy…</div>
      ) : rows.length === 0 ? (
        <div className="py-8">
          <p className="text-sm font-medium text-slate-800">Brak zdefiniowanych pól</p>
          <p className="mt-1 text-sm text-slate-500">Użyj „Dodaj pole” — wartości uzupełnisz na kartach zamówień.</p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100">
                <tr>
                  <th className={`${DENSE_TH} w-10`} aria-label="Kolejność" />
                  <th className={DENSE_TH}>Nazwa pola</th>
                  <th className={`${DENSE_TH} w-44`}>Typ pola</th>
                  <th className={`${DENSE_TH} w-36 text-right`}>Akcje</th>
                </tr>
              </thead>
              <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
                <tbody>
                  {rows.map((r) => (
                    <SortableFieldRow key={r.id} row={r} reorderBusy={reorderBusy} onDelete={(row) => void onDeleteOne(row)} />
                  ))}
                </tbody>
              </SortableContext>
            </table>
          </DndContext>
        </div>
      )}
    </div>
  );
}
