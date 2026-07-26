import { useEffect, useMemo, useState } from "react";
import { FileText, LayoutGrid, List, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import {
  exportFullPackageZip,
  fetchDocumentTemplateCatalog,
  fetchDocumentTemplatesList,
  fetchTemplateUsage,
  type DocumentTemplateListItemDto,
} from "../../../api/documentTemplatesApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { PrimaryButton } from "../../../design-system";
import TemplateListRow from "../../LabelSystem/templatesList/TemplateListRow";
import TemplatesListToolbarShell from "../../LabelSystem/templatesList/TemplatesListToolbarShell";
import {
  TEMPLATES_LIST_CARD_GRID_CLASS,
  TEMPLATES_LIST_CONTENT_STACK_CLASS,
  TEMPLATES_LIST_COUNT_CLASS,
  TEMPLATES_LIST_EMPTY_CLASS,
  TEMPLATES_LIST_GHOST_BTN_CLASS,
  TEMPLATES_LIST_GRID_CARD_BASE_CLASS,
  TEMPLATES_LIST_GRID_CARD_BODY_CLASS,
  TEMPLATES_LIST_GRID_CARD_IDLE_CLASS,
  TEMPLATES_LIST_GRID_CARD_PREVIEW_BAND_CLASS,
  TEMPLATES_LIST_GRID_CARD_PREVIEW_WRAP_CLASS,
  TEMPLATES_LIST_GRID_CARD_RADIUS,
  TEMPLATES_LIST_MAIN_COLUMN_CLASS,
  TEMPLATES_LIST_ROOT_CLASS,
  TEMPLATES_LIST_ROWS_STACK_CLASS,
  TEMPLATES_LIST_SEARCH_INPUT_CLASS,
  TEMPLATES_LIST_SELECT_CLASS,
  TEMPLATES_LIST_VIEW_TOGGLE_BTN_CLASS,
  TEMPLATES_LIST_VIEW_TOGGLE_SHELL_CLASS,
} from "../../LabelSystem/templatesList/templatesListLayout";
import { DEFAULT_TENANT_ID, LIST_BASE } from "./constants";
import DocumentTemplatesListSidebar, { DOC_LIST_ALL } from "./DocumentTemplatesListSidebar";
import {
  documentTemplateKindSubtitle,
  documentTemplateListStatusPresentation,
  documentTemplateUsedAsLabels,
  fmtDocumentTemplateLastEdited,
} from "./documentTemplatesListPresentation";
import { TemplateUsageModal } from "./components/TemplateUsageModal";

type SortValue = "updated_at_desc" | "updated_at_asc" | "name_asc" | "name_desc";
type ViewMode = "list" | "card";

const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: "updated_at_desc", label: "Ostatnio edytowane" },
  { value: "updated_at_asc", label: "Najstarsze" },
  { value: "name_asc", label: "Nazwa A–Z" },
  { value: "name_desc", label: "Nazwa Z–A" },
];

