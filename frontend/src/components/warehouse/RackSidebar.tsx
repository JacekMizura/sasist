import { useState } from "react";
import { Plus, Wand2 } from "lucide-react";
import type { LayoutState, CustomRackTemplate, CatalogItem, VisualElementType } from "../../types/warehouse";
import { formatVolume, getLevelConfig, getTotalLocations, getRackDisplayId, type RackTemplateLabelOptions } from "./warehouseUtils";

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
import { TemplateCreator, RackPreview } from "./TemplateCreator";
import { GenerateWarehouseLayoutModal } from "./GenerateWarehouseLayoutModal";
import { UI_STRINGS } from "../../constants/uiStrings";

const DEFAULT_ADDRESS_PATTERN = "{Row}{Section}-{Bin}-{Level}";

export type RackSidebarProps = {
  layout: LayoutState;
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
  saveLayout: () => void;
  saving: boolean;
  selectedWarehouseId: number | null;
  totalUsed: number;
  totalCapacity: number;
  onExportPdf?: () => void | Promise<void>;
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
};

export function RackSidebar({
  layout,
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
  saveLayout,
  saving,
  selectedWarehouseId,
  totalUsed,
  totalCapacity,
  onExportPdf,
  onExportCsv,
  onExportJson,
  onExportLocationsMapCsv,
  showOnlyCatalog = false,
  onOpenEditBuilding,
  showGenerateLayoutModal: showGenerateLayoutModalProp,
  setShowGenerateLayoutModal: setShowGenerateLayoutModalProp,
  wallElementTool = null,
  setWallElementTool,
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
      normalize(getRackDisplayId(r)).includes(normalize(rackSearch)) ||
      normalize(r.name ?? "").includes(normalize(rackSearch)) ||
      normalize(r.label ?? "").includes(normalize(rackSearch)) ||
      normalize(r.rowPrefix ?? "").includes(normalize(rackSearch))
  );
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const editingTemplate = editingTemplateId ? customTemplates.find((t) => t.id === editingTemplateId) ?? null : null;
  const showTemplateCreator = showTemplateModal || editingTemplateId != null;
  const buildingDepthM = layout.building_depth_m ?? layout.building_height_m;
  const hasBuilding = layout.building_width_m != null && buildingDepthM != null && layout.building_width_m > 0 && buildingDepthM > 0;
  const VISUAL_ITEMS: { type: VisualElementType; label: string; size: string }[] = [
    { type: "column", label: UI_STRINGS.warehouse.visuals.column, size: "2×2" },
    { type: "mezzanine", label: UI_STRINGS.warehouse.visuals.mezzanine, size: "20×15" },
    { type: "packing_station", label: UI_STRINGS.warehouse.visuals.packingStation, size: "6×4" },
    { type: "cart", label: UI_STRINGS.warehouse.visuals.cart, size: "3×3" },
    { type: "wall", label: UI_STRINGS.warehouse.visuals.wall, size: "10×1" },
    { type: "door", label: UI_STRINGS.warehouse.visuals.door, size: "2×3" },
    { type: "zone", label: UI_STRINGS.warehouse.visuals.zone, size: "8×6" },
  ];
  const sectionTitleClass = "text-[12px] font-semibold text-[#374151] mb-2";
  return (
    <aside
      className={`${showOnlyCatalog ? "w-[250px]" : "w-56"} shrink-0 flex flex-col overflow-y-auto`}
      style={{ background: "#ffffff", borderRight: "1px solid #e5e7eb", padding: "16px" }}
    >
      {!showOnlyCatalog && (
      <div className="flex rounded-lg bg-[#f3f4f6] p-0.5 mb-4">
        <button type="button" onClick={() => setActiveTab("catalog")} className={`flex-1 py-1 text-[10px] font-medium rounded-md transition-colors ${activeTab === "catalog" ? "bg-white text-[#1d4ed8] shadow-sm" : "text-[#374151] hover:bg-[#e5e7eb]"}`}>{UI_STRINGS.warehouse.rackSidebar.catalog}</button>
        <button type="button" onClick={() => setActiveTab("visuals")} className={`flex-1 py-1 text-[10px] font-medium rounded-md transition-colors ${activeTab === "visuals" ? "bg-white text-[#1d4ed8] shadow-sm" : "text-[#374151] hover:bg-[#e5e7eb]"}`}>{UI_STRINGS.warehouse.rackSidebar.visualElements}</button>
      </div>
      )}
      {(showOnlyCatalog || activeTab === "catalog") && (
        <>
      {!showOnlyCatalog && (onExportPdf || onExportCsv || onExportJson || onExportLocationsMapCsv) && (
        <div className="mb-4">
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportOpen(!exportOpen)}
              className="w-full bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-xs font-semibold flex items-center justify-center gap-2"
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
                  {onExportPdf && (
                    <button type="button" onClick={() => { onExportPdf(); setExportOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2">
                      <svg className="w-4 h-4 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      {UI_STRINGS.warehouse.export.pdf}
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
        <div className="rounded-lg p-3 mb-4" style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}>
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Budynek</div>
          {hasBuilding ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-slate-700">{layout.building_width_m} × {buildingDepthM}{layout.building_height_m != null && layout.building_height_m > 0 ? ` × ${layout.building_height_m}` : ""} m</span>
                <button
                  type="button"
                  onClick={onOpenEditBuilding}
                  className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700"
                  title="Edytuj budynek"
                  aria-label="Edytuj budynek"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
              </div>
              <div className="mt-1.5 text-[10px] text-slate-600 space-y-0.5">
                <div>Powierzchnia: {Math.round((layout.building_width_m ?? 0) * (buildingDepthM ?? 0))} m²</div>
                {layout.building_height_m != null && layout.building_height_m > 0 && (
                  <div>Kubatura: {Math.round((layout.building_width_m ?? 0) * (buildingDepthM ?? 0) * layout.building_height_m)} m³</div>
                )}
              </div>
            </>
          ) : (
            <button type="button" onClick={onOpenEditBuilding} className="text-sm text-cyan-600 hover:underline">Ustaw wymiary budynku</button>
          )}
        </div>
      )}
      <div className="rounded-lg p-3 overflow-hidden mb-4" style={{ background: "#f9fafb", border: "1px solid #e5e7eb", boxShadow: "none" }}>
        <div className="flex items-center justify-between gap-2" style={{ marginBottom: "8px" }}>
          <button
            type="button"
            onClick={() => setCatalogCollapsed(!catalogCollapsed)}
            className={sectionTitleClass + " hover:text-slate-800 text-left shrink-0"}
          >
            {UI_STRINGS.warehouse.rackSidebar.catalog} {catalogCollapsed ? "▶" : "▼"}
          </button>
        </div>
        {!catalogCollapsed && (
          <>
      {!showOnlyCatalog && (
      <div className="flex flex-col gap-2 mb-3">
        <button
          type="button"
          onClick={() => setShowTemplateModal(true)}
          className="w-full px-3 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-500 transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={14} strokeWidth={2} />
          {UI_STRINGS.warehouse.rackSidebar.newTemplate}
        </button>
        <button
          type="button"
          onClick={() => setShowGenerateLayoutModal(true)}
          className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-colors flex items-center justify-center gap-2"
        >
          <Wand2 size={14} strokeWidth={2} />
          Generuj układ
        </button>
      </div>
      )}
      {!showOnlyCatalog && rowToolActive && (
        <div className="mb-2 flex items-center gap-2">
          <label className="text-[10px] text-slate-500">{UI_STRINGS.warehouse.rackSidebar.gapCm}</label>
          <input
            type="number"
            min={0}
            step={5}
            value={rowGapCm}
            onChange={(e) => setRowGapCm(Number(e.target.value) || 0)}
            className="w-14 rounded-lg border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-1 py-0.5 text-xs input-focus"
          />
        </div>
      )}
      {!showOnlyCatalog && (
      <p className="text-[10px] text-slate-500 mb-2">{UI_STRINGS.warehouse.rackSidebar.dragOntoPlan}</p>
      )}
      {!showOnlyCatalog && rowToolTemplate && (
        <p className="text-[10px] text-emerald-700 mb-1 font-medium">Kliknij w pusty slot na planie, aby wypełnić szablonem</p>
      )}
      {!showOnlyCatalog && rowToolActive && !rowToolTemplate && (
        <p className="text-[10px] text-amber-700 mb-1">{UI_STRINGS.warehouse.rackSidebar.rowToolHint}</p>
      )}
      <div className="space-y-2 mb-4">
        {customTemplates.length === 0 && (
          <p className="text-[10px] text-slate-500">{UI_STRINGS.warehouse.rackSidebar.noTemplatesHint}</p>
        )}
        {customTemplates.map((t) => {
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
      </>
        )}
      </div>
        </>
      )}
      {!showOnlyCatalog && activeTab === "visuals" && (
        <div className="space-y-2 rounded-lg p-3 mb-4" style={{ background: "#f9fafb", border: "1px solid #e5e7eb", boxShadow: "none" }}>
          <h2 className={sectionTitleClass}>{UI_STRINGS.warehouse.rackSidebar.visualElements}</h2>
          {setWallElementTool && (
            <>
              <p className="text-[10px] text-slate-500 mb-2">Kliknij na krawędź budynku (obwód), aby umieścić.</p>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setWallElementTool(wallElementTool === "door" ? null : "door")}
                  className={`flex-1 rounded-lg border p-2 text-xs font-semibold ${wallElementTool === "door" ? "border-cyan-500 bg-cyan-50 text-cyan-800" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                >
                  Drzwi
                </button>
                <button
                  type="button"
                  onClick={() => setWallElementTool(wallElementTool === "gate" ? null : "gate")}
                  className={`flex-1 rounded-lg border p-2 text-xs font-semibold ${wallElementTool === "gate" ? "border-cyan-500 bg-cyan-50 text-cyan-800" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                >
                  Brama
                </button>
              </div>
            </>
          )}
          <p className="text-[10px] text-slate-500 mb-2">{UI_STRINGS.warehouse.rackSidebar.dragOntoPlan}</p>
          {VISUAL_ITEMS.map(({ type, label, size }) => (
            <div
              key={type}
              draggable
              onDragStart={() => setDraggingVisualType(type)}
              onDragEnd={() => { setDraggingVisualType(null); setVisualGhostPosition(null); }}
              className="cursor-grab active:cursor-grabbing rounded-lg border border-amber-300 bg-amber-50/80 p-2 hover:bg-amber-100/80"
            >
              <div className="font-semibold text-[#1E293B] text-sm">{label}</div>
              <div className="text-[10px] text-slate-500">{size} kom.</div>
            </div>
          ))}
        </div>
      )}
      {!showOnlyCatalog && activeTab === "catalog" && (
      <div className="rounded-lg p-3 flex flex-col min-h-0" style={{ background: "#f9fafb", border: "1px solid #e5e7eb", boxShadow: "none" }}>
        <button
          type="button"
          onClick={() => setRackListCollapsed(!rackListCollapsed)}
          className={"w-full flex items-center justify-between text-left rounded py-1 -mx-1 px-1 hover:bg-white/60 " + sectionTitleClass}
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
        className="w-full mt-2 px-2 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-[11px] text-[#1E293B] placeholder:text-slate-400"
        aria-label="Szukaj w liście regałów"
      />
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0 max-h-40 mt-2">
        {filteredRacks.length === 0 ? (
          <p className="text-[10px] text-slate-500">{layout.racks.length === 0 ? UI_STRINGS.warehouse.rackSidebar.noRacks : "Brak wyników wyszukiwania"}</p>
        ) : (
          filteredRacks.map((r) => {
            const rid = r.id ?? r.rack_index;
            const w = r.width_cm ?? 0;
            const len = r.length_cm ?? r.depth_cm ?? 0;
            const h = r.height_cm ?? 0;
            const cap = r.total_capacity_dm3 ?? r.bins.reduce((s, b) => s + (b.volume_dm3 ?? 0), 0);
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
                className={`w-full text-left px-3 py-2 rounded-lg text-[11px] border transition-colors ${
                  isSel ? "border-cyan-500 bg-cyan-50 text-[#1E293B]" : "border-[#E2E8F0] bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <div className="flex flex-col items-start">
                  <div className="font-medium">
                    {getRackDisplayId(r)}
                  </div>
                  <div className="text-sm text-slate-600">
                    {w}×{len}×{h} cm
                  </div>
                  <div className="text-sm text-slate-500">
                    {cap.toLocaleString()} dm³
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
      <div className="border-t border-slate-100 pt-2 mt-2 space-y-2">
        <p className="text-[10px] text-slate-600 leading-relaxed">
          {formatVolume(totalUsed)} / {formatVolume(totalCapacity)} {UI_STRINGS.warehouse.rackSidebar.dm3}
        </p>
        <button
          type="button"
          onClick={saveLayout}
          disabled={saving || selectedWarehouseId == null}
          className="w-full px-3 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-500 disabled:opacity-50 transition-colors"
        >
          {saving ? UI_STRINGS.warehouse.rackSidebar.saving : UI_STRINGS.warehouse.rackSidebar.saveLayout}
        </button>
      </div>
      </>
        )}
      </div>
      )}

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
                  reserveBinKeys={new Set(template.reserve_bin_keys ?? [])}
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
          initialTemplate={rowToolTemplate}
        />
      )}

      {showTemplateCreator && !showOnlyCatalog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-hidden" onClick={() => { setShowTemplateModal(false); setEditingTemplateId(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-100 w-[95vw] max-w-[1600px] h-[92vh] max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
            <TemplateCreator
              layout={layout}
              onSave={async (t) => {
                if (onSaveNewTemplate) {
                  const saved = await onSaveNewTemplate(t);
                  if (saved != null) {
                    setCustomTemplates((prev) => [...prev, saved]);
                    setShowTemplateModal(false);
                    setEditingTemplateId(null);
                    setRowToolTemplate({ type: "custom", template: saved });
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
                setCustomTemplates((prev) => prev.map((t) => (t.id === templateId ? saved : t)));
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
