import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ArrowDown, ArrowUp, ChevronDown, ClipboardList, Pencil, Plus, Search, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { fetchTenantsList } from "../../../api/tenantsApi";
import {
  bulkDeleteProductCustomFields,
  deleteProductCustomField,
  listProductCustomFields,
  updateProductCustomField,
  type ProductCustomFieldDto,
  type ProductCustomFieldWrite,
} from "../../../api/productCustomFieldsApi";
import { extractApiErrorMessage } from "../../../api/authApi";
import { moduleAutomationShellClass } from "../../../components/layout/flatSectionTokens";
import PageLayout from "../../../components/layout/PageLayout";
import { ModuleListBreadcrumb, moduleListEmptyStateClass } from "../../../components/listPage/moduleList";
import {
  oaBtnDanger,
  oaBtnPri,
  oaSearchInp,
  oaWorkflowGroupHeaderClass,
  oaWorkflowGroupSectionClass,
} from "../../../components/orders/automation/orderAutomationUiTokens";
import { GhostButton } from "../../../design-system";
import { UI_STRINGS } from "../../../constants/uiStrings";
import {
  ProductCustomFieldsTable,
  productCustomFieldsSortableIds,
} from "./ProductCustomFieldsTable";
import {
  PRODUCT_CUSTOM_FIELD_UNGROUPED,
  getFieldGroupName,
  loadProductCustomFieldGroups,
  newProductCustomFieldGroupId,
  saveProductCustomFieldGroups,
  withFieldGroupName,
  type ProductCustomFieldGroup,
} from "./productCustomFieldGroupsStore";

type ListOrderMode = "manual" | "id";

function fieldToWrite(r: ProductCustomFieldDto, sortOrder: number): ProductCustomFieldWrite {
  return {
    name: r.name,
    slug: r.slug,
    type: r.type,
    settings_json: (r.settings_json ?? {}) as Record<string, unknown>,
    sort_order: sortOrder,
    is_active: r.is_active,
    options: (r.options ?? []).map((o) => ({
      id: o.id,
      label: o.label,
      sort_order: o.sort_order,
    })),
  };
}

function matchesSearch(row: ProductCustomFieldDto, q: string): boolean {
  const term = q.trim().toLowerCase();
  if (!term) return true;
  const group = getFieldGroupName(row.settings_json as Record<string, unknown> | null);
  return (
    row.name.toLowerCase().includes(term) ||
    row.slug.toLowerCase().includes(term) ||
    group.toLowerCase().includes(term) ||
    String(row.id).includes(term) ||
    String(row.type).toLowerCase().includes(term)
  );
}

function countLabel(n: number): string {
  if (n === 1) return "1 pole";
  if (n >= 2 && n <= 4) return `${n} pola`;
  return `${n} pól`;
}

/**
 * Product custom fields admin list — AdminDataTable chrome + automation-style groups.
 */