async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DocumentTemplatesListPage() {
  const navigate = useNavigate();
  const [families, setFamilies] = useState<Awaited<ReturnType<typeof fetchDocumentTemplateCatalog>>>([]);
  const [items, setItems] = useState<DocumentTemplateListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFamilyCode, setSelectedFamilyCode] = useState(DOC_LIST_ALL);
  const [selectedKindCode, setSelectedKindCode] = useState(DOC_LIST_ALL);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortValue>("updated_at_desc");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [exportBusy, setExportBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [usageModal, setUsageModal] = useState<{
    name: string;
    badges: DocumentTemplateListItemDto["usage_summary"];
    items: Awaited<ReturnType<typeof fetchTemplateUsage>>["items"];
  } | null>(null);

  const kinds = useMemo(() => {
    if (selectedFamilyCode !== DOC_LIST_ALL) {
      return families.find((f) => f.code === selectedFamilyCode)?.kinds ?? [];
    }
    return families.flatMap((f) => f.kinds);
  }, [families, selectedFamilyCode]);

  const familyIconByCode = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const f of families) map[f.code] = f.icon;
    return map;
  }, [families]);

  const familyTitle =
    selectedFamilyCode === DOC_LIST_ALL
      ? "Wszystkie rodziny"
      : families.find((f) => f.code === selectedFamilyCode)?.name_pl ?? "Szablony";

  async function reload() {
    setLoading(true);
    try {
      const [catalog, rows] = await Promise.all([
        fetchDocumentTemplateCatalog(),
        fetchDocumentTemplatesList(DEFAULT_TENANT_ID, {
          family_code: selectedFamilyCode === DOC_LIST_ALL ? undefined : selectedFamilyCode,
          kind_code: selectedKindCode === DOC_LIST_ALL ? undefined : selectedKindCode,
          template_role: "DOCUMENT",
        }),
      ]);
      setFamilies(catalog);
      setItems(rows);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "Nie udało się wczytać listy."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on rail filters
  }, [selectedFamilyCode, selectedKindCode]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let rows = items;
    if (q) {
      rows = rows.filter(
        (row) =>
          row.name.toLowerCase().includes(q) ||
          (row.kind?.name_pl ?? "").toLowerCase().includes(q) ||
          (row.binding_summary ?? "").toLowerCase().includes(q),
      );
    }
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sortBy === "name_asc") return a.name.localeCompare(b.name, "pl");
      if (sortBy === "name_desc") return b.name.localeCompare(a.name, "pl");
      const aT = new Date(a.last_edited_at ?? a.updated_at ?? 0).getTime();
      const bT = new Date(b.last_edited_at ?? b.updated_at ?? 0).getTime();
      return sortBy === "updated_at_asc" ? aT - bT : bT - aT;
    });
    return sorted;
  }, [items, searchQuery, sortBy]);

  const onExportPackage = () => {
    setExportBusy(true);
    exportFullPackageZip(DEFAULT_TENANT_ID)
      .then((blob) => downloadBlob(blob, "szablony-pelny-pakiet.zip"))
      .catch((err) => toast.error(extractApiErrorMessage(err, "Eksport nie powiódł się.")))
      .finally(() => setExportBusy(false));
  };

  const handleSelectFamily = (code: string) => {
    setSelectedFamilyCode(code);
    setSelectedKindCode(DOC_LIST_ALL);
  };

  const rowMeta = (row: DocumentTemplateListItemDto) => {
    const status = documentTemplateListStatusPresentation(row);
    const usedAs = documentTemplateUsedAsLabels(row);
    const usage = row.usage_summary ?? [];
    const editedAt = row.last_edited_at ?? row.updated_at;
    const usedAsText =
      usedAs.length > 0
        ? `${usedAs.slice(0, 3).join(", ")}${usedAs.length > 3 ? ` +${usedAs.length - 3}` : ""}`
        : "—";
    const usedInText =
      usage.length > 0
        ? usage
            .slice(0, 3)
            .map((b) => `${b.label} (${b.count})`)
            .join(", ") + (usage.length > 3 ? ` +${usage.length - 3}` : "")
        : "—";
    return [
      documentTemplateKindSubtitle(row),
      status.primaryLabel,
      status.showNewerDraft ? "Nowszy draft" : null,
      `Używany jako: ${usedAsText}`,
      `Używane w: ${usedInText}`,
      fmtDocumentTemplateLastEdited(editedAt),
    ]
      .filter(Boolean)
      .join(" • ");
  };

  const rowThumbnail = (row: DocumentTemplateListItemDto) => {
    const icon = row.family?.code ? familyIconByCode[row.family.code] : null;
    if (icon) {
      return (
        <span className="text-2xl" aria-hidden>
          {icon}
        </span>
      );
    }
    return <FileText className="h-7 w-7 text-slate-400" aria-hidden />;
  };

  const openUsage = (row: DocumentTemplateListItemDto) => {
    void fetchTemplateUsage(DEFAULT_TENANT_ID, row.id).then((data) =>
      setUsageModal({ name: row.name, badges: data.badges, items: data.items }),
    );
  };

  return (
    <>
      <div className={TEMPLATES_LIST_ROOT_CLASS}>
        <DocumentTemplatesListSidebar
          families={families}
          selectedFamilyCode={selectedFamilyCode}
          onSelectFamily={handleSelectFamily}
          selectedKindCode={selectedKindCode}
          onSelectKind={setSelectedKindCode}
          kinds={kinds}
        />

        <div className={TEMPLATES_LIST_MAIN_COLUMN_CLASS}>
          <TemplatesListToolbarShell
            title={familyTitle}
            subtitle="Szablony wydruków dla wybranej rodziny"
            actions={
              <>
                <button
                  type="button"
                  disabled={exportBusy}
                  onClick={onExportPackage}
                  className={TEMPLATES_LIST_GHOST_BTN_CLASS}
                >
                  {exportBusy ? "Eksport…" : "Eksportuj"}
                </button>
                <PrimaryButton type="button" density="compact" onClick={() => navigate(`${LIST_BASE}/new`)}>
                  <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  Nowy szablon
                </PrimaryButton>
              </>
            }
            filters={
              <>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Szukaj szablonów…"
                  className={TEMPLATES_LIST_SEARCH_INPUT_CLASS}
                />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortValue)}
                  className={TEMPLATES_LIST_SELECT_CLASS}
                  aria-label="Sortowanie"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div className={TEMPLATES_LIST_VIEW_TOGGLE_SHELL_CLASS}>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={[
                      TEMPLATES_LIST_VIEW_TOGGLE_BTN_CLASS,
                      viewMode === "list" ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <List className="h-3.5 w-3.5" />
                    Lista
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("card")}
                    className={[
                      TEMPLATES_LIST_VIEW_TOGGLE_BTN_CLASS,
                      viewMode === "card" ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Karty
                  </button>
                </div>
              </>
            }
          />

          {loading ? (
            <p className={TEMPLATES_LIST_EMPTY_CLASS}>Ładowanie…</p>
          ) : (
            <div className={TEMPLATES_LIST_CONTENT_STACK_CLASS}>
              <p className={TEMPLATES_LIST_COUNT_CLASS}>
                {filtered.length} {filtered.length === 1 ? "szablon" : "szablonów"}
              </p>

              {filtered.length === 0 ? (
                <p className={TEMPLATES_LIST_EMPTY_CLASS}>
                  {searchQuery.trim() ? "Brak szablonów pasujących do wyszukiwania." : "Brak szablonów."}
                </p>
              ) : viewMode === "list" ? (
                <div className={TEMPLATES_LIST_ROWS_STACK_CLASS}>
                  {filtered.map((row) => (
                    <TemplateListRow
                      key={row.id}
                      name={row.name}
                      metaLine={rowMeta(row)}
                      thumbnail={rowThumbnail(row)}
                      selected={selectedIds.has(row.id)}
                      showCheckbox
                      onToggleSelect={() => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.id)) next.delete(row.id);
                          else next.add(row.id);
                          return next;
                        });
                      }}
                      onEdit={() => navigate(`${LIST_BASE}/${row.id}`)}
                      onDuplicate={() =>
                        navigate(`${LIST_BASE}/new`, {
                          state: {
                            duplicateFromName: `${row.name} (kopia)`,
                            kindCode: row.kind?.code,
                          },
                        })
                      }
                      onDelete={
                        row.can_delete
                          ? () => toast.error("Usuwanie szablonów z listy nie jest jeszcze dostępne.")
                          : undefined
                      }
                      showDelete={Boolean(row.can_delete)}
                      showPreview
                      onPreview={() => openUsage(row)}
                    />
                  ))}
                </div>
              ) : (
                <div className={TEMPLATES_LIST_CARD_GRID_CLASS}>
                  {filtered.map((row) => (
                    <div
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`${LIST_BASE}/${row.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`${LIST_BASE}/${row.id}`);
                        }
                      }}
                      className={[TEMPLATES_LIST_GRID_CARD_BASE_CLASS, TEMPLATES_LIST_GRID_CARD_IDLE_CLASS].join(
                        " ",
                      )}
                      style={{ borderRadius: TEMPLATES_LIST_GRID_CARD_RADIUS }}
                    >
                      <div className={TEMPLATES_LIST_GRID_CARD_PREVIEW_WRAP_CLASS}>
                        <div className={TEMPLATES_LIST_GRID_CARD_PREVIEW_BAND_CLASS}>{rowThumbnail(row)}</div>
                      </div>
                      <div className={TEMPLATES_LIST_GRID_CARD_BODY_CLASS}>
                        <p className="truncate text-sm font-semibold text-slate-900">{row.name}</p>
                        <p className="line-clamp-2 text-xs text-slate-500">{rowMeta(row)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {usageModal ? (
        <TemplateUsageModal
          templateName={usageModal.name}
          badges={usageModal.badges ?? []}
          items={usageModal.items}
          onClose={() => setUsageModal(null)}
        />
      ) : null}
    </>
  );
}
