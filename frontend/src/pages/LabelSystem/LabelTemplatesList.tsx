import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import api from "../../api/axios";
import { exportLabelTemplatesJson } from "../../api/labelTemplatesPortabilityApi";
import { labelModuleBasePath } from "./labelModuleBasePath";
import { LABEL_PRINT_MODULE_TYPE_ORDER, printModuleTypeLabel } from "./labelPrintModuleTypes";
import TemplateGridCard from "./templatesList/TemplateGridCard";
import TemplateListRow from "./templatesList/TemplateListRow";
import TemplatePreviewModal from "./templatesList/TemplatePreviewModal";
import TemplatesListSidebar from "./templatesList/TemplatesListSidebar";
import TemplatesListToolbar from "./templatesList/TemplatesListToolbar";
import {
  PAGE_SIZE,
  TENANT_ID,
  UNGROUPED_ID,
  type GroupRow,
  type SortValue,
  type TemplateRow,
  type TemplateWithMeta,
  type ViewMode,
} from "./templatesList/templatesListTypes";

/**
 * Szablony list — inner layout only (types/groups rail + full-width rows).
 * Does not change SASIST sidebar, top navbar, or module tabs.
 */
export function LabelTemplatesList() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const labelBase = labelModuleBasePath(pathname);
  const [selectedType, setSelectedType] = useState<string>(LABEL_PRINT_MODULE_TYPE_ORDER[0]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | number | null>(UNGROUPED_ID);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [templates, setTemplates] = useState<TemplateWithMeta[]>([]);
  const [_defaultIds, setDefaultIds] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortValue>("updated_at_desc");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [page, setPage] = useState(1);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [movingToGroupId, setMovingToGroupId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [exportBusy, setExportBusy] = useState(false);
  const [previewModalTemplate, setPreviewModalTemplate] = useState<TemplateWithMeta | null>(null);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await api.get<GroupRow[]>(`/label-templates/groups`, {
        params: { tenant_id: TENANT_ID, template_type: selectedType },
      });
      setGroups(Array.isArray(res.data) ? res.data : []);
    } catch {
      setGroups([]);
    }
  }, [selectedType]);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        tenant_id: TENANT_ID,
        template_type: selectedType,
      };
      if (selectedGroupId !== UNGROUPED_ID && selectedGroupId != null && typeof selectedGroupId === "number") {
        params.group_id = selectedGroupId;
      }
      const [listRes, tenantRes] = await Promise.all([
        api.get<TemplateRow[]>("/label-templates/", { params }),
        api.get<Record<string, number | null>>(`/tenants/${TENANT_ID}/`),
      ]);
      let list = Array.isArray(listRes.data) ? listRes.data : [];
      if (selectedGroupId === UNGROUPED_ID) {
        list = list.filter((t) => t.group_id == null);
      }
      const tenant = tenantRes.data || {};
      const defaults: Record<string, number | null> = {
        location: tenant.default_location_template_id ?? null,
        cart: tenant.default_cart_template_id ?? null,
        basket: tenant.default_basket_template_id ?? null,
      };
      setDefaultIds(defaults);

      const withMeta: TemplateWithMeta[] = list.map((row) => {
        let widthMm = 50;
        let heightMm = 30;
        try {
          const parsed = JSON.parse(row.template_json);
          widthMm = parsed.widthMm ?? 50;
          heightMm = parsed.heightMm ?? 30;
        } catch {
          /* keep defaults */
        }
        const typeKey = (row.template_type || "location").toLowerCase();
        const is_default = defaults[typeKey] === row.id;
        return { ...row, widthMm, heightMm, is_default };
      });
      setTemplates(withMeta);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [selectedType, selectedGroupId]);

  useEffect(() => {
    void fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const filteredAndSorted = useMemo(() => {
    let list = templates;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q));
    }
    if (sortBy === "name_asc") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === "name_desc") list = [...list].sort((a, b) => b.name.localeCompare(a.name));
    if (sortBy === "updated_at_desc")
      list = [...list].sort((a, b) => {
        const au = a.updated_at || "";
        const bu = b.updated_at || "";
        return bu.localeCompare(au);
      });
    return list;
  }, [templates, searchQuery, sortBy]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredAndSorted.slice(start, start + PAGE_SIZE);
  }, [filteredAndSorted, page]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [searchQuery, sortBy, selectedGroupId, selectedType]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedGroupId, selectedType]);

  const toggleSelectId = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const selectAllOnPage = useCallback(() => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      paginated.forEach((t) => n.add(t.id));
      return n;
    });
  }, [paginated]);

  const handleExportSelected = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setExportBusy(true);
    try {
      await exportLabelTemplatesJson(TENANT_ID, ids);
    } catch (e) {
      console.error(e);
    } finally {
      setExportBusy(false);
    }
  }, [selectedIds]);

  const handleEdit = (id: number) => navigate(`${labelBase}/${id}/edit`);
  const handleNew = () => navigate(`${labelBase}/new`);

  const handleDuplicate = async (row: TemplateWithMeta) => {
    try {
      await api.post("/label-templates/", {
        name: `${row.name} (kopia)`,
        template_json: row.template_json,
        template_type: row.template_type,
        group_id: row.group_id ?? undefined,
      });
      await fetchTemplates();
    } catch (e) {
      console.error("Duplicate failed:", e);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Usunąć ten szablon?")) return;
    setDeletingId(id);
    try {
      await api.delete(`/label-templates/${id}/`);
      await fetchTemplates();
    } catch (e) {
      console.error("Delete failed:", e);
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setCreatingGroup(true);
    try {
      const res = await api.post<GroupRow>("/label-templates/groups", {
        template_type: selectedType,
        name,
      });
      setNewGroupName("");
      await fetchGroups();
      setSelectedGroupId(res.data.id);
    } catch (e) {
      console.error("Create group failed:", e);
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleMoveToGroup = useCallback(
    async (t: TemplateWithMeta, groupId: number | null) => {
      if (t.group_id === groupId) return;
      setMovingToGroupId(t.id);
      try {
        await api.put(`/label-templates/${t.id}/`, {
          name: t.name,
          template_type: t.template_type ?? "location",
          template_json: t.template_json,
          group_id: groupId,
        });
        await fetchTemplates();
      } catch (e) {
        console.error("Move to group failed:", e);
      } finally {
        setMovingToGroupId(null);
      }
    },
    [fetchTemplates],
  );

  const handleSelectType = (type: string) => {
    setSelectedType(type);
    setSelectedGroupId(UNGROUPED_ID);
  };

  const itemProps = (t: TemplateWithMeta) => ({
    template: t,
    selected: selectedIds.has(t.id),
    onToggleSelect: () => toggleSelectId(t.id),
    onPreview: () => setPreviewModalTemplate(t),
    onEdit: () => handleEdit(t.id),
    onDuplicate: () => void handleDuplicate(t),
    onDelete: () => void handleDelete(t.id),
    deleting: deletingId === t.id,
    groups,
    moving: movingToGroupId === t.id,
    onMoveToGroup: (groupId: number | null) => void handleMoveToGroup(t, groupId),
  });

  return (
    <>
      <div className="flex min-h-0 w-full min-w-0 flex-1 gap-0">
        <TemplatesListSidebar
          selectedType={selectedType}
          onSelectType={handleSelectType}
          selectedGroupId={selectedGroupId}
          onSelectGroup={setSelectedGroupId}
          groups={groups}
          newGroupName={newGroupName}
          onNewGroupNameChange={setNewGroupName}
          onCreateGroup={() => void handleCreateGroup()}
          creatingGroup={creatingGroup}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-4 md:px-6 min-[1600px]:px-8">
          <TemplatesListToolbar
            typeLabel={printModuleTypeLabel(selectedType)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={sortBy}
            onSortChange={setSortBy}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            selectedCount={selectedIds.size}
            exportBusy={exportBusy}
            onExportSelected={() => void handleExportSelected()}
            onSelectAllOnPage={selectAllOnPage}
            pageItemCount={paginated.length}
            onNew={handleNew}
          />

          {loading ? (
            <p className="py-10 text-slate-500">Ładowanie…</p>
          ) : (
            <div className="flex min-w-0 flex-col gap-4">
              <p className="text-sm text-slate-500">
                {filteredAndSorted.length} szablonów
                {filteredAndSorted.length > PAGE_SIZE ? (
                  <span>
                    {" "}
                    (strona {page} z {totalPages})
                  </span>
                ) : null}
              </p>

              {paginated.length === 0 ? (
                <p className="py-10 text-slate-500">
                  {searchQuery.trim()
                    ? "Brak szablonów pasujących do wyszukiwania."
                    : "Brak szablonów."}
                </p>
              ) : viewMode === "list" ? (
                <div className="flex w-full min-w-0 flex-col gap-3">
                  {paginated.map((t) => (
                    <TemplateListRow key={t.id} {...itemProps(t)} />
                  ))}
                </div>
              ) : (
                <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 min-[1600px]:grid-cols-4 min-[1920px]:grid-cols-5">
                  {paginated.map((t) => (
                    <TemplateGridCard key={t.id} {...itemProps(t)} />
                  ))}
                </div>
              )}

              {totalPages > 1 ? (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    ←
                  </button>
                  <span className="text-sm text-slate-600">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    →
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {previewModalTemplate ? (
        <TemplatePreviewModal
          template={previewModalTemplate}
          onClose={() => setPreviewModalTemplate(null)}
        />
      ) : null}
    </>
  );
}
