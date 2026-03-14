import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Eye } from "lucide-react";
import api from "../../api/axios";
import { formatMm } from "../../utils/formatMm";
import { TemplatePreview } from "../../components/labels/TemplatePreview";

const TENANT_ID = 1;
const PREVIEW_MAX_HEIGHT_PX = 260;
const PREVIEW_HOVER_DELAY_MS = 200;
const PREVIEW_LEAVE_DELAY_MS = 150;
const PAGE_SIZE = 24;
const SORT_OPTIONS = [
  { value: "updated_at_desc", label: "Ostatnio edytowane" },
  { value: "name_asc", label: "Nazwa A–Z" },
  { value: "name_desc", label: "Nazwa Z–A" },
] as const;

type TemplateRow = {
  id: number;
  tenant_id: number;
  group_id: number | null;
  name: string;
  template_type: string | null;
  template_json: string;
  created_at: string | null;
  updated_at: string | null;
};

type TemplateWithMeta = TemplateRow & {
  widthMm?: number;
  heightMm?: number;
  is_default?: boolean;
};

type GroupRow = {
  id: number;
  tenant_id: number;
  template_type: string;
  name: string;
  created_at: string | null;
  updated_at: string | null;
};

const TYPE_ORDER = ["location", "cart", "basket", "product", "order"] as const;
const TYPE_LABELS: Record<string, string> = {
  location: "Lokalizacja",
  cart: "Wózek",
  basket: "Koszyk",
  product: "Produkt",
  order: "Zamówienie",
};

const UNGROUPED_ID = "__ungrouped__";

