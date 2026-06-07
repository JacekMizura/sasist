import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Box,
  Eye,
  FileSpreadsheet,
  FileText,
  Package,
  Plus,
  ShoppingBasket,
  ShoppingCart,
  Warehouse,
} from "lucide-react";
import api from "../../api/axios";
import { exportLabelTemplatesJson } from "../../api/labelTemplatesPortabilityApi";
import { formatMm } from "../../utils/formatMm";
import { TemplatePreview } from "../../components/labels/TemplatePreview";
import { labelModuleBasePath } from "./labelModuleBasePath";
import {
  DOCUMENT_PRINT_MODULE_TYPE_LABELS,
  DOCUMENT_PRINT_MODULE_TYPE_ORDER,
  LABEL_PRINT_MODULE_TYPE_LABELS,
  LABEL_PRINT_MODULE_TYPE_ORDER,
  printModuleTypeLabel,
} from "./labelPrintModuleTypes";

const TENANT_ID = 1;
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

const UNGROUPED_ID = "__ungrouped__";

function parseTemplateJson(templateJson: string): Record<string, unknown> {
  try {
    return JSON.parse(templateJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getCardPreviewSize(widthMm = 50, heightMm = 30): { width: number; height: number } {
  const safeHeight = Math.max(heightMm, 1);
  const ratio = widthMm / safeHeight;
  if (ratio >= 1.7) return { width: 304, height: 102 };
  if (ratio <= 1.1) return { width: 126, height: 126 };
  return { width: 244, height: 124 };
}

function getModalPreviewSize(widthMm = 50, heightMm = 30): { width: number; height: number } {
  const safeHeight = Math.max(heightMm, 1);
  const ratio = widthMm / safeHeight;
  const maxWidth = 760;
  const maxHeight = 360;
  const minWidth = 300;
  const minHeight = 180;

  let width = maxWidth;
  let height = Math.round(width / ratio);
  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(height * ratio);
  }
  width = Math.max(minWidth, width);
  height = Math.max(minHeight, height);
  return { width, height };
}

/** Większy podgląd w wierszu listy — lepsze rozpoznanie szablonu bez trybu kart. */
function getListRowPreviewSize(widthMm = 50, heightMm = 30): { boxW: number; boxH: number; cw: number; ch: number } {
  const safeH = Math.max(heightMm, 1);
  const ratio = widthMm / safeH;
  const boxW = 120;
  const boxH = 76;
  if (ratio >= 1.65) return { boxW, boxH, cw: 108, ch: 40 };
  if (ratio <= 1.08) return { boxW, boxH, cw: 58, ch: 58 };
  return { boxW, boxH, cw: 96, ch: 52 };
}

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
  const [sortBy, setSortBy] = useState<typeof SORT_OPTIONS[number]["value"]>("updated_at_desc");
  const [viewMode, setViewMode] = useState<"card" | "list">("list");
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

  const formatEditedMeta = (iso: string | null): string => {
    if (!iso) return "Brak daty edycji";
    const date = new Date(iso);
    const now = new Date();
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    if (sameDay) return "Edytowano dziś";
    return `Edytowano ${date.toLocaleDateString("pl-PL")}`;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "location":
        return <Warehouse className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />;
      case "cart":
        return <ShoppingCart className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />;
      case "basket":
        return <ShoppingBasket className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />;
      case "product":
        return <Package className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />;
      case "order":
        return <Box className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />;
      case "document_receipt":
      case "document_invoice":
      case "document_wz":
      case "document_correction":
        return <FileText className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />;
      default:
        return <Box className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />;
    }
  };

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
      className="template-card relative flex w-full max-w-[320px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:scale-[1.01] hover:border-slate-300 hover:shadow-md"
    >
      <button
        type="button"
        onClick={() => setPreviewModalTemplate(t)}
        className="group border-b border-slate-100 bg-slate-50/70 p-2 text-left"
        aria-label={`Podgląd szablonu ${t.name}`}
      >
        <div className="relative flex h-32 w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white p-1">
          <TemplatePreview
            templateId={t.id}
            template={parseTemplateJson(t.template_json)}
            containerWidthPx={getCardPreviewSize(t.widthMm, t.heightMm).width}
            containerHeightPx={getCardPreviewSize(t.widthMm, t.heightMm).height}
          />
          <div className="pointer-events-none absolute inset-0 bg-slate-900/0 transition-colors group-hover:bg-slate-900/[0.03]" />
        </div>
      </button>
      <div className="flex min-w-0 flex-col gap-2 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
            checked={selectedIds.has(t.id)}
            onChange={() => toggleSelectId(t.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Zaznacz szablon ${t.name}`}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-800">{t.name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
              <span>{formatMm(t.widthMm)} × {formatMm(t.heightMm)} mm</span>
              <span>•</span>
              <span>{formatEditedMeta(t.updated_at)}</span>
              <span>•</span>
              <span>Brak statystyk użyć</span>
            </div>
          </div>
          {t.is_default && (
            <span className="shrink-0 rounded-md bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-800">
              Domyślny
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => handleEdit(t.id)}
            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Edytuj
          </button>
          <button
            type="button"
            onClick={() => handleDuplicate(t)}
            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Duplikuj
          </button>
          <button
            type="button"
            onClick={() => handleDelete(t.id)}
            disabled={deletingId === t.id}
            className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {deletingId === t.id ? "…" : "Usuń"}
          </button>
        </div>
        {groups.length > 0 && (
          <div className="border-t border-slate-100 pt-1">
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

  const templateRow = (t: TemplateWithMeta) => {
    const listPv = getListRowPreviewSize(t.widthMm, t.heightMm);
    return (
    <div
      key={t.id}
      className="template-row group flex items-center justify-between gap-3 rounded-lg border-b border-slate-100 px-2.5 py-1.5 transition-all duration-150 last:border-0 hover:bg-white hover:shadow-sm"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 rounded border-slate-300"
          checked={selectedIds.has(t.id)}
          onChange={() => toggleSelectId(t.id)}
          aria-label={`Zaznacz szablon ${t.name}`}
        />
        <button
          type="button"
          onClick={() => setPreviewModalTemplate(t)}
          className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white p-1 transition hover:border-cyan-300 hover:shadow-sm"
          style={{ width: listPv.boxW, height: listPv.boxH }}
          aria-label={`Podgląd szablonu ${t.name}`}
        >
          <TemplatePreview
            templateId={t.id}
            template={parseTemplateJson(t.template_json)}
            containerWidthPx={listPv.cw}
            containerHeightPx={listPv.ch}
          />
        </button>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-800">{t.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
            <span>{formatMm(t.widthMm)} × {formatMm(t.heightMm)} mm</span>
            <span>•</span>
            <span>{formatEditedMeta(t.updated_at)}</span>
            <span>•</span>
            <span>Brak statystyk użyć</span>
            {t.is_default && (
              <>
                <span>•</span>
                <span className="rounded-sm bg-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800">Domyślny</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPreviewModalTemplate(t)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Eye className="h-3.5 w-3.5 text-slate-500" strokeWidth={2} aria-hidden />
          Podgląd
        </button>
        <button
          type="button"
          onClick={() => handleEdit(t.id)}
          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          Edytuj
        </button>
        <button
          type="button"
          onClick={() => handleDuplicate(t)}
          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          Duplikuj
        </button>
        <button
          type="button"
          onClick={() => handleDelete(t.id)}
          disabled={deletingId === t.id}
          className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          {deletingId === t.id ? "…" : "Usuń"}
        </button>
      </div>
    </div>
    );
  };

  return (
    <>
    <div className="flex min-h-0 min-w-0 gap-4">
      <div className="flex shrink-0 gap-3 border-r border-slate-200 pr-4">
      {/* Left: Label type */}
      <div className="flex w-48 shrink-0 flex-col gap-1 p-0">
        <h2 className="px-2 py-1 text-xs font-bold uppercase tracking-wider text-slate-500">
          Typ etykiety
        </h2>
        {LABEL_PRINT_MODULE_TYPE_ORDER.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              setSelectedType(type);
              setSelectedGroupId(UNGROUPED_ID);
            }}
            className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
              selectedType === type
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <span className={`${selectedType === type ? "text-white" : "text-slate-500 group-hover:text-slate-700"}`}>
              {getTypeIcon(type)}
            </span>
            {LABEL_PRINT_MODULE_TYPE_LABELS[type] || type}
          </button>
        ))}
        <h3 className="mt-3 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Dokumenty</h3>
        {DOCUMENT_PRINT_MODULE_TYPE_ORDER.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              setSelectedType(type);
              setSelectedGroupId(UNGROUPED_ID);
            }}
            className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
              selectedType === type
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <span className={`${selectedType === type ? "text-white" : "text-slate-500 group-hover:text-slate-700"}`}>
              {getTypeIcon(type)}
            </span>
            {DOCUMENT_PRINT_MODULE_TYPE_LABELS[type] || type}
          </button>
        ))}
      </div>

      {/* Middle: Groups */}
      <div className="flex w-56 shrink-0 flex-col border-l border-slate-200 pl-3">
        <h2 className="px-2 py-1 text-xs font-bold uppercase tracking-wider text-slate-500">
          Grupy
        </h2>
        <div className="flex-1 overflow-y-auto min-h-0 space-y-0.5">
          <button
            type="button"
            onClick={() => setSelectedGroupId(UNGROUPED_ID)}
            className={`w-full rounded-lg px-3 py-1.5 text-left text-sm transition ${
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
              className={`w-full truncate rounded-lg px-3 py-1.5 text-left text-sm transition ${
                selectedGroupId === g.id
                  ? "bg-slate-200 font-medium text-slate-800"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
        <div className="border-t border-slate-100 pt-2">
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
      </div>

      {/* Right: Templates */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-bold text-slate-800">
            {printModuleTypeLabel(selectedType)}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedIds.size === 0 || exportBusy}
              onClick={() => void handleExportSelected()}
              className="rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
            >
              {exportBusy ? "Eksport…" : `Eksport JSON (${selectedIds.size})`}
            </button>
            <button
              type="button"
              onClick={selectAllOnPage}
              disabled={paginated.length === 0}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Zaznacz stronę
            </button>
            <Link
              to="/settings/import?kind=label_templates"
              className="rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800"
            >
              Import szablonów
            </Link>
            <button
              type="button"
              onClick={handleNew}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 hover:shadow-md"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              Nowy szablon
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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
          <div className="flex flex-col gap-4">
            <div className="text-sm text-slate-500">
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
              <div className="overflow-hidden overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50">
                {paginated.map((t) => templateRow(t))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
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
          </div>
        )}
      </div>
    </div>

    {previewModalTemplate && (
      <div
        className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/35 p-4"
        onClick={() => setPreviewModalTemplate(null)}
      >
        <div
          className="w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">{previewModalTemplate.name}</h3>
              <p className="text-xs text-slate-500">
                {formatMm(previewModalTemplate.widthMm)} × {formatMm(previewModalTemplate.heightMm)} mm
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPreviewModalTemplate(null)}
              className="rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800"
            >
              Zamknij
            </button>
          </div>
          <div
            className="flex items-center justify-center p-3"
            style={{
              backgroundImage:
                "linear-gradient(45deg, rgba(148,163,184,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(148,163,184,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(148,163,184,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(148,163,184,0.08) 75%)",
              backgroundSize: "12px 12px",
              backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
              backgroundColor: "#f8fafc",
            }}
          >
            <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
              <TemplatePreview
                templateId={previewModalTemplate.id}
                template={parseTemplateJson(previewModalTemplate.template_json)}
                containerWidthPx={getModalPreviewSize(previewModalTemplate.widthMm, previewModalTemplate.heightMm).width}
                containerHeightPx={getModalPreviewSize(previewModalTemplate.widthMm, previewModalTemplate.heightMm).height}
              />
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
