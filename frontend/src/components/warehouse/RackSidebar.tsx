import { useRef, useState } from "react";
import { useWheelScrollBoundaryContain } from "../../hooks/useWheelScrollBoundaryContain";
import { Plus, Wand2 } from "lucide-react";
import type { LayoutState, CustomRackTemplate, CatalogItem, VisualElementType, RackType } from "../../types/warehouse";
import {
  formatVolume,
  getLevelConfig,
  getTotalLocations,
  getRackDisplayId,
  resolveRowContainerBinDirection,
  resolveRowContainerRackDirection,
  activeBinsForRack,
  binVolumeDm3,
  binUsedVolumeDm3,
  type RackTemplateLabelOptions,
} from "./warehouseUtils";

function sameCatalogItem(a: CatalogItem | null, b: CatalogItem): boolean {
  if (!a) return false;
  if (a.type !== b.type) return false;
  if (a.type === "custom" && b.type === "custom") return a.template.id === b.template.id;
  if (a.type === "preset" && b.type === "preset") return a.id === b.id;
  return false;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function formatMeters(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(2));
}
import { TemplateCreator, RackPreview } from "./TemplateCreator";
import { GenerateWarehouseLayoutModal } from "./GenerateWarehouseLayoutModal";
import { UI_STRINGS } from "../../constants/uiStrings";
import { appLayoutTokens } from "../../layout/appLayoutTokens";
import { normalizeBinTypeMap } from "../../utils/storageTypes";
import { buildTemplateUsageData } from "./templateUsage";

const DEFAULT_ADDRESS_PATTERN = "{Row}{Section}-{Bin}-{Level}";

export type RackSidebarProps = {
  mode?: "edit" | "read";
  layout: LayoutState;
  /** Used when placing racks without a template (e.g. stamp tool). */
  manualRackType: RackType;
  setManualRackType: (v: RackType) => void;
  selectedRackId: number | string | null;
  selectedRackIds: Array<number | string>;
  setSelectedRackId: (id: number | string | null) => void;
  setSelectedRackIds: React.Dispatch<React.SetStateAction<Array<number | string>>>;
  setDraggingFromCatalog: (item: CatalogItem | null) => void;
  setCatalogGhostPosition: (pos: { x: number; y: number } | null) => void;
  customTemplates: CustomRackTemplate[];
  setCustomTemplates: (t: CustomRackTemplate[] | ((prev: CustomRackTemplate[]) => CustomRackTemplate[])) => void;
  editingTemplateId: string | null;
  setEditingTemplateId: React.Dispatch<React.SetStateAction<string | null>>;
  onSaveEditTemplate: (templateId: string, template: CustomRackTemplate, updateExistingRacks: boolean) => void;
  onSaveNewTemplate?: (payload: CustomRackTemplate) => Promise<CustomRackTemplate | null>;
  /** Called when user confirms delete of a template. Parent should remove from state and optionally call API. */
  onDeleteTemplate?: (template: CustomRackTemplate) => void | Promise<void>;
  setLayout: React.Dispatch<React.SetStateAction<LayoutState>>;
  rowToolActive: boolean;
  rowToolTemplate: CatalogItem | null;
  setRowToolTemplate: (item: CatalogItem | null) => void;
  rowGapCm: number;
  setRowGapCm: (v: number) => void;
  draggingVisualType: VisualElementType | null;
  setDraggingVisualType: (t: VisualElementType | null) => void;
  setVisualGhostPosition: (p: { x: number; y: number } | null) => void;
  totalUsed: number;
  totalCapacity: number;
  onExportCsv?: () => void;
  onExportJson?: () => void;
  /** Export every slot: locationUUID, name, capacity_dm3 (map of locations CSV) */
  onExportLocationsMapCsv?: () => void;
  /** When true (e.g. Magazyn tab), show only catalog; hide Visual elements and layout-focused actions. */
  showOnlyCatalog?: boolean;
  /** Open the building dimensions modal (toolbar remains primary entry point). */
  onOpenEditBuilding?: () => void;
  /** When provided, generate layout modal is controlled by parent (e.g. opened from main toolbar). */
  showGenerateLayoutModal?: boolean;
  setShowGenerateLayoutModal?: (v: boolean) => void;
  /** Wall element tool: door or gate on building perimeter. When set, click on wall places element. */
  wallElementTool?: "door" | "gate" | null;
  setWallElementTool?: (v: "door" | "gate" | null) => void;
  /** When set, show row-level settings (e.g. counting direction) in the left rail. */
  selectedRowContainerId?: string | null;
};