export function LabelTemplatesList() {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<string>(TYPE_ORDER[0]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | number | null>(UNGROUPED_ID);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [templates, setTemplates] = useState<TemplateWithMeta[]>([]);
  const [_defaultIds, setDefaultIds] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<typeof SORT_OPTIONS[number]["value"]>("updated_at_desc");
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [page, setPage] = useState(1);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [movingToGroupId, setMovingToGroupId] = useState<number | null>(null);
  const [previewState, setPreviewState] = useState<{
    template: TemplateWithMeta;
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const previewLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        } catch {}
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
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const clearPreviewLeaveTimer = useCallback(() => {
    if (previewLeaveTimerRef.current) {
      clearTimeout(previewLeaveTimerRef.current);
      previewLeaveTimerRef.current = null;
    }
  }, []);

  const schedulePreviewHide = useCallback(() => {
    clearPreviewLeaveTimer();
    previewLeaveTimerRef.current = setTimeout(() => setPreviewState(null), PREVIEW_LEAVE_DELAY_MS);
  }, [clearPreviewLeaveTimer]);

  const showPreview = useCallback(
    (template: TemplateWithMeta, el: HTMLElement) => {
      if (previewHoverTimerRef.current) {
        clearTimeout(previewHoverTimerRef.current);
        previewHoverTimerRef.current = null;
      }
      clearPreviewLeaveTimer();
      const rect = el.getBoundingClientRect();
      setPreviewState({
        template,
        left: rect.left,
        top: rect.bottom + 8,
        width: rect.width,
      });
    },
    [clearPreviewLeaveTimer]
  );

  const handleCardMouseEnter = useCallback(
    (t: TemplateWithMeta, e: React.MouseEvent<HTMLElement>) => {
      if (previewHoverTimerRef.current) clearTimeout(previewHoverTimerRef.current);
      previewHoverTimerRef.current = setTimeout(
        () => showPreview(t, e.currentTarget),
        PREVIEW_HOVER_DELAY_MS
      );
    },
    [showPreview]
  );

  const handleCardMouseLeave = useCallback(() => {
    if (previewHoverTimerRef.current) {
      clearTimeout(previewHoverTimerRef.current);
      previewHoverTimerRef.current = null;
    }
    schedulePreviewHide();
  }, [schedulePreviewHide]);

  const handlePreviewPanelMouseEnter = useCallback(() => {
    clearPreviewLeaveTimer();
    if (previewLeaveTimerRef.current) {
      clearTimeout(previewLeaveTimerRef.current);
      previewLeaveTimerRef.current = null;
    }
  }, [clearPreviewLeaveTimer]);

  const handlePreviewPanelMouseLeave = useCallback(() => {
    schedulePreviewHide();
  }, [schedulePreviewHide]);

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

  const handleEdit = (id: number) => navigate(`/labels/designer/${id}`);
  const handleNew = () => navigate("/labels/designer/new");

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
    [fetchTemplates]
  );

  const templateCard = (t: TemplateWithMeta) => (
    <div
      key={t.id}
      className="template-card relative w-full max-w-[320px] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col transition-all duration-200 hover:shadow-md hover:scale-[1.02] hover:border-slate-300"
      onMouseEnter={(e) => handleCardMouseEnter(t, e)}
      onMouseLeave={handleCardMouseLeave}
    >
      <div className="p-3 flex flex-col gap-2 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-800 truncate text-sm">{t.name}</div>
            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>{formatMm(t.widthMm)} × {formatMm(t.heightMm)} mm</span>
              <span
                className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600 cursor-default"
                title="Powiększ podgląd"
                onMouseEnter={(e) => {
                  e.stopPropagation();
                  if (previewHoverTimerRef.current) {
                    clearTimeout(previewHoverTimerRef.current);
                    previewHoverTimerRef.current = null;
                  }
                  const card = (e.currentTarget as HTMLElement).closest(".template-card") as HTMLElement;
                  if (card) showPreview(t, card);
                }}
                onMouseLeave={(e) => e.stopPropagation()}
              >
                <Eye className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                <span className="text-[10px]">Podgląd</span>
              </span>
            </div>
          </div>
          {t.is_default && (
            <span className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-100 text-cyan-800">
              Domyślny
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => handleEdit(t.id)}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              Edytuj
            </button>
            <button
              type="button"
              onClick={() => handleDuplicate(t)}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              Duplikuj
            </button>
            <button
              type="button"
              onClick={() => handleDelete(t.id)}
              disabled={deletingId === t.id}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {deletingId === t.id ? "…" : "Usuń"}
            </button>
        </div>
        {groups.length > 0 && (
          <div className="pt-1 border-t border-slate-100">
            <label className="text-[10px] text-slate-500 block mb-1">Przenieś do grupy</label>
            <select
              value={t.group_id ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                handleMoveToGroup(t, v === "" ? null : Number(v));
              }}
              disabled={movingToGroupId === t.id}
              className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
            >
              <option value="">Bez grupy</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );

  const templateRow = (t: TemplateWithMeta) => (
    <div
      key={t.id}
      className="template-row flex items-center justify-between gap-4 py-2 px-3 rounded-lg hover:bg-slate-50 border-b border-slate-100 last:border-0"
    >
      <div className="min-w-0">
        <div className="font-medium text-slate-800 truncate">{t.name}</div>
        <div className="text-xs text-slate-500">
          {formatMm(t.widthMm)} × {formatMm(t.heightMm)} mm
          {t.is_default && " · Domyślny"}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 cursor-pointer"
          title="Podgląd"
          onMouseEnter={(e) => {
            clearPreviewLeaveTimer();
            if (previewHoverTimerRef.current) {
              clearTimeout(previewHoverTimerRef.current);
              previewHoverTimerRef.current = null;
            }
            const row = (e.currentTarget as HTMLElement).closest(".template-row") as HTMLElement;
            if (row) showPreview(t, row);
          }}
          onMouseLeave={schedulePreviewHide}
        >
          <Eye className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          <span className="text-xs">Podgląd</span>
        </span>
        <button
          type="button"
          onClick={() => handleEdit(t.id)}
          className="px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
        >
          Edytuj
        </button>
        <button
          type="button"
          onClick={() => handleDuplicate(t)}
          className="px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
        >
          Duplikuj
        </button>
        <button
          type="button"
          onClick={() => handleDelete(t.id)}
          disabled={deletingId === t.id}
          className="px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          {deletingId === t.id ? "…" : "Usuń"}
        </button>
      </div>
    </div>
  );

  return (
    <>
    <div className="flex-1 min-h-0 flex bg-[#F8FAFC]">
      {/* Left: Label type */}
      <div className="w-48 shrink-0 border-r border-slate-200 bg-white p-3 flex flex-col gap-1">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-2 py-1">
          Typ etykiety
        </h2>
        {TYPE_ORDER.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              setSelectedType(type);
              setSelectedGroupId(UNGROUPED_ID);
            }}
            className={`text-left px-3 py-2 rounded-lg text-sm font-medium ${
              selectedType === type
                ? "bg-cyan-600 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {TYPE_LABELS[type] || type}
          </button>
        ))}
      </div>

      {/* Middle: Groups */}
      <div className="w-56 shrink-0 border-r border-slate-200 bg-white p-3 flex flex-col">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-2 py-1">
          Grupy
        </h2>
        <div className="flex-1 overflow-y-auto min-h-0 space-y-0.5">
          <button
            type="button"
            onClick={() => setSelectedGroupId(UNGROUPED_ID)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
              selectedGroupId === UNGROUPED_ID
                ? "bg-slate-200 font-medium text-slate-800"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Bez grupy
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelectedGroupId(g.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate ${
                selectedGroupId === g.id
                  ? "bg-slate-200 font-medium text-slate-800"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
        <div className="pt-2 border-t border-slate-100 mt-2">
          <div className="flex gap-1">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Nazwa grupy"
              className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm min-w-0"
              onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
            />
            <button
              type="button"
              onClick={handleCreateGroup}
              disabled={!newGroupName.trim() || creatingGroup}
              className="px-2 py-1.5 rounded-lg bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 disabled:opacity-50"
            >
              +
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 px-0.5">Nowa grupa</p>
        </div>
      </div>

      {/* Right: Templates */}
      <div className="flex-1 min-w-0 flex flex-col p-4">
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <h1 className="text-lg font-bold text-slate-800">
            {TYPE_LABELS[selectedType] || selectedType}
          </h1>
          <button
            type="button"
            onClick={handleNew}
            className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-700"
          >
            + Nowy szablon
          </button>
        </div>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Szukaj szablonów..."
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-56 max-w-full"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("card")}
              className={`px-3 py-1.5 text-sm rounded-md ${
                viewMode === "card" ? "bg-slate-200 font-medium" : "hover:bg-slate-100"
              }`}
              title="Karty"
            >
              Karty
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 text-sm rounded-md ${
                viewMode === "list" ? "bg-slate-200 font-medium" : "hover:bg-slate-100"
              }`}
              title="Lista"
            >
              Lista
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-slate-500 py-8">Ładowanie…</p>
        ) : (
          <>
            <div className="text-sm text-slate-500 mb-2">
              {filteredAndSorted.length} szablonów
              {filteredAndSorted.length > PAGE_SIZE && (
                <span> (strona {page} z {totalPages})</span>
              )}
            </div>
            {paginated.length === 0 ? (
              <p className="text-slate-500 py-8">
                {searchQuery.trim() ? "Brak szablonów pasujących do wyszukiwania." : "Brak szablonów."}
              </p>
            ) : viewMode === "card" ? (
              <div
                className="grid gap-4 overflow-y-auto"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 320px))" }}
              >
                {paginated.map((t) => templateCard(t))}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-y-auto">
                {paginated.map((t) => templateRow(t))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm disabled:opacity-50"
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
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm disabled:opacity-50"
                >
                  →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>

    {previewState && (
      <div
        className="fixed z-[100] rounded-xl border border-slate-200 bg-white shadow-lg"
        style={{
          left: previewState.left,
          top: previewState.top,
          width: previewState.width,
          maxWidth: previewState.width,
          padding: 12,
          boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
          borderRadius: 12,
        }}
        onMouseEnter={handlePreviewPanelMouseEnter}
        onMouseLeave={handlePreviewPanelMouseLeave}
      >
        <div
          style={{
            width: "100%",
            height: 140,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <TemplatePreview
            templateId={previewState.template.id}
            template={(() => {
              try {
                return JSON.parse(previewState.template.template_json) as Record<string, unknown>;
              } catch {
                return {};
              }
            })()}
            containerWidthPx={Math.max(1, previewState.width - 24)}
            containerHeightPx={140}
          />
        </div>
      </div>
    )}
    </>
  );
}