export default function ProductCustomFieldsPage() {
  const navigate = useNavigate();
  const [tenantId, setTenantId] = useState<number | null>(null);
  const [tenantReady, setTenantReady] = useState(false);
  const [rows, setRows] = useState<ProductCustomFieldDto[]>([]);
  const [groups, setGroups] = useState<ProductCustomFieldGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [listOrderMode, setListOrderMode] = useState<ListOrderMode>("manual");
  const [idSort, setIdSort] = useState<"asc" | "desc">("asc");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    void fetchTenantsList()
      .then((list) => setTenantId(list[0]?.id ?? null))
      .catch(() => setTenantId(null))
      .finally(() => setTenantReady(true));
  }, []);

  const persistGroups = useCallback(
    (next: ProductCustomFieldGroup[]) => {
      if (tenantId == null) return;
      setGroups(next);
      saveProductCustomFieldGroups(tenantId, next);
    },
    [tenantId],
  );

  const load = useCallback(async () => {
    if (tenantId == null) {
      setRows([]);
      setGroups([]);
      setErr(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const list = await listProductCustomFields(tenantId);
      setRows(list);
      setSelectedIds(new Set());
      const stored = loadProductCustomFieldGroups(tenantId);
      const namesFromFields = new Set(
        list.map((r) => getFieldGroupName(r.settings_json as Record<string, unknown> | null)).filter(
          (n) => n !== PRODUCT_CUSTOM_FIELD_UNGROUPED,
        ),
      );
      const byName = new Map(stored.map((g) => [g.name, g]));
      for (const name of namesFromFields) {
        if (!byName.has(name)) {
          byName.set(name, {
            id: newProductCustomFieldGroupId(),
            name,
            sortOrder: (byName.size + 1) * 10,
          });
        }
      }
      const merged = [...byName.values()].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pl"),
      );
      setGroups(merged);
      saveProductCustomFieldGroups(tenantId, merged);
    } catch (e) {
      setErr(extractApiErrorMessage(e, "Nie udało się wczytać dodatkowych pól."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => rows.filter((r) => matchesSearch(r, search)), [rows, search]);

  const displayRows = useMemo(() => {
    if (listOrderMode !== "id") return filteredRows;
    const copy = [...filteredRows];
    copy.sort((a, b) => (idSort === "asc" ? a.id - b.id : b.id - a.id));
    return copy;
  }, [filteredRows, listOrderMode, idSort]);

  const sections = useMemo(() => {
    const map = new Map<string, ProductCustomFieldDto[]>();
    for (const g of groups) map.set(g.name, []);
    map.set(PRODUCT_CUSTOM_FIELD_UNGROUPED, []);
    for (const row of displayRows) {
      const gName = getFieldGroupName(row.settings_json as Record<string, unknown> | null);
      if (!map.has(gName)) map.set(gName, []);
      map.get(gName)!.push(row);
    }
    const ordered: Array<[string, ProductCustomFieldDto[]]> = [];
    for (const g of groups) {
      ordered.push([g.name, map.get(g.name) ?? []]);
    }
    for (const [name, list] of map.entries()) {
      if (name === PRODUCT_CUSTOM_FIELD_UNGROUPED) continue;
      if (!groups.some((g) => g.name === name)) ordered.push([name, list]);
    }
    ordered.push([PRODUCT_CUSTOM_FIELD_UNGROUPED, map.get(PRODUCT_CUSTOM_FIELD_UNGROUPED) ?? []]);
    return ordered.filter(([name, list]) => list.length > 0 || name !== PRODUCT_CUSTOM_FIELD_UNGROUPED || groups.length === 0);
  }, [displayRows, groups]);

  const reorderEnabled = listOrderMode === "manual" && search.trim() === "";
  const visibleIds = useMemo(() => displayRows.map((r) => r.id), [displayRows]);
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
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const persistReorder = async (next: ProductCustomFieldDto[], prev: ProductCustomFieldDto[]) => {
    if (tenantId == null) return;
    const prevOrder = new Map(prev.map((r) => [r.id, r.sort_order]));
    const changed = next.filter((r) => prevOrder.get(r.id) !== r.sort_order);
    if (changed.length === 0) return;
    setReorderBusy(true);
    setErr(null);
    try {
      await Promise.all(
        changed.map((r) => updateProductCustomField(tenantId, r.id, fieldToWrite(r, r.sort_order))),
      );
    } catch (e) {
      setErr(extractApiErrorMessage(e, "Nie udało się zapisać kolejności pól."));
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

  const onDeleteOne = async (row: ProductCustomFieldDto) => {
    if (tenantId == null) return;
    if (!window.confirm(`Usunąć pole „${row.name}”?`)) return;
    setErr(null);
    try {
      await deleteProductCustomField(tenantId, row.id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      toast.success("Usunięto pole.");
      await load();
    } catch (e) {
      setErr(extractApiErrorMessage(e, "Nie udało się usunąć pola."));
    }
  };

  const onBulkDelete = async () => {
    if (tenantId == null || selectedCount === 0) return;
    if (!window.confirm(`Usunąć zaznaczone pola (${selectedCount})?`)) return;
    setBulkBusy(true);
    setErr(null);
    try {
      await bulkDeleteProductCustomFields(tenantId, [...selectedIds]);
      toast.success("Usunięto zaznaczone pola.");
      await load();
    } catch (e) {
      setErr(extractApiErrorMessage(e, "Nie udało się usunąć zaznaczonych pól."));
    } finally {
      setBulkBusy(false);
    }
  };

  const onCreateGroup = () => {
    const name = window.prompt("Nazwa grupy");
    if (name == null) return;
    const cleaned = name.trim();
    if (!cleaned || cleaned === PRODUCT_CUSTOM_FIELD_UNGROUPED) {
      toast.error("Podaj prawidłową nazwę grupy.");
      return;
    }
    if (groups.some((g) => g.name.toLowerCase() === cleaned.toLowerCase())) {
      toast.error("Taka grupa już istnieje.");
      return;
    }
    persistGroups([
      ...groups,
      { id: newProductCustomFieldGroupId(), name: cleaned, sortOrder: (groups.length + 1) * 10 },
    ]);
    setOpenGroups((prev) => ({ ...prev, [cleaned]: true }));
  };

  const onRenameGroup = async (oldName: string) => {
    if (tenantId == null || oldName === PRODUCT_CUSTOM_FIELD_UNGROUPED) return;
    const nextName = window.prompt("Nowa nazwa grupy", oldName);
    if (nextName == null) return;
    const cleaned = nextName.trim();
    if (!cleaned || cleaned === PRODUCT_CUSTOM_FIELD_UNGROUPED) {
      toast.error("Podaj prawidłową nazwę grupy.");
      return;
    }
    if (cleaned === oldName) return;
    if (groups.some((g) => g.name.toLowerCase() === cleaned.toLowerCase() && g.name !== oldName)) {
      toast.error("Taka grupa już istnieje.");
      return;
    }
    const affected = rows.filter(
      (r) => getFieldGroupName(r.settings_json as Record<string, unknown> | null) === oldName,
    );
    setReorderBusy(true);
    try {
      await Promise.all(
        affected.map((r) =>
          updateProductCustomField(tenantId, r.id, {
            ...fieldToWrite(r, r.sort_order),
            settings_json: withFieldGroupName(r.settings_json as Record<string, unknown> | null, cleaned),
          }),
        ),
      );
      persistGroups(groups.map((g) => (g.name === oldName ? { ...g, name: cleaned } : g)));
      setOpenGroups((prev) => {
        const next = { ...prev };
        next[cleaned] = prev[oldName] ?? true;
        delete next[oldName];
        return next;
      });
      await load();
      toast.success("Zmieniono nazwę grupy.");
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się zmienić nazwy grupy."));
    } finally {
      setReorderBusy(false);
    }
  };

  const onDeleteGroup = async (name: string) => {
    if (tenantId == null || name === PRODUCT_CUSTOM_FIELD_UNGROUPED) return;
    if (!window.confirm(`Usunąć grupę „${name}”? Pola trafią do „Bez grupy”.`)) return;
    const affected = rows.filter(
      (r) => getFieldGroupName(r.settings_json as Record<string, unknown> | null) === name,
    );
    setReorderBusy(true);
    try {
      await Promise.all(
        affected.map((r) =>
          updateProductCustomField(tenantId, r.id, {
            ...fieldToWrite(r, r.sort_order),
            settings_json: withFieldGroupName(r.settings_json as Record<string, unknown> | null, null),
          }),
        ),
      );
      persistGroups(groups.filter((g) => g.name !== name));
      await load();
      toast.success("Usunięto grupę.");
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się usunąć grupy."));
    } finally {
      setReorderBusy(false);
    }
  };

  const moveGroup = (name: string, dir: -1 | 1) => {
    const idx = groups.findIndex((g) => g.name === name);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= groups.length) return;
    const next = [...groups];
    const tmp = next[idx]!;
    next[idx] = next[j]!;
    next[j] = tmp;
    persistGroups(next.map((g, i) => ({ ...g, sortOrder: (i + 1) * 10 })));
  };

  const toggleGroup = (gName: string) =>
    setOpenGroups((prev) => ({ ...prev, [gName]: !(prev[gName] ?? true) }));

  const shell = `${moduleAutomationShellClass} w-full max-w-none pb-6`;

  let body: ReactNode;
  if (!tenantReady) {
    body = <div className={`${shell} text-sm text-slate-600`}>Ładowanie…</div>;
  } else if (tenantId == null) {
    body = (
      <div className={shell}>
        <p className="text-sm text-slate-600">Brak dostępnego podmiotu — nie można wczytać listy pól.</p>
      </div>
    );
  } else {
    body = (
      <div className={shell}>
        <ModuleListBreadcrumb
          items={[
            { label: UI_STRINGS.navigation.assortment, to: "/products" },
            { label: "Dodatkowe pola" },
          ]}
        />

        <div className="mb-4 mt-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-slate-900">Dodatkowe pola produktów</h1>
            {!loading ? (
              <p className="mt-1 text-sm text-slate-500">{countLabel(rows.length)}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <GhostButton type="button" density="compact" onClick={onCreateGroup}>
              <Plus className="mr-1.5 h-4 w-4" strokeWidth={2} aria-hidden />
              Dodaj grupę
            </GhostButton>
            <button type="button" onClick={() => navigate("/product-custom-fields/new")} className={oaBtnPri}>
              <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              Dodaj pole
            </button>
          </div>
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

        {reorderBusy ? <p className="mb-2 text-xs text-slate-500">Zapisywanie…</p> : null}

        {selectedCount > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="text-sm font-medium text-slate-800">
              Zaznaczono: <span className="tabular-nums">{selectedCount}</span>
            </span>
            <button type="button" className={oaBtnDanger} disabled={bulkBusy} onClick={() => void onBulkDelete()}>
              Usuń zaznaczone
            </button>
          </div>
        ) : null}

        {loading && rows.length === 0 ? (
          <div className={moduleListEmptyStateClass}>Ładowanie listy…</div>
        ) : rows.length === 0 && groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-400">
              <ClipboardList className="h-7 w-7" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="mt-5 text-base font-semibold text-slate-900">Brak dodatkowych pól</p>
            <button
              type="button"
              className={`${oaBtnPri} mt-6`}
              onClick={() => navigate("/product-custom-fields/new")}
            >
              <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              Dodaj pierwsze pole
            </button>
          </div>
        ) : displayRows.length === 0 && search.trim() ? (
          <div className="rounded-lg border border-dashed border-slate-200 px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-800">Brak wyników wyszukiwania</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              {sections.map(([gName, list]) => {
                const open = openGroups[gName] ?? true;
                const isUngrouped = gName === PRODUCT_CUSTOM_FIELD_UNGROUPED;
                const sortableIds = productCustomFieldsSortableIds(list);
                return (
                  <section key={gName} className={oaWorkflowGroupSectionClass}>
                    <div className="flex items-center gap-1 border-b border-slate-200 bg-white">
                      <button
                        type="button"
                        className={`${oaWorkflowGroupHeaderClass} min-w-0 flex-1 border-b-0`}
                        onClick={() => toggleGroup(gName)}
                        aria-expanded={open}
                      >
                        <ChevronDown
                          className={`h-5 w-5 shrink-0 text-slate-700 transition-transform ${open ? "" : "-rotate-90"}`}
                          strokeWidth={2}
                          aria-hidden
                        />
                        <h3 className="min-w-0 flex-1 truncate text-base font-extrabold uppercase tracking-wide text-slate-900">
                          {gName}{" "}
                          <span className="font-semibold text-slate-600">({list.length})</span>
                        </h3>
                      </button>
                      {!isUngrouped ? (
                        <div className="flex shrink-0 items-center gap-0.5 pr-2">
                          <GhostButton
                            type="button"
                            density="compact"
                            title="Wyżej"
                            aria-label="Przenieś grupę wyżej"
                            onClick={() => moveGroup(gName, -1)}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </GhostButton>
                          <GhostButton
                            type="button"
                            density="compact"
                            title="Niżej"
                            aria-label="Przenieś grupę niżej"
                            onClick={() => moveGroup(gName, 1)}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </GhostButton>
                          <GhostButton
                            type="button"
                            density="compact"
                            title="Zmień nazwę"
                            aria-label="Zmień nazwę grupy"
                            onClick={() => void onRenameGroup(gName)}
                          >
                            <Pencil className="h-4 w-4" />
                          </GhostButton>
                          <GhostButton
                            type="button"
                            density="compact"
                            title="Usuń grupę"
                            aria-label="Usuń grupę"
                            onClick={() => void onDeleteGroup(gName)}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </GhostButton>
                        </div>
                      ) : null}
                    </div>

                    {open ? (
                      list.length > 0 ? (
                        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                          <ProductCustomFieldsTable
                            rows={list}
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
                      ) : (
                        <div className="px-4 py-6 text-center text-sm text-slate-400">Brak pól w tej grupie.</div>
                      )
                    ) : null}
                  </section>
                );
              })}
            </DndContext>
          </div>
        )}
      </div>
    );
  }

  return <PageLayout fullBleed>{body}</PageLayout>;
}