export function RackSidebar({
  mode = "edit",
  layout,
  manualRackType,
  setManualRackType,
  selectedRackId,
  selectedRackIds,
  setSelectedRackId,
  setSelectedRackIds,
  setDraggingFromCatalog,
  setCatalogGhostPosition,
  customTemplates,
  setCustomTemplates,
  editingTemplateId,
  setEditingTemplateId,
  onSaveEditTemplate,
  onSaveNewTemplate,
  onDeleteTemplate,
  setLayout,
  rowToolActive,
  rowToolTemplate,
  setRowToolTemplate,
  rowGapCm,
  setRowGapCm,
  draggingVisualType: _draggingVisualType,
  setDraggingVisualType,
  setVisualGhostPosition,
  totalUsed,
  totalCapacity,
  onExportCsv,
  onExportJson,
  onExportLocationsMapCsv,
  showOnlyCatalog = false,
  onOpenEditBuilding,
  showGenerateLayoutModal: showGenerateLayoutModalProp,
  setShowGenerateLayoutModal: setShowGenerateLayoutModalProp,
  wallElementTool = null,
  setWallElementTool,
  selectedRowContainerId = null,
}: RackSidebarProps) {
  const [activeTab, setActiveTab] = useState<"catalog" | "visuals">("catalog");
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showGenerateLayoutModalLocal, setShowGenerateLayoutModalLocal] = useState(false);
  const showGenerateLayoutModal = setShowGenerateLayoutModalProp != null ? (showGenerateLayoutModalProp ?? false) : showGenerateLayoutModalLocal;
  const setShowGenerateLayoutModal = setShowGenerateLayoutModalProp ?? setShowGenerateLayoutModalLocal;
  const [catalogCollapsed, setCatalogCollapsed] = useState(false);
  const [rackListCollapsed, setRackListCollapsed] = useState(false);
  const [rackSearch, setRackSearch] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const filteredRacks = layout.racks.filter(
    (r) =>
      !rackSearch.trim() ||
      normalize(getRackDisplayId(r, layout)).includes(normalize(rackSearch)) ||
      normalize(r.name ?? "").includes(normalize(rackSearch)) ||
      normalize(r.label ?? "").includes(normalize(rackSearch)) ||
      normalize(r.rowPrefix ?? "").includes(normalize(rackSearch))
  );
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const editingTemplate = editingTemplateId ? customTemplates.find((t) => t.id === editingTemplateId) ?? null : null;
  const showTemplateCreator = showTemplateModal || editingTemplateId != null;
  const buildingDepthM = layout.building_depth_m ?? layout.building_height_m;
  const displayBuildingWidthM = formatMeters(layout.building_width_m);
  const displayBuildingDepthM = formatMeters(buildingDepthM);
  const displayBuildingHeightM = formatMeters(layout.building_height_m);
  const hasBuilding = layout.building_width_m != null && buildingDepthM != null && layout.building_width_m > 0 && buildingDepthM > 0;
  const isReadMode = mode === "read";
  const VISUAL_ITEMS: { type: VisualElementType; label: string; size: string }[] = [
    { type: "column", label: UI_STRINGS.warehouse.visuals.column, size: "2×2" },
    { type: "mezzanine", label: UI_STRINGS.warehouse.visuals.mezzanine, size: "20×15" },
    { type: "packing_station", label: UI_STRINGS.warehouse.visuals.packingStation, size: "6×4" },
    { type: "cart", label: UI_STRINGS.warehouse.visuals.cart, size: "3×3" },
    { type: "wall", label: UI_STRINGS.warehouse.visuals.wall, size: "10×1" },
    { type: "door", label: UI_STRINGS.warehouse.visuals.door, size: "2×3" },
    { type: "zone", label: UI_STRINGS.warehouse.visuals.zone, size: "8×6" },
  ];
  const sectionTitleClass =
    "text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600";
  const { templatesForSidebar, usageCountById: templateUsageCounts, usedTemplates, availableTemplates } = buildTemplateUsageData(
    layout,
    customTemplates,
    showOnlyCatalog,
    manualRackType
  );

  const templateListScrollRef = useRef<HTMLDivElement>(null);
  useWheelScrollBoundaryContain(
    templateListScrollRef,
    true,
    `${activeTab}-${showOnlyCatalog}-${catalogCollapsed}-${rowToolActive ? 1 : 0}-${selectedRowContainerId ?? ""}-${rowToolTemplate != null ? 1 : 0}`
  );

  return (
    <aside
      className={`flex h-full min-h-0 w-[300px] flex-none flex-col self-stretch overflow-hidden overscroll-y-contain border-r ${appLayoutTokens.appBorder} ${appLayoutTokens.appPanelBackground} px-3.5 py-3`}
    >
      {!showOnlyCatalog && (
      <div className="mb-2.5 flex shrink-0 rounded-md bg-slate-100/80 p-0.5">
        <button type="button" onClick={() => setActiveTab("catalog")} className={`flex-1 rounded py-1 text-[10px] font-medium transition-colors ${activeTab === "catalog" ? "bg-white text-sky-800 shadow-sm ring-1 ring-slate-200/60" : "text-slate-600 hover:text-slate-800"}`}>{UI_STRINGS.warehouse.rackSidebar.catalog}</button>
        <button type="button" onClick={() => setActiveTab("visuals")} className={`flex-1 rounded py-1 text-[10px] font-medium transition-colors ${activeTab === "visuals" ? "bg-white text-sky-800 shadow-sm ring-1 ring-slate-200/60" : "text-slate-600 hover:text-slate-800"}`}>{UI_STRINGS.warehouse.rackSidebar.visualElements}</button>
      </div>
      )}
      {!showOnlyCatalog && selectedRowContainerId && (
        <div className="mb-2.5 shrink-0 border-b border-slate-100 pb-2.5">
          <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Zaznaczony rząd</div>
          {(["rack", "bin"] as const).map((kind) => {
            const rcSel = (layout.row_containers ?? []).find((rc) => rc.id === selectedRowContainerId);
            const current =
              kind === "rack"
                ? rcSel
                  ? resolveRowContainerRackDirection(rcSel)
                  : "LTR"
                : rcSel
                  ? resolveRowContainerBinDirection(rcSel)
                  : "LTR";
            const label =
              kind === "rack" ? "Kierunek numeracji regałów" : "Kierunek numeracji lokalizacji";
            const name = kind === "rack" ? "rack-sidebar-rack-direction" : "rack-sidebar-bin-direction";
            return (
              <fieldset key={kind} className="m-0 border-0 p-0 mb-2 last:mb-0">
                <legend className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</legend>
                <div className="flex flex-col gap-1" role="radiogroup" aria-label={label}>
                  {(["LTR", "RTL"] as const).map((dir) => {
                    const checked = current === dir;
                    return (
                      <label
                        key={dir}
                        className={`flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[11px] ${checked ? "bg-slate-50 text-slate-900 ring-1 ring-slate-200/80" : "text-slate-600 hover:bg-slate-50/80"}`}
                      >
                        <input
                          type="radio"
                          name={name}
                          className="h-3.5 w-3.5 border-slate-300 text-cyan-600 focus:ring-cyan-500"
                          checked={checked}
                          onChange={() => {
                            setLayout((prev) => ({
                              ...prev,
                              row_containers: (prev.row_containers ?? []).map((rc) => {
                                if (rc.id !== selectedRowContainerId) return rc;
                                if (kind === "rack") return { ...rc, rack_direction: dir };
                                return { ...rc, bin_direction: dir };
                              }),
                            }));
                          }}
                        />
                        <span>{dir === "LTR" ? "Lewo → prawo" : "Prawo → lewo"}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {(showOnlyCatalog || activeTab === "catalog") && (
        <>
      {!showOnlyCatalog && (onExportCsv || onExportJson || onExportLocationsMapCsv) && (
        <div className="mb-2.5">
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportOpen(!exportOpen)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-600/90 bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              {UI_STRINGS.warehouse.export.button}
              <span className="opacity-80">▾</span>
            </button>
            {exportOpen && (
              <>
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-100 bg-white shadow-lg py-1 overflow-hidden">
                  {onExportLocationsMapCsv && (
                    <button type="button" onClick={() => { onExportLocationsMapCsv(); setExportOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2">
                      <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      {UI_STRINGS.warehouse.rackSidebar.exportLocationsCsv}
                    </button>
                  )}
                  {onExportCsv && (
                    <button type="button" onClick={() => { onExportCsv(); setExportOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2">
                      <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      {UI_STRINGS.warehouse.export.csv}
                    </button>
                  )}
                  {onExportJson && (
                    <button type="button" onClick={() => { onExportJson(); setExportOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2">
                      <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                      {UI_STRINGS.warehouse.export.json}
                    </button>
                  )}
                </div>
                <div className="fixed inset-0 z-0" onClick={() => setExportOpen(false)} aria-hidden="true" />
              </>
            )}
          </div>
        </div>
      )}
      {onOpenEditBuilding != null && (
        <div className="mb-2.5 border-b border-slate-100 pb-2.5">
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Budynek</div>
          {hasBuilding ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700">
                  {displayBuildingWidthM ?? layout.building_width_m} × {displayBuildingDepthM ?? buildingDepthM}
                  {layout.building_height_m != null && layout.building_height_m > 0 ? ` × ${displayBuildingHeightM ?? layout.building_height_m}` : ""} m
                </span>
                {!isReadMode && (
                  <button
                    type="button"
                    onClick={onOpenEditBuilding}
                    className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700"
                    title="Edytuj budynek"
                    aria-label="Edytuj budynek"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>
                )}
              </div>
              <div className="mt-1 space-y-0.5 text-[10px] text-slate-500">
                <div>Powierzchnia: {Math.round((layout.building_width_m ?? 0) * (buildingDepthM ?? 0))} m²</div>
                {layout.building_height_m != null && layout.building_height_m > 0 && (
                  <div>Kubatura: {Math.round((layout.building_width_m ?? 0) * (buildingDepthM ?? 0) * layout.building_height_m)} m³</div>
                )}
              </div>
            </>
          ) : (
            isReadMode
              ? <div className="text-sm text-slate-600">Brak ustawionych wymiarów</div>
              : <button type="button" onClick={onOpenEditBuilding} className="text-sm text-cyan-600 hover:underline">Ustaw wymiary budynku</button>
          )}
        </div>
      )}
      <div className="mb-0 flex min-h-0 min-w-0 flex-1 flex-col border-t border-slate-100/90 pt-2.5">
        <div className="shrink-0">
        {!isReadMode && !showOnlyCatalog && (
          <div className="mb-2">
            <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Typ regału</div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setManualRackType("warehouse")}
                className={`flex-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                  manualRackType === "warehouse" ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Magazyn
              </button>
              <button
                type="button"
                onClick={() => setManualRackType("store")}
                className={`flex-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                  manualRackType === "store" ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Sklep
              </button>
            </div>
          </div>
        )}
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setCatalogCollapsed(!catalogCollapsed)}
            className={sectionTitleClass + " -mx-0.5 rounded px-0.5 py-0.5 hover:bg-slate-50"}
          >
            {UI_STRINGS.warehouse.rackSidebar.catalog} {catalogCollapsed ? "▶" : "▼"}
          </button>
        </div>
        {!catalogCollapsed && (
          <>
      {!showOnlyCatalog && (
      <div className="mb-2 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setShowGenerateLayoutModal(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-700/90 bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500"
        >
          <Wand2 size={13} strokeWidth={2} />
          Generuj układ
        </button>
        <button
          type="button"
          onClick={() => setShowTemplateModal(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200/90 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-800 shadow-sm hover:bg-slate-50"
        >
          <Plus size={13} strokeWidth={2} />
          {UI_STRINGS.warehouse.rackSidebar.newTemplate}
        </button>
      </div>
      )}
      {!showOnlyCatalog && rowToolActive && (
        <div className="mb-1.5 flex items-center gap-2">
          <label className="text-[9px] font-medium uppercase tracking-wide text-slate-400">{UI_STRINGS.warehouse.rackSidebar.gapCm}</label>
          <input
            type="number"
            min={0}
            step={5}
            value={rowGapCm}
            onChange={(e) => setRowGapCm(Number(e.target.value) || 0)}
            className="w-12 rounded-md border border-slate-200/90 bg-white px-1 py-0.5 text-[11px] text-slate-800 input-focus"
          />
        </div>
      )}
      {!showOnlyCatalog && (
      <p className="mb-1.5 text-[10px] leading-snug text-slate-500">{UI_STRINGS.warehouse.rackSidebar.dragOntoPlan}</p>
      )}
      {!showOnlyCatalog && rowToolTemplate && (
        <p className="text-[10px] text-emerald-700 mb-1 font-medium">Kliknij w pusty slot na planie, aby wypełnić szablonem</p>
      )}
      {!showOnlyCatalog && rowToolActive && !rowToolTemplate && (
        <p className="text-[10px] text-amber-700 mb-1">{UI_STRINGS.warehouse.rackSidebar.rowToolHint}</p>
      )}
          </>
        )}
        </div>
        {!catalogCollapsed && (
      <div
        ref={templateListScrollRef}
        className="designer-rail-scroll flex min-h-28 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain pr-0.5"
      >
      <div className="mb-3 space-y-1.5">
        {templatesForSidebar.length === 0 && (
          <p className="text-[10px] text-slate-500">{UI_STRINGS.warehouse.rackSidebar.noTemplatesHint}</p>
        )}

        {usedTemplates.length > 0 && (
            <div className="mt-0.5">
            <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Użyte w układzie</div>
            <div className="space-y-1.5">
              {usedTemplates.map((t) => {
                const count = templateUsageCounts.get(t.id) ?? 0;
                const item: CatalogItem = { type: "custom", template: t };
                const isRowSelected = !showOnlyCatalog && sameCatalogItem(rowToolTemplate, item);
                return (
                  <div
                    key={t.id}
                    draggable={!showOnlyCatalog}
                    onDragStart={!showOnlyCatalog ? (e) => {
                      if ((e.target as HTMLElement).closest("[data-no-row-select]")) {
                        e.preventDefault();
                        return;
                      }
                      setDraggingFromCatalog(item);
                      e.dataTransfer.setData("application/x-warehouse-catalog", JSON.stringify(item));
                      e.dataTransfer.effectAllowed = "copy";
                    } : undefined}
                    onDragEnd={!showOnlyCatalog ? () => {
                      setDraggingFromCatalog(null);
                      setCatalogGhostPosition(null);
                    } : undefined}
                    onClick={!showOnlyCatalog ? (e) => {
                      if ((e.target as HTMLElement).closest("[data-no-row-select]")) return;
                      if (sameCatalogItem(rowToolTemplate, item)) {
                        setRowToolTemplate(null);
                        return;
                      }
                      setRowToolTemplate(item);
                    } : () => setPreviewTemplateId(t.id)}
                    className={`rounded-lg border px-2 py-1.5 shadow-sm transition-all duration-150 ${showOnlyCatalog ? "cursor-default" : `cursor-pointer hover:shadow-md ${isRowSelected ? "" : "cursor-grab active:cursor-grabbing"}`}`}
                    style={showOnlyCatalog ? { borderColor: "rgb(226 232 240 / 0.95)", backgroundColor: "#fff" } : { borderColor: isRowSelected ? "rgb(14 165 233 / 0.55)" : "rgb(226 232 240 / 0.9)", backgroundColor: isRowSelected ? "rgb(240 249 255)" : "#fff" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 gap-2">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-slate-800">{t.name}</span>
                            <span className="shrink-0 font-mono text-[10px] font-medium tabular-nums text-slate-500" title={`Liczba regałów tego typu na mapie: ${count}`}>
                              ({count})
                            </span>
                          </div>
                          <div className="mt-0.5 text-[10px] leading-snug text-slate-500">
                            {t.width_cm}×{t.depth_cm} cm, {(() => {
                              const lc = getLevelConfig(t);
                              const total = getTotalLocations(lc);
                              const uniform = lc.length === 0 || lc.every((r) => r.locations === lc[0].locations);
                              return uniform
                                ? `${lc.length || t.levels} poz., ${lc[0]?.locations ?? (t.bins_per_level && t.bins_per_level > 0 ? t.bins_per_level : 1)} ${UI_STRINGS.warehouse.rackSidebar.locationsPerLevelShort}`
                                : `${lc.length} poz., Σ ${total} lok.`;
                            })()}
                          </div>
                        </div>
                      </div>
                      {!showOnlyCatalog && (
                        <div className="flex shrink-0 items-center gap-0.5 self-start" data-no-row-select>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setEditingTemplateId(t.id); }}
                            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            title="Edytuj"
                            aria-label="Edytuj"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              if (!window.confirm(UI_STRINGS.warehouse.rackSidebar.deleteTemplateConfirm)) return;
                              if (onDeleteTemplate) {
                                onDeleteTemplate(t);
                              } else {
                                setCustomTemplates((prev) => prev.filter((x) => x.id !== t.id));
                                setEditingTemplateId((id: string | null) => (id === t.id ? null : id));
                              }
                            }}
                            className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600"
                            title="Usuń"
                            aria-label="Usuń"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {availableTemplates.length > 0 && (
          <div className="mt-2 border-t border-slate-100 pt-2">
            <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Dostępne szablony</div>
            <div className="space-y-1.5">
              {availableTemplates.map((t) => {
                const item: CatalogItem = { type: "custom", template: t };
                const isRowSelected = !showOnlyCatalog && sameCatalogItem(rowToolTemplate, item);
                return (
                  <div
                    key={t.id}
                    draggable={!showOnlyCatalog}
                    onDragStart={!showOnlyCatalog ? (e) => {
                      if ((e.target as HTMLElement).closest("[data-no-row-select]")) {
                        e.preventDefault();
                        return;
                      }
                      setDraggingFromCatalog(item);
                      e.dataTransfer.setData("application/x-warehouse-catalog", JSON.stringify(item));
                      e.dataTransfer.effectAllowed = "copy";
                    } : undefined}
                    onDragEnd={!showOnlyCatalog ? () => {
                      setDraggingFromCatalog(null);
                      setCatalogGhostPosition(null);
                    } : undefined}
                    onClick={!showOnlyCatalog ? (e) => {
                      if ((e.target as HTMLElement).closest("[data-no-row-select]")) return;
                      if (sameCatalogItem(rowToolTemplate, item)) {
                        setRowToolTemplate(null);
                        return;
                      }
                      setRowToolTemplate(item);
                    } : () => setPreviewTemplateId(t.id)}
                    className={`rounded-lg border px-2 py-1.5 shadow-sm transition-all duration-150 ${showOnlyCatalog ? "cursor-default" : `cursor-pointer hover:shadow-md ${isRowSelected ? "" : "cursor-grab active:cursor-grabbing"}`}`}
                    style={showOnlyCatalog ? { borderColor: "rgb(226 232 240 / 0.95)", backgroundColor: "#fff" } : { borderColor: isRowSelected ? "rgb(14 165 233 / 0.55)" : "rgb(226 232 240 / 0.9)", backgroundColor: isRowSelected ? "rgb(240 249 255)" : "#fff" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 gap-2">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-slate-800">{t.name}</div>
                          <div className="mt-0.5 text-[10px] leading-snug text-slate-500">
                            {t.width_cm}×{t.depth_cm} cm, {(() => {
                              const lc = getLevelConfig(t);
                              const total = getTotalLocations(lc);
                              const uniform = lc.length === 0 || lc.every((r) => r.locations === lc[0].locations);
                              return uniform
                                ? `${lc.length || t.levels} poz., ${lc[0]?.locations ?? (t.bins_per_level && t.bins_per_level > 0 ? t.bins_per_level : 1)} ${UI_STRINGS.warehouse.rackSidebar.locationsPerLevelShort}`
                                : `${lc.length} poz., Σ ${total} lok.`;
                            })()}
                          </div>
                        </div>
                      </div>
                      {!showOnlyCatalog && (
                        <div className="flex shrink-0 items-center gap-0.5 self-start" data-no-row-select>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setEditingTemplateId(t.id); }}
                            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            title="Edytuj"
                            aria-label="Edytuj"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              if (!window.confirm(UI_STRINGS.warehouse.rackSidebar.deleteTemplateConfirm)) return;
                              if (onDeleteTemplate) {
                                onDeleteTemplate(t);
                              } else {
                                setCustomTemplates((prev) => prev.filter((x) => x.id !== t.id));
                                setEditingTemplateId((id: string | null) => (id === t.id ? null : id));
                              }
                            }}
                            className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600"
                            title="Usuń"
                            aria-label="Usuń"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* If both lists are empty but there are templates, fallback to the original renderer is not needed. */}
      </div>

      {/* Existing template renderer block removed by UI split above. */}
      {false && customTemplates.map((t) => {
          const item: CatalogItem = { type: "custom", template: t };
          const isRowSelected = !showOnlyCatalog && sameCatalogItem(rowToolTemplate, item);
          return (
            <div
              key={t.id}
              draggable={!showOnlyCatalog}
              onDragStart={!showOnlyCatalog ? (e) => {
                if ((e.target as HTMLElement).closest("[data-no-row-select]")) {
                  e.preventDefault();
                  return;
                }
                setDraggingFromCatalog(item);
                e.dataTransfer.setData("application/x-warehouse-catalog", JSON.stringify(item));
                e.dataTransfer.effectAllowed = "copy";
              } : undefined}
              onDragEnd={!showOnlyCatalog ? () => {
                setDraggingFromCatalog(null);
                setCatalogGhostPosition(null);
              } : undefined}
              onClick={!showOnlyCatalog ? (e) => {
                if ((e.target as HTMLElement).closest("[data-no-row-select]")) return;
                if (sameCatalogItem(rowToolTemplate, item)) {
                  setRowToolTemplate(null);
                  return;
                }
                setRowToolTemplate(item);
              } : () => setPreviewTemplateId(t.id)}
              className={`rounded-lg border p-3 ${showOnlyCatalog ? "cursor-default" : `cursor-pointer hover:opacity-90 ${isRowSelected ? "" : "cursor-grab active:cursor-grabbing"}`}`}
              style={showOnlyCatalog ? { borderColor: "#e5e7eb", backgroundColor: "#f9fafb" } : { borderColor: isRowSelected ? "#3b82f6" : "#e5e7eb", backgroundColor: isRowSelected ? "#eff6ff" : "#f9fafb", boxShadow: "none" }}
            >
              <div className={`flex items-center gap-2 ${showOnlyCatalog ? "" : "justify-between gap-1"}`}>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                  <span className="font-semibold text-[#1E293B] text-sm truncate">{t.name}</span>
                  <span className="shrink-0 rounded-md bg-cyan-100 text-cyan-800 text-[10px] font-bold px-1.5 py-0.5" title={showOnlyCatalog ? undefined : `Liczba regałów tego typu na mapie: ${layout.racks.filter((r) => r.templateId === t.id).length}`}>
                    ({layout.racks.filter((r) => r.templateId === t.id).length})
                  </span>
                </div>
                {!showOnlyCatalog && (
                <div className="flex items-center gap-0.5 shrink-0" data-no-row-select>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setEditingTemplateId(t.id); }}
                    className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700"
                    title="Edytuj"
                    aria-label="Edytuj"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (!window.confirm(UI_STRINGS.warehouse.rackSidebar.deleteTemplateConfirm)) return;
                      if (onDeleteTemplate) {
                        onDeleteTemplate(t);
                      } else {
                        setCustomTemplates((prev) => prev.filter((x) => x.id !== t.id));
                        setEditingTemplateId((id: string | null) => (id === t.id ? null : id));
                      }
                    }}
                    className="p-1 rounded hover:bg-red-100 text-slate-500 hover:text-red-600"
                    title="Usuń"
                    aria-label="Usuń"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
                )}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {t.width_cm}×{t.depth_cm} cm, {(() => {
                  const lc = getLevelConfig(t);
                  const total = getTotalLocations(lc);
                  const uniform = lc.length === 0 || lc.every((r) => r.locations === lc[0].locations);
                  return uniform
                    ? `${lc.length || t.levels} poziomy, ${lc[0]?.locations ?? (t.bins_per_level && t.bins_per_level > 0 ? t.bins_per_level : 1)} ${UI_STRINGS.warehouse.rackSidebar.locationsPerLevelShort}`
                    : `${lc.length} poziomy, Suma: ${total} lok.`;
                })()}
              </div>
            </div>
          );
        })}
      </div>
        )}
      </div>
        </>
      )}
      {!showOnlyCatalog && activeTab === "visuals" && (
        <div className="mb-2 space-y-1.5 border-t border-slate-100 pt-2.5">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{UI_STRINGS.warehouse.rackSidebar.visualElements}</h2>
          {setWallElementTool && (
            <>
              <p className="text-[10px] leading-snug text-slate-500">Kliknij na krawędź budynku (obwód), aby umieścić.</p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setWallElementTool(wallElementTool === "door" ? null : "door")}
                  className={`flex-1 rounded-md border px-2 py-1 text-[11px] font-medium ${wallElementTool === "door" ? "border-sky-500 bg-sky-50 text-sky-900" : "border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50"}`}
                >
                  Drzwi
                </button>
                <button
                  type="button"
                  onClick={() => setWallElementTool(wallElementTool === "gate" ? null : "gate")}
                  className={`flex-1 rounded-md border px-2 py-1 text-[11px] font-medium ${wallElementTool === "gate" ? "border-sky-500 bg-sky-50 text-sky-900" : "border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50"}`}
                >
                  Brama
                </button>
              </div>
            </>
          )}
          <p className="text-[10px] leading-snug text-slate-500">{UI_STRINGS.warehouse.rackSidebar.dragOntoPlan}</p>
          {VISUAL_ITEMS.map(({ type, label, size }) => (
            <div
              key={type}
              draggable
              onDragStart={() => setDraggingVisualType(type)}
              onDragEnd={() => { setDraggingVisualType(null); setVisualGhostPosition(null); }}
              className="cursor-grab rounded-md border border-amber-200/80 bg-amber-50/50 px-2 py-1.5 active:cursor-grabbing hover:bg-amber-50"
            >
              <div className="text-xs font-semibold text-slate-800">{label}</div>
              <div className="text-[10px] text-slate-500">{size} kom.</div>
            </div>
          ))}
        </div>
      )}
      {!showOnlyCatalog && activeTab === "catalog" && (
      <div className="mt-2 flex min-h-0 flex-col border-t border-slate-100 pt-2.5">
        <button
          type="button"
          onClick={() => setRackListCollapsed(!rackListCollapsed)}
          className={"flex w-full items-center justify-between rounded py-0.5 text-left " + sectionTitleClass}
        >
          <span>{UI_STRINGS.warehouse.rackSidebar.rackList}</span>
          <span className="text-slate-400">{rackListCollapsed ? "▶" : "▼"}</span>
        </button>
        {!rackListCollapsed && (
          <>
      <input
        type="search"
        value={rackSearch}
        onChange={(e) => setRackSearch(e.target.value)}
        placeholder={UI_STRINGS.warehouse.rackSidebar.rackSearchPlaceholder}
        className="mt-1.5 w-full rounded-md border border-slate-200/90 bg-white px-2 py-1 text-[11px] text-slate-800 placeholder:text-slate-400"
        aria-label="Szukaj w liście regałów"
      />
      <div className="designer-rail-scroll mt-1.5 max-h-36 min-h-0 flex-1 space-y-1 overflow-y-auto">
        {filteredRacks.length === 0 ? (
          <p className="text-[10px] text-slate-500">{layout.racks.length === 0 ? UI_STRINGS.warehouse.rackSidebar.noRacks : "Brak wyników wyszukiwania"}</p>
        ) : (
          filteredRacks.map((r) => {
            const rid = r.id ?? r.rack_index;
            const w = r.width_cm ?? 0;
            const len = r.length_cm ?? r.depth_cm ?? 0;
            const h = r.height_cm ?? 0;
            const cap = r.total_capacity_dm3 ?? activeBinsForRack(r).reduce((s, b) => s + binVolumeDm3(b, r), 0);
            const used = r.used_dm3 ?? activeBinsForRack(r).reduce((s, b) => s + binUsedVolumeDm3(b), 0);
            const occPct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
            const isSel = selectedRackIds.includes(rid);
            return (
              <button
                key={rid}
                type="button"
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    setSelectedRackIds((prev: (string | number)[]) => (isSel ? prev.filter((id: string | number) => id !== rid) : [...prev, rid]));
                  } else {
                    setSelectedRackId(rid);
                    setSelectedRackIds([rid]);
                  }
                }}
                className={`group w-full rounded-xl border px-3 py-2.5 text-left text-[11px] shadow-sm transition-all duration-150 ${
                  isSel
                    ? "border-sky-400/90 bg-gradient-to-br from-sky-50 to-sky-100/80 text-slate-900 shadow-md ring-2 ring-sky-300/40"
                    : "border-slate-200/70 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/90 hover:shadow-md"
                }`}
              >
                <div className="flex flex-col items-start gap-1">
                  <div className="flex w-full items-start justify-between gap-2">
                    <div className="font-semibold text-slate-900">{getRackDisplayId(r, layout)}</div>
                    <span
                      className="mt-0.5 h-2 w-2 shrink-0 rounded-full ring-2 ring-white/80 transition-transform duration-150 group-hover:scale-110"
                      style={{ backgroundColor: r.color && r.color.trim() !== "" ? r.color : "#3b82f6" }}
                      title="Kolor szablonu"
                      aria-hidden
                    />
                  </div>
                  <div className="font-mono text-[10px] text-slate-500">
                    {w}×{len}×{h} cm · {cap.toLocaleString()} dm³
                  </div>
                  <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-slate-200/90">
                    <div
                      className="h-full rounded-full bg-slate-400 transition-[width] duration-300 ease-out group-hover:bg-slate-500"
                      style={{ width: `${occPct}%` }}
                      title={cap > 0 ? `Zajętość: ${occPct.toFixed(0)}%` : undefined}
                    />
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
      <div className="mt-1.5 border-t border-slate-100 pt-1.5">
        <p className="text-[10px] text-slate-500">
          {formatVolume(totalUsed)} / {formatVolume(totalCapacity)} {UI_STRINGS.warehouse.rackSidebar.dm3}
        </p>
      </div>
      </>
        )}
      </div>
      )}
      </div>

      {showOnlyCatalog && previewTemplateId != null && (() => {
        const template = customTemplates.find((t) => t.id === previewTemplateId) ?? null;
        if (!template) return null;
        const lc = getLevelConfig(template);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-auto"
            onClick={() => setPreviewTemplateId(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rack-preview-title"
          >
            <div
              className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 w-[95vw] max-w-[900px] max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
                <h2 id="rack-preview-title" className="text-base font-bold text-slate-800">
                  Podgląd szablonu — {template.name}
                </h2>
                <button
                  type="button"
                  onClick={() => setPreviewTemplateId(null)}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors"
                  aria-label="Zamknij"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden p-4">
                <RackPreview
                  width_cm={template.width_cm}
                  depth_cm={template.depth_cm}
                  height_cm={template.height_cm}
                  levels={template.levels}
                  bins_per_level={template.bins_per_level}
                  levelConfig={lc}
                  addressPattern={(template.namingPattern ?? template.addressPattern ?? DEFAULT_ADDRESS_PATTERN).trim() || DEFAULT_ADDRESS_PATTERN}
                  rowId={(template.rowId ?? template.aisle_letter ?? "A").trim() || "A"}
                  sectionStartIndex={template.sectionStartIndex ?? 1}
                  binNamingType={template.binNamingType ?? "numeric"}
                  binTypeMap={normalizeBinTypeMap(template.bin_type_map, template.reserve_bin_keys)}
                  color={template.color}
                  labelOptions={template.namingStrategy != null || template.manualLabels != null || (template.overrides != null && Object.keys(template.overrides).length > 0) ? {
                    namingStrategy: template.namingStrategy ?? "pattern",
                    namingOrientation: template.namingOrientation ?? "column-first",
                    namingPattern: (template.namingPattern ?? template.addressPattern ?? DEFAULT_ADDRESS_PATTERN).trim() || DEFAULT_ADDRESS_PATTERN,
                    rowId: (template.rowId ?? template.aisle_letter ?? "A").trim() || "A",
                    sectionStartIndex: template.sectionStartIndex ?? 1,
                    binNamingType: template.binNamingType ?? "numeric",
                    manualLabels: template.manualLabels,
                    overrides: template.overrides,
                    rackId: ((template.rowId ?? template.aisle_letter ?? "A").trim() || "A") + "1",
                    indexPadding: template.indexPadding ?? 2,
                    startIndex: template.startIndex ?? 1,
                  } as RackTemplateLabelOptions : undefined}
                  title="Podgląd regału — na żywo"
                  className="h-full min-h-[400px]"
                />
              </div>
            </div>
          </div>
        );
      })()}

      {showGenerateLayoutModal && !showOnlyCatalog && (
        <GenerateWarehouseLayoutModal
          onClose={() => setShowGenerateLayoutModal(false)}
          onConfirm={(result, mode) => {
            if (mode === "replace") {
              setLayout((prev) => ({
                ...prev,
                racks: result.racks,
                row_containers: result.row_containers ?? [],
              }));
            } else {
              setLayout((prev) => ({
                ...prev,
                racks: [...prev.racks, ...result.racks],
                row_containers: [...(prev.row_containers ?? []), ...(result.row_containers ?? [])],
              }));
            }
          }}
          layout={layout}
          customTemplates={customTemplates}
          rackType={manualRackType}
          initialTemplate={rowToolTemplate}
        />
      )}

      {showTemplateCreator && !showOnlyCatalog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-hidden" onClick={() => { setShowTemplateModal(false); setEditingTemplateId(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-100 w-[95vw] h-[92vh] max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
            <TemplateCreator
              layout={layout}
              onSave={async (t) => {
                if (onSaveNewTemplate) {
                  const saved = await onSaveNewTemplate(t);
                  if (saved != null) {
                    const savedWithType: CustomRackTemplate = {
                      ...saved,
                      rack_type: t.rack_type ?? saved.rack_type ?? "warehouse",
                    };
                    setCustomTemplates((prev) => [...prev, savedWithType]);
                    setShowTemplateModal(false);
                    setEditingTemplateId(null);
                    setRowToolTemplate({ type: "custom", template: savedWithType });
                  } else {
                    return false;
                  }
                } else {
                  setCustomTemplates((prev) => [...prev, t]);
                  setShowTemplateModal(false);
                  setEditingTemplateId(null);
                  setRowToolTemplate({ type: "custom", template: t });
                }
              }}
              initialTemplate={editingTemplate}
              onCancelEdit={() => { setShowTemplateModal(false); setEditingTemplateId(null); }}
              onSaveEdit={editingTemplateId && onSaveNewTemplate ? async (templateId, template, updateExistingRacks) => {
                const saved = await onSaveNewTemplate(template);
                if (saved == null) throw new Error("Nie udało się zapisać szablonu.");
                const savedWithType: CustomRackTemplate = {
                  ...saved,
                  rack_type: template.rack_type ?? saved.rack_type ?? "warehouse",
                };
                setCustomTemplates((prev) => prev.map((t) => (t.id === templateId ? savedWithType : t)));
                onSaveEditTemplate(templateId, template, updateExistingRacks);
                // Modal is closed by TemplateCreator via onCancelEdit after success message
              } : editingTemplateId ? (templateId, template, updateExistingRacks) => {
                setCustomTemplates((prev) => prev.map((t) => (t.id === templateId ? template : t)));
                onSaveEditTemplate(templateId, template, updateExistingRacks);
                setShowTemplateModal(false);
                setEditingTemplateId(null);
              } : undefined}
            />
          </div>
        </div>
      )}
    </aside>
  );
}
